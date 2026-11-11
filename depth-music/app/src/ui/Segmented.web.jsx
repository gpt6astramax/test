// Segmented: choose one of a few. The tab row at the bottom of the app is one too: the same control in another look.
// Segmented.jsx is the iOS / Android twin, with the same props.
//
//   <Segmented items={['WAV', 'MP3']} index={i} onChange={setI} label="下载格式" />
//   <Segmented look="tabs" items={[{ key: 'home', label: '发现', icon: <Icon name="compass" size={25} /> }, …]}
//     index={tab} onChange={setTab} onReselect={popToRoot} />
//
//   items       strings, or { key, label, icon } (with an icon, the label names it for screen readers)
//   index       the chosen item; onChange(i) on every item the finger passes (where it lands, and while dragging);
//               onReselect(i) for a tap on the item already chosen
//   look        'pill' (default): a pill behind the chosen item, on a faint track. The items are as wide as the
//                 widest, and the control as wide as they are, unless it is given a width.
//               'tabs': a dot under the chosen item, on a capsule of blur with no fill, border or shadow (the app's
//                 tab row). The items share the width it is given; by default the whole width.
//   height      the one size: padding, text, pill and dot follow it (default 34 for 'pill', 52 for 'tabs')
//   label, style, className
//
// The same in both looks (./glider.js): the ink is moved by a spring, never set in place. A tap pulls it to the item;
// press and drag and it trails the finger, choosing every item it passes. Held, it squashes (the dot into a flat
// ellipse); moving, it stretches with its speed. Every item chosen ticks: on iPhone through an invisible native switch
// over the whole control (a tap, and every item a drag passes), on Android through the vibration API.
//
// Colours are CSS variables with fallbacks, so it follows a theme: --sgm-fg (chosen item, dot), --sgm-muted (the
// others), --sgm-track ('pill' track), --sgm-pill ('pill' pill), --sgm-blur ('tabs' capsule, default 18px).
// Glass and opacity do not mix: the capsule stops blurring as soon as the control, or anything it sits in, has an
// opacity below 1, an opacity animation, will-change: opacity or a filter (DESIGN.md). Move it with transforms only;
// to cover it, write on its leaves (.sgm-item, .sgm-ink, .sgm-haze) as lib/chrome-cover.js does.
import * as React from 'react';
import { attachGlider } from './glider';
import { tapSwitch } from './platform';

const CSS = `
.sgm{--h:34px;position:relative;box-sizing:border-box;height:var(--h);display:inline-grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);
  touch-action:none;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;vertical-align:middle}
.sgm-item{position:relative;display:grid;place-items:center;min-width:0;pointer-events:none;white-space:nowrap;transition:color .2s}
.sgm-item:focus-visible{outline:2px solid currentColor;outline-offset:-6px;border-radius:12px}
.sgm-ink{position:absolute;left:0;pointer-events:none;will-change:transform}
.sgm-switch{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;opacity:0;-webkit-user-select:none;user-select:none}

.sgm-pill{padding:calc(var(--h) * .09);border-radius:999px;background:var(--sgm-track,var(--fill,rgb(17 18 20/.05)))}
.sgm-pill .sgm-item{padding:0 calc(var(--h) * .41);font:400 calc(var(--h) * .38)/1 var(--text,system-ui,sans-serif);font-variant-numeric:tabular-nums;
  color:var(--sgm-muted,var(--fg2,rgb(17 18 20/.62)))}
.sgm-pill .sgm-item[data-on]{color:var(--sgm-fg,var(--fg,#111214))}
.sgm-pill .sgm-ink{top:calc(var(--h) * .09);bottom:calc(var(--h) * .09);left:calc(var(--h) * .09);border-radius:999px;
  background:var(--sgm-pill,var(--glass-edge,#fff));box-shadow:0 1px 4px rgb(0 0 0/.16)}

.sgm-tabs{display:grid;width:100%}
.sgm-tabs .sgm-item{color:var(--sgm-muted,var(--fg3,rgb(17 18 20/.36)))}
.sgm-tabs .sgm-item[data-on]{color:var(--sgm-fg,var(--fg,#111214))}
.sgm-tabs .sgm-ink{bottom:calc(var(--h) * -.06);height:calc(var(--h) * .12)}
.sgm-tabs .sgm-ink::after{content:"";position:absolute;left:50%;top:0;width:calc(var(--h) * .12);height:100%;transform:translateX(-50%) scale(var(--sx,1),var(--sy,1));
  border-radius:50%;background:var(--sgm-fg,var(--fg,#111214))}
/* the capsule: only blur, the control's own box with round ends. It keeps a layer of its own (translateZ), so that
   layers coming and going behind it do not have it rebuilt, which on iOS shows as the blur dropping out for a frame. */
.sgm-haze{position:absolute;z-index:-1;inset:0;border-radius:999px;pointer-events:none;transform:translateZ(0);
  -webkit-backdrop-filter:blur(var(--sgm-blur,18px));backdrop-filter:blur(var(--sgm-blur,18px))}
`;
let injected = false;
function inject() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const st = document.createElement('style');
  st.setAttribute('data-segmented', '');
  st.textContent = CSS;
  document.head.appendChild(st);
}

const itemOf = (t) => (typeof t === 'string' ? { key: t, label: t } : t);

export function Segmented({ items, index = 0, onChange, onReselect, look = 'pill', height, label, style, className }) {
  inject();
  const tabs = look === 'tabs';
  const bar = React.useRef(null);
  const glider = React.useRef(null);
  const latest = React.useRef({ onChange, onReselect });
  latest.current = { onChange, onReselect };
  const list = items.map(itemOf);

  React.useLayoutEffect(() => {
    const g = attachGlider(bar.current, {
      index, dot: tabs,
      onSelect: (i) => latest.current.onChange && latest.current.onChange(i),
      onReselect: (i) => latest.current.onReselect && latest.current.onReselect(i),
    });
    glider.current = g;
    return () => g.destroy();
  }, [list.length, tabs]);                                        // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (glider.current) glider.current.set(index); }, [index]);

  return (
    <label ref={bar} className={`sgm sgm-${tabs ? 'tabs' : 'pill'}${className ? ' ' + className : ''}`} role="tablist" aria-label={label}
      style={{ '--h': `${height || (tabs ? 52 : 34)}px`, ...style }}>
      {tapSwitch ? <input type="checkbox" switch="" className="sgm-switch" aria-hidden="true" /> : null}
      {tabs ? <i className="sgm-haze" aria-hidden="true" /> : null}
      <i className="sgm-ink" data-gl-ink="" aria-hidden="true" />
      {list.map((t) => (
        <span key={t.key} className="sgm-item" data-gl-item="" role="tab" tabIndex={0} aria-label={t.icon ? t.label : undefined}>
          {t.icon || t.label}
        </span>
      ))}
    </label>
  );
}
export default Segmented;
