import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { OUTCOMES } from '../tools/trading212-r1/spike.js';
import { PROBE_URL, probeFromWorker } from '../tools/trading212-r1/probe.js';

/**
 * The service-worker half of US-37.
 *
 * What cannot be tested here is the only thing the probe exists to find out:
 * whether Trading 212 attaches a cookie to a request from a `chrome-extension://`
 * origin. What can be tested is everything around it — that the probe refuses
 * anything the gate refuses, that no value ever comes back, and that the three
 * pieces of the temporary permission are deleted together rather than
 * separately.
 */

const HOST = 'https://live.services.trading212.com';

/** A stand-in Response, only the parts the probe touches. */
const response = ({ status = 200, contentType = 'application/json', body = {}, type = 'basic', redirected = false } = {}) => ({
  status,
  type,
  redirected,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
  json: async () => body,
});

// --- the gate is in front of the request, not behind it ---------------------

test('a refused target is never fetched at all', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return response(); };

  for (const url of [
    'https://evil.example/rest/v1/accounts',
    `${HOST}/rest/v1/orders`,
    `${HOST}/rest/v1/accounts?accountId=1`,
    `http://live.services.trading212.com/rest/v1/accounts`,
  ]) {
    const out = await probeFromWorker({ url, fetchImpl });
    assert.ok(out.refused, `${url} should be refused`);
  }
  assert.equal(called, false, 'the gate runs before fetch, not after');
});

// --- what comes back ---------------------------------------------------------

test('a 200 JSON reports its shape and never a value', async () => {
  const out = await probeFromWorker({
    fetchImpl: async () => response({ body: { cash: { free: 1234.56, total: 9999.99 }, currencyCode: 'EUR', accountId: 7654321 } }), // leak-check: ok
  });
  assert.equal(out.outcome, OUTCOMES.PASS_JSON);
  assert.equal(out.status, 200);
  assert.equal(out.shape.cash.free, '<number>');
  assert.equal(out.shape.accountId, '<redacted:name-only>');

  const json = JSON.stringify(out);
  assert.ok(!json.includes('1234'), 'no amount');
  assert.ok(!json.includes('7654321'), 'no identifier'); // leak-check: ok
  assert.ok(!json.includes('EUR'), 'not even a currency code');
});

test('a 401 is reported as a 401 and carries no shape', async () => {
  // The likely worker result if their CORS refuses an extension origin, and it
  // has to be distinguishable from a network error — one means "they said no",
  // the other means "the request never landed".
  const out = await probeFromWorker({ fetchImpl: async () => response({ status: 401, contentType: '' }) });
  assert.equal(out.outcome, OUTCOMES.UNAUTHENTICATED);
  assert.equal(out.shape, undefined);
});

test('a login page with a 200 status is not recorded as success', async () => {
  const out = await probeFromWorker({ fetchImpl: async () => response({ contentType: 'text/html; charset=utf-8' }) });
  assert.equal(out.outcome, OUTCOMES.LOGIN_HTML);
  assert.equal(out.contentType, 'text/html', 'the charset is dropped as noise');
});

test('an opaque redirect is a redirect, not an unknown status', async () => {
  // `redirect: 'manual'` hands back status 0. Read by status alone that is
  // UNKNOWN, which would hide the most informative failure there is: being sent
  // to a login page.
  const out = await probeFromWorker({ fetchImpl: async () => response({ status: 0, type: 'opaqueredirect', contentType: '' }) });
  assert.equal(out.outcome, OUTCOMES.REDIRECTED);
});

test('a CORS refusal throws, and that is a network error rather than a crash', async () => {
  const out = await probeFromWorker({
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
  });
  assert.equal(out.outcome, OUTCOMES.NETWORK_ERROR);
  assert.equal(out.error, 'TypeError');
});

test('unparseable JSON behind a JSON content type does not throw', async () => {
  const out = await probeFromWorker({
    fetchImpl: async () => ({ ...response(), json: async () => { throw new SyntaxError('nope'); } }),
  });
  assert.equal(out.shape, '<unparseable-json>');
});

// --- one request, and no retry ----------------------------------------------

test('the probe makes exactly one request and never retries', async () => {
  // Rule 5: a retried 401 is indistinguishable from a login attempt, which is
  // the one thing a broker answers by locking the account.
  let n = 0;
  await probeFromWorker({ fetchImpl: async () => { n++; return response({ status: 401, contentType: '' }); } });
  assert.equal(n, 1);
});

test('the probe reads no cookie and stores nothing', async () => {
  const src = readFileSync(new URL('../tools/trading212-r1/probe.js', import.meta.url), 'utf8')
    .replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/chrome\.cookies|document\.cookie/.test(src), 'no cookie read');
  assert.ok(!/Authorization/.test(src), 'no Authorization header');
  assert.ok(!/indexedDB|chrome\.storage|setMeta|localStorage/.test(src), 'nothing stored');
});

// --- the three pieces are one unit ------------------------------------------

test('the probe, its message case and the host permission are deleted together', () => {
  /**
   * The failure this prevents is specific and quiet: the spike gets removed,
   * the manifest keeps `live.services.trading212.com`, and every user from then
   * on approves access to a host the extension never contacts. It reads as a
   * live integration and is not one.
   *
   * Asserted as an equivalence rather than a presence, so this test stays green
   * after a clean deletion and fails only on a half-done one.
   */
  const here = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const manifest = JSON.parse(here('../manifest.json'));
  const inManifest = manifest.host_permissions.some((h) => h.includes('trading212.com'));
  const inWorker = /case 't212r1'/.test(here('../src/sw.js'));
  let probeExists = true;
  try { here('../tools/trading212-r1/probe.js'); } catch { probeExists = false; }

  assert.equal(inManifest, inWorker, 'the manifest permission and the worker case must agree');
  assert.equal(inWorker, probeExists, 'the worker case and the probe file must agree');
});

test('the probe targets the endpoint the page half actually measured', () => {
  assert.equal(PROBE_URL, `${HOST}/rest/v1/accounts`);
});
