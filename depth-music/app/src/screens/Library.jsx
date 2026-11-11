import * as React from 'react';
import { Big, Lede, RootHead, Section, Rows, Tile, Tiles } from '../ui/parts';
import { useNav } from '../nav/context';
import { TRACKS, byId, PLAYLISTS } from '../data';
import { useStore } from '../state';

export default function Library() {
  const nav = useNav();
  const liked = useStore((s) => s.liked);
  const tracks = TRACKS.filter((t) => liked[t.id]);
  return (
    <>
      <RootHead>
        <Big>曲库</Big>
        <Lede>收藏了 {tracks.length} 首，{PLAYLISTS.length} 个歌单。</Lede>
      </RootHead>
      <Section title="收藏的曲目">
        <Rows tracks={tracks} empty="还没有收藏。点任意曲目右边的心形，它就会出现在这里。" />
      </Section>
      <Section title="歌单">
        <Tiles>
          {PLAYLISTS.map((p) => <Tile key={p.id} playlist={p} onPress={() => nav.push('collection', { kind: 'playlist', id: p.id })} />)}
        </Tiles>
      </Section>
      <Section title="最近下载">
        <Rows tracks={[byId.t10, byId.t3]} />
      </Section>
    </>
  );
}
