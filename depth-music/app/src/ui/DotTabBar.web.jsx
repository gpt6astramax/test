// DotTabBar: the bottom tab row. Bare icons, the current one in full ink with a dot under it, over a capsule of blur
// with no fill, border or shadow of its own: the row's own box with round ends, blurred evenly up to its edge.
// (feather: the blur clears gradually in every direction instead, so the capsule has no edge at all.)
//
//   <DotTabBar
//     tabs={[{ key: 'home', label: '发现', icon: <Icon name="compass" size={25} /> }, …]}
//     index={tab}
//     onChange={(i) => setTab(i)}          // on touch down and while dragging: every tab the dot passes
//     onReselect={(i) => popToRoot(i)}     // a tap on the tab that is already current
//   />
//
// - The whole row is one <label> around a hidden switch: on iPhone a tap anywhere on it plays the system tick (the
//   only haptic a web page gets there). Android ticks through the vibration API on every tab passed.
// - The dot is the glider (./glider.js): it springs to a tapped tab and trails a finger dragged along the row. Held, it
//   is pulled into a flat ellipse; moving, it stretches along its path the faster it goes.
// - Self-contained: it brings its own CSS. Colours come from CSS variables with fallbacks, so it follows a theme:
//     --dtb-fg (current icon and dot, default var(--fg) or #111), --dtb-muted (other icons), --dtb-blur (default 18px)
// - Glass and opacity do not mix: the blur stops working as soon as the row, or anything it sits in, has an opacity
//   below 1, an opacity animation (even one that stays at 1), will-change: opacity or a filter (measured: the table
//   in DESIGN.md, and static/glass-test.html to look at on a device). So: move the row with transforms only. To
//   fade it, set --dtb-o (1 .. 0) on it or on an ancestor: the icons and the dot dim, and the glass thins through
//   opacity() inside its backdrop-filter.
// - It belongs to the root pages. A page that comes over it (a pushed page, a full-screen sheet) covers it where it
//   is: coverDotTabBar(bar, f) below. The row never moves for that, and the page gets no glass of its own.
// - Put it in a positioned container at the bottom of the screen. Props: height (default 52), haze (default true),
//   feather (default false; with it, leave ~26 px below the row so the blur can clear before the screen's edge),
//   style, className.
import * as React from 'react';
import { attachGlider } from './glider';
import { tapSwitch } from './platform';

const CSS = `
.dtb{position:relative;display:flex;touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.dtb-item{position:relative;flex:1;display:grid;place-items:center;pointer-events:none;color:var(--dtb-muted,var(--fg3,rgb(17 18 20/.36)));opacity:var(--dtb-o,1);transition:color .2s}
.dtb-item[data-on]{color:var(--dtb-fg,var(--fg,#111214))}
.dtb-item:focus-visible{outline:2px solid currentColor;outline-offset:-6px;border-radius:12px}
.dtb-ink{position:absolute;left:0;bottom:-3px;height:6px;pointer-events:none;will-change:transform;opacity:var(--dtb-o,1)}
.dtb-ink::after{content:"";position:absolute;left:50%;top:0;width:6px;height:6px;margin-left:-3px;border-radius:50%;
  background:var(--dtb-fg,var(--fg,#111214));transform:scale(var(--sx,1),var(--sy,1))}
.dtb-switch{position:absolute;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
/* the haze: only blur, the row's own box with round ends. It keeps a layer of its own (translateZ), so that layers
   coming and going behind it do not have it rebuilt, which on iOS shows as the blur dropping out for a frame. */
.dtb-haze{position:absolute;z-index:-1;inset:0;border-radius:999px;pointer-events:none;transform:translateZ(0);
  -webkit-backdrop-filter:blur(var(--dtb-blur,18px)) opacity(var(--dtb-o,1));backdrop-filter:blur(var(--dtb-blur,18px)) opacity(var(--dtb-o,1))}
/* feathered: a slim capsule centred on the icons is fully blurred; from there it clears in every direction (two half
   discs for the ends, a band between them) */
.dtb-haze.dtb-feather{inset:auto;left:-16px;right:-16px;top:50%;height:100px;margin-top:-50px;border-radius:0;
  --dtb-m:radial-gradient(circle 50px at 100% 50%,#000 22px,rgb(0 0 0/.45) 35px,transparent 50px) left center/50px 100% no-repeat,
          radial-gradient(circle 50px at 0 50%,#000 22px,rgb(0 0 0/.45) 35px,transparent 50px) right center/50px 100% no-repeat,
          linear-gradient(to bottom,transparent 0,rgb(0 0 0/.45) 15px,#000 28px,#000 calc(100% - 28px),rgb(0 0 0/.45) calc(100% - 15px),transparent 100%) center/calc(100% - 100px) 100% no-repeat;
  -webkit-mask:var(--dtb-m);mask:var(--dtb-m)}
`;
let injected = false;
function inject() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const st = document.createElement('style');
  st.setAttribute('data-dot-tab-bar', '');
  st.textContent = CSS;
  document.head.appendChild(st);
}

export function DotTabBar({ tabs, index = 0, onChange, onReselect, height = 52, haze = true, feather = false, style, className }) {
  inject();
  const bar = React.useRef(null);
  const glider = React.useRef(null);
  const latest = React.useRef({ onChange, onReselect });
  latest.current = { onChange, onReselect };

  React.useLayoutEffect(() => {
    const g = attachGlider(bar.current, {
      index, inset: 0, dot: true,
      onSelect: (i) => latest.current.onChange && latest.current.onChange(i),
      onReselect: (i) => latest.current.onReselect && latest.current.onReselect(i),
    });
    glider.current = g;
    return () => g.destroy();
  }, [tabs.length]);                                              // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (glider.current) glider.current.set(index); }, [index]);

  return (
    <label ref={bar} className={'dtb' + (className ? ' ' + className : '')} role="tablist" style={{ height, ...style }}>
      {tapSwitch ? <input type="checkbox" switch="" className="dtb-switch" aria-hidden="true" /> : null}
      {haze ? <i className={'dtb-haze' + (feather ? ' dtb-feather' : '')} aria-hidden="true" /> : null}
      <i className="dtb-ink" data-gl-ink="" aria-hidden="true" />
      {tabs.map((t) => (
        <span key={t.key} className="dtb-item" data-gl-item="" role="tab" tabIndex={0} aria-label={t.label}>
          {t.icon}
        </span>
      ))}
    </label>
  );
}

// ---- covered by the page in front
// f: how far behind the root page the row belongs to is. 0 = in front (as always), 1 = right behind the page in front,
// 2 = two pages back. The row goes as far out of focus, in place:
//   icons and dot   blur and fade exactly as the page behind does (20 px and .5 at 1; 40 px and 0 at 2); blur: false
//                   leaves them sharp (a depth that only fades)
//   capsule         its own blur turned down, as the cube of how present the row is: it never shows as a sharp-edged
//                   frosted capsule over a page that is out of focus, and it forms together with the icons on the way
//                   back. It stays a backdrop-filter all along (blur(0px) at the far end), so the glass is never
//                   rebuilt on the way back
// Only these leaves are written to, by plain values: nothing the capsule sits in, and no animation, because glass
// stops blurring as soon as anything it sits in has an opacity below 1, a filter, or an animation of either. At 0
// every value written is taken off again, and the row is exactly what the stylesheet makes it.
const DEPTH = [{ b: 0, o: 1 }, { b: 20, o: 0.5 }, { b: 40, o: 0 }];
export function coverDotTabBar(bar, f, { blur = true } = {}) {
  if (!bar) return;
  f = Math.max(0, Math.min(2, +f || 0));
  const st = bar.dtbCover || (bar.dtbCover = { f: 0, r: 18 });
  // nothing is written when nothing has changed (a value written again still counts as a change)
  if (f === st.f || (Math.abs(f - st.f) < 0.002 && f !== 0 && f !== 1 && f !== 2)) return;
  const leaves = bar.querySelectorAll('.dtb-item, .dtb-ink'), haze = bar.querySelector('.dtb-haze');
  if (f === 0) {
    st.f = 0;
    leaves.forEach((n) => { n.style.removeProperty('filter'); n.style.removeProperty('opacity'); });
    if (haze) { haze.style.removeProperty('-webkit-backdrop-filter'); haze.style.removeProperty('backdrop-filter'); }
    return;
  }
  if (st.f === 0 && haze) {                                       // the capsule's own blur, as the stylesheet has it
    const cs = getComputedStyle(haze), m = /blur\(([\d.]+)px\)/.exec(cs.backdropFilter || cs.webkitBackdropFilter || '');
    st.r = m ? +m[1] : 18;
  }
  st.f = f;
  const i = Math.min(1, Math.floor(f)), t = f - i, a = DEPTH[i], b = DEPTH[i + 1];
  const px = blur ? a.b + (b.b - a.b) * t : 0, op = a.o + (b.o - a.o) * t;
  leaves.forEach((n) => { n.style.filter = px > 0.05 ? `blur(${px.toFixed(2)}px)` : 'none'; n.style.opacity = String(+op.toFixed(3)); });
  if (haze) {
    const g = `blur(${(st.r * Math.pow(1 - Math.min(1, f), 3)).toFixed(2)}px)`;
    haze.style.webkitBackdropFilter = g; haze.style.backdropFilter = g;
  }
}

export default DotTabBar;
