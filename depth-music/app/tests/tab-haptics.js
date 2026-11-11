// iPhone haptics on the tab row, checked against a model of WebKit's switch (Chromium has no switch haptics):
//   - a tap ticks once, also the tap that switches tabs (it used to stay silent: WebKit takes a tap that shows new
//     content as a hover, and the label's click never came)
//   - a drag ticks once for every tab it passes, from WebKit's 200 ms "held" delay on; the tabs chosen before then
//     (the one landed on included) owe one tick together, given as soon as the switch follows the finger
// The model follows WebKit's CheckboxInputType (Source/WebCore/html/CheckboxInputType.cpp): a touch on the switch
// starts tracking 200 ms after it lands; each move after that flips the switch (and ticks) when the finger crosses the
// switch's middle in its own coordinates (the first time: 40% of its width past where it started, when the finger
// started near the far end); the lift clicks it (ticks for a tap; not again for a drag that already flipped it).
// Moves the page cancels are not seen by the switch (default handling).
//
//   npm run build && node tests/tab-haptics.js        (needs Playwright with Chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.ROOT || path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WEBKIT_SWITCH = () => {
  // an iPhone without the vibration API, whose inputs know the switch attribute
  Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true });
  if (!('switch' in HTMLInputElement.prototype)) Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false, configurable: true });
  window.__ticks = [];
  let tr = null;                                                    // { id, x0, start, on, changed, sw, timer, t0 }
  const local = (sw, x) => x - sw.getBoundingClientRect().left;     // translations only, as the glider uses
  document.addEventListener('touchstart', (e) => {
    const sw = e.target;
    if (!(sw instanceof HTMLInputElement) || !sw.hasAttribute('switch') || e.targetTouches.length !== 1) return;
    const t = e.targetTouches[0];
    tr = { id: t.identifier, x0: t.clientX, sw, start: null, on: sw.checked, changed: false, t0: performance.now() };
    window.__down = Math.round(performance.now() - (window.__t0 || 0));
    const mine = tr;
    // WebKit starts its timer in the default handling, after every listener: here, a listener added after the page's
    // (window, bubbling: the last to run)
    mine.arm = () => { mine.timer = setTimeout(() => { if (tr === mine) { tr.start = local(sw, mine.x0); tr.on = sw.checked; } }, 200); };
  }, true);
  window.addEventListener('touchstart', () => { if (tr && !tr.timer) tr.arm(); });
  window.addEventListener('touchmove', (e) => {                      // default handling: after every listener
    if (!tr || tr.start === null || e.defaultPrevented) return;
    const t = [...e.touches].find((x) => x.identifier === tr.id);
    if (!t) return;
    const w = tr.sw.getBoundingClientRect().width, h = tr.sw.getBoundingClientRect().height;
    const thumbLeft = !tr.on;
    let change = w / 2;
    if (!tr.changed) {
      if (thumbLeft && tr.start > w - h) change = tr.start + w * 0.4;
      else if (!thumbLeft && tr.start < w - h) change = tr.start - w * 0.4;
    }
    const leftNow = local(tr.sw, t.clientX) < change;
    if (leftNow !== thumbLeft) { tr.changed = true; tr.on = !tr.on; __ticks.push({ t: Math.round(performance.now() - (window.__t0 || 0)), why: 'drag' }); }
  });
  document.addEventListener('touchend', (e) => {
    if (!tr || [...e.touches].some((x) => x.identifier === tr.id)) return;
    clearTimeout(tr.timer);
    const checked = tr.sw.checked;
    const tracking = tr.start !== null;
    if (!(tracking && tr.changed && tr.on === checked) && !(tracking && tr.changed && tr.on === !checked)) __ticks.push({ t: Math.round(performance.now() - (window.__t0 || 0)), why: 'click' });
    tr = null;
  }, true);
};

(async () => {
  const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/depth-music/, '/public'); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
  const browser = await chromium.launch();
  let failed = 0;
  const ok = (name, cond, extra) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra === undefined ? '' : '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`); };
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(WEBKIT_SWITCH);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/depth-music/`); await sleep(1300);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const geo = await page.evaluate(() => {
    const bar = document.querySelector('.sgm-tabs'), r = bar.getBoundingClientRect(), n = bar.querySelectorAll('.sgm-tabs .sgm-item').length;
    return { y: r.top + r.height / 2, xs: [...Array(n)].map((_, i) => r.left + r.width * (i + 0.5) / n), sw: !!bar.querySelector('input[switch]'), n };
  });
  ok('the row has its switch (an iPhone without the vibration API)', geo.sw);
  // tab changes as the row shows them, timed from the touch
  await page.evaluate(() => {
    window.__tabs = [];
    new MutationObserver(() => { const on = [...document.querySelectorAll('.sgm-tabs .sgm-item')].findIndex((e) => e.hasAttribute('data-on')); const l = __tabs[__tabs.length - 1]; if (!l || l.i !== on) __tabs.push({ i: on, t: Math.round(performance.now() - (window.__t0 || 0)) }); })
      .observe(document.querySelector('.sgm-tabs'), { attributes: true, subtree: true, attributeFilter: ['data-on'] });
  });
  const reset = () => page.evaluate(() => { __ticks = []; __tabs = []; window.__t0 = performance.now(); });

  // 1. taps: on another tab, and on the tab already showing
  for (const [i, what] of [[1, 'another tab'], [1, 'the tab already showing'], [3, 'another tab']]) {
    await reset();
    await touch('touchStart', geo.xs[i], geo.y); await sleep(60); await touch('touchEnd'); await sleep(500);
    const ticks = await page.evaluate(() => __ticks);
    ok(`a tap on ${what} ticks once`, ticks.length === 1 && ticks[0].why === 'click', ticks);
  }

  // 2. a drag: hold, then along the row and back
  const drag = async (holdMs, path, stepMs) => {
    await reset();
    await touch('touchStart', path[0], geo.y); await sleep(holdMs);
    for (let k = 1; k < path.length; k++) { await touch('touchMove', path[k], geo.y + (k % 2)); await sleep(stepMs); }
    await touch('touchEnd'); await sleep(400);
    return page.evaluate(() => ({ ticks: __ticks, tabs: __tabs, down: window.__down || 0 }));
  };
  // tabs chosen before the switch follows the finger (205 ms after the touch landed: the glider's timer), landing
  // included, owe one tick together; every tab after that ticks
  const since = (r, tb) => tb.t - r.down;
  const expected = (r) => r.tabs.filter((tb) => since(r, tb) > 205).length + (r.tabs.some((tb) => since(r, tb) <= 205) ? 1 : 0);
  const along = (from, to, steps) => [...Array(steps + 1)].map((_, k) => from + (to - from) * k / steps);
  const x0 = geo.xs[0], xN = geo.xs[geo.n - 1];
  let r = await drag(300, [...along(x0, xN, 40), ...along(xN, x0, 40).slice(1)], 16);
  let passed = r.tabs.filter((tb) => since(r, tb) > 205).length;
  let drags = r.ticks.filter((t) => t.why === 'drag');
  ok(`held, then dragged along the row and back: one tick for each of the ${passed} tabs passed (and one for the tab landed on, if it changed)`, passed === 2 * (geo.n - 1) && drags.length === expected(r) && r.ticks.length === expected(r), { ticks: r.ticks.map((t) => t.t + ' ' + t.why), tabs: r.tabs.map((t) => t.t + ' ' + t.i) });
  const lag = r.tabs.filter((tb) => since(r, tb) > 205).map((tb) => { const k = r.ticks.find((t) => t.t >= tb.t - 5); return k ? k.t - tb.t : null; });
  ok('each tick comes with its tab (within the next move)', lag.every((l) => l !== null && l <= 40), lag);

  // fast: from the first tab to the last in ~0.15 s, right away: the tabs passed before 200 ms cannot tick
  r = await drag(0, along(x0, xN, 10), 16);
  drags = r.ticks.filter((t) => t.why === 'drag');
  ok('dragged at once, fast: no tick before WebKit lets the switch follow (200 ms); then one owed for the tabs chosen before, and one for each after', r.ticks.length === expected(r) && drags.every((t) => t.t - r.down > 200), { down: r.down, ticks: r.ticks, tabs: r.tabs });

  // to the neighbour at once (in ~100 ms, before WebKit lets the switch follow), then the finger rests there, moving
  // a little: the tick is owed, and comes as soon as the switch follows the finger
  r = await drag(0, [...along(geo.xs[0], geo.xs[1], 2), ...Array(16).fill(0).map((_, k) => geo.xs[1] + (k % 3))], 16);
  ok('to the neighbour at once, then resting there: one tick, as soon as WebKit lets the switch follow, none at the lift',
    r.tabs.length === 2 && r.tabs[1].t - r.down < 200 && r.ticks.length === 1 && r.ticks[0].why === 'drag' && r.ticks[0].t - r.down > 200, { ticks: r.ticks, tabs: r.tabs });

  // slow, starting at once: ticks for every tab passed after 200 ms
  r = await drag(0, along(x0, xN, 60), 16);
  const after = r.tabs.filter((tb) => since(r, tb) > 205).length;
  ok(`dragged at once, slowly: a tick for each of the ${after} tabs passed after 200 ms (and the owed one)`, r.ticks.length === expected(r) && r.ticks.every((t) => t.why === 'drag'), { ticks: r.ticks.map((t) => t.t), tabs: r.tabs.map((t) => t.t + ' ' + t.i) });

  // landed on another tab, held, then dragged one tab on: two ticks, the landing's as the drag starts
  await reset(); await touch('touchStart', geo.xs[2], geo.y); await touch('touchEnd'); await sleep(500);   // tab 2 chosen
  r = await drag(300, [geo.xs[0], ...along(geo.xs[0], geo.xs[1], 20)], 16);
  ok('landed on another tab, held, then dragged to the next: a tick for each, both while dragging',
    r.ticks.length === 2 && r.ticks.every((t) => t.why === 'drag'), { ticks: r.ticks, tabs: r.tabs });

  // held without moving: the lift ticks (a tap held long)
  r = await drag(500, [geo.xs[2]], 16);
  ok('held still, then lifted: one tick', r.ticks.length === 1, r.ticks);

  // a busy page: every tab change keeps the main thread 260 ms (a heavy page drawn), so WebKit's 200 ms comes late
  await page.evaluate(() => { window.__busy = new MutationObserver(() => { const t = performance.now(); while (performance.now() - t < 260); });
    __busy.observe(document.querySelector('.sgm-tabs'), { attributes: true, subtree: true, attributeFilter: ['data-on'] }); });
  r = await drag(0, [...along(geo.xs[1], geo.xs[2], 6), ...Array(12).fill(geo.xs[2]), ...along(geo.xs[2], geo.xs[4], 30)], 16);
  ok(`a busy page (each tab drawn in 260 ms): the tabs reached early owe a tick, then each tab after: ${expected(r)} ticks while dragging`,
    r.ticks.filter((t) => t.why === 'drag').length === expected(r) && r.ticks.length === expected(r), { ticks: r.ticks, tabs: r.tabs });
  await page.evaluate(() => __busy.disconnect());

  // the switch is back over the row, and the row still works by mouse/keyboard-free taps afterwards
  const back = await page.evaluate(() => document.querySelector('.sgm-tabs input[switch]').style.transform);
  ok('the switch is back over the row after a touch', back === '' || back === 'none', back);
  if (errs.length) { failed++; console.log('page errors', errs); }
  await browser.close(); server.close();
  console.log(failed ? `${failed} FAILED` : 'all as expected');
  process.exit(failed ? 1 : 0);
})();
