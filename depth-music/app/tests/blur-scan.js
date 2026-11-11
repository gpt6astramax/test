// The default way (the tab row does not move and keeps its blur): is the row's glass blurring in EVERY state it goes
// through while the player comes up, is pulled down by hand, is let go, and is tidied away?
//
// Sharp stripes are put right behind the row (in front of everything else), so the row's own blur can be read at any
// moment whatever lies further back. Then:
//   1. the player comes up with all animations slowed to a tenth, a picture every ~90 ms: about sixty states
//   2. the player is pulled down by a finger in 6 px steps, a picture every second step: about sixty-five states
//   3. the finger lets go; pictures as fast as they can be taken for 2 s (the snap, "gone", and the tidying up)
// In every picture the stripes inside the capsule are compared with the stripes just above and below it.
//
//   npm run build && node tests/blur-scan.js [depth: auto|veil|filter|none] [driver: scroll|js] [way]        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');     // the folder that holds public/
const [DEPTH = 'auto', DRIVER = 'scroll', MODE = ''] = process.argv.slice(2);
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
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(([d, dp, m]) => { localStorage.setItem('depth-music:driver', d); if (dp !== 'auto') localStorage.setItem('depth-music:depth', dp); if (m) localStorage.setItem('depth-music:chrome-3', m); }, [DRIVER, DEPTH, MODE]);
  await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1300);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await page.evaluate(() => { const b = document.querySelector('.tabview.on [aria-label="暂停"]'); if (b) b.click(); });
  const info = await page.evaluate((period) => {
    const c = document.querySelector('.chrome'), z = +getComputedStyle(c).zIndex;
    const s = document.createElement('div');
    s.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${z - 1};background:repeating-linear-gradient(90deg,#000 0 ${period / 2}px,#fff ${period / 2}px ${period}px)`;
    c.parentElement.insertBefore(s, c);
    const r = document.querySelector('.dtb-haze').getBoundingClientRect();
    window.cycle = [];
    new MutationObserver((list) => { for (const m of list) m.removedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains('sheet')) cycle.push('tidied'); }); }).observe(document.getElementById('app'), { childList: true, subtree: true });
    return { l: r.left, t: r.top, w: r.width, h: r.height, z, mode: localStorage.getItem('depth-music:chrome-3') || 'default', inFront: z > 20 };
  }, PERIOD);
  const clip = { x: 0, y: Math.round(info.t) - 20, width: 393, height: Math.round(info.h) + 40, scale: 1 };
  let shots = 0, clear = [], worst = 0;
  const lost = { rising: 0, 'pulled down': 0, 'let go': 0 }; let lastLost = null;     // where the blur was missing, and until when after letting go
  const look = async (label) => {
    const img = readPNG(Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', clip })).data, 'base64'));
    const x0 = Math.round(info.l) + 30, x1 = Math.round(info.l + info.w) - 30, top = 20, bot = 20 + Math.round(info.h);
    const avg = (ys) => ys.map((y) => stripes(img, y, x0, x1)).reduce((a, b) => a + b, 0) / ys.length;
    const inside = avg([top + 4, top + 6, top + 8, bot - 9, bot - 7]), outside = avg([top - 14, top - 10, bot + 10, bot + 14]);
    shots++;
    const ratio = outside > 0.5 ? inside / outside : 1;
    worst = Math.max(worst, ratio);
    if (ratio >= 0.25) {
      clear.push(`${label} (inside ${inside.toFixed(2)}, outside ${outside.toFixed(2)})`);
      for (const k in lost) if (label.startsWith(k)) lost[k]++;
      const m = /^let go, (\d+) ms/.exec(label); if (m) lastLost = +m[1];
    }
  };
  await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
  await look('at rest');
  // ---- 1. the player comes up, ten times slower
  await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
  const row = page.locator('.tabview.on [aria-label^="播放 "]').first();
  const rb = await row.boundingBox();
  await touch('touchStart', rb.x + 80, rb.y + rb.height / 2); await sleep(40); await touch('touchEnd');
  const t1 = Date.now(); let n1 = 0;
  while (Date.now() - t1 < 7200) { await look('rising, ' + (Date.now() - t1) + ' ms at 1/10 speed'); n1++; await sleep(20); }
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 }); await sleep(600);
  const up = await page.evaluate(() => { const s = document.querySelector('.sheet'); return !!s && (s.scrollTop > 100 || getComputedStyle(s).overflowY !== 'auto'); });
  await look('player up');
  // ---- 2. pulled down by hand, step by step
  let n2 = 0;
  await touch('touchStart', 196, 120);
  for (let y = 126; y <= 900; y += 6) { await touch('touchMove', 196, y); await sleep(16); if (((y - 126) / 6) % 2 === 0) { await look('pulled down to y=' + y); n2++; } }
  // ---- 3. let go: the snap, "gone", the tidying up
  await touch('touchEnd');
  const t3 = Date.now(); let n3 = 0;
  while (Date.now() - t3 < 2000) { await look('let go, ' + (Date.now() - t3) + ' ms'); n3++; }
  const tidied = await page.evaluate(() => cycle.includes('tidied'));
  await sleep(300); await look('after');
  console.log(`[${DRIVER}] way ${info.mode}${info.inFront ? ' (row in front of the player)' : ''}, depth ${DEPTH}: ${shots} states looked at (rising ${n1}, pulled down ${n2}, after letting go ${n3}); player came up: ${up ? 'yes' : 'NO'}; tidied away meanwhile: ${tidied ? 'yes' : 'NO'}`);
  console.log(clear.length
    ? `   NOT blurring in ${clear.length}: while rising ${lost.rising}, while pulled down ${lost['pulled down']}, after letting go ${lost['let go']}${lastLost === null ? '' : ' (the last of them ' + lastLost + ' ms after letting go)'}`
    : `   the capsule blurs in all of them (weakest: stripes inside at ${(100 * worst).toFixed(0)}% of outside)`, errs.length ? '| errors ' + errs[0] : '');
  if (clear.length && process.env.VERBOSE) clear.forEach((c) => console.log('     ' + c));
  await browser.close(); server.close();
  process.exitCode = clear.length || !up || !tidied ? 1 : 0;
})();
