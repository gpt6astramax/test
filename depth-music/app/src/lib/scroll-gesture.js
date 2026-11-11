/*!
 * scroll-gesture.js
 * Swipe gestures with two interchangeable drivers behind one API.
 *
 *   driver: 'scroll' (default)
 *     The element becomes a snap scroller laid out as [ +pad | body | -pad ]. Dragging it is ordinary native
 *     scrolling, so finger tracking, momentum and snapping come from the browser / OS, off the main thread.
 *     Followers bind to its scroll timeline (g.timeline) and cost no script per frame. For the compositor to run
 *     them (so that they keep step with a finger whatever the main thread is doing), animate transform and opacity
 *     only: one blur() in the keyframes takes the whole animation to the main thread in Chromium.
 *   driver: 'js'
 *     Nothing scrolls. Touch and wheel input move the body with a transform; letting go hands it to a spring that
 *     carries the finger's speed. Every frame is script, and it can be caught in flight. Followers listen to 'change'
 *     (or read the CSS variable); there is no scroll timeline.
 *
 * Progress p runs from -range to +range (positive = content moved right / down) and is published twice:
 *   JS  : g.p, plus the 'change' event
 *   CSS : a registered custom property (default --p) on the scope element
 * Near the end of a commit the element stops taking pointer input (pointer-events: none), so the next touch reaches
 * whatever lies underneath while the move finishes.
 * Coming in is the one move that is not a gesture: g.enter() slides the surface in with a script-started animation.
 *
 * Nothing here listens to touches in a way that can hold scrolling back, except the 'js' driver on its own surface
 * (it has to be able to refuse the browser's scroll in order to take the drag).
 */
(function (root) {
  'use strict';

  var supportsTimeline = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('animation-timeline: scroll()');
  var instances = new Set();           // 'scroll' instances
  var publishers = new Map();          // scope element -> Set of instances publishing a CSS variable on it by timeline
  var fingers = 0;
  var uid = 0;
  var styleEl = null;

  function setup() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-scroll-gesture', '');
    styleEl.textContent =
      '.sg{display:flex;scrollbar-width:none}' +
      '.sg::-webkit-scrollbar{display:none}' +
      '.sg-x{flex-direction:row}' +
      '.sg-y{flex-direction:column}' +
      '.sg>.sg-pad,.sg>.sg-body{flex:0 0 100%;min-width:0;min-height:0;box-sizing:border-box}' +
      '.sg>.sg-tail{flex:0 0 1px;min-width:0;min-height:0}' +
      // 'scroll': overscroll-behavior only on the gesture axis. On iOS a non-auto value on the other axis also stops
      // the parent from starting a scroll there, e.g. a vertical list could no longer be scrolled from a swipeable row.
      '.sg-x:not(.sg-js){overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:none}' +
      '.sg-y:not(.sg-js){overflow-x:hidden;overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:none}' +
      '.sg:not(.sg-js)>.sg-pad,.sg:not(.sg-js)>.sg-body{scroll-snap-align:start;scroll-snap-stop:always}' +
      // 'js': the surface clips what the body is moved out of; the body keeps a layer of its own, so starting and
      // ending a drag never changes what is composited
      '.sg-js{overflow:hidden;overflow:clip}' +
      '.sg-js>.sg-body{will-change:transform}' +
      '.sg.sg-passing{pointer-events:none}';
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
   *   driver      'scroll' | 'js'           default 'scroll' (see the top of this file)
   *   axis        'x' | 'y'                 default 'x'
   *   sides       [-1, 1] | [1] | [-1]      directions that can commit, default both
   *   range       number                    p runs from -range to +range, default 1
   *   cssVar      string | null             CSS variable name, default '--p'; null turns it off
   *   scope       HTMLElement               element the CSS variable is set on, default el: the moving content can use
   *                                         it. For followers outside el, pass their common ancestor (every frame
   *                                         restyles all of scope, so keep it small), or leave the variable and, with
   *                                         the 'scroll' driver, bind their animation to g.timeline, which costs no
   *                                         restyle at all
   *   passthrough number 0..0.5            stop taking touches once only this share of the content is still on
   *                                         screen on its way out, default 0.05; 0 = off
   *   body        HTMLElement               use this child of el as the moving content instead of wrapping el's children
   *                                         (needed when a framework such as React owns those children)
   *   overshoot   number >= 0               extra travel past one full size, default 0. 0.5 puts the commit point at 150%,
   *                                         so the slow end of the move happens off-screen. p is still -1..1 (1 = commit point)
   */
  function ScrollGesture(el, opts) {
    opts = opts || {};
    setup();
    var JS = opts.driver === 'js';
    var X = opts.axis !== 'y';
    var sides = opts.sides || [-1, 1];
    var hasPos = sides.indexOf(1) !== -1;
    var hasNeg = sides.indexOf(-1) !== -1;
    if (!hasPos && !hasNeg) throw new Error('scroll-gesture: sides must contain 1 and/or -1');
    var range = opts.range == null ? 1 : +opts.range;
    var cssVar = opts.cssVar === undefined ? '--p' : opts.cssVar;
    var scope = opts.scope || el;
    var over = Math.max(0, +opts.overshoot || 0);
    // The option counts in the content's own size (what is still on screen); p counts to the commit point, which
    // lies `overshoot` further out.
    var passOpt = opts.passthrough == null ? 0.05 : Math.max(0, Math.min(0.5, +opts.passthrough));
    var zone = passOpt ? 1 - (1 - passOpt) / (1 + over) : 0;
    var id = ++uid;
    var tl = '--sg-timeline-' + id;
    var kf = 'sg-progress-' + id;

    // ---- structure: [ +pad | body | -pad ] for 'scroll', the body alone for 'js' ----
    // With only a +pad the body would rest at the very end of the scroll range, which is the very end of the scroll
    // timeline: there a scroll-driven animation counts as finished, and Chromium never hands an animation that began
    // finished to the compositor (nor tries again later), so every follower would be animated by the main thread for
    // good. One pixel of tail after the body keeps the resting position off the end: [ +pad | body | 1px ]. It is not
    // a snap area, so nothing ever comes to rest on it.
    var ownBody = !opts.body;
    var body = opts.body || document.createElement('div');
    body.classList.add('sg-body');
    if (ownBody) { while (el.firstChild) body.appendChild(el.firstChild); el.appendChild(body); }
    var padPos = null, padNeg = null, tail = null;
    if (!JS) {
      var pad = function (side) {
        var d = document.createElement('div'); d.className = 'sg-pad'; d.setAttribute('data-side', String(side));
        if (over) d.style.flexBasis = (100 * (1 + over)) + '%';
        return d;
      };
      if (hasPos) { padPos = pad(1); el.insertBefore(padPos, body); }
      if (hasNeg) { padNeg = pad(-1); el.insertBefore(padNeg, body.nextSibling); }
      else { tail = document.createElement('div'); tail.className = 'sg-tail'; el.insertBefore(tail, body.nextSibling); }
    }
    el.classList.add('sg', X ? 'sg-x' : 'sg-y');
    if (JS) el.classList.add('sg-js');

    var sideAllowed = function (side) { return side === 0 || (side > 0 ? hasPos : hasNeg); };

    // ---- state shared by both drivers ----
    var rest = 0, armed = false, passing = false;
    var listeners = { change: new Set(), settle: new Set() };
    var emit = function (type, v) { listeners[type].forEach(function (fn) { fn(v); }); };
    var setPassing = function (on) { if (on !== passing) { passing = on; el.classList.toggle('sg-passing', on); } };
    // The variable is written by script where no scroll timeline drives it.
    var scripted = !!cssVar && (JS || !supportsTimeline);
    var writeVar = function (p) { if (scripted) scope.style.setProperty(cssVar, String(p * range)); };
    // The content moved to p (-1..1).
    function report(p) {
      writeVar(p);
      if (!armed && Math.abs(p - rest) > Math.max(zone, 0.01)) armed = true;     // left the resting side
      if (zone && armed && !passing && rest === 0) {
        var side = p > 0 ? 1 : -1;
        if (sideAllowed(side) && Math.abs(p) >= 1 - zone) setPassing(true);       // the last of a commit
      }
      emit('change', p * range);
    }
    // The content came to rest on a side.
    function rested(side) {
      armed = false; rest = side;
      setPassing(side !== 0 && zone > 0);
      emit('settle', side);
    }

    // ---- enter(): the surface comes in by animation, whatever the driver ----
    var entering = null;                                     // { anim, timer, resolve } while an entrance runs
    function endEnter(arrived) {
      if (!entering) return;
      var e = entering;
      entering = null;
      clearTimeout(e.timer);
      if (e.anim && !arrived) e.anim.cancel();               // cut short: the surface is at rest without it
      e.resolve(arrived);
    }
    function enter(side, o) {
      o = o || {};
      side = side < 0 ? -1 : 1;
      endEnter(false);
      var travel = o.travel == null ? 1 : Math.max(0, Math.min(1, +o.travel));
      var ms = o.duration == null ? 300 : Math.max(0, +o.duration);
      // In % of the surface's own size, so nothing has to be measured: 100% is one size, the commit point is
      // 1 + overshoot. The surface is what moves, not the body: with the 'scroll' driver the body is one of its snap
      // areas, and moving a snap area would have the surface snap after it.
      var from = side * travel * (1 + over) * 100;
      // Nothing is set on the surface for the entrance (no class, no style), so nothing has to be undone when it
      // ends: an ancestor that changes under a finger scrolling inside it can stop that scroll dead (iOS), and the
      // end of an entrance is exactly when a finger is scrolling the new content.
      return new Promise(function (resolve) {
        var e = entering = { anim: null, timer: 0, resolve: resolve };
        if (from && ms && el.animate) {
          // fill backwards only: once it has run out it holds nothing, so there is nothing to take off the element
          e.anim = el.animate(
            [{ transform: (X ? 'translateX(' : 'translateY(') + from + '%)' }, { transform: 'none' }],
            { duration: ms, easing: o.easing || 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
          e.anim.onfinish = function () { if (entering === e) endEnter(true); };
        } else e.timer = setTimeout(function () { if (entering === e) endEnter(true); }, ms);
      });
    }

    var drv = JS ? jsDriver() : scrollDriver();

    // =====================================================================================================
    // driver 'scroll': a native snap scroller
    // =====================================================================================================
    function scrollDriver() {
      var posProp = X ? 'scrollLeft' : 'scrollTop';
      var extentProp = X ? 'scrollWidth' : 'scrollHeight';
      var pads = (hasPos ? 1 : 0) + (hasNeg ? 1 : 0);
      // Geometry is measured when the surface changes size, not on every scroll event: a scroll event then reads
      // the scroll position and nothing else, so it can never force a layout.
      var sizePx = 0, spanPx = 0, lastSize = 0;
      // Travel from rest to a commit point. clientWidth / clientHeight are whole pixels; with a fractional size the
      // travel computed from them is off by up to half a pixel per pad (times 1 + overshoot), enough to put a commit
      // point past where the element can scroll, so it would never count as reached. When the real scroll range is
      // within that rounding distance, it is used instead. (Further off means the content overflows; then it is not.)
      function measure() {
        sizePx = X ? el.clientWidth : el.clientHeight;
        var s = sizePx * (1 + over);
        var real = (el[extentProp] - sizePx - (tail ? 1 : 0)) / pads;
        spanPx = s && Math.abs(real - s) <= (1 + over) / 2 + 1 ? real : s;
      }
      var span = function () { if (!spanPx || !ro) measure(); return spanPx; };
      var posOf = function (side) { return (hasPos ? span() : 0) - side * span(); };  // +1 -> 0, 0 -> one span, -1 -> two spans
      var raw = function () {
        var s = span();
        if (!s) return 0;
        var d = (hasPos ? s : 0) - el[posProp];                // px from the resting position, positive towards +1
        var p = Math.max(-1, Math.min(1, d / s));
        var near = Math.round(p);
        return Math.abs(d - near * s) <= 1 ? near : p;         // within a pixel of a side is on it, as in settle()
      };

      var moved = false, jumping = false, idleT = 0;
      // The side a go() is heading for. Another scroll can cut a smooth scroll short (the browser revealing an element
      // that took focus, for one), even before it has moved at all; the move then carries on instead of stopping or
      // snapping back. A finger touching down drops it: the user has taken over.
      var goal = null, goalT = 0, resumes = 0;
      var dropGoal = function () { goal = null; clearTimeout(goalT); };

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
        var p = raw();
        writeVar(p);
        emit('change', p * range);
      }

      // Called when scrolling may have stopped. mayFinish: if it stopped between snap points, send it on to one.
      function settle(mayFinish) {
        if (!moved) return;
        var p = raw();
        var side = goal !== null ? goal : Math.round(p);
        if (!sideAllowed(side)) side = 0;
        var dist = Math.abs(el[posProp] - posOf(side));
        if (fingers && !passing) return;                      // still being dragged
        if (dist > 1) {                                       // at rest between snap points
          if (mayFinish && !fingers) scrollTo(passing && goal === null ? (p > 0 ? 1 : -1) : side, true);
          return;
        }
        clearTimeout(idleT);
        dropGoal();
        moved = false; wheeling = false;
        rested(side);
      }
      // No scroll event for 150 ms: scrolling has probably stopped. If the surface is then between snap points it is
      // sent on to one, because a finger that stops a snap in mid-air and lifts again can leave it there (iOS).
      // Not while a wheel or trackpad is what scrolls it, where the browser has 'scrollend': two fingers resting on
      // a trackpad in the middle of a swipe send nothing either, no event tells that they are still there, and the
      // surface would run off from under them. 'scrollend' comes once they have lifted and the snap has run.
      var hasScrollEnd = 'onscrollend' in window, wheeling = false;
      function idle() { clearTimeout(idleT); idleT = setTimeout(function () { settle(!(wheeling && hasScrollEnd)); }, 150); }
      function onWheel() { wheeling = true; }

      function onScroll() {
        if (jumping) { jumping = false; writeVar(raw()); return; }                 // jump() already reported it
        moved = true;
        report(raw());
        idle();
      }
      function onScrollEnd() { settle(true); }

      el.addEventListener('scroll', onScroll, { passive: true });
      if (hasScrollEnd) {
        el.addEventListener('scrollend', onScrollEnd);
        el.addEventListener('wheel', onWheel, { passive: true });
      }
      // Positioning happens here: the first callback (and the first one after being display:none) runs after layout
      // and before paint, so a new instance never shows its pad. Later size changes keep the resting side.
      var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () {
        measure();
        var s = sizePx;
        if (!s || s === lastSize) { lastSize = s; return; }
        var first = !lastSize;
        lastSize = s;
        if (first || (!armed && !fingers)) jump(rest);
      }) : null;

      el.style.setProperty('scroll-timeline-name', tl);
      el.style.setProperty('scroll-timeline-axis', X ? 'x' : 'y');

      return {
        timeline: tl,
        p: raw,
        start: function () {
          if (cssVar && supportsTimeline) {
            // timeline progress 0 = scrolled to the start (+pad), 1 = scrolled to the end. With a tail the resting
            // position is a pixel short of the end, so the resting value is held from 99% on: at rest it is exact.
            styleEl.sheet.insertRule('@keyframes ' + kf + '{from{' + cssVar + ':' + (hasPos ? range : 0) + '}' + (tail ? '99%,' : '') + 'to{' + cssVar + ':' + (hasNeg ? -range : 0) + '}}', styleEl.sheet.cssRules.length);
            if (!publishers.has(scope)) publishers.set(scope, new Set());
            publishers.get(scope).add(g);
            refreshPublishers(scope);
          }
          instances.add(g);
          if (supportsTimeline) refreshTimelineScope();
          if (ro) ro.observe(el);                              // no layout read here: many instances can be created in one go
          else jump(0);
        },
        go: function (side) {
          if (side === 0 && passing) setPassing(false);
          dropGoal();
          wheeling = false;
          if (Math.abs(el[posProp] - posOf(side)) >= 0.5) { goal = side; resumes = 0; watchGoal(); }
          scrollTo(side, true);
        },
        jump: jump,
        touchStarted: function () { wheeling = false; dropGoal(); },
        touchEnded: function () { if (moved) idle(); },
        destroy: function () {
          clearTimeout(idleT);
          dropGoal();
          instances.delete(g);
          if (supportsTimeline) refreshTimelineScope();
          if (ro) ro.disconnect();
          el.removeEventListener('scroll', onScroll);
          el.removeEventListener('scrollend', onScrollEnd);
          el.removeEventListener('wheel', onWheel);
          if (cssVar && supportsTimeline) {
            var set = publishers.get(scope);
            if (set) { set.delete(g); refreshPublishers(scope); if (!set.size) publishers.delete(scope); }
            removeKeyframes(kf);
          }
          if (padPos) padPos.remove();
          if (padNeg) padNeg.remove();
          if (tail) tail.remove();
          el.style.removeProperty('scroll-timeline-name');
          el.style.removeProperty('scroll-timeline-axis');
        }
      };
    }

    // =====================================================================================================
    // driver 'js': touch and wheel input move the body; a spring finishes the move
    // =====================================================================================================
    function jsDriver() {
      var lo = hasNeg ? -1 : 0, hi = hasPos ? 1 : 0;
      var p = 0, v = 0, target = 0, raf = 0, last = 0, spanPx = 0;
      var K = 200, C = 2 * Math.sqrt(K);                     // critically damped: it arrives without swinging past
      var drag = null;                                       // { id, x0, y0, a0, p0, state: 'pending' | 'ours' | 'theirs' }
      var samples = [];                                      // [time, p] of the last moves, for the speed at release
      var measure = function () { spanPx = (X ? el.clientWidth : el.clientHeight) * (1 + over); };
      var span = function () { if (!spanPx) measure(); return spanPx; };

      function paint() {
        var px = (p * span()).toFixed(2);
        body.style.transform = X ? 'translate3d(' + px + 'px,0,0)' : 'translate3d(0,' + px + 'px,0)';
      }
      function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      function place(np) {
        np = Math.max(lo, Math.min(hi, np));
        if (np === p) return;
        p = np; paint(); report(p);
      }
      function arrive() {
        stop();
        v = 0;
        if (p !== target) { p = target; paint(); report(p); }
        rested(target);
      }
      function tick(now) {
        var dt = Math.min(0.034, (now - last) / 1000) || 0.016;
        last = now;
        for (var i = 0; i < 2; i++) { v += (K * (target - p) - C * v) * dt / 2; p += v * dt / 2; }
        // at the goal, or pushed past an end it may not leave
        if ((Math.abs(target - p) < 0.0015 && Math.abs(v) < 0.03) || p >= hi && target === hi || p <= lo && target === lo) { raf = 0; arrive(); return; }
        p = Math.max(lo, Math.min(hi, p));
        paint(); report(p);
        raf = requestAnimationFrame(tick);
      }
      function springTo(side, speed) {
        target = side; v = speed || 0;
        if (Math.abs(target - p) < 0.0015 && Math.abs(v) < 0.03) { arrive(); return; }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(function (now) { last = now - 16; tick(now); }); }
      }
      function sample() {
        var now = performance.now();
        samples.push([now, p]);
        while (samples.length > 2 && now - samples[0][0] > 100) samples.shift();
      }
      // Let go. A flick (faster than FLICK px/ms) goes the way it was thrown: out if the content is on that side of
      // rest, back to rest if it is on the other. Anything slower goes to whichever is nearer.
      var FLICK = 0.35;
      function release() {
        var speed = 0, n = samples.length;                   // in p per second
        if (n > 1 && performance.now() - samples[n - 1][0] < 80) {
          var dt = (samples[n - 1][0] - samples[0][0]) / 1000;
          if (dt > 0.008) speed = (samples[n - 1][1] - samples[0][1]) / dt;
        }
        samples = [];
        var side;
        if (Math.abs(speed) * span() / 1000 > FLICK) side = speed > 0 ? (p >= 0 ? 1 : 0) : (p <= 0 ? -1 : 0);
        else side = p > 0.5 ? 1 : p < -0.5 ? -1 : 0;
        if (!sideAllowed(side)) side = 0;
        springTo(side, speed);
      }

      // Could a drag in this direction (1: towards +, -1: towards -) move the content, and does nothing between the
      // touched element and the surface want it for its own scrolling along the same axis?
      function canTake(dir, node) {
        if (dir > 0 ? p >= hi : p <= lo) return false;
        for (; node && node !== el && node.nodeType === 1; node = node.parentNode) {
          var max = X ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
          if (max <= 1) continue;
          var o = getComputedStyle(node)[X ? 'overflowX' : 'overflowY'];
          if (o !== 'auto' && o !== 'scroll') continue;
          var at = X ? node.scrollLeft : node.scrollTop;
          if (dir > 0 ? at > 0 : at < max - 1) return false;   // it can still scroll that way: the drag is its own
        }
        return true;
      }

      function touchOf(e) {
        for (var i = 0; i < e.touches.length; i++) if (e.touches[i].identifier === drag.id) return e.touches[i];
        return null;
      }
      function onTouchStart(e) {
        if (drag && !touchOf(e)) drag = null;                // its end never arrived
        if (drag || e.touches.length > 1 || passing) return;
        var t = e.changedTouches[0];
        drag = { id: t.identifier, x0: t.clientX, y0: t.clientY, a0: 0, p0: p, state: 'pending' };
        samples = [];
        if (raf) {
          // Caught in flight: the finger holds it where it is. Unless it had as good as arrived: then it is put at
          // rest, and the touch is an ordinary one that may well be the start of a scroll across the axis.
          if (Math.abs(target - p) > 0.02) { stop(); v = 0; drag.state = 'ours'; }
          else arrive();
          drag.p0 = p;
        }
      }
      function onTouchMove(e) {
        if (!drag) return;
        var t = touchOf(e);
        if (!t) return;
        var dx = t.clientX - drag.x0, dy = t.clientY - drag.y0;
        var along = X ? dx : dy, across = X ? dy : dx;
        if (drag.state === 'pending') {
          if (Math.abs(along) < 3 && Math.abs(across) < 3) return;
          // The first real move decides, once: after a move that was not refused the browser scrolls and the touch
          // is no longer ours to take.
          if (Math.abs(along) <= Math.abs(across) || !canTake(along > 0 ? 1 : -1, e.target)) { drag.state = 'theirs'; return; }
          drag.state = 'ours';
          drag.a0 = along;                                   // from here on, so the content does not jump by the slop
        }
        if (drag.state !== 'ours') return;
        if (e.cancelable) e.preventDefault();
        place(drag.p0 + (along - drag.a0) / span());
        sample();
      }
      function onTouchEnd(e) {
        if (!drag || touchOf(e)) return;                     // another finger lifted
        var ours = drag.state === 'ours';
        drag = null;
        if (ours) release();
      }

      // Trackpad and wheel: the wheel stream is the drag; a pause in it is the release. What still arrives after a
      // commit (the trackpad's own momentum) is swallowed until the stream has paused.
      var wheeling = false, wheelT = 0, wheelDone = false, wheelDoneT = 0;
      function endWheel() { wheeling = false; if (!raf && rest !== p) release(); else samples = []; }
      function onWheel(e) {
        if (e.ctrlKey || drag) return;
        var d = X ? e.deltaX : e.deltaY, o = X ? e.deltaY : e.deltaX;
        if (e.deltaMode === 1) d *= 16;
        if (!wheeling && !wheelDone) {
          if (!d || Math.abs(d) <= Math.abs(o) || passing || !canTake(d < 0 ? 1 : -1, e.target)) return;
        }
        e.preventDefault();
        if (wheelDone) { clearTimeout(wheelDoneT); wheelDoneT = setTimeout(function () { wheelDone = false; }, 160); return; }
        if (!wheeling) { wheeling = true; stop(); v = 0; samples = []; }
        place(p - d / span());
        sample();
        clearTimeout(wheelT);
        if ((p === hi && hi === 1) || (p === lo && lo === -1)) {   // carried all the way: committed
          wheeling = false; samples = []; target = p;
          wheelDone = true; wheelDoneT = setTimeout(function () { wheelDone = false; }, 160);
          rested(p);
          return;
        }
        wheelT = setTimeout(endWheel, 90);
      }

      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });     // has to be able to refuse the scroll
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('touchcancel', onTouchEnd, { passive: true });
      el.addEventListener('wheel', onWheel, { passive: false });
      var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { measure(); paint(); }) : null;

      return {
        timeline: null,
        p: function () { return p; },
        start: function () { writeVar(p); if (ro) ro.observe(el); else paint(); },   // no layout read here either
        go: function (side) {
          if (side === 0 && passing) setPassing(false);
          drag = null;
          springTo(side, 0);
        },
        // Instant move to a side; it becomes the resting side without a 'settle' event.
        jump: function (side) {
          stop(); drag = null; v = 0;
          rest = side; armed = false; target = side;
          setPassing(side !== 0 && zone > 0);
          p = side; paint();
          writeVar(p);
          emit('change', p * range);
        },
        touchStarted: function () {},
        touchEnded: function () {},
        destroy: function () {
          stop();
          clearTimeout(wheelT); clearTimeout(wheelDoneT);
          if (ro) ro.disconnect();
          el.removeEventListener('touchstart', onTouchStart);
          el.removeEventListener('touchmove', onTouchMove);
          el.removeEventListener('touchend', onTouchEnd);
          el.removeEventListener('touchcancel', onTouchEnd);
          el.removeEventListener('wheel', onWheel);
          body.style.removeProperty('transform');
          if (scripted) scope.style.removeProperty(cssVar);
        }
      };
    }

    var g = {
      el: el,
      body: body,
      /** 'scroll' or 'js'. */
      driver: JS ? 'js' : 'scroll',
      /** Name of the scroll timeline (visible page-wide), for `animation-timeline` on your own elements.
       *  null with the 'js' driver: listen to 'change' there. */
      timeline: null,
      /** Current progress, -range .. +range. */
      get p() { return drv.p() * range; },
      /** Side the surface last came to rest on: -1, 0 or 1. */
      get rest() { return rest; },
      /** True while the surface lets touches through. */
      get passing() { return passing; },
      /** True while an entrance started with enter() is running. */
      get entering() { return !!entering; },
      /** on('change', p => …) on every move; on('settle', side => …) when it comes to rest. Returns an unsubscribe function. */
      on: function (type, fn) {
        if (!listeners[type]) throw new Error('scroll-gesture: unknown event ' + type);
        listeners[type].add(fn);
        return function () { listeners[type].delete(fn); };
      },
      /** Move to a side (-1, 0, 1), animated unless { smooth: false }. With the 'scroll' driver another scroll cutting
       *  it short does not stop it (it carries on); a finger touching down does (the user takes over). */
      go: function (side, o) {
        side = side > 0 ? 1 : side < 0 ? -1 : 0;
        if (!sideAllowed(side)) return;
        endEnter(false);
        if (o && o.smooth === false) { drv.jump(side); return; }
        drv.go(side);
      },
      /** Jump back to 0 instantly, e.g. after swapping the content of a committed surface. */
      reset: function () { endEnter(false); drv.jump(0); },
      /**
       * Bring the content in from a side (1 or -1) without a gesture. go() is a move a finger can stop or drag along;
       * coming in needs no finger-following, so the surface is moved as a whole by a script-started animation (Web
       * Animations: run by the compositor) from that side's commit point to rest. p does not change. The content can
       * be touched and scrolled straight away, and the gesture itself works throughout. The entrance sets nothing on
       * the surface and so undoes nothing when it ends: a finger scrolling the new content at that moment is not
       * disturbed.
       * Options: duration (ms, default 300), easing (CSS easing), travel (share of the way from the commit point to
       * cover, default 1; 0 moves nothing and g.entering is simply true for that long).
       * Returns a promise: true once arrived, false if go(), reset() or destroy() cut it short. p, the CSS variable
       * and the timeline stay at rest meanwhile: animate followers on the same clock.
       */
      enter: enter,
      destroy: function () {
        endEnter(false);
        drv.destroy();
        if (ownBody) { while (body.firstChild) el.insertBefore(body.firstChild, body); body.remove(); }
        else body.classList.remove('sg-body');
        el.classList.remove('sg', 'sg-x', 'sg-y', 'sg-js', 'sg-passing');
      },
      _kf: kf,
      _tl: tl,
      _touchEnded: function () { drv.touchEnded(); },
      _touchStarted: function () { drv.touchStarted(); }
    };
    g.timeline = drv.timeline;
    if (cssVar) registerVar(cssVar);
    drv.start();
    return g;
  }

  root.ScrollGesture = ScrollGesture;
  if (typeof module === 'object' && module.exports) module.exports = ScrollGesture;
})(typeof window !== 'undefined' ? window : this);
