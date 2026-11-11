// React Native on the web: components are written against the react-native API and rendered by react-native-web.
// Sources in src/, files copied as they are in static/, relative URLs (the app is served under /depth-music/), and the
// build goes to ../public, the folder the test repository serves.
import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [react()],
  root: path.resolve(here, 'src'),
  base: '',
  publicDir: path.resolve(here, 'static'),
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ') + ' UTC'),
    __DEV__: 'false',
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    alias: { 'react-native': 'react-native-web' },
    // a file.web.jsx wins over file.jsx, as in a React Native project
    extensions: ['.web.jsx', '.web.js', '.jsx', '.js', '.json'],
  },
  build: {
    outDir: path.resolve(here, '../public'),
    assetsInlineLimit: 0,
    emptyOutDir: true,
  },
  server: { host: true },
};
