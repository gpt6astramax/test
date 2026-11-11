// The glider behind the tab row and the segmented control: one implementation, so both feel the same.
//
// The ink is moved by a spring, never set in place, so it cannot jump: a tap pulls it towards the finger and the
// release lets it swing to the item; press and drag and it trails the finger, picking whatever item it passes.
//   dot: true   the ink is a dot that is pulled into a flat ellipse while held and stretches along its path with its
//               speed (--sx / --sy on the ink element)
//   otherwise   the ink is a pill that only squashes a little
//
// The bar takes the touches itself (its items take none). Android ticks through the vibration API on every item
// passed. iPhone: put a native switch (<input type="checkbox" switch>) in the bar; the glider stretches it, invisible,
// over the whole bar, so every touch lands on the switch itself:
//   - a tap ticks: the switch toggles when the finger lifts, by a click of its own. (A click that has to come from the
//     tap itself never arrives when the tap shows another page: WebKit takes a tap that makes new content appear as
//     a hover, not a click. That was the tab row's silent first tap.)
//   - a drag ticks at every item passed: from 200 ms after touching down, WebKit lets the finger drag the switch, and
//     it ticks whenever the finger crosses the switch's middle, in the switch's own coordinates (transforms
//     included). So the glider keeps the switch off to one side of the finger, and moves it across to the other side
//     whenever the finger enters another item: the next move crosses the middle, and the phone ticks.
//     (WebKit: CheckboxInputType::handleTouchEvent, updateIsSwitchVisuallyOnFromAbsoluteLocation.)
import { buzz, payBuzz, reduced, clamp } from './platform';

// After a touch lands on the switch, WebKit starts letting it be dragged 200 ms later (its "held" timer, started in
// the touchstart's default handling). The glider starts a timer of its own in a touchstart listener, so just before
// WebKit's: 205 ms makes it come due just after, and timers run in the order they come due, however late a busy page
// makes them both. Only then does the glider move the switch across: moved across before WebKit follows, the switch
// would be taken to be on that side from the start, and the drag's ticks would be lost. An item reached before then
// is owed a tick, given as soon as the switch follows.
const SWITCH_HELD = 205;

export function attachGlider(bar, opt) {
  const items = Array.from(bar.querySelectorAll('[data-gl-item]'));
  const ink = bar.querySelector('[data-gl-ink]');
  const n = items.length;
  const inset = opt.inset == null ? 3 : opt.inset;
  const dot = !!opt.dot;
  let index = opt.index || 0, seg = 0, held = false, pid = null, startIndex = 0;
  let x = 0, v = 0, target = 0, hold = 0, raf = 0, last = 0;       // position, speed, where it is heading, how "held" it looks
  let ran = 0;                                                     // when the loop last ran a frame (performance.now())
  let freeSince = 0;                                               // when the finger let go (0: held, or at rest)

  const measure = () => { seg = (bar.clientWidth - inset * 2) / n; ink.style.width = seg + 'px'; };

  // ---- the iPhone's switch, over the whole bar (see the top of this file)
  const sw = bar.querySelector('input[switch]');
  if (sw) {
    Object.assign(sw.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', margin: '0', padding: '0',
      opacity: '0', zIndex: '3', pointerEvents: 'auto', cursor: 'inherit', transform: '' });
    sw.setAttribute('aria-hidden', 'true');
  }
  let swTouch = false, swOn = false, swFollows = false, swOwed = false, swTicks = 0, swTimer = 0;
  // Keep the switch off to the left of the finger ('on': the finger on its right side) or to the right ('off'), far
  // past any point where WebKit would flip it (its middle; at first, 40% of its width from where the finger started,
  // which can be anywhere the finger has been since).
  function keepSwitch(clientX) {
    const w = bar.clientWidth;
    const left = bar.getBoundingClientRect().left;                 // the switch's place with no transform
    const local = swOn ? 4 * w : -3 * w;
    sw.style.transform = `translateX(${(clientX - left - local).toFixed(1)}px)`;
    sw.getBoundingClientRect();                                     // in place before WebKit reads it, after this event
  }
  // the touch landed on the switch (a listener on it: runs before WebKit's default handling starts its timer)
  function switchDown(e) {
    if (e.targetTouches.length !== 1) return;
    swTouch = true; swOn = sw.checked; swFollows = false; swOwed = false; swTicks = 0;
    clearTimeout(swTimer);
    swTimer = setTimeout(() => {
      if (!swTouch) return;
      swFollows = true;
      if (swOwed) { swOwed = false; swTicks++; }                   // an item reached before: tick at the next move
    }, SWITCH_HELD);
  }
  // Each move can carry one tick: the switch sent across once, crossed by that move. Ticks due meanwhile wait for the
  // moves after it (sent across twice before a move, the switch would end up where it was, and tick for neither).
  function switchMove(e, changed) {
    if (!sw || !swTouch) return;
    if (changed) { if (swFollows) swTicks++; else swOwed = true; }
    if (swTicks) { swTicks--; swOn = !swOn; }
    keepSwitch(e.clientX);
  }
  function switchUp() {
    if (!sw || !swTouch) return;
    swTouch = false;
    clearTimeout(swTimer);
    // back over the bar once WebKit has had the finger's end (it clicks the switch then)
    setTimeout(() => { if (!swTouch) sw.style.transform = ''; }, 0);
  }
  function draw() {
    const speed = Math.abs(v);
    if (dot) {
      ink.style.setProperty('--sx', (1 + hold * 1.6 + Math.min(3.4, speed / 360)).toFixed(3));
      ink.style.setProperty('--sy', (1 - hold * 0.24 - Math.min(0.4, speed / 3400)).toFixed(3));
      ink.style.transform = `translateX(${x.toFixed(2)}px)`;
    } else {
      const sq = Math.min(0.1, speed / 9000);
      ink.style.transform = `translateX(${x.toFixed(2)}px) scale(${(1 + hold * 0.05 + sq).toFixed(3)},${(1 + hold * 0.05 - sq).toFixed(3)})`;
    }
  }
  function tick(now) {
    raf = 0;
    ran = performance.now();
    // a frame's time can come out earlier than the moment the loop was started (rAF stamps the frame's start): never a
    // step backwards, never more than two frames at once
    const dt = clamp((now - last) / 1000, 0.004, 0.032);
    last = now;
    const k = held ? 520 : 300, c = held ? 38 : 22;                // held: close behind the finger; let go: a springy return
    for (let i = 0; i < 4; i++) { v += (k * (target - x) - c * v) * dt / 4; x += v * dt / 4; }
    hold += ((held ? 1 : 0) - hold) * Math.min(1, dt * 14);
    // at rest; or let go well over a second ago and still not there (whatever slowed it): put it in place
    const late = !held && freeSince && ran - freeSince > 1200;
    if (!held && ((Math.abs(target - x) < 0.05 && Math.abs(v) < 2 && hold < 0.01) || late)) { x = target; v = 0; hold = 0; freeSince = 0; }
    else raf = requestAnimationFrame(tick);
    draw();
  }
  // Make sure the loop runs. A frame that was asked for can be skipped (the page hidden for a moment, an app
  // switch): a loop that waits for it would never run again, so a stale request is replaced.
  function run() {
    if (raf && performance.now() - ran < 100) return;
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function to(t, jump) {
    target = t;
    if (jump || reduced()) { cancelAnimationFrame(raf); raf = 0; x = t; v = 0; hold = held ? 1 : 0; freeSince = 0; draw(); }
    else run();
  }
  const mark = () => items.forEach((el, i) => { el.toggleAttribute('data-on', i === index); el.setAttribute('aria-selected', String(i === index)); });
  function at(e) {
    const px = e.clientX - bar.getBoundingClientRect().left;
    return { pos: clamp(px - inset - seg / 2, 0, (n - 1) * seg), i: clamp(Math.floor((px - inset) / seg), 0, n - 1) };
  }
  function choose(i) { if (i === index) return false; index = i; mark(); buzz(); opt.onSelect && opt.onSelect(i); return true; }

  function down(e) {
    if (e.button) return;
    // a new finger while one is still held: the end of the last one was never heard (it can go astray on iOS); it is
    // let go first, so the control is never stuck under a finger that has gone
    if (held) { if (e.pointerId === pid) return; release(); }
    measure(); held = true; pid = e.pointerId; startIndex = index; freeSince = 0;
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    // a touch stays with the bar it went down on; only the mouse needs capturing, to keep a drag that leaves the bar
    if (e.pointerType === 'mouse') { try { bar.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
    const a = at(e); to(a.pos); choose(a.i);
  }
  function move(e) {
    if (!held || e.pointerId !== pid) return;
    const a = at(e); to(a.pos);
    switchMove(e, choose(a.i));
  }
  // Let go: the pill springs back onto the chosen item.
  function release() {
    switchUp();
    held = false;
    freeSince = performance.now();
    document.removeEventListener('pointerup', end, true);
    document.removeEventListener('pointercancel', end, true);
    to(index * seg);
  }
  // The finger's end is heard on the document too, not only on the bar: wherever it lands, it is never missed.
  function end(e) {
    if (!held || e.pointerId !== pid) return;
    const same = e.type === 'pointerup' && index === startIndex && at(e).i === index;
    release();
    payBuzz();
    if (same && opt.onReselect) opt.onReselect(index);
  }
  // back from the background with the pill on its way: let it finish
  const onVisible = () => { if (document.visibilityState === 'visible' && (held || x !== target || hold)) run(); };
  document.addEventListener('visibilitychange', onVisible);
  function key(e) {
    const i = items.indexOf(e.target);
    if (i === -1 || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (i === index) { if (opt.onReselect) opt.onReselect(i); } else { measure(); choose(i); to(index * seg); }
  }
  if (sw) sw.addEventListener('touchstart', switchDown, { passive: true });
  bar.addEventListener('pointerdown', down);
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('keydown', key);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); if (!held) to(index * seg, true); }) : null;
  if (ro) ro.observe(bar); else { measure(); to(index * seg, true); }
  mark();

  return {
    get index() { return index; },
    /** Follow a choice made elsewhere. */
    set(i) { if (i === index || held) return; index = i; mark(); measure(); to(index * seg); },
    destroy() {
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      document.removeEventListener('visibilitychange', onVisible);
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (sw) { sw.removeEventListener('touchstart', switchDown, { passive: true }); clearTimeout(swTimer); }
      bar.removeEventListener('pointerdown', down);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      bar.removeEventListener('keydown', key);
    },
  };
}
