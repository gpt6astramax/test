// The player. Unlike every other page it comes up from below, over whatever is on screen, and goes away with a swipe
// down. Once up it is a page like any other: it fills the screen to the top, square-cornered, and like any other
// page it has no ground of its own. At its top, in the middle, is a short dark line bent into a shallow arrow that
// points down: the hint that it goes away downwards. Pulled, the line straightens; tapped, it puts the player away.
// It is only its content; what was on screen before stays behind it, smaller, lower, out of focus and faint, exactly
// as a page does behind the next one.
//
// It is a vertical ScrollGesture (sides [1]): with the 'scroll' driver dragging it is native scrolling, so it follows
// the finger and snaps like a system sheet. It comes in with enter(), an animation and not a gesture.
//
// What follows the sheet:
//   - what lies under it: transform and opacity. Its blur is either a veil laid over it (glass of fixed radius whose
//     strength is the opacity() of its backdrop-filter) or, in the 'filter' depth mode, its own filter: blur()
//     (lib/depth-mode.js says why the first is the default in Chromium);
//   - the handle's two halves: a rotation;
//   - the tab row is not touched here. It belongs to the root pages, and the player covers it as any page in front
//     does: onCover(f) tells how far up the sheet is (0 .. 1), and lib/chrome-cover.js puts the row as far behind.
//
// As in the page stack: what follows the sheet is moved by the entrance's own animations while it comes up and tied
// to the sheet's timeline once it is up (nobody is scrolling what lies under it then); and after the sheet has gone
// it stays where it is (off screen, taking no touches) until things are quiet. Only then is it unmounted and the ties
// taken off, so nothing changes under a finger that is by then scrolling the page again.
import * as React from 'react';
import '../lib/scroll-gesture.js';
import { whenQuiet } from '../lib/quiet';
import { getDriver } from '../lib/driver';
import { getDepthMode } from '../lib/depth-mode';
import { BACK, veilAt, veilKeyframes } from '../lib/depth-stack';
import { reduced, supportsTimeline, tapSwitch } from './platform';

const ScrollGesture = window.ScrollGesture;
const OVER = 0.1;                  // the commit point lies this far below the screen's edge
const MS = 620, EASE = 'cubic-bezier(.2,.86,.24,1)';
const BEND = 16;                   // degrees each half of the handle is turned to make the arrow
const STRAIGHT = '94%';            // timeline point (100% = at rest) from which the handle is a straight line
const BACK_T = `translateY(${BACK.y}%) scale(${BACK.s})`;
const glass = (o) => `blur(${BACK.blur}px) opacity(${o})`;
const glassFrame = (o) => ({ backdropFilter: glass(o), webkitBackdropFilter: glass(o) });
// what lies under, in focus and behind; blur: its own filter carries the blur (depth mode 'filter')
const underFrames = (blur) => [
  blur ? { transform: 'none', filter: 'none', opacity: 1 } : { transform: 'none', opacity: 1 },
  blur ? { transform: BACK_T, filter: `blur(${BACK.blur}px)`, opacity: BACK.o } : { transform: BACK_T, opacity: BACK.o },
];

let styled = false;
function styles() {
  if (styled) return;
  styled = true;
  const hold = (100 * OVER / (1 + OVER)).toFixed(2) + '%';
  // "At rest" is held from 99% on: at rest the sheet's timeline is one pixel short of its end (the gesture keeps it
  // there, so that these animations can run on the compositor), and everything must show exactly its resting state.
  const rest = '99%,100%';
  const st = document.createElement('style');
  st.setAttribute('data-player-sheet', '');
  st.textContent =
    `.app{--sh-t:${BACK_T};--sh-blur:${BACK.blur}px;--sh-o:${BACK.o}}` +
    // what lies under: with its own blur (depth mode 'filter'), and without (transform and opacity only)
    `@keyframes sh-f{0%,${hold}{transform:none;filter:none;opacity:1}${rest}{transform:var(--sh-t);filter:blur(var(--sh-blur));opacity:var(--sh-o)}}` +
    `@keyframes sh-g{0%,${hold}{transform:none;opacity:1}${rest}{transform:var(--sh-t);opacity:var(--sh-o)}}` +
    `.under.sh-back{transform:var(--sh-t);opacity:var(--sh-o)}.under.sh-back.sh-bf{filter:blur(var(--sh-blur))}` +
    // the veil over it
    veilKeyframes('sh-v', OVER) +
    // the handle's two halves: straight once the sheet has been pulled a little, bent into the arrow at rest
    `@keyframes sh-hl{0%,${STRAIGHT}{transform:none}${rest}{transform:rotate(${BEND}deg)}}` +
    `@keyframes sh-hr{0%,${STRAIGHT}{transform:none}${rest}{transform:rotate(-${BEND}deg)}}`;
  document.head.appendChild(st);
}

/**
 * open      whether the player should be showing
 * onClosed  called as soon as it has gone (swiped down, or closed from outside and done sliding)
 * under     ref to the element that lies under the sheet and recedes
 * veil      ref to an element that covers `under` and nothing else: the glass that puts it out of focus
 * onCover   called every frame with how far up the sheet is, 0 (gone) .. 1 (up): for what belongs to the screen it
 *           covers but is not in `under` (the tab row)
 */
export function PlayerSheet({ open, seq = 0, onClosed, under, veil, onCover, children }) {
  const [state, setState] = React.useState({ mounted: open, gen: 0 });
  const tidy = React.useRef(null);
  const latest = React.useRef(onClosed);
  latest.current = onClosed;
  const away = React.useRef(true);                              // no surface, or the one there is pulled down or leaving
  const opened = React.useRef(false);
  const newest = React.useRef(0);                               // the generation of the surface last asked for
  React.useEffect(() => {
    const was = opened.current;
    opened.current = open;
    if (!open) return;
    if (was && !away.current) return;                           // asked again while it is up: it stays
    if (tidy.current) { tidy.current.cancel(); tidy.current = null; }
    away.current = false;
    const gen = ++newest.current;
    setState({ mounted: true, gen });                           // a new surface, even if the last one is still sliding out
  }, [open, seq]);
  React.useEffect(() => () => { if (tidy.current) tidy.current.cancel(); }, []);
  if (!state.mounted) return null;
  // Only the newest surface may say the player has gone: one sliding out can come to rest just after a new one was
  // asked for, before it is in place, and would close the new one.
  const onGone = (gen) => {
    if (gen !== newest.current) return;
    if (latest.current) latest.current();
    tidy.current = whenQuiet(() => { tidy.current = null; setState((s) => ({ ...s, mounted: false })); });
  };
  return <Surface key={state.gen} open={open} under={under} veil={veil} onCover={onCover} onGone={() => onGone(state.gen)} onAway={(a) => { if (state.gen === newest.current) away.current = a; }}>{children}</Surface>;
}

function Surface({ open, onGone, onAway, under, veil, onCover, children }) {
  styles();
  const el = React.useRef(null);
  const body = React.useRef(null);
  const g = React.useRef(null);
  const handle = React.useRef(null);
  const left = React.useRef(false);
  const latest = React.useRef(onGone);
  latest.current = onGone;
  const coverTo = React.useRef(onCover);
  coverTo.current = onCover;
  const awayTo = React.useRef(onAway);
  awayTo.current = onAway;

  React.useLayoutEffect(() => {
    const u = under && under.current;
    const gesture = ScrollGesture(el.current, { driver: getDriver(), axis: 'y', sides: [1], cssVar: null, body: body.current, overshoot: OVER });
    g.current = gesture;
    const tied = supportsTimeline && !!gesture.timeline;
    const tie = (node, name) => { node.style.animation = name + ' linear both'; node.style.animationTimeline = gesture.timeline; };
    const depth = getDepthMode();
    const blur = depth === 'filter';                          // what lies under carries the blur itself
    const v = depth === 'veil' && veil ? veil.current : null; // or a veil over it does
    // how far up the sheet is, for what it covers outside `under` (0 .. 1); written only when it changes
    let shown = -1, coverRaf = 0;
    const cover = (f) => { f = Math.max(0, Math.min(1, f)); if (f !== shown) { shown = f; if (coverTo.current) coverTo.current(f); } };
    // While the sheet is coming up, nothing is tied to its timeline: what follows it is moved by animations on the
    // entrance's clock that hold their end, and tied once the entrance is over. (Chromium can run a scroll-driven
    // animation on the compositor only if it could start it there, and it cannot under another animation of the
    // same properties; having failed once it does not try again.)
    const clocks = [];
    const ties = [];                                          // [node, keyframes name]
    let entering = true;
    const entered = () => {
      if (!entering) return;
      entering = false;
      if (tied) ties.forEach(([node, name]) => tie(node, name));
      clocks.splice(0).forEach((c) => c.cancel());
      cancelAnimationFrame(coverRaf);                         // from here on, the sheet's own position tells
      if (!left.current) cover(1 - Math.min(1, (1 + OVER) * Math.max(0, gesture.p)));
    };

    // ---- what lies under is tied to the sheet from the start: it comes back into focus as the sheet is pulled down
    if (u) {
      u.classList.add('sh-back'); u.classList.toggle('sh-bf', blur);
      u.inert = true;
      ties.push([u, blur ? 'sh-f' : 'sh-g']);
    }
    const veilTo = (o) => { v.style.webkitBackdropFilter = glass(o); v.style.backdropFilter = glass(o); };
    if (v) { v.style.visibility = 'visible'; veilTo(1); ties.push([v, 'sh-v']); }

    // ---- the handle follows the sheet: by its scroll timeline, or else by a class set when the state changes
    const halves = handle.current.querySelectorAll('i');
    if (tied) halves.forEach((h, i) => tie(h, i ? 'sh-hr' : 'sh-hl'));
    let flat = false;

    const gone = () => {
      if (left.current) return;
      left.current = true;
      if (entering) entered();
      if (u && u.inert) u.inert = false;
      cover(0);                                               // what it covered is whole again at once
      el.current.inert = true;
      if (awayTo.current) awayTo.current(true);
      latest.current();
    };
    const offChange = gesture.on('change', (p) => {
      if (!tied && flat !== p > 0.03) { flat = p > 0.03; handle.current.classList.toggle('flat', flat); }
      if (entering && p > 0.02) entered();                   // the finger took the sheet while it was coming up
      // The page under it takes taps as soon as the sheet is pulled off the top (where it shows, past the panel: the
      // sheet's own box lets taps through, styles.css), not only once the sheet has gone.
      const off = !entering && (p > 0.02 || gesture.passing);
      if (u && !left.current && u.inert === off) u.inert = !off;
      if (awayTo.current && !left.current) awayTo.current(off);
      if (!entering && !left.current) cover(1 - Math.min(1, (1 + OVER) * Math.max(0, p)));
      if (tied || entering) return;
      const k = Math.min(1, (1 + OVER) * Math.max(0, p)), L = (from, to) => from + (to - from) * k;
      if (u) {
        u.style.transform = `translateY(${L(BACK.y, 0)}%) scale(${L(BACK.s, 1)})`;
        if (blur) u.style.filter = L(BACK.blur, 0) > 0.05 ? `blur(${L(BACK.blur, 0)}px)` : 'none';
        u.style.opacity = String(L(BACK.o, 1));
      }
      if (v) veilTo(veilAt(k));
    });
    const offSettle = gesture.on('settle', (side) => { if (side === 1) gone(); });
    // A sheet that has gone down out of sight and is then left alone has gone, whether or not its scroller reported
    // coming to rest: on a phone it can stop a pixel or two short of the end (sizes in fractions of a pixel) and never
    // say so. The app would then believe the player still up, and a tap on a track would only switch the track.
    let fingers = 0, idleT = 0;
    const lookLater = () => {
      clearTimeout(idleT);
      idleT = setTimeout(() => {
        if (left.current || entering || fingers || gesture.p < 0.9) return;
        if (gesture.p < 1) gesture.go(1);
        gone();
      }, 450);
    };
    const onTouch = (e) => { fingers = e.touches.length; if (!fingers) lookLater(); else clearTimeout(idleT); };
    ['touchstart', 'touchend', 'touchcancel'].forEach((t) => document.addEventListener(t, onTouch, { passive: true, capture: true }));
    const offIdle = gesture.on('change', lookLater);
    if (reduced()) { cover(1); entered(); }
    else {
      // they recede on the entrance's clock and hold their end until the ties take over
      const run = (node, frames, ms) => clocks.push(node.animate(frames, { duration: ms, easing: EASE, fill: 'forwards' }));
      if (u) run(u, underFrames(blur), MS);
      if (v) run(v, [glassFrame(0), glassFrame(1)], MS);
      // how far up it is, on the same clock, frame by frame
      const clock = clocks[0], t0 = performance.now();
      const step = () => {
        if (!entering) return;
        const t = clock && clock.effect ? clock.effect.getComputedTiming() : null;
        cover(t && t.progress != null ? t.progress : Math.min(1, (performance.now() - t0) / MS));
        coverRaf = requestAnimationFrame(step);
      };
      step();
      gesture.enter(1, { duration: MS, easing: EASE, travel: 1 / (1 + OVER) }).then(entered);
    }
    const onKey = (e) => { if (e.key === 'Escape' && !left.current) gesture.go(1); };
    document.addEventListener('keydown', onKey);
    return () => {
      offChange(); offSettle(); offIdle();
      clearTimeout(idleT);
      ['touchstart', 'touchend', 'touchcancel'].forEach((t) => document.removeEventListener(t, onTouch, { passive: true, capture: true }));
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(coverRaf);
      cover(0);
      entering = false;
      clocks.splice(0).forEach((c) => c.cancel());
      gesture.destroy();
      g.current = null;
      const untie = (node, props) => props.forEach((k) => node.style.removeProperty(k));
      if (u) { untie(u, ['animation', 'animation-timeline', 'transform', 'filter', 'opacity']); u.classList.remove('sh-back', 'sh-bf'); if (u.inert) u.inert = false; }
      if (v) untie(v, ['animation', 'animation-timeline', 'visibility', '-webkit-backdrop-filter', 'backdrop-filter']);
    };
  }, []);                                                        // eslint-disable-line react-hooks/exhaustive-deps

  // closed from outside: slide down first; it is unmounted later, like after a swipe
  React.useEffect(() => {
    if (open || !g.current || left.current) return;
    if (reduced()) {
      left.current = true;
      if (under && under.current && under.current.inert) under.current.inert = false;
      if (coverTo.current) coverTo.current(0);
      latest.current();
    } else g.current.go(1);
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
