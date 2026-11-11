// Cover art on iOS / Android: the same discs as the web's canvas (artdata.js), drawn with react-native-svg.
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { coverSpec } from '../artdata';
import { oklch } from './color';

const css = ([l, c, h, a]) => oklch(l, c, h, a);

export const CoverArt = React.memo(function CoverArt({ hue, seed, style }) {
  const spec = coverSpec(hue, seed);
  const id = `cv${hue}_${seed}`.replace(/[^A-Za-z0-9_]/g, '');
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: css(spec.to) }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={css(spec.from)} />
            <Stop offset="1" stopColor={css(spec.to)} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="320" height="320" fill={`url(#${id})`} />
        {spec.discs.map((d, i) => (
          <Circle key={i} cx={d.cx} cy={d.cy} r={d.rad} fill={css(d.fill)} stroke={css(d.rim)} strokeWidth={d.rimWidth} />
        ))}
      </Svg>
    </View>
  );
});
export default CoverArt;
