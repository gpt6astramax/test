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
// Three things follow the sheet, each in the way that keeps it on the compositor and keeps glass working:
//   - what lies under it: transform and opacity. Its blur is either a veil laid over it (glass of fixed radius whose
//     strength is the opacity() of its backdrop-filter) or, in the 'filter' depth mode, its own filter: blur()
//     (lib/depth-mode.js says why the first is the default in Chromium);
//   - the floating chrome (the tab row): by default nothing at all is done to it. It stays where it is, in front of
//     the player ('top'), and its glass goes on blurring what passes behind it, exactly as in front of a pushed page;
//     or the veil lies over it ('cover'). The ways that did something to it are still here to compare with: they
//     moved it, dimmed it, or switched its glass off while the player was up, and that last one is what showed as
//     the row having no blur for a moment after the player had gone. In the ways that do move it, it leaves by a transform, never by opacity (glass stops blurring as soon
//     as anything it sits in has an opacity below 1, an opacity animation or a filter); 'fade' dims the row's own
//     parts instead, the glass through opacity() in its backdrop-filter. It is given back the moment the sheet has gone;
//   - the handle's two halves: a rotation.
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

// The ways the chrome leaves. `ret`: it starts to return once the sheet has been pulled this far down. `ms`: how
// long leaving takes, as a share of the sheet's entrance. What it moves by is measured when the sheet opens.
const AWAY = {
  sink: { ret: 0.35, ms: 0.55 },   // down, out of the screen
  rise: { ret: 0, ms: 1 },         // up by one screen: it rides on the sheet's top edge, at the sheet's speed
  left: { ret: 0.35, ms: 0.55 },   // out to the left
  fade: { ret: 0.35, ms: 0.45 },   // in place: its parts dim, its glass thins (never the opacity of the row itself)
};

let styled = false;
function styles() {
  if (styled) return;
  styled = true;
  const hold = (100 * OVER / (1 + OVER)).toFixed(2) + '%';
  const late = (ret) => (100 * (1 - ret / (1 + OVER))).toFixed(2) + '%';
  // "At rest" is held from 99% on: at rest the sheet's timeline is one pixel short of its end (the gesture keeps it
  // there, so that these animations can run on the compositor), and everything must show exactly its resting state.
  const rest = '99%,100%';
  // --chrome-o: how present the chrome's parts are (1 .. 0). A registered number (styles.css registers it with
  // @property; this is for a browser that only has the script way), so it can be animated.
  if (typeof CSS !== 'undefined' && CSS.registerProperty) {
    try { CSS.registerProperty({ name: '--chrome-o', syntax: '<number>', inherits: true, initialValue: '1' }); } catch (e) { /* registered already */ }
  }
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
    // the chrome: by a transform (--sh-x / --sh-y are measured when the sheet opens), or by dimming its parts
    `@keyframes sh-c-sink{0%,${hold}{transform:none}${late(AWAY.sink.ret)},100%{transform:translate(var(--sh-x,0px),var(--sh-y,0px))}}` +
    `@keyframes sh-c-left{0%,${hold}{transform:none}${late(AWAY.left.ret)},100%{transform:translate(var(--sh-x,0px),var(--sh-y,0px))}}` +
    `@keyframes sh-c-rise{0%,${hold}{transform:none}${rest}{transform:translate(var(--sh-x,0px),var(--sh-y,0px))}}` +
    `@keyframes sh-c-fade{0%,${hold}{--chrome-o:1}${late(AWAY.fade.ret)},100%{--chrome-o:0}}` +
    // the chrome stays, its own blur is off
    `.sh-noglass .dtb-haze{display:none}` +
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
 * aside     ref to the floating chrome
 * asideMode what it does while the player is up: 'cover' | 'top' (nothing at all is done to it: under the veil, or in
 *           front of the player), 'sink' | 'rise' | 'left' | 'fade' (it is outside `under` and leaves),
 *           'noglass' (inside `under`, its own blur off meanwhile), 'asis' (inside `under`, left alone)
 */
export function PlayerSheet({ open, onClosed, under, veil, aside, asideMode = 'top', children }) {
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
  return <Surface key={state.gen} open={open} under={under} veil={veil} aside={aside} asideMode={asideMode} onGone={onGone}>{children}</Surface>;
}

function Surface({ open, onGone, under, veil, aside, asideMode, children }) {
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
    const tie = (node, name) => { node.style.animation = name + ' linear both'; node.style.animationTimeline = gesture.timeline; };
    // 'cover' hides the tab row under the veil, so there it is a veil whatever the depth setting says
    const depth = asideMode === 'cover' ? 'veil' : getDepthMode();
    const blur = depth === 'filter';                          // what lies under carries the blur itself
    const v = depth === 'veil' && veil ? veil.current : null; // or a veil over it does
    const chrome = aside && aside.current;
    const away = AWAY[asideMode];                             // set when the chrome leaves; then `a` is the chrome
    const a = away ? chrome : null;
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
    };

    // ---- the chrome: where it goes is measured now, in px (a transform is all that may touch it)
    let ax = 0, ay = 0;
    const chromeAt = (f) => {                                 // f: how far away, 0 .. 1
      if (asideMode === 'fade') a.style.setProperty('--chrome-o', String(1 - f));
      else a.style.transform = f ? `translate(${(ax * f).toFixed(1)}px, ${(ay * f).toFixed(1)}px)` : 'none';
    };
    if (a) {
      const r = a.getBoundingClientRect(), frame = el.current.getBoundingClientRect();
      if (asideMode === 'sink') ay = frame.bottom - r.top + 16;
      if (asideMode === 'rise') ay = -frame.height;
      if (asideMode === 'left') ax = -(r.right - frame.left + 16);
      a.inert = true;
      a.style.setProperty('--sh-x', ax + 'px'); a.style.setProperty('--sh-y', ay + 'px');
      chromeAt(1);                                            // where it is while the player is up; a tie overrides this
      ties.push([a, 'sh-c-' + asideMode]);
    }
    // (taken off again only with the ties below: until then what the chrome sits in still has an opacity animation)
    if (chrome && asideMode === 'noglass') chrome.classList.add('sh-noglass');

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

    // The row is given back the moment the sheet has gone: the animation that tied it to the sheet and the styles that
    // placed it come off at once. (What lies under waits until things are quiet, because a finger may be scrolling a
    // page in it; the row is neither scrolled nor an ancestor of anything that is.) The less time anything is attached
    // to the row, the better: on a real device its glass has been seen to drop out for a moment around this point.
    let rowFreed = false;
    const freeRow = () => {
      if (!a || rowFreed) return;
      rowFreed = true;
      ['animation', 'animation-timeline', 'transform', '--chrome-o', '--sh-x', '--sh-y'].forEach((k) => a.style.removeProperty(k));
      if (a.inert) a.inert = false;
    };
    const gone = () => {
      if (left.current) return;
      left.current = true;
      if (entering) entered();
      if (u && u.inert) u.inert = false;
      freeRow();
      el.current.inert = true;
      latest.current();
    };
    const offChange = gesture.on('change', (p) => {
      if (!tied && flat !== p > 0.03) { flat = p > 0.03; handle.current.classList.toggle('flat', flat); }
      if (entering && p > 0.02) entered();                   // the finger took the sheet while it was coming up
      if (gesture.passing) { if (u && u.inert) u.inert = false; if (a && a.inert) a.inert = false; }
      if (tied || entering) return;
      const k = Math.min(1, (1 + OVER) * Math.max(0, p)), L = (from, to) => from + (to - from) * k;
      if (u) {
        u.style.transform = `translateY(${L(BACK.y, 0)}%) scale(${L(BACK.s, 1)})`;
        if (blur) u.style.filter = L(BACK.blur, 0) > 0.05 ? `blur(${L(BACK.blur, 0)}px)` : 'none';
        u.style.opacity = String(L(BACK.o, 1));
      }
      if (v) veilTo(veilAt(k));
      if (a && !rowFreed) chromeAt(1 - Math.max(0, Math.min(1, (k - away.ret) / (1 - away.ret))));
    });
    const offSettle = gesture.on('settle', (side) => { if (side === 1) gone(); });
    if (reduced()) entered();
    else {
      // they recede on the entrance's clock and hold their end until the ties take over
      const run = (node, frames, ms) => clocks.push(node.animate(frames, { duration: ms, easing: EASE, fill: 'forwards' }));
      if (u) run(u, underFrames(blur), MS);
      if (v) run(v, [glassFrame(0), glassFrame(1)], MS);
      if (a) run(a, asideMode === 'fade' ? [{ '--chrome-o': 1 }, { '--chrome-o': 0 }] : [{ transform: 'none' }, { transform: `translate(${ax}px, ${ay}px)` }], MS * away.ms);
      gesture.enter(1, { duration: MS, easing: EASE, travel: 1 / (1 + OVER) }).then(entered);
    }
    const onKey = (e) => { if (e.key === 'Escape' && !left.current) gesture.go(1); };
    document.addEventListener('keydown', onKey);
    // 'cover': the row lies under the veil and under the sheet, so no touch reaches it; the keyboard is kept off it
    // from here, without touching the row (no inert, no attribute): focus that lands on it is let go again
    const offRow = asideMode === 'cover' && chrome ? (e) => { if (!left.current && chrome.contains(e.target)) e.target.blur(); } : null;
    if (offRow) document.addEventListener('focusin', offRow);
    return () => {
      offChange(); offSettle();
      document.removeEventListener('keydown', onKey);
      if (offRow) document.removeEventListener('focusin', offRow);
      entering = false;
      clocks.splice(0).forEach((c) => c.cancel());
      gesture.destroy();
      g.current = null;
      const untie = (node, props) => props.forEach((k) => node.style.removeProperty(k));
      if (u) { untie(u, ['animation', 'animation-timeline', 'transform', 'filter', 'opacity']); u.classList.remove('sh-back', 'sh-bf'); if (u.inert) u.inert = false; }
      if (v) untie(v, ['animation', 'animation-timeline', 'visibility', '-webkit-backdrop-filter', 'backdrop-filter']);
      freeRow();
      // (only where it was put on: classList.remove() of a class that is not there still writes the attribute)
      if (chrome && asideMode === 'noglass') chrome.classList.remove('sh-noglass');
    };
  }, []);                                                        // eslint-disable-line react-hooks/exhaustive-deps

  // closed from outside: slide down first; it is unmounted later, like after a swipe
  React.useEffect(() => {
    if (open || !g.current || left.current) return;
    if (reduced()) {
      left.current = true;
      if (under && under.current && under.current.inert) under.current.inert = false;
      if (aside && aside.current && aside.current.inert) aside.current.inert = false;   // (only if it was set: an untouched row stays untouched)
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
