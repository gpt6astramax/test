// The fifth root page: stations that never stop. Built from the same parts as the other root pages.
import * as React from 'react';
import { Big, Eyebrow, Lede, RootHead, Section, Rows, Chip, Chips } from '../ui/parts';
import { useNav } from '../nav/context';
import { byId, MOODS, GENRES } from '../data';

export default function Radio() {
  const nav = useNav();
  return (
    <>
      <RootHead>
        <Eyebrow>24 小时不停</Eyebrow>
        <Big>电台</Big>
        <Lede>按情绪或流派开一个台，一直放下去。</Lede>
      </RootHead>
      <Section title="正在播">
        <Rows tracks={[byId.t5, byId.t3, byId.t6]} />
      </Section>
      <Section title="情绪电台">
        <Chips>
          {MOODS.map((m, i) => <Chip key={m} text={m} onPress={() => nav.push('collection', { kind: 'mood', id: String(i) })} />)}
        </Chips>
      </Section>
      <Section title="流派电台">
        <Chips>
          {GENRES.map((g, i) => <Chip key={g} text={g} onPress={() => nav.push('collection', { kind: 'genre', id: String(i) })} />)}
        </Chips>
      </Section>
      <Section title="稍后播">
        <Rows tracks={[byId.t10, byId.t2, byId.t8, byId.t1]} />
      </Section>
    </>
  );
}
