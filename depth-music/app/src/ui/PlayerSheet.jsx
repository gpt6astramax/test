// The player on iOS / Android. Unlike every other page it comes up from below, over whatever is on screen, tab row
// included, and goes away with a swipe down. Once up it is a page like any other: it fills the screen to the top,
// square-cornered, and like any other page it has no ground of its own. At its top, in the middle, is a short dark
// line bent into a shallow arrow that points down: the hint that it goes away downwards. Pulled, the line
// straightens; tapped, it puts the player away. What was on screen before stays behind it, smaller, lower, out of focus and faint, exactly as a page does
// behind the next one, and comes back with the finger as the player is pulled down. (PlayerSheet.web.jsx is the web twin, a vertical ScrollGesture.)
//
//   const motion = React.useRef(sheetMotion()).current;
//   <Receding motion={motion} inert={open}> …the pages… </Receding>
//   <Sinking motion={motion} inert={open}> …the tab row… </Sinking>     // not part of what goes out of focus
//   <PlayerSheet open={open} motion={motion} onClosed={…}> …the player… </PlayerSheet>
import * as React from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';
import { Tap } from './Tap';
import { EASE, Haze, hazeTint, pair, place, drive, lerp } from './motion';

const MS = 620, CLOSE_MS = 420;
const BACK = { s: 0.86, y: 0.045, o: 0.5 };      // as a page behind the next one (nav/DepthStackView)
const BLUR = 46;
const SINK = 120;                  // how far the chrome sinks
const RETURN = 0.35;               // it starts to return once the sheet is this far down (1 = away)
const GUTTER = 20, COLUMN = 460;
const BEND = 16;                   // degrees each half of the handle is turned to make the arrow
const HALF = { position: 'absolute', top: 0, width: 21, height: 5, borderRadius: 2.5 };
// straight from 6% of the way down
const bend = (v, deg) => v.interpolate({ inputRange: [0, 0.06], outputRange: [deg + 'deg', '0deg'], extrapolate: 'clamp' });

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

/** The floating chrome: it sinks out of the screen as the sheet comes up, and returns once the sheet is well on its way down. */
export function Sinking({ motion, inert, style, children }) {
  return (
    <Animated.View
      pointerEvents={inert ? 'none' : 'box-none'}
      accessibilityElementsHidden={inert}
      importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'}
      style={[style, {
        opacity: motion.n.interpolate({ inputRange: [RETURN, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: motion.n.interpolate({ inputRange: [RETURN, 1], outputRange: [SINK, 0], extrapolate: 'clamp' }) }],
      }]}
    >
      {children}
    </Animated.View>
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
  const s = React.useRef({ leaving: false, scrollY: 0, base: 0, onHandle: false }).current;

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
      // (from the handle it can always be pulled, wherever the content is scrolled to)
      onMoveShouldSetPanResponderCapture: (_, g) => !s.leaving && (s.scrollY <= 0 || s.onHandle) && g.dy > 8 && g.dy > Math.abs(g.dx) * 1.4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, g) => { s.base = g.dy; },
      onPanResponderMove: (_, g) => place(motion, Math.max(0, Math.min(1, (g.dy - s.base) / range))),
      onPanResponderRelease: (_, g) => { s.onHandle = false; settle(g, false); },
      onPanResponderTerminate: (_, g) => { s.onHandle = false; settle(g, true); },
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
        contentContainerStyle={{ width: '100%', maxWidth: COLUMN, alignSelf: 'center', gap: 26, paddingTop: insets.top + 50, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 40 }}
      >
        {children}
      </ScrollView>
      {/* The handle: two halves that overlap by their round ends; each turns about the end they share. Bent into the
          arrow at rest, straight as soon as the sheet has been pulled a little. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 4, left: 0, right: 0, alignItems: 'center' }}>
        <View onTouchStart={() => { s.onHandle = true; }} onTouchEnd={() => { s.onHandle = false; }}>
          <Tap label="收起播放器" onPress={close} pressed={{ opacity: 0.55 }} style={{ width: 96, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            {/* solid halves, faint as a group: where they overlap must not show darker */}
            <View needsOffscreenAlphaCompositing style={{ width: 37, height: 5, opacity: 0.6 }}>
              <Animated.View style={[HALF, { left: 0, backgroundColor: c.fg, transformOrigin: '18.5px 2.5px', transform: [{ rotate: bend(motion.n, BEND) }] }]} />
              <Animated.View style={[HALF, { right: 0, backgroundColor: c.fg, transformOrigin: '2.5px 2.5px', transform: [{ rotate: bend(motion.n, -BEND) }] }]} />
            </View>
          </Tap>
        </View>
      </View>
    </Animated.View>
  );
}

export default PlayerSheet;
