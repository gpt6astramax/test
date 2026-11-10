// What the device can do, and the one tick a web page can give.
const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
const appleTouch = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

/** Android: the vibration API. */
export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * iPhone: the only haptic a web page gets is the one a real finger tap on a <label> around a native switch plays
 * (pwa-template/docs/ios-haptics.md). The switch is rendered only there: anywhere else a click would focus it, and the
 * browser scrolling it into view would cut the page's own smooth scrolls short. It never gets a tabindex.
 */
export const tapSwitch = !canVibrate && appleTouch && typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const supportsTimeline = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('animation-timeline: scroll()');

// One short tick. The vibration API stays silent until the page has had a first tap; a tick asked for before that (on a
// touch going down) is owed and played when the finger lifts.
let owed = false;
export function buzz() { if (canVibrate && !navigator.vibrate(10)) owed = true; }
export function payBuzz() { if (owed) { owed = false; navigator.vibrate(10); } }

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
