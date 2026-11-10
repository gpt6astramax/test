// Checks the blur-mode switch in the standalone build: each mode reaches the resting residue its own way.
// Usage: node tools/modes.js index.html out-dir   (env PLAYWRIGHT / CHROME as in shoot.js)
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const engine = process.env.BROWSER || 'chromium';   // chromium | webkit
(async () => {
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(process.argv[2]));
  await page.waitForTimeout(400);
  let fails = 0;
  const box = await page.locator('#device').boundingBox();
  const state = () => page.evaluate(() => {
    const p = document.querySelectorAll('[data-df-page]')[0];
    const g = document.querySelectorAll('[data-df-glass]')[0];
    const cs = getComputedStyle(p);
    return { cls: p.className, anim: cs.animationName, filter: cs.filter, opacity: +cs.opacity, willChange: cs.willChange, glass: getComputedStyle(g).display, bd: g.style.backdropFilter || '' };
  });
  for (const mode of ['timeline', 'transition', 'js', 'nolayer', 'backdrop']) {
    await page.click('[data-mode="' + mode + '"]');
    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.scrollTo({ left: 0 }); });
    await page.waitForTimeout(600);
    await page.mouse.move(box.x + 195, box.y + 400);
    // Playwright's WebKit turns one page per wheel event; Chrome needs a short trackpad-like burst
    for (let i = 0; i < (engine === 'webkit' ? 1 : 5); i++) { await page.mouse.wheel(70, 0); await page.waitForTimeout(8); }
    await page.waitForTimeout(1000);
    const s = await state();
    const ok = mode === 'timeline' ? s.anim === 'df-sink' && /blur\(40px\)/.test(s.filter)
      : mode === 'transition' ? s.anim === 'none' && s.cls.includes('is-sunk') && /blur\(40px\)/.test(s.filter)
      : mode === 'js' ? s.anim === 'none' && /blur\(40px\)/.test(s.filter) && s.willChange !== 'auto'
      : mode === 'nolayer' ? s.anim === 'none' && /blur\(40px\)/.test(s.filter) && s.willChange === 'auto'
      : s.anim === 'none' && s.filter === 'none' && s.glass === 'block' && /blur\(40px\)/.test(s.bd);
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FAIL ') + mode, JSON.stringify(s));
    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.style.scrollSnapType = 'none'; d.scrollLeft = 390 * 0.55; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: process.argv[3] + '/mode-' + mode + '.png' });
    await page.evaluate(() => { const d = document.querySelector('[data-df-deck]'); d.style.scrollSnapType = ''; });
  }
  await page.click('#auto');
  await page.waitForTimeout(2300);
  const fps = await page.textContent('#fps');
  const idx = await page.evaluate(() => document.querySelector('[data-df-thumb]').parentElement.previousElementSibling.textContent.replace(/\s+/g, ''));
  console.log('auto paging ->', idx, '| meter:', fps);
  if (idx === '01/11' || !/fps/.test(fps)) fails++;
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
