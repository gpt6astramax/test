// 景深翻页 in an app: the web app, full screen, in a WebView. Nothing native is drawn over it: the page itself lays
// out under the status bar and the home indicator (it reads the safe areas from env()), as it does as a home-screen
// app. The WebView's own scrolling, bouncing, zooming and back/forward swipes are off: the page has gestures of its own.
//
// The page is kept on the phone (web/store.js) and shown from there, at once and offline; the app comes with a copy
// (snapshot.js). In the background it looks at the site's app-manifest.json, downloads the files that changed, and
// takes the new version as the release asks (depth-music/app/release.json):
//   light  — silently, from the next launch;
//   medium — the page offers "更新" / "下次打开 App 时生效" (a system dialog if the page shown cannot);
//   urgent — at once.
import * as React from 'react';
import { View, StyleSheet, AppState, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { assemble } from './web/assemble';
import { BASE, launchVersion, read, fetchManifest, download, activate, level } from './web/store';

const CHECK_EVERY = 5 * 60 * 1000;             // when the app comes back to the front: at most this often
const ANSWER_WITHIN = 3000;                    // the page says it shows the offer within this, or a dialog asks

export default function App() {
  const [page, setPage] = React.useState(null);           // { version, html }
  const running = React.useRef(null);                     // the manifest shown
  const web = React.useRef(null);
  const loaded = React.useRef(false);
  const offered = React.useRef(new Set());                // medium updates already offered in this run
  const waiting = React.useRef(null);                     // an offer waiting for the page to load, or for its answer
  const checking = React.useRef(false);
  const lastCheck = React.useRef(0);

  const show = React.useCallback(async (m) => {
    const html = await assemble(m, read);
    running.current = m;
    loaded.current = false;
    setPage({ version: m.version, html });
  }, []);

  const takeNow = React.useCallback(async (m) => {
    activate(m);
    await show(m);
  }, [show]);

  const offer = React.useCallback((m) => {
    if (!loaded.current) { waiting.current = { m, sent: false }; return; }
    const detail = JSON.stringify({ version: m.version, note: m.note || '' });
    waiting.current = { m, sent: true };
    web.current?.injectJavaScript(`window.__depthMusicUpdate=${detail};window.dispatchEvent(new CustomEvent('depth-music:update',{detail:window.__depthMusicUpdate}));true;`);
    setTimeout(() => {
      // a page from before the offer existed: ask with the system's dialog
      if (waiting.current && waiting.current.m === m && waiting.current.sent) {
        waiting.current = null;
        Alert.alert('新版本已经下载好了', m.note || '现在更新会重新载入页面。', [
          { text: '下次打开 App 时生效', style: 'cancel' },
          { text: '更新', onPress: () => takeNow(m) },
        ]);
      }
    }, ANSWER_WITHIN);
  }, [takeNow]);

  const check = React.useCallback(async () => {
    if (checking.current || !running.current) return;
    checking.current = true;
    lastCheck.current = Date.now();
    try {
      const m = await fetchManifest(running.current);
      if (!m) return;
      await download(m);                                   // kept as the next version: shown from the next launch
      const how = level(m, running.current);
      if (how === 'urgent') await takeNow(m);
      else if (how === 'medium' && !offered.current.has(m.version)) { offered.current.add(m.version); offer(m); }
    } catch (e) {
      // offline, or the site mid-deploy: the page shown stays, and the next check tries again
    } finally {
      checking.current = false;
    }
  }, [offer, takeNow]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const m = launchVersion();
      try { await show(m); } catch (e) { await show(launchVersion()); }
      if (alive) check();
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastCheck.current > CHECK_EVERY) check();
    });
    return () => { alive = false; sub.remove(); };
  }, [show, check]);

  const onMessage = React.useCallback((e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch (err) { return; }
    const w = waiting.current;
    if (msg.type === 'update-shown' && w) waiting.current = { ...w, sent: false };     // the page asks; no dialog
    if (msg.type === 'update' && w && msg.version === w.m.version) {
      waiting.current = null;
      if (msg.now) takeNow(w.m);                                                  // otherwise: from the next launch
    }
  }, [takeNow]);

  const onLoadEnd = React.useCallback(() => {
    loaded.current = true;
    const w = waiting.current;
    if (w && !w.sent) offer(w.m);
  }, [offer]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      {page ? (
        <WebView
          key={page.version}
          ref={web}
          source={{ html: page.html, baseUrl: BASE }}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          style={styles.web}
          // the page under the status bar and home indicator, with env(safe-area-inset-*) set (iOS)
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          // the page scrolls inside itself; the WebView itself never moves
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          allowsBackForwardNavigationGestures={false}
          allowsLinkPreview={false}
          setBuiltInZoomControls={false}
          // lets the page tell it is in the app (it then leaves out what only Safari needs)
          applicationNameForUserAgent="DepthMusicShell"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f0' },
  web: { flex: 1, backgroundColor: '#f2f2f0' },
});
