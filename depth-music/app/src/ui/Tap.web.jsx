// Tap: every button in the app. A React Native Pressable; on the web it sits inside a <label> around a hidden native
// switch, because on iPhone the only haptic a page gets is the one a real finger tap on such a label plays. The label
// takes no box of its own (display: contents), so the Pressable lays out as if it were not there.
import * as React from 'react';
import { Pressable } from 'react-native';
import { tapSwitch, buzz } from './platform';

const HIDDEN = { position: 'absolute', left: 0, top: 0, width: 1, height: 1, margin: 0, opacity: 0, pointerEvents: 'none' };

export function Tap({ onPress, style, children, label, haptic = true, role = 'button', pressed: pressedStyle, ...rest }) {
  const ref = React.useRef(null);
  // react-native-web draws role "button" as a <button>, and a click on a <button> inside a <label> never reaches the
  // label's switch. So the element stays a <div> and gets its role as a plain attribute.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.setAttribute) { el.setAttribute('role', role); if (label) el.setAttribute('aria-label', label); }
  }, [role, label]);
  return (
    <label style={{ display: 'contents' }}>
      {tapSwitch && haptic ? <input type="checkbox" switch="" aria-hidden="true" style={HIDDEN} /> : null}
      <Pressable
        ref={ref}
        onPress={(e) => { if (haptic) buzz(); if (onPress) onPress(e); }}
        style={({ pressed }) => [style, pressed && (pressedStyle || PRESSED)]}
        {...rest}
      >
        {children}
      </Pressable>
    </label>
  );
}
const PRESSED = { opacity: 0.6, transform: [{ scale: 0.97 }] };
export default Tap;
