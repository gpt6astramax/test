// What the floating chrome (the tab row) does while the player is up. Several ways, to be compared on a device; the
// choice is kept in localStorage and applies the next time the player opens.
//
// The constraint they all work around: glass (a backdrop blur, here the tab row's) only sees what is behind it as
// long as nothing it sits in has an opacity below 1, an opacity animation (even one that stays at 1) or a filter.
// Any of those and it shows as clear glass. What lies under the player fades and goes out of focus, so:
//   outside that layer, and leaving by a transform only:   sink, rise, left
//   outside it, staying in place:                          fade (its parts dim; the glass thins through the
//                                                          opacity() of its own backdrop-filter)
//   inside it:                                             noglass (its own blur is switched off meanwhile),
//                                                          asis (the control: the glass goes clear)
const KEY = 'depth-music:chrome';
export const CHROME_MODES = [
  { key: 'sink', title: '下沉离开', note: '底栏往下沉出屏幕，只位移，不改透明度' },
  { key: 'rise', title: '跟着上升', note: '底栏贴着播放器的上沿被顶上去，从屏幕顶部出去' },
  { key: 'left', title: '向左离开', note: '底栏往左滑出屏幕，只位移，不改透明度' },
  { key: 'fade', title: '原地淡出', note: '底栏不移动；图标和圆点变淡，毛玻璃用它自己的 opacity() 变淡' },
  { key: 'noglass', title: '留下，去掉毛玻璃', note: '底栏和页面一起退到后面变淡，它自己的毛玻璃在这期间关掉' },
  { key: 'asis', title: '留下，保留毛玻璃', note: '对照用：最早的做法，毛玻璃留在会变淡的那一层里，会变成透明' },
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
