// The app: four tabs, each a depth stack of its own; the tab row floating in front; the player as a sheet over it all.
import * as React from 'react';
import { DepthStackView } from './nav/DepthStackView';
import { DotTabBar } from './ui/DotTabBar';
import { PlayerSheet } from './ui/PlayerSheet';
import { MiniPlayer } from './ui/MiniPlayer';
import { Icon } from './ui/Icon';
import Discover from './screens/Discover';
import Search from './screens/Search';
import Library from './screens/Library';
import Me from './screens/Me';
import Artist from './screens/Artist';
import Collection from './screens/Collection';
import Player from './screens/Player';
import { useStore, set, closePlayer } from './state';

const SCREENS = { artist: Artist, collection: Collection };
const TABS = [
  { key: 'discover', label: '发现', icon: <Icon name="compass" size={25} />, root: Discover },
  { key: 'search', label: '搜索', icon: <Icon name="search" size={25} />, root: Search },
  { key: 'library', label: '曲库', icon: <Icon name="stack" size={25} />, root: Library },
  { key: 'me', label: '我的', icon: <Icon name="user" size={25} />, root: Me },
];

export default function App() {
  const tab = useStore((s) => s.tab);
  const bar = useStore((s) => s.bar);
  const player = useStore((s) => s.player);
  const message = useStore((s) => s.toast);
  const stacks = React.useRef([]);
  const under = React.useRef(null);
  const pending = React.useRef(null);           // a page to open once the player has gone

  React.useLayoutEffect(() => { document.getElementById('app').classList.toggle('has-bar', bar); }, [bar]);
  // A drag that starts on the floating chrome scrolls nothing, and must not be handed to the document either (it
  // would take the whole screen with it). The play bar is a gesture of its own and keeps its drags.
  const chrome = React.useRef(null);
  React.useEffect(() => {
    const el = chrome.current;
    const stop = (e) => { if (e.cancelable && !(e.target.closest && e.target.closest('.sg'))) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop, { passive: false });
  }, []);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !player && stacks.current[tab] && stacks.current[tab].depth) stacks.current[tab].pop(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tab, player]);

  // from the player: close it, then open the page in the tab underneath
  const fromPlayer = (name, params) => { pending.current = [name, params]; closePlayer(); };
  const onPlayerClosed = () => {
    set({ player: false });
    const p = pending.current;
    pending.current = null;
    if (p && stacks.current[tab]) stacks.current[tab].push(p[0], p[1]);
  };

  return (
    <>
      <div className="under" ref={under}>
        <main className="views">
          {TABS.map((t, i) => (
            <DepthStackView key={t.key} ref={(r) => { stacks.current[i] = r; }} active={tab === i} label={t.label} root={t.root} screens={SCREENS} />
          ))}
        </main>
        <div className="chrome" ref={chrome}>
          {bar ? <MiniPlayer /> : null}
          <DotTabBar
            tabs={TABS}
            index={tab}
            onChange={(i) => set({ tab: i })}
            onReselect={(i) => { const s = stacks.current[i]; if (s) { if (s.depth) s.popToRoot(); else s.scrollToTop(); } }}
          />
        </div>
      </div>
      <PlayerSheet open={player} under={under} onClosed={onPlayerClosed}>
        <Player onNavigate={fromPlayer} />
      </PlayerSheet>
      <div id="toast" className={'glass' + (message ? ' on' : '')} role="status">{message || ''}</div>
    </>
  );
}
