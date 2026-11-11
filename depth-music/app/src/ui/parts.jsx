// The pieces screens are made of. Plain React Native, the same file on the web, iOS and Android: colours and type
// come from the theme (ui/theme, ui/fonts), everything platform-bound is behind a component (Tap, Icon, CoverArt, Glass).
import * as React from 'react';
import { View, Text } from 'react-native';
import { Tap } from './Tap';
import { Icon } from './Icon';
import { Glass } from './Glass';
import { CoverArt } from './Cover';
import { themed } from './themed';
import { useColors, useThemeSwitch, ThemeGlyph } from './theme';
import { artistOf, byId, mmss } from '../data';
import { trackSeed, artistSeed } from '../artdata';
import { useStore, openPlayer, toggleLike } from '../state';

// ---- type
export const Big = ({ children }) => <Text accessibilityRole="header" style={useS().big}>{children}</Text>;
export const Eyebrow = ({ children, style }) => <Text style={[useS().eyebrow, style]}>{children}</Text>;
export const Lede = ({ children, style }) => <Text style={[useS().lede, style]}>{children}</Text>;
export const Fine = ({ children, style }) => <Text style={[useS().fine, style]}>{children}</Text>;
export const Title = ({ children, size = 34 }) => (
  <Text accessibilityRole="header" style={[useS().title, { fontSize: size, lineHeight: Math.round(size * 1.1) }]}>{children}</Text>
);

export function Section({ title, children }) {
  const S = useS();
  return (
    <View style={S.sec}>
      {title ? <Text style={S.secTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** The head of a tab's first page: the big title, and the button that switches between the light and the dark theme. */
export function RootHead({ children }) {
  const S = useS();
  const anchor = React.useRef(null);
  const switchTheme = useThemeSwitch();
  return (
    <View style={S.rootHead}>
      <View style={S.head}>{children}</View>
      <View ref={anchor} collapsable={false}>
        <Tap label="切换浅色和深色" onPress={() => switchTheme(anchor)}>
          <Glass radius={21} style={S.round}><ThemeGlyph /></Glass>
        </Tap>
      </View>
    </View>
  );
}

// ---- covers
export const Cover = ({ track, style }) => <CoverArt hue={track.hue} seed={trackSeed(track)} style={[useS().cover, style]} />;
export const ArtistDisc = ({ artist, size = 92 }) => (
  <CoverArt hue={artist.hue + 20} seed={artistSeed(artist)} style={{ width: size, height: size, borderRadius: size / 2 }} />
);
/** Up to four covers as one picture: four in a 2 x 2 grid, two or three side by side (the first two), one on its own. */
export function Mosaic({ ids, style }) {
  const S = useS();
  const shown = ids.length >= 4 ? ids.slice(0, 4) : ids.slice(0, Math.min(2, ids.length));
  const cell = shown.length === 4 ? S.mosaicCell : { width: `${100 / shown.length}%`, height: '100%' };
  return (
    <View style={[S.mosaic, style]}>
      {shown.map((id) => <CoverArt key={id} hue={byId[id].hue} seed={trackSeed(byId[id])} style={cell} />)}
    </View>
  );
}

// ---- a track in a list: cover, title, artist; then only its length and a heart (empty, or pink once liked).
// A tap anywhere on the row plays it and brings the player up from below.
export function TrackRow({ track, last }) {
  const S = useS();
  const c = useColors();
  const current = useStore((s) => s.cur === track.id);
  const liked = useStore((s) => !!s.liked[track.id]);
  return (
    <View style={[S.row, last && S.rowLast]}>
      <Tap style={S.rowMain} label={`播放 ${track.title}`} onPress={() => openPlayer(track.id)}>
        <Cover track={track} style={S.coverSm} />
        <View style={S.rowText}>
          <Text style={[S.rowTitle, current && { color: c.acc(track.hue) }]}>{track.title}</Text>
          <Text style={S.rowSub}>{artistOf(track).name} · {track.genre}</Text>
        </View>
        <Text style={S.rowTime}>{mmss(track.dur)}</Text>
      </Tap>
      <Tap style={S.heart} label={liked ? '取消收藏' : '收藏'} onPress={() => toggleLike(track.id)}>
        <Icon name={liked ? 'heartFill' : 'heart'} size={22} color={liked ? c.like : c.fg3} />
      </Tap>
    </View>
  );
}
export function Rows({ tracks, empty = '这里还没有曲目。' }) {
  const S = useS();
  if (!tracks.length) return <Text style={S.empty}>{empty}</Text>;
  return <View>{tracks.map((t, i) => <TrackRow key={t.id} track={t} last={i === tracks.length - 1} />)}</View>;
}

// ---- chips, tiles, link rows
export function Chip({ text, onPress, hue }) {
  const S = useS();
  const c = useColors();
  return (
    <Tap onPress={onPress} style={[S.chip, hue != null && { borderColor: 'transparent', backgroundColor: c.accSoft(hue) }]}>
      <Text style={[S.chipText, hue != null && { color: c.acc(hue) }]}>{text}</Text>
    </Tap>
  );
}
export const Chips = ({ children }) => <View style={useS().chips}>{children}</View>;

export function Tile({ playlist, onPress }) {
  const S = useS();
  return (
    <Tap onPress={onPress} style={S.tile}>
      <Mosaic ids={playlist.ids} />
      <Text style={S.tileName}>{playlist.name}</Text>
      <Text style={S.tileNote}>{playlist.note} · {playlist.ids.length} 首</Text>
    </Tap>
  );
}
export const Tiles = ({ children }) => <View style={useS().tiles}>{children}</View>;

export function LinkRow({ title, note, onPress, last }) {
  const S = useS();
  const c = useColors();
  return (
    <Tap onPress={onPress} style={[S.linkRow, last && S.rowLast]}>
      <Text style={S.linkTitle}>{title}</Text>
      <Text style={S.linkNote}>{note}</Text>
      <Icon name="go" size={18} color={c.fg3} />
    </Tap>
  );
}

export function Stats({ items }) {
  const S = useS();
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
  const S = useS();
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

const useS = themed((c, f) => ({
  big: { ...f.display, fontSize: 36, lineHeight: 42, letterSpacing: 1, color: c.fg },
  title: { ...f.display, letterSpacing: 0.4, color: c.fg },
  eyebrow: { ...f.text, fontSize: 11.5, lineHeight: 15, letterSpacing: 1.6, textTransform: 'uppercase', color: c.fg2 },
  lede: { ...f.text, fontSize: 15, lineHeight: 23, color: c.fg2 },
  fine: { ...f.text, fontSize: 12.5, lineHeight: 19, color: c.fg3 },
  sec: { gap: 12 },
  secTitle: { ...f.text, fontSize: 12.5, lineHeight: 16, letterSpacing: 2, color: c.fg2 },
  head: { gap: 6, flexShrink: 1, minWidth: 0 },
  rootHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  round: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },

  cover: { borderRadius: 14, backgroundColor: c.fill },
  coverSm: { width: 52, height: 52, borderRadius: 11 },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', aspectRatio: 1.5, borderRadius: 14, overflow: 'hidden' },
  mosaicCell: { width: '50%', height: '50%' },

  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.hair },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...f.text, fontSize: 16.5, lineHeight: 21, color: c.fg },
  rowSub: { ...f.text, fontSize: 13, lineHeight: 18, color: c.fg2 },
  rowTime: { ...f.text, fontSize: 13, lineHeight: 18, color: c.fg2, fontVariant: ['tabular-nums'] },
  heart: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  empty: { ...f.text, fontSize: 15, lineHeight: 23, color: c.fg2, paddingVertical: 10 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.hair },
  chipText: { ...f.text, fontSize: 14, lineHeight: 18, color: c.fg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  tile: { width: '48%', gap: 8 },
  tileName: { ...f.text, fontSize: 15, lineHeight: 19, color: c.fg },
  tileNote: { ...f.text, fontSize: 12.5, lineHeight: 17, color: c.fg2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.hair },
  linkTitle: { ...f.text, flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21, color: c.fg },
  linkNote: { ...f.text, fontSize: 13, lineHeight: 18, color: c.fg2, fontVariant: ['tabular-nums'] },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 26 },
  stat: { gap: 2 },
  statValue: { ...f.display, fontSize: 24, lineHeight: 28, color: c.fg, fontVariant: ['tabular-nums'] },
  statLabel: { ...f.text, fontSize: 12, lineHeight: 16, color: c.fg2 },

  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.hair },
  setText: { flex: 1, minWidth: 0 },
  setTitle: { ...f.text, fontSize: 15, lineHeight: 21, color: c.fg },
  setNote: { ...f.text, fontSize: 12.5, lineHeight: 18, color: c.fg2 },
}));
