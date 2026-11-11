// The page and the Expo app around it (depth-music/shell). Only does anything inside that app.
//
// The app downloads a new version of the page in the background. For a "medium" update it asks the page to offer it:
// it sets window.__depthMusicUpdate and fires 'depth-music:update' (the page may not have started yet, hence both).
// The page answers through window.ReactNativeWebView: { type: 'update-shown' } when it shows the offer (otherwise the
// app asks with a system dialog), then { type: 'update', now: true | false }.
export const inShell = typeof window !== 'undefined' && !!window.ReactNativeWebView;

export function post(msg) {
  if (inShell) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
}

/** Calls fn(offer) for an update offered by the app (now, if one already was). Returns the unsubscribe. */
export function onUpdateOffer(fn) {
  if (typeof window === 'undefined') return () => {};
  const on = (e) => fn(e.detail);
  window.addEventListener('depth-music:update', on);
  if (window.__depthMusicUpdate) fn(window.__depthMusicUpdate);
  return () => window.removeEventListener('depth-music:update', on);
}
