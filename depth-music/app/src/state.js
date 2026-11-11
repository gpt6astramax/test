// The app's state: what plays, what is liked, what floats. One small store; components read it with useStore().
// Playback is simulated (the prototype has no audio): a clock moves `t` forward. On the web the progress is written
// straight to the elements that show it (showProgress), so a tick re-renders nothing; on iOS / Android the few
// components that show it follow the tick with useProgress().
import { useSyncExternalStore } from 'react';
import { TRACKS, byId, mmss } from './data';
import { getChromeMode, saveChromeMode } from './lib/chrome-mode';

export const state = { cur: 't7', t: 96, playing: true, liked: { t1: 1, t8: 1, t4: 1 }, tab: 0, bar: false, player: false, toast: null, chromeMode: getChromeMode() };
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
export function set(patch) { Object.assign(state, patch); emit(); }
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** select must return a primitive or a value that keeps its identity until it changes. */
export const useStore = (select) => useSyncExternalStore(subscribe, () => select(state));

export const cur = () => byId[state.cur];
/** What the tab row does while the player is up (lib/chrome-mode.js). */
export function setChromeMode(m) { saveChromeMode(m); set({ chromeMode: m }); }

// ---- progress, written to the DOM directly
const shown = new Set();           // { el, id, kind: 'var' | 'time' }
export function showProgress(el, id, kind) {
  const entry = { el, id, kind };
  shown.add(entry);
  paint(entry);
  return () => shown.delete(entry);
}
function paint(entry) {
  const on = entry.id === state.cur, t = cur();
  if (entry.kind === 'time') entry.el.textContent = mmss(on ? state.t : 0);
  else entry.el.style.setProperty('--prog', String(on ? Math.max(0, Math.min(1, state.t / t.dur)) : 0));
}
const ticks = new Set();
const paintAll = () => { shown.forEach(paint); ticks.forEach((fn) => fn()); };
const onTick = (fn) => { ticks.add(fn); return () => ticks.delete(fn); };
/** Seconds played of track `id` (0 while another track plays), updated four times a second. */
export const useProgress = (id) => useSyncExternalStore(onTick, () => (state.cur === id ? state.t : 0));

// ---- actions
export function setTrack(id) { set({ cur: id, t: 0, playing: true }); paintAll(); }
export function step(dir) { setTrack(TRACKS[(cur().n + dir + TRACKS.length) % TRACKS.length].id); }
export function togglePlay(id) {
  if (id && id !== state.cur) { setTrack(id); return; }
  set({ playing: !state.playing });
}
export function seek(id, f) {
  if (id !== state.cur) setTrack(id);
  state.t = Math.max(0, Math.min(1, f)) * cur().dur;
  paintAll();
}
export function nudge(id, seconds) {
  if (id !== state.cur) setTrack(id);
  state.t = Math.max(0, Math.min(cur().dur, state.t + seconds));
  paintAll();
}
export function toggleLike(id) {
  const liked = { ...state.liked };
  if (liked[id]) delete liked[id]; else liked[id] = 1;
  set({ liked });
  toast(liked[id] ? '已收藏' : '已取消收藏');
}
/** The player: a sheet that comes up from below, whatever is on screen. */
export function openPlayer(id) { if (id && id !== state.cur) setTrack(id); set({ player: true }); }
export function closePlayer() { set({ player: false }); }

let toastT = 0;
export function toast(text) {
  set({ toast: text });
  clearTimeout(toastT);
  toastT = setTimeout(() => set({ toast: null }), 1800);
}

{
  setInterval(() => {
    if (!state.playing || (typeof document !== 'undefined' && document.hidden)) return;
    state.t += 0.25;
    if (state.t >= cur().dur) step(1); else paintAll();
  }, 250);
}
