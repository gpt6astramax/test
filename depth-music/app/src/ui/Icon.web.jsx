// Line icons on the web: an inline SVG drawn from the shared paths. Icon.jsx is the react-native-svg twin.
import * as React from 'react';
import { ICONS } from './icon-paths';

export function Icon({ name, size = 22, color = 'currentColor', className }) {
  return (
    <svg className={'ic' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      style={{ color }} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name].map(([tag, { fill, ...a }], i) => React.createElement(tag, { key: i, ...a, ...(fill ? { fill: 'currentColor' } : null) }))}
    </svg>
  );
}
export default Icon;
