// The floating chrome (the tab row, and the play bar above it) belongs to the four root pages. Whatever comes over a
// root page covers it: a page pushed in a tab, the player. Covering it means what it means for the root page itself:
// it goes out of focus and faint where it is, behind the page in front. The chrome does not move, and the page in
// front gets no glass of its own: as everywhere, its background is the page behind, out of focus.
//
//   const cover = ChromeCover(chromeElement);
//   cover.set('stack', f);      // f per source: 0 = the root page in front, 1 = one page over it, 2 = two pages
//   cover.set('player', f);     // the most covered source wins
//
// What is written, and where (coverRow below):
//   - the tab row's icons, dot and capsule: plain style values on those leaves, never on anything the capsule sits in
//   - the play bar: it is glass itself, so it only fades (its own opacity thins its glass; it does not switch it off)
//   - the chrome: inert while covered, so touches reach the page in front and the keyboard skips it
// Nothing is animated: every value follows the page it belongs to, frame by frame, from the gestures' own events.
// At 0 everything written is taken off at once, so the row is whole the moment the page in front has gone.
import { getDepthMode } from './depth-mode';

export function ChromeCover(chrome) {
  const sources = new Map();
  let f = 0, blur = true, shellO = null;
  function apply() {
    let nf = 0;
    sources.forEach((v) => { if (v > nf) nf = v; });
    if (nf > 0 && f === 0) blur = getDepthMode() !== 'none';   // how the page behind goes out of focus, from now on
    f = nf;
    coverRow(chrome.querySelector('.sgm-tabs'), nf, { blur });
    const shell = chrome.querySelector('.shell');
    const o = nf === 0 ? null : (1 - Math.min(1, nf)).toFixed(3);
    if (shell && o !== shellO) { if (o === null) shell.style.removeProperty('opacity'); else shell.style.opacity = o; }
    shellO = o;
    const covered = nf > 0;
    if (chrome.inert !== covered) chrome.inert = covered;
  }
  return {
    set(key, v) {
      v = Math.max(0, +v || 0);
      if (sources.get(key) === v) return;
      sources.set(key, v);
      apply();
    },
    get f() { return f; },
  };
}

// ---- the tab row (a Segmented with look="tabs"), covered by the page in front
// f: how far behind the root page the row belongs to is. 0 = in front (as always), 1 = right behind the page in front,
// 2 = two pages back. The row goes as far out of focus, in place:
//   icons and dot   blur and fade exactly as the page behind does (20 px and .5 at 1; 40 px and 0 at 2); blur: false
//                   leaves them sharp (a depth that only fades)
//   capsule         its own blur turned down, as the cube of how present the row is: it never shows as a sharp-edged
//                   frosted capsule over a page that is out of focus, and it forms together with the icons on the way
//                   back. It stays a backdrop-filter all along (blur(0px) at the far end), so the glass is never
//                   rebuilt on the way back
// Only these leaves are written to, by plain values: nothing the capsule sits in, and no animation, because glass
// stops blurring as soon as anything it sits in has an opacity below 1, a filter, or an animation of either. At 0
// every value written is taken off again, and the row is exactly what the stylesheet makes it.
const DEPTH = [{ b: 0, o: 1 }, { b: 20, o: 0.5 }, { b: 40, o: 0 }];
function coverRow(bar, f, { blur = true } = {}) {
  if (!bar) return;
  f = Math.max(0, Math.min(2, +f || 0));
  const st = bar.rowCover || (bar.rowCover = { f: 0, r: 18 });
  // nothing is written when nothing has changed (a value written again still counts as a change)
  if (f === st.f || (Math.abs(f - st.f) < 0.002 && f !== 0 && f !== 1 && f !== 2)) return;
  const leaves = bar.querySelectorAll('.sgm-item, .sgm-ink'), haze = bar.querySelector('.sgm-haze');
  if (f === 0) {
    st.f = 0;
    leaves.forEach((n) => { n.style.removeProperty('filter'); n.style.removeProperty('opacity'); });
    if (haze) { haze.style.removeProperty('-webkit-backdrop-filter'); haze.style.removeProperty('backdrop-filter'); }
    return;
  }
  if (st.f === 0 && haze) {                                       // the capsule's own blur, as the stylesheet has it
    const cs = getComputedStyle(haze), m = /blur\(([\d.]+)px\)/.exec(cs.backdropFilter || cs.webkitBackdropFilter || '');
    st.r = m ? +m[1] : 18;
  }
  st.f = f;
  const i = Math.min(1, Math.floor(f)), t = f - i, a = DEPTH[i], b = DEPTH[i + 1];
  const px = blur ? a.b + (b.b - a.b) * t : 0, op = a.o + (b.o - a.o) * t;
  leaves.forEach((n) => { n.style.filter = px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none'; n.style.opacity = String(+op.toFixed(3)); });
  if (haze) {
    const g = `blur(${(st.r * Math.pow(1 - Math.min(1, f), 3)).toFixed(2)}px)`;
    haze.style.webkitBackdropFilter = g; haze.style.backdropFilter = g;
  }
}
