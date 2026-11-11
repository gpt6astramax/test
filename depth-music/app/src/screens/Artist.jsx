import * as React from 'react';
import { View } from 'react-native';
import { Eyebrow, Lede, Title, Section, Rows, Chip, Chips, Stats, ArtistDisc } from '../ui/parts';
import { useNav } from '../nav/context';
import { ARTISTS, TRACKS, MOODS } from '../data';

export default function Artist({ id }) {
  const nav = useNav();
  const a = ARTISTS[id];
  if (!a) return <Lede>这位音乐人不存在。</Lede>;
  const tracks = TRACKS.filter((t) => t.a === a.id);
  const moods = [...new Set(tracks.flatMap((t) => t.moods))];
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ArtistDisc artist={a} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Eyebrow>音乐人 · {a.from}</Eyebrow>
          <Title size={30}>{a.name}</Title>
        </View>
      </View>
      <Lede>{a.bio}</Lede>
      <Stats items={[[String(tracks.length), '首曲目'], [String(a.since), '入驻年份'], [String(Math.round(tracks.reduce((s, t) => s + t.bpm, 0) / tracks.length)), '平均 BPM']]} />
      <Section title="全部曲目">
        <Rows tracks={tracks} />
      </Section>
      <Section title="常见情绪">
        <Chips>
          {moods.map((m) => <Chip key={m} text={m} onPress={() => nav.push('collection', { kind: 'mood', id: String(MOODS.indexOf(m)) })} />)}
        </Chips>
      </Section>
    </>
  );
}
