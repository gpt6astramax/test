// What the floating chrome (the tab row) does while the player is up. Several ways, to be compared on a device; the
// choice is kept in localStorage and applies the next time the player opens.
//
// The constraint they all work around: glass (a backdrop blur, here the tab row's) only sees what is behind it as
// long as nothing it sits in has an opacity below 1, an opacity animation (even one that stays at 1), will-change:
// opacity or a filter. Any of those and it shows as clear glass. (The glass's own opacity is fine: it only thins it.) What lies under the player fades and goes out of focus, so:
//   outside that layer, and leaving by a transform only:   sink, rise, left
//   outside it, staying in place:                          fade (its parts dim; the glass thins through the
//                                                          opacity() of its own backdrop-filter)
//   inside it:                                             noglass (its own blur is switched off meanwhile),
//                                                          asis (the control: the glass goes clear)
//
// And a second constraint, seen on a real device: the row's glass dropped out for a moment when the player went
// away, although the same row over a pushed page never does. The difference is that a pushed page does nothing to the
// row, while every way above does something to it (an animation, a transform, inert, and their removal afterwards).
// So two ways leave the row alone altogether, exactly as a pushed page does:
//   cover   nothing is done to the row. The player's veil (glass) lies over it, so it goes out of focus in place,
//           together with the page behind
//   top     nothing is done to the row. It stays in front of the player, as it does in front of any other page
const KEY = 'depth-music:chrome-2';       // (-2: the default changed; choices made among the earlier ways start over)
export const CHROME_MODES = [
  { key: 'cover', title: '不动，被毛玻璃罩盖住', note: '完全不碰底栏：播放器的毛玻璃罩盖在它上面，它和页面一起原地变虚，播放器走了再一起变清楚' },
  { key: 'top', title: '不动，留在最上面', note: '完全不碰底栏：它浮在播放器上面，和普通子页面一样；点页签会先收起播放器' },
  { key: 'sink', title: '下沉离开', note: '底栏往下沉出屏幕，只位移，不改透明度' },
  { key: 'rise', title: '跟着上升', note: '底栏贴着播放器的上沿被顶上去，从屏幕顶部出去' },
  { key: 'left', title: '向左离开', note: '底栏往左滑出屏幕，只位移，不改透明度' },
  { key: 'fade', title: '原地淡出', note: '底栏不移动；图标和圆点变淡，毛玻璃用它自己的 opacity() 变淡' },
  { key: 'noglass', title: '留下，去掉毛玻璃', note: '底栏和页面一起退到后面变淡，它自己的毛玻璃在这期间关掉' },
  { key: 'asis', title: '留下，保留毛玻璃', note: '对照用：最早的做法，毛玻璃留在会变淡的那一层里，会变成透明' },
];
const valid = (m) => CHROME_MODES.some((x) => x.key === m);
const DEFAULT = 'cover';
export function getChromeMode() {
  try { const m = localStorage.getItem(KEY); return valid(m) ? m : DEFAULT; } catch (e) { return DEFAULT; }
}
export function saveChromeMode(m) {
  try { localStorage.setItem(KEY, valid(m) ? m : DEFAULT); } catch (e) { /* private mode */ }
}
/** These keep the chrome inside what the player blurs. */
export const chromeStays = (m) => m === 'noglass' || m === 'asis';
/** These do nothing at all to the chrome: no style, no attribute, no animation, at any moment. */
export const chromeUntouched = (m) => m === 'cover' || m === 'top';
