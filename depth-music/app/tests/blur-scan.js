// The default way (the tab row does not move, the player covers it, and it never loses its blur): in EVERY state it
// goes through while the player comes up, is pulled down by hand, is let go and is tidied away, is the row either
// covered or blurring?
//
// Sharp stripes are put right behind the row (in front of the pages, behind the player), so the row's own blur can be
// read at any moment whatever lies further back. Inside the row's capsule the stripes must be gone in every state:
// blurred by the row's own glass while the row shows, or by the player's glass while the player covers it. Stripes
// showing inside the capsule mean the row is there without its blur. Then:
//   1. the player comes up with all animations slowed to a tenth, a picture every ~90 ms: about sixty states
//   2. the player is pulled down by a finger in 6 px steps, a picture every second step; where its edge passes the
//      row, in 2 px steps with a picture at each: about a hundred and ten states
//   3. the finger lets go; pictures as fast as they can be taken for 2 s (the snap, "gone", and the tidying up)
// Each picture is also sorted by what surrounds the capsule: stripes sharp around it = the row is showing; flat = the
// player covers it; in between = the player's edge is crossing it. With the player up, the row must be covered (or,
// in the way that keeps it in front, showing).
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
  await page.addInitScript(([d, dp, m]) => { localStorage.setItem('depth-music:driver', d); if (dp !== 'auto') localStorage.setItem('depth-music:depth', dp); if (m) localStorage.setItem('depth-music:chrome-4', m); }, [DRIVER, DEPTH, MODE]);
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
    return { l: r.left, t: r.top, w: r.width, h: r.height, z, mode: localStorage.getItem('depth-music:chrome-4') || 'default', inFront: z > 20 };
  }, PERIOD);
  const clip = { x: 0, y: Math.round(info.t) - 20, width: 393, height: Math.round(info.h) + 40, scale: 1 };
  let shots = 0, clear = [], worst = 0;
  const lost = { rising: 0, 'pulled down': 0, 'let go': 0 }; let lastLost = null;     // where the blur was missing, and until when after letting go
  const seen = { showing: 0, 'edge crossing': 0, covered: 0 }; let lastState = '';
  const look = async (label) => {
    const img = readPNG(Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', clip })).data, 'base64'));
    const x0 = Math.round(info.l) + 30, x1 = Math.round(info.l + info.w) - 30, top = 20, bot = 20 + Math.round(info.h);
    const avg = (ys) => ys.map((y) => stripes(img, y, x0, x1)).reduce((a, b) => a + b, 0) / ys.length;
    const inside = avg([top + 4, top + 6, top + 8, bot - 9, bot - 7]), above = avg([top - 14, top - 10]), below = avg([bot + 10, bot + 14]), outside = (above + below) / 2;
    shots++;
    lastState = above >= 0.5 && below >= 0.5 ? 'showing' : above < 0.2 && below < 0.2 ? 'covered' : 'edge crossing';
    seen[lastState]++;
    const ratio = inside;                                   // stripes left inside the capsule: 0 = none, 1 = sharp
    worst = Math.max(worst, ratio);
    if (ratio >= 0.25) {
      clear.push(`${label} (inside ${inside.toFixed(2)}, outside ${outside.toFixed(2)})`);
      for (const k in lost) if (label.startsWith(k)) lost[k]++;
      const m = /^let go, (\d+) ms/.exec(label); if (m) lastLost = +m[1];
    }
  };
  await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
  await look('at rest');
  const restState = lastState;
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
  const upState = lastState;
  // ---- 2. pulled down by hand, step by step
  // (from the very top, so that the sheet's edge can be taken all the way past the row; once the edge is near the
  // row it goes on in 2 px steps with a picture at each, because that is where the row is uncovered)
  let n2 = 0;
  await touch('touchStart', 196, 20);
  for (let y = 26; y <= 850;) {
    await touch('touchMove', 196, y); await sleep(16);
    const near = y - 20 >= info.t - 44;
    if (near || ((y - 26) / 6) % 2 === 0) { await look('pulled down by ' + (y - 20) + ' px'); n2++; }
    y += near ? 2 : 6;
  }
  // ---- 3. let go: the snap, "gone", the tidying up
  await touch('touchEnd');
  const t3 = Date.now(); let n3 = 0;
  while (Date.now() - t3 < 2000) { await look('let go, ' + (Date.now() - t3) + ' ms'); n3++; }
  const tidied = await page.evaluate(() => cycle.includes('tidied'));
  await sleep(300); await look('after');
  const afterState = lastState;
  // with the player up the row is covered, except in the way that keeps it in front
  const wantUp = info.inFront ? 'showing' : 'covered';
  const states = restState === 'showing' && afterState === 'showing' && upState === wantUp;
  console.log(`[${DRIVER}] way ${info.mode}${info.inFront ? ' (row in front of the player)' : ''}, depth ${DEPTH}: ${shots} states looked at (rising ${n1}, pulled down ${n2}, after letting go ${n3}); player came up: ${up ? 'yes' : 'NO'}; tidied away meanwhile: ${tidied ? 'yes' : 'NO'}`);
  console.log(`   the row: showing in ${seen.showing} states, the player's edge crossing it in ${seen['edge crossing']}, covered in ${seen.covered}; at rest ${restState}, with the player up ${upState}${upState === wantUp ? '' : ' (WANTED ' + wantUp + ')'}, afterwards ${afterState}`);
  console.log(clear.length
    ? `   stripes showing INSIDE the capsule (the row there without its blur) in ${clear.length}: while rising ${lost.rising}, while pulled down ${lost['pulled down']}, after letting go ${lost['let go']}${lastLost === null ? '' : ' (the last of them ' + lastLost + ' ms after letting go)'}`
    : `   no stripes inside the capsule in any state (at most ${(100 * worst).toFixed(0)}% of full strength)`, errs.length ? '| errors ' + errs[0] : '');
  if (clear.length && process.env.VERBOSE) clear.forEach((c) => console.log('     ' + c));
  await browser.close(); server.close();
  process.exitCode = clear.length || !up || !tidied || !states ? 1 : 0;
})();
