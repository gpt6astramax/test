// Line icons on iOS / Android: react-native-svg, drawn from the shared paths. Icon.web.jsx is the inline-SVG twin.
import * as React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { ICONS } from './icon-paths';

const TAGS = { path: Path, circle: Circle };

export function Icon({ name, size = 22, color = '#111214' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map(([tag, { fill, ...a }], i) => {
        const T = TAGS[tag];
        return <T key={i} {...a} fill={fill ? color : 'none'} />;
      })}
    </Svg>
  );
}
export default Icon;
