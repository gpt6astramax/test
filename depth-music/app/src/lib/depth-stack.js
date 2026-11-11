// DepthStack: a page stack with depth-of-field page turns, built straight on ScrollGesture. Framework-free; the React
// side (src/nav/DepthStackView) puts a screen into each page's `inner` element.
//
//   const ds = DepthStack(host);
//   ds.root                       // element for the first page's content
//   const page = ds.push(key);    // page.inner is where the new page's content goes; null if `key` is already on top
//   ds.pop(); ds.popToRoot();
//   ds.onChange((depth) => …);
//   ds.onDepth((f) => …);         // how far behind the root page is, every frame: 0 in front, 1 one page over it, …
//
// Each pushed page is a gesture with sides [1] (swipe right = back). The layers below follow it:
//   the page right below comes back from "behind" (smaller, lower, blurred, faint) into focus,
//   the one below that comes back from nothing to "behind", anything deeper is not rendered at all,
//   and the page being swiped away fades out as it goes, so it never reads as a slab sliding off.
// With the 'scroll' driver they are tied to the page's scroll timeline, so nothing runs in script per frame; with the
// 'js' driver (or without scroll timelines) the same values are written from the gesture's 'change' event.
//
// How "out of focus" is made is a choice (./depth-mode.js). The default in Chromium is a veil: the layers behind only
// animate transform and opacity, and the blur is a sheet of glass of fixed radius laid over them, whose strength is
// the opacity() of its backdrop-filter. The reason is measured, not taste: an animation with a blur() in its keyframes
// cannot run on Chromium's compositor, and one such property takes the whole animation (transform and opacity too) to
// the main thread. A finger-driven scroll runs on the compositor and does not wait for the main thread, so the page
// under the finger and the layers behind it would move to different clocks, which reads as dropped frames.
// Coming in is the one move on a clock: ScrollGesture's enter() slides the page in, and the layers below recede over
// the same time, by animations of their own; they are tied to the page only once it is in.
//
// One rule shapes the code: nothing is changed on a page, or on anything it sits in, at the moment a transition ends.
// That is exactly when a finger is likely to be scrolling the page that has just appeared, and on iOS a change to an
// ancestor's layer, overflow or animations under a moving scroll stops it dead. So:
//   - what a page needs for the back swipe is put on it when it is created and never touched again;
//   - the entrance is one animation laid over that, which runs out by itself and leaves nothing to undo (what does
//     change when it ends are the layers below and the veil, which nobody is scrolling);
//   - a page that has left stays where it is (off screen, taking no touches) until things are quiet (./quiet.js).
import './scroll-gesture.js';
import { tapSwitch, reduced, supportsTimeline } from '../ui/platform';
import { whenQuiet } from './quiet';
import { getDriver } from './driver';
import { getDepthMode } from './depth-mode';

const ScrollGesture = window.ScrollGesture;

// The swipe ends this far past the edge. The browser decides how long its snap takes, by the distance left; a commit
// point just outside the screen keeps the page on screen for most of that time, so it leaves at an easy pace.
export const OVER = 0.1;
// The leaving content has faded out once it has moved this share of the screen. From there on it takes no touches
// either: an invisible page must not be what a tap lands on.
export const GONE = 0.8;
export const PUSH_MS = 660;
export const PUSH_EASE = 'cubic-bezier(.2,.86,.24,1)';
const FRONT = { s: 1, y: 0, blur: 0, o: 1 }, FAR = { s: 0.74, y: 10, blur: 40, o: 0 };
// What a page looks like right behind the one in front: smaller, lower, out of focus, faint. The player uses the same.
export const BACK = { s: 0.86, y: 4.5, blur: 20, o: 0.5 };
const tf = (v) => `translateY(${v.y}%) scale(${v.s})`;
// One state of a layer, as a keyframe. blur: whether the layer's own filter carries the blur (mode 'filter'). In
// focus there is then no filter at all, not a blur of zero: a layer that carries a filter, even one that does
// nothing, is drawn through a surface of its own.
const frame = (v, blur) => {
  const f = { transform: v.s === 1 && !v.y ? 'none' : tf(v), opacity: v.o };
  if (blur) f.filter = v.blur ? `blur(${v.blur}px)` : 'none';
  return f;
};
// The veil: glass of a fixed radius; how much of it shows is the opacity() inside the backdrop-filter, the function
// made for this. (Measured in Chromium, the element's own opacity thins it in the same way; Safari was not measured.)
const glass = (o) => `blur(${BACK.blur}px) opacity(${o})`;
const glassFrame = (o) => ({ backdropFilter: glass(o), webkitBackdropFilter: glass(o) });
// How much of the veil shows when the page in front has gone k of the way (0 at rest .. 1 gone). Thinning the veil
// is a cross-fade between a blurred and a sharp picture, and a sharp picture shows through at once; a blur whose
// radius shrinks stays unreadable for most of the way. So the veil stays nearly whole until late and goes at the end.
export const veilAt = (k) => 1 - Math.pow(Math.max(0, Math.min(1, k)), 4);
/** The veil's keyframes on a gesture's timeline (100% = at rest, `over` = the gesture's overshoot), as CSS text. */
export function veilKeyframes(name, over) {
  const at = (k) => (100 * (1 - k / (1 + over))).toFixed(2) + '%';
  const stop = (o) => `{-webkit-backdrop-filter:${glass(o.toFixed(3))};backdrop-filter:${glass(o.toFixed(3))}}`;
  return `@keyframes ${name}{0%,${at(1)}${stop(0)}` + [0.95, 0.9, 0.8, 0.7, 0.5].map((k) => at(k) + stop(veilAt(k))).join('') + `99%,100%${stop(1)}}`;
}
const BACK_SVG = '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

let styled = false;
function styles() {
  if (styled) return;
  styled = true;
  const hold = (100 * OVER / (1 + OVER)).toFixed(2) + '%';            // timeline point where the top page has just left the screen
  const gone = (100 * (1 - GONE / (1 + OVER))).toFixed(2) + '%';
  // Every state "at rest" is held from 99% on: at rest the page's timeline is one pixel short of its end (the
  // gesture keeps it there, so that these animations can run on the compositor), and must show exactly that state.
  const rest = '99%,100%';
  const st = document.createElement('style');
  st.setAttribute('data-depth-stack', '');
  st.textContent =
    `.ds{--back-t:${tf(BACK)};--back-blur:${BACK.blur}px;--back-o:${BACK.o};--far-t:${tf(FAR)};--far-blur:${FAR.blur}px;--push-ms:${PUSH_MS}ms;--push-ease:${PUSH_EASE}}` +
    // mode 'filter': the layers carry the blur themselves
    `@keyframes ds-f1{0%,${hold}{transform:none;filter:none;opacity:1}${rest}{transform:var(--back-t);filter:blur(var(--back-blur));opacity:var(--back-o)}}` +
    `@keyframes ds-f2{0%,${hold}{transform:var(--back-t);filter:blur(var(--back-blur));opacity:var(--back-o)}${rest}{transform:var(--far-t);filter:blur(var(--far-blur));opacity:0}}` +
    // modes 'veil' and 'none': transform and opacity only, which the compositor can run
    `@keyframes ds-g1{0%,${hold}{transform:none;opacity:1}${rest}{transform:var(--back-t);opacity:var(--back-o)}}` +
    `@keyframes ds-g2{0%,${hold}{transform:var(--back-t);opacity:var(--back-o)}${rest}{transform:var(--far-t);opacity:0}}` +
    veilKeyframes('ds-v', OVER) +
    `.ds .veil{position:absolute;inset:0;pointer-events:none;-webkit-backdrop-filter:${glass(1)};backdrop-filter:${glass(1)}}` +
    `.ds .veil.off{visibility:hidden}` +
    `.ds .layer.b1.bf{filter:blur(var(--back-blur))}.ds .layer.b2.bf{filter:blur(var(--far-blur))}` +
    `@keyframes ds-leave{0%,${gone}{opacity:0}${rest}{opacity:1}}`;
  document.head.appendChild(st);
}

// An attribute written again with the value it has still counts as a change and restyles the whole subtree.
const setInert = (el, on) => { if (el && el.inert !== on) el.inert = on; };

export function DepthStack(host) {
  styles();
  host.classList.add('ds');
  const rootEl = document.createElement('div');
  rootEl.className = 'layer root';
  rootEl.innerHTML = '<div class="page"><div class="page-in"></div></div>';
  host.appendChild(rootEl);
  let stack = [];                 // the pages, top last
  let left = [];                  // pages that have gone, not yet taken out
  let tidy = null;                // the pending whenQuiet() job that takes them out
  let pushing = 0;                // entrances under way: taps wait
  const listeners = [];
  const depthListeners = [];
  const top = () => stack[stack.length - 1];
  const layers = () => [rootEl].concat(stack.map((p) => p.el));
  const emit = () => listeners.forEach((fn) => fn(stack.length));
  // How far behind the root page is: the pages over it, the top one counted by how far in it is (its presence: 0 off
  // screen .. 1 in place). What belongs to the root page and is not in its layer (the tab row) follows this.
  let lastDepth = 0;
  const depthNow = () => (stack.length ? stack.length - 1 + top().presence : 0);
  function reportDepth() {
    const f = depthNow();
    if (f === lastDepth) return;
    lastDepth = f;
    depthListeners.forEach((fn) => fn(f));
  }
  const presenceAt = (p) => 1 - Math.min(1, (1 + OVER) * Math.max(0, p));

  // Tie a layer to the top page's scroll timeline (or untie it). Written only when it changes.
  function follow(el, name, timeline) {
    const key = name ? name + ' ' + timeline : '';
    if ((el.dsFollow || '') === key) return;
    el.dsFollow = key;
    if (name) { el.style.animation = name + ' linear both'; el.style.animationTimeline = timeline; }
    else { el.style.removeProperty('animation'); el.style.removeProperty('animation-timeline'); }
  }
  // Give every layer its place in depth, for the stack as it now is. How the layers behind look is the top page's
  // affair (its mode, its timeline, its veil).
  //
  // While the top page is still coming in, nothing is tied to its timeline yet: the layers behind are moved by the
  // entrance's own animations, which hold their end. The ties are made when the entrance is over. Not for tidiness:
  // Chromium runs a scroll-driven animation on the compositor only if it could start it there, and it cannot while
  // another animation is laid over the same properties; having failed once, it does not try again.
  function arrange() {
    const ls = layers(), n = ls.length, t = top();
    const timeline = t && t.tied && !t.entering ? t.g.timeline : null;
    const blur = !!t && t.mode === 'filter';              // the layers carry the blur themselves
    const k1 = blur ? 'ds-f1' : 'ds-g1', k2 = blur ? 'ds-f2' : 'ds-g2';
    ls.forEach((el, i) => {
      const d = n - 1 - i;
      el.classList.toggle('b1', d === 1); el.classList.toggle('b2', d === 2); el.classList.toggle('b3', d > 2);
      el.classList.toggle('bf', blur && d > 0);
      setInert(el, d > 0);                                // covered pages take no focus and are not read out
      follow(el, timeline && d === 1 ? k1 : timeline && d === 2 ? k2 : null, timeline);
      if (el.dsMixed) { el.dsMixed = false; ['transform', 'filter', 'opacity'].forEach((k) => el.style.removeProperty(k)); }
    });
    // a veil lies under its page, over everything below: only the top two can show
    stack.forEach((p, i) => {
      if (!p.veil) return;
      p.veil.classList.toggle('off', stack.length - 1 - i > 1);
      follow(p.veil, p.tied && !p.entering ? 'ds-v' : null, p.g.timeline);
    });
  }
  // Without a scroll timeline: the same follow, written from the gesture's 'change' event.
  function mix(el, a, b, f, blur) {
    if (!el) return;
    const L = (k) => a[k] + (b[k] - a[k]) * f;
    el.dsMixed = true;
    el.style.transform = `translateY(${L('y')}%) scale(${L('s')})`;
    if (blur) el.style.filter = L('blur') > 0.05 ? `blur(${L('blur')}px)` : 'none';
    el.style.opacity = String(L('o'));
  }
  function veilTo(veil, o) { veil.style.webkitBackdropFilter = glass(o); veil.style.backdropFilter = glass(o); }

  function dropClocks(page) { if (page.clocks) { page.clocks.forEach((a) => a.cancel()); page.clocks = null; } }
  function takeOut(page) { cancelAnimationFrame(page.raf); dropClocks(page); page.g.destroy(); page.el.remove(); if (page.veil) page.veil.remove(); }
  // Take out the pages that have left. Run when things are quiet, or just before the stack changes again.
  function flush() {
    if (tidy) { tidy.cancel(); tidy = null; }
    if (!left.length) return;
    left.forEach(takeOut);
    left = [];
    arrange();
  }
  // Remove a page here and now (it is not what the finger is on).
  function finish(page) {
    const i = stack.indexOf(page);
    if (i === -1) return;
    stack.splice(i, 1);
    takeOut(page);
    arrange();
    emit();
    reportDepth();
  }
  // The page has gone off screen by its own gesture. The stack is told now; the page itself, and the animations that
  // tied the layers below to it (they hold their end values), are taken away once things are quiet.
  function gone(page) {
    const i = stack.indexOf(page);
    if (i === -1) return;
    stack.splice(i, 1);
    left.push(page);
    setInert(page.el, true);
    setInert(top() ? top().el : rootEl, false);
    if (!tidy) tidy = whenQuiet(() => { tidy = null; flush(); });
    emit();
    reportDepth();
  }

  function push(key) {
    flush();
    let t;
    while ((t = top()) && t.g.passing) finish(t);          // a page still finishing its back swipe goes first
    if (t && t.key === key) return null;
    const el = document.createElement('div'); el.className = 'layer';
    const body = document.createElement('div'); body.className = 'lbody';
    body.innerHTML = '<div class="nav"><label class="tap glass" role="button" tabindex="0" aria-label="返回">' +
      (tapSwitch ? '<input type="checkbox" switch class="hsw" aria-hidden="true">' : '') + BACK_SVG + '</label></div>' +
      '<div class="page"><div class="page-in"></div></div>';
    el.appendChild(body);
    const back = body.querySelector('.nav .tap');
    back.addEventListener('click', (e) => { if (!(e.target.matches && e.target.matches('.hsw'))) pop(); });
    back.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pop(); } });
    const moving = !reduced();
    if (moving) el.classList.add('entering');               // its blocks arrive one after another (styles.css)
    const mode = getDepthMode();
    let veil = null;
    if (mode === 'veil') { veil = document.createElement('div'); veil.className = 'veil'; host.appendChild(veil); }
    host.appendChild(el);
    const g = ScrollGesture(el, { driver: getDriver(), sides: [1], cssVar: null, body, overshoot: OVER, passthrough: 1 - GONE });
    const tied = supportsTimeline && !!g.timeline;
    // The leaving fade is on the page from the start (at rest it is fully opaque) and stays for its whole life.
    if (tied) { body.style.animation = 'ds-leave linear both'; body.style.animationTimeline = g.timeline; }
    const page = { key, el, body, inner: body.querySelector('.page-in'), scroller: body.querySelector('.page'), g, tied, mode, veil, clocks: null, entering: moving, presence: moving ? 0 : 1, raf: 0 };
    stack.push(page);
    g.on('change', (p) => {
      const tp = top();
      if (tp !== page) {
        // this page is being swiped back while the one above is still finishing off-screen
        if (tp && tp.g.passing && stack[stack.length - 2] === page) finish(tp);
        return;
      }
      if (left.length) flush();                             // the layers below must follow this page from here on
      if (page.entering && p > 0.02) entered();             // the finger took the page while it was coming in
      if (!page.entering) { page.presence = presenceAt(p); reportDepth(); }
      const ls = layers();
      setInert(ls[ls.length - 2], !g.passing);              // once this page lets touches through, the one below is live
      if (!tied && !page.entering) {
        const k = Math.min(1, (1 + OVER) * Math.max(0, p));
        mix(ls[ls.length - 2], BACK, FRONT, k, mode === 'filter'); mix(ls[ls.length - 3], FAR, BACK, k, mode === 'filter');
        if (veil) veilTo(veil, veilAt(k));
        body.style.opacity = String(Math.max(0, 1 - k / GONE));
      }
    });
    g.on('settle', (side) => { if (side === 1) gone(page); });
    // The entrance is over (or the finger has taken the page): the layers behind are tied to the page, and the
    // entrance's animations, which have been holding the same picture, are dropped.
    function entered() {
      if (!page.entering) return;
      page.entering = false;
      cancelAnimationFrame(page.raf);
      if (stack.indexOf(page) !== -1) arrange();
      dropClocks(page);
      page.presence = presenceAt(g.p);
      reportDepth();
    }
    arrange();
    if (moving) {
      // The page comes in by enter(): an animation, not a gesture. It can be scrolled up and down straight away;
      // only taps wait until it is in. The layers below recede on the same clock, by an animation laid over their
      // tie to the page: it runs out by itself, and what it leaves showing is the same picture.
      const ls = layers(), u1 = ls[ls.length - 2], u2 = ls[ls.length - 3];
      const timing = { duration: PUSH_MS, easing: PUSH_EASE, fill: 'forwards' };      // they hold their end until the ties take over
      const blur = mode === 'filter';
      page.clocks = [u1.animate([frame(FRONT, blur), frame(BACK, blur)], timing)];
      if (u2) page.clocks.push(u2.animate([frame(BACK, blur), frame(FAR, blur)], timing));
      if (veil) page.clocks.push(veil.animate([glassFrame(0), glassFrame(1)], timing));
      // how far in the page is, on the same clock, for what follows it outside the layers (reportDepth)
      const clock = page.clocks[0];
      const tick = () => {
        if (!page.entering) return;
        const t = clock.effect.getComputedTiming();
        page.presence = t.progress == null ? 0 : t.progress;
        reportDepth();
        page.raf = requestAnimationFrame(tick);
      };
      page.raf = requestAnimationFrame(tick);
      pushing++;
      g.enter(1, { duration: PUSH_MS, easing: PUSH_EASE, travel: 0.16 }).then(() => {
        pushing--;
        entered();
        // only tidying: by now the class does nothing (its animations have run out and hold nothing)
        whenQuiet(() => el.classList.remove('entering'));
      });
    }
    emit();
    reportDepth();
    return page;
  }

  function pop() {
    flush();
    const t = top();
    if (!t) return;
    if (reduced() || t.g.entering) { finish(t); return; }
    t.g.go(1);
  }
  function popToRoot() {
    flush();
    stack.slice(0, -1).forEach(finish);
    pop();
  }
  // A tap while a page is coming in does nothing: a second tap on a row must not open it twice.
  // A tap on the page below while the top one is still finishing its swipe: finish it first.
  function onClick(e) {
    let t;
    if (pushing) { e.stopPropagation(); e.preventDefault(); return; }
    while ((t = top()) && t.g.passing && !t.el.contains(e.target)) finish(t);
  }
  host.addEventListener('click', onClick, true);

  return {
    root: rootEl.querySelector('.page-in'),
    rootPage: rootEl.querySelector('.page'),
    get depth() { return stack.length; },
    get top() { return top() || null; },
    has: (key) => stack.some((p) => p.key === key),
    push, pop, popToRoot,
    onChange: (fn) => { listeners.push(fn); },
    onDepth: (fn) => { depthListeners.push(fn); fn(depthNow()); return () => { const i = depthListeners.indexOf(fn); if (i !== -1) depthListeners.splice(i, 1); }; },
    destroy() {
      if (tidy) tidy.cancel();
      host.removeEventListener('click', onClick, true);
      left.concat(stack).forEach(takeOut);
      stack = []; left = [];
      rootEl.remove();
      host.classList.remove('ds');
    },
  };
}

export default DepthStack;
