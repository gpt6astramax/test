/*!
 * scroll-gesture.js
 * Swipe gestures built on native scrolling.
 *
 * The element becomes a snap scroller laid out as [ +pad | body | -pad ]. Dragging it is ordinary
 * native scrolling, so finger tracking, momentum and snapping come from the browser / OS.
 * Progress p runs from -range to +range (positive = content moved right / down) and is published twice:
 *   JS  : g.p, plus the 'change' event
 *   CSS : a registered custom property (default --p) on the element itself, driven by a scroll-driven animation
 * Near the end of a commit the element stops taking pointer input (pointer-events: none),
 * so the next touch reaches whatever lies underneath while the snap animation finishes.
 * Coming in is the one move that is not a scroll: g.enter() slides the content in with a script-driven animation,
 * so a finger landing meanwhile scrolls what it lands on and has no scroll of ours to cut short or drag along.
 */
(function (root) {
  'use strict';

  var supportsTimeline = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('animation-timeline: scroll()');
  var instances = new Set();
  var publishers = new Map();          // scope element -> Set of instances publishing a CSS variable on it
  var fingers = 0;
  var uid = 0;
  var styleEl = null;

  function setup() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-scroll-gesture', '');
    styleEl.textContent =
      // overscroll-behavior only on the gesture axis. On iOS a non-auto value on the other axis also stops the
      // parent from starting a scroll there, e.g. a vertical list could no longer be scrolled from a swipeable row.
      '.sg{display:flex;scrollbar-width:none}' +
      '.sg::-webkit-scrollbar{display:none}' +
      '.sg-x{flex-direction:row;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:none}' +
      '.sg-y{flex-direction:column;overflow-x:hidden;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:none}' +
      '.sg>.sg-pad,.sg>.sg-body{flex:0 0 100%;min-width:0;min-height:0;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:always}' +
      '.sg.sg-passing{pointer-events:none}' +
      // enter(): the surface itself takes no touches (so what lies beside the moving content can be touched), the
      // content does; and the surface cannot be scrolled along its axis, by finger or wheel, so the gesture cannot
      // be started half-way in. (Hidden overflow keeps the scroll position and the timeline.)
      '.sg.sg-entering{pointer-events:none}' +
      '.sg.sg-entering>.sg-body{pointer-events:auto}' +
      '.sg-x.sg-entering{overflow-x:hidden}' +
      '.sg-y.sg-entering{overflow-y:hidden}';
    document.head.appendChild(styleEl);
    // One passive finger counter for all instances; passive listeners never delay scrolling.
    var onTouch = function (e) {
      fingers = e.touches.length;
      if (!fingers) instances.forEach(function (g) { g._touchEnded(); });
      else if (e.type === 'touchstart') instances.forEach(function (g) { g._touchStarted(); });
    };
    ['touchstart', 'touchend', 'touchcancel'].forEach(function (t) {
      document.addEventListener(t, onTouch, { passive: true });
    });
  }

  function registerVar(name) {
    if (typeof CSS === 'undefined' || !CSS.registerProperty) return;
    try { CSS.registerProperty({ name: name, syntax: '<number>', inherits: true, initialValue: '0' }); }
    catch (e) { /* already registered */ }
  }

  // Rebuild the animation list that drives the CSS variables on one scope element.
  function refreshPublishers(scope) {
    var list = Array.from(publishers.get(scope) || []);
    scope.style.setProperty('animation', list.map(function (g) { return g._kf + ' linear both'; }).join(', '));
    scope.style.setProperty('animation-timeline', list.map(function (g) { return g._tl; }).join(', '));
  }

  // Every instance's scroll timeline is made visible to the whole page through timeline-scope on <html>.
  // Batched in a microtask, so creating many instances at once rewrites it only once.
  var scopeQueued = false;
  function refreshTimelineScope() {
    if (scopeQueued) return;
    scopeQueued = true;
    var run = function () {
      scopeQueued = false;
      var names = [];
      instances.forEach(function (g) { names.push(g._tl); });
      if (names.length) document.documentElement.style.setProperty('timeline-scope', names.join(', '));
      else document.documentElement.style.removeProperty('timeline-scope');
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run); else Promise.resolve().then(run);
  }

  function removeKeyframes(name) {
    var rules = styleEl.sheet.cssRules;
    for (var i = rules.length - 1; i >= 0; i--) if (rules[i].name === name) styleEl.sheet.deleteRule(i);
  }

  /**
   * @param {HTMLElement} el  The swipe surface. Give it a definite size; its children move into el.body.
   * @param {object} [opts]
   *   axis        'x' | 'y'                 default 'x'
   *   sides       [-1, 1] | [1] | [-1]      directions that can commit, default both
   *   range       number                    p runs from -range to +range, default 1
   *   cssVar      string | null             CSS variable name, default '--p'; null turns it off
   *   scope       HTMLElement               element the CSS variable is set on, default el: the moving content can use
   *                                         it. For followers outside el, pass their common ancestor (every scroll
   *                                         frame restyles all of scope, so keep it small), or leave the variable
   *                                         and bind their animation to g.timeline, which costs no restyle at all
   *   passthrough number 0..1              stop taking touches when this much of a commit is left, default 0.03; 0 = off
   *   body        HTMLElement               use this child of el as the moving content instead of wrapping el's children
   *                                         (needed when a framework such as React owns those children)
   *   overshoot   number >= 0               extra travel past one full size, default 0. 0.5 puts the commit point at 150%,
   *                                         so the slow end of the snap happens off-screen. p is still -1..1 (1 = commit point)
   */
  function ScrollGesture(el, opts) {
    opts = opts || {};
    setup();
    var X = opts.axis !== 'y';
    var sides = opts.sides || [-1, 1];
    var hasPos = sides.indexOf(1) !== -1;
    var hasNeg = sides.indexOf(-1) !== -1;
    if (!hasPos && !hasNeg) throw new Error('scroll-gesture: sides must contain 1 and/or -1');
    var range = opts.range == null ? 1 : +opts.range;
    var cssVar = opts.cssVar === undefined ? '--p' : opts.cssVar;
    var scope = opts.scope || el;
    var zone = opts.passthrough == null ? 0.03 : Math.max(0, Math.min(0.5, +opts.passthrough));
    var over = Math.max(0, +opts.overshoot || 0);
    var id = ++uid;
    var tl = '--sg-timeline-' + id;
    var kf = 'sg-progress-' + id;
    var posProp = X ? 'scrollLeft' : 'scrollTop';
    var extentProp = X ? 'scrollWidth' : 'scrollHeight';

    // ---- structure: [ +pad | body | -pad ] ----
    var ownBody = !opts.body;
    var body = opts.body || document.createElement('div');
    body.classList.add('sg-body');
    if (ownBody) while (el.firstChild) body.appendChild(el.firstChild);
    var pad = function (side) {
      var d = document.createElement('div'); d.className = 'sg-pad'; d.setAttribute('data-side', String(side));
      if (over) d.style.flexBasis = (100 * (1 + over)) + '%';
      return d;
    };
    var padPos = hasPos ? pad(1) : null;
    var padNeg = hasNeg ? pad(-1) : null;
    if (ownBody) el.appendChild(body);
    if (padPos) el.insertBefore(padPos, body);
    if (padNeg) el.insertBefore(padNeg, body.nextSibling);
    el.classList.add('sg', X ? 'sg-x' : 'sg-y');

    var size = function () { return X ? el.clientWidth : el.clientHeight; };
    var pads = (hasPos ? 1 : 0) + (hasNeg ? 1 : 0);
    // Travel from rest to a commit point. clientWidth / clientHeight are whole pixels; with a fractional size the
    // travel computed from them is off by up to half a pixel per pad (times 1 + overshoot), enough to put a commit
    // point past where the element can scroll, so it would never count as reached. When the real scroll range is
    // within that rounding distance, it is used instead. (Further off means the content overflows; then it is not.)
    var span = function () {
      var s = size() * (1 + over);
      var real = (el[extentProp] - size()) / pads;
      return s && Math.abs(real - s) <= (1 + over) / 2 + 1 ? real : s;
    };
    var posOf = function (side) { return (hasPos ? span() : 0) - side * span(); };  // +1 -> 0, 0 -> one span, -1 -> two spans
    var raw = function () {
      var s = span();
      if (!s) return 0;
      var d = (hasPos ? s : 0) - el[posProp];                // px from the resting position, positive towards +1
      var p = Math.max(-1, Math.min(1, d / s));
      var near = Math.round(p);
      return Math.abs(d - near * s) <= 1 ? near : p;         // within a pixel of a side is on it, as in settle()
    };
    var sideAllowed = function (side) { return side === 0 || (side > 0 ? hasPos : hasNeg); };

    // ---- state ----
    var rest = 0, armed = false, passing = false, moved = false, jumping = false, idleT = 0, lastSize = 0;
    // The side a go() is heading for. Another scroll can cut a smooth scroll short (the browser revealing an element
    // that took focus, for one), even before it has moved at all; the move then carries on instead of stopping or
    // snapping back. A finger touching down drops it: the user has taken over.
    var goal = null, goalT = 0, resumes = 0;
    var dropGoal = function () { goal = null; clearTimeout(goalT); };
    var listeners = { change: new Set(), settle: new Set() };
    var emit = function (type, v) { listeners[type].forEach(function (fn) { fn(v); }); };
    var setPassing = function (on) { passing = on; el.classList.toggle('sg-passing', on); };
    var writeFallback = function (p) { if (cssVar && !supportsTimeline) scope.style.setProperty(cssVar, String(p * range)); };

    // ---- enter(): the content comes in by animation, not by scrolling ----
    var entering = null;                                     // { anim, timer, resolve } while an entrance runs
    function endEnter(arrived) {
      if (!entering) return;
      var e = entering;
      entering = null;
      clearTimeout(e.timer);
      if (e.anim) e.anim.cancel();                           // the surface is at rest without it
      el.classList.remove('sg-entering');
      e.resolve(arrived);
    }
    function enter(side, o) {
      o = o || {};
      side = side < 0 ? -1 : 1;
      endEnter(false);
      var travel = o.travel == null ? 1 : Math.max(0, Math.min(1, +o.travel));
      var ms = o.duration == null ? 300 : Math.max(0, +o.duration);
      // In % of the surface's own size, so nothing has to be measured: 100% is one size, the commit point is
      // 1 + overshoot. The surface is what moves, not the body: the body is one of its snap areas, and moving a snap
      // area would have the surface snap after it.
      var from = side * travel * (1 + over) * 100;
      el.classList.add('sg-entering');
      return new Promise(function (resolve) {
        var e = entering = { anim: null, timer: 0, resolve: resolve };
        if (from && ms && el.animate) {
          e.anim = el.animate(
            [{ transform: (X ? 'translateX(' : 'translateY(') + from + '%)' }, { transform: 'none' }],
            { duration: ms, easing: o.easing || 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
          e.anim.onfinish = function () { if (entering === e) endEnter(true); };
        } else e.timer = setTimeout(function () { if (entering === e) endEnter(true); }, ms);
      });
    }

    function scrollTo(side, smooth) {
      var o = { behavior: smooth ? 'smooth' : 'auto' };
      o[X ? 'left' : 'top'] = posOf(side);
      el.scrollTo(o);
    }

    // While a go() is under way: if the surface stopped short of the goal, start the smooth scroll again (3 times at most).
    function watchGoal() {
      clearTimeout(goalT);
      var from = el[posProp];
      goalT = setTimeout(function () {
        if (goal === null) return;
        if (fingers) { dropGoal(); return; }
        var pos = el[posProp];
        if (Math.abs(pos - posOf(goal)) <= 1) return;        // arrived: settle() reports it
        if (Math.abs(pos - from) < 0.5) {                    // not moving
          if (resumes++ >= 3) { dropGoal(); return; }
          scrollTo(goal, true);
        }
        watchGoal();
      }, 120);
    }

    // Instant move to a side; it becomes the resting side without a 'settle' event.
    function jump(side) {
      clearTimeout(idleT);
      dropGoal();
      rest = side; armed = false; moved = false;
      setPassing(side !== 0 && zone > 0);
      var target = posOf(side);
      if (Math.abs(el[posProp] - target) >= 0.5) {
        jumping = true;
        var prev = el.style.scrollBehavior;
        el.style.scrollBehavior = 'auto';
        el[posProp] = target;
        el.style.scrollBehavior = prev;
      }
      writeFallback(raw());
      emit('change', raw() * range);
    }

    // Called when scrolling may have stopped. needSnap: only accept it when resting on a snap point.
    function settle(needSnap) {
      if (!moved) return;
      var p = raw();
      var side = goal !== null ? goal : Math.round(p);
      if (!sideAllowed(side)) side = 0;
      var dist = Math.abs(el[posProp] - posOf(side));
      if (needSnap && dist > 1) return;
      if (fingers && !passing) return;                      // still being dragged
      if (dist > 1) {                                       // came to rest between snap points: finish it
        if (!fingers) scrollTo(passing && goal === null ? (p > 0 ? 1 : -1) : side, true);
        return;
      }
      clearTimeout(idleT);
      dropGoal();
      moved = false; armed = false; rest = side;
      setPassing(side !== 0 && zone > 0);
      emit('settle', side);
    }
    function idle() { clearTimeout(idleT); idleT = setTimeout(function () { settle(false); }, 150); }

    function onScroll() {
      var p = raw();
      writeFallback(p);
      if (jumping) { jumping = false; return; }                                  // jump() already reported it
      moved = true;
      if (!armed && Math.abs(p - rest) > Math.max(zone, 0.01)) armed = true;     // left the resting side
      if (zone && armed && !passing && rest === 0) {
        var side = p > 0 ? 1 : -1;
        if (sideAllowed(side) && Math.abs(p) >= 1 - zone) setPassing(true);       // the last `zone` of a commit
      }
      emit('change', p * range);
      idle();
    }
    function onScrollEnd() { settle(true); }

    el.addEventListener('scroll', onScroll, { passive: true });
    if ('onscrollend' in window) el.addEventListener('scrollend', onScrollEnd);
    // Positioning happens here: the first callback (and the first one after being display:none) runs after layout
    // and before paint, so a new instance never shows its pad. Later size changes keep the resting side.
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () {
      var s = size();
      if (!s || s === lastSize) { lastSize = s; return; }
      var first = !lastSize;
      lastSize = s;
      if (first || (!armed && !fingers)) jump(rest);
    }) : null;

    var g = {
      el: el,
      body: body,
      /** Name of the scroll timeline (visible page-wide), for `animation-timeline` on your own elements. */
      timeline: tl,
      /** Current progress, -range .. +range. */
      get p() { return raw() * range; },
      /** Side the surface last came to rest on: -1, 0 or 1. */
      get rest() { return rest; },
      /** True while the surface lets touches through. */
      get passing() { return passing; },
      /** True while an entrance started with enter() is running. */
      get entering() { return !!entering; },
      /** on('change', p => …) on every scroll update; on('settle', side => …) when it comes to rest. Returns an unsubscribe function. */
      on: function (type, fn) {
        if (!listeners[type]) throw new Error('scroll-gesture: unknown event ' + type);
        listeners[type].add(fn);
        return function () { listeners[type].delete(fn); };
      },
      /** Move to a side (-1, 0, 1), animated unless { smooth: false }. Another scroll cutting it short does not stop
       *  it (it carries on); a finger touching down does (the user takes over). */
      go: function (side, o) {
        side = side > 0 ? 1 : side < 0 ? -1 : 0;
        if (!sideAllowed(side)) return;
        endEnter(false);
        if (o && o.smooth === false) { jump(side); return; }
        if (side === 0 && passing) setPassing(false);
        dropGoal();
        if (Math.abs(el[posProp] - posOf(side)) >= 0.5) { goal = side; resumes = 0; watchGoal(); }
        scrollTo(side, true);
      },
      /** Jump back to 0 instantly, e.g. after swapping the content of a committed surface. */
      reset: function () { endEnter(false); jump(0); },
      /**
       * Bring the content in from a side (1 or -1) without scrolling anything. go() is a scroll, and a scroll can be
       * stopped or dragged along by a finger; coming in needs no finger-following, so the surface is moved as a
       * whole by a script-driven animation (Web Animations: started from script, run by the compositor) from that
       * side's commit point to rest. Its scroll position never changes. Until it has arrived:
       *   - the content can be touched and scrolled across the gesture's axis, not along it;
       *   - the surface takes no touches of its own, so whatever shows beside the moving content is live too.
       * Options: duration (ms, default 300), easing (CSS easing), travel (share of the way from the commit point to
       * cover, default 1; 0 moves nothing and only holds the gesture back for that long).
       * Returns a promise: true once arrived, false if go(), reset() or destroy() cut it short. Nothing scrolls, so
       * p, the CSS variable and the timeline stay at rest meanwhile: animate followers on the same clock.
       */
      enter: enter,
      destroy: function () {
        clearTimeout(idleT);
        dropGoal();
        endEnter(false);
        instances.delete(g);
        if (supportsTimeline) refreshTimelineScope();
        if (ro) ro.disconnect();
        el.removeEventListener('scroll', onScroll);
        el.removeEventListener('scrollend', onScrollEnd);
        if (cssVar && supportsTimeline) {
          var set = publishers.get(scope);
          if (set) { set.delete(g); refreshPublishers(scope); if (!set.size) publishers.delete(scope); }
          removeKeyframes(kf);
        }
        if (ownBody) { while (body.firstChild) el.insertBefore(body.firstChild, body); body.remove(); }
        else body.classList.remove('sg-body');
        if (padPos) padPos.remove();
        if (padNeg) padNeg.remove();
        el.classList.remove('sg', 'sg-x', 'sg-y', 'sg-passing', 'sg-entering');
        el.style.removeProperty('scroll-timeline-name');
        el.style.removeProperty('scroll-timeline-axis');
      },
      _kf: kf,
      _tl: tl,
      _touchEnded: function () { if (moved) idle(); },
      _touchStarted: dropGoal
    };

    // ---- CSS variable ----
    el.style.setProperty('scroll-timeline-name', tl);
    el.style.setProperty('scroll-timeline-axis', X ? 'x' : 'y');
    if (cssVar) {
      registerVar(cssVar);
      if (supportsTimeline) {
        // timeline progress 0 = scrolled to the start (+pad), 1 = scrolled to the end
        styleEl.sheet.insertRule('@keyframes ' + kf + '{from{' + cssVar + ':' + (hasPos ? range : 0) + '}to{' + cssVar + ':' + (hasNeg ? -range : 0) + '}}', styleEl.sheet.cssRules.length);
        if (!publishers.has(scope)) publishers.set(scope, new Set());
        publishers.get(scope).add(g);
        refreshPublishers(scope);
      }
    }

    instances.add(g);
    if (supportsTimeline) refreshTimelineScope();
    if (ro) ro.observe(el);                                  // no layout read here: many instances can be created in one go
    else { lastSize = size(); jump(0); }
    return g;
  }

  root.ScrollGesture = ScrollGesture;
  if (typeof module === 'object' && module.exports) module.exports = ScrollGesture;
})(typeof window !== 'undefined' ? window : this);
