// A track's waveform on iOS / Android: bars as views, the played part in the track's accent laid over the rest and
// clipped to the progress. Wave.web.jsx is the web twin (a CSS mask).
import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import { waveBars } from '../artdata';
import { mmss } from '../data';
import { useColors } from './theme';
import { useProgress, seek } from '../state';

const Bars = React.memo(function Bars({ heights, height, color, width }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height, width }}>
      {heights.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: '66%', height: Math.max(2, v * height), borderRadius: 1, backgroundColor: color }} />
        </View>
      ))}
    </View>
  );
});

export function Wave({ track, bars = 84, variant = 0, height = 76, seekable = false, style }) {
  const c = useColors();
  const t = useProgress(track.id);
  const [w, setW] = React.useState(0);
  const heights = waveBars(track.n + 1, bars, variant);
  const f = Math.max(0, Math.min(1, t / track.dur));
  const body = (
    <View style={[{ height }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? <Bars heights={heights} height={height} color={c.waveRest} width={w} /> : null}
      {w ? (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w * f, overflow: 'hidden' }}>
          <Bars heights={heights} height={height} color={c.acc(track.hue)} width={w} />
        </View>
      ) : null}
    </View>
  );
  if (!seekable) return body;
  return (
    <Pressable accessibilityRole="adjustable" accessibilityLabel="播放进度" onPress={(e) => { if (w) seek(track.id, e.nativeEvent.locationX / w); }}>
      {body}
    </Pressable>
  );
}

/** The time played of a track. */
export function Played({ track, style }) {
  const t = useProgress(track.id);
  return <Text style={style}>{mmss(t)}</Text>;
}
