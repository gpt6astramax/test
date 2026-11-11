// 景深翻页 in an app: the web app, full screen, in a WebView. Nothing native is drawn over it: the page itself lays
// out under the status bar and the home indicator (it reads the safe areas from env()), as it does as a home-screen
// app. The WebView's own scrolling, bouncing, zooming and back/forward swipes are off: the page has gestures of its own.
import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const URL = 'https://test.gpt6astramax.workers.dev/depth-music/';

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <WebView
        source={{ uri: URL }}
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
        originWhitelist={['https://*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f0' },
  web: { flex: 1, backgroundColor: '#f2f2f0' },
});
