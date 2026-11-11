// One tab's page stack on iOS / Android: the depth-of-field turn with React Native's Animated and PanResponder.
// (DepthStackView.web.jsx is the web twin, on native scrolling and scroll timelines.)
//
// A pushed page comes in from a little to the right while fading in. The page it covers does not slide away: it stays
// where it is, shrinks, sinks, fades and goes out of focus behind a blur. Swipe right anywhere on the page to go back:
// the page follows the finger and fades, and what is behind it comes back into focus with it.
//
//   <DepthStackView ref={stackRef} active={tab === 0} root={Discover} screens={{ artist: Artist, … }} bottom={84} />
//   const nav = useNav();  nav.push('artist', { id: 'vl' });  nav.pop();  nav.popToRoot();
import * as React from 'react';
import { Animated, Easing, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavContext } from './context';
import { Tap } from '../ui/Tap';
import { Icon } from '../ui/Icon';
import { Glass } from '../ui/Glass';
import { useColors } from '../ui/theme';
import { EASE, Haze, hazeTint, lerp } from '../ui/motion';

const PUSH_MS = 660, POP_MS = 420;
const TRAVEL = 0.17;                // a page comes in from this far to the right (part of the width)
const GONE = 0.8;                   // a page swiped this far has faded out
const BACK = { s: 0.86, y: 0.045, o: 0.5 };       // the page right behind the top one
const FAR = { s: 0.74, y: 0.1, o: 0 };            // the one behind that; anything deeper is not drawn
const BLUR = 46;
const GUTTER = 20, COLUMN = 460;
const fill = StyleSheet.absoluteFill;

export const DepthStackView = React.forwardRef(function DepthStackView({ active, label, root: Root, screens, bottom = 84 }, ref) {
  const { width: W, height: H } = useWindowDimensions();
  const c = useColors();
  const [pages, setPages] = React.useState([]);     // { key, name, params, x, e, b, away }
  const live = React.useRef(pages);
  live.current = pages;
  const rootScroll = React.useRef(null);

  // x: how far the page has been swiped away (0..1 of the width). e: how far it still is from having come in (1..0).
  // b: the two together for the blur, which cannot run on the native driver.
  const leave = React.useCallback((page, from = 0, speed = 0) => {
    if (page.leaving) return;
    page.leaving = true;
    page.e.stopAnimation();
    const rest = Math.max(0, 1 - from);
    const duration = speed > 0.3 ? Math.max(140, Math.min(POP_MS, (rest * W) / speed)) : Math.max(180, POP_MS * rest);
    const easing = speed > 0.3 ? Easing.out(Easing.quad) : EASE;
    Animated.parallel([
      Animated.timing(page.x, { toValue: 1, duration, easing, useNativeDriver: true }),
      Animated.timing(page.b, { toValue: 1, duration, easing, useNativeDriver: false }),
    ]).start(() => setPages((cur) => cur.filter((p) => p !== page)));
  }, [W]);

  const nav = React.useMemo(() => ({
    push(name, params) {
      if (!screens[name]) return;
      const key = name + ':' + JSON.stringify(params || {});
      if (live.current.some((p) => p.key === key)) return;
      const x = new Animated.Value(0), e = new Animated.Value(1);
      const page = { key, name, params: params || {}, x, e, b: new Animated.Value(1), away: Animated.add(x, e), entered: false, leaving: false };
      live.current = [...live.current, page];
      setPages((cur) => [...cur, page]);
    },
    pop() { const cur = live.current; if (cur.length) leave(cur[cur.length - 1]); },
    popToRoot() {
      const cur = live.current;
      if (!cur.length) return;
      const top = cur[cur.length - 1];
      if (cur.length > 1) setPages([top]);
      leave(top);
    },
    scrollToTop() { if (rootScroll.current) rootScroll.current.scrollTo({ y: 0, animated: true }); },
    get depth() { return live.current.length; },
  }), [screens, leave]);
  React.useImperativeHandle(ref, () => nav, [nav]);

  // tabs cross-fade; the one you leave drops back a little
  const on = React.useRef(new Animated.Value(active ? 1 : 0)).current;
  React.useEffect(() => {
    Animated.timing(on, { toValue: active ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [active, on]);

  const n = pages.length;
  const top = n ? pages[n - 1] : null;
  // what a layer looks like for being k layers below the top one, tied to how far the top page is away
  const behind = (k) => {
    if (!k || !top) return null;
    if (k === 1) return { opacity: lerp(top.away, BACK.o, 1), transform: [{ translateY: lerp(top.away, BACK.y * H, 0) }, { scale: lerp(top.away, BACK.s, 1) }] };
    if (k === 2) return { opacity: lerp(top.away, FAR.o, BACK.o), transform: [{ translateY: lerp(top.away, FAR.y * H, BACK.y * H) }, { scale: lerp(top.away, FAR.s, BACK.s) }] };
    return { opacity: 0 };
  };

  return (
    <Animated.View
      accessibilityLabel={label}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      pointerEvents={active ? undefined : 'none'}
      style={[fill, { opacity: on, transform: [{ scale: lerp(on, 0.96, 1) }] }]}
    >
      <NavContext.Provider value={nav}>
        <Animated.View style={[fill, behind(n)]} pointerEvents={n ? 'none' : undefined}>
          <Page ref={rootScroll} root bottom={bottom}><Root /></Page>
        </Animated.View>
        {pages.map((p, i) => {
          const k = n - 1 - i;                      // 0: the top page
          const Screen = screens[p.name];
          return (
            <React.Fragment key={p.key}>
              {k <= 1 ? (
                <Haze pointerEvents="none" tint={hazeTint(c.dark)} style={fill}
                  intensity={p.b.interpolate({ inputRange: [0, 1], outputRange: [BLUR, 0], extrapolate: 'clamp' })} />
              ) : null}
              <Animated.View style={[fill, behind(k)]} pointerEvents={k ? 'none' : undefined}>
                <Pushed page={p} width={W} onLeave={leave} bottom={bottom}><Screen {...p.params} /></Pushed>
              </Animated.View>
            </React.Fragment>
          );
        })}
      </NavContext.Provider>
    </Animated.View>
  );
});

/** A page's content: no ground of its own, one column, scrolling under the status bar and behind the tab row. */
const Page = React.forwardRef(function Page({ root, bottom, children }, ref) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      ref={ref}
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{
        width: '100%', maxWidth: COLUMN, alignSelf: 'center', gap: 28, paddingHorizontal: GUTTER,
        paddingTop: insets.top + (root ? 18 : 66), paddingBottom: insets.bottom + bottom + 56,
      }}
    >
      {children}
    </ScrollView>
  );
});

function Pushed({ page, width: W, onLeave, bottom, children }) {
  const insets = useSafeAreaInsets();
  const c = useColors();

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(page.e, { toValue: 0, duration: PUSH_MS, easing: EASE, useNativeDriver: true }),
      Animated.timing(page.b, { toValue: 0, duration: PUSH_MS, easing: EASE, useNativeDriver: false }),
    ]).start(({ finished }) => { if (finished) page.entered = true; });
  }, [page]);

  // The back swipe: a mostly horizontal drag to the right, anywhere on the page, once the page has come in. It is
  // taken from the scroll view (capture), so the page cannot scroll while it is being swiped.
  const pan = React.useMemo(() => {
    const settle = (g, cancelled) => {
      const v = Math.max(0, g.dx / W);
      if (!cancelled && (g.vx > 0.4 || (v > 0.45 && g.vx > -0.2))) { onLeave(page, v, g.vx); return; }
      const duration = 200 + 260 * Math.min(1, v);
      Animated.parallel([
        Animated.timing(page.x, { toValue: 0, duration, easing: EASE, useNativeDriver: true }),
        Animated.timing(page.b, { toValue: 0, duration, easing: EASE, useNativeDriver: false }),
      ]).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => page.entered && !page.leaving && g.dx > 10 && g.dx > Math.abs(g.dy) * 1.6,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => { const v = Math.max(0, g.dx / W); page.x.setValue(v); page.b.setValue(Math.min(1, v)); },
      onPanResponderRelease: (_, g) => settle(g, false),
      onPanResponderTerminate: (_, g) => settle(g, true),
    });
  }, [page, W, onLeave]);

  const style = React.useMemo(() => ({
    opacity: Animated.multiply(
      page.x.interpolate({ inputRange: [0, GONE], outputRange: [1, 0], extrapolate: 'clamp' }),
      page.e.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }),
    ),
    transform: [{ translateX: Animated.add(
      page.x.interpolate({ inputRange: [0, 1], outputRange: [0, W] }),
      page.e.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL * W] }),
    ) }],
  }), [page, W]);

  return (
    <Animated.View style={[fill, style]} {...pan.panHandlers}>
      <Page bottom={bottom}>{children}</Page>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center' }}>
        <View pointerEvents="box-none" style={{ width: '100%', maxWidth: COLUMN, paddingHorizontal: GUTTER, flexDirection: 'row' }}>
          <Tap label="返回" onPress={() => onLeave(page)} pressed={{ transform: [{ scale: 0.92 }] }}>
            <Glass radius={21} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="back" size={22} color={c.fg} />
            </Glass>
          </Tap>
        </View>
      </View>
    </Animated.View>
  );
}

export default DepthStackView;
