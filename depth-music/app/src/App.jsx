// The app on iOS / Android (Expo): four tabs, each a depth stack of its own; the tab row floating in front; the player
// as a sheet over it all. App.web.jsx is the web twin; the screens and everything they are made of are shared.
import * as React from 'react';
import { Animated, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DepthStackView } from './nav/DepthStackView';
import { Segmented } from './ui/Segmented';
import { PlayerSheet, Receding, Sinking, sheetMotion } from './ui/PlayerSheet';
import { MiniPlayer } from './ui/MiniPlayer';
import { Glass } from './ui/Glass';
import { ThemeProvider, useColors } from './ui/theme';
import { font, useAppFonts } from './ui/fonts';
import Discover from './screens/Discover';
import Search from './screens/Search';
import Library from './screens/Library';
import Radio from './screens/Radio';
import Me from './screens/Me';
import Artist from './screens/Artist';
import Collection from './screens/Collection';
import Player from './screens/Player';
import { useStore, set, closePlayer } from './state';

const SCREENS = { artist: Artist, collection: Collection };
const TABS = [
  { key: 'discover', label: '发现', icon: 'compass', root: Discover },
  { key: 'search', label: '搜索', icon: 'search', root: Search },
  { key: 'radio', label: '电台', icon: 'radio', root: Radio },
  { key: 'library', label: '曲库', icon: 'stack', root: Library },
  { key: 'me', label: '我的', icon: 'user', root: Me },
];
const GUTTER = 20, COLUMN = 460;

export default function Root() {
  const ready = useAppFonts();
  return (
    <SafeAreaProvider>
      <ThemeProvider>{ready ? <App /> : null}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function App() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const tab = useStore((s) => s.tab);
  const bar = useStore((s) => s.bar);
  const player = useStore((s) => s.player);
  const stacks = React.useRef([]);
  const pending = React.useRef(null);           // a page to open once the player has gone
  const motion = React.useRef(null);
  if (!motion.current) motion.current = sheetMotion();
  const chrome = bar ? 150 : 84;                // what the floating chrome covers at the bottom of a page

  // Android's back: the player first, then a page; from a tab's first page the system takes it
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (player) { closePlayer(); return true; }
      const s = stacks.current[tab];
      if (s && s.depth) { s.pop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab, player]);

  // from the player: close it, then open the page in the tab underneath
  const fromPlayer = (name, params) => { pending.current = [name, params]; closePlayer(); };
  const onPlayerClosed = () => {
    set({ player: false });
    const p = pending.current;
    pending.current = null;
    if (p && stacks.current[tab]) stacks.current[tab].push(p[0], p[1]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Receding motion={motion.current} inert={player}>
        <View style={StyleSheet.absoluteFill}>
          {TABS.map((t, i) => (
            <DepthStackView key={t.key} ref={(r) => { stacks.current[i] = r; }} active={tab === i} label={t.label} root={t.root} screens={SCREENS} bottom={chrome} />
          ))}
        </View>
      </Receding>
      {/* The floating chrome, above the home indicator. It is not part of what goes out of focus behind the player:
          it sinks out of the screen while the player is up. */}
      <Sinking motion={motion.current} inert={player} style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom - 4, 26), alignItems: 'center' }}>
        <View pointerEvents="box-none" style={{ width: '100%', maxWidth: COLUMN, paddingHorizontal: GUTTER, gap: 8 }}>
          {bar ? <MiniPlayer /> : null}
          <Segmented
            look="tabs"
            label="页签"
            items={TABS}
            index={tab}
            onChange={(i) => set({ tab: i })}
            onReselect={(i) => { const s = stacks.current[i]; if (s) { if (s.depth) s.popToRoot(); else s.scrollToTop(); } }}
          />
        </View>
      </Sinking>
      <PlayerSheet open={player} motion={motion.current} onClosed={onPlayerClosed}>
        <Player onNavigate={fromPlayer} />
      </PlayerSheet>
      <Toast bottom={insets.bottom + chrome + 14} />
    </View>
  );
}

/** One line that says what just happened, above the tab row. */
function Toast({ bottom }) {
  const c = useColors();
  const message = useStore((s) => s.toast);
  const [text, setText] = React.useState('');
  const on = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (message) setText(message);
    Animated.spring(on, { toValue: message ? 1 : 0, stiffness: 320, damping: 26, mass: 1, useNativeDriver: true }).start();
  }, [message, on]);
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center', opacity: on, transform: [{ translateY: on.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <Glass radius={19} style={{ paddingVertical: 9, paddingHorizontal: 16 }}>
        <Text style={{ ...font.text, fontSize: 13.5, lineHeight: 18, color: c.fg }}>{text}</Text>
      </Glass>
    </Animated.View>
  );
}
