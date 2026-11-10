// Runs the built demo in headless Chrome: touch swipes, trackpad-style wheel, mouse drag, keys,
// far jumps, the resting "residue" of the previous page, and the JS fallback path. Saves key frames.
// Usage: node tools/shoot.js index.html out-dir
// Env: PLAYWRIGHT=path/to/playwright (default 'playwright'), CHROME=path/to/chrome (default: Playwright's Chromium)
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const engine = process.env.BROWSER || 'chromium';   // chromium | webkit
const file = 'file://' + path.resolve(process.argv[2]);
const out = process.argv[3];
const failures = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); };

async function open(browser, opts, forceJs) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (forceJs) await page.addInitScript(() => { window.__DF_FORCE_JS = true; });
  await page.goto(file);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
const counter = (page) => page.evaluate(() => document.querySelector('[data-df-thumb]').parentElement.previousElementSibling.textContent.replace(/\s+/g, ''));
const pageStyle = (page, i) => page.evaluate((i) => {
  const el = document.querySelectorAll('[data-df-page]')[i];
  const cs = getComputedStyle(el);
  return { opacity: +cs.opacity, filter: cs.filter, vis: cs.visibility, scrollTop: el.scrollTop };
}, i);
const deckLeft = (page) => page.evaluate(() => document.querySelector('[data-df-deck]').scrollLeft);

(async () => {
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});

  // ---- desktop, scroll timelines ----
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 1280, height: 920 } });
    const box = await page.locator('#device').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.45;
    check(await page.evaluate(() => getComputedStyle(document.querySelector('[data-df-page]')).animationName) === 'df-sink', 'scroll-driven sink animation active');
    await page.screenshot({ path: out + '/1-rest.png' });

    await page.mouse.move(cx, cy);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(70, 0); await page.waitForTimeout(8); }
    await page.waitForTimeout(1000);
    check(await counter(page) === '02/11', 'trackpad-style horizontal wheel snaps to page 2 (' + (await counter(page)) + ')');
    const g = await pageStyle(page, 0);
    check(Math.abs(g.opacity - 0.75) < 0.02 && /blur\(40px\)/.test(g.filter) && g.vis === 'visible', 'previous page rests as residue: opacity ' + g.opacity + ', ' + g.filter);
    await page.screenshot({ path: out + '/2-residue.png' });

    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.style.scrollSnapType = 'none'; d.scrollLeft = 390 * 1.5; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: out + '/3-mid.png' });
    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.style.scrollSnapType = ''; d.scrollTo({ left: 390, behavior: 'smooth' }); });
    await page.waitForTimeout(900);
    check(await counter(page) === '02/11', 'back on page 2 after the mid frame');

    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(40); }
    await page.waitForTimeout(1400);
    check(await counter(page) === '05/11', 'three quick → presses land on page 5 (' + (await counter(page)) + ')');
    check((await pageStyle(page, 2)).vis === 'hidden', 'pages two steps behind are hidden');

    await page.mouse.move(cx + 120, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + 120 - i * 18, cy); await page.waitForTimeout(12); }
    await page.mouse.up();
    await page.waitForTimeout(1000);
    check(await counter(page) === '06/11', 'mouse flick goes to page 6 (' + (await counter(page)) + ')');
    await page.mouse.move(cx - 60, cy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(cx - 60 + i * 10, cy); await page.waitForTimeout(40); }
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(900);
    check(await counter(page) === '06/11' && (await deckLeft(page)) === 390 * 5, 'short slow mouse drag snaps back');

    await page.mouse.move(cx, cy);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(500);
    check((await pageStyle(page, 5)).scrollTop > 200 && (await deckLeft(page)) === 390 * 5, 'vertical wheel scrolls inside the page only');

    await page.locator('[data-df-page]').nth(5).locator('.df-row').nth(3).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: out + '/4-jump-mid.png' });
    await page.waitForTimeout(1400);
    check(await counter(page) === '10/11', 'similar-track row jumps 4 ahead (' + (await counter(page)) + ')');

    await page.locator('[data-df-page]').nth(9).locator('button[aria-label^="Play"]').click();
    await page.waitForTimeout(1300);
    await page.locator('button[aria-label="Back"]').click();
    await page.waitForTimeout(900);
    await page.locator('button[aria-label^="Show"]').click();
    await page.waitForTimeout(1000);
    check(await counter(page) === '10/11' && (await pageStyle(page, 9)).scrollTop === 0, 'mini player returns to the playing track at the top');
    check(errors.length === 0, 'no page errors (desktop): ' + errors.join(' | '));
    await ctx.close();
  }

  // ---- phone, touch (needs Chrome's DevTools protocol) ----
  if (engine === 'chromium') {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const cdp = await ctx.newCDPSession(page);
    // real touch events through the browser's input pipeline
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: type === 'touchEnd' ? [] : [{ x: x, y: y }] });
    const swipe = async (x, y, dx, dy, steps, ms) => {
      await touch('touchStart', x, y);
      for (let i = 1; i <= steps; i++) { await touch('touchMove', x + (dx * i) / steps, y + (dy * i) / steps); await page.waitForTimeout(ms); }
      await touch('touchEnd');
    };
    // Synthetic touches here carry no fling inertia, so each drag goes past halfway; real phones add native flick momentum.
    await swipe(300, 430, -240, 0, 12, 16);
    await page.waitForTimeout(1000);
    check(await counter(page) === '02/11', 'touch swipe snaps to page 2 (' + (await counter(page)) + ')');
    await swipe(300, 430, -240, 0, 10, 10);
    await page.waitForTimeout(60);
    await swipe(300, 430, -240, 0, 10, 10);
    await page.waitForTimeout(1200);
    check(await counter(page) === '04/11', 'second swipe interrupts the running snap and continues to page 4 (' + (await counter(page)) + ')');
    await swipe(200, 560, 0, -380, 12, 16);
    await page.waitForTimeout(800);
    check((await pageStyle(page, 3)).scrollTop > 150 && (await counter(page)) === '04/11', 'vertical touch swipe scrolls the page, not the deck');
    await swipe(80, 430, 240, 0, 12, 16);
    await page.waitForTimeout(1100);
    check(await counter(page) === '03/11', 'swipe back to page 3 (' + (await counter(page)) + ')');
    await touch('touchStart', 300, 430);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', 300 - i * 11, 430); await page.waitForTimeout(16); }
    await page.waitForTimeout(150);
    await page.screenshot({ path: out + '/5-phone-held.png' });
    await touch('touchEnd');
    await page.waitForTimeout(1100);
    check(await counter(page) === '03/11', 'released before halfway: back to page 3 (' + (await counter(page)) + ')');
    await page.screenshot({ path: out + '/5-phone.png' });
    check(errors.length === 0, 'no page errors (phone): ' + errors.join(' | '));
    await ctx.close();
  }

  // ---- desktop, JS fallback (no scroll timelines) ----
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 1280, height: 920 } }, true);
    const box = await page.locator('#device').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(70, 0); await page.waitForTimeout(8); }
    await page.waitForTimeout(1000);
    const g = await pageStyle(page, 0);
    check(await counter(page) === '02/11' && Math.abs(g.opacity - 0.75) < 0.02 && /blur\(40px\)/.test(g.filter), 'JS fallback: page 2 with residue ' + g.opacity + ' ' + g.filter);
    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.style.scrollSnapType = 'none'; d.scrollLeft = 390 * 1.5; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: out + '/6-mid-js.png' });
    check(errors.length === 0, 'no page errors (fallback): ' + errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(failures.length ? failures.length + ' FAILED' : 'ALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
