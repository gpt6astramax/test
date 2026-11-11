import * as React from 'react';
import { View, TextInput } from 'react-native';
import { Big, RootHead, Section, Rows, Chip, Chips, LinkRow } from '../ui/parts';
import { Icon } from '../ui/Icon';
import { themed } from '../ui/themed';
import { useColors } from '../ui/theme';
import { useNav } from '../nav/context';
import { TRACKS, artistOf, GENRES, MOODS } from '../data';

export default function Search() {
  const nav = useNav();
  const S = useS();
  const c = useColors();
  const [q, setQ] = React.useState('');
  const s = q.trim().toLowerCase();
  const hits = s ? TRACKS.filter((t) => `${t.title} ${artistOf(t).name} ${t.genre} ${t.moods.join(' ')} ${t.key}`.toLowerCase().includes(s)) : [];
  return (
    <>
      <RootHead><Big>搜索</Big></RootHead>

      <View style={S.field}>
        <Icon name="search" size={20} color={c.fg2} />
        {/* 16 px: anything smaller makes the iPhone zoom in when the field takes focus */}
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="曲名、音乐人、类型、情绪"
          placeholderTextColor={c.fg3}
          inputMode="search"
          enterKeyHint="search"
          autoCorrect={false}
          accessibilityLabel="搜索曲目"
          style={S.input}
        />
      </View>

      {s ? (
        <Section title={`${hits.length} 首曲目`}>
          <Rows tracks={hits} empty={`没有找到“${q.trim()}”。换个曲名、音乐人或情绪试试。`} />
        </Section>
      ) : (
        <>
          <Section title="类型">
            <View>
              {GENRES.map((g, i) => (
                <LinkRow key={g} title={g} note={`${TRACKS.filter((t) => t.genre === g).length} 首`} last={i === GENRES.length - 1}
                  onPress={() => nav.push('collection', { kind: 'genre', id: String(i) })} />
              ))}
            </View>
          </Section>
          <Section title="情绪">
            <Chips>
              {MOODS.map((m, i) => <Chip key={m} text={m} onPress={() => nav.push('collection', { kind: 'mood', id: String(i) })} />)}
            </Chips>
          </Section>
        </>
      )}
    </>
  );
}

const useS = themed((c, f) => ({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.fill, borderWidth: 1, borderColor: c.hair },
  input: { ...f.text, flex: 1, minWidth: 0, height: 46, fontSize: 16, color: c.fg, outlineStyle: 'none', userSelect: 'text' },
}));
