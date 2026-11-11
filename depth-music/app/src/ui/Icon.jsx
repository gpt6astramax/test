// Line icons on iOS / Android: react-native-svg, drawn from the shared paths. Icon.web.jsx is the inline-SVG twin.
//
// Like the web's --icon-lift, an icon stands off the paper a little: a faint shadow below it in the light theme; in the
// dark theme a faint glow in its own colour instead (so a dimmer icon glows less). iOS: the layer's shadow, which
// follows the drawing when the view has no background. Android: a drop-shadow filter.
import * as React from 'react';
import { Platform, View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { ICONS } from './icon-paths';
import { useColors } from './theme';

const TAGS = { path: Path, circle: Circle };

// a colour (#rrggbb or rgba()) with its alpha times k
function fade(color, k) {
  const m = /^rgba?\(([^)]+)\)$/.exec(color);
  if (m) { const [r, g, b, a = 1] = m[1].split(',').map(Number); return `rgba(${r},${g},${b},${+(a * k).toFixed(3)})`; }
  const h = /^#([0-9a-f]{6})$/i.exec(color);
  if (h) { const n = parseInt(h[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${k})`; }
  return color;
}

function lift(dark, color) {
  if (Platform.OS === 'ios') {
    return dark
      ? { shadowColor: color, shadowOpacity: 0.45, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } }
      : { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } };
  }
  if (Platform.OS === 'android') {
    return { filter: dark ? `drop-shadow(0px 0px 3px ${fade(color, 0.45)})` : 'drop-shadow(0px 1px 1px rgba(0,0,0,0.14))' };
  }
  return null;
}

export function Icon({ name, size = 22, color = '#111214' }) {
  const c = useColors();
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, lift(c.dark, color)]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name].map(([tag, { fill, ...a }], i) => {
          const T = TAGS[tag];
          return <T key={i} {...a} fill={fill ? color : 'none'} />;
        })}
      </Svg>
    </View>
  );
}
export default Icon;
