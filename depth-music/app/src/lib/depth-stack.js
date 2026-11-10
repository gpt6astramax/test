// DepthStack: a page stack with depth-of-field page turns, built straight on ScrollGesture. Framework-free; the React
// side (src/nav/DepthStackView) puts a screen into each page's `inner` element.
//
//   const ds = DepthStack(host);
//   ds.root                       // element for the first page's content
//   const page = ds.push(key);    // page.inner is where the new page's content goes; null if `key` is already on top
//   ds.pop(); ds.popToRoot();
//   ds.onChange((depth) => …);
//
// Each pushed page is a gesture with sides [1] (swipe right = back) and no CSS variable; the layers below follow its
// scroll timeline, so nothing runs in JS per frame:
//   the page right below comes back from "behind" (smaller, lower, blurred, faint) into focus,
//   the one below that comes back from nothing to "behind", anything deeper is not rendered at all,
//   and the page being swiped away fades out as it goes, so it never reads as a slab sliding off.
// Coming in is the one move on a clock: ScrollGesture's enter() slides the page in by animation, with no scroll for a
// finger to cut short, and the layers below recede over the same time.
import './scroll-gesture.js';
import { tapSwitch, reduced, supportsTimeline } from '../ui/platform';

const ScrollGesture = window.ScrollGesture;

// The swipe ends this far past the edge. The browser decides how long its snap takes, by the distance left; a commit
// point just outside the screen keeps the page on screen for most of that time, so it leaves at an easy pace.
export const OVER = 0.1;
// The leaving content has faded out once it has moved this share of the screen.
export const GONE = 0.8;
export const PUSH_MS = 660;
export const PUSH_EASE = 'cubic-bezier(.2,.86,.24,1)';
const FRONT = { s: 1, y: 0, blur: 0, o: 1 }, BACK = { s: 0.86, y: 4.5, blur: 20, o: 0.5 }, FAR = { s: 0.74, y: 10, blur: 40, o: 0 };
const tf = (v) => `translateY(${v.y}%) scale(${v.s})`;
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

export function DepthStack(host) {
  styles();
  host.classList.add('ds');
  const rootEl = document.createElement('div');
  rootEl.className = 'layer root';
  rootEl.innerHTML = '<div class="page"><div class="page-in"></div></div>';
  host.appendChild(rootEl);
  let stack = [];
  const listeners = [];
  const top = () => stack[stack.length - 1];
  const layers = () => [rootEl].concat(stack.map((p) => p.el));
  const emit = () => listeners.forEach((fn) => fn(stack.length));

  // Give every layer its place in depth. entering: the layers below recede on a clock while the new page comes in;
  // otherwise they are tied to the top page's scroll timeline.
  function bind(entering) {
    const ls = layers(), n = ls.length, t = top();
    ls.forEach((el, i) => {
      const d = n - 1 - i;
      ['animation', 'animation-timeline', 'transform', 'filter', 'opacity'].forEach((k) => el.style.removeProperty(k));
      el.classList.toggle('b1', d === 1); el.classList.toggle('b2', d === 2); el.classList.toggle('b3', d > 2);
      el.inert = d > 0;                                   // covered pages take no focus and are not read out
    });
    stack.forEach((p) => ['animation', 'animation-timeline', 'opacity'].forEach((k) => p.body.style.removeProperty(k)));
    host.classList.toggle('ds-pushing', !!entering);
    if (!t) return;
    const u1 = ls[n - 2], u2 = ls[n - 3];
    if (entering) {
      u1.style.animation = `ds-r1 ${PUSH_MS}ms ${PUSH_EASE} both`;
      if (u2) u2.style.animation = `ds-r2 ${PUSH_MS}ms ${PUSH_EASE} both`;
    } else if (supportsTimeline) {
      u1.style.animation = 'ds-f1 linear both'; u1.style.animationTimeline = t.g.timeline;
      if (u2) { u2.style.animation = 'ds-f2 linear both'; u2.style.animationTimeline = t.g.timeline; }
      t.body.style.animation = 'ds-leave linear both'; t.body.style.animationTimeline = t.g.timeline;
    }
  }
  // Browsers without scroll timelines: the same follow, written from the scroll event.
  function mix(el, a, b, f) {
    if (!el) return;
    const L = (k) => a[k] + (b[k] - a[k]) * f;
    el.style.transform = `translateY(${L('y')}%) scale(${L('s')})`;
    el.style.filter = `blur(${L('blur')}px)`;
    el.style.opacity = String(L('o'));
  }

  function finish(page) {
    const i = stack.indexOf(page);
    if (i === -1) return;
    stack.splice(i, 1);
    page.g.destroy();
    page.el.remove();
    if (!host.classList.contains('ds-pushing')) bind();
    emit();
  }

  function push(key) {
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
    host.appendChild(el);
    const g = ScrollGesture(el, { sides: [1], cssVar: null, body, overshoot: OVER, passthrough: 1 - GONE / (1 + OVER) });
    const page = { key, el, body, inner: body.querySelector('.page-in'), scroller: body.querySelector('.page'), g };
    stack.push(page);
    g.on('change', (p) => {
      const tp = top();
      if (tp === page && !host.classList.contains('ds-pushing')) {
        const ls = layers();
        ls[ls.length - 2].inert = !g.passing;             // once this page lets touches through, the one below is live
        if (!supportsTimeline) {
          const k = Math.min(1, (1 + OVER) * Math.max(0, p));
          mix(ls[ls.length - 2], BACK, FRONT, k); mix(ls[ls.length - 3], FAR, BACK, k);
          body.style.opacity = String(Math.max(0, 1 - k / GONE));
        }
      }
      // this page is being swiped back while the one above is still finishing off-screen
      if (tp && tp !== page && tp.g.passing && stack[stack.length - 2] === page) finish(tp);
    });
    g.on('settle', (side) => { if (side === 1) finish(page); });
    if (reduced()) bind();
    else {
      // The page comes in by enter(): an animation, not a scroll, so nothing is held back from the finger. It can
      // scroll the new page up and down straight away; only the back swipe and taps wait until the page is in.
      bind(true);
      el.classList.add('entering');
      g.enter(1, { duration: PUSH_MS, easing: PUSH_EASE, travel: 0.16 }).then(() => {
        el.classList.remove('entering');
        if (stack.indexOf(page) !== -1) bind();
      });
    }
    emit();
    return page;
  }

  function pop() {
    const t = top();
    if (!t) return;
    if (reduced() || t.g.entering) { host.classList.remove('ds-pushing'); finish(t); return; }
    t.g.go(1);
  }
  function popToRoot() {
    stack.slice(0, -1).forEach(finish);
    pop();
  }
  // A tap while a page is coming in does nothing: a second tap on a row must not open it twice.
  // A tap on the page below while the top one is still finishing its swipe: finish it first.
  function onClick(e) {
    let t;
    if (host.classList.contains('ds-pushing')) { e.stopPropagation(); e.preventDefault(); return; }
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
      host.removeEventListener('click', onClick, true);
      stack.forEach((p) => { p.g.destroy(); p.el.remove(); });
      stack = [];
      rootEl.remove();
      host.classList.remove('ds', 'ds-pushing');
    },
  };
}

export default DepthStack;
