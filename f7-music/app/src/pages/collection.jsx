import React from 'react';
import { Page, Navbar, Block, BlockTitle, List, ListItem } from 'framework7-react';
import { collection, mmss } from '../js/data';
import TrackList from '../components/track-list.jsx';

const CollectionPage = ({ f7route }) => {
  const c = collection(f7route.params.kind, f7route.params.id);
  if (!c) {
    return (
      <Page>
        <Navbar title="找不到" backLink="返回" />
        <Block strong inset>这个合集不存在。</Block>
      </Page>
    );
  }
  const total = c.tracks.reduce((s, t) => s + t.dur, 0);
  return (
    <Page name="collection">
      <Navbar title={c.title} backLink="返回" large />
      <Block>
        <p className="eyebrow">{c.eyebrow}</p>
        <p>{c.note}</p>
      </Block>
      <List strong inset dividersIos>
        <ListItem title="曲目" after={`${c.tracks.length} 首`} />
        <ListItem title="总时长" after={mmss(total)} />
      </List>
      <BlockTitle>曲目</BlockTitle>
      <TrackList tracks={c.tracks} />
    </Page>
  );
};

export default CollectionPage;
