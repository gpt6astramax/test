// The play bar above the tab row (off by default, see the settings tab). A two-sided ScrollGesture with an overshoot:
// swipe it left or right for the next or the previous track. --p lives on the bar itself and fades the content and
// the two hints, with no JS per frame. A tap brings the player up.
import * as React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import '../lib/scroll-gesture.js';
import { Tap } from './Tap';
import { Icon } from './Icon';
import { Cover } from './parts';
import { artistOf, byId } from '../data';
import { accRaw } from '../art.web';
import { useStore, step, togglePlay, openPlayer, showProgress } from '../state';
import { buzz } from './platform';

const ScrollGesture = window.ScrollGesture;

export function MiniPlayer() {
  const id = useStore((s) => s.cur);
  const playing = useStore((s) => s.playing);
  const t = byId[id];
  const el = React.useRef(null);
  const body = React.useRef(null);
  const prog = React.useRef(null);
  React.useLayoutEffect(() => {
    const g = ScrollGesture(el.current, { sides: [-1, 1], overshoot: 0.3, body: body.current });
    const off = g.on('settle', (side) => { if (!side) return; step(-side); g.reset(); buzz(); });   // content moved left (-1) = next
    return () => { off(); g.destroy(); };
  }, []);
  React.useLayoutEffect(() => showProgress(prog.current, id, 'var'), [id]);
  return (
    <div className="shell glass" style={{ '--wave-acc': accRaw(t.hue) }}>
      <div className="player" ref={el}>
        <div className="pl-body" ref={body}>
          <View style={S.row}>
            <Tap style={S.open} label="打开播放器" onPress={() => openPlayer()}>
              <Cover track={t} style={S.cover} />
              <View style={S.text}>
                <Text numberOfLines={1} style={S.title}>{t.title}</Text>
                <Text numberOfLines={1} style={S.sub}>{artistOf(t).name}</Text>
              </View>
            </Tap>
            <Tap style={S.btn} label={playing ? '暂停' : '播放'} onPress={() => togglePlay()}>
              <Icon name={playing ? 'pause' : 'play'} size={24} color="var(--fg)" />
            </Tap>
            <Tap style={S.btn} label="下一首" onPress={() => step(1)}>
              <Icon name="next" size={24} color="var(--fg)" />
            </Tap>
          </View>
        </div>
      </div>
      <i className="pl-prog" ref={prog} />
    </div>
  );
}

const S = StyleSheet.create({
  row: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 6 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  cover: { width: 42, height: 42, borderRadius: 10 },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'var(--display)', fontSize: 15, lineHeight: 19, color: 'var(--fg)' },
  sub: { fontFamily: 'var(--text)', fontSize: 12, lineHeight: 16, color: 'var(--fg2)' },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

export default MiniPlayer;
