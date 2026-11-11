// Tap: every button in the app. A React Native Pressable; on the web it sits inside a <label> around a hidden native
// switch, because on iPhone the only haptic a page gets is the one a real finger tap on such a label plays. The label
// takes no box of its own (display: contents), so the Pressable lays out as if it were not there.
//
// Pressing it moves: it goes down quickly (90 ms) and springs back when let go (styles.css, [data-tap]); it never jumps
// between two states. The highlight waits 90 ms after the finger lands, so a finger that starts scrolling a list
// does not make the rows it lands on flash. A button with glass in it is pressed by scale only (pressed={GLASS_PRESS}):
// an opacity on anything around glass switches the glass off for as long as the press lasts.
import * as React from 'react';
import { Pressable } from 'react-native';
import { tapSwitch, buzz } from './platform';

const HIDDEN = { position: 'absolute', left: 0, top: 0, width: 1, height: 1, margin: 0, opacity: 0, pointerEvents: 'none' };

export function Tap({ onPress, style, children, label, haptic = true, role = 'button', pressed: pressedStyle, delayPressIn = 90, ...rest }) {
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
        style={({ pressed }) => [style, pressed && (pressedStyle || PRESSED), pressed && GOING_DOWN]}
        dataSet={{ tap: '' }}
        delayPressIn={delayPressIn}
        {...rest}
      >
        {children}
      </Pressable>
    </label>
  );
}
const PRESSED = { opacity: 0.6, transform: [{ scale: 0.97 }] };
/** For a button with glass in it: scale only, never opacity. */
export const GLASS_PRESS = { transform: [{ scale: 0.92 }] };
// while pressed, the way down is short; the way back (styles.css) is the spring
const GOING_DOWN = { transitionDuration: '90ms', transitionTimingFunction: 'ease-out' };
export default Tap;
