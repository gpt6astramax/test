// What the tab row does while the player is up, in each of the selectable ways (src/lib/chrome-mode.js), with either
// gesture driver: where it is once the player is up, part of the way down and gone, and whether its blur ever sat,
// while showing, inside an ancestor that carries a filter (in Safari that shows as clear glass).
//
//   npm run build && node tests/chrome-modes.js        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');     // the folder that holds public/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODES = ['sink', 'rise', 'left', 'fade', 'noglass', 'asis'];
// asis is the control: it is expected to break the rule
const EXPECT_CLEAN = { sink: true, rise: true, left: true, fade: true, noglass: true, asis: false };
(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch();
  let failed = 0;
  for (const driver of ['scroll', 'js']) for (const mode of MODES) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(([d, m]) => { localStorage.setItem('depth-music:driver', d); localStorage.setItem('depth-music:chrome', m); }, [driver, mode]);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1200);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => {
      window.glass = { bad: new Set(), on: true };
      const tick = () => {
        if (!glass.on) return;
        const haze = document.querySelector('.dtb-haze');
        if (haze && getComputedStyle(haze).display !== 'none') for (let e = haze.parentElement; e; e = e.parentElement) { const f = getComputedStyle(e).filter; if (f && f !== 'none') glass.bad.add(String(e.className || e.tagName).split(' ')[0]); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const at = () => page.evaluate(() => {
      const c = document.querySelector('.chrome'), r = c.getBoundingClientRect(), haze = document.querySelector('.dtb-haze');
      let o = 1; for (let e = c; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
      const on = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && o > 0.02;
      return (on ? `on screen (top ${Math.round(r.top)}, opacity ${o.toFixed(2)})` : 'gone') + (getComputedStyle(haze).display === 'none' ? ', blur off' : '') + (c.closest('.under') ? ' [in the blurred layer]' : '');
    });
    await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1300);
    const up = await at();
    await touch('touchStart', 196, 200); for (let i = 1; i <= 10; i++) { await touch('touchMove', 196, 200 + 45 * i); await sleep(16); }
    await sleep(250);
    const half = await at();
    for (let i = 11; i <= 14; i++) { await touch('touchMove', 196, 200 + 45 * i); await sleep(16); }
    await touch('touchEnd'); await sleep(1500);
    const gone = await at();
    const tabs = await page.evaluate(() => { const b = document.querySelector('.dtb').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; });
    const bad = await page.evaluate(() => { glass.on = false; return [...glass.bad]; });
    const back = tabs[0] === 774 && /on screen/.test(gone) && /opacity 1\.00/.test(gone) && !/blur off/.test(gone);
    const ok = back && (bad.length === 0) === EXPECT_CLEAN[mode] && !errs.length;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${driver}] ${mode.padEnd(8)} up: ${up} | halfway down: ${half} | after: ${back ? 'back in place' : gone + ' ' + tabs} | blur inside a filter: ${bad.length ? 'yes (' + bad.join(',') + ')' : 'never'}${errs.length ? ' | ' + errs[0] : ''}`);
    await ctx.close();
  }
  console.log(failed ? `${failed} failed` : 'all as expected (asis is the control and is meant to break the rule)');
  process.exitCode = failed ? 1 : 0;
  await browser.close(); server.close();
})();
