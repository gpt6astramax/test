// The theme on iOS / Android: plain colour values in a context (theme.web.jsx is the CSS-variable twin). The app starts
// light, whatever the system is set to; the round button on a tab's first page switches.
//
// Light <-> dark is never a jump: the old paper comes over the screen, the theme changes under it, and it fades away.
import * as React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { oklch } from './color';

const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
function palette(dark) {
  const ink = dark ? [242, 242, 243] : [17, 18, 20];
  const accL = dark ? 0.82 : 0.52, accC = dark ? 0.13 : 0.17;
  return {
    dark,
    bg: dark ? '#000000' : '#f2f2f0',
    fg: rgba(...ink, 1), fg2: rgba(...ink, dark ? 0.64 : 0.62), fg3: rgba(...ink, dark ? 0.38 : 0.36),
    hair: rgba(...ink, dark ? 0.14 : 0.1), fill: rgba(...ink, dark ? 0.08 : 0.05), ink: rgba(...ink, dark ? 0.14 : 0.09),
    glass: dark ? rgba(30, 30, 32, 0.55) : rgba(255, 255, 255, 0.6),
    glassEdge: dark ? rgba(255, 255, 255, 0.12) : rgba(255, 255, 255, 0.9),
    waveRest: rgba(...ink, dark ? 0.26 : 0.2),
    onAcc: dark ? '#0a0a0b' : '#ffffff',
    like: dark ? '#ff6b9a' : '#f0467f',
    lift: dark ? '0 14px 40px rgba(0,0,0,0.6)' : '0 8px 28px rgba(0,0,0,0.12)',
    /** a track's accent, from its hue */
    acc: (hue) => oklch(accL, accC, hue),
    accSoft: (hue) => oklch(accL, accC, hue, 0.16),
  };
}
const LIGHT = palette(false), DARK = palette(true);

const Ctx = React.createContext({ c: LIGHT, toggle: () => {} });
export function ThemeProvider({ children }) {
  const [dark, setDark] = React.useState(false);
  const [paper, setPaper] = React.useState(null);            // the old ground, while it covers the switch
  const veil = React.useRef(new Animated.Value(0)).current;
  const busy = React.useRef(false);
  const toggle = React.useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setPaper((dark ? DARK : LIGHT).bg);
    Animated.timing(veil, { toValue: 1, duration: 150, useNativeDriver: true }).start(() => {
      setDark((d) => !d);
      Animated.timing(veil, { toValue: 0, duration: 460, delay: 40, useNativeDriver: true }).start(() => { setPaper(null); busy.current = false; });
    });
  }, [dark, veil]);
  const value = React.useMemo(() => ({ c: dark ? DARK : LIGHT, toggle }), [dark, toggle]);
  return (
    <Ctx.Provider value={value}>
      <View style={{ flex: 1, backgroundColor: value.c.bg }}>
        {children}
        {paper ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: paper, opacity: veil }]} /> : null}
      </View>
    </Ctx.Provider>
  );
}
export const useColors = () => React.useContext(Ctx).c;
/** Returns switchTheme(anchorRef). (The web spreads the new theme from the anchor; here the old paper fades away.) */
export const useThemeSwitch = () => React.useContext(Ctx).toggle;
/** The icon on the theme button: a moon in the light theme, a sun in the dark one. */
export function ThemeGlyph() {
  const c = useColors();
  return <Icon name={c.dark ? 'sun' : 'moon'} size={c.dark ? 21 : 20} color={c.fg} />;
}
