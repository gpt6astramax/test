import React from 'react';
import { List, ListItem, useStore } from 'framework7-react';
import { artistOf, mmss } from '../js/data';
import { trackCover, bg } from '../js/art';

// A list of tracks: cover, title, artist and genre, tempo and length. A row opens the track's page.
const TrackList = ({ tracks, empty = '这里还没有曲目。' }) => {
  const playing = useStore('playing');
  if (!tracks.length) {
    return (
      <List strong inset dividersIos>
        <ListItem title={empty} />
      </List>
    );
  }
  return (
    <List mediaList strong inset dividersIos>
      {tracks.map((t) => (
        <ListItem
          key={t.id}
          link={`/track/${t.id}/`}
          title={t.title}
          subtitle={`${artistOf(t).name} · ${t.genre}`}
          after={`${t.bpm} BPM`}
          text={playing === t.id ? `正在播放 · ${mmss(t.dur)}` : mmss(t.dur)}
        >
          <span slot="media" className="cover cover-row" style={bg(trackCover(t))} />
        </ListItem>
      ))}
    </List>
  );
};

export default TrackList;
