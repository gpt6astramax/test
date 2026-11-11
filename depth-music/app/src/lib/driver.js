// Which ScrollGesture driver the app's gestures use: 'scroll' (native scroll snapping, the default) or 'js'
// (script-driven). Kept in localStorage; it applies to pages and sheets opened from then on.
const KEY = 'depth-music:driver';
export function getDriver() {
  try { return localStorage.getItem(KEY) === 'js' ? 'js' : 'scroll'; } catch (e) { return 'scroll'; }
}
export function setDriver(d) {
  try { localStorage.setItem(KEY, d === 'js' ? 'js' : 'scroll'); } catch (e) { /* private mode */ }
}
