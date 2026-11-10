import React from 'react';
import { Page, Navbar, Block, BlockTitle, Button, Card, CardContent, CardFooter, Link, List, ListItem, useStore } from 'framework7-react';
import store from '../js/store';
import { byId, artistOf, MOODS, PLAYLISTS } from '../js/data';
import { trackCover, bg } from '../js/art';
import TrackList from '../components/track-list.jsx';

const HomePage = () => {
  const playing = useStore('playing');
  const f = byId.t7;
  return (
    <Page name="home">
      {/* Top Navbar */}
      <Navbar title="发现" large />

      <Card>
        <CardContent>
          <Link href={`/track/${f.id}/`} style={{ display: 'block' }}>
            <span className="cover cover-feature" style={bg(trackCover(f))} />
          </Link>
          <p className="eyebrow" style={{ marginTop: 14 }}>本周主打 · {f.genre}</p>
          <p className="track-title" style={{ fontSize: 24 }}>{f.title}</p>
          <p className="track-by">{artistOf(f).name} · {f.bpm} BPM · {f.key}</p>
        </CardContent>
        <CardFooter>
          <Link href={`/track/${f.id}/`}>查看曲目</Link>
          <Button fill round small onClick={() => store.dispatch('togglePlay', f.id)}>
            {playing === f.id ? '暂停' : '播放'}
          </Button>
        </CardFooter>
      </Card>

      <BlockTitle>按情绪找</BlockTitle>
      <Block>
        <div className="chips">
          {MOODS.slice(0, 8).map((m, i) => (
            <Button key={m} tonal round small href={`/collection/mood/${i}/`}>{m}</Button>
          ))}
        </div>
      </Block>

      <BlockTitle>新上架</BlockTitle>
      <TrackList tracks={[byId.t2, byId.t4, byId.t9, byId.t1, byId.t8]} />

      <BlockTitle>按场景配好的歌单</BlockTitle>
      <List mediaList strong inset dividersIos>
        {PLAYLISTS.map((p) => (
          <ListItem key={p.id} link={`/collection/playlist/${p.id}/`} title={p.name} subtitle={p.note} after={`${p.ids.length} 首`}>
            <span slot="media" className="mosaic">
              {p.ids.slice(0, 4).map((id) => <i key={id} style={bg(trackCover(byId[id]))} />)}
            </span>
          </ListItem>
        ))}
      </List>
    </Page>
  );
};

export default HomePage;
