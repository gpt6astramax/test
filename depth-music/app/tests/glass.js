// Is the glass actually blurring? Measured from pixels, not from styles.
//
// A pattern of sharp vertical stripes (24 px period) is put behind things. Wherever a blur works, the stripes are gone;
// where it fails, they show through, sharp.
//
// Part 1, the tab row's glass. The page behind is kept sharp (depth mode 'none': it only shrinks and fades), so the
// row's own blur can be told from everything else at every moment. Each sample compares the stripes inside the row's
// capsule with the stripes just above and below it. The capsule is found in the screenshot itself, because a row
// that is moving is no longer where the page said it was a frame ago. Sampled: at rest; while a page comes in and
// after; during a back swipe (held half-way) and after; during a tab switch; and through the player's coming and
// going in every chrome mode (src/lib/chrome-mode.js), including the moments right after it has gone.
//
// Part 2, the page behind. In each depth mode (src/lib/depth-mode.js) the stripes are put on the page that goes
// behind: under a pushed page and under the player they must be gone with 'veil' and 'filter', and still there with
// 'none' (which shows that the measurement can tell).
//
//   npm run build && node tests/glass.js [scroll|js] [mode,mode…]        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const zlib = require('zlib');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');     // the folder that holds public/
const DRIVER = process.argv[2] === 'js' ? 'js' : 'scroll';
const MODES = (process.argv[3] || 'top,cover,sink,rise,left,fade,noglass,asis').split(',');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PERIOD = 24;

// ---- a minimal PNG reader (8-bit RGB / RGBA, no interlace): enough for screenshots
function readPNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out, lum(x, y) { const i = (y * w + x) * bpp; return (out[i] * 299 + out[i + 1] * 587 + out[i + 2] * 114) / 1000; } };
}
// Strength of the stripes along one row between x0 and x1: 1 = full black-and-white stripes, 0 = none. What lies
// behind may be shown smaller (a page behind is drawn at 86%), so the period is searched for between 20 and 24.5 px.
function stripes(img, y, x0, x1) {
  y = Math.round(y);
  if (y < 0 || y >= img.h) return null;
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(img.w, Math.round(x1));
  const n = x1 - x0; if (n < PERIOD * 4) return null;
  const v = new Float64Array(n);
  let mean = 0; for (let x = 0; x < n; x++) { v[x] = img.lum(x0 + x, y); mean += v[x]; } mean /= n;
  let best = 0;
  for (let period = 20; period <= 24.5; period += 0.25) {
    let re = 0, im = 0;
    for (let x = 0; x < n; x++) { const a = 2 * Math.PI * x / period; re += (v[x] - mean) * Math.cos(a); im += (v[x] - mean) * Math.sin(a); }
    best = Math.max(best, (2 * Math.hypot(re, im) / n) / 162);
  }
  return best;
}
const avg = (list) => { const v = list.filter((n) => n !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  // backdrop filters need the GPU path; this is the software one
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failures = 0, measured = 0;

  async function session(mode, depth) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(([d, m, dp]) => { localStorage.setItem('depth-music:driver', d); localStorage.setItem('depth-music:chrome-3', m); localStorage.setItem('depth-music:depth', dp); }, [DRIVER, mode, depth]);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1200);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    // the stripes go in as the first child of `where`: behind what that element holds
    const stripesIn = (where) => page.evaluate(([sel, period]) => {
      const old = document.getElementById('stripes'); if (old) old.remove();
      const s = document.createElement('div');
      s.id = 'stripes';
      s.style.cssText = `position:absolute;inset:0;z-index:0;pointer-events:none;background:repeating-linear-gradient(90deg,#000 0 ${period / 2}px,#fff ${period / 2}px ${period}px)`;
      const host = document.querySelector(sel);
      host.insertBefore(s, host.firstChild);
    }, [where, PERIOD]);
    const shoot = async () => readPNG(Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    const bottom = () => page.evaluate(() => { const p = document.elementFromPoint(196, 400); const sc = p && p.closest('.page'); if (sc) sc.scrollTop = sc.scrollHeight; });
    const box = () => page.evaluate(() => {
      const h = document.querySelector('.dtb-haze'), c = document.querySelector('.chrome');
      if (!h || getComputedStyle(h).display === 'none') return { off: true };
      const r = h.getBoundingClientRect();
      const o = getComputedStyle(c).getPropertyValue('--chrome-o').trim();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, o: o === '' ? 1 : +o };
    });
    // One sample of the tab row's glass: the stripes inside its capsule against the stripes just outside it.
    // expect: 'blur' | 'clear' | 'any'
    async function sample(label, expect = 'blur') {
      const b0 = await box(), shot = await shoot(), b1 = await box();
      const out = (b) => b.b < 8 || b.t > shot.h - 8 || b.r < 60 || b.l > shot.w - 60;
      let verdict, detail = '';
      if (b0.off || b1.off) verdict = 'glass switched off';
      else if (out(b0) && out(b1)) verdict = 'off screen';
      else {
        const h = b0.b - b0.t, x0 = Math.max(b0.l, b1.l) + 30, x1 = Math.min(b0.r, b1.r) - 30;
        const inside = (t) => avg([t + 4, t + 6, t + 8, t + h - 9, t + h - 7].map((y) => stripes(shot, y, x0, x1)));
        const outside = (t) => avg([t - 14, t - 10, t + h + 10, t + h + 14].map((y) => stripes(shot, y, x0, x1)));
        // still: where the page says. Moving: wherever between the two readings (and a little beyond) it is blurred most.
        let top = b0.t, moving = Math.abs(b1.t - b0.t) >= 1 || Math.abs(b1.l - b0.l) >= 1;
        if (Math.abs(b1.t - b0.t) >= 1) {
          let best = null;
          for (let t = Math.min(b0.t, b1.t) - 24; t <= Math.max(b0.t, b1.t) + 24; t++) { const v = inside(t); if (v !== null && (best === null || v < best)) { best = v; top = t; } }
        }
        const i = inside(top), o = outside(top);
        if (i === null || o === null) verdict = moving ? 'moving too fast to measure' : 'not measurable here';
        else if (o < 0.2) verdict = 'not measurable here (what is behind is already flat)';
        else {
          measured++;
          const dim = b0.o < 0.95 || b1.o < 0.95;             // the 'fade' way: the glass is being thinned on purpose
          verdict = i / o < 0.25 ? 'blurring' : dim ? 'thinned (dimmed on purpose)' : 'CLEAR: not blurring';
          detail = ` (stripes inside ${i.toFixed(2)}, outside ${o.toFixed(2)}${moving ? ', moving' : ''}${dim ? ', parts ' + Math.min(b0.o, b1.o).toFixed(2) : ''})`;
          if (expect !== 'any' && !dim && (verdict === 'blurring') !== (expect === 'blur')) { failures++; verdict = 'FAIL ' + verdict; }
        }
      }
      console.log(`  ${label.padEnd(46)} ${verdict}${detail}`);
    }
    // How strong the stripes are over the screen: every 4th row across the middle 300 px, and of those the value a
    // quarter of the rows exceed. (Not the strongest row: a row of the player's waveform has a period of its own.)
    const sharpest = async () => { const shot = await shoot(); const v = []; for (let y = 2; y < shot.h; y += 4) v.push(stripes(shot, y, 46, 346) || 0); v.sort((a, b) => b - a); return v[Math.floor(v.length / 4)]; };
    return { page, cdp, touch, sample, sharpest, stripesIn, bottom, errs, close: () => ctx.close() };
  }

  // ====================================================================================================
  // Part 1: the tab row's glass, with the page behind kept sharp
  // ====================================================================================================
  {
    console.log(`[${DRIVER}] the tab row's glass: pages and tabs`);
    const s = await session('sink', 'none');
    await s.stripesIn('.under');
    const tabs = await s.page.locator('.dtb').boundingBox();
    const tx = (i) => tabs.x + tabs.width * (i + 0.5) / 4, ty = tabs.y + tabs.height / 2;
    await s.bottom(); await sleep(300);
    await s.sample('at rest');
    const tile = s.page.locator('.tabview.on [role="button"]', { hasText: '产品演示' }).first();
    const tb = await tile.boundingBox();
    await s.touch('touchStart', tb.x + 40, tb.y + 20); await sleep(40); await s.touch('touchEnd');
    await sleep(130); await s.sample('page coming in, 170 ms');
    await sleep(200); await s.sample('page coming in, 400 ms');
    await sleep(1200); await s.bottom(); await sleep(300); await s.sample('page in');
    await s.touch('touchStart', 30, 420); for (let i = 1; i <= 10; i++) { await s.touch('touchMove', 30 + 15 * i, 421); await sleep(16); }
    await sleep(300); await s.sample('back swipe, held at 40%');
    for (let i = 11; i <= 22; i++) { await s.touch('touchMove', 30 + 15 * i, 421); await sleep(16); }
    await s.touch('touchEnd');
    await sleep(120); await s.sample('back swipe let go, 120 ms');
    await sleep(300); await s.sample('back swipe let go, 420 ms');
    await sleep(1200); await s.sample('back on the first page');
    await s.page.touchscreen.tap(tx(2), ty);
    await sleep(110); await s.sample('tab switch, 110 ms');
    await sleep(600); await s.bottom(); await sleep(300); await s.sample('on the other tab');
    if (s.errs.length) { failures++; console.log('  page errors', s.errs); }
    await s.close();
  }

  for (const mode of MODES) {
    console.log(`[${DRIVER}] the tab row's glass: player, chrome mode "${mode}"`);
    // asis keeps the row inside the layer that fades: there it is not asserted, only shown
    const e = mode === 'asis' ? 'any' : 'blur';
    const s = await session(mode, 'none');
    await s.stripesIn('.under');
    const tabs = await s.page.locator('.dtb').boundingBox();
    await s.page.touchscreen.tap(tabs.x + tabs.width * 2.5 / 4, tabs.y + tabs.height / 2); await sleep(700);
    await s.bottom(); await sleep(300);
    await s.sample('before');
    const row = s.page.locator('.tabview.on [aria-label^="播放 "]').last();
    const rb = await row.boundingBox();
    await s.touch('touchStart', rb.x + 80, rb.y + rb.height / 2); await sleep(40); await s.touch('touchEnd');
    await sleep(140); await s.sample('player rising, 180 ms', e);
    await sleep(1200); await s.sample('player up', e);
    // pull it most of the way down and hold: what lies under is nearly back, the row is on its way back
    await s.touch('touchStart', 196, 120); for (let i = 1; i <= 16; i++) { await s.touch('touchMove', 196, 120 + 40 * i); await sleep(16); }
    await sleep(350); await s.sample('player held 3/4 of the way down', e);
    for (let i = 17; i <= 19; i++) { await s.touch('touchMove', 196, 120 + 40 * i); await sleep(16); }
    await s.touch('touchEnd');
    await sleep(90); await s.sample('player let go, 90 ms', e);
    await sleep(250); await s.sample('player let go, 340 ms', e);
    await sleep(1500); await s.sample('player gone');
    if (s.errs.length) { failures++; console.log('  page errors', s.errs); }
    await s.close();
  }

  // ====================================================================================================
  // Part 2: the page behind goes out of focus, by each technique
  // ====================================================================================================
  for (const depth of ['veil', 'filter', 'none']) {
    console.log(`[${DRIVER}] the page behind, depth mode "${depth}"`);
    const s = await session('sink', depth);
    const check = async (label, want) => {                    // want: 'sharp' | 'gone'
      const m = await s.sharpest();
      const ok = want === 'sharp' ? m > 0.2 : m < 0.08;
      measured++; if (!ok) failures++;
      console.log(`  ${label.padEnd(46)} ${ok ? '' : 'FAIL '}stripes ${m > 0.2 ? 'sharp' : m < 0.08 ? 'gone' : 'half gone'} (strength ${m.toFixed(2)})`);
    };
    const behind = depth === 'none' ? 'sharp' : 'gone';
    // under a pushed page: the stripes are on the page that goes behind
    await s.stripesIn('.tabview.on .layer.root');
    await s.bottom(); await sleep(300);
    await check('first page, in front', 'sharp');
    const tile = s.page.locator('.tabview.on [role="button"]', { hasText: '产品演示' }).first();
    const tb = await tile.boundingBox();
    await s.touch('touchStart', tb.x + 40, tb.y + 20); await sleep(40); await s.touch('touchEnd');
    await sleep(1500); await check('behind a pushed page', behind);
    await s.touch('touchStart', 30, 420); for (let i = 1; i <= 22; i++) { await s.touch('touchMove', 30 + 15 * i, 421); await sleep(16); }
    await s.touch('touchEnd'); await sleep(1500);
    await check('after the back swipe', 'sharp');
    // under the player: the stripes are behind everything the player covers
    await s.stripesIn('.under');
    const row = s.page.locator('.tabview.on [aria-label^="播放 "]').first();
    await row.evaluate((n) => { const p = n.closest('.page'), r = n.getBoundingClientRect(); p.scrollTop += r.top - innerHeight / 2; }); await sleep(400);
    const rb = await row.boundingBox();
    await s.touch('touchStart', rb.x + 80, rb.y + rb.height / 2); await sleep(40); await s.touch('touchEnd');
    await sleep(1500);
    if (!(await s.page.locator('.sheet').count())) { failures++; console.log('  FAIL the player did not open'); }
    await check('behind the player', behind);
    await s.touch('touchStart', 196, 120); for (let i = 1; i <= 19; i++) { await s.touch('touchMove', 196, 120 + 40 * i); await sleep(16); }
    await s.touch('touchEnd'); await sleep(1700);
    await check('after the player has gone', 'sharp');
    if (s.errs.length) { failures++; console.log('  page errors', s.errs); }
    await s.close();
  }

  console.log(failures ? `${failures} FAILED (of ${measured} measured)` : `all ${measured} measured samples as expected`);
  process.exitCode = failures ? 1 : 0;
  await browser.close(); server.close();
})();
