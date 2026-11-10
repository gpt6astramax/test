import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Big, Eyebrow, RootHead, Section, Rows, Chip, Chips, Tile, Tiles, Cover } from '../ui/parts';
import { Tap } from '../ui/Tap';
import { Icon } from '../ui/Icon';
import { Wave } from '../ui/Wave';
import { useNav } from '../nav/DepthStackView';
import { byId, artistOf, MOODS, PLAYLISTS } from '../data';
import { acc } from '../art';
import { useStore, openPlayer, togglePlay } from '../state';

export default function Discover() {
  const nav = useNav();
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
          <Tap style={[S.play, { backgroundColor: acc(f.hue) }]} label={playing ? '暂停' : '播放'} onPress={() => togglePlay(f.id)}>
            <Icon name={playing ? 'pause' : 'play'} size={24} color="var(--on-acc)" />
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

const S = StyleSheet.create({
  feature: { gap: 14 },
  featureCover: { width: '100%', aspectRatio: 1.62, borderRadius: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureText: { flex: 1, minWidth: 0, gap: 2 },
  featureTitle: { fontFamily: 'var(--display)', fontSize: 27, lineHeight: 31, fontWeight: '300', letterSpacing: 0.3, color: 'var(--fg)' },
  featureSub: { fontFamily: 'var(--text)', fontSize: 14, lineHeight: 19, color: 'var(--fg2)' },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
