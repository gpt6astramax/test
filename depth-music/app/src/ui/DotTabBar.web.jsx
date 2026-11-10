// DotTabBar: the bottom tab row. Bare icons, the current one in full ink with a dot under it, over a slim capsule of
// blur that clears in every direction and has no edge, fill, border or shadow of its own.
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
// - Put it in a positioned container at the bottom of the screen; leave ~26 px below it so the blur can clear before
//   the edge. Props: height (default 52), haze (default true), style, className.
import * as React from 'react';
import { attachGlider } from './glider';
import { tapSwitch } from './platform';

const CSS = `
.dtb{position:relative;display:flex;touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.dtb-item{position:relative;flex:1;display:grid;place-items:center;pointer-events:none;color:var(--dtb-muted,var(--fg3,rgb(17 18 20/.36)));transition:color .2s}
.dtb-item[data-on]{color:var(--dtb-fg,var(--fg,#111214))}
.dtb-item:focus-visible{outline:2px solid currentColor;outline-offset:-6px;border-radius:12px}
.dtb-ink{position:absolute;left:0;bottom:-3px;height:6px;pointer-events:none;will-change:transform}
.dtb-ink::after{content:"";position:absolute;left:50%;top:0;width:6px;height:6px;margin-left:-3px;border-radius:50%;
  background:var(--dtb-fg,var(--fg,#111214));transform:scale(var(--sx,1),var(--sy,1))}
.dtb-switch{position:absolute;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
/* the haze: only blur. A slim capsule centred on the icons is fully blurred; from there it clears in every direction
   (two half discs for the ends, a band between them). */
.dtb-haze{position:absolute;z-index:-1;left:-16px;right:-16px;top:50%;height:100px;margin-top:-50px;pointer-events:none;
  -webkit-backdrop-filter:blur(var(--dtb-blur,18px));backdrop-filter:blur(var(--dtb-blur,18px));
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

export function DotTabBar({ tabs, index = 0, onChange, onReselect, height = 52, haze = true, style, className }) {
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
      {haze ? <i className="dtb-haze" aria-hidden="true" /> : null}
      <i className="dtb-ink" data-gl-ink="" aria-hidden="true" />
      {tabs.map((t) => (
        <span key={t.key} className="dtb-item" data-gl-item="" role="tab" tabIndex={0} aria-label={t.label}>
          {t.icon}
        </span>
      ))}
    </label>
  );
}

export default DotTabBar;
