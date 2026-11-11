// Frosted glass for things that float (the round buttons, the play bar). iOS / Android: expo-blur.
import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useColors } from './theme';

export function Glass({ radius = 21, style, children }) {
  const c = useColors();
  return (
    <View style={[{ borderRadius: radius, boxShadow: c.lift }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: c.glassEdge }]}>
        <BlurView intensity={Platform.OS === 'ios' ? 40 : 30} tint={c.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.glass }]} />
      </View>
      {children}
    </View>
  );
}
export default Glass;
