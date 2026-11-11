// The player. Unlike every other page it comes up from below, over whatever is on screen, and goes away with a swipe
// down. Once up it is a page like any other: it fills the screen to the top, square-cornered, and like any other
// page it has no ground of its own. At its top, in the middle, is a short dark line bent into a shallow arrow that
// points down: the hint that it goes away downwards. Pulled, the line straightens; tapped, it puts the player away. It is only its content; what was on
// screen before stays behind it, smaller, lower, out of focus and faint, exactly as a page does behind the next one. It is a vertical ScrollGesture (sides [1]): with the 'scroll' driver dragging it is native
// scrolling, so it follows the finger and snaps like a system sheet. It comes in with enter(), an animation and not
// a gesture. What lies under it drops back out of focus, tied to the sheet's own scroll timeline.
//
// The floating chrome (the tab row) has a blur of its own, and in Safari a backdrop blur inside a filtered ancestor
// sees nothing behind it and shows as clear glass. What the chrome does while the player is up is therefore a choice
// (asideMode, lib/chrome-mode.js): it is outside what goes out of focus and leaves the screen one way or another, or
// it stays inside and its own blur is switched off meanwhile.
//
// As in the page stack, nothing is changed on what lies under the sheet at the moment a transition ends: the tie to
// the sheet is made once, the entrance is one animation laid over it, and after the sheet has gone it stays where it
// is (off screen, taking no touches) until things are quiet. Only then is it unmounted and the tie taken off.
import * as React from 'react';
import '../lib/scroll-gesture.js';
import { whenQuiet } from '../lib/quiet';
import { getDriver } from '../lib/driver';
import { BACK } from '../lib/depth-stack';
import { reduced, supportsTimeline, tapSwitch } from './platform';

const ScrollGesture = window.ScrollGesture;
const OVER = 0.1;                  // the commit point lies this far below the screen's edge
const MS = 620, EASE = 'cubic-bezier(.2,.86,.24,1)';
// Where the chrome is while the player is up, for the ways in which it leaves. x in % of its own width, y in px
// ('h': one screen up, so it rides on the sheet's top edge at the sheet's own speed), s scale, o opacity.
// ret: it starts to return once the sheet has been pulled this far down. ms: how long it takes to leave, as a share
// of the sheet's entrance.
const AWAY = {
  sink: { y: 120, o: 0, ret: 0.35, ms: 0.55 },
  rise: { y: 'h', o: 1, ret: 0, ms: 1 },
  left: { x: -110, o: 0, ret: 0.35, ms: 0.55 },
  fade: { s: 0.94, o: 0, ret: 0.35, ms: 0.45 },
};
// the chrome `a` of the way away (0..1), on a screen h px high
const awayAt = (m, a, h) => `translate(${((m.x || 0) * a).toFixed(2)}%, ${((m.y === 'h' ? -h : m.y || 0) * a).toFixed(1)}px) scale(${(1 - (1 - (m.s || 1)) * a).toFixed(4)})`;
const awayCSS = (m) => `translate(${m.x || 0}%, ${m.y === 'h' ? 'calc(var(--sh-h) * -1)' : (m.y || 0) + 'px'}) scale(${m.s || 1})`;
const BEND = 16;                   // degrees each half of the handle is turned to make the arrow
const STRAIGHT = '94%';            // timeline point (100% = at rest) from which the handle is a straight line
const FRONT_FRAME = { transform: 'none', filter: 'none', opacity: 1 };            // in focus: no filter at all
const BACK_FRAME = { transform: `translateY(${BACK.y}%) scale(${BACK.s})`, filter: `blur(${BACK.blur}px)`, opacity: BACK.o };

let styled = false;
function styles() {
  if (styled) return;
  styled = true;
  const hold = (100 * OVER / (1 + OVER)).toFixed(2) + '%';
  const st = document.createElement('style');
  st.setAttribute('data-player-sheet', '');
  st.textContent =
    `.app{--sh-t:translateY(${BACK.y}%) scale(${BACK.s});--sh-blur:${BACK.blur}px;--sh-o:${BACK.o}}` +
    `@keyframes sh-f{0%,${hold}{transform:none;filter:none;opacity:1}100%{transform:var(--sh-t);filter:blur(var(--sh-blur));opacity:var(--sh-o)}}` +
    Object.keys(AWAY).map((k) => `@keyframes sh-c-${k}{0%,${hold}{transform:none;opacity:1}${(100 * (1 - AWAY[k].ret / (1 + OVER))).toFixed(2)}%,100%{transform:${awayCSS(AWAY[k])};opacity:${AWAY[k].o}}}`).join('') +
    // the chrome stays, its own blur is off
    `.sh-noglass .dtb-haze{display:none}` +
    // the handle's two halves: straight once the sheet has been pulled a little, bent into the arrow at rest
    `@keyframes sh-hl{0%,${STRAIGHT}{transform:none}100%{transform:rotate(${BEND}deg)}}` +
    `@keyframes sh-hr{0%,${STRAIGHT}{transform:none}100%{transform:rotate(-${BEND}deg)}}`;
  document.head.appendChild(st);
}

/**
 * open      whether the player should be showing
 * onClosed  called as soon as it has gone (swiped down, or closed from outside and done sliding)
 * under     ref to the element that lies under the sheet and recedes
 * aside     ref to the floating chrome
 * asideMode what it does while the player is up: 'sink' | 'rise' | 'left' | 'fade' (it is outside `under` and leaves),
 *           'noglass' (inside `under`, its own blur off meanwhile), 'asis' (inside `under`, left alone)
 */
export function PlayerSheet({ open, onClosed, under, aside, asideMode = 'sink', children }) {
  const [state, setState] = React.useState({ mounted: open, gen: 0 });
  const tidy = React.useRef(null);
  const latest = React.useRef(onClosed);
  latest.current = onClosed;
  React.useEffect(() => {
    if (!open) return;
    if (tidy.current) { tidy.current.cancel(); tidy.current = null; }
    setState((s) => ({ mounted: true, gen: s.gen + 1 }));       // a new surface, even if the last one is still waiting to go
  }, [open]);
  React.useEffect(() => () => { if (tidy.current) tidy.current.cancel(); }, []);
  if (!state.mounted) return null;
  const onGone = () => {
    if (latest.current) latest.current();
    tidy.current = whenQuiet(() => { tidy.current = null; setState((s) => ({ ...s, mounted: false })); });
  };
  return <Surface key={state.gen} open={open} under={under} aside={aside} asideMode={asideMode} onGone={onGone}>{children}</Surface>;
}

function Surface({ open, onGone, under, aside, asideMode, children }) {
  styles();
  const el = React.useRef(null);
  const body = React.useRef(null);
  const g = React.useRef(null);
  const handle = React.useRef(null);
  const left = React.useRef(false);
  const latest = React.useRef(onGone);
  latest.current = onGone;

  React.useLayoutEffect(() => {
    const u = under && under.current;
    const gesture = ScrollGesture(el.current, { driver: getDriver(), axis: 'y', sides: [1], cssVar: null, body: body.current, overshoot: OVER });
    g.current = gesture;
    const tied = supportsTimeline && !!gesture.timeline;
    const chrome = aside && aside.current;
    const away = AWAY[asideMode];                             // set when the chrome leaves; then `a` is the chrome
    const a = away ? chrome : null;
    const screen = el.current.clientHeight;
    let clock = null, clockA = null;
    const dropClocks = () => { if (clock) { clock.cancel(); clock = null; } if (clockA) { clockA.cancel(); clockA = null; } };
    if (a) {
      a.inert = true;
      a.style.setProperty('--sh-h', screen + 'px');
      if (tied) { a.style.animation = `sh-c-${asideMode} linear both`; a.style.animationTimeline = gesture.timeline; }
      else { a.style.transform = awayAt(away, 1, screen); a.style.opacity = String(away.o); }
    }
    if (chrome && asideMode === 'noglass') chrome.classList.add('sh-noglass');
    // What lies under is tied to the sheet from the start: it comes back into focus as the sheet is pulled down.
    if (u) {
      u.classList.add('sh-back');
      u.inert = true;
      if (tied) { u.style.animation = 'sh-f linear both'; u.style.animationTimeline = gesture.timeline; }
    }
    // The handle follows the sheet: by its scroll timeline, or else by a class set when the state changes.
    const halves = handle.current.querySelectorAll('i');
    if (tied) halves.forEach((h, i) => { h.style.animation = (i ? 'sh-hr' : 'sh-hl') + ' linear both'; h.style.animationTimeline = gesture.timeline; });
    let flat = false;
    const gone = () => {
      if (left.current) return;
      left.current = true;
      if (u) u.inert = false;
      if (a) a.inert = false;
      if (chrome) chrome.classList.remove('sh-noglass');     // what it sits in carries no filter any more
      el.current.inert = true;
      latest.current();
    };
    const offChange = gesture.on('change', (p) => {
      if (!tied && flat !== p > 0.03) { flat = p > 0.03; handle.current.classList.toggle('flat', flat); }
      if ((clock || clockA) && p > 0.02) dropClocks();               // the finger took the sheet while it was coming up
      if (gesture.passing) { if (u && u.inert) u.inert = false; if (a && a.inert) a.inert = false; }
      if (tied || clock || clockA) return;
      const k = Math.min(1, (1 + OVER) * Math.max(0, p)), L = (from, to) => from + (to - from) * k;
      if (u) {
        u.style.transform = `translateY(${L(BACK.y, 0)}%) scale(${L(BACK.s, 1)})`;
        u.style.filter = L(BACK.blur, 0) > 0.05 ? `blur(${L(BACK.blur, 0)}px)` : 'none';
        u.style.opacity = String(L(BACK.o, 1));
      }
      if (a) {
        const v = Math.max(0, Math.min(1, (k - away.ret) / (1 - away.ret)));  // how far the chrome is back
        a.style.transform = awayAt(away, 1 - v, screen);
        a.style.opacity = String(away.o + (1 - away.o) * v);
      }
    });
    const offSettle = gesture.on('settle', (side) => { if (side === 1) gone(); });
    if (!reduced()) {
      // it recedes on the entrance's clock, by an animation laid over the tie; it runs out by itself
      if (u) { clock = u.animate([FRONT_FRAME, BACK_FRAME], { duration: MS, easing: EASE }); clock.onfinish = () => { clock = null; }; }
      if (a) { clockA = a.animate([{ transform: 'none', opacity: 1 }, { transform: awayAt(away, 1, screen), opacity: away.o }], { duration: MS * away.ms, easing: EASE }); clockA.onfinish = () => { clockA = null; }; }
      gesture.enter(1, { duration: MS, easing: EASE, travel: 1 / (1 + OVER) });
    }
    const onKey = (e) => { if (e.key === 'Escape' && !left.current) gesture.go(1); };
    document.addEventListener('keydown', onKey);
    return () => {
      offChange(); offSettle();
      document.removeEventListener('keydown', onKey);
      dropClocks();
      gesture.destroy();
      g.current = null;
      if (u) {
        ['animation', 'animation-timeline', 'transform', 'filter', 'opacity'].forEach((k) => u.style.removeProperty(k));
        u.classList.remove('sh-back');
        u.inert = false;
      }
      if (a) {
        ['animation', 'animation-timeline', 'transform', 'opacity', '--sh-h'].forEach((k) => a.style.removeProperty(k));
        a.inert = false;
      }
      if (chrome) chrome.classList.remove('sh-noglass');
    };
  }, []);                                                        // eslint-disable-line react-hooks/exhaustive-deps

  // closed from outside: slide down first; it is unmounted later, like after a swipe
  React.useEffect(() => {
    if (open || !g.current || left.current) return;
    if (reduced()) { left.current = true; if (under && under.current) under.current.inert = false; if (aside && aside.current) { aside.current.inert = false; aside.current.classList.remove('sh-noglass'); } latest.current(); }
    else g.current.go(1);
  }, [open]);                                                    // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { if (g.current && !left.current) g.current.go(1); };
  return (
    <div ref={el} className="sheet" role="dialog" aria-label="播放器">
      <div ref={body}>
        <div className="sheet-panel">
          <label ref={handle} className="sheet-handle" role="button" tabIndex={0} aria-label="收起播放器"
            onClick={(e) => { if (!(e.target.matches && e.target.matches('.hsw'))) close(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } }}>
            {tapSwitch ? <input type="checkbox" switch="" className="hsw" aria-hidden="true" /> : null}
            <i /><i />
          </label>
          <div className="sheet-scroll">
            <div className="sheet-in">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerSheet;
