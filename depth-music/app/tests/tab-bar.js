// The tab row belongs to the four root pages. A page over a root page (a pushed page, the player) covers it where it
// is: the row does not move, it goes out of focus and faint as the page behind does, and the page in front gets no
// glass of its own. Checked with either gesture driver:
//   1. on a root page: whole (the capsule at its own blur, icons sharp), and it takes taps
//   2. a page pushed: covered (icons blurred and faded like the page behind, capsule turned down, inert); a tap where
//      the row is reaches the page in front; the pushed page has no glass but its back button
//   3. two pages pushed: the row is gone
//   4. a back swipe held halfway: partly back; let go: whole as soon as the page has gone
//   5. the player: covered; pulled halfway: partly; gone: whole; no glass in the player
//   6. every frame of all that: nothing the capsule sits in has a filter, an opacity below 1 or an animation; nothing
//      in the row is animated; the row does not move; on the row's container nothing but `inert` is ever written
//
//   npm run build && node tests/tab-bar.js        (needs Playwright with Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');     // the folder that holds public/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch();
  let failed = 0;
  const ok = (name, cond, extra) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra === undefined ? '' : '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`); };

  for (const driver of ['scroll', 'js']) {
    console.log(`--- driver ${driver}`);
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((d) => localStorage.setItem('depth-music:driver', d), driver);
    await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1300);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.evaluate(() => { const b = document.querySelector('.tabview.on [aria-label="暂停"]'); if (b) b.click(); });

    // ---- 6. watched every frame from here on
    await page.evaluate(() => {
      const chrome = document.querySelector('.chrome'), haze = chrome.querySelector('.dtb-haze'), bar = chrome.querySelector('.dtb');
      const name = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''));
      const r0 = bar.getBoundingClientRect();
      window.watch = { bad: new Set(), on: true, frames: 0 };
      new MutationObserver((list) => { for (const m of list) if (m.attributeName !== 'inert') watch.bad.add(`${m.attributeName} written on the row's container`); })
        .observe(chrome, { attributes: true });
      const tick = () => {
        if (!watch.on) return;
        watch.frames++;
        for (let e = haze.parentElement; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.filter && cs.filter !== 'none') watch.bad.add(name(e) + ' (around the capsule): filter');
          if (+cs.opacity < 0.999) watch.bad.add(name(e) + ' (around the capsule): opacity below 1');
          if (e.getAnimations().length) watch.bad.add(name(e) + ' (around the capsule): animation');
        }
        for (const e of [haze, ...chrome.querySelectorAll('.dtb-haze, .dtb-ink, .shell')]) if (e.getAnimations().length) watch.bad.add(name(e) + ': animation');
        const r = bar.getBoundingClientRect();
        if (Math.abs(r.top - r0.top) > 0.5 || Math.abs(r.left - r0.left) > 0.5 || Math.abs(r.width - r0.width) > 0.5) watch.bad.add('the row moved');
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // the row as it is: capsule blur, the first icon's filter and opacity, inert, and what a tap at the second tab hits
    const row = () => page.evaluate(() => {
      const chrome = document.querySelector('.chrome'), h = chrome.querySelector('.dtb-haze'), i = chrome.querySelector('.dtb-item');
      const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(h).backdropFilter);
      const r = chrome.querySelector('.dtb').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width * 1.5 / document.querySelectorAll('.dtb-item').length, r.top + r.height / 2);
      return { capsule: m ? +m[1] : null, icon: getComputedStyle(i).filter, o: +getComputedStyle(i).opacity, inert: chrome.inert, hit: hit && hit.closest('.chrome') ? 'row' : hit && hit.closest('.sheet') ? 'player' : hit && hit.closest('.layer') ? 'page' : 'other' };
    });
    const whole = (r) => r.capsule === 18 && r.icon === 'none' && r.o === 1 && !r.inert && r.hit === 'row';
    const covered = (r) => r.capsule < 0.5 && /blur\(20px\)/.test(r.icon) && r.o === 0.5 && r.inert && r.hit !== 'row';
    // glass in an element: everything in it with a backdrop-filter
    const glassIn = (sel) => page.evaluate((s) => [...document.querySelectorAll(s + ', ' + s + ' *')].filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== 'none'; }).map((e) => e.getAttribute('aria-label') || e.className), sel);

    // ---- 1. root page
    let r = await row();
    ok('root page: the row is whole and takes taps', whole(r), r);
    const N = await page.locator('.dtb-item').count();
    const tabs = await page.locator('.dtb').boundingBox();
    await page.touchscreen.tap(tabs.x + tabs.width * 1.5 / N, tabs.y + tabs.height / 2); await sleep(700);
    const tabOn = await page.evaluate(() => document.querySelector('.dtb-item[data-on]').getAttribute('aria-label'));
    await page.touchscreen.tap(tabs.x + tabs.width * 0.5 / N, tabs.y + tabs.height / 2); await sleep(700);
    r = await row();
    ok('root pages: a tap on the row switches tabs, and it stays whole', tabOn === '搜索' && whole(r), { tabOn, ...r });

    // ---- 2. a page pushed
    const tile = page.locator('.tabview.on [role="button"]', { hasText: '清晨剪辑' }).first();
    await tile.evaluate((n) => { const p = n.closest('.page'); const b = n.getBoundingClientRect(); p.scrollTop += b.top - 300; }); await sleep(300);
    const tb = await tile.boundingBox();
    await touch('touchStart', tb.x + 40, tb.y + 30); await sleep(40); await touch('touchEnd'); await sleep(1500);
    r = await row();
    ok('a page pushed: the row is covered where it is', covered(r), r);
    ok('a page pushed: a tap where the row is reaches the page in front', r.hit === 'page', r.hit);
    const pushedGlass = await glassIn('.tabview.on .layer:last-child');
    ok('a page pushed: no glass of its own, only the back button', pushedGlass.length === 1 && pushedGlass[0] === '返回', pushedGlass);

    // ---- 4. back swipe: held halfway, then let go
    await touch('touchStart', 30, 420); for (let x = 30; x <= 210; x += 10) { await touch('touchMove', x, 421); await sleep(16); }
    await sleep(350);
    r = await row();
    ok('back swipe held halfway: partly back (icons less blurred, capsule partly)', r.capsule > 0 && r.capsule < 18 && r.o > 0.5 && r.o < 1 && r.inert, r);
    for (let x = 220; x <= 390; x += 10) { await touch('touchMove', x, 421); await sleep(16); }
    await touch('touchEnd');
    const t0 = Date.now(); let wholeAt = null, goneAt = null;
    while (Date.now() - t0 < 2500) {
      const s = await page.evaluate(() => ({ depth: document.querySelectorAll('.tabview.on .layer:not(.root)').length, stack: document.querySelector('.tabview.on .layer:last-child').classList.contains('root') }));
      r = await row();
      if (goneAt === null && s.stack) goneAt = Date.now() - t0;
      if (whole(r)) { wholeAt = Date.now() - t0; break; }
      await sleep(10);
    }
    ok('back swipe let go: the row is whole as soon as the page has gone', wholeAt !== null && wholeAt < 900, `whole ${wholeAt} ms after letting go`);

    // ---- 3. two pages pushed: from the player to the artist, from the artist to one of its moods
    await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
    await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1600);
    await page.locator('.sheet').getByText('Kite Assembly').first().click(); await sleep(2200);
    const chip = page.locator('.tabview.on .layer:last-child [role="button"]').filter({ hasText: /^(平静|明亮|慵懒|律动|温暖|紧张|希望|复古)$/ }).first();
    if (await chip.count()) {
      await chip.click(); await sleep(1600);
      const depth = await page.evaluate(() => document.querySelectorAll('.tabview.on .layer').length - 1);
      r = await row();
      ok('two pages pushed: the row is gone', depth === 2 && r.o === 0 && r.inert && r.hit !== 'row', { depth, ...r });
      await page.locator('.tabview.on .layer:last-child [aria-label="返回"]').click(); await sleep(1500);
      r = await row();
      ok('one back again: covered as for one page', covered(r), r);
      await page.locator('.tabview.on .layer:last-child [aria-label="返回"]').click(); await sleep(1500);
      r = await row();
      ok('back on the root page by the back button: whole', whole(r), r);
    } else { failed++; console.log('FAIL could not open the artist and a mood from the player'); }

    // ---- 5. the player
    await page.evaluate(() => document.querySelector('.tabview.on .page').scrollTo(0, 400)); await sleep(300);
    await page.locator('.tabview.on [aria-label^="播放 "]').first().tap(); await sleep(1600);
    r = await row();
    ok('the player up: the row is covered where it is', covered(r) && r.hit === 'player', r);
    const playerGlass = await glassIn('.sheet');
    ok('the player has no glass of its own', playerGlass.length === 0, playerGlass);
    await touch('touchStart', 196, 120); for (let y = 130; y <= 620; y += 10) { await touch('touchMove', 196, y); await sleep(12); } await sleep(350);
    r = await row();
    ok('the player pulled halfway: the row partly back', r.capsule >= 0 && r.capsule < 18 && r.o > 0.5 && r.o < 1, r);
    for (let y = 630; y <= 880; y += 10) { await touch('touchMove', 196, y); await sleep(12); }
    await touch('touchEnd');
    const t1 = Date.now(); wholeAt = null;
    while (Date.now() - t1 < 2500) { r = await row(); if (whole(r)) { wholeAt = Date.now() - t1; break; } await sleep(10); }
    ok('the player let go: the row is whole as soon as the player has gone', wholeAt !== null && wholeAt < 900, `whole ${wholeAt} ms after letting go`);

    // ---- 6.
    await sleep(800);
    const w = await page.evaluate(() => { watch.on = false; return { bad: [...watch.bad], frames: watch.frames }; });
    ok(`every frame (${w.frames}): nothing around the capsule filtered, faded or animated; nothing in the row animated; the row never moved; only inert written on its container`, w.bad.length === 0, w.bad);
    if (errs.length) { failed++; console.log('page errors', errs); }
    await ctx.close();
  }
  console.log(failed ? `${failed} FAILED` : 'all as expected');
  process.exitCode = failed ? 1 : 0;
  await browser.close(); server.close();
})();
