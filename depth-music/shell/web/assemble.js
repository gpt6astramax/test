// Turns the files of one version of the web app into one HTML document for the WebView, which loads it with the
// site's address as its base (so the page's settings stay in the site's storage). Nothing is fetched to show it:
//   - the stylesheet goes inline, with its fonts as data URLs;
//   - the script chunks (app, libraries, runtime) go in as text; a small script makes each a blob: URL, pointing the
//     chunks' imports of each other ("./vendor-….js") at those URLs, and starts the app's chunk;
//   - preload links and icons are left out (a browser tab's business).
// read(file) gives a file's content: text for .html/.css/.js, base64 for anything else (fonts).
export const isText = (path) => /\.(html|css|js)$/.test(path);

const BOOT = `(function () {
  var el = document.getElementById('depth-music-files'), files = JSON.parse(el.textContent), urls = {};
  el.parentNode.removeChild(el);
  function url(name) {
    if (urls[name]) return urls[name];
    urls[name] = 'about:blank';                                    // a cycle would end here
    var src = files[name].replace(/(["'\`])\\.\\/([\\w.-]+\\.js)\\1/g, function (m, q, dep) {
      return files[dep] != null ? q + url(dep) + q : m;
    });
    return (urls[name] = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  }
  function start() {
    var s = document.createElement('script');
    s.type = 'module';
    s.src = url(__ENTRY__);
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();`;

export async function assemble(manifest, read) {
  const byPath = {};
  for (const f of manifest.files) byPath[f.path] = f;
  const get = (path) => {
    const f = byPath[path.replace(/^\.\//, '')];
    if (!f) throw new Error(`not in the manifest: ${path}`);
    return read(f);
  };

  let html = await get('index.html');
  html = html.replace(/[ \t]*<link rel="(?:modulepreload|apple-touch-icon|icon)"[^>]*>\n?/g, '');

  // styles, with their fonts
  const sheets = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
  for (const [tag, href] of sheets) {
    const dir = href.replace(/[^/]*$/, '');
    let css = await get(href);
    const fonts = [...new Set([...css.matchAll(/url\((\.\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
    for (const font of fonts) {
      const data = await get(dir + font.slice(2));
      css = css.split(`url(${font})`).join(`url(data:font/woff2;base64,${data})`);
    }
    html = html.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  }

  // scripts
  const entryTag = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
  if (!entryTag) throw new Error('no module script in index.html');
  const chunks = {};
  for (const f of manifest.files) {
    if (/^assets\/[^/]+\.js$/.test(f.path)) chunks[f.path.slice('assets/'.length)] = await read(f);
  }
  const entry = entryTag[1].replace(/^(\.\/)?assets\//, '');
  const json = JSON.stringify(chunks).replace(/</g, '\\u003c');
  html = html.replace(entryTag[0], () =>
    `<script type="application/json" id="depth-music-files">${json}</script>\n<script>${BOOT.replace('__ENTRY__', JSON.stringify(entry))}</script>`);

  const left = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1]);
  if (left.length) throw new Error(`still points outside: ${left.join(', ')}`);
  return html;
}
