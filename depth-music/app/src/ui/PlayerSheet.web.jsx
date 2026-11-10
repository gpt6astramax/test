// The player. Unlike every other page it comes up from below, over whatever is on screen, and goes away with a swipe
// down. It is a vertical ScrollGesture (sides [1]): dragging it is native scrolling, so it follows the finger and snaps
// like a system sheet. It comes in with enter(), an animation and not a scroll. What lies under it drops back out of
// focus on the sheet's own scroll timeline.
import * as React from 'react';
import '../lib/scroll-gesture.js';
import { reduced, supportsTimeline } from './platform';

const ScrollGesture = window.ScrollGesture;
const OVER = 0.1;                  // the commit point lies this far below the screen's edge
const MS = 620, EASE = 'cubic-bezier(.2,.86,.24,1)';
const BACK = { s: 0.92, y: 1.2, blur: 14, o: 0.45 };

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
 * onClosed  called once it is gone (swiped down, or closed from outside and done sliding)
 * under     ref to the element that lies under the sheet and recedes
 */
export function PlayerSheet({ open, onClosed, under, children }) {
  const [mounted, setMounted] = React.useState(open);
  React.useEffect(() => { if (open) setMounted(true); }, [open]);
  if (!mounted) return null;
  return <Surface open={open} under={under} onGone={() => { setMounted(false); onClosed && onClosed(); }}>{children}</Surface>;
}

function Surface({ open, onGone, under, children }) {
  styles();
  const el = React.useRef(null);
  const body = React.useRef(null);
  const g = React.useRef(null);
  const latest = React.useRef(onGone);
  latest.current = onGone;

  React.useLayoutEffect(() => {
    const u = under && under.current;
    const gesture = ScrollGesture(el.current, { axis: 'y', sides: [1], cssVar: null, body: body.current, overshoot: OVER });
    g.current = gesture;
    const clear = () => { if (u) { ['animation', 'animation-timeline', 'transform', 'filter', 'opacity'].forEach((k) => u.style.removeProperty(k)); } };
    // at rest under the sheet: tied to the sheet's scroll, so it comes back into focus as the sheet is pulled down
    const follow = () => {
      if (!u) return;
      clear();
      u.classList.add('sh-back');
      u.inert = true;
      if (supportsTimeline) { u.style.animation = 'sh-f linear both'; u.style.animationTimeline = gesture.timeline; }
    };
    const offChange = gesture.on('change', (p) => {
      if (!u || supportsTimeline || gesture.entering) return;
      const k = Math.min(1, (1 + OVER) * Math.max(0, p)), L = (a, b) => a + (b - a) * k;
      u.style.transform = `translateY(${L(BACK.y, 0)}%) scale(${L(BACK.s, 1)})`;
      u.style.filter = `blur(${L(BACK.blur, 0)}px)`;
      u.style.opacity = String(L(BACK.o, 1));
    });
    const offSettle = gesture.on('settle', (side) => { if (side === 1) latest.current(); });
    if (reduced()) follow();
    else {
      if (u) { u.classList.add('sh-back'); u.inert = true; u.style.animation = `sh-r ${MS}ms ${EASE} both`; }
      gesture.enter(1, { duration: MS, easing: EASE, travel: 1 / (1 + OVER) }).then((arrived) => { if (arrived) follow(); });
    }
    const onKey = (e) => { if (e.key === 'Escape') gesture.go(1); };
    document.addEventListener('keydown', onKey);
    return () => {
      offChange(); offSettle();
      document.removeEventListener('keydown', onKey);
      gesture.destroy();
      g.current = null;
      if (u) { clear(); u.classList.remove('sh-back'); u.inert = false; }
    };
  }, []);                                                        // eslint-disable-line react-hooks/exhaustive-deps

  // closed from outside: slide down first, then unmount
  React.useEffect(() => {
    if (open || !g.current) return;
    if (reduced()) latest.current(); else g.current.go(1);
  }, [open]);

  return (
    <div ref={el} className="sheet" role="dialog" aria-label="播放器">
      <div ref={body}>
        <div className="sheet-panel">
          <div className="sheet-grab" onClick={() => g.current && g.current.go(1)} role="button" aria-label="收起播放器" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.current && g.current.go(1); } }} />
          <div className="sheet-scroll">
            <div className="sheet-in">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlayerSheet;
