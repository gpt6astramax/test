// How the page behind goes out of focus. Kept in localStorage; applies to pages and to the player opened from then on.
//
//   veil    The layers behind only shrink, sink and fade (transform and opacity). The blur is a sheet of glass laid
//           over them, of a fixed radius, whose strength is the opacity() of its backdrop-filter. Nothing animates a
//           blur radius, so the browser's compositor can run all of it in step with the scrolling finger.
//   filter  The layers behind animate their own filter: blur(). The radius follows the finger exactly, but an
//           animation with a blur in it cannot run on Chromium's compositor: the main thread has to deliver every
//           frame of it, and a finger-driven scroll does not wait for the main thread.
//   none    No blur at all: shrink, sink and fade only. For telling the blur's cost from everything else.
//   auto    veil in Chromium (Chrome, Edge), filter elsewhere.
const KEY = 'depth-music:depth';
export const DEPTH_MODES = [
  { key: 'auto', title: '自动', note: 'Chrome / Edge 用毛玻璃罩，其他浏览器用图层滤镜' },
  { key: 'veil', title: '毛玻璃罩', note: '后面那页只缩小、下沉、变淡；模糊是盖在它上面的一层固定半径的毛玻璃，强弱用 opacity() 调' },
  { key: 'filter', title: '图层滤镜', note: '后面那页自己的模糊半径跟着手指变（Chrome / Edge 里这种动画只能在主线程上跑）' },
  { key: 'none', title: '不虚化', note: '对照用：只缩小、下沉、变淡' },
];
const valid = (m) => DEPTH_MODES.some((x) => x.key === m);
export function getDepthSetting() {
  try { const m = localStorage.getItem(KEY); return valid(m) ? m : 'auto'; } catch (e) { return 'auto'; }
}
export function saveDepthSetting(m) {
  try { localStorage.setItem(KEY, valid(m) ? m : 'auto'); } catch (e) { /* private mode */ }
}
const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
// Chromium: Chrome, Edge and the rest of that family. (Chrome on iPhone is WebKit and has no "Chrome/" in its name.)
const chromium = typeof navigator !== 'undefined' && (!!navigator.userAgentData || /\bChrome\//.test(ua));
/** The technique in effect: 'veil' | 'filter' | 'none'. */
export function getDepthMode() {
  const m = getDepthSetting();
  return m === 'auto' ? (chromium ? 'veil' : 'filter') : m;
}
