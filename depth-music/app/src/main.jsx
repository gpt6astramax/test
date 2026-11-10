// React Native on the web: the app is registered and run through react-native-web's AppRegistry, as a React Native
// app is on a phone.
import { AppRegistry } from 'react-native';
import './styles.css';
import App from './App';

// no zoom: iOS ignores user-scalable=no, so the pinch events are cancelled as well
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
// ...and the document itself never moves: a drag that starts on nothing scrollable (not a page, not a gesture surface)
// would otherwise be handed to the document and take the whole screen, tab row included, with it
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 || !e.target.closest || !e.target.closest('.page, .sg, input')) e.preventDefault();
}, { passive: false });
// interface text is never selected, and a long press brings up no menu
document.addEventListener('selectstart', (e) => { if (!e.target.closest || !e.target.closest('input')) e.preventDefault(); });
if (navigator.maxTouchPoints > 0) document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });

AppRegistry.registerComponent('DepthMusic', () => App);
AppRegistry.runApplication('DepthMusic', { rootTag: document.getElementById('app') });
