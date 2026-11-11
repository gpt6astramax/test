// Entry for iOS / Android (Expo, Expo Go). The web build has its own entry: src/index.html -> src/main.jsx (Vite).
import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
