// The app: four tabs, each a depth stack of its own; the tab row floating at the bottom of the root pages; the player
// as a sheet over it all. The tab row belongs to the four root pages: a page pushed in a tab, or the player, covers it
// where it is (lib/chrome-cover.js).
import * as React from 'react';
import { DepthStackView } from './nav/DepthStackView';
import { DotTabBar } from './ui/DotTabBar';
import { PlayerSheet } from './ui/PlayerSheet';
import { MiniPlayer } from './ui/MiniPlayer';
import { Icon } from './ui/Icon';
import Discover from './screens/Discover';
import Search from './screens/Search';
import Library from './screens/Library';
import Radio from './screens/Radio';
import Me from './screens/Me';
import Artist from './screens/Artist';
import Collection from './screens/Collection';
import Player from './screens/Player';
import { useStore, set, closePlayer } from './state';
import { ChromeCover } from './lib/chrome-cover';
import { applyBackStyle } from './lib/back-style';

applyBackStyle();                               // before the first paint of any page

const SCREENS = { artist: Artist, collection: Collection };
const TABS = [
  { key: 'discover', label: '发现', icon: <Icon name="compass" size={25} />, root: Discover },
  { key: 'search', label: '搜索', icon: <Icon name="search" size={25} />, root: Search },
  { key: 'radio', label: '电台', icon: <Icon name="radio" size={25} />, root: Radio },
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
  const veil = React.useRef(null);
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

  // The tab row is covered as far as the root page of the tab showing is (by pages pushed over it), or as far up as the
  // player is, whichever is more.
  const cover = React.useRef(null);
  const covered = React.useRef(TABS.map(() => 0));    // per tab: how far behind its root page is
  const tabNow = React.useRef(tab);
  tabNow.current = tab;
  React.useLayoutEffect(() => {
    cover.current = ChromeCover(chrome.current);
    const offs = TABS.map((t, i) => stacks.current[i] && stacks.current[i].onDepth((f) => {
      covered.current[i] = f;
      if (i === tabNow.current) cover.current.set('stack', f);
    }));
    return () => offs.forEach((off) => off && off());
  }, []);
  React.useLayoutEffect(() => { if (cover.current) cover.current.set('stack', covered.current[tab]); }, [tab]);
  const onCover = React.useCallback((f) => { if (cover.current) cover.current.set('player', f); }, []);
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

  // The floating chrome: the play bar (when there is one) and the tab row. It is not part of what goes out of focus
  // behind the player, and nothing it sits in ever carries a filter or an opacity: its glass would stop blurring.
  const chromeEl = (
    <div className="chrome" ref={chrome}>
      {bar ? <MiniPlayer /> : null}
      <DotTabBar
        tabs={TABS}
        index={tab}
        onChange={(i) => set({ tab: i })}
        onReselect={(i) => { const s = stacks.current[i]; if (s) { if (s.depth) s.popToRoot(); else s.scrollToTop(); } }}
      />
    </div>
  );

  return (
    <>
      {/* what goes out of focus behind the player: the pages */}
      <div className="under" ref={under}>
        <main className="views">
          {TABS.map((t, i) => (
            <DepthStackView key={t.key} ref={(r) => { stacks.current[i] = r; }} active={tab === i} label={t.label} root={t.root} screens={SCREENS} />
          ))}
        </main>
      </div>
      {/* the glass that puts the pages out of focus behind the player, in the 'veil' depth mode (ui/PlayerSheet) */}
      <div className="sheet-veil" ref={veil} />
      {chromeEl}
      <PlayerSheet open={player} under={under} veil={veil} onCover={onCover} onClosed={onPlayerClosed}>
        <Player onNavigate={fromPlayer} />
      </PlayerSheet>
      <div id="toast" className={'glass' + (message ? ' on' : '')} role="status">{message || ''}</div>
    </>
  );
}
