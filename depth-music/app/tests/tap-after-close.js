// 1. A player that slid down out of sight and stopped a few pixels short of the end, never reporting that it came to
//    rest (seen on iPhone): it counts as gone once left alone, so the next tap on a track opens the player, at once.
// 2. A track tapped right after the player was swiped away opens the player again, on the first tap, however soon after
// letting go it comes. Checked with either gesture driver, at several delays after the finger lifts (from 60 ms: a
// touch that lands while the browser is still running the sheet's snap only stops it, in Chromium, as on a phone).
//
//   npm run build && node tests/tap-after-close.js        (needs Playwright with Chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.ROOT || path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch();
  let failed = 0;
  for (const driver of ['scroll', 'js']) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((d) => localStorage.setItem('depth-music:driver', d), driver);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1300);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
    const rowAt = await page.evaluate(() => { const r = document.querySelectorAll('.tabview.on [aria-label^="播放 "]')[1].getBoundingClientRect(); return { x: r.left + 120, y: r.top + r.height / 2 }; });
    // the player is up: a sheet that is not on its way out, its panel at the top
    const up = () => page.evaluate(() => [...document.querySelectorAll('.sheet')].some((s) => !s.inert && s.querySelector('.sheet-panel').getBoundingClientRect().top < 60));
    // ---- 1. stuck a few pixels short (the scroll driver: a native scroller that will not go the rest of the way)
    if (driver === 'scroll') {
      await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1500);
      const track0 = await page.evaluate(() => document.querySelector('.tabview.on [aria-label^="播放 "]').getAttribute('aria-label'));
      await page.evaluate(() => { const s = document.querySelector('.sheet'); s.style.scrollSnapType = 'none'; s.scrollTo = () => {}; s.scrollTop = 3; });
      await sleep(2000);
      const before = await page.evaluate(() => document.querySelector('.tabview.on [aria-label^="播放 "]') && [...document.querySelectorAll('.tabview.on [aria-label^="播放 "]')][1].getAttribute('aria-label'));
      await touch('touchStart', rowAt.x, rowAt.y); await sleep(40); await touch('touchEnd'); await sleep(1500);
      const opened = await up();
      console.log(`[${driver}] stopped 3 px short of gone, never reported; then a track tapped once: ${opened ? 'opened' : 'NOT OPENED'}`);
      if (!opened) failed++;
      else { await page.evaluate(() => document.querySelector('.sheet:not([inert]) .sheet-handle').click()); await sleep(1500); }
      await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
    }
    const line = [];
    for (const delay of [60, 100, 150, 250, 400, 600, 800]) {
      await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1500);
      if (!(await up())) { line.push(`${delay}ms: player did not open to start with`); failed++; continue; }
      await touch('touchStart', 196, 120);
      for (let y = 130; y <= 880; y += 25) { await touch('touchMove', 196, y); await sleep(8); }
      await touch('touchEnd');
      await sleep(delay);
      await page.evaluate(() => { window.__fr = []; const rec = () => { if (!window.__fr) return; __fr.push([...document.querySelectorAll('.sheet')].map((s) => Math.round(s.querySelector('.sheet-panel').getBoundingClientRect().top) + (s.inert ? 'i' : '') + (s.classList.contains('sg-passing') ? 'p' : '')).join('|') || '-'); requestAnimationFrame(rec); }; rec(); });
      await touch('touchStart', rowAt.x, rowAt.y); await sleep(40); await touch('touchEnd');
      await sleep(1500);
      const fr = await page.evaluate(() => { const f = window.__fr; window.__fr = null; return f.filter((x, i) => i === 0 || x !== f[i - 1]); });
      const opened = await up();
      line.push(`${delay}ms ${opened ? 'opened' : 'NOT OPENED (sheet panel top per frame: ' + fr.slice(0, 40).join(' ') + ')'}`);
      if (!opened) failed++;
      else { await page.evaluate(() => document.querySelector('.sheet-handle').click()); await sleep(1500); }
    }
    console.log(`[${driver}] tap a track after swiping the player away: ${line.join(', ')}`);
    if (errs.length) { failed++; console.log('page errors', errs); }
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'all as expected');
  process.exit(failed ? 1 : 0);
})();
