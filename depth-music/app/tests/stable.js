// The rule: while a finger scrolls a page across the end of a transition, nothing changes on that page or on
// anything it sits in (no attribute, no inline style, no class, no animation coming or going). Checks it for a tab
// switch, a page coming in, a back swipe and the player going away, with either gesture driver. Also: the tab row's
// blur is never inside an ancestor that carries a filter.
//
//   npm run build && DRIVERS=scroll,js node tests/stable.js        (needs Playwright with Chromium)
//
// It serves ../public (the build) under /depth-music/ and drives it with real touch input.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');     // the folder that holds public/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch();
  let total = 0;
  for (const driver of (process.env.DRIVERS || 'scroll').split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript((d) => localStorage.setItem('depth-music:driver', d), driver);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1500);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => {
      const name = (el) => el === document.documentElement ? 'html' : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
      window.watch = {
        log: [], t0: 0, counts: new Map(), on: false,
        start() { this.log = []; this.t0 = performance.now(); this.counts = new Map(); this.scroller = null; this.down = 0; this.on = true; },
        // what changed on the element being scrolled or anything it sits in, from `from` ms after start()
        down: 0,
        finger() { this.down = performance.now() - this.t0; const hit = document.elementFromPoint(200, 620); this.scroller = hit && hit.closest('.page, .sheet-scroll'); },
        report() {
          this.on = false;
          const chain = new Set(); for (let e = this.scroller; e; e = e.parentElement) chain.add(e);
          const mine = this.log.filter((m) => chain.has(m.el) && m.t >= this.down);
          // an entrance animation running out by itself is the one thing that has to happen; the layer it ran on stays
          const ok = (m) => /^animations "script" -> ""$/.test(m.what);
          return { scroller: this.scroller ? name(this.scroller.parentElement) + ' > ' + name(this.scroller) : 'none',
            bad: mine.filter((m) => !ok(m)).map((m) => `${Math.round(m.t - this.down)}ms after touch: ${name(m.el)} ${m.what}`), ran: mine.filter(ok).length };
        },
      };
      new MutationObserver((list) => { if (!watch.on) return; const t = performance.now() - watch.t0; for (const m of list) watch.log.push({ t, el: m.target, what: m.attributeName + (m.attributeName === 'style' ? ' "' + m.target.getAttribute('style').slice(0, 70) + '"' : m.attributeName === 'class' ? ' "' + m.target.className + '"' : '') }); })
        .observe(document.documentElement, { attributes: true, subtree: true });
      const tick = () => {
        if (watch.on) {
          const t = performance.now() - watch.t0;
          for (let e = watch.scroller || document.querySelector('.tabview.on .page'); e; e = e.parentElement) {
            const n = e.getAnimations().map((a) => a.animationName || (a.effect && a.effect.getKeyframes ? 'script' : '?')).sort().join('+');
            if (watch.counts.has(e) && watch.counts.get(e) !== n) watch.log.push({ t, el: e, what: `animations "${watch.counts.get(e)}" -> "${n}"` });
            watch.counts.set(e, n);
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const slowScroll = async (ms) => { await touch('touchStart', 200, 620); await page.evaluate(() => watch.finger()); const n = Math.round(ms / 40); for (let i = 1; i <= n; i++) { await touch('touchMove', 200, 620 - 300 * i / n); await sleep(40); } await touch('touchEnd'); };
    const report = async (label) => {
      const r = await page.evaluate(() => watch.report());
      total += r.bad.length;
      console.log(`[${driver}] ${label} (${r.scroller}): ${r.bad.length ? r.bad.length + ' change(s) under the finger' : 'nothing changed under the finger'}${r.ran ? ', the entrance ran out' : ''}`);
      r.bad.slice(0, 6).forEach((l) => console.log('     ' + l));
    };
    const N = await page.locator('.sgm-tabs .sgm-item').count();
    const tabs = await page.locator('.sgm-tabs').boundingBox();
    const tx = (i) => tabs.x + tabs.width * (i + 0.5) / N, ty = tabs.y + tabs.height / 2;

    // 1. tab switch, then scroll the new tab straight away
    await page.evaluate(() => watch.start());
    await page.touchscreen.tap(tx(2), ty); await sleep(100);
    await slowScroll(1400);
    await report('tab switch, scrolling the new tab at once');
    await page.touchscreen.tap(tx(0), ty); await sleep(700);

    // 2. a page comes in, scrolled while it does
    const tile = page.locator('.tabview.on [role="button"]', { hasText: '清晨剪辑' }).first();
    await tile.evaluate((n) => { const p = n.closest('.page'); const r = n.getBoundingClientRect(); p.scrollTop += r.top - innerHeight / 2; }); await sleep(600);
    await page.evaluate(() => watch.start());
    await tile.tap(); await sleep(120);
    await slowScroll(1500);
    await report('page coming in, scrolled meanwhile');
    await sleep(700);

    // 3. swipe back, then scroll the page below as soon as the finger is free
    await touch('touchStart', 30, 420); for (let i = 1; i <= 8; i++) { await touch('touchMove', 30 + 38 * i, 421); await sleep(16); }
    await page.evaluate(() => watch.start());
    await touch('touchEnd'); await sleep(260);
    await slowScroll(1600);
    await report('after a back swipe, scrolling the page below at once');
    await sleep(700);

    // 4. the player: pulled down, then the page is scrolled at once
    await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
    await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1300);
    await touch('touchStart', 196, 200); for (let i = 1; i <= 8; i++) { await touch('touchMove', 196, 200 + 60 * i); await sleep(16); }
    await page.evaluate(() => watch.start());
    await touch('touchEnd'); await sleep(450);
    await slowScroll(1600);
    await report('after the player is pulled down, scrolling the page at once');

    // 5. the tab row's blur never sits inside something that carries a filter (Safari then shows it as clear glass):
    //    sampled every frame while the player comes up, is pulled part of the way, let go, and pulled away
    await sleep(600);
    await page.evaluate(() => {
      window.glass = { bad: new Set(), on: true };
      const haze = document.querySelector('.sgm-haze');
      const tick = () => { if (!glass.on) return; for (let e = haze.parentElement; e; e = e.parentElement) { const f = getComputedStyle(e).filter; if (f && f !== 'none') glass.bad.add((e.className || e.tagName) + ' ' + f.replace(/[\d.]+px/, 'Npx')); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1300);
    await touch('touchStart', 196, 200); for (let i = 1; i <= 8; i++) { await touch('touchMove', 196, 200 + 20 * i); await sleep(16); }
    await sleep(200); await touch('touchEnd'); await sleep(900);
    await touch('touchStart', 196, 200); for (let i = 1; i <= 8; i++) { await touch('touchMove', 196, 200 + 60 * i); await sleep(16); }
    await touch('touchEnd'); await sleep(300);
    await slowScroll(800);
    const bad = await page.evaluate(() => { glass.on = false; return [...glass.bad]; });
    total += bad.length;
    console.log(`[${driver}] the tab row's blur through the player's coming and going: ${bad.length ? 'inside a filtered ancestor: ' + bad.join(' | ') : 'never inside a filtered ancestor'}`);
    await ctx.close();
  }
  console.log(total ? `TOTAL ${total} change(s)` : 'TOTAL none');
  process.exitCode = total ? 1 : 0;
  await browser.close(); server.close();
})();
