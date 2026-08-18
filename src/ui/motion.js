/**
 * The motion vocabulary: one spring, one momentum projection, one rubber-band.
 *
 * US-55 and US-63 are the same gesture on the same surface — one sets a window,
 * the other releases it — and the refinement says to build them together for the
 * reason that matters: the spring, the velocity history and the day-snap are
 * shared, and doing them twice is how the two drift apart. So they are here,
 * once, and the chart code holds none of it.
 *
 * The prototype (`docs/prototypes/apple-fluid.html` on `claude/apple-fluid-poc`)
 * is what the owner signed off on; this is that spring with its reasoning
 * written down rather than a second attempt at the feel.
 *
 * **No animation library.** MV3's CSP forbids a remote script and the extension
 * is offline by design, so anything here would have to be vendored — and this is
 * thirty lines. The prototype's Google-Fonts link is a prototype convenience and
 * deliberately does not come with it.
 */

/**
 * A critically-damped spring, driven by rAF, interruptible mid-flight.
 *
 * Critically damped (`damping = 1`) by default and that is a decision rather
 * than a default: an overshoot on a *window* would run past the day you released
 * on and come back, which reads as the control disagreeing with you. The bounce
 * belongs on things being thrown, not on things being aimed.
 *
 * Three properties earn their place:
 *
 *  - **It animates from the presentation value.** `x` is where the thing is on
 *    screen this frame, never where it is going. A new `set()` mid-flight keeps
 *    the current `x` and `v`, so a grab reverses from where the eye last saw it
 *    instead of jumping to the target — the one thing an interruptible animation
 *    must not do.
 *  - **It accepts a velocity.** Handing the release velocity in is what removes
 *    the seam between dragging and settling: the finger lets go and the motion
 *    is already going that fast.
 *  - **It stops.** The rAF is cancelled once the spring is within a fifth of a
 *    frame of rest, so an idle page runs no animation loop at all.
 *
 * `dt` is clamped: a backgrounded tab resumes with a several-second frame delta,
 * and an unclamped integration step turns that into a spring that explodes.
 */
export class Spring {
  constructor(value, { response = 0.42, damping = 1, restDistance = 0.01 } = {}) {
    this.x = value;
    this.target = value;
    this.v = 0;
    this.response = response;
    this.damping = damping;
    /**
     * How close counts as arrived, **in the caller's units**, and it has to be
     * set by the caller because only the caller knows what a unit is worth.
     *
     * A critically-damped spring approaches asymptotically: it is within a
     * thousandth almost at once and never exactly there. Left at a distance that
     * is meaningless on screen it keeps running, and anything waiting for
     * `onRest` waits with it — which is how the brush ended up applying its
     * window most of a second after the finger left. In day indices, a
     * twentieth of a day is invisible and the window rounds to a whole day
     * anyway; in pixels it would be a very different number.
     */
    this.restDistance = restDistance;
    this.onUpdate = null;
    this.onRest = null;
    this._raf = null;
    this._last = 0;
  }

  /** Aim at a new target, optionally arriving with a velocity already. */
  set(target, { velocity = null } = {}) {
    this.target = target;
    if (velocity !== null) this.v = velocity;
    this._start();
  }

  /** Be somewhere, now, with no motion. The reduced-motion path and the grab. */
  snap(value) {
    this.stop();
    this.x = value;
    this.target = value;
    this.v = 0;
    this.onUpdate?.(this.x);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  get running() {
    return this._raf !== null;
  }

  _start() {
    if (this._raf) return;
    this._last = now();
    this._raf = requestAnimationFrame(() => this._frame());
  }

  _frame() {
    const t = now();
    const dt = Math.min(0.032, (t - this._last) / 1000) || 0.016;
    this._last = t;
    const done = this.step(dt);
    this.onUpdate?.(this.x);
    if (done) {
      this._raf = null;
      this.onRest?.(this.x);
      return;
    }
    this._raf = requestAnimationFrame(() => this._frame());
  }

  /**
   * One integration step. Separated from the frame loop so the physics can be
   * tested without a browser — a spring nobody can run in a test is a spring
   * whose damping is an assertion in a comment.
   *
   * Returns true once it has come to rest, having placed itself exactly on the
   * target: settling *near* it leaves a permanent sub-pixel error, and on a day
   * index that is a window off by a fraction of a day forever.
   */
  step(dt) {
    const omega = (2 * Math.PI) / this.response;
    const a = -(omega * omega) * (this.x - this.target) - 2 * this.damping * omega * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    /**
     * Both conditions cross together by construction: for a critically-damped
     * spring the speed near the end is about `ω` times the distance, so deriving
     * the velocity threshold from the distance one means `restDistance` alone
     * decides when it is done. Two independently-chosen thresholds is how one of
     * them ends up being the only one that ever fires.
     */
    const w = (2 * Math.PI) / this.response;
    if (Math.abs(this.x - this.target) < this.restDistance && Math.abs(this.v) < this.restDistance * w) {
      this.x = this.target;
      this.v = 0;
      return true;
    }
    return false;
  }
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

/**
 * Where a flick is going: the resting point of a velocity under exponential
 * decay, which is the projection Apple's scroll views use.
 *
 * `v` is units per second. The deceleration constant is the standard one; the
 * only thing worth knowing about it is that it makes the projection roughly half
 * a second of travel, which is why a flick throws a window noticeably further
 * than the release point without throwing it off the end of the history.
 */
export const project = (v, deceleration = 0.998) => (v / 1000) * (deceleration / (1 - deceleration));

/**
 * Progressive resistance past an edge.
 *
 * `overflow` is how far past, `dim` the size of the surface. The result grows
 * ever more slowly, so the edge of the history feels like an edge — it can be
 * pushed and it pushes back — rather than a freeze, which reads as the control
 * having stopped responding. The result approaches `dim` and never reaches it,
 * so no amount of pulling drags the end of the history into the distance.
 */
export const rubber = (overflow, dim, c = 0.55) => (overflow * dim * c) / (dim + c * Math.abs(overflow));

/**
 * Whether to skip the settle.
 *
 * Reduced motion drops the *overshoot and the glide*, never the tracking: a
 * brush following your finger is direct control, not vestibular motion, and
 * removing it would take the feature away rather than soften it. Read per call
 * rather than cached — the setting can change while the page is open, and a
 * cached answer would need an invalidation nobody would write.
 */
export const prefersReducedMotion = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The velocity of a gesture, from a short trail of samples.
 *
 * Over a window rather than the last two points: pointer events arrive faster
 * than the screen updates and two adjacent samples can be a millisecond apart,
 * which turns rounding into a velocity of thousands. The window is short enough
 * that a flick at the end of a slow drag still reads as a flick.
 */
export function velocityFrom(samples, windowMs = 90) {
  if (!samples || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (let i = samples.length - 1; i >= 0; i--) {
    first = samples[i];
    if (last.t - samples[i].t >= windowMs) break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return 0;
  return (last.v - first.v) / dt;
}

/**
 * US-56 — a press that is dragged away from is a press that was cancelled.
 *
 * CSS `:active` gets the first half right and the second half wrong. A control
 * highlights the instant it is pressed, which is the point — waiting for `click`
 * to show anything is the latency Apple calls "a cliff". But a mouse button held
 * down keeps `:active` on the element it started on **even after the pointer has
 * left it**, because the browser implicitly captures the pointer there. So a
 * button you pressed and then slid off stayed lit, looking armed, while the
 * click it would have fired had already been abandoned.
 *
 * The behaviour was never wrong — a `click` only fires when press and release
 * land on the same element — but the *feedback* disagreed with it, and the whole
 * reason cancel-by-dragging-away exists is that it is how you get out of a press
 * you did not mean. A control that keeps saying "yes" while you are backing out
 * teaches you not to trust it.
 *
 * So: one delegated listener, and CSS keeps `:active`. It marks a press as
 * cancelled rather than replacing the mechanism, which means the keyboard path —
 * Space and Enter on a focused button, where there is no pointer at all — is
 * untouched and still shows the same feedback.
 *
 * `elementFromPoint` rather than `pointerleave`, and that is forced: implicit
 * capture routes every move to the pressed element, so it never gets a leave
 * event to listen for. Re-entering re-arms, because *"drags away and does not
 * come back"* is the condition, not "drags away".
 */
export function wirePressFeedback(root = document) {
  const CANCELLED = 'press-cancelled';
  let armed = null;

  const release = () => {
    armed?.classList.remove(CANCELLED);
    armed = null;
  };

  root.addEventListener('pointerdown', (e) => {
    const el = e.target?.closest?.('button, summary, [role="menuitem"]');
    armed = el && !el.disabled ? el : null;
    armed?.classList.remove(CANCELLED);
  }, true);

  root.addEventListener('pointermove', (e) => {
    if (!armed) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    armed.classList.toggle(CANCELLED, !(over && armed.contains(over)));
  }, true);

  for (const kind of ['pointerup', 'pointercancel', 'dragstart']) {
    root.addEventListener(kind, release, true);
  }
}
