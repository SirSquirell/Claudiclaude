import { mock } from 'node:test';

/**
 * Run `fn` with `setTimeout` and `Date` faked, advancing the clock whenever the
 * code under test asks to sleep.
 *
 * US-80. `npm test` spent about 31 of its 55 seconds inside one test and
 * another 20 across a dozen more, none of it computing: every outbound request
 * goes through `throttledFetch`, which spaces requests 1,1 s apart and backs
 * off `2ⁿ` seconds on a 5xx (`degiro.js`), and the tests drove that schedule
 * through the real event loop. The waiting was the point of the code and beside
 * the point of the test.
 *
 * Two decisions worth keeping:
 *
 *  - **`Date` is faked as well as `setTimeout`.** The queue measures its own
 *    spacing with `Date.now()`, so faking only the timer would leave the code
 *    comparing a frozen clock against a moving deadline and sleeping forever.
 *    It also keeps the spacing assertions meaningful rather than merely fast:
 *    they still read the clock the code itself waited on, and now
 *    deterministically.
 *  - **The clock is advanced in small steps, not jumped to the end.** A single
 *    huge tick would satisfy every pending timer at once and a wrong backoff
 *    schedule would still pass. In 100 ms steps a request that should be spaced
 *    1,1 s apart still measures ~1,1 s apart.
 *
 * `apis` deliberately does not include `setInterval`: `sw.js`'s alarms are
 * Chrome's, not the event loop's, and nothing in these tests wants them faked.
 */
/**
 * Let everything the tick released actually run.
 *
 * `mock.timers.tick()` is synchronous — it fires the callbacks and returns, so
 * the promises they resolve are still queued. `setImmediate` is deliberately not
 * one of the faked APIs, which makes it the one turn of the loop that still
 * happens for real: two of them drain the microtask queue plus anything reading
 * a `Response` body, which is stream I/O rather than a bare promise.
 */
const flush = async () => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

export async function underFakeClock(fn, { stepMs = 100, maxSteps = 4000 } = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  let settled = false;
  const done = Promise.resolve()
    .then(fn)
    .then(
      (v) => { settled = true; return v; },
      (e) => { settled = true; throw e; },
    );
  // Swallow here and rethrow through `done` below, so a rejection cannot become
  // an unhandled one while the loop is still ticking.
  done.catch(() => {});
  try {
    for (let i = 0; i < maxSteps && !settled; i++) {
      await flush();
      if (settled) break;
      mock.timers.tick(stepMs);
    }
    await flush();
    if (!settled) {
      throw new Error(
        `the work under the fake clock did not finish within ${(stepMs * maxSteps) / 1000}s of fake time`,
      );
    }
    return await done;
  } finally {
    mock.timers.reset();
  }
}
