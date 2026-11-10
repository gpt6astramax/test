import React from 'react';
import { Page, Navbar, Block, BlockTitle, Button, List, ListItem } from 'framework7-react';
import { ARTISTS, TRACKS, MOODS } from '../js/data';
import { artistCover, bg } from '../js/art';
import TrackList from '../components/track-list.jsx';

const ArtistPage = ({ f7route }) => {
  const a = ARTISTS[f7route.params.id];
  if (!a) {
    return (
      <Page>
        <Navbar title="找不到音乐人" backLink="返回" />
        <Block strong inset>这位音乐人不存在。</Block>
      </Page>
    );
  }
  const tracks = TRACKS.filter((t) => t.a === a.id);
  const moods = [...new Set(tracks.flatMap((t) => t.moods))];
  return (
    <Page name="artist">
      <Navbar title={a.name} backLink="返回" />
      <Block>
        <div className="who">
          <span className="cover cover-disc" style={bg(artistCover(a))} />
          <div>
            <p className="eyebrow">音乐人 · {a.from}</p>
            <h1 className="track-title" style={{ fontSize: 26 }}>{a.name}</h1>
          </div>
        </div>
        <p>{a.bio}</p>
      </Block>

      <List strong inset dividersIos>
        <ListItem title="曲目" after={`${tracks.length} 首`} />
        <ListItem title="入驻年份" after={String(a.since)} />
        <ListItem title="平均 BPM" after={String(Math.round(tracks.reduce((s, t) => s + t.bpm, 0) / tracks.length))} />
      </List>

      <BlockTitle>全部曲目</BlockTitle>
      <TrackList tracks={tracks} />

      <BlockTitle>常见情绪</BlockTitle>
      <Block>
        <div className="chips">
          {moods.map((m) => (
            <Button key={m} tonal round small href={`/collection/mood/${MOODS.indexOf(m)}/`}>{m}</Button>
          ))}
        </div>
      </Block>
    </Page>
  );
};

export default ArtistPage;
