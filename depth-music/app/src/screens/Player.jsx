// What the player sheet shows: the track that is playing. Tapping another track here changes the track in place;
// the artist and the tags close the sheet and open their page in the tab underneath.
import * as React from 'react';
import { View, Text } from 'react-native';
import { Eyebrow, Fine, Title, Section, Rows, Chip, Chips, Cover } from '../ui/parts';
import { Tap } from '../ui/Tap';
import { Icon } from '../ui/Icon';
import { Wave, Played } from '../ui/Wave';
import { themed } from '../ui/themed';
import { useColors } from '../ui/theme';
import { byId, artistOf, mmss, MOODS, GENRES, STEMS, similar } from '../data';
import { useStore, togglePlay, toggleLike, step, toast } from '../state';

export default function Player({ onNavigate }) {
  const S = useS();
  const c = useColors();
  const id = useStore((s) => s.cur);
  const playing = useStore((s) => s.playing);
  const liked = useStore((s) => !!s.liked[id]);
  const t = byId[id];
  const a = artistOf(t);
  const [stems, setStems] = React.useState(() => STEMS.map(() => true));
  React.useEffect(() => { setStems(STEMS.map(() => true)); }, [id]);
  const A = c.acc(t.hue);

  return (
    <>
      <View style={S.hero}>
        <Cover track={t} style={S.cover} />
        <View style={{ gap: 6 }}>
          <Eyebrow>{t.genre} · {t.year}</Eyebrow>
          <Title>{t.title}</Title>
          <Tap style={S.by} onPress={() => onNavigate('artist', { id: a.id })}>
            <Text style={S.byText}>{a.name}</Text>
            <Icon name="go" size={16} color={c.fg2} />
          </Tap>
        </View>
      </View>

      <View>
        <Wave track={t} seekable />
        <View style={S.times}>
          <Played track={t} style={S.time} />
          <Text style={S.time}>{mmss(t.dur)}</Text>
        </View>
      </View>

      <View style={S.transport}>
        <Tap style={S.side} label="上一首" onPress={() => step(-1)}><Icon name="prev" size={26} color={c.fg} /></Tap>
        <Tap style={[S.playBig, { backgroundColor: A }]} label={playing ? '暂停' : '播放'} onPress={() => togglePlay()}>
          <Icon name={playing ? 'pause' : 'play'} size={30} color={c.onAcc} />
        </Tap>
        <Tap style={S.side} label="下一首" onPress={() => step(1)}><Icon name="next" size={26} color={c.fg} /></Tap>
      </View>

      <View style={S.actions}>
        <Tap style={[S.btn, liked && { borderColor: c.like }]} label={liked ? '取消收藏' : '收藏'} onPress={() => toggleLike(t.id)}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={20} color={liked ? c.like : c.fg} />
          <Text style={S.btnText}>{liked ? '已收藏' : '收藏'}</Text>
        </Tap>
        <Tap style={S.btn} onPress={() => toast('已加入下载队列 · WAV')}>
          <Icon name="down" size={20} color={c.fg} />
          <Text style={S.btnText}>下载</Text>
        </Tap>
        <Tap style={S.btn} onPress={() => toast('已加入“清晨剪辑”')}>
          <Icon name="plus" size={20} color={c.fg} />
          <Text style={S.btnText}>歌单</Text>
        </Tap>
      </View>

      <View style={S.facts}>
        {[['BPM', String(t.bpm)], ['调性', t.key], ['时长', mmss(t.dur)]].map(([k, v]) => (
          <View key={k} style={S.fact}>
            <Text style={S.factKey}>{k}</Text>
            <Text style={S.factVal}>{v}</Text>
          </View>
        ))}
        <View style={S.fact}>
          <Text style={S.factKey}>能量</Text>
          <View style={S.dots} accessibilityLabel={`${t.energy} / 5`}>
            {[1, 2, 3, 4, 5].map((i) => <View key={i} style={[S.dot, { backgroundColor: i <= t.energy ? A : c.waveRest }]} />)}
          </View>
        </View>
      </View>

      <Chips>
        <Chip text={t.genre} hue={t.hue} onPress={() => onNavigate('collection', { kind: 'genre', id: String(GENRES.indexOf(t.genre)) })} />
        {t.moods.map((m) => <Chip key={m} text={m} onPress={() => onNavigate('collection', { kind: 'mood', id: String(MOODS.indexOf(m)) })} />)}
      </Chips>

      <Section title="分轨">
        <View>
          {STEMS.map((s, i) => (
            <View key={s} style={[S.stem, i === STEMS.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={S.stemName}>{s}</Text>
              <View style={{ flex: 1, minWidth: 0, opacity: stems[i] ? 1 : 0.3 }}>
                <Wave track={t} bars={56} variant={i + 1} height={24} />
              </View>
              <Tap style={[S.sw, stems[i] && { backgroundColor: c.accSoft(t.hue), borderColor: 'transparent' }]} label={`${s}轨`}
                onPress={() => setStems((cur) => cur.map((v, j) => (j === i ? !v : v)))}>
                <Text style={[S.swText, stems[i] && { color: A }]}>{stems[i] ? '开' : '关'}</Text>
              </Tap>
            </View>
          ))}
        </View>
        <Fine>四条分轨和完整混音一起下载，可以单独关掉任何一轨来让出旁白。</Fine>
      </Section>

      <Section title="相似曲目">
        <Rows tracks={similar(t)} />
      </Section>
      <Fine>订阅期内发布的作品永久有效，覆盖你已授权的频道。</Fine>
    </>
  );
}

const useS = themed((c, f) => ({
  hero: { gap: 16 },
  cover: { width: '62%', aspectRatio: 1, borderRadius: 20, boxShadow: c.lift },
  by: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  byText: { ...f.text, fontSize: 16, lineHeight: 22, color: c.fg2 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { ...f.text, fontSize: 12.5, lineHeight: 16, color: c.fg2, fontVariant: ['tabular-nums'] },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30 },
  side: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  playBig: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.hair },
  btnText: { ...f.text, fontSize: 14.5, lineHeight: 18, color: c.fg },
  facts: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hair },
  fact: { flex: 1, minWidth: 0, paddingVertical: 12, gap: 3 },
  factKey: { ...f.text, fontSize: 11.5, lineHeight: 15, letterSpacing: 0.8, color: c.fg2 },
  factVal: { ...f.display, fontSize: 18, lineHeight: 22, color: c.fg, fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 4, height: 22, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.hair },
  stemName: { ...f.text, width: 42, fontSize: 14, lineHeight: 18, color: c.fg },
  sw: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: c.hair },
  swText: { ...f.text, fontSize: 12, lineHeight: 14, color: c.fg2 },
}));
