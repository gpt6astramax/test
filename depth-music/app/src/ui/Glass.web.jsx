// Frosted glass for things that float (the round buttons). Web: a backdrop filter. Glass.jsx is the native twin.
import * as React from 'react';
import { View } from 'react-native';
import { useColors } from './theme';

export function Glass({ radius = 21, style, children }) {
  const c = useColors();
  return (
    <View style={[{ borderRadius: radius, borderWidth: 1, borderColor: c.glassEdge, backgroundColor: c.glass, boxShadow: c.lift,
      backdropFilter: 'blur(26px) saturate(1.7)', WebkitBackdropFilter: 'blur(26px) saturate(1.7)' }, style]}>
      {children}
    </View>
  );
}
export default Glass;
