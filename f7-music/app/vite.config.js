// The layout of Framework7's own Vite template (create-framework7): sources in src/, static files copied as they are,
// relative URLs. Only the folders differ: the test repository serves a sub-project's public/ folder, so the build goes
// there and the files copied as they are live in static/.
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(here, './src');
const STATIC_DIR = path.resolve(here, './static');
const BUILD_DIR = path.resolve(here, '../public');

export default {
  plugins: [react()],
  root: SRC_DIR,
  base: '',                       // relative URLs: the app is served under /f7-music/
  publicDir: STATIC_DIR,
  define: {
    __F7__: JSON.stringify(JSON.parse(fs.readFileSync(path.resolve(here, 'node_modules/framework7/package.json'), 'utf8')).version),
    __BUILD__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ') + ' UTC'),
  },
  build: {
    outDir: BUILD_DIR,
    assetsInlineLimit: 0,
    emptyOutDir: true,
  },
  resolve: { alias: { '@': SRC_DIR } },
  server: { host: true },
};
