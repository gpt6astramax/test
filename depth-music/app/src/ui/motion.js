// Motion on iOS / Android. Movement and fading run on the native driver; a blur's strength cannot, so every motion
// here is a pair of values that are always moved together: `n` for transforms and opacity, `j` for the blur.
import { Animated, Easing } from 'react-native';
import { BlurView } from 'expo-blur';

export const EASE = Easing.bezier(0.2, 0.86, 0.24, 1);        // the same curve as the web's cubic-bezier(.2,.86,.24,1)
export const Haze = Animated.createAnimatedComponent(BlurView);
export const hazeTint = (dark) => (dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight');

export const pair = (v) => ({ n: new Animated.Value(v), j: new Animated.Value(v) });
export function place(p, v) { p.n.setValue(v); p.j.setValue(v); }
/** Animate both values to `toValue`; done() only when it got there. */
export function drive(p, toValue, duration, easing = EASE, done) {
  Animated.parallel([
    Animated.timing(p.n, { toValue, duration, easing, useNativeDriver: true }),
    Animated.timing(p.j, { toValue, duration, easing, useNativeDriver: false }),
  ]).start(({ finished }) => { if (finished && done) done(); });
}
export const lerp = (v, from, to) => v.interpolate({ inputRange: [0, 1], outputRange: [from, to], extrapolate: 'clamp' });
