// Segmented control on iOS / Android: a pill that springs to the chosen item. (Segmented.web.jsx also follows a dragged
// finger; here it is tap only.)
import * as React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from './theme';
import { font } from './fonts';

export function Segmented({ items, index = 0, onChange, label }) {
  const c = useColors();
  const boxes = React.useRef([]);
  const [ready, setReady] = React.useState(false);
  const x = React.useRef(new Animated.Value(0)).current;
  const w = React.useRef(new Animated.Value(0)).current;
  const placed = React.useRef(false);
  React.useEffect(() => {
    const b = boxes.current[index];
    if (!ready || !b) return;
    if (!placed.current) { x.setValue(b.x); w.setValue(b.width); placed.current = true; return; }
    Animated.parallel([
      Animated.spring(x, { toValue: b.x, stiffness: 300, damping: 22, mass: 1, useNativeDriver: false }),
      Animated.spring(w, { toValue: b.width, stiffness: 300, damping: 22, mass: 1, useNativeDriver: false }),
    ]).start();
  }, [index, ready, x, w]);
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: c.fill }}>
      {ready ? <Animated.View style={{ position: 'absolute', top: 3, bottom: 3, left: 0, width: w, borderRadius: 999, backgroundColor: c.glassEdge, transform: [{ translateX: x }] }} /> : null}
      {items.map((t, i) => (
        <Pressable
          key={t}
          accessibilityRole="tab"
          aria-selected={i === index}
          onLayout={(e) => { boxes.current[i] = e.nativeEvent.layout; if (boxes.current.filter(Boolean).length === items.length) setReady(true); }}
          onPress={() => { if (i !== index) { Haptics.selectionAsync().catch(() => {}); if (onChange) onChange(i); } }}
          style={{ paddingVertical: 6, paddingHorizontal: 14 }}
        >
          <Text style={{ ...font.text, fontSize: 13, lineHeight: 16, color: i === index ? c.fg : c.fg2, fontVariant: ['tabular-nums'] }}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export default Segmented;
