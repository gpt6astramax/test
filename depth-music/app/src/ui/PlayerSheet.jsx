// The player on iOS / Android. Unlike every other page it comes up from below, over whatever is on screen, tab row
// included, and goes away with a swipe down. What lies under it drops back out of focus, and comes back with the
// finger as the sheet is pulled down. (PlayerSheet.web.jsx is the web twin, a vertical ScrollGesture.)
//
//   const motion = React.useRef(sheetMotion()).current;
//   <Receding motion={motion} inert={open}> …the app… </Receding>
//   <PlayerSheet open={open} motion={motion} onClosed={…}> …the player… </PlayerSheet>
import * as React from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { EASE, Haze, hazeTint, pair, place, drive, lerp } from './motion';

const MS = 620, CLOSE_MS = 420;
const BACK = { s: 0.92, y: 0.012, o: 0.45 };
const BLUR = 34;
const GUTTER = 20, COLUMN = 460;

/** 1: the sheet is away. 0: it is up. */
export const sheetMotion = () => pair(1);

/** What lies under the sheet: it recedes as the sheet comes up. */
export function Receding({ motion, inert, children }) {
  const { height: H } = useWindowDimensions();
  const c = useColors();
  return (
    <>
      <Animated.View
        pointerEvents={inert ? 'none' : undefined}
        accessibilityElementsHidden={inert}
        importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'}
        style={[StyleSheet.absoluteFill, { opacity: lerp(motion.n, BACK.o, 1), transform: [{ translateY: lerp(motion.n, BACK.y * H, 0) }, { scale: lerp(motion.n, BACK.s, 1) }] }]}
      >
        {children}
      </Animated.View>
      <Haze pointerEvents="none" tint={hazeTint(c.dark)} style={StyleSheet.absoluteFill}
        intensity={motion.j.interpolate({ inputRange: [0, 1], outputRange: [BLUR, 0], extrapolate: 'clamp' })} />
    </>
  );
}

/**
 * open      whether the player should be showing
 * onClosed  called once it is gone (swiped down, or closed from outside and done sliding)
 * motion    sheetMotion(), shared with <Receding>
 */
export function PlayerSheet({ open, onClosed, motion, children }) {
  const [mounted, setMounted] = React.useState(open);
  React.useEffect(() => { if (open) setMounted(true); }, [open]);
  if (!mounted) return null;
  return <Surface open={open} motion={motion} onGone={() => { setMounted(false); if (onClosed) onClosed(); }}>{children}</Surface>;
}

function Surface({ open, motion, onGone, children }) {
  const { height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const top = insets.top + 12;
  const range = H - top;
  const latest = React.useRef(onGone);
  latest.current = onGone;
  const s = React.useRef({ leaving: false, scrollY: 0, base: 0 }).current;

  React.useEffect(() => { drive(motion, 0, MS); }, [motion]);
  React.useEffect(() => {
    if (open || s.leaving) return;
    s.leaving = true;
    drive(motion, 1, CLOSE_MS, EASE, () => latest.current());
  }, [open, motion, s]);

  // A pull down moves the sheet when its content is at the top (the content does not bounce there), and always on the
  // grabber. Let go past a third of the way, or with a flick, and it goes.
  const [body, grab] = React.useMemo(() => {
    const move = (_, g) => place(motion, Math.max(0, Math.min(1, (g.dy - s.base) / range)));
    const settle = (g, cancelled) => {
      const v = Math.max(0, (g.dy - s.base) / range);
      if (!cancelled && (g.vy > 0.5 || (v > 0.33 && g.vy > -0.2))) {
        s.leaving = true;
        const rest = 1 - Math.min(1, v);
        drive(motion, 1, g.vy > 0.5 ? Math.max(140, Math.min(CLOSE_MS, (rest * range) / g.vy)) : Math.max(180, CLOSE_MS * rest), EASE, () => latest.current());
      } else drive(motion, 0, 220 + 260 * Math.min(1, v));
    };
    const common = {
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => { s.base = g.dy; },
      onPanResponderMove: move,
      onPanResponderRelease: (_, g) => settle(g, false),
      onPanResponderTerminate: (_, g) => settle(g, true),
    };
    return [
      PanResponder.create({ ...common, onMoveShouldSetPanResponderCapture: (_, g) => !s.leaving && s.scrollY <= 0 && g.dy > 8 && g.dy > Math.abs(g.dx) * 1.4 }),
      PanResponder.create({ ...common, onStartShouldSetPanResponder: () => !s.leaving, onMoveShouldSetPanResponder: () => !s.leaving }),
    ];
  }, [motion, range, s]);

  return (
    <Animated.View
      accessibilityViewIsModal
      testID="player-sheet"
      style={{
        position: 'absolute', left: 0, right: 0, top, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
        backgroundColor: c.sheet, borderTopWidth: 1, borderColor: c.glassEdge,
        transform: [{ translateY: motion.n.interpolate({ inputRange: [0, 1], outputRange: [0, range] }) }],
      }}
      {...body.panHandlers}
    >
      <View style={{ height: 28, alignItems: 'center', justifyContent: 'center' }} {...grab.panHandlers}>
        <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.fg3 }} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { s.scrollY = e.nativeEvent.contentOffset.y; }}
        contentContainerStyle={{ width: '100%', maxWidth: COLUMN, alignSelf: 'center', gap: 26, paddingTop: 6, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 40 }}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

export default PlayerSheet;
