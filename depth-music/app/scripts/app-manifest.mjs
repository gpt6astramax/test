// Writes app-manifest.json next to the built page: the list of files the Expo app (../shell) needs to show the web app,
// each with its SHA-256, plus the update level from release.json. The app keeps a copy of these files, checks this list
// in the background, and downloads only the files it does not have yet (all but index.html have content hashes in
// their names, so an unchanged library chunk keeps its name and is never fetched again).
//
// release.json:   { "medium": 0, "urgent": 0, "note": "" }
//   nothing changed      → light update: downloaded silently, used from the next launch of the app
//   "medium" raised by 1 → when downloaded, the app offers "更新" / "下次打开 App 时生效" (with "note" if given)
//   "urgent" raised by 1 → the app switches to the new version as soon as it is downloaded
// The numbers only ever go up; an app that skipped several versions compares against the ones it has, so a raise is
// never missed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export default function appManifest(releaseFile) {
  let outDir;
  return {
    name: 'app-manifest',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
      const files = [{ path: 'index.html' }];
      for (const name of fs.readdirSync(path.join(outDir, 'assets')).sort()) files.push({ path: `assets/${name}` });
      for (const f of files) {
        const buf = fs.readFileSync(path.join(outDir, f.path));
        f.size = buf.length;
        f.sha256 = sha(buf);
      }
      const manifest = {
        version: sha(files.map((f) => `${f.path} ${f.sha256}`).join('\n')).slice(0, 12),
        built: new Date().toISOString(),
        medium: release.medium | 0,
        urgent: release.urgent | 0,
        note: String(release.note || ''),
        files,
      };
      fs.writeFileSync(path.join(outDir, 'app-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
    },
  };
}
