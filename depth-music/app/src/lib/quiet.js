// Work that changes what is composited (removing a page that has left, taking a finished animation off a layer) waits
// here until nothing is being touched and nothing has scrolled for a moment.
//
// Why: such a change on an ancestor of a scroller that a finger is moving, or that is still coasting, can stop the
// scroll dead on iOS (no momentum, the rubber band snapping back at once). What is waited for is never visible: the
// page is already off screen and takes no touches, the animation already holds its end value.
const QUIET = 350;                 // ms without a touch or a scroll
let touches = 0, lastMove = 0, timer = 0;
let queue = [];

function run() {
  timer = 0;
  if (!queue.length) return;
  const wait = touches ? QUIET : QUIET - (performance.now() - lastMove);
  if (wait > 0) { timer = setTimeout(run, Math.max(40, wait)); return; }
  const jobs = queue;
  queue = [];
  jobs.forEach((j) => { if (!j.done) { j.done = true; j.fn(); } });
}
const poke = () => { if (!timer && queue.length) timer = setTimeout(run, QUIET); };

if (typeof document !== 'undefined') {
  // passive, capturing: they see every touch and every scroll and can hold nothing back
  const onTouch = (e) => { touches = e.touches.length; lastMove = performance.now(); };
  ['touchstart', 'touchend', 'touchcancel'].forEach((t) => document.addEventListener(t, onTouch, { passive: true, capture: true }));
  const onMove = () => { lastMove = performance.now(); };
  document.addEventListener('scroll', onMove, { passive: true, capture: true });
  document.addEventListener('wheel', onMove, { passive: true, capture: true });
}

/** Run fn once things are quiet. Returns { flush() : run it now if it has not run, cancel() : never run it }. */
export function whenQuiet(fn) {
  const job = { fn, done: false };
  queue.push(job);
  poke();
  return {
    flush() { if (!job.done) { job.done = true; fn(); } },
    cancel() { job.done = true; },
  };
}
