// What the tab row does while the player is up, in each of the selectable ways (src/lib/chrome-mode.js), with either
// gesture driver: where it is once the player is up, part of the way down and gone, and whether its glass ever sat,
// while showing, inside something that switches glass off: an ancestor with a filter, with an opacity below 1, or with
// an animation that has opacity or a filter in its keyframes (even one that stays at 1). Every frame is checked.
// (tests/glass.js measures the same thing from pixels.)
//
//   npm run build && node tests/chrome-modes.js        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');     // the folder that holds public/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODES = ['top', 'cover', 'sink', 'rise', 'left', 'fade', 'noglass', 'asis'];
// asis is the control: it is expected to break the rule
const EXPECT_CLEAN = { cover: true, top: true, sink: true, rise: true, left: true, fade: true, noglass: true, asis: false };
// these do nothing to the row: not one attribute, style or animation on it or in it may change while the player comes and goes
const UNTOUCHED = { cover: true, top: true };
(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch();
  let failed = 0;
  for (const driver of ['scroll', 'js']) for (const mode of MODES) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(([d, m]) => { localStorage.setItem('depth-music:driver', d); localStorage.setItem('depth-music:chrome-3', m); }, [driver, mode]);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1200);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => {
      window.glass = { bad: new Set(), on: true };
      const tick = () => {
        if (!glass.on) return;
        const haze = document.querySelector('.dtb-haze');
        if (haze && getComputedStyle(haze).display !== 'none') for (let e = haze.parentElement; e; e = e.parentElement) {
          const cs = getComputedStyle(e), who = String(e.className || e.tagName).split(' ')[0];
          if (cs.filter && cs.filter !== 'none') glass.bad.add(who + ': filter');
          if (+cs.opacity < 0.999) glass.bad.add(who + ': opacity below 1');
          for (const a of e.getAnimations()) {
            const keys = new Set(); for (const k of a.effect.getKeyframes()) for (const n in k) keys.add(n);
            if (keys.has('opacity')) glass.bad.add(who + ': opacity animation');
            if (keys.has('filter')) glass.bad.add(who + ': filter animation');
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // where the row is and how present its parts are (--chrome-o: 1 .. 0, the 'fade' way dims them through it)
    const at = () => page.evaluate(() => {
      const c = document.querySelector('.chrome'), r = c.getBoundingClientRect(), haze = document.querySelector('.dtb-haze');
      const o = +getComputedStyle(c).getPropertyValue('--chrome-o') || 0;
      const on = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && o > 0.02;
      return (on ? `on screen (top ${Math.round(r.top)}, parts ${o.toFixed(2)})` : o > 0.02 ? 'off screen' : 'dimmed out in place') + (getComputedStyle(haze).display === 'none' ? ', blur off' : '') + (c.closest('.under') ? ' [in the layer that fades]' : '');
    });
    // everything that happens to the row or inside it from here on: attributes (style, class, inert, …), nodes, animations
    await page.evaluate(() => {
      window.rowLog = new Set();
      const c = document.querySelector('.chrome');
      new MutationObserver((list) => { for (const m of list) rowLog.add(m.type === 'attributes' ? `${m.target.className || m.target.tagName}: ${m.attributeName}` : 'nodes changed'); })
        .observe(c, { attributes: true, childList: true, subtree: true });
      const tick = () => { if (!glass.on) return; for (const e of [c, ...c.querySelectorAll('*')]) if (e.getAnimations().length) rowLog.add(`${e.className || e.tagName}: animation`); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      // and what is written on the elements the row sits in (not asserted: shown, to compare with a pushed page)
      window.aboveLog = new Set();
      for (let e = c.parentElement; e; e = e.parentElement) {
        new MutationObserver((list) => { for (const m of list) aboveLog.add(`${m.target.id ? '#' + m.target.id : m.target.tagName.toLowerCase()}: ${m.attributeName}${m.attributeName === 'style' ? ' (' + (m.target.getAttribute('style') || '').replace(/--sg-timeline-\d+/g, '--sg-timeline-N').slice(0, 60) + ')' : ''}`); })
          .observe(e, { attributes: true });
      }
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
    const touched = await page.evaluate(() => [...rowLog]);
    const above = await page.evaluate(() => [...aboveLog]);
    const back = tabs[0] === 774 && /on screen/.test(gone) && /parts 1\.00/.test(gone) && !/blur off/.test(gone);
    // while the player is up, the ways that leave must have the row out of sight
    const away = { cover: /on screen \(top 774, parts 1\.00\)$/, top: /on screen \(top 774, parts 1\.00\)$/, sink: /off screen/, rise: /off screen/, left: /off screen/, fade: /dimmed out/, noglass: /blur off/, asis: /on screen/ }[mode].test(up);
    const alone = !UNTOUCHED[mode] || touched.length === 0;
    const ok = back && away && alone && (bad.length === 0) === EXPECT_CLEAN[mode] && !errs.length;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${driver}] ${mode.padEnd(8)} up: ${up} | halfway down: ${half} | after: ${back ? 'back in place' : gone + ' ' + tabs} | glass inside something that switches it off: ${bad.length ? 'yes (' + bad.join(', ') + ')' : 'never'} | done to the row: ${touched.length ? touched.slice(0, 4).join(', ') + (touched.length > 4 ? ', …' : '') : 'nothing'}${errs.length ? ' | ' + errs[0] : ''}`);
    if (process.env.ABOVE) console.log('       written on what the row sits in: ' + (above.length ? above.join(' ; ') : 'nothing'));
    await ctx.close();
  }
  console.log(failed ? `${failed} failed` : 'all as expected (asis is the control and is meant to break the rule)');
  process.exitCode = failed ? 1 : 0;
  await browser.close(); server.close();
})();
