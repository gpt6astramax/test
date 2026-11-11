// Does what follows a gesture keep up when the main thread cannot?
//
// A finger-driven scroll is run by the browser's compositor and does not wait for the page's scripts. Whatever follows
// it (the page behind coming back into focus, the tab row returning) has to be run there too. If the main thread has
// to deliver its frames, it trails the finger whenever that thread is busy, and that looks like dropped frames
// although the page under the finger moves smoothly.
//
// Checked here, with the 'scroll' gesture driver: a pushed page, and then the player, are sent away by a smooth scroll
// that is started and left alone, and while they travel the main thread is blocked for 900 ms. A screencast (what the
// compositor drew) shows, frame by frame, where the travelling page is and what follows it looks like:
//   - what follows changes during the block      -> the compositor runs its animation
//   - it only changes once the block is over     -> the main thread does
// The depth modes 'veil' and 'none' must follow. 'filter' is the control: an animated blur radius cannot run on
// Chromium's compositor, so there the page behind is expected to freeze (reported, not asserted).
//
//   npm run build && node tests/compositor.js        (needs Playwright with Chromium)
//
// A touch drag cannot be used for this: the test harness delivers touch events through the main thread, which is
// blocked. A smooth scroll that is already under way is run by the compositor in the same way a fling is.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const zlib = require('zlib');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');     // the folder that holds public/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLOCK = 900, LEAD = 70;

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
  return { w, h, px(x, y) { const i = (y * w + x) * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}
// how much one colour channel stands out over the other two at a pixel: 0 = red, 1 = green, 2 = blue
const lead = (img, x, y, ch) => { const p = img.px(x, y); return p[ch] - Math.max(p[(ch + 1) % 3], p[(ch + 2) % 3]); };

(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  // backdrop filters need the GPU path; this is the software one
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;

  // Starts `scrollAway` (a smooth scroll), blocks the main thread, and reads the screencast: `read(img, k)` returns
  // { mover, followers: { name: value } } for one frame. Returns how many frames each changed in during the block.
  async function run(page, cdp, scrollAway, read) {
    const frames = [];
    const onFrame = (f) => { frames.push({ t: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); };
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await sleep(250);
    await page.evaluate(scrollAway);
    await sleep(LEAD);                                       // a smooth scroll needs one main frame to get going
    const [b0, b1] = await page.evaluate((ms) => { const a = Date.now(); const t = performance.now(); while (performance.now() - t < ms); return [a, Date.now()]; }, BLOCK);
    await sleep(900);
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);
    const counts = { mover: 0 };
    let prev = null;
    for (const f of frames) {
      const t = f.t - b0;
      if (t < 20 || t > b1 - b0) { if (t < 20) prev = null; continue; }      // only frames drawn while blocked
      const img = readPNG(Buffer.from(f.data, 'base64'));
      const now = read(img, img.w / 393);
      if (prev) {
        if (now.mover !== prev.mover) counts.mover++;
        for (const k in now.followers) { if (!(k in counts)) counts[k] = 0; if (now.followers[k] !== prev.followers[k]) counts[k]++; }
      } else for (const k in now.followers) if (!(k in counts)) counts[k] = 0;
      prev = now;
    }
    return counts;
  }
  // follows: it changed in at least 3 of the frames drawn during the block, and in at least half as many as the mover.
  // freezes: it changed in one at most (the frame the block began in).
  const follows = (counts, k) => counts[k] >= 3 && counts[k] >= counts.mover / 2;
  const freezes = (counts, k) => counts[k] <= 1;

  for (const depth of ['veil', 'none', 'filter']) {
    const control = depth === 'filter';
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((d) => { localStorage.setItem('depth-music:driver', 'scroll'); localStorage.setItem('depth-music:chrome-2', 'sink'); localStorage.setItem('depth-music:depth', d); }, depth);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1300);
    const cdp = await ctx.newCDPSession(page);
    const mark = (sel, css) => page.evaluate(([s, c]) => { const d = document.createElement('div'); d.className = 'test-mark'; d.style.cssText = 'position:absolute;z-index:50;pointer-events:none;' + c; document.querySelector(s).appendChild(d); }, [sel, css]);
    const say = (what, counts, k, label) => {
      const ok = follows(counts, k), frozen = freezes(counts, k);
      if (!control && !ok) failed++;
      const verdict = ok ? 'follows (compositor)' + (control ? ', which the control was not expected to' : '')
        : frozen ? (control ? 'freezes (main thread), as expected of the control' : 'FAIL freezes (main thread)')
          : (control ? 'unclear' : 'FAIL unclear');
      console.log(`  ${label.padEnd(34)} ${verdict}: changed in ${counts[k]} frames while the ${what} moved in ${counts.mover}`);
    };
    await page.evaluate(() => { const b = document.querySelector('.tabview.on [aria-label="暂停"]'); if (b) b.click(); });

    // ---------- a pushed page goes back
    console.log(`depth mode "${depth}"`);
    const tile = page.locator('.tabview.on [role="button"]', { hasText: '清晨剪辑' }).first();
    await tile.evaluate((n) => { const p = n.closest('.page'); const r = n.getBoundingClientRect(); p.scrollTop += r.top - innerHeight / 2; }); await sleep(300);
    await tile.tap(); await sleep(1500);
    await page.evaluate(() => { document.querySelector('.chrome').style.visibility = 'hidden'; });
    // green on the page behind, red on the page in front; the rest of the page in front is hidden, so that nothing
    // of it passes over the green marker while it travels
    await mark('.tabview.on .layer.root', 'left:96px;top:740px;width:200px;height:36px;background:#00ff00');
    await mark('.tabview.on .layer:last-child .lbody', 'left:20px;top:120px;width:40px;height:40px;background:#ff0000');
    const hide = await page.addStyleTag({ content: '.tabview.on .layer:last-child .lbody > :not(.test-mark){visibility:hidden}' });
    await sleep(500);
    let counts = await run(page, cdp,
      () => { document.querySelector('.tabview.on .layer:last-child').scrollTo({ left: 0, behavior: 'smooth' }); },
      (img, k) => {
        let redX = null;
        for (let x = 0; x < img.w; x++) if (lead(img, x, Math.round(140 * k), 0) > 60) { redX = Math.round(x / k); break; }
        // the green marker: its width follows the layer's scale, its strength the layer's opacity and blur
        let gw = 0, gmax = 0;
        for (let yy = 716; yy <= 780; yy += 4) { const y = Math.round(yy * k); let a = -1, b = -1; for (let x = 0; x < img.w; x++) { const d = lead(img, x, y, 1); if (d > gmax) gmax = d; if (d > 40) { if (a < 0) a = x; b = x; } } if (a >= 0) gw = Math.max(gw, Math.round((b - a + 1) / k)); }
        return { mover: redX, followers: { below: `${Math.round(gw / 2)} ${Math.round(gmax / 6)}` } };
      });
    say('page', counts, 'below', 'pushed page: the page behind');
    await sleep(900);
    await hide.evaluate((n) => n.remove());
    await page.evaluate(() => { document.querySelectorAll('.test-mark').forEach((n) => n.remove()); document.querySelector('.chrome').style.visibility = ''; });

    // ---------- the player goes away
    await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
    await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1600);
    // the player's own content is hidden so that the markers behind it can be seen: red on the sheet, green on what
    // lies under it, blue on the tab row
    await page.addStyleTag({ content: '.sheet-in{visibility:hidden}' });
    await mark('.sheet-panel', 'left:20px;top:300px;width:40px;height:40px;background:#ff0000');
    await mark('.under', 'left:96px;top:200px;width:200px;height:36px;background:#00ff00');
    await mark('.chrome', 'left:140px;top:-30px;width:60px;height:20px;background:#0000ff');
    await sleep(500);
    counts = await run(page, cdp,
      () => { document.querySelector('.sheet').scrollTo({ top: 0, behavior: 'smooth' }); },
      (img, k) => {
        let redY = null;
        for (let y = 0; y < img.h; y++) if (lead(img, Math.round(40 * k), y, 0) > 60) { redY = Math.round(y / k); break; }
        let gw = 0, gmax = 0;
        for (let yy = 150; yy <= 300; yy += 4) { const y = Math.round(yy * k); let a = -1, b = -1; for (let x = 0; x < img.w; x++) { const d = lead(img, x, y, 1); if (d > gmax) gmax = d; if (d > 40) { if (a < 0) a = x; b = x; } } if (a >= 0) gw = Math.max(gw, Math.round((b - a + 1) / k)); }
        let blueY = null;
        for (let y = 0; y < img.h; y++) if (lead(img, Math.round(196 * k), y, 2) > 60) { blueY = Math.round(y / k); break; }
        return { mover: redY, followers: { under: `${Math.round(gw / 2)} ${Math.round(gmax / 6)}`, row: blueY } };
      });
    say('player', counts, 'under', 'player: what lies under it');
    // the tab row moves by a transform in every depth mode: it is asserted in the control too
    const rowOk = follows(counts, 'row');
    if (!rowOk) failed++;
    console.log(`  ${'player: the tab row'.padEnd(34)} ${rowOk ? 'follows (compositor)' : 'FAIL freezes (main thread)'}: changed in ${counts.row} frames while the player moved in ${counts.mover}`);
    if (errs.length) { failed++; console.log('  page errors', errs); }
    await ctx.close();
  }
  console.log(failed ? `${failed} FAILED` : 'all as expected');
  process.exitCode = failed ? 1 : 0;
  await browser.close(); server.close();
})();
