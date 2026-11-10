// Checks the JS gesture paging engine and the "end of a turn lets touches through" rule (0-20% zone) in the standalone build.
// Usage: node tools/jspaging.js index.html out-dir   (env PLAYWRIGHT / CHROME / BROWSER as in shoot.js)
// The touch part needs Chrome's DevTools protocol and is skipped in WebKit.
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const engine = process.env.BROWSER || 'chromium';   // chromium | webkit
const file = 'file://' + path.resolve(process.argv[2]);
const out = process.argv[3];
const failures = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); };

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(file);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
const counter = (page) => page.evaluate(() => document.querySelector('[data-df-thumb]').parentElement.previousElementSibling.textContent.replace(/\s+/g, ''));
const st = (page) => page.evaluate(() => {
  const c = window.__dfDemo;
  const pages = document.querySelectorAll('[data-df-page]');
  return {
    p: +c.p.toFixed(4), index: c.index, paging: c.paging, mode: c.mode, anim: !!c.janim, jpass: c.jpass, passDest: c.passDest,
    pe: Array.from(pages).map((el) => getComputedStyle(el).pointerEvents[0]).join(''),
    deckPassing: document.querySelector('[data-df-deck]').classList.contains('df-passing'),
  };
});
const scrollTopOf = (page, i) => page.evaluate((i) => document.querySelectorAll('[data-df-page]')[i].scrollTop, i);
// wait until a JS turn is inside its passthrough zone
const waitTail = (page) => page.waitForFunction(() => { const c = window.__dfDemo; return c.janim && Math.abs(c.p - c.janim.target) < c.zone(); }, null, { polling: 'raf', timeout: 3000 });
const setZone = (page, v) => page.$eval('#passZone', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
// run a JS turn to `to` and report how far from the target it was when touches started passing through
const firstPass = (page, to) => page.evaluate((to) => new Promise((done) => {
  const c = window.__dfDemo;
  let first = null;
  c.go(to);
  const tick = () => {
    if (first === null && c.jpass) first = Math.abs(c.p - to);
    if (c.janim) requestAnimationFrame(tick); else done(first);
  };
  requestAnimationFrame(tick);
}), to);

(async () => {
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});

  // ---- desktop: JS paging with wheel, keys, mouse ----
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 1280, height: 920 } });
    const box = await page.locator('#device').boundingBox();
    const s = box.width / 390;
    const at = (x, y) => ({ x: box.x + x * s, y: box.y + y * s });
    const c = at(195, 380);

    await page.click('[data-paging="js"]');
    await page.waitForTimeout(200);
    let t = await st(page);
    const tlDisabled = await page.evaluate(() => document.querySelector('[data-mode="timeline"]').disabled);
    const jsPressed = await page.getAttribute('[data-mode="js"]', 'aria-pressed');
    check(t.paging === 'js' && t.mode === 'js' && tlDisabled && jsPressed === 'true', 'JS paging on: blur falls back to JS, "CSS 跟手" disabled');
    check(await page.evaluate(() => getComputedStyle(document.querySelector('[data-df-page]')).position) === 'absolute', 'pages stack absolutely');

    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(70, 0); await page.waitForTimeout(8); }
    await page.waitForTimeout(1100);
    check(await counter(page) === '02/11', 'horizontal wheel turns one page (' + (await counter(page)) + ')');
    const res = await page.evaluate(() => { const cs = getComputedStyle(document.querySelectorAll('[data-df-page]')[0]); return { op: +cs.opacity, f: cs.filter }; });
    check(Math.abs(res.op - 0.75) < 0.02 && /blur\(40px\)/.test(res.f), 'previous page rests as residue (' + res.op + ', ' + res.f + ')');

    // two swipes back to back: the second one starts in the momentum tail of the first
    const deltas = [6, 14, 24, 30, 26, 18, 12, 9, 7, 5, 4, 3, 8, 20, 30, 26, 18, 12, 8, 5, 3, 2];
    for (const d of deltas) { await page.mouse.wheel(d, 0); await page.waitForTimeout(16); }
    await page.waitForTimeout(engine === 'webkit' ? 1800 : 1100);
    check(await counter(page) === '04/11', 'a second swipe inside the momentum tail turns another page (' + (await counter(page)) + ')');

    await page.mouse.move(c.x, c.y);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(500);
    t = await st(page);
    check((await scrollTopOf(page, 3)) > 200 && t.index === 3 && t.p === 3, 'vertical wheel scrolls inside the page only');

    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
    await page.waitForTimeout(1300);
    check(await counter(page) === '07/11', 'three quick → presses land on page 7 (' + (await counter(page)) + ')');

    // mouse drag: halfway frame, then a flick
    await page.mouse.move(c.x + 120, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(c.x + 120 - i * 18 * s, c.y); await page.waitForTimeout(40); }
    t = await st(page);
    check(t.p > 6.5 && t.p < 6.6, 'mouse drag follows the pointer (p = ' + t.p + ')');
    await page.screenshot({ path: out + '/js-mid-drag.png' });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    check(await counter(page) === '08/11', 'slow drag past halfway turns the page (' + (await counter(page)) + ')');
    await page.mouse.move(c.x - 60, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(c.x - 60 + i * 10, c.y); await page.waitForTimeout(40); }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    t = await st(page);
    check(t.index === 7 && t.p === 7, 'short slow drag springs back');

    // passthrough (back turn): a press at the end of the turn belongs to the destination, the turn keeps finishing
    await page.evaluate(() => window.__dfDemo.go(6));
    await waitTail(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    t = await st(page);
    const pe = t.pe;
    check(t.anim && t.jpass && t.passDest === 6 && pe[6] === 'a' && pe[7] === 'n', 'end of a back turn: destination takes the pointer, the leaving page does not (' + pe + ')');
    await page.waitForFunction(() => !window.__dfDemo.janim, null, { polling: 'raf', timeout: 2500 }).catch(() => {});
    t = await st(page);
    check(!t.anim && t.index === 6, 'the turn finishes while the button is still held');
    await page.mouse.up();
    // a sideways drag that starts in the zone takes the page from where the turn has got to (no jump)
    await page.evaluate(() => window.__dfDemo.go(5));
    await waitTail(page);
    const pDown = (await st(page)).p;
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(c.x + i * 12, c.y); await page.waitForTimeout(16); }
    t = await st(page);
    check(!t.anim && t.p < pDown - 0.15 && t.p > pDown - 0.3, 'sideways drag in the zone picks the page up where it is (' + pDown + ' -> ' + t.p + ')');
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    check((await st(page)).index === 5, 'and springs back to the destination');
    // off: a press in the tail catches the page where it is
    await page.click('[data-pass="off"]');
    await page.evaluate(() => window.__dfDemo.go(4));
    await waitTail(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(400);
    t = await st(page);
    const z = await page.evaluate(() => window.__dfDemo.zone());
    check(!t.anim && t.index === 5 && t.p > 4 && t.p < 4 + z, 'passthrough off: a press near the end stops the turn (p = ' + t.p + ')');
    await page.mouse.up();
    await page.waitForTimeout(900);
    check((await st(page)).index === 4, 'and it finishes on release');
    await page.click('[data-pass="back"]');

    // threshold slider: 20 starts passing 20% before the end, 0 never
    await setZone(page, 20);
    const at20 = await firstPass(page, 3);
    await page.waitForTimeout(200);
    await setZone(page, 0);
    const at0 = await firstPass(page, 2);
    await page.waitForTimeout(200);
    await setZone(page, 10);
    await page.evaluate(() => window.__dfDemo.go(4));
    await page.waitForFunction(() => !window.__dfDemo.janim && window.__dfDemo.index === 4, null, { polling: 'raf', timeout: 3000 }).catch(() => {});
    check(at20 !== null && at20 > 0.15 && at20 <= 0.2 && at0 === null && (await page.textContent('#passZoneOut')) === '10%', 'threshold slider: 20% starts at ' + (at20 && at20.toFixed(3)) + ' from the end, 0% never (' + at0 + ')');

    const diag = await page.textContent('#diag');
    check(/JS 手势/.test(diag), 'diag names the paging engine');
    // back to native: deck scroll position restored, timelines available again
    await page.click('[data-paging="native"]');
    await page.waitForTimeout(300);
    t = await st(page);
    const left = await page.evaluate(() => document.querySelector('[data-df-deck]').scrollLeft);
    check(t.paging === 'native' && t.mode === (engine === 'webkit' && !(await page.evaluate(() => window.__dfDemo.tl)) ? 'js' : 'timeline') && left === 390 * 4 && t.pe === 'aaaaaaaaaaa', 'native again: deck at page 5, "CSS 跟手" restored, inline styles cleared (' + t.pe + ')');
    // native passthrough: at the end of a back turn only the destination takes touches.
    // (Headless WebKit runs a smooth scroll in 3-4 big steps, so there it only switches on at the very end.)
    await page.evaluate(() => {
      const c = window.__dfDemo;
      const sp = c.setPassing.bind(c);
      window.__passLog = [];
      c.setPassing = (d) => {
        const r = sp(d);
        if (d >= 0) window.__passLog.push({ d: d, p: c.p, pe: Array.from(document.querySelectorAll('[data-df-page]')).map((el) => getComputedStyle(el).pointerEvents[0]).join('') });
        return r;
      };
    });
    await page.evaluate(() => window.__dfDemo.go(3));
    await page.waitForTimeout(1200);
    const log = await page.evaluate(() => window.__passLog);
    const on = log.find((x) => x.d === 3);
    check(!!on && on.pe[3] === 'a' && on.pe[4] === 'n' && (engine === 'webkit' || on.p > 3), 'native, end of the turn: destination auto, leaving page none (' + JSON.stringify(on) + ')');
    t = await st(page);
    check(!t.deckPassing && t.index === 3 && t.pe === 'aaaaaaaaaaa', 'cleared after the snap');
    check(errors.length === 0, 'no page errors (desktop): ' + errors.join(' | '));
    await ctx.close();
  }

  // ---- phone, touch (Chrome only) ----
  if (engine === 'chromium') {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const cdp = await ctx.newCDPSession(page);
    const box = await page.locator('#device').boundingBox();
    const s = box.width / 390;
    const at = (x, y) => ({ x: box.x + x * s, y: box.y + y * s });
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y }] });
    async function swipe(x, y, dx, dy, steps, ms) {
      await touch('touchStart', at(x, y));
      for (let i = 1; i <= steps; i++) { await touch('touchMove', at(x + (dx * i) / steps, y + (dy * i) / steps)); await page.waitForTimeout(ms); }
      await touch('touchEnd');
    }
    await page.click('[data-paging="js"]');
    await page.waitForTimeout(200);
    await swipe(300, 430, -240, 0, 12, 16);
    await page.waitForTimeout(900);
    check(await counter(page) === '02/11', 'JS touch swipe turns to page 2 (' + (await counter(page)) + ')');
    await swipe(300, 430, -240, 0, 10, 10);
    await page.waitForTimeout(250);
    await swipe(300, 430, -240, 0, 10, 10);
    await page.waitForTimeout(900);
    check(await counter(page) === '04/11', 'two fast JS swipes in a row (' + (await counter(page)) + ')');
    await swipe(200, 600, 0, -380, 12, 16);
    await page.waitForTimeout(500);
    check((await scrollTopOf(page, 3)) > 150 && (await counter(page)) === '04/11', 'vertical touch scrolls the page, not the deck');

    // passthrough: at the end of a back turn the destination can be scrolled at once
    await page.evaluate(() => { document.querySelectorAll('[data-df-page]')[2].scrollTop = 0; window.__dfDemo.go(2); });
    await waitTail(page);
    const hit = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); const pg = el && el.closest('[data-df-page]'); return pg ? Array.from(document.querySelectorAll('[data-df-page]')).indexOf(pg) : -1; }, at(375, 500));
    await touch('touchStart', at(200, 640));
    for (let i = 1; i <= 12; i++) { await touch('touchMove', at(200, 640 - i * 30)); await page.waitForTimeout(16); }
    let t = await st(page);
    const scrolled = await scrollTopOf(page, 2);
    await touch('touchEnd');
    check(hit === 2, 'right-edge sliver of the leaving page passes touches to the destination (hit page ' + (hit + 1) + ')');
    check(scrolled > 150 && !t.anim && t.index === 2, 'touch at the end of the turn: destination scrolls at once (' + scrolled + 'px), turn finished behind it');
    await page.waitForTimeout(500);
    // off: the same touch catches the turn, nothing scrolls until it has finished
    await page.click('[data-pass="off"]');
    await page.evaluate(() => { document.querySelectorAll('[data-df-page]')[1].scrollTop = 0; window.__dfDemo.go(1); });
    await waitTail(page);
    await touch('touchStart', at(200, 640));
    for (let i = 1; i <= 12; i++) { await touch('touchMove', at(200, 640 - i * 30)); await page.waitForTimeout(16); }
    const scrolledOff = await scrollTopOf(page, 1);
    await touch('touchEnd');
    await page.waitForTimeout(900);
    check(scrolledOff === 0 && (await st(page)).index === 1, 'passthrough off: the touch is caught by the turn (' + scrolledOff + 'px scrolled)');
    await page.click('[data-pass="back"]');

    // native: a touch in the zone that halts the snap gets the turn finished behind the finger
    await page.click('[data-paging="native"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.style.scrollSnapType = 'none'; d.scrollLeft = 390 * 0.06; });
    await page.waitForTimeout(100);
    t = await st(page);
    const passingBefore = t.deckPassing && t.passDest === 0;
    await touch('touchStart', at(200, 500));
    await page.waitForTimeout(800);
    const left = await page.evaluate(() => document.querySelector('[data-df-deck]').scrollLeft);
    await touch('touchEnd');
    await page.evaluate(() => { document.querySelector('[data-df-deck]').style.scrollSnapType = ''; });
    await page.waitForTimeout(600);
    check(passingBefore && left === 0 && (await page.evaluate(() => window.__dfDemo.passFinished)) === 1, 'native: halted snap in the zone is finished while the finger is down (deck at ' + left + ')');
    check((await counter(page)) === '01/11' && !(await st(page)).deckPassing, 'settled on page 1, passthrough cleared');
    check(errors.length === 0, 'no page errors (phone): ' + errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(failures.length ? failures.length + ' failed' : 'all passed');
  process.exit(failures.length ? 1 : 0);
})();
