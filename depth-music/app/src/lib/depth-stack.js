// DepthStack: a page stack with depth-of-field page turns, built straight on ScrollGesture. Framework-free; the React
// side (src/nav/DepthStackView) puts a screen into each page's `inner` element.
//
//   const ds = DepthStack(host);
//   ds.root                       // element for the first page's content
//   const page = ds.push(key);    // page.inner is where the new page's content goes; null if `key` is already on top
//   ds.pop(); ds.popToRoot();
//   ds.onChange((depth) => …);
//
// Each pushed page is a gesture with sides [1] (swipe right = back). The layers below follow it:
//   the page right below comes back from "behind" (smaller, lower, blurred, faint) into focus,
//   the one below that comes back from nothing to "behind", anything deeper is not rendered at all,
//   and the page being swiped away fades out as it goes, so it never reads as a slab sliding off.
// With the 'scroll' driver they are tied to the page's scroll timeline, so nothing runs in script per frame; with the
// 'js' driver (or without scroll timelines) the same values are written from the gesture's 'change' event.
// Coming in is the one move on a clock: ScrollGesture's enter() slides the page in, and the layers below recede over
// the same time.
//
// One rule shapes the code: nothing is changed on a page, or on anything it sits in, at the moment a transition ends.
// That is exactly when a finger is likely to be scrolling the page that has just appeared, and on iOS a change to an
// ancestor's layer, overflow or animations under a moving scroll stops it dead. So:
//   - what a page needs for the back swipe is put on it when it is created and never touched again;
//   - the entrance is one animation laid over that, which runs out by itself and leaves nothing to undo;
//   - a page that has left stays where it is (off screen, taking no touches) until things are quiet (./quiet.js).
import './scroll-gesture.js';
import { tapSwitch, reduced, supportsTimeline } from '../ui/platform';
import { whenQuiet } from './quiet';
import { getDriver } from './driver';

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
const frame = (v) => ({ transform: v.s === 1 && !v.y ? 'none' : tf(v), filter: `blur(${v.blur}px)`, opacity: v.o });
const BACK_SVG = '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

let styled = false;
function styles() {
  if (styled) return;
  styled = true;
  const hold = (100 * OVER / (1 + OVER)).toFixed(2) + '%';            // timeline point where the top page has just left the screen
  const gone = (100 * (1 - GONE / (1 + OVER))).toFixed(2) + '%';
  const st = document.createElement('style');
  st.setAttribute('data-depth-stack', '');
  st.textContent =
    `.ds{--back-t:${tf(BACK)};--back-blur:${BACK.blur}px;--back-o:${BACK.o};--far-t:${tf(FAR)};--far-blur:${FAR.blur}px;--push-ms:${PUSH_MS}ms;--push-ease:${PUSH_EASE}}` +
    `@keyframes ds-f1{0%,${hold}{transform:none;filter:blur(0px);opacity:1}100%{transform:var(--back-t);filter:blur(var(--back-blur));opacity:var(--back-o)}}` +
    `@keyframes ds-f2{0%,${hold}{transform:var(--back-t);filter:blur(var(--back-blur));opacity:var(--back-o)}100%{transform:var(--far-t);filter:blur(var(--far-blur));opacity:0}}` +
    `@keyframes ds-leave{0%,${gone}{opacity:0}100%{opacity:1}}`;
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
  const top = () => stack[stack.length - 1];
  const layers = () => [rootEl].concat(stack.map((p) => p.el));
  const emit = () => listeners.forEach((fn) => fn(stack.length));

  // Tie a layer to the top page's scroll timeline (or untie it). Written only when it changes.
  function follow(el, name, timeline) {
    const key = name ? name + ' ' + timeline : '';
    if ((el.dsFollow || '') === key) return;
    el.dsFollow = key;
    if (name) { el.style.animation = name + ' linear both'; el.style.animationTimeline = timeline; }
    else { el.style.removeProperty('animation'); el.style.removeProperty('animation-timeline'); }
  }
  // Give every layer its place in depth, for the stack as it now is.
  function arrange() {
    const ls = layers(), n = ls.length, t = top();
    const timeline = t && t.tied ? t.g.timeline : null;
    ls.forEach((el, i) => {
      const d = n - 1 - i;
      el.classList.toggle('b1', d === 1); el.classList.toggle('b2', d === 2); el.classList.toggle('b3', d > 2);
      setInert(el, d > 0);                                // covered pages take no focus and are not read out
      follow(el, timeline && d === 1 ? 'ds-f1' : timeline && d === 2 ? 'ds-f2' : null, timeline);
      if (el.dsMixed) { el.dsMixed = false; ['transform', 'filter', 'opacity'].forEach((k) => el.style.removeProperty(k)); }
    });
  }
  // Without a scroll timeline: the same follow, written from the gesture's 'change' event.
  function mix(el, a, b, f) {
    if (!el) return;
    const L = (k) => a[k] + (b[k] - a[k]) * f;
    el.dsMixed = true;
    el.style.transform = `translateY(${L('y')}%) scale(${L('s')})`;
    el.style.filter = `blur(${L('blur')}px)`;
    el.style.opacity = String(L('o'));
  }

  function dropClocks(page) { if (page.clocks) { page.clocks.forEach((a) => a.cancel()); page.clocks = null; } }
  function takeOut(page) { dropClocks(page); page.g.destroy(); page.el.remove(); }
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
    host.appendChild(el);
    const g = ScrollGesture(el, { driver: getDriver(), sides: [1], cssVar: null, body, overshoot: OVER, passthrough: 1 - GONE });
    const tied = supportsTimeline && !!g.timeline;
    // The leaving fade is on the page from the start (at rest it is fully opaque) and stays for its whole life.
    if (tied) { body.style.animation = 'ds-leave linear both'; body.style.animationTimeline = g.timeline; }
    const page = { key, el, body, inner: body.querySelector('.page-in'), scroller: body.querySelector('.page'), g, tied, clocks: null };
    stack.push(page);
    g.on('change', (p) => {
      const tp = top();
      if (tp !== page) {
        // this page is being swiped back while the one above is still finishing off-screen
        if (tp && tp.g.passing && stack[stack.length - 2] === page) finish(tp);
        return;
      }
      if (left.length) flush();                             // the layers below must follow this page from here on
      if (page.clocks && p > 0.02) dropClocks(page);        // the finger took the page while it was coming in
      const ls = layers();
      setInert(ls[ls.length - 2], !g.passing);              // once this page lets touches through, the one below is live
      if (!tied && !page.clocks) {
        const k = Math.min(1, (1 + OVER) * Math.max(0, p));
        mix(ls[ls.length - 2], BACK, FRONT, k); mix(ls[ls.length - 3], FAR, BACK, k);
        body.style.opacity = String(Math.max(0, 1 - k / GONE));
      }
    });
    g.on('settle', (side) => { if (side === 1) gone(page); });
    arrange();
    if (moving) {
      // The page comes in by enter(): an animation, not a gesture. It can be scrolled up and down straight away;
      // only taps wait until it is in. The layers below recede on the same clock, by an animation laid over their
      // tie to the page: it runs out by itself, and what it leaves showing is the same picture.
      const ls = layers(), u1 = ls[ls.length - 2], u2 = ls[ls.length - 3];
      const timing = { duration: PUSH_MS, easing: PUSH_EASE };
      page.clocks = [u1.animate([frame(FRONT), frame(BACK)], timing)];
      if (u2) page.clocks.push(u2.animate([frame(BACK), frame(FAR)], timing));
      pushing++;
      g.enter(1, { duration: PUSH_MS, easing: PUSH_EASE, travel: 0.16 }).then(() => {
        pushing--;
        page.clocks = null;
        // only tidying: by now the class does nothing (its animations have run out and hold nothing)
        whenQuiet(() => el.classList.remove('entering'));
      });
    }
    emit();
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
