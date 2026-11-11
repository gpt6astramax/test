// The play bar above the tab row on iOS / Android (off by default, see the settings tab): what is playing, play and
// next, a line of progress. A tap brings the player up. (MiniPlayer.web.jsx also takes a swipe left or right.)
import * as React from 'react';
import { Text, View } from 'react-native';
import { Tap } from './Tap';
import { Icon } from './Icon';
import { Glass } from './Glass';
import { Cover } from './parts';
import { themed } from './themed';
import { useColors } from './theme';
import { artistOf, byId } from '../data';
import { useStore, useProgress, step, togglePlay, openPlayer } from '../state';

export function MiniPlayer() {
  const S = useS();
  const c = useColors();
  const id = useStore((s) => s.cur);
  const playing = useStore((s) => s.playing);
  const t = byId[id];
  const f = Math.max(0, Math.min(1, useProgress(id) / t.dur));
  return (
    <Glass radius={20}>
      <View style={S.row}>
        <Tap style={S.open} label="打开播放器" onPress={() => openPlayer()}>
          <Cover track={t} style={S.cover} />
          <View style={S.text}>
            <Text numberOfLines={1} style={S.title}>{t.title}</Text>
            <Text numberOfLines={1} style={S.sub}>{artistOf(t).name}</Text>
          </View>
        </Tap>
        <Tap style={S.btn} label={playing ? '暂停' : '播放'} onPress={() => togglePlay()}>
          <Icon name={playing ? 'pause' : 'play'} size={24} color={c.fg} />
        </Tap>
        <Tap style={S.btn} label="下一首" onPress={() => step(1)}>
          <Icon name="next" size={24} color={c.fg} />
        </Tap>
      </View>
      <View style={S.track}><View style={{ height: 2, borderRadius: 2, width: `${f * 100}%`, backgroundColor: c.acc(t.hue) }} /></View>
    </Glass>
  );
}

const useS = themed((c, f) => ({
  row: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 6 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  cover: { width: 42, height: 42, borderRadius: 10 },
  text: { flex: 1, minWidth: 0 },
  title: { ...f.display, fontSize: 15, lineHeight: 19, color: c.fg },
  sub: { ...f.text, fontSize: 12, lineHeight: 16, color: c.fg2 },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 20, right: 20, bottom: 0, height: 2 },
}));

export default MiniPlayer;
