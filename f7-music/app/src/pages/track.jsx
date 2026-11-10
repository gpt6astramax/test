import React, { useState } from 'react';
import { Page, Navbar, NavRight, Block, BlockTitle, BlockFooter, Button, Link, List, ListItem, Toggle, f7, useStore } from 'framework7-react';
import store from '../js/store';
import { byId, artistOf, mmss, MOODS, GENRES, STEMS, similar } from '../js/data';
import { trackCover, bg } from '../js/art';
import TrackList from '../components/track-list.jsx';

const TrackPage = ({ f7route }) => {
  const t = byId[f7route.params.id];
  const liked = useStore('liked');
  const playing = useStore('playing');
  const [stems, setStems] = useState(() => STEMS.map(() => true));
  if (!t) {
    return (
      <Page>
        <Navbar title="找不到曲目" backLink="返回" />
        <Block strong inset>这首曲目不存在。</Block>
      </Page>
    );
  }
  const a = artistOf(t);
  const isLiked = liked.includes(t.id);
  const toast = (text) => f7.toast.create({ text, closeTimeout: 1600, position: 'center' }).open();

  return (
    <Page name="track">
      <Navbar title={t.title} backLink="返回">
        <NavRight>
          <Link
            iconF7={isLiked ? 'heart_fill' : 'heart'}
            onClick={() => { store.dispatch('toggleLike', t.id); toast(isLiked ? '已取消收藏' : '已收藏'); }}
          />
        </NavRight>
      </Navbar>

      <Block>
        <span className="cover cover-hero" style={bg(trackCover(t))} />
        <p className="eyebrow">{t.genre} · {t.year}</p>
        <h1 className="track-title">{t.title}</h1>
        <p className="track-by"><Link href={`/artist/${a.id}/`}>{a.name}</Link></p>
      </Block>

      <Block>
        <div className="grid grid-cols-2 grid-gap">
          <Button fill large round onClick={() => store.dispatch('togglePlay', t.id)}>
            {playing === t.id ? '暂停' : '播放'}
          </Button>
          <Button tonal large round onClick={() => toast('已加入下载队列 · WAV')}>下载</Button>
        </div>
      </Block>

      <List strong inset dividersIos>
        <ListItem title="BPM" after={String(t.bpm)} />
        <ListItem title="调性" after={t.key} />
        <ListItem title="时长" after={mmss(t.dur)} />
        <ListItem title="能量" after={`${t.energy} / 5`} />
      </List>

      <BlockTitle>类型和情绪</BlockTitle>
      <Block>
        <div className="chips">
          <Button fill round small href={`/collection/genre/${GENRES.indexOf(t.genre)}/`}>{t.genre}</Button>
          {t.moods.map((m) => (
            <Button key={m} tonal round small href={`/collection/mood/${MOODS.indexOf(m)}/`}>{m}</Button>
          ))}
        </div>
      </Block>

      <BlockTitle>分轨</BlockTitle>
      <List strong inset dividersIos>
        {STEMS.map((s, i) => (
          <ListItem key={s} title={s}>
            <Toggle
              slot="after"
              defaultChecked
              onToggleChange={(checked) => setStems((cur) => cur.map((v, j) => (j === i ? checked : v)))}
            />
          </ListItem>
        ))}
      </List>
      <BlockFooter>已打开 {stems.filter(Boolean).length} / {STEMS.length} 轨。四条分轨和完整混音一起下载，可以单独关掉任何一轨来让出旁白。</BlockFooter>

      <BlockTitle>相似曲目</BlockTitle>
      <TrackList tracks={similar(t)} />
    </Page>
  );
};

export default TrackPage;
