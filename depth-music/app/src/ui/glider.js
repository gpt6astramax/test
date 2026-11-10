// The glider behind the tab row and the segmented control: one implementation, so both feel the same.
//
// The ink is moved by a spring, never set in place, so it cannot jump: a tap pulls it towards the finger and the
// release lets it swing to the item; press and drag and it trails the finger, picking whatever item it passes.
//   dot: true   the ink is a dot that is pulled into a flat ellipse while held and stretches along its path with its
//               speed (--sx / --sy on the ink element)
//   otherwise   the ink is a pill that only squashes a little
//
// The bar takes the touches itself (its items take none). Make it a <label> around a hidden switch and a tap on it
// plays the iPhone's tick; Android ticks through the vibration API on every item passed.
import { buzz, payBuzz, reduced, clamp } from './platform';

export function attachGlider(bar, opt) {
  const items = Array.from(bar.querySelectorAll('[data-gl-item]'));
  const ink = bar.querySelector('[data-gl-ink]');
  const n = items.length;
  const inset = opt.inset == null ? 3 : opt.inset;
  const dot = !!opt.dot;
  let index = opt.index || 0, seg = 0, held = false, pid = null, startIndex = 0;
  let x = 0, v = 0, target = 0, hold = 0, raf = 0, last = 0;       // position, speed, where it is heading, how "held" it looks

  const measure = () => { seg = (bar.clientWidth - inset * 2) / n; ink.style.width = seg + 'px'; };
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
    const dt = Math.min(0.032, (now - last) / 1000) || 0.016;
    last = now;
    const k = held ? 520 : 300, c = held ? 38 : 22;                // held: close behind the finger; let go: a springy return
    for (let i = 0; i < 4; i++) { v += (k * (target - x) - c * v) * dt / 4; x += v * dt / 4; }
    hold += ((held ? 1 : 0) - hold) * Math.min(1, dt * 14);
    if (!held && Math.abs(target - x) < 0.05 && Math.abs(v) < 2 && hold < 0.01) { x = target; v = 0; hold = 0; raf = 0; }
    else raf = requestAnimationFrame(tick);
    draw();
  }
  function to(t, jump) {
    target = t;
    if (jump || reduced()) { cancelAnimationFrame(raf); raf = 0; x = t; v = 0; hold = held ? 1 : 0; draw(); }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  const mark = () => items.forEach((el, i) => { el.toggleAttribute('data-on', i === index); el.setAttribute('aria-selected', String(i === index)); });
  function at(e) {
    const px = e.clientX - bar.getBoundingClientRect().left;
    return { pos: clamp(px - inset - seg / 2, 0, (n - 1) * seg), i: clamp(Math.floor((px - inset) / seg), 0, n - 1) };
  }
  function choose(i) { if (i === index) return; index = i; mark(); buzz(); opt.onSelect && opt.onSelect(i); }

  function down(e) {
    if (e.button || held) return;
    measure(); held = true; pid = e.pointerId; startIndex = index;
    // a touch stays with the bar it went down on; only the mouse needs capturing, to keep a drag that leaves the bar
    if (e.pointerType === 'mouse') { try { bar.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } }
    const a = at(e); to(a.pos); choose(a.i);
  }
  function move(e) { if (!held || e.pointerId !== pid) return; const a = at(e); to(a.pos); choose(a.i); }
  function end(e) {
    if (!held || e.pointerId !== pid) return;
    held = false;
    const same = e.type === 'pointerup' && index === startIndex && at(e).i === index;
    to(index * seg);
    payBuzz();
    if (same && opt.onReselect) opt.onReselect(index);
  }
  function key(e) {
    const i = items.indexOf(e.target);
    if (i === -1 || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (i === index) { if (opt.onReselect) opt.onReselect(i); } else { measure(); choose(i); to(index * seg); }
  }
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
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      bar.removeEventListener('pointerdown', down);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      bar.removeEventListener('keydown', key);
    },
  };
}
