import test from 'node:test';
import assert from 'node:assert/strict';

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
    return await fn(calls);
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
