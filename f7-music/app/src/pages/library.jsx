import React from 'react';
import { Page, Navbar, BlockTitle, List, ListItem, useStore } from 'framework7-react';
import { TRACKS, byId, PLAYLISTS } from '../js/data';
import { trackCover, bg } from '../js/art';
import TrackList from '../components/track-list.jsx';

const LibraryPage = () => {
  const liked = useStore('liked');
  const tracks = TRACKS.filter((t) => liked.includes(t.id));
  return (
    <Page name="library">
      <Navbar title="曲库" large />

      <BlockTitle>收藏的曲目</BlockTitle>
      <TrackList tracks={tracks} empty="还没有收藏。在曲目页点右上角的心形，它就会出现在这里。" />

      <BlockTitle>歌单</BlockTitle>
      <List mediaList strong inset dividersIos>
        {PLAYLISTS.map((p) => (
          <ListItem key={p.id} link={`/collection/playlist/${p.id}/`} title={p.name} subtitle={p.note} after={`${p.ids.length} 首`}>
            <span slot="media" className="mosaic">
              {p.ids.slice(0, 4).map((id) => <i key={id} style={bg(trackCover(byId[id]))} />)}
            </span>
          </ListItem>
        ))}
      </List>

      <BlockTitle>最近下载</BlockTitle>
      <TrackList tracks={[byId.t10, byId.t3]} />
    </Page>
  );
};

export default LibraryPage;
