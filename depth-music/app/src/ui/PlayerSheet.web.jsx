// The player. Unlike every other page it comes up from below, over whatever is on screen, and goes away with a swipe
// down. Once up it is a page like any other: it fills the screen to the top, square-cornered, with a floating round
// button to put it away, and like any other page it has no ground of its own. It is only its content; what was on
// screen before stays behind it, smaller, lower, out of focus and faint, exactly as a page does behind the next one. It is a vertical ScrollGesture (sides [1]): with the 'scroll' driver dragging it is native
// scrolling, so it follows the finger and snaps like a system sheet. It comes in with enter(), an animation and not
// a gesture. What lies under it drops back out of focus, tied to the sheet's own scroll timeline.
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
import { Icon } from './Icon';

const ScrollGesture = window.ScrollGesture;
const OVER = 0.1;                  // the commit point lies this far below the screen's edge
const MS = 620, EASE = 'cubic-bezier(.2,.86,.24,1)';
const FRONT_FRAME = { transform: 'none', filter: 'blur(0px)', opacity: 1 };
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
    `@keyframes sh-f{0%,${hold}{transform:none;filter:blur(0px);opacity:1}100%{transform:var(--sh-t);filter:blur(var(--sh-blur));opacity:var(--sh-o)}}`;
  document.head.appendChild(st);
}

/**
 * open      whether the player should be showing
 * onClosed  called as soon as it has gone (swiped down, or closed from outside and done sliding)
 * under     ref to the element that lies under the sheet and recedes
 */
export function PlayerSheet({ open, onClosed, under, children }) {
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
  return <Surface key={state.gen} open={open} under={under} onGone={onGone}>{children}</Surface>;
}

function Surface({ open, onGone, under, children }) {
  styles();
  const el = React.useRef(null);
  const body = React.useRef(null);
  const g = React.useRef(null);
  const left = React.useRef(false);
  const latest = React.useRef(onGone);
  latest.current = onGone;

  React.useLayoutEffect(() => {
    const u = under && under.current;
    const gesture = ScrollGesture(el.current, { driver: getDriver(), axis: 'y', sides: [1], cssVar: null, body: body.current, overshoot: OVER });
    g.current = gesture;
    const tied = supportsTimeline && !!gesture.timeline;
    let clock = null;
    // What lies under is tied to the sheet from the start: it comes back into focus as the sheet is pulled down.
    if (u) {
      u.classList.add('sh-back');
      u.inert = true;
      if (tied) { u.style.animation = 'sh-f linear both'; u.style.animationTimeline = gesture.timeline; }
    }
    const gone = () => {
      if (left.current) return;
      left.current = true;
      if (u) u.inert = false;
      el.current.inert = true;
      latest.current();
    };
    const offChange = gesture.on('change', (p) => {
      if (!u) return;
      if (clock && p > 0.02) { clock.cancel(); clock = null; }       // the finger took the sheet while it was coming up
      if (gesture.passing && u.inert) u.inert = false;
      if (tied || clock) return;
      const k = Math.min(1, (1 + OVER) * Math.max(0, p)), L = (a, b) => a + (b - a) * k;
      u.style.transform = `translateY(${L(BACK.y, 0)}%) scale(${L(BACK.s, 1)})`;
      u.style.filter = `blur(${L(BACK.blur, 0)}px)`;
      u.style.opacity = String(L(BACK.o, 1));
    });
    const offSettle = gesture.on('settle', (side) => { if (side === 1) gone(); });
    if (!reduced()) {
      // it recedes on the entrance's clock, by an animation laid over the tie; it runs out by itself
      if (u) { clock = u.animate([FRONT_FRAME, BACK_FRAME], { duration: MS, easing: EASE }); clock.onfinish = () => { clock = null; }; }
      gesture.enter(1, { duration: MS, easing: EASE, travel: 1 / (1 + OVER) });
    }
    const onKey = (e) => { if (e.key === 'Escape' && !left.current) gesture.go(1); };
    document.addEventListener('keydown', onKey);
    return () => {
      offChange(); offSettle();
      document.removeEventListener('keydown', onKey);
      if (clock) clock.cancel();
      gesture.destroy();
      g.current = null;
      if (u) {
        ['animation', 'animation-timeline', 'transform', 'filter', 'opacity'].forEach((k) => u.style.removeProperty(k));
        u.classList.remove('sh-back');
        u.inert = false;
      }
    };
  }, []);                                                        // eslint-disable-line react-hooks/exhaustive-deps

  // closed from outside: slide down first; it is unmounted later, like after a swipe
  React.useEffect(() => {
    if (open || !g.current || left.current) return;
    if (reduced()) { left.current = true; if (under && under.current) under.current.inert = false; latest.current(); }
    else g.current.go(1);
  }, [open]);                                                    // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { if (g.current && !left.current) g.current.go(1); };
  return (
    <div ref={el} className="sheet" role="dialog" aria-label="播放器">
      <div ref={body}>
        <div className="sheet-panel">
          <div className="nav">
            <label className="tap glass" role="button" tabIndex={0} aria-label="收起播放器"
              onClick={(e) => { if (!(e.target.matches && e.target.matches('.hsw'))) close(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } }}>
              {tapSwitch ? <input type="checkbox" switch="" className="hsw" aria-hidden="true" /> : null}
              <Icon name="down1" size={22} />
            </label>
          </div>
          <div className="sheet-scroll">
            <div className="sheet-in">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerSheet;
