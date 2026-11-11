// DotTabBar on iOS / Android: the bottom tab row. Bare icons, the current one in full ink with a dot under it, over a
// capsule of blur with no fill, border or shadow of its own: the row's own box with round ends. (feather: the blur
// weakens outwards in steps instead.) DotTabBar.web.jsx is the web twin.
//
//   <DotTabBar
//     tabs={[{ key: 'home', label: '发现', icon: 'compass' }, …]}      // icon: a name from ui/icon-paths, or an element
//                                                                       // that takes a `color` prop
//     index={tab}
//     onChange={(i) => setTab(i)}          // on touch down and while dragging: every tab the dot passes
//     onReselect={(i) => popToRoot(i)}     // a tap on the tab that is already current
//   />
//
// - The row takes the touches itself. The dot is moved by a spring, never set in place: it springs to a tapped tab and
//   trails a finger dragged along the row. Held, it is pulled into a flat ellipse; moving, it stretches with its speed.
//   The same spring as the web's glider: stiffness 520 / damping 38 while held, 300 / 22 once let go.
// - Every tab the dot passes ticks (expo-haptics).
// - Put it in a container at the bottom of the screen. Props: height (default 52), haze (default true), feather
//   (default false), style.
import * as React from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { useColors } from './theme';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DOT = 6;
// Feathered, the haze clears outwards in steps (a blur cannot be masked here as it is on the web):
// [inset, height, intensity]. Android has no real blur, so one step is all it can show.
const STEPS = Platform.OS === 'ios' ? [[-14, 88, 5], [-4, 66, 12], [6, 46, 30]] : [[6, 46, 24]];
const INTENSITY = Platform.OS === 'ios' ? 30 : 24;

export function DotTabBar({ tabs, index = 0, onChange, onReselect, height = 52, haze = true, feather = false, style }) {
  const c = useColors();
  const n = tabs.length;
  const x = React.useRef(new Animated.Value(0)).current;
  const sx = React.useRef(new Animated.Value(1)).current;
  const sy = React.useRef(new Animated.Value(1)).current;
  const [placed, setPlaced] = React.useState(false);
  const latest = React.useRef({});
  latest.current = { onChange, onReselect, n };
  // position, speed, where it is heading, how "held" it looks
  const s = React.useRef({ x: 0, v: 0, target: 0, hold: 0, held: false, raf: 0, last: 0, index, start: 0, seg: 0, x0: 0 }).current;

  const api = React.useMemo(() => {
    const draw = () => {
      const speed = Math.abs(s.v);
      x.setValue(s.x + s.seg / 2 - DOT / 2);
      sx.setValue(1 + s.hold * 1.6 + Math.min(3.4, speed / 360));
      sy.setValue(1 - s.hold * 0.24 - Math.min(0.4, speed / 3400));
    };
    const tick = (now) => {
      const dt = Math.min(0.032, (now - s.last) / 1000) || 0.016;
      s.last = now;
      const k = s.held ? 520 : 300, d = s.held ? 38 : 22;
      for (let i = 0; i < 4; i++) { s.v += ((k * (s.target - s.x) - d * s.v) * dt) / 4; s.x += (s.v * dt) / 4; }
      s.hold += ((s.held ? 1 : 0) - s.hold) * Math.min(1, dt * 14);
      if (!s.held && Math.abs(s.target - s.x) < 0.05 && Math.abs(s.v) < 2 && s.hold < 0.01) { s.x = s.target; s.v = 0; s.hold = 0; s.raf = 0; }
      else s.raf = requestAnimationFrame(tick);
      draw();
    };
    const to = (t, jump) => {
      s.target = t;
      if (jump) { cancelAnimationFrame(s.raf); s.raf = 0; s.x = t; s.v = 0; s.hold = s.held ? 1 : 0; draw(); }
      else if (!s.raf) { s.last = Date.now(); s.raf = requestAnimationFrame((now) => { s.last = now - 16; tick(now); }); }
    };
    const at = (px) => ({ pos: clamp(px - s.seg / 2, 0, (latest.current.n - 1) * s.seg), i: clamp(Math.floor(px / s.seg), 0, latest.current.n - 1) });
    const choose = (i) => {
      if (i === s.index) return;
      s.index = i;
      Haptics.selectionAsync().catch(() => {});
      if (latest.current.onChange) latest.current.onChange(i);
    };
    const follow = (px) => { const a = at(px); to(a.pos); choose(a.i); };
    const end = (px, released) => {
      if (!s.held) return;
      s.held = false;
      const same = released && s.index === s.start && at(px).i === s.index;
      to(s.index * s.seg);
      if (same) { Haptics.selectionAsync().catch(() => {}); if (latest.current.onReselect) latest.current.onReselect(s.index); }
    };
    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { if (!s.seg) return; s.held = true; s.start = s.index; s.x0 = e.nativeEvent.locationX; follow(s.x0); },
      onPanResponderMove: (_, g) => { if (s.held) follow(s.x0 + g.dx); },
      onPanResponderRelease: (_, g) => end(s.x0 + g.dx, true),
      onPanResponderTerminate: (_, g) => end(s.x0 + g.dx, false),
    });
    return { to, pan };
  }, [s, x, sx, sy]);

  React.useEffect(() => () => cancelAnimationFrame(s.raf), [s]);
  // follow a choice made elsewhere
  React.useEffect(() => { if (index !== s.index && !s.held) { s.index = index; if (s.seg) api.to(index * s.seg); } }, [index, s, api]);

  const onLayout = (e) => {
    const seg = e.nativeEvent.layout.width / n;
    if (!seg || Math.abs(seg - s.seg) < 0.5) return;
    s.seg = seg;
    api.to(s.index * seg, true);
    setPlaced(true);
  };

  return (
    <View
      accessibilityRole="tablist"
      testID="dot-tab-bar"
      pointerEvents="box-only"
      onLayout={onLayout}
      style={[{ height, flexDirection: 'row' }, style]}
      {...api.pan.panHandlers}
    >
      {haze ? (feather ? STEPS : [[0, height, INTENSITY]]).map(([inset, h, intensity]) => (
        <View key={h} pointerEvents="none" style={{ position: 'absolute', left: inset, right: inset, top: (height - h) / 2, height: h, borderRadius: h / 2, overflow: 'hidden' }}>
          <BlurView intensity={intensity} tint={c.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        </View>
      )) : null}
      {tabs.map((t, i) => (
        <View key={t.key} accessible accessibilityRole="tab" accessibilityLabel={t.label} aria-selected={i === index}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {typeof t.icon === 'string'
            ? <Icon name={t.icon} size={25} color={i === index ? c.fg : c.fg3} />
            : React.cloneElement(t.icon, { color: i === index ? c.fg : c.fg3 })}
        </View>
      ))}
      {placed ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: 0, bottom: -DOT / 2, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: c.fg,
          transform: [{ translateX: x }, { scaleX: sx }, { scaleY: sy }],
        }} />
      ) : null}
    </View>
  );
}

export default DotTabBar;
