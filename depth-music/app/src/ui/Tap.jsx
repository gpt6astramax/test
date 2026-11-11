// Tap on iOS / Android: a Pressable that ticks through expo-haptics. Tap.web.jsx is the web twin (a <label> around a
// hidden switch, the only way a web page gets a haptic on iPhone).
import * as React from 'react';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

const PRESSED = { opacity: 0.6, transform: [{ scale: 0.97 }] };
/** For a button with glass in it: scale only, never opacity (a blur under a faded parent renders wrongly). */
export const GLASS_PRESS = { transform: [{ scale: 0.92 }] };

export function Tap({ onPress, style, children, label, haptic = true, role = 'button', pressed: pressedStyle, ...rest }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      onPress={(e) => { if (haptic) Haptics.selectionAsync().catch(() => {}); if (onPress) onPress(e); }}
      style={({ pressed }) => [style, pressed && (pressedStyle || PRESSED)]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
export default Tap;
