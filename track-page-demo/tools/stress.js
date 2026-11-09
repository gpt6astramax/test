// Stress test in each blur mode: the whole current page keeps changing blur for a few seconds.
// Prints frames per second and the longest frame, and saves a frame per mode.
// Usage: BROWSER=chromium|webkit node tools/stress.js index.html out-dir
const path = require('path');
const pw = require(process.env.PLAYWRIGHT || 'playwright');
const engine = process.env.BROWSER || 'chromium';
(async () => {
  const browser = await pw[engine].launch(engine === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(process.argv[2]));
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowRight');           // stand on page 2, so a residue sits behind
  await page.waitForTimeout(1200);
  for (const mode of ['timeline', 'js', 'nolayer', 'backdrop']) {
    await page.click('[data-mode="' + mode + '"]');
    await page.click('#stress');
    await page.waitForTimeout(1300);
    const shot = path.join(process.argv[3], engine + '-stress-' + mode + '.png');
    await page.screenshot({ path: shot });
    await page.waitForTimeout(2300);
    const fps = (await page.textContent('#fps')).trim();
    const diag = (await page.textContent('#diag')).trim();
    const blur = await page.evaluate(() => {
      const p = document.querySelectorAll('[data-df-page]')[1];
      const g = document.querySelectorAll('[data-df-glass]')[1];
      return 'page filter ' + getComputedStyle(p).filter + ' | glass ' + (g.style.backdropFilter || '-');
    });
    console.log(engine.padEnd(8), mode.padEnd(8), '|', fps, '|', diag, '|', blur);
    await page.click('#stress');
    await page.waitForTimeout(300);
  }
  console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors');
  await browser.close();
})();
