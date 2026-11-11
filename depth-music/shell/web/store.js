// The versions of the web app on the phone, and its updates.
//
// A version is a manifest (depth-music/app/scripts/app-manifest.mjs): a list of files with their SHA-256. Files are kept
// under their hash, in <documents>/web/files, so a file two versions share is stored and downloaded once. The version
// the app was built with (snapshot.js) is always there; downloaded ones go in next to it.
//
// state.json: { active, next }   active: the version shown;  next: a version downloaded to be shown from the next launch.
import { Paths, Directory, File } from 'expo-file-system';
import SNAPSHOT from '../snapshot';
import { isText } from './assemble';

export const BASE = 'https://test.gpt6astramax.workers.dev/depth-music/';

const root = new Directory(Paths.document, 'web');
const store = new Directory(root, 'files');
const stateFile = new File(root, 'state.json');
const inSnapshot = (f) => SNAPSHOT.files[f.sha256] != null;
const stored = (f) => new File(store, f.sha256);
const complete = (m) => !!m && Array.isArray(m.files) && m.files.every((f) => inSnapshot(f) || stored(f).exists);

function load() {
  try { return stateFile.exists ? JSON.parse(stateFile.textSync()) : {}; } catch (e) { return {}; }
}
function save(state) {
  try { stateFile.writeSync(JSON.stringify(state)); } catch (e) { /* the page still shows; the update waits */ }
}

/** The version to show now. A downloaded "next" one becomes the active one here, at launch. */
export function launchVersion() {
  try { if (!root.exists) root.create(); if (!store.exists) store.create(); } catch (e) { return SNAPSHOT.manifest; }
  let { active, next } = load();
  if (complete(next)) active = next;
  next = null;
  // a missing file, or an app update that ships a newer page than the one downloaded: the app's own copy
  if (!complete(active) || SNAPSHOT.manifest.built > active.built) active = SNAPSHOT.manifest;
  save({ active, next });
  sweep([active]);
  return active;
}

/** A file's content: text for .html/.css/.js, base64 for the rest. */
export function read(f) {
  if (inSnapshot(f)) return Promise.resolve(SNAPSHOT.files[f.sha256]);
  return isText(f.path) ? stored(f).text() : stored(f).base64();
}

/** Remove stored files no version in `keep` (or in state.json) needs. */
function sweep(keep) {
  try {
    const { active, next } = load();
    const need = new Set();
    for (const m of [...keep, active, next]) if (m && m.files) for (const f of m.files) need.add(f.sha256);
    for (const item of store.list()) if (item instanceof File && !need.has(item.name)) item.delete();
  } catch (e) { /* tidy next time */ }
}

/** How a new version is to be taken, against the version running: 'urgent' | 'medium' | 'light'. */
export function level(remote, running) {
  if ((remote.urgent | 0) > (running.urgent | 0)) return 'urgent';
  if ((remote.medium | 0) > (running.medium | 0)) return 'medium';
  return 'light';
}

/** The manifest on the site, or null when it cannot be had (offline) or is the version running. */
export async function fetchManifest(running) {
  const res = await fetch(`${BASE}app-manifest.json?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`app-manifest.json: HTTP ${res.status}`);
  const m = await res.json();
  if (!m || typeof m.version !== 'string' || !Array.isArray(m.files) || !m.files.some((f) => f.path === 'index.html')) {
    throw new Error('app-manifest.json: not a manifest');
  }
  return m.version === running.version ? null : m;
}

/** Download the files of `m` the phone does not have (checking each one's hash), then keep `m` as the next version. */
export async function download(m) {
  for (const f of m.files) {
    if (inSnapshot(f) || stored(f).exists) continue;
    const tmp = new File(Paths.cache, `web-${f.sha256}`);
    if (tmp.exists) tmp.delete();
    // index.html: the folder's address (the site redirects …/index.html there), asking past any cache for this version
    const url = f.path === 'index.html' ? `${BASE}?v=${f.sha256.slice(0, 12)}` : BASE + f.path;
    await File.downloadFileAsync(url, tmp);
    const sum = await tmp.digest('SHA-256');
    if (sum !== f.sha256) { tmp.delete(); throw new Error(`${f.path}: not the file in the manifest`); }
    tmp.moveSync(stored(f));
  }
  const state = load();
  save({ ...state, next: m });
}

/** Show `m` from now on (it was downloaded). */
export function activate(m) {
  const state = load();
  save({ active: m, next: null });
  sweep([m, state.active].filter(Boolean));
}
