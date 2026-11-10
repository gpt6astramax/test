// Segmented control on the same glider as the tab row: the pill springs to a tapped item and trails a dragged finger.
// One <label> around a hidden switch, so a tap ticks on iPhone.
import * as React from 'react';
import { attachGlider } from './glider';
import { tapSwitch } from './platform';

const CSS = `
.seg{position:relative;display:flex;padding:3px;border-radius:999px;background:var(--fill);touch-action:none;flex:none;cursor:pointer}
.seg-item{position:relative;padding:6px 14px;font:400 13px/1.2 var(--text);font-variant-numeric:tabular-nums;color:var(--fg2);pointer-events:none}
.seg-item[data-on]{color:var(--fg)}
.seg-ink{position:absolute;top:3px;bottom:3px;left:3px;border-radius:999px;background:var(--glass-edge);box-shadow:0 1px 4px rgb(0 0 0/.16);pointer-events:none;will-change:transform}
`;
let injected = false;

export function Segmented({ items, index = 0, onChange, label }) {
  if (!injected && typeof document !== 'undefined') {
    injected = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  }
  const bar = React.useRef(null);
  const glider = React.useRef(null);
  const latest = React.useRef(onChange);
  latest.current = onChange;
  React.useLayoutEffect(() => {
    const g = attachGlider(bar.current, { index, inset: 3, onSelect: (i) => latest.current && latest.current(i) });
    glider.current = g;
    return () => g.destroy();
  }, [items.length]);                                             // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (glider.current) glider.current.set(index); }, [index]);
  return (
    <label ref={bar} className="seg" role="tablist" aria-label={label}>
      {tapSwitch ? <input type="checkbox" switch="" className="hsw" aria-hidden="true" /> : null}
      <i className="seg-ink" data-gl-ink="" aria-hidden="true" />
      {items.map((t) => <span key={t} className="seg-item" data-gl-item="" role="tab" tabIndex={0}>{t}</span>)}
    </label>
  );
}
export default Segmented;
