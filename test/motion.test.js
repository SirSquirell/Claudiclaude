import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The spring schedules frames with rAF, which node does not have. The stub
 * records nothing and runs nothing: every test below drives `step(dt)` itself,
 * which is the whole reason the physics is separated from the frame loop.
 */
globalThis.requestAnimationFrame ??= () => 1;
globalThis.cancelAnimationFrame ??= () => {};

const { Spring, prefersReducedMotion, project, rubber, velocityFrom } = await import('../src/ui/motion.js');

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/**
 * The spring is driven by rAF in a browser, but `step(dt)` is the physics and it
 * is separated for exactly this: a damping value asserted only in a comment is a
 * damping value nobody has checked. Everything below drives the integration by
 * hand at a fixed 60 Hz.
 */
const run = (s, seconds, dt = 1 / 60) => {
  const trace = [];
  for (let t = 0; t < seconds; t += dt) {
    const done = s.step(dt);
    trace.push(s.x);
    if (done) break;
  }
  return trace;
};

test('critically damped means it never overshoots what it was aimed at', () => {
  /**
   * The decision the default encodes. An overshoot on a *window* would run past
   * the day you released on and come back, which reads as the control
   * disagreeing with you — the bounce belongs on things being thrown, not on
   * things being aimed.
   */
  const s = new Spring(0, { restDistance: 0.001 });
  s.target = 10;
  for (const x of run(s, 3)) assert.ok(x <= 10.0001, `overshot to ${x}`);
  assert.equal(s.x, 10, 'and it lands exactly on the target rather than near it');
});

test('it comes to rest, and quickly enough that nothing waits on it', () => {
  /**
   * The defect this was written for: with the rest distance left at a value that
   * means nothing on screen, the spring kept integrating an invisible remainder
   * and the window applied most of a second after the finger left. `onRest` is
   * on the critical path, so "asymptotically approaches" is not good enough.
   */
  const s = new Spring(0, { response: 0.42, restDistance: 0.05 });
  s.target = 20;
  const trace = run(s, 5);
  assert.ok(trace.length < 60, `took ${trace.length} frames (a second) to settle`);
  assert.equal(s.x, 20);

  // And a tighter rest distance genuinely takes longer, which is the knob doing
  // what it claims rather than being decorative.
  const tight = new Spring(0, { response: 0.42, restDistance: 0.0005 });
  tight.target = 20;
  assert.ok(run(tight, 5).length > trace.length);
});

test('it animates from where it is, not from where it was going', () => {
  /**
   * The one thing an interruptible animation must never do is jump. Re-aiming
   * mid-flight keeps the presentation value and the current velocity, so a grab
   * reverses from where the eye last saw the thing — verified in a browser as a
   * zero-index jump, and pinned here as the property that guarantees it.
   */
  const s = new Spring(0, { restDistance: 0.001 });
  s.target = 100;
  run(s, 0.15);
  const wasAt = s.x;
  const wasMoving = s.v;
  assert.ok(wasAt > 0 && wasAt < 100, 'the test needs it to be genuinely mid-flight');
  s.set(0);
  assert.equal(s.x, wasAt, 'it teleported when re-aimed');
  assert.equal(s.v, wasMoving, 'and it forgot which way it was going');

  // A handed-in velocity replaces it: this is the seam-free handoff from a
  // finger that was already moving.
  s.set(0, { velocity: -42 });
  assert.equal(s.v, -42);
});

test('a backgrounded tab does not detonate the spring', () => {
  // rAF deltas of several seconds arrive on tab resume, and an unclamped
  // integration step turns one into a spring that leaves the screen. The clamp
  // is in the frame loop; this pins that a large step is survivable at all.
  const s = new Spring(0, { restDistance: 0.001 });
  s.target = 10;
  s.step(0.032);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 100);
});

test('momentum projects further the faster you let go, and nowhere at all if you stopped', () => {
  assert.equal(project(0), 0);
  assert.ok(project(100) > 0);
  assert.ok(project(-100) < 0);
  assert.ok(project(200) > project(100), 'a harder flick has to go further');
  // Roughly half a second of travel, which is what makes a flick throw a window
  // noticeably past the release point without throwing it off the end.
  assert.ok(project(100) > 40 && project(100) < 60);
});

test('the rubber-band resists, and no amount of pulling gets anywhere', () => {
  const dim = 100;
  assert.equal(rubber(0, dim), 0);
  // Always less than the raw overflow: that is the resistance.
  for (const o of [1, 5, 20, 100, 1000]) assert.ok(rubber(o, dim) < o, `${o} was not resisted`);
  // Monotone, so it still tracks the finger rather than sticking.
  assert.ok(rubber(20, dim) > rubber(5, dim));
  // And bounded by the surface's own size, approached and never reached, so the
  // end of the history cannot be dragged into the distance.
  assert.ok(rubber(1e9, dim) < dim);
  assert.ok(rubber(1e9, dim) > dim * 0.99, 'the bound is dim, not some fraction of it');
  // Symmetric, because an edge at the start resists exactly as one at the end.
  assert.equal(rubber(-20, dim), -rubber(20, dim));
});

test('a gesture that came to a stop has no velocity left', () => {
  /**
   * The defect a browser found: a hand slows to a stop before letting go, and no
   * pointer event fires during that pause — so the newest sample was from before
   * it, and a deliberate drag was thrown as if it had been flicked. Released on
   * July 2024, landed on April 2025.
   */
  const moving = [{ v: 0, t: 0 }, { v: 10, t: 50 }, { v: 20, t: 100 }, { v: 30, t: 150 }];
  assert.ok(velocityFrom(moving) > 150, 'a steady drag should read as moving');

  // The same trail with the release stamped after a pause: it has stopped.
  const stopped = [...moving, { v: 30, t: 300 }];
  assert.ok(Math.abs(velocityFrom(stopped)) < 1e-6, 'a pause before release still reads as a flick');

  assert.equal(velocityFrom([]), 0);
  assert.equal(velocityFrom([{ v: 1, t: 1 }]), 0);
  // Two samples at the same instant are a division by zero, not an infinity.
  assert.equal(velocityFrom([{ v: 0, t: 5 }, { v: 9, t: 5 }]), 0);
});

test('reduced motion is answered per call, and is false where there is no browser to ask', () => {
  // Cached, it would need an invalidation nobody would write — the setting can
  // change while the page is open.
  assert.equal(prefersReducedMotion(), false);
  assert.match(read('../src/ui/motion.js'), /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});

// ===========================================================================
// US-55 / US-63 — the wiring the physics is attached to
// ===========================================================================

const app = read('../src/ui/app.js');
const gesture = app.slice(app.indexOf('function wireZoom'), app.indexOf('function zoomTo'));

test('dragging is 1:1 — the spring is only for after the finger leaves', () => {
  /**
   * Easing a drag is the classic mistake: it makes the surface feel laggy and it
   * is not motion the reader asked for, it is the reader's own hand. `snap`
   * during the move, `set` on release.
   */
  const move = gesture.slice(gesture.indexOf("addEventListener('pointermove'"), gesture.indexOf("addEventListener('pointercancel'"));
  assert.match(move, /moving\.snap\(/);
  assert.ok(!/moving\.set\(/.test(move), 'the drag itself has started easing');
});

test('reduced motion keeps the tracking and drops the settle', () => {
  // §14: a gentler feedback, never no feedback. The brush still follows the
  // finger — that is direct control, not vestibular motion — and only the glide
  // and the overshoot go.
  const up = gesture.slice(gesture.indexOf("addEventListener('pointerup'"));
  assert.match(up, /if \(prefersReducedMotion\(\)\) \{\s*\n\s*moving\.snap\(/);
});

test('the window is always whole days, however it was thrown', () => {
  // Momentum projects where the edge lands; the landing is then rounded to a
  // day. There is no fractional-day window, on either path.
  const up = gesture.slice(gesture.indexOf("addEventListener('pointerup'"));
  assert.match(up, /Math\.round\(clamp\(moving\.x \+ project\(velocity\)\)\)/);
  assert.match(up, /moving\.snap\(clamp\(Math\.round\(moving\.x\)\)\)/);
});

test('the gesture asks the engine for nothing', () => {
  /**
   * US-55's and US-63's shared stop condition: this is UI over the arrays the
   * page already holds, and the moment it reaches into `engine.js` it has
   * stopped being a rendering concern. It also never re-renders the page
   * mid-gesture — the band and its readout update from arrays the chart plugin
   * already has, and the window applies once, on settle. So the per-frame
   * recompute budget the story worried about is not spent at all.
   */
  assert.ok(!/computePortfolio|engine\.js/.test(gesture));
  assert.ok(!/\brender\(\)/.test(gesture.replace(/chart\.render\(\)/g, '')), 'the page re-renders during the gesture');
});
