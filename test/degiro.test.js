import test from 'node:test';
import assert from 'node:assert/strict';

import { RATE } from '../src/lib/config.js';

/**
 * The network layer, tested against a stand-in `fetch`.
 *
 * A coverage run put `degiro.js` at 5.9 % of its functions and `session.js` at
 * **zero** — not one of them had ever been executed by a test. The reason given
 * in CLAUDE.md is that this layer needs a logged-in browser, and that is true
 * of the *sync as a whole*. It is not true of the rules this file enforces:
 * that requests are spaced out, that a 401 is never retried, that a socket
 * which never answers does not wedge the queue, and that an HTML login page
 * returned with a 200 is recognised as an expired session rather than parsed as
 * data. Every one of those is a decision about a response, and a response can
 * be handed to it.
 *
 * These are the account-safety rules. SPEC §6 calls hammering the endpoints a
 * real risk to the account, and CLAUDE.md rule 5 says retrying a 401 looks like
 * a login attempt. Both were enforced by code nobody had run.
 */

/** Replace global fetch for one test, and put it back afterwards. */
async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, at: Date.now() });
    return impl(String(url), init, calls.length);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}

const ok = (body = '{}') => new Response(body, { status: 200 });
const status = (code, body = '') => new Response(body, { status: code });

// Imported after the helpers so the module picks up whatever fetch is current
// at call time rather than at import time.
const degiro = await import('../src/lib/degiro.js');

test('401 is not retried — a dead cookie is not a transient failure', async () => {
  await withFetch(() => status(401), async (calls) => {
    await assert.rejects(
      () => degiro.throttledFetch('https://trader.degiro.nl/x'),
      (e) => e.name === 'SessionExpiredError',
    );
    assert.equal(calls.length, 1, 'exactly one attempt; retrying looks like a login attempt');
  });
});

test('403 is not retried either', async () => {
  await withFetch(() => status(403), async (calls) => {
    await assert.rejects(() => degiro.throttledFetch('https://trader.degiro.nl/x'));
    assert.equal(calls.length, 1);
  });
});

test('a 404 is reported rather than retried', async () => {
  await withFetch(() => status(404, 'nope'), async (calls) => {
    await assert.rejects(
      () => degiro.throttledFetch('https://trader.degiro.nl/x'),
      (e) => e.name === 'DegiroHttpError' && e.status === 404,
    );
    assert.equal(calls.length, 1, 'a 404 is not transient');
  });
});

test('a 500 is retried, up to the budget, and then reported', async () => {
  await withFetch(() => status(500), async (calls) => {
    await assert.rejects(
      () => degiro.throttledFetch('https://trader.degiro.nl/x', {}, { retries: 2 }),
      (e) => e.name === 'DegiroHttpError' && e.status === 500,
    );
    assert.equal(calls.length, 3, 'the first attempt plus two retries');
  });
});

test('a 429 is treated as transient, because it is', async () => {
  let n = 0;
  await withFetch(() => (++n < 2 ? status(429) : ok('{"ok":true}')), async (calls) => {
    const res = await degiro.throttledFetch('https://trader.degiro.nl/x', {}, { retries: 2 });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 2);
  });
});

test('requests are spaced out, and parallel callers cannot defeat it', async () => {
  // The rule that protects the account. Three callers firing at once must still
  // leave the configured interval between the requests that reach the network.
  await withFetch(() => ok(), async (calls) => {
    const started = Date.now();
    await Promise.all([
      degiro.throttledFetch('https://trader.degiro.nl/a'),
      degiro.throttledFetch('https://trader.degiro.nl/b'),
      degiro.throttledFetch('https://trader.degiro.nl/c'),
    ]);
    const spent = Date.now() - started;
    assert.ok(
      spent >= RATE.minIntervalMs * 2 - 50,
      `three requests took ${spent}ms, expected at least ${RATE.minIntervalMs * 2}ms of spacing`,
    );
    for (let i = 1; i < calls.length; i++) {
      const gap = calls[i].at - calls[i - 1].at;
      assert.ok(gap >= RATE.minIntervalMs - 50, `gap ${gap}ms between request ${i} and ${i + 1}`);
    }
  });
});

test('a rejected request does not wedge the queue behind it', async () => {
  // There is one module-global chain. If a failure broke it, every later
  // request would hang forever and the sync would sit on "Syncing…".
  let n = 0;
  await withFetch(() => (++n === 1 ? status(404) : ok('{"after":true}')), async () => {
    await assert.rejects(() => degiro.throttledFetch('https://trader.degiro.nl/first'));
    const res = await degiro.throttledFetch('https://trader.degiro.nl/second');
    assert.equal(res.status, 200, 'the queue kept running after a failure');
  });
});

test('a login page returned with a 200 is an expired session, not data', async () => {
  // DEGIRO answers a timed-out session with an HTML page and a 200. Parsed as
  // JSON that is a crash; read correctly it is "log in again".
  await withFetch(() => ok('<html><body>Please log in</body></html>'), async () => {
    await assert.rejects(
      () => degiro.fetchUpdate({ intAccount: 1, sessionId: 'x' }),
      (e) => e.name === 'SessionExpiredError',
    );
  });
});

test('an unparseable response names the endpoint but not the query string', async () => {
  // The message reaches a bug report, and the query string carries the session id.
  await withFetch(() => ok('not json at all'), async () => {
    await assert.rejects(
      () => degiro.fetchUpdate({ intAccount: 1, sessionId: 'SECRET' }),
      (e) => {
        assert.match(e.message, /Unparseable response/);
        assert.doesNotMatch(e.message, /SECRET/, 'the session id must not travel in an error');
        return true;
      },
    );
  });
});

test('a network failure names the host it could not reach', async () => {
  await withFetch(() => {
    throw new TypeError('Failed to fetch');
  }, async () => {
    await assert.rejects(
      () => degiro.throttledFetch('https://trader.degiro.nl/x'),
      (e) => /trader\.degiro\.nl/.test(e.message),
    );
  });
});

test('an empty product list makes no request at all', async () => {
  await withFetch(() => ok(), async (calls) => {
    const res = await degiro.fetchProductsInfo({ intAccount: 1, sessionId: 'x', productIds: [] });
    assert.deepEqual(res, { data: {} });
    assert.equal(calls.length, 0, 'asking about nothing is not worth a request');
  });
});

test('the product lookup posts a bare array of ids, as DEGIRO expects', async () => {
  await withFetch(() => ok('{"data":{}}'), async (calls) => {
    await degiro.fetchProductsInfo({ intAccount: 1, sessionId: 'x', productIds: [1, '2'] });
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), ['1', '2'], 'ids as strings, no envelope');
  });
});

test('the config endpoint failing degrades to the documented defaults', async () => {
  // A config outage must not stop a sync; it falls back and records that it did.
  await withFetch(() => status(500), async () => {
    const urls = await degiro.fetchUrls();
    assert.equal(urls.discovered, false, 'and it says so, which diagnose.js reports');
    assert.match(urls.trading, /^https:\/\/trader\.degiro\.nl\//);
  });
});

test('every request carries credentials, or the session cookie never goes', async () => {
  await withFetch(() => ok(), async (calls) => {
    await degiro.throttledFetch('https://trader.degiro.nl/x');
    assert.equal(calls[0].init.credentials, 'include');
  });
});

test('an error message carries neither the session id nor the account number', () => {
  // Found by the test above rather than by reading the code: the /update
  // endpoint puts the session id in a path segment, `…/update/1;jsessionid=x`,
  // so stripping the query string left it there. These messages land in
  // `lastError`, which is exportable, which is the file people send each other.
  const dirty = 'https://trader.degiro.nl/trading/secure/v5/update/1234567;jsessionid=SECRET?portfolio=0';
  const clean = degiro.safeUrl(dirty);
  assert.doesNotMatch(clean, /SECRET/);
  assert.doesNotMatch(clean, /1234567/);
  assert.match(clean, /^https:\/\/trader\.degiro\.nl\/trading\/secure\/v5\/update\//);
});

test('every typed error uses it, not just the one that was noticed', () => {
  const url = 'https://trader.degiro.nl/reporting/secure/v6/accountoverview?sessionId=SECRET&intAccount=1234567';
  for (const e of [
    new degiro.DegiroHttpError(502, url, ''),
    new degiro.RequestTimeoutError(url, 30000),
  ]) {
    assert.doesNotMatch(e.message, /SECRET/, e.name);
    assert.doesNotMatch(e.message, /1234567/, e.name);
  }
});
