// The player on iOS / Android. Unlike every other page it comes up from below, over whatever is on screen, tab row
// included, and goes away with a swipe down. Once up it is a page like any other: it fills the screen to the top,
// square-cornered, with a floating round button to put it away, and like any other page it has no ground of its
// own. What was on screen before stays behind it, smaller, lower, out of focus and faint, exactly as a page does
// behind the next one, and comes back with the finger as the player is pulled down. (PlayerSheet.web.jsx is the web twin, a vertical ScrollGesture.)
//
//   const motion = React.useRef(sheetMotion()).current;
//   <Receding motion={motion} inert={open}> …the app… </Receding>
//   <PlayerSheet open={open} motion={motion} onClosed={…}> …the player… </PlayerSheet>
import * as React from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { Tap } from './Tap';
import { Icon } from './Icon';
import { Glass } from './Glass';
import { EASE, Haze, hazeTint, pair, place, drive, lerp } from './motion';

const MS = 620, CLOSE_MS = 420;
const BACK = { s: 0.86, y: 0.045, o: 0.5 };      // as a page behind the next one (nav/DepthStackView)
const BLUR = 46;
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
  const range = H;
  const latest = React.useRef(onGone);
  latest.current = onGone;
  const s = React.useRef({ leaving: false, scrollY: 0, base: 0 }).current;

  React.useEffect(() => { drive(motion, 0, MS); }, [motion]);
  const close = () => {
    if (s.leaving) return;
    s.leaving = true;
    drive(motion, 1, CLOSE_MS, EASE, () => latest.current());
  };
  React.useEffect(() => { if (!open) close(); }, [open]);        // eslint-disable-line react-hooks/exhaustive-deps

  // A pull down moves the page when its content is at the top (the content does not bounce there). Let go past a
  // third of the way, or with a flick, and it goes.
  const pan = React.useMemo(() => {
    const settle = (g, cancelled) => {
      const v = Math.max(0, (g.dy - s.base) / range);
      if (!cancelled && (g.vy > 0.5 || (v > 0.33 && g.vy > -0.2))) {
        s.leaving = true;
        const rest = 1 - Math.min(1, v);
        drive(motion, 1, g.vy > 0.5 ? Math.max(140, Math.min(CLOSE_MS, (rest * range) / g.vy)) : Math.max(180, CLOSE_MS * rest), EASE, () => latest.current());
      } else drive(motion, 0, 220 + 260 * Math.min(1, v));
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => !s.leaving && s.scrollY <= 0 && g.dy > 8 && g.dy > Math.abs(g.dx) * 1.4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => { s.base = g.dy; },
      onPanResponderMove: (_, g) => place(motion, Math.max(0, Math.min(1, (g.dy - s.base) / range))),
      onPanResponderRelease: (_, g) => settle(g, false),
      onPanResponderTerminate: (_, g) => settle(g, true),
    });
  }, [motion, range, s]);

  return (
    <Animated.View
      accessibilityViewIsModal
      testID="player-sheet"
      style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        transform: [{ translateY: motion.n.interpolate({ inputRange: [0, 1], outputRange: [0, range] }) }],
      }}
      {...pan.panHandlers}
    >
      <ScrollView
        style={{ flex: 1 }}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { s.scrollY = e.nativeEvent.contentOffset.y; }}
        contentContainerStyle={{ width: '100%', maxWidth: COLUMN, alignSelf: 'center', gap: 26, paddingTop: insets.top + 66, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 40 }}
      >
        {children}
      </ScrollView>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center' }}>
        <View pointerEvents="box-none" style={{ width: '100%', maxWidth: COLUMN, paddingHorizontal: GUTTER, flexDirection: 'row' }}>
          <Tap label="收起播放器" onPress={close} pressed={{ opacity: 0.6, transform: [{ scale: 0.94 }] }}>
            <Glass radius={21} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="down1" size={22} color={c.fg} />
            </Glass>
          </Tap>
        </View>
      </View>
    </Animated.View>
  );
}

export default PlayerSheet;
