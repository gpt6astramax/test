// React Native on the web: the app is registered and run through react-native-web's AppRegistry, as a React Native
// app is on a phone.
import { AppRegistry } from 'react-native';
import './styles.css';
import App from './App';

// No zoom. iOS ignores user-scalable=no, so the pinch events are cancelled as well (touch-action on <html> already
// leaves only panning).
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
// There is deliberately no touchmove listener on the document that can call preventDefault: with one, every scroll
// anywhere has to wait for the main thread before it may start, and the main thread is busiest right after a tab
// switch or a page turn. What it was for (a drag that starts on something that cannot scroll must not move the
// whole document) is done where it is needed: the floating chrome (App.web.jsx).
// interface text is never selected, and a long press brings up no menu
document.addEventListener('selectstart', (e) => { if (!e.target.closest || !e.target.closest('input')) e.preventDefault(); });
if (navigator.maxTouchPoints > 0) document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });

AppRegistry.registerComponent('DepthMusic', () => App);
AppRegistry.runApplication('DepthMusic', { rootTag: document.getElementById('app') });
