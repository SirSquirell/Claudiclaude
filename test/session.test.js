import test from 'node:test';
import assert from 'node:assert/strict';

import { underFakeClock } from './fake-clock.js';

/**
 * Session discovery and the connection check.
 *
 * Coverage put `session.js` at **zero percent of its functions** — nothing in
 * it had ever run in a test — and `diagnose.js` did not appear in the report at
 * all, because no test imports it. That second one matters more than it looks:
 * the diagnostics output is the one thing in this project explicitly designed
 * to be handed to a stranger, and T-1 in the backlog said it should be the one
 * with a test asserting what it carries. It never got one.
 *
 * Neither module needs a browser to be tested. They need a cookie jar and a
 * `fetch`, and both can be handed to them.
 */

/** A stand-in for the two globals this layer reads. */
async function withBrowser({ cookie = 'JSESSIONID-VALUE', responses = {} }, fn) {
  const realChrome = globalThis.chrome;
  const realFetch = globalThis.fetch;
  const calls = [];

  globalThis.chrome = {
    cookies: {
      get: async ({ name }) => (cookie && name === 'JSESSIONID' ? { value: cookie } : null),
    },
  };
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    for (const [fragment, make] of Object.entries(responses)) {
      if (u.includes(fragment)) return make();
    }
    return new Response('{}', { status: 200 });
  };

  try {
    // US-80: under a fake clock, because `throttledFetch`'s 1,1 s of spacing is
    // on the path of every check in this file and none of it needs waiting out.
    return await underFakeClock(() => fn(calls));
  } finally {
    globalThis.chrome = realChrome;
    globalThis.fetch = realFetch;
  }
}

const json = (o) => () => new Response(JSON.stringify(o), { status: 200 });
const code = (n) => () => new Response('', { status: n });

// `resolveSession` caches identifiers in the meta store, so the store needs to
// work. ES module exports cannot be reassigned, and they should not be: with a
// key-value store standing in, this exercises the real `store.js` too.
import { installFakeIndexedDb } from './fake-indexeddb.js';

installFakeIndexedDb();
const session = await import('../src/lib/session.js');
const diagnose = await import('../src/lib/diagnose.js');
const store = await import('../src/lib/store.js');

/** Empty the meta store between tests without reopening the database. */
const clearMeta = async () => {
  for (const row of await store.getAll('meta')) await store.setMeta(row.key, undefined);
};

test('no cookie means "log in", and nothing is requested', async () => {
  await withBrowser({ cookie: null }, async (calls) => {
    const r = await session.resolveSession();
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-cookie');
    assert.equal(calls.length, 0, 'not one request without a session to make it with');
  });
});

test('every reason has a message a person can act on', () => {
  // A reason with no message renders as blank in the popup, which reads as the
  // extension being broken rather than as "log in".
  for (const reason of ['no-cookie', 'expired', 'client-endpoint-shape', 'client-error', 'error']) {
    const msg = session.SESSION_MESSAGES[reason];
    assert.ok(msg && msg.length > 10, `${reason} has no usable message`);
  }
});

test('a 401 while resolving is reported as expired, not as a generic error', async () => {
  await clearMeta();
  await withBrowser({ responses: { '/pa/secure/client': code(401) } }, async () => {
    const r = await session.resolveSession({ refresh: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'expired', 'the popup says "log in", which is the actionable one');
  });
});

test('a client response without intAccount is called out as a shape change', async () => {
  // Not "an error": the endpoint answered, and what it answered no longer has
  // the field. That distinction is what tells us DEGIRO changed something.
  await clearMeta();
  await withBrowser({ responses: { '/pa/secure/client': json({ data: { id: 'tok' } }) } }, async () => {
    const r = await session.resolveSession({ refresh: true });
    assert.equal(r.reason, 'client-endpoint-shape');
  });
});

test('identifiers are cached, and the session id never is', async () => {
  await clearMeta();
  await withBrowser(
    { responses: { '/pa/secure/client': json({ data: { intAccount: 42, id: 'tok', displayName: 'X' } }) } }, // leak-check: ok — invented
    async () => {
      const r = await session.resolveSession({ refresh: true });
      assert.equal(r.ok, true);
      assert.equal(r.intAccount, 42);
      assert.equal(await store.getMeta('intAccount'), 42, 'stable for the life of the account, so cached');
      assert.equal(await store.getMeta('sessionId'), null, 'read per request, never written down');
    },
  );
});

test('checkSession turns an expired session into a reason rather than throwing', async () => {
  await withBrowser({ responses: { '/v5/update/': code(401) } }, async () => {
    const r = await session.checkSession({ intAccount: 1, sessionId: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'expired');
  });
});

// ---------------------------------------------------------------------------
// diagnose.js — the output meant for a stranger
// ---------------------------------------------------------------------------

test('the connection report carries no session id, account number or amount', async () => {
  // T-1 asked for exactly this test and it was never written. The report is
  // pasted into bug reports by people who are not going to read it first.
  await clearMeta();
  await withBrowser(
    {
      cookie: 'SESSIONCOOKIEVALUE',
      responses: {
        // Invented, and identity-shaped on purpose: this test exists to prove none
        // of it survives into the report. leak-check: ok
        '/pa/secure/client': json({ data: { intAccount: 7654321, id: 'USERTOKEN', displayName: 'A Person Name' } }), // leak-check: ok
        '/v5/update/': json({ portfolio: { value: [] }, totalPortfolio: { value: [{ name: 'total', value: 1234.56 }] } }),
      },
    },
    async () => {
      const report = await diagnose.runDiagnostics();
      const text = JSON.stringify(report);
      assert.doesNotMatch(text, /SESSIONCOOKIEVALUE/, 'the cookie value');
      assert.doesNotMatch(text, /USERTOKEN/, 'the user token');
      assert.doesNotMatch(text, /7654321/, 'the account number'); // leak-check: ok
      assert.doesNotMatch(text, /A Person Name/, 'the account holder');
      assert.doesNotMatch(text, /1234\.56/, 'an amount');
      assert.ok(Array.isArray(report.steps) && report.steps.length, 'and it still reports the steps');
    },
  );
});

test('US-81 — the check names the cash field it used and says whether it is the whole balance', async () => {
  /**
   * The mechanism this is here to catch: DEGIRO states no account total, so the
   * anchor is its position values plus one cash field picked from three
   * candidates — and if the balance is split across `EUR` and `FLATEX_EUR` in
   * `cashFunds`, the field picked may be one part of it. The anchor is then short
   * and it looks exactly like a small error in our own ledger, with a completely
   * different fix. `totalFieldsSeen` has always listed the names; nothing said
   * which one was used or whether it added up.
   *
   * A verdict, and no amounts: the comparison happens inside `diagnose.js` and
   * only its conclusion leaves. This whole file exists because that output is
   * meant to be pasted into a bug report.
   */
  await clearMeta();
  await withBrowser(
    {
      responses: {
        '/pa/secure/client': json({ data: { intAccount: 1, id: 'T' } }),
        '/v5/update/': json({
          portfolio: { value: [] },
          totalPortfolio: { value: [{ name: 'total', value: 500 }, { name: 'totalCash', value: 300 }] },
          // 300 stated, 500 actually there: the split balance, in one response.
          cashFunds: { value: [
            { currencyCode: 'EUR', value: 300 },
            { currencyCode: 'FLATEX_EUR', value: 200 },
          ] },
        }),
      },
    },
    async () => {
      const report = await diagnose.runDiagnostics();
      const step = report.steps.find((s) => s.name === 'update');
      assert.equal(step.cashKey, 'totalCash', 'which of the three candidates carried the balance');
      assert.deepEqual(step.cashFundsCurrencies, ['EUR', 'FLATEX_EUR'], 'and what the response actually held');
      assert.equal(step.cashVerdict, 'short', 'the stated total is one part of a split balance');
      // Values, not substrings — an HTTP 200 is not two hundred euro.
      const values = new Set();
      (function walk(v) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
        else values.add(v);
      })(report.steps.map(({ status, ...rest }) => rest));
      for (const amount of [300, 200, 500]) {
        assert.ok(!values.has(amount), `${amount} travelled as a value`);
      }
    },
  );
});

test('US-81 — a single euro balance that adds up says so', async () => {
  await clearMeta();
  await withBrowser(
    {
      responses: {
        '/pa/secure/client': json({ data: { intAccount: 1, id: 'T' } }),
        '/v5/update/': json({
          portfolio: { value: [] },
          totalPortfolio: { value: [{ name: 'total', value: 42 }, { name: 'totalCash', value: 42 }] },
          cashFunds: { value: [{ currencyCode: 'EUR', value: 42 }] },
        }),
      },
    },
    async () => {
      const step = (await diagnose.runDiagnostics()).steps.find((s) => s.name === 'update');
      assert.equal(step.cashVerdict, 'agrees');
    },
  );
});

test('the connection report says which step broke', async () => {
  await clearMeta();
  await withBrowser({ responses: { '/v5/update/': code(500) } }, async () => {
    const report = await diagnose.runDiagnostics();
    assert.equal(report.ok, false);
    const failed = report.steps.filter((s) => !s.ok);
    assert.ok(failed.length, 'a failure names a step rather than saying "an error occurred"');
  });
});

test('no cookie is reported as a step failure, not a crash', async () => {
  await clearMeta();
  await withBrowser({ cookie: null }, async () => {
    const report = await diagnose.runDiagnostics();
    assert.equal(report.ok, false);
    assert.ok(report.summary && report.summary.length > 0);
  });
});

// ---------------------------------------------------------------------------
// The cluster is re-read, never trusted from cache
// ---------------------------------------------------------------------------

/**
 * A real account sits on `/portfolio-reports/secure/` while a cached `urls`
 * still said `/reporting/secure/`. Every reporting call went to the wrong base
 * and DEGIRO answered 502, so the sync failed on every attempt — while the
 * connection check, which fetches config fresh, reported a healthy 200 two
 * lines further down the same screen.
 *
 * A cached value that is wrong is worse than no cache: it fails in a way that
 * looks like the other end being broken.
 */
test('resolveSession re-reads the cluster even when one is cached', async () => {
  await clearMeta();
  await store.setMeta('intAccount', 123);
  await store.setMeta('userToken', 456);
  // A poisoned cache, exactly as an existing install carries today.
  await store.setMeta('urls', {
    trading: 'https://trader.degiro.nl/trading/secure/',
    reporting: 'https://trader.degiro.nl/reporting/secure/',
  });

  const out = await withBrowser(
    {
      responses: {
        '/login/secure/config': json({
          data: {
            tradingUrl: 'https://trader.degiro.nl/trading/secure/',
            reportingUrl: 'https://trader.degiro.nl/portfolio-reports/secure/',
          },
        }),
        '/client': json({ data: { intAccount: 123, id: 456 } }),
      },
    },
    async (calls) => {
      const r = await session.resolveSession();
      assert.ok(
        calls.some((u) => u.includes('/login/secure/config')),
        'config was never fetched, so a stale cluster would go unnoticed',
      );
      return r;
    },
  );

  assert.equal(out.ok, true);
  assert.equal(
    out.urls.reporting,
    'https://trader.degiro.nl/portfolio-reports/secure/',
    'the stale cache won, which is the 502 this fixes',
  );
});
