// Is the tab row ever there without its blur? Looked at state by state, through everything that covers it.
//
// The row belongs to the root pages. A page over a root page (a pushed page, the player) covers it where it is: its
// icons go out of focus and faint as the page behind does, and its capsule's own blur is turned down with them
// (lib/chrome-cover.js). So in every state, what must hold is that the capsule is at least as present as the icons are
// legible: the row is never there, readable, without its glass. Two things are read from each picture:
//   glass  how much of the stripes the capsule takes away (1 = all, as at rest)
//   ink    how sharp the first tab's icon is: the steepest vertical step in brightness inside it (the stripes are
//          vertical and add nothing to that), relative to the row at rest
// and it must hold that glass >= ink (with a small margin), that the ink is gone while a page covers the row, and that
// both are whole at rest and afterwards. Also measured: how long after letting go the row is whole again.
//
// Sharp stripes are put right behind the row (in front of the pages, behind the player). Two runs:
//   a pushed page   comes in at a tenth of the speed (a picture every ~90 ms), is swiped back by a finger in 6 px
//                   steps (a picture every second step), and let go (pictures as fast as they come for 2 s)
//   the player      comes up at a tenth of the speed, is pulled down in 6 px steps (2 px where its edge passes the
//                   row), and let go
//
//   npm run build && node tests/blur-scan.js [depth: auto|veil|filter|none] [driver: scroll|js]        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');     // the folder that holds public/
const [DEPTH = 'auto', DRIVER = 'scroll'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PERIOD = 24;
function readPNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } if (type === 'IDAT') idat.push(data); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)); for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0; let v = row[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; } out[y * stride + x] = v & 255; } }
  return { w, h, lum(x, y) { const i = (y * w + x) * bpp; return (out[i] * 299 + out[i + 1] * 587 + out[i + 2] * 114) / 1000; } };
}
function stripes(img, y, x0, x1) { const n = x1 - x0; let mean = 0; for (let x = x0; x < x1; x++) mean += img.lum(x, y); mean /= n; let re = 0, im = 0; for (let x = x0; x < x1; x++) { const v = img.lum(x, y) - mean, a = 2 * Math.PI * x / PERIOD; re += v * Math.cos(a); im += v * Math.sin(a); } return (2 * Math.hypot(re, im) / n) / 162; }
(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;

  async function run(what) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(([d, dp]) => { localStorage.setItem('depth-music:driver', d); if (dp !== 'auto') localStorage.setItem('depth-music:depth', dp); }, [DRIVER, DEPTH]);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1300);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => { const b = document.querySelector('.tabview.on [aria-label="暂停"]'); if (b) b.click(); });
    // the player's own content is hidden, so that only the row and the stripes behind it are in the pictures
    await page.addStyleTag({ content: '.sheet-in,.sheet-handle{visibility:hidden}' });
    const info = await page.evaluate((period) => {
      const c = document.querySelector('.chrome'), z = +getComputedStyle(c).zIndex;
      const s = document.createElement('div');
      s.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${z - 1};background:repeating-linear-gradient(90deg,#000 0 ${period / 2}px,#fff ${period / 2}px ${period}px)`;
      c.parentElement.insertBefore(s, c);
      const r = document.querySelector('.dtb-haze').getBoundingClientRect();
      return { l: r.left, t: r.top, w: r.width, h: r.height };
    }, PERIOD);
    const clip = { x: 0, y: Math.round(info.t) - 20, width: 393, height: Math.round(info.h) + 40, scale: 1 };
    let shots = 0, inkRest = 0, glass = 0, ink = 0, minMargin = 1;
    const bad = [], phases = {};
    const look = async (phase) => {
      const img = readPNG(Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', clip })).data, 'base64'));
      const x0 = Math.round(info.l) + 30, x1 = Math.round(info.l + info.w) - 30, top = 20, bot = 20 + Math.round(info.h);
      // the first tab's icon: 25 px, in the middle of the first quarter of the row
      const cx = Math.round(info.l + info.w / 8), cy = Math.round(top + info.h / 2);
      let step = 0;
      for (let y = cy - 13; y < cy + 13; y++) for (let x = cx - 13; x <= cx + 13; x++) step = Math.max(step, Math.abs(img.lum(x, y + 1) - img.lum(x, y)));
      if (!inkRest) inkRest = step || 1;
      ink = Math.min(1, step / inkRest);
      const avg = (ys) => ys.map((y) => stripes(img, y, x0, x1)).reduce((a, b) => a + b, 0) / ys.length;
      const inside = avg([top + 4, top + 6, top + 8, bot - 9, bot - 7]), outside = avg([top - 14, top - 10, bot + 10, bot + 14]);
      glass = outside > 0.5 ? Math.max(0, 1 - inside / outside) : 1;
      shots++; phases[phase] = (phases[phase] || 0) + 1;
      minMargin = Math.min(minMargin, glass - ink);
      if (glass < ink - 0.15) bad.push(`${phase} (glass ${glass.toFixed(2)}, ink ${ink.toFixed(2)})`);
    };
    await look('at rest');
    const rest = { glass, ink };
    let covered;
    if (what === 'page') {
      const tile = page.locator('.tabview.on [role="button"]', { hasText: '清晨剪辑' }).first();
      await tile.evaluate((n) => { const p = n.closest('.page'); const b = n.getBoundingClientRect(); p.scrollTop += b.top - 300; }); await sleep(300);
      await look('at rest');
      const tb = await tile.boundingBox();
      await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
      await touch('touchStart', tb.x + 40, tb.y + 30); await sleep(40); await touch('touchEnd');
      const t1 = Date.now();
      while (Date.now() - t1 < 7600) { await look('coming in'); await sleep(20); }
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }); await sleep(600);
      await look('covered'); covered = { glass, ink };
      await touch('touchStart', 30, 420);
      for (let x = 36, i = 0; x <= 390; x += 6, i++) { await touch('touchMove', x, 421); await sleep(16); if (i % 2 === 0) await look('swiped back'); }
    } else {
      await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
      await look('at rest');
      await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
      const row = page.locator('.tabview.on [aria-label^="播放 "]').first();
      const rb = await row.boundingBox();
      await touch('touchStart', rb.x + 80, rb.y + rb.height / 2); await sleep(40); await touch('touchEnd');
      const t1 = Date.now();
      while (Date.now() - t1 < 7200) { await look('coming up'); await sleep(20); }
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }); await sleep(600);
      await look('covered'); covered = { glass, ink };
      await touch('touchStart', 196, 20);
      for (let y = 26; y <= 850;) {
        await touch('touchMove', 196, y); await sleep(16);
        const near = y - 20 >= info.t - 44;
        if (near || ((y - 26) / 6) % 2 === 0) await look('pulled down');
        y += near ? 2 : 6;
      }
    }
    await touch('touchEnd');
    const t3 = Date.now(); let wholeAt = null;
    while (Date.now() - t3 < 2000) { await look('let go'); if (wholeAt === null && glass > 0.95 && ink > 0.9) wholeAt = Date.now() - t3; }
    await sleep(300); await look('after');
    const after = { glass, ink };
    const states = rest.glass > 0.95 && after.glass > 0.95 && after.ink > 0.9 && covered.ink < 0.1;
    const name = what === 'page' ? 'a pushed page' : 'the player';
    console.log(`[${DRIVER}] ${name}, depth ${DEPTH}: ${shots} states (${Object.entries(phases).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    console.log(`   covered: icons at ${(100 * covered.ink).toFixed(0)}% (gone), capsule at ${(100 * covered.glass).toFixed(0)}%; at rest and afterwards: capsule ${(100 * rest.glass).toFixed(0)}% and ${(100 * after.glass).toFixed(0)}%, icons back at ${(100 * after.ink).toFixed(0)}%; whole ${wholeAt === null ? 'NOT within 2 s' : wholeAt + ' ms'} after letting go${states ? '' : '  (NOT AS WANTED)'}`);
    console.log(bad.length
      ? `   the row there with LESS glass than legible icons in ${bad.length} states: ${bad.slice(0, 5).join(' | ')}`
      : `   in every state the capsule is at least as present as the icons are legible (glass minus icons never below ${minMargin.toFixed(2)})`, errs.length ? '| errors ' + errs[0] : '');
    if (bad.length || !states || wholeAt === null || errs.length) failed++;
    await ctx.close();
  }
  await run('page');
  await run('player');
  console.log(failed ? `${failed} FAILED` : 'all as expected');
  process.exitCode = failed ? 1 : 0;
  await browser.close(); server.close();
})();
