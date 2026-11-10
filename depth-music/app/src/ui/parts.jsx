// The pieces screens are made of. React Native components; every colour is a token from styles.css.
import * as React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Tap } from './Tap';
import { Icon } from './Icon';
import { artistOf, byId, mmss } from '../data';
import { trackCover, acc, accSoft } from '../art';
import { useStore, openPlayer, toggleLike } from '../state';
import { switchTheme } from './theme';

const DISPLAY = 'var(--display)', TEXT = 'var(--text)';

// ---- type
export const Big = ({ children }) => <Text accessibilityRole="header" style={S.big}>{children}</Text>;
export const Eyebrow = ({ children, style }) => <Text style={[S.eyebrow, style]}>{children}</Text>;
export const Lede = ({ children, style }) => <Text style={[S.lede, style]}>{children}</Text>;
export const Fine = ({ children, style }) => <Text style={[S.fine, style]}>{children}</Text>;
export const Title = ({ children, size = 34 }) => <Text accessibilityRole="header" style={[S.title, { fontSize: size, lineHeight: size * 1.08 }]}>{children}</Text>;

export function Section({ title, children }) {
  return (
    <View style={S.sec}>
      {title ? <Text style={S.secTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** The head of a tab's first page: the big title, and the button that switches between the light and the dark theme. */
export function RootHead({ children }) {
  const btn = React.useRef(null);
  return (
    <View style={S.rootHead}>
      <View style={S.head}>{children}</View>
      <View ref={btn}>
        <Tap label="切换浅色和深色" style={S.round} onPress={() => switchTheme(btn.current)}>
          <View style={[S.round, S.glass]}>
            <Icon name="moon" size={20} className="i-moon" color="var(--fg)" />
            <Icon name="sun" size={21} className="i-sun" color="var(--fg)" />
          </View>
        </Tap>
      </View>
    </View>
  );
}

// ---- covers
export const Cover = ({ track, style }) => <Image source={{ uri: trackCover(track) }} style={[S.cover, style]} accessibilityIgnoresInvertColors />;
export function Mosaic({ ids, style }) {
  return (
    <View style={[S.mosaic, style]}>
      {ids.slice(0, 4).map((id) => <Image key={id} source={{ uri: trackCover(byId[id]) }} style={S.mosaicCell} />)}
    </View>
  );
}

// ---- a track in a list: cover, title, artist; then only its length and a heart (empty, or pink once liked).
// A tap anywhere on the row plays it and brings the player up from below.
export function TrackRow({ track, last }) {
  const current = useStore((s) => s.cur === track.id);
  const liked = useStore((s) => !!s.liked[track.id]);
  return (
    <View style={[S.row, last && S.rowLast]}>
      <Tap style={S.rowMain} label={`播放 ${track.title}`} onPress={() => openPlayer(track.id)}>
        <Cover track={track} style={S.coverSm} />
        <View style={S.rowText}>
          <Text style={[S.rowTitle, current && { color: acc(track.hue) }]}>{track.title}</Text>
          <Text style={S.rowSub}>{artistOf(track).name} · {track.genre}</Text>
        </View>
        <Text style={S.rowTime}>{mmss(track.dur)}</Text>
      </Tap>
      <Tap style={S.heart} label={liked ? '取消收藏' : '收藏'} onPress={() => toggleLike(track.id)}>
        <Icon name={liked ? 'heartFill' : 'heart'} size={22} color={liked ? 'var(--like)' : 'var(--fg3)'} />
      </Tap>
    </View>
  );
}
export function Rows({ tracks, empty = '这里还没有曲目。' }) {
  if (!tracks.length) return <Text style={S.empty}>{empty}</Text>;
  return <View>{tracks.map((t, i) => <TrackRow key={t.id} track={t} last={i === tracks.length - 1} />)}</View>;
}

// ---- chips, tiles, link rows
export function Chip({ text, onPress, hue }) {
  return (
    <Tap onPress={onPress} style={[S.chip, hue != null && { borderColor: 'transparent', backgroundColor: accSoft(hue) }]}>
      <Text style={[S.chipText, hue != null && { color: acc(hue) }]}>{text}</Text>
    </Tap>
  );
}
export const Chips = ({ children }) => <View style={S.chips}>{children}</View>;

export function Tile({ playlist, onPress }) {
  return (
    <Tap onPress={onPress} style={S.tile}>
      <Mosaic ids={playlist.ids} />
      <Text style={S.tileName}>{playlist.name}</Text>
      <Text style={S.tileNote}>{playlist.note} · {playlist.ids.length} 首</Text>
    </Tap>
  );
}
export const Tiles = ({ children }) => <View style={S.tiles}>{children}</View>;

export function LinkRow({ title, note, onPress, last }) {
  return (
    <Tap onPress={onPress} style={[S.linkRow, last && S.rowLast]}>
      <Text style={S.linkTitle}>{title}</Text>
      <Text style={S.linkNote}>{note}</Text>
      <Icon name="go" size={18} color="var(--fg3)" />
    </Tap>
  );
}

export function Stats({ items }) {
  return (
    <View style={S.stats}>
      {items.map(([value, label]) => (
        <View key={label} style={S.stat}>
          <Text style={S.statValue}>{value}</Text>
          <Text style={S.statLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A settings row: what it is on the left, a control on the right. */
export function SetRow({ title, note, children, last }) {
  return (
    <View style={[S.setRow, last && S.rowLast]}>
      <View style={S.setText}>
        <Text style={S.setTitle}>{title}</Text>
        {note ? <Text style={S.setNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export const S = StyleSheet.create({
  big: { fontFamily: DISPLAY, fontSize: 36, lineHeight: 42, fontWeight: '300', letterSpacing: 1, color: 'var(--fg)' },
  title: { fontFamily: DISPLAY, fontWeight: '300', letterSpacing: 0.4, color: 'var(--fg)' },
  eyebrow: { fontFamily: TEXT, fontSize: 11.5, lineHeight: 15, fontWeight: '400', letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--fg2)' },
  lede: { fontFamily: TEXT, fontSize: 15, lineHeight: 23, color: 'var(--fg2)' },
  fine: { fontFamily: TEXT, fontSize: 12.5, lineHeight: 19, color: 'var(--fg3)' },
  sec: { gap: 12 },
  secTitle: { fontFamily: TEXT, fontSize: 12.5, lineHeight: 16, fontWeight: '400', letterSpacing: 2, color: 'var(--fg2)' },
  head: { gap: 6, flexShrink: 1, minWidth: 0 },
  rootHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  glass: { borderWidth: 1, borderColor: 'var(--glass-edge)', backgroundColor: 'var(--glass)', boxShadow: 'var(--lift)', backdropFilter: 'blur(26px) saturate(1.7)', WebkitBackdropFilter: 'blur(26px) saturate(1.7)' },

  cover: { borderRadius: 14, backgroundColor: 'var(--fill)' },
  coverSm: { width: 52, height: 52, borderRadius: 11 },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', aspectRatio: 1.5, borderRadius: 14, overflow: 'hidden' },
  mosaicCell: { width: '50%', height: '50%' },

  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'var(--hair)' },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontFamily: DISPLAY, fontSize: 16.5, lineHeight: 21, fontWeight: '400', color: 'var(--fg)' },
  rowSub: { fontFamily: TEXT, fontSize: 13, lineHeight: 18, color: 'var(--fg2)' },
  rowTime: { fontFamily: TEXT, fontSize: 13, lineHeight: 18, color: 'var(--fg2)', fontVariant: ['tabular-nums'] },
  heart: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  empty: { fontFamily: TEXT, fontSize: 15, lineHeight: 23, color: 'var(--fg2)', paddingVertical: 10 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'var(--hair)' },
  chipText: { fontFamily: TEXT, fontSize: 14, lineHeight: 18, color: 'var(--fg)' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 18 },
  tile: { width: 'calc(50% - 7px)', gap: 8 },
  tileName: { fontFamily: TEXT, fontSize: 15, lineHeight: 19, fontWeight: '400', color: 'var(--fg)' },
  tileNote: { fontFamily: TEXT, fontSize: 12.5, lineHeight: 17, color: 'var(--fg2)' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'var(--hair)' },
  linkTitle: { flex: 1, minWidth: 0, fontFamily: TEXT, fontSize: 16, lineHeight: 21, color: 'var(--fg)' },
  linkNote: { fontFamily: TEXT, fontSize: 13, lineHeight: 18, color: 'var(--fg2)', fontVariant: ['tabular-nums'] },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 26 },
  stat: { gap: 2 },
  statValue: { fontFamily: DISPLAY, fontSize: 24, lineHeight: 28, fontWeight: '300', color: 'var(--fg)', fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: TEXT, fontSize: 12, lineHeight: 16, color: 'var(--fg2)' },

  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'var(--hair)' },
  setText: { flex: 1, minWidth: 0 },
  setTitle: { fontFamily: TEXT, fontSize: 15, lineHeight: 21, color: 'var(--fg)' },
  setNote: { fontFamily: TEXT, fontSize: 12.5, lineHeight: 18, color: 'var(--fg2)' },
});
