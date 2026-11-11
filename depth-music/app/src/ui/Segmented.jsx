// Segmented on iOS / Android: the same control as Segmented.web.jsx, with the same props and the same feel.
//
//   <Segmented items={['WAV', 'MP3']} index={i} onChange={setI} label="下载格式" />
//   <Segmented look="tabs" items={[{ key: 'home', label: '发现', icon: 'compass' }, …]} index={tab} onChange={setTab}
//     onReselect={popToRoot} />
//
//   items     strings, or { key, label, icon } (icon: a name from ui/icon-paths, or an element that takes `color`)
//   index, onChange(i) (every item the finger passes), onReselect(i) (a tap on the item already chosen)
//   look      'pill' (default): a pill on a faint track, the items as wide as the widest, the control as wide as they
//             are unless it is given a width. 'tabs': a dot under the chosen item on a capsule of blur; full width.
//   height    the one size (default 34 / 52). label, style.
//
// The control takes the touches itself. The ink is moved by a spring, never set in place: it springs to a tapped item
// and trails a finger dragged along the control (stiffness 520 / damping 38 while held, 300 / 22 once let go, as on
// the web). Held, it squashes (the dot into a flat ellipse); moving, it stretches with its speed. Every item chosen
// ticks (expo-haptics), and so does a tap on the item already chosen.
import * as React from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { useColors } from './theme';
import { font } from './fonts';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tick = () => Haptics.selectionAsync().catch(() => {});
const itemOf = (t) => (typeof t === 'string' ? { key: t, label: t } : t);

export function Segmented({ items, index = 0, onChange, onReselect, look = 'pill', height, label, style }) {
  const c = useColors();
  const tabs = look === 'tabs';
  const h = height || (tabs ? 52 : 34);
  const inset = tabs ? 0 : Math.round(h * 0.09);
  const dot = Math.round(h * 0.12);
  const list = items.map(itemOf);
  const n = list.length;

  const x = React.useRef(new Animated.Value(0)).current;
  const sx = React.useRef(new Animated.Value(1)).current;
  const sy = React.useRef(new Animated.Value(1)).current;
  const [seg, setSeg] = React.useState(0);
  const latest = React.useRef({});
  latest.current = { onChange, onReselect, n, inset, tabs };
  // position, speed, where it is heading, how "held" it looks
  const s = React.useRef({ x: 0, v: 0, target: 0, hold: 0, held: false, raf: 0, last: 0, index, start: 0, seg: 0, x0: 0 }).current;

  const api = React.useMemo(() => {
    const draw = () => {
      const speed = Math.abs(s.v);
      x.setValue(s.x);
      if (latest.current.tabs) {
        sx.setValue(1 + s.hold * 1.6 + Math.min(3.4, speed / 360));
        sy.setValue(1 - s.hold * 0.24 - Math.min(0.4, speed / 3400));
      } else {
        const sq = Math.min(0.1, speed / 9000);
        sx.setValue(1 + s.hold * 0.05 + sq);
        sy.setValue(1 + s.hold * 0.05 - sq);
      }
    };
    const step = (now) => {
      const dt = clamp((now - s.last) / 1000, 0.004, 0.032);
      s.last = now;
      const k = s.held ? 520 : 300, d = s.held ? 38 : 22;
      for (let i = 0; i < 4; i++) { s.v += ((k * (s.target - s.x) - d * s.v) * dt) / 4; s.x += (s.v * dt) / 4; }
      s.hold += ((s.held ? 1 : 0) - s.hold) * Math.min(1, dt * 14);
      if (!s.held && Math.abs(s.target - s.x) < 0.05 && Math.abs(s.v) < 2 && s.hold < 0.01) { s.x = s.target; s.v = 0; s.hold = 0; s.raf = 0; }
      else s.raf = requestAnimationFrame(step);
      draw();
    };
    const to = (t, jump) => {
      s.target = t;
      if (jump) { cancelAnimationFrame(s.raf); s.raf = 0; s.x = t; s.v = 0; s.hold = s.held ? 1 : 0; draw(); }
      else if (!s.raf) s.raf = requestAnimationFrame((now) => { s.last = now - 16; step(now); });
    };
    const at = (px) => {
      const { n: count, inset: pad } = latest.current;
      return { pos: clamp(px - pad - s.seg / 2, 0, (count - 1) * s.seg), i: clamp(Math.floor((px - pad) / s.seg), 0, count - 1) };
    };
    const choose = (i) => {
      if (i === s.index) return;
      s.index = i;
      tick();
      if (latest.current.onChange) latest.current.onChange(i);
    };
    const follow = (px) => { const a = at(px); to(a.pos); choose(a.i); };
    const end = (px, released) => {
      if (!s.held) return;
      s.held = false;
      const same = released && s.index === s.start && at(px).i === s.index;
      to(s.index * s.seg);
      if (same) { tick(); if (latest.current.onReselect) latest.current.onReselect(s.index); }
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
    const w = (e.nativeEvent.layout.width - inset * 2) / n;
    if (!w || Math.abs(w - s.seg) < 0.5) return;
    s.seg = w;
    api.to(s.index * w, true);
    setSeg(w);
  };

  // 'pill': every item as wide as the widest. Measured as they are first, then given that width (and a share of any
  // width the control is given).
  const names = list.map((t) => t.label).join('\n');
  const [cell, setCell] = React.useState(0);
  const natural = React.useRef([]);
  React.useEffect(() => { natural.current = []; setCell(0); }, [names, h]);
  const measure = (i) => (e) => {
    if (tabs || cell) return;
    natural.current[i] = e.nativeEvent.layout.width;
    if (natural.current.filter(Boolean).length === n) setCell(Math.ceil(Math.max(...natural.current)));
  };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      pointerEvents="box-only"
      onLayout={onLayout}
      style={[{ height: h, flexDirection: 'row', padding: inset, borderRadius: h / 2, alignSelf: tabs ? 'stretch' : 'flex-start' },
        !tabs && { backgroundColor: c.fill }, style]}
      {...api.pan.panHandlers}
    >
      {tabs ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: h / 2, overflow: 'hidden' }]}>
          <BlurView intensity={Platform.OS === 'ios' ? 30 : 24} tint={c.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
      {seg && cell && !tabs ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: inset, top: inset, bottom: inset, width: seg, borderRadius: h / 2,
          backgroundColor: c.glassEdge, boxShadow: '0 1px 4px rgba(0,0,0,0.16)',
          transform: [{ translateX: x }, { scaleX: sx }, { scaleY: sy }],
        }} />
      ) : null}
      {list.map((t, i) => {
        const on = i === index;
        const color = on ? c.fg : tabs ? c.fg3 : c.fg2;
        return (
          <View key={t.key} accessible accessibilityRole="tab" accessibilityLabel={t.label} aria-selected={on} onLayout={measure(i)}
            style={[{ alignItems: 'center', justifyContent: 'center' }, tabs ? { flex: 1 } : cell ? { flex: 1, minWidth: cell } : { paddingHorizontal: Math.round(h * 0.41) }]}>
            {t.icon
              ? (typeof t.icon === 'string' ? <Icon name={t.icon} size={Math.round(h * 0.48)} color={color} /> : React.cloneElement(t.icon, { color }))
              : <Text numberOfLines={1} style={{ ...font.text, fontSize: Math.round(h * 0.38), color, fontVariant: ['tabular-nums'] }}>{t.label}</Text>}
          </View>
        );
      })}
      {seg && tabs ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: (seg - dot) / 2, bottom: -dot / 2, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c.fg,
          transform: [{ translateX: x }, { scaleX: sx }, { scaleY: sy }],
        }} />
      ) : null}
    </View>
  );
}

export default Segmented;
