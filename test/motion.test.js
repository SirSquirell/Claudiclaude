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

// ===========================================================================
// US-65 — the honest number change
// ===========================================================================

const css = read('../src/ui/styles.css');

test('AC2 — nothing anywhere can produce a figure between the old and the new', () => {
  /**
   * The entire story. A count-up tween shows, on every frame, a value the
   * account never had — and this project's whole claim is that it shows none. So
   * the swap animates the *element* and never the *number*: the two spans hold
   * complete strings the formatters produced, and the motion is CSS, which has
   * no access to the digits at all.
   *
   * Proven in a browser by sampling every tile every frame across a range
   * change: each changed figure showed exactly two distinct strings and never a
   * third. This is the structural guarantee behind that measurement.
   */
  const tiles = app.slice(app.indexOf('const cell = (t, kind) =>'), app.indexOf('const [hero, ...others]'));
  assert.match(tiles, /class="swap-in">\$\{esc\(value\)\}/);
  assert.match(tiles, /class="swap-out"[^>]*>\$\{esc\(previous\)\}/);
  // Only the two formatted strings reach the markup — no arithmetic on either.
  assert.ok(!/parseFloat|Number\(|\+\s*\(1\s*-|lerp|tween/i.test(tiles), 'the swap has started computing a value');

  // And the motion is declarative, so there is no frame loop that could.
  assert.match(css, /@keyframes figure-out/);
  assert.match(css, /@keyframes figure-in/);
  assert.ok(!/figure-(in|out)/.test(app), 'the swap animation is being driven from script');
});

test('AC4 — a figure only swaps when it actually changed', () => {
  // Transitioning on every render flickers on a tab switch that changed
  // nothing. Keyed by label rather than position, because the sections show
  // overlapping subsets in different orders and an index would call a tab
  // switch a change.
  const tiles = app.slice(app.indexOf('const cell = (t, kind) =>'), app.indexOf('const [hero, ...others]'));
  assert.match(tiles, /const changed = previous !== undefined && previous !== value;/);
  assert.match(app, /const lastTileValue = new Map\(\);/);
});

test('AC5 — reduced motion is an instant swap, not a slower one', () => {
  // A cross-fade is still motion, and there is nothing here it would help
  // anyone understand. Verified in a browser: the departing figure computes to
  // `display: none` and the arriving one to `animation-name: none`.
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .tile .value.swap'));
  assert.match(block, /\.swap-out \{ display: none; \}/);
  assert.match(block, /\.swap-in \{ animation: none; \}/);
});

test('the departing figure is a ghost — out of the pointer’s way and out of the tree', () => {
  // It is a picture of something that is no longer true, so it must not be
  // readable by a screen reader or clickable.
  const tiles = app.slice(app.indexOf('const cell = (t, kind) =>'), app.indexOf('const [hero, ...others]'));
  assert.match(tiles, /class="swap-out" aria-hidden="true"/);
  assert.match(css, /\.tile \.value\.swap > \.swap-out \{\s*\n\s*pointer-events: none;/);
});

// ===========================================================================
// US-64 — sections arrive, they do not cut
// ===========================================================================

const route = app.slice(app.indexOf('function arrive(section)'), app.indexOf('/** Is this canvas in the section'));

test('AC1 — a route change animates transform and opacity, and nothing else', () => {
  /**
   * Animating a height would reflow the whole grid on every route change, which
   * is the janky path — and on a page of charts an expensive one. Verified in a
   * browser: the keyframes the section actually runs carry exactly `opacity` and
   * `transform`.
   */
  assert.match(route, /opacity: 0, transform: 'translateY\(8px\)'/);
  assert.ok(!/height|width|margin|padding|top:|left:/.test(route), 'the transition has started animating layout');
});

test('AC2 — flicking through the rail leaves one section arriving, not five', () => {
  // Cancelled rather than queued. Successive changes land on different
  // elements, so cancelling on the element being started is enough — and a
  // section returned to mid-flight restarts cleanly instead of stacking.
  assert.match(route, /for \(const a of section\.getAnimations\?\.\(\) \?\? \[\]\) a\.cancel\(\);/);
});

test('AC3/AC4 — the content is not delayed and the charts do not replay', () => {
  /**
   * The section is shown and interactive before the motion starts: `arrive` is
   * called after `hidden` is cleared, it animates the container, and it locks
   * nothing. And the charts cannot replay because they are built with Chart.js
   * animation off — the transition never reaches them.
   */
  assert.match(app, /section\.hidden = !on;\s*\n\s*if \(on && changed\) arrive\(section\);/);
  assert.ok(!/pointer-events|disabled|inert/.test(route), 'the transition locks the section it is decorating');
  assert.match(read('../src/ui/charts.js'), /animation: false,/);
});

test('AC5 — reduced motion keeps the fade and drops the travel', () => {
  // Something appearing is motion that aids comprehension; the vestibular part
  // is the journey. So the slide goes and a short fade stays.
  assert.match(route, /reduced\s*\n?\s*\? \[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
  assert.match(route, /duration: reduced \? 120 : 260/);
});

test('a re-render is not a route change', () => {
  // `applyTab` runs on every render, including a range change. Animating there
  // would flash the whole section every time a button is pressed.
  assert.match(app, /const changed = shownTab !== state\.tab;/);
});

// ===========================================================================
// US-56 — response, and the preferences this stylesheet had never answered
// ===========================================================================

test('AC1 — a press that is dragged away from stops looking pressed', () => {
  /**
   * CSS `:active` gets the press right and the cancel wrong: a held mouse button
   * keeps `:active` on the element it started on even after the pointer leaves,
   * because the browser captures the pointer there. The click was already
   * abandoned — a click only fires when press and release share an element — but
   * the control went on looking armed, which is the opposite of what
   * cancel-by-dragging-away is for.
   *
   * `.press-cancelled` is negated in the rule rather than overriding it
   * afterwards, so there is one definition of what a press looks like — and the
   * keyboard path, which never gets the class because it has no pointer, is
   * untouched. Measured in a browser: pressed → scale(0.97), dragged away →
   * none, returned → scale(0.97) again.
   */
  assert.match(css, /button:active:not\(\.press-cancelled\)/);
  assert.match(read('../src/ui/motion.js'), /export function wirePressFeedback/);
  // Re-entering re-arms: the condition is "drags away and does not come back".
  assert.match(read('../src/ui/motion.js'), /armed\.classList\.toggle\(CANCELLED, !\(over && armed\.contains\(over\)\)\)/);
  // One delegated listener per document, not one per control.
  for (const f of ['app.js', 'popup.js']) assert.match(read(`../src/ui/${f}`), /wirePressFeedback\(\)/);
});

test('AC5 — the three preferences are asked, not assumed', () => {
  /**
   * The point of this being a test: two of the three had never been asked at
   * all. Reduced motion was handled in five places; transparency and contrast
   * were absent, so a reader who had set them got the default page and no
   * indication that anything had been considered.
   */
  for (const q of ['prefers-reduced-motion: reduce', 'prefers-reduced-transparency: reduce', 'prefers-contrast: more']) {
    assert.ok(css.includes(`@media (${q})`), `${q} is not answered anywhere in the stylesheet`);
  }
});

test('no fallback is allowed to soften a warning', () => {
  /**
   * US-56's stop condition, and the one that outranks the aesthetic: rule 6's
   * reconciliation red, the price-gap amber and the critical tone must never be
   * weakened by a preference. Verified in a browser under each of the three
   * settings — all three tokens resolve identically — and pinned here as the
   * rule that none of the blocks may redefine them.
   */
  for (const q of ['prefers-reduced-motion: reduce', 'prefers-reduced-transparency: reduce', 'prefers-contrast: more']) {
    const at = css.indexOf(`@media (${q})`);
    // The block runs to the next top-level `@media`, which is enough to catch a
    // token being redefined inside this one.
    const block = css.slice(at, css.indexOf('\n@media', at + 10) + 1 || undefined);
    for (const token of ['--neg:', '--critical:', '--warning:', '--pos:']) {
      assert.ok(!block.includes(token), `${q} redefines ${token}`);
    }
  }
});

// ===========================================================================
// US-58 — type that changes shape with size
// ===========================================================================

test('AC1/AC2 — tracking and leading are buckets, not one value with four names', () => {
  /**
   * The values were already correct and already in the stylesheet before this
   * story — scattered across the rules that used them. What was missing was
   * anything that would notice them collapsing back to one, which is the exact
   * failure: a single global `letter-spacing` is wrong somewhere, and on the
   * biggest number on the page it is wrong most visibly.
   *
   * `tools/check-type.mjs` is the measurement and it runs in `npm test`. This
   * asserts it stays wired in, the way the palette check is — a check that is
   * only run by hand is a check that stops being run.
   */
  const pkg = JSON.parse(read('../package.json'));
  assert.match(pkg.scripts.test, /check-type\.mjs/, 'the type check is no longer part of npm test');
  assert.equal(pkg.scripts.type, 'node tools/check-type.mjs');

  // And the buckets themselves, so a reader of the tests can see the scale.
  const root = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
  for (const [name, sign] of [['--track-display', -1], ['--track-title', -1], ['--track-label', 1]]) {
    const m = new RegExp(`${name}:\\s*(-?[\\d.]+)em`).exec(root);
    assert.ok(m, `${name} is missing from the token block`);
    assert.equal(Math.sign(Number(m[1])), sign, `${name} has the wrong sign for its bucket`);
  }
});

test('the check fails on the two regressions it exists for', async () => {
  /**
   * A check nobody has watched fail is a check that might pass on everything.
   * Both cases were run against a modified stylesheet: a fixed global
   * `letter-spacing` on `body`, and a display-sized rule whose tracking was
   * flattened to the body bucket. Each was reported by name.
   */
  const src = read('../tools/check-type.mjs');
  assert.match(src, /tracking is size-specific, not global/);
  assert.match(src, /is display-sized but its tracking is/);
  assert.match(src, /process\.exit\(1\)/, 'the check no longer fails the build');
});

test('optical sizing is declared, and what it can do is stated rather than promised', () => {
  /**
   * The refinement's second trap: optical sizing needs a variable font. **No
   * font is bundled here** — the stack is the system UI face — so this acts on
   * the platforms whose system font carries the axis and is inert elsewhere.
   * That is worth declaring and worth saying out loud; what it is not worth is
   * claiming.
   */
  assert.match(css, /font-optical-sizing: auto;/);
  assert.match(css, /\*\*no font is bundled\.\*\*/);
  assert.ok(!/@font-face/.test(css), 'a font was bundled; the note above it is now wrong');
});

// ===========================================================================
// US-57 — the share sheet as a material
// ===========================================================================

const sheet = app.slice(app.indexOf('function materialize(dlg, open)'), app.indexOf('function showShareSheet'));

test('AC1 — the sheet materializes, and the close is the same path backwards', () => {
  /**
   * "Materialize, don't fade": blur and scale move together, so it reads as a
   * pane of glass arriving rather than a picture becoming opaque. One keyframe
   * pair used in both directions is what makes the open and the close feel like
   * one object instead of two effects.
   *
   * Measured in a browser 40ms into the open: opacity 0.49, scale 0.969, blur
   * 7.2px — all three mid-flight together — and mid-close the same three
   * reversing with the dialog still open.
   */
  assert.match(sheet, /transform: 'scale\(0\.94\)', filter: `blur\(\$\{blur\}\)`/);
  assert.match(sheet, /dlg\.animate\(open \? \[shut, shown\] : \[shown, shut\]/);
});

test('AC3 — re-opening mid-close reverses instead of queueing behind it', () => {
  // Cancel, not wait: the sheet picks up from its on-screen state. And because
  // `close()` hangs off the animation finishing, a cancelled close must not
  // still close — which is why the rejection is swallowed rather than logged.
  assert.match(sheet, /for \(const a of dlg\.getAnimations\(\)\) a\.cancel\(\);/);
});

test('AC4 — reduced motion is a fade, reduced transparency drops the blur', () => {
  // Two different needs and two different answers: one removes the travel, the
  // other removes the glass. Reduced motion keeps the sheet announcing itself,
  // because that is comprehension rather than decoration.
  assert.match(sheet, /const reduced = prefersReducedMotion\(\);/);
  assert.match(sheet, /reduced\s*\n?\s*\? \{ opacity: 0 \}/);
  assert.match(sheet, /getPropertyValue\('--sheet-blur'\)/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\) \{\s*\n[\s\S]{0,400}?--sheet-blur: 0px;/);
});

test('AC2/AC3 — the format strip has the chart’s physics, from the same module', () => {
  /**
   * One motion vocabulary. Two springs with different feels on one page read as
   * two products, so the strip uses `motion.js`'s projection and velocity trail
   * rather than its own — and taking hold stops the spring where it is, so it
   * follows from the on-screen position.
   *
   * Verified in a browser: a leftward flick from 1:1 lands on 16:9 and the
   * preview redraws at 2560×1440.
   */
  const strip = app.slice(app.indexOf('function wireFormatStrip'), app.indexOf("host.addEventListener('focusin'"));
  assert.match(strip, /stripX\.stop\(\);/);
  assert.match(strip, /project\(velocityFrom\(trail\)\)/);
  assert.match(strip, /prefersReducedMotion\(\) \? 0 : project/);
  // A press that never moved is a click; the item's own handler owns it.
  assert.match(strip, /if \(moved < 4\) return;/);
});

test('the strip does not become a hole for anyone using a keyboard', () => {
  /**
   * Two of the four shapes sit outside the window and are still in the tab
   * order, so without this focus lands on something invisible — the gesture
   * quietly replacing the accessible path, which is the way these features
   * usually go wrong. A transform has no scroll position, so the browser's own
   * `scrollIntoView` cannot cover it.
   *
   * Browser-checked: at rest the window shows 1:1 and 4:5; tabbing to 9:16
   * brings 9:16 and 16:9 into it, the selection does not move, and Enter picks.
   */
  assert.match(app, /host\.addEventListener\('focusin'/);
  const focus = app.slice(app.indexOf("host.addEventListener('focusin'"));
  assert.ok(!/pick\(/.test(focus.slice(0, 600)), 'arriving somewhere is not the same as choosing it');
  // And they are buttons in a group, so Tab and Enter reach them at all.
  assert.match(app, /b\.className = 'fmt';/);
  assert.match(read('../src/ui/app.html'), /id="share-format" role="group"/);
});

// ===========================================================================
// The Apple-design pass over the popup and the dialogs
// ===========================================================================

test('tracking travels with the size, so a context that resizes states its bucket', () => {
  /**
   * The defect a browser measurement found, and the one US-58's own check was
   * blind to: `--kpi` is re-set in six contexts and the tracking was written
   * once, on the shared rule, at the display value. A 17px amount in the app and
   * a 13px one in the popup were both set at -0.025em — display tracking on
   * body-sized text, which is exactly the mistake bucketing exists to prevent.
   *
   * The first version of the check only ever asked whether *display* rules were
   * negative, so it passed happily. It now checks the pair, and the pair is what
   * makes the invariant statically visible at all: the computed value at the
   * point of use depends on which ancestor set the token.
   */
  assert.match(css, /letter-spacing: var\(--kpi-track\);/);
  assert.ok(!/letter-spacing: var\(--track-display\);/.test(css), 'a shared rule pinned one bucket again');
  const checker = read('../tools/check-type.mjs');
  assert.match(checker, /sets --kpi but not --kpi-track/);
  assert.match(checker, /but tracked as \$\{stated\}/);
});

test('the popup acknowledges a figure that changed, with the page’s mechanism', () => {
  /**
   * The popup is the surface most likely to be open across a sync — you press
   * Sync in it and watch — and it was the one that acknowledged nothing. US-65
   * gave the page the swap and left this half-present.
   *
   * The same two-span markup and the same shared CSS, so no code path here can
   * produce a figure between the old value and the new one either.
   */
  const popup = read('../src/ui/popup.js');
  assert.match(popup, /class="swap-in">\$\{esc\(value\)\}/);
  assert.match(popup, /class="swap-out" aria-hidden="true">\$\{esc\(previous\)\}/);
  assert.match(popup, /const changed = previous !== undefined && previous !== value;/);
  assert.ok(!/@keyframes/.test(popup), 'the popup grew its own animation instead of the shared one');
});

test('the popup’s actions are a comfortable target', () => {
  // 38px is fine for a mouse and under the 44px an unaided finger wants. Raised
  // here rather than everywhere: the page's buttons sit in dense toolbars where
  // 44px would push the controls apart, and this panel has two and room for them.
  assert.match(css, /body\.popup \.actions button \{\s*\n\s*min-height: 2\.75rem;/);
});

test('the destructive confirmation asks in the reader’s language', () => {
  /**
   * The one genuinely irreversible action on the page, so the one place a
   * confirmation earns its place — and it was asking in English on a Dutch page.
   * `confirm()` never reaches `t()` on its own, which is why `missing()` had
   * never counted it and no scan had caught it.
   */
  assert.match(app, /confirm\(tr\('Delete every stored response/);
  const dict = read('../src/ui/i18n.js');
  assert.match(dict, /'Delete every stored response and re-download the full history from DEGIRO\?':/);
});

test('a tile note is translated once, where it is built', () => {
  /**
   * Tile notes had never reached `t()` at all, so `missing()` never counted them
   * and the Dutch page carried English under every figure. It surfaced because
   * US-54's score card was the first thing to put a note through the dictionary
   * — and then the fix produced its own defect: the card translated a note that
   * `buildTiles` had already translated, feeding a Dutch string back in and
   * having it counted as untranslated.
   *
   * So: notes are translated where they are composed, and the card takes them as
   * they come. The label is the other way round, because it is a bare key.
   */
  const build = app.slice(app.indexOf('function buildTiles'), app.indexOf('function renderTiles'));
  /**
   * What counts as untranslated is *prose*, not any literal. One note is
   * `${resultShare(…)} · ${period}` — two already-translated halves joined by a
   * separator, and wrapping that would ask the dictionary for a key made out of
   * a percentage. So the holes are stripped and whatever is left has to be
   * punctuation.
   */
  const rawNotes = [...build.matchAll(/note:\s*(`[^`]*`|'[^']*')/g)]
    .map((m) => m[1])
    .filter((n) => /[A-Za-z]/.test(n.replace(/\$\{[^}]*\}/g, '')));
  assert.deepEqual(rawNotes, [], `${rawNotes.length} tile note(s) carry prose the dictionary never sees`);
  assert.deepEqual(rawNotes, [], `${rawNotes.length} tile note(s) never reach the dictionary`);

  const score = app.slice(app.indexOf('function scoreModel'), app.indexOf('function shareTileChoices'));
  assert.match(score, /caption: tile\.note \|\| null,/, 'the card is translating an already-translated note');
  assert.match(score, /label: tr\(tile\.label\),/, 'the label is a bare key and does need translating');
});

// ===========================================================================
// US-66 / US-67 / US-68 — three defects the UI review found
// ===========================================================================

test('US-66 — a click or a drag is decided by the hand, not by the history', () => {
  /**
   * The old test was a span of **days**: below two days it was a click. Two days
   * is not a length of hand movement, it is a length of history, and the window
   * changes what it measures on screen — under a pixel on a five-year view, so a
   * click that wobbled zoomed the page; most of a centimetre on a three-week
   * window, so a deliberate drag was thrown away.
   *
   * Momentum made it worse rather than better, which is the part worth writing
   * down: a three-pixel twitch carries a velocity, the projection turns that
   * into a throw, and the day-span it lands on clears two days comfortably. So
   * the check has to happen *before* the projection, on the distance travelled.
   *
   * Browser-measured: a 3px wobble on ALL does nothing; a 40px drag inside a
   * one-month window zooms.
   */
  assert.match(gesture, /const wasClick = \(\) => travelPx < GESTURE\.dragThresholdPx;/);
  assert.ok(!/86400000/.test(gesture), 'the day-span threshold is back');
  const up = gesture.slice(gesture.indexOf("addEventListener('pointerup'"));
  assert.ok(
    up.indexOf('wasClick()') < up.indexOf('project(velocity)'),
    'the click test runs after the momentum, so a twitch can still be thrown',
  );
  // One number, in the file the other tuning constants live in.
  assert.match(read('../src/lib/config.js'), /dragThresholdPx: 8,/);
});

test('US-66 — the selection tracks past the edge of the plot instead of freezing', () => {
  // `indexAtX` is deliberately unclamped and `resist` decides what happens
  // outside; returning `null` out there is what made a drag to the edge look
  // like a hang. Browser-measured at 300px left of the plot: the moving edge
  // sits at -5.1, rubber-banded rather than stuck.
  assert.ok(!/x < area\.left \|\| x > area\.right/.test(gesture), 'the handler refuses to index outside the plot again');
  assert.match(css, /#c-value \{[\s\S]*?touch-action: none;/);
});

test('US-67 — a hover affordance is an enhancement, never the usable state', () => {
  /**
   * `button.snap` sat at `opacity: 0.45` and came up on `tr:hover`. On a pointer
   * with no hover that is permanent — a share button at 45 % is not "quiet", it
   * is a control claiming to be off, on the one device where there is no way to
   * find out otherwise. Measured with a touch context: opacity 1.
   */
  const snap = css.slice(css.indexOf('button.snap {'), css.indexOf('.sr-only {'));
  assert.ok(!/opacity: 0\.45/.test(snap.split('@media')[0]), 'the dimming is outside the hover query again');
  assert.match(snap, /@media \(hover: hover\) and \(pointer: fine\)/);
  // `:focus-visible` is how a keyboard reaches it and it stays inside the query,
  // because outside it there is nothing to reveal.
  assert.match(snap, /button\.snap:focus-visible/);
  // And the decorative rotate, which a tap used to leave stuck on.
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\n\s*\.frown-btn:hover/);
});

test('US-68 — reduced motion names what stops, and forces only that', () => {
  /**
   * It used to be `* { transition-duration: 0.01ms !important; animation-duration:
   * 0.01ms !important }`, which is short because it does not think: it also
   * silenced the colour change that is the only thing telling a reader their
   * press registered.
   *
   * The replacement forces a **property allowlist** rather than a duration. It
   * still needs `!important`, and the first attempt without it proved why — a
   * rule with its own `transition` shorthand wins on specificity, and the row
   * expander went on rotating under reduced motion.
   */
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  /*\n   * US-68'));
  // Comments stripped: the block quotes the rule it replaced, and matching that
  // would fail for the one reason that is not a regression.
  const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/transition-duration:\s*0\.01ms/.test(live), 'the sledgehammer is back');
  assert.match(block, /transition-property: background-color[^;]*!important;/);
  assert.match(block, /animation-name: none !important;/);
  // Browser-measured: pressed under reduced motion the surface still changes and
  // nothing transforms.
  assert.match(block, /button:active,[\s\S]{0,120}transform: none;/);
});

// ===========================================================================
// US-69 / US-70 — two curves, and four surfaces that come from somewhere
// ===========================================================================

test('US-69 — the curves and durations are named once, and every one has a caller', () => {
  /**
   * Four tokens, and AC3 is the interesting one: *a token with no caller is a
   * token nobody maintains*, which is the note already sitting above `--kpi` in
   * this stylesheet. So this counts callers rather than declarations — a token
   * that lands unused is deleted, not kept warm.
   */
  const root = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
  /**
   * `--ease-in-out` is deliberately **not** here. The refinement asked for it —
   * a curve for something moving across the screen — and nothing in this build
   * does: the overlays scale from an origin, a section rises in place, a figure
   * swaps, and the chart's edge is a spring. Defining it would have been the
   * one thing the story's own stop condition forbids.
   */
  assert.ok(!root.includes('--ease-in-out:'), 'a curve was defined with nothing to curve');
  for (const token of ['--ease-out', '--t-press', '--t-surface', '--t-surface-out']) {
    assert.ok(root.includes(`${token}:`), `${token} is not defined`);
    const callers = (css.match(new RegExp(`var\\(${token}\\)`, 'g')) ?? []).length;
    assert.ok(callers > 0, `${token} has no caller — rule 8 says delete it`);
  }
});

test('US-69 — no transition guesses its own curve any more', () => {
  /**
   * The defect was not that any one easing was wrong; it was that four of them
   * were unrelated, so the fifth would have been a fifth guess. `ease-out` in
   * particular is the wrong built-in for something arriving — it starts slowly,
   * at the moment the reader is looking hardest at it.
   */
  const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = [...live.matchAll(/transition:[^;]*;/g)]
    .map((m) => m[0])
    .filter((t) => /\b(ease|ease-in|ease-out|ease-in-out|linear)\b|cubic-bezier|\d+m?s/.test(t.replace(/var\(--[\w-]+\)/g, '')));
  assert.deepEqual(raw, [], `${raw.length} transition(s) still name their own curve or duration`);
});

test('US-70 — each overlay comes from the control that opened it', () => {
  // §7 in one line: a thing emerges from where it came from. Browser-measured
  // mid-flight at opacity 0.76 and scale 0.9927, with the origin resolving to
  // the foot of the rail.
  assert.match(css, /\.menu \{[\s\S]*?transform-origin: bottom left;/);
  assert.match(css, /\.gran \.menu \{[\s\S]*?transform-origin: top left;/);
  assert.match(css, /\.cols-pop \{[\s\S]*?transform-origin: top right;/);
  // Never from nothing — 0.97, not zero. Comments stripped, because the rule
  // that sets it says `scale(0)` in its own prose explaining why it does not.
  const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/scale\(0\)/.test(live), 'an overlay appears from nothing');
  assert.match(live, /transform: scale\(0\.97\);/);
});

test('US-70 — no timer decides when a surface is gone', () => {
  /**
   * `@starting-style` gives a from-state to an element that has just become
   * rendered, and `allow-discrete` holds `display` back long enough for the fade
   * out to finish. A JS class plus a `setTimeout` is the alternative, and it is a
   * class that stays stuck when something interrupts it.
   *
   * The doubt worth recording: `[hidden] { display: none !important }` looked
   * like it would defeat `allow-discrete`. It does not — importance decides the
   * value, transitions run after the cascade — and a browser confirmed it: at
   * 45 ms into the close the element is `hidden` and still `display: flex`.
   */
  assert.match(css, /@starting-style \{/);
  assert.match(css, /display var\(--t-surface\) allow-discrete/);
  assert.ok(!/setTimeout[^)]*(menu|cols-pop|closing)/i.test(app), 'a timer decides when an overlay is gone');
  // And `hidden` still means hidden at the end of it — a closed overlay that is
  // merely transparent still takes clicks, and that has shipped here before.
  assert.match(css, /\[hidden\] \{\s*\n\s*display: none !important;/);
});

test('US-70 — the backdrop fades with the sheet it belongs to', () => {
  // The grey layer is the largest thing on screen and it was the part that
  // snapped: the dialog materialized over a backdrop that had already arrived.
  // It is unreachable from script, so it fades from CSS on the same curve.
  assert.match(css, /\.modal::backdrop \{[\s\S]*?transition:/);
  assert.match(css, /@starting-style \{\s*\n\s*\.modal::backdrop \{\s*\n\s*opacity: 0;/);
});
