import * as React from 'react';
import { View } from 'react-native';
import { Eyebrow, Lede, Title, Section, Rows, Mosaic, Stats } from '../ui/parts';
import { collection, mmss } from '../data';

export default function Collection({ kind, id }) {
  const c = collection(kind, id);
  if (!c) return <Lede>这个合集不存在。</Lede>;
  const total = c.tracks.reduce((s, t) => s + t.dur, 0);
  return (
    <>
      <View style={{ gap: 6 }}>
        <Eyebrow>{c.eyebrow}</Eyebrow>
        <Title>{c.title}</Title>
        <Lede>{c.note}</Lede>
      </View>
      <Mosaic ids={c.tracks.map((t) => t.id)} style={{ aspectRatio: 2.2 }} />
      <Stats items={[[String(c.tracks.length), '首曲目'], [mmss(total), '总时长']]} />
      <Section title="曲目">
        <Rows tracks={c.tracks} />
      </Section>
    </>
  );
}
