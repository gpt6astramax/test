// The floating chrome (the tab row, and the play bar above it) belongs to the four root pages. Whatever comes over a
// root page covers it: a page pushed in a tab, the player. Covering it means what it means for the root page itself:
// it goes out of focus and faint where it is, behind the page in front. The chrome does not move, and the page in
// front gets no glass of its own: as everywhere, its background is the page behind, out of focus.
//
//   const cover = ChromeCover(chromeElement);
//   cover.set('stack', f);      // f per source: 0 = the root page in front, 1 = one page over it, 2 = two pages
//   cover.set('player', f);     // the most covered source wins
//
// What is written, and where (see ui/DotTabBar.web.jsx, coverDotTabBar):
//   - the tab row's icons, dot and capsule: plain style values on those leaves, never on anything the capsule sits in
//   - the play bar: it is glass itself, so it only fades (its own opacity thins its glass; it does not switch it off)
//   - the chrome: inert while covered, so touches reach the page in front and the keyboard skips it
// Nothing is animated: every value follows the page it belongs to, frame by frame, from the gestures' own events.
// At 0 everything written is taken off at once, so the row is whole the moment the page in front has gone.
import { coverDotTabBar } from '../ui/DotTabBar';
import { getDepthMode } from './depth-mode';

export function ChromeCover(chrome) {
  const sources = new Map();
  let f = 0, blur = true, shellO = null;
  function apply() {
    let nf = 0;
    sources.forEach((v) => { if (v > nf) nf = v; });
    if (nf > 0 && f === 0) blur = getDepthMode() !== 'none';   // how the page behind goes out of focus, from now on
    f = nf;
    coverDotTabBar(chrome.querySelector('.dtb'), nf, { blur });
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
