// What the floating chrome (the tab row) does while the player is up. Several ways, to be compared on a device; the
// choice is kept in localStorage and applies the next time the player opens.
//
// The constraint they all work around: in Safari a backdrop blur (the tab row's) that sits inside an ancestor with a
// filter sees nothing behind it and shows as clear glass, and the player puts a blur filter on what lies under it.
//   outside what is blurred, and leaving:   sink, rise, left, fade
//   inside what is blurred:                 noglass (its own blur is switched off meanwhile), asis (the control)
const KEY = 'depth-music:chrome';
export const CHROME_MODES = [
  { key: 'sink', title: '下沉离开', note: '底栏往下沉出屏幕并淡出' },
  { key: 'rise', title: '跟着上升', note: '底栏贴着播放器的上沿被顶上去，从屏幕顶部出去' },
  { key: 'left', title: '向左离开', note: '底栏往左滑出屏幕并淡出' },
  { key: 'fade', title: '原地淡出', note: '底栏不移动，略微缩小并淡出' },
  { key: 'noglass', title: '留下，去掉毛玻璃', note: '底栏和页面一起退到后面变虚，它自己的毛玻璃在这期间关掉' },
  { key: 'asis', title: '留下，保留毛玻璃', note: '对照用：最早的做法，毛玻璃留在被虚化的那一层里' },
];
const valid = (m) => CHROME_MODES.some((x) => x.key === m);
export function getChromeMode() {
  try { const m = localStorage.getItem(KEY); return valid(m) ? m : 'sink'; } catch (e) { return 'sink'; }
}
export function saveChromeMode(m) {
  try { localStorage.setItem(KEY, valid(m) ? m : 'sink'); } catch (e) { /* private mode */ }
}
/** These keep the chrome inside what the player blurs. */
export const chromeStays = (m) => m === 'noglass' || m === 'asis';
