import React, { useState } from 'react';
import { Page, Navbar, Subnavbar, Searchbar, BlockTitle, List, ListItem } from 'framework7-react';
import { TRACKS, artistOf, GENRES, MOODS } from '../js/data';
import TrackList from '../components/track-list.jsx';

const SearchPage = () => {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const hits = s
    ? TRACKS.filter((t) => `${t.title} ${artistOf(t).name} ${t.genre} ${t.moods.join(' ')} ${t.key}`.toLowerCase().includes(s))
    : [];
  return (
    <Page name="search">
      <Navbar title="搜索">
        <Subnavbar inner={false}>
          <Searchbar
            customSearch
            disableButton={false}
            placeholder="曲名、音乐人、类型、情绪"
            onSearchbarSearch={(sb, query) => setQ(query)}
            onSearchbarClear={() => setQ('')}
          />
        </Subnavbar>
      </Navbar>

      {s ? (
        <>
          <BlockTitle>{hits.length} 首曲目</BlockTitle>
          <TrackList tracks={hits} empty={`没有找到“${q.trim()}”。换个曲名、音乐人或情绪试试。`} />
        </>
      ) : (
        <>
          <BlockTitle>类型</BlockTitle>
          <List strong inset dividersIos>
            {GENRES.map((g, i) => (
              <ListItem key={g} link={`/collection/genre/${i}/`} title={g} after={`${TRACKS.filter((t) => t.genre === g).length} 首`} />
            ))}
          </List>
          <BlockTitle>情绪</BlockTitle>
          <List strong inset dividersIos>
            {MOODS.map((m, i) => (
              <ListItem key={m} link={`/collection/mood/${i}/`} title={m} after={`${TRACKS.filter((t) => t.moods.includes(m)).length} 首`} />
            ))}
          </List>
        </>
      )}
    </Page>
  );
};

export default SearchPage;
