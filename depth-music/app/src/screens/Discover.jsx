import * as React from 'react';
import { View, Text } from 'react-native';
import { Big, Eyebrow, RootHead, Section, Rows, Chip, Chips, Tile, Tiles, Cover } from '../ui/parts';
import { Tap } from '../ui/Tap';
import { Icon } from '../ui/Icon';
import { Wave } from '../ui/Wave';
import { themed } from '../ui/themed';
import { useColors } from '../ui/theme';
import { useNav } from '../nav/context';
import { byId, artistOf, MOODS, PLAYLISTS } from '../data';
import { useStore, openPlayer, togglePlay } from '../state';

export default function Discover() {
  const nav = useNav();
  const S = useS();
  const c = useColors();
  const f = byId.t7;
  const playing = useStore((s) => s.cur === f.id && s.playing);
  return (
    <>
      <RootHead>
        <Eyebrow>2026 · 第 46 周</Eyebrow>
        <Big>发现</Big>
      </RootHead>

      <View style={S.feature}>
        <Tap label={`打开 ${f.title}`} onPress={() => openPlayer(f.id)}>
          <Cover track={f} style={S.featureCover} />
        </Tap>
        <View style={S.line}>
          <Tap style={S.featureText} onPress={() => openPlayer(f.id)}>
            <Eyebrow>本周主打 · {f.genre}</Eyebrow>
            <Text style={S.featureTitle}>{f.title}</Text>
            <Text style={S.featureSub}>{artistOf(f).name} · {f.bpm} BPM · {f.key}</Text>
          </Tap>
          <Tap style={[S.play, { backgroundColor: c.acc(f.hue) }]} label={playing ? '暂停' : '播放'} onPress={() => togglePlay(f.id)}>
            <Icon name={playing ? 'pause' : 'play'} size={24} color={c.onAcc} />
          </Tap>
        </View>
        <Wave track={f} height={54} seekable />
      </View>

      <Section title="按情绪找">
        <Chips>
          {MOODS.slice(0, 8).map((m, i) => <Chip key={m} text={m} onPress={() => nav.push('collection', { kind: 'mood', id: String(i) })} />)}
        </Chips>
      </Section>

      <Section title="新上架">
        <Rows tracks={[byId.t2, byId.t4, byId.t9, byId.t1, byId.t8]} />
      </Section>

      <Section title="按场景配好的歌单">
        <Tiles>
          {PLAYLISTS.map((p) => <Tile key={p.id} playlist={p} onPress={() => nav.push('collection', { kind: 'playlist', id: p.id })} />)}
        </Tiles>
      </Section>
    </>
  );
}

const useS = themed((c, f) => ({
  feature: { gap: 14 },
  featureCover: { width: '100%', aspectRatio: 1.62, borderRadius: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureText: { flex: 1, minWidth: 0, gap: 2 },
  featureTitle: { ...f.display, fontSize: 27, lineHeight: 31, letterSpacing: 0.3, color: c.fg },
  featureSub: { ...f.text, fontSize: 14, lineHeight: 19, color: c.fg2 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
}));
