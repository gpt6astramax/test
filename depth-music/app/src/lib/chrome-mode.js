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
// What is wanted (said plainly, after several wrong turns): the row does not move, it is covered by the player in
// the natural way a page covers what lies under it, and it never loses its blur. So nothing at all is done to the
// row, by any of the first three ways, exactly as a pushed page does nothing to it:
//   under   (the default.) The player brings its own sheet of glass, which rises with it. The row stays where it
//           is, underneath: the sheet passes over it and covers it, and uncovers it again on the way down
//   cover   the player's veil (glass over the whole screen, as strong as the player is far up) lies over the row,
//           which goes out of focus in place together with the page behind
//   top     the row stays in front of the player, as it is in front of any pushed page
const KEY = 'depth-music:chrome-4';       // (-4: the default changed again; earlier choices start over)
export const CHROME_MODES = [
  { key: 'under', title: '不动，被播放器自然遮住', note: '完全不碰底栏。播放器自己带一层毛玻璃，升起来时从底栏上面盖过去；收起时底栏原样露出来' },
  { key: 'cover', title: '不动，原地变虚', note: '完全不碰底栏。一层盖住全屏的毛玻璃罩跟着播放器变浓，底栏和页面一起原地变虚，播放器走了再一起变清楚' },
  { key: 'top', title: '不动，一直显示', note: '完全不碰底栏。它留在播放器前面，和普通子页面里一样；点页签会先收起播放器' },
  { key: 'sink', title: '下沉离开', note: '底栏往下沉出屏幕，只位移，不改透明度' },
  { key: 'rise', title: '跟着上升', note: '底栏贴着播放器的上沿被顶上去，从屏幕顶部出去' },
  { key: 'left', title: '向左离开', note: '底栏往左滑出屏幕，只位移，不改透明度' },
  { key: 'fade', title: '原地淡出', note: '底栏不移动；图标和圆点变淡，毛玻璃用它自己的 opacity() 变淡' },
  { key: 'noglass', title: '留下，去掉毛玻璃', note: '底栏和页面一起退到后面变淡，它自己的毛玻璃在这期间关掉' },
  { key: 'asis', title: '留下，保留毛玻璃', note: '对照用：最早的做法，毛玻璃留在会变淡的那一层里，会变成透明' },
];
const valid = (m) => CHROME_MODES.some((x) => x.key === m);
const DEFAULT = 'under';
export function getChromeMode() {
  try { const m = localStorage.getItem(KEY); return valid(m) ? m : DEFAULT; } catch (e) { return DEFAULT; }
}
export function saveChromeMode(m) {
  try { localStorage.setItem(KEY, valid(m) ? m : DEFAULT); } catch (e) { /* private mode */ }
}
/** These keep the chrome inside what the player blurs. */
export const chromeStays = (m) => m === 'noglass' || m === 'asis';
/** These do nothing at all to the chrome: no style, no attribute, no animation, at any moment. */
export const chromeUntouched = (m) => m === 'under' || m === 'cover' || m === 'top';
