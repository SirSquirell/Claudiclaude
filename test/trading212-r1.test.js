import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALLOWED_ORIGINS, READ_PATHS, OUTCOMES,
  validateTarget, classify, describeShape, classifyHeader, verdict,
} from '../tools/trading212-r1/spike.js';

/**
 * The pure half of US-37.
 *
 * The experiment itself is two lines in a browser console and cannot be tested
 * here. What can be — and what decides whether the *result* is safe to paste —
 * is the gate in front of the request and the shape description behind it.
 */

// --- the gate ---------------------------------------------------------------

const GOOD = 'https://live.services.trading212.com/rest/v1/accounts';

test('only GET, and only over https', () => {
  assert.equal(validateTarget({ method: 'GET', url: GOOD }).ok, true);
  for (const m of ['POST', 'DELETE', 'PUT', 'HEAD', undefined]) {
    assert.equal(validateTarget({ method: m, url: GOOD }).reason, 'method-not-get');
  }
  assert.equal(
    validateTarget({ method: 'GET', url: GOOD.replace('https', 'http') }).reason,
    'not-https',
  );
});

test('an origin nobody measured is refused', () => {
  assert.equal(
    validateTarget({ method: 'GET', url: 'https://evil.example/rest/v1/accounts' }).reason,
    'origin-not-allowed',
  );
  // Including other Trading 212 hosts. Measured means measured.
  assert.equal(
    validateTarget({ method: 'GET', url: 'https://live.trading212.com/rest/v1/accounts' }).reason,
    'origin-not-allowed',
  );
});

test('a path nobody registered is refused, and a registered one says how it is known', () => {
  assert.equal(
    validateTarget({ method: 'GET', url: `${ALLOWED_ORIGINS[0]}/rest/v1/orders` }).reason,
    'path-not-registered',
  );
  // `GOOD` is measured as of 2026-08-25 — the web app requests it (§8g). The
  // reports paths are the ones still taken from community code, so they are
  // what this assertion has to be made against to stay meaningful.
  assert.equal(
    validateTarget({ method: 'GET', url: `${ALLOWED_ORIGINS[0]}/rest/reports/transactions` }).evidence,
    'hypothesis',
  );
  assert.equal(validateTarget({ method: 'GET', url: GOOD }).evidence, 'measured');
  assert.equal(
    validateTarget({ method: 'GET', url: `${ALLOWED_ORIGINS[0]}/charting/v1/eq/ohlc/ONE_DAY` }).evidence,
    'measured',
  );
});

test('credentials in a URL are refused before anything else looks at it', () => {
  // They would end up in a log, which is the whole reason this check exists.
  assert.equal(
    validateTarget({ method: 'GET', url: 'https://user:pw@live.services.trading212.com/rest/v1/accounts' }).reason,
    'credentials-in-url',
  );
});

test('any query at all is a refusal, not a filter', () => {
  // A parameter nobody registered is a parameter nobody has reasoned about.
  assert.equal(validateTarget({ method: 'GET', url: `${GOOD}?accountId=1` }).reason, 'unexpected-query');
  assert.equal(validateTarget({ method: 'GET', url: `${GOOD}?harmless=1` }).reason, 'unexpected-query');
});

test('every registered path is marked measured or hypothesis, and nothing else', () => {
  // A third value would be a category nobody defined, and the difference
  // between the two decides what may be built on.
  for (const [path, how] of Object.entries(READ_PATHS)) {
    assert.ok(['measured', 'hypothesis'].includes(how), `${path} is marked "${how}"`);
  }
});

// --- classification ---------------------------------------------------------

test('a login page served with status 200 is not success', () => {
  // The case that matters most: it looks like a pass and is not.
  assert.equal(classify({ status: 200, contentType: 'text/html' }), OUTCOMES.LOGIN_HTML);
  assert.equal(classify({ status: 200, contentType: 'application/json' }), OUTCOMES.PASS_JSON);
});

test('each failure mode is told apart, because they mean different things', () => {
  assert.equal(classify({ status: 401 }), OUTCOMES.UNAUTHENTICATED);
  assert.equal(classify({ status: 403 }), OUTCOMES.FORBIDDEN);
  assert.equal(classify({ status: 429 }), OUTCOMES.RATE_LIMITED);
  assert.equal(classify({ status: 302 }), OUTCOMES.REDIRECTED);
  assert.equal(classify({ status: 200, contentType: 'application/json', redirected: true }), OUTCOMES.REDIRECTED);
  assert.equal(classify({ threw: true }), OUTCOMES.NETWORK_ERROR);
  assert.equal(classify({ status: 418 }), OUTCOMES.UNKNOWN);
});

// --- what may leave ---------------------------------------------------------

test('a shape travels and a value never does', () => {
  const shape = describeShape({ cash: 1234.56, currency: 'EUR', positions: [{ ticker: 'AAPL_US_EQ', qty: 3 }] });
  const json = JSON.stringify(shape);
  assert.ok(!json.includes('1234'), 'no amount');
  assert.ok(!json.includes('AAPL'), 'no instrument');
  assert.ok(!json.includes('EUR'), 'not even a currency code');
  assert.equal(shape.cash, '<number>');
  assert.equal(shape.currency, '<string>');
});

test('a dangerous field is reported by name and never by content', () => {
  // "There was a field called accountId" is the finding. What was in it is not.
  const shape = describeShape({ accountId: 7654321, dUUID: 'abc', X_Trader_Device_Model: 'x', cash: 1 }); // leak-check: ok
  assert.equal(shape.accountId, '<redacted:name-only>');
  assert.equal(shape.dUUID, '<redacted:name-only>');
  assert.equal(shape.X_Trader_Device_Model, '<redacted:name-only>');
  assert.equal(shape.cash, '<number>', 'and an ordinary field still describes itself');
  assert.ok(!JSON.stringify(shape).includes('7654321')); // leak-check: ok
});

test('nesting cannot be used to smuggle a value out', () => {
  const deep = { a: { b: { c: { d: { e: { secretValue: 42 } } } } } };
  assert.ok(!JSON.stringify(describeShape(deep)).includes('42'));
});

// --- headers ----------------------------------------------------------------

test('a header is classified by what it would mean for rule 9', () => {
  assert.equal(classifyHeader('Cookie'), 'session credential');
  assert.equal(classifyHeader('Authorization'), 'session credential');
  assert.equal(classifyHeader('X-Trader-dUUID'), 'device identifier');
  assert.equal(classifyHeader('X-Trader-Device-Model'), 'device identifier');
  assert.equal(classifyHeader('X-Trader-Client'), 'static client metadata');
  assert.equal(classifyHeader('Accept'), 'browser metadata');
  assert.equal(classifyHeader('X-Something-Nobody-Has-Seen'), 'unknown');
});

// --- the verdict ------------------------------------------------------------

test('a session the browser already holds is the only PASS', () => {
  assert.equal(
    verdict({ pageOutcome: OUTCOMES.PASS_JSON, workerOutcome: OUTCOMES.PASS_JSON,
              loggedOutOutcome: OUTCOMES.UNAUTHENTICATED }).verdict,
    'PASS',
  );
});

test('a required device identifier fails, whatever else worked', () => {
  // Rule 9 names this specifically: signing a request with a key it created.
  const v = verdict({
    pageOutcome: OUTCOMES.PASS_JSON, workerOutcome: OUTCOMES.PASS_JSON,
    loggedOutOutcome: OUTCOMES.UNAUTHENTICATED, headersNeeded: ['X-Trader-dUUID'],
  });
  assert.equal(v.verdict, 'FAIL');
});

test('an endpoint that answers while logged out is not account data', () => {
  // The control step. Without it, a public endpoint reads as a pass.
  const v = verdict({
    pageOutcome: OUTCOMES.PASS_JSON, workerOutcome: OUTCOMES.PASS_JSON,
    loggedOutOutcome: OUTCOMES.PASS_JSON,
  });
  assert.equal(v.verdict, 'INCONCLUSIVE');
});

test('the page working and the worker not is inconclusive, never a pass', () => {
  const v = verdict({ pageOutcome: OUTCOMES.PASS_JSON, workerOutcome: OUTCOMES.FORBIDDEN });
  assert.equal(v.verdict, 'INCONCLUSIVE');
});

test('an untested worker is not a pass either', () => {
  const v = verdict({ pageOutcome: OUTCOMES.PASS_JSON, loggedOutOutcome: OUTCOMES.UNAUTHENTICATED });
  assert.equal(v.verdict, 'INCONCLUSIVE');
});

test('static client metadata is a conditional pass, not a full one', () => {
  const v = verdict({
    pageOutcome: OUTCOMES.PASS_JSON, workerOutcome: OUTCOMES.PASS_JSON,
    loggedOutOutcome: OUTCOMES.UNAUTHENTICATED, headersNeeded: ['X-Trader-Client'],
  });
  assert.equal(v.verdict, 'CONDITIONAL');
});

// --- the spike must not become the product ----------------------------------

test('the spike reads no cookie, sends no Authorization, and stores nothing', () => {
  /**
   * Asserted structurally rather than by inspection, because these are the
   * three things that would turn a spike into a rule 9 violation, and all three
   * are easy to add without noticing.
   */
  const src = readFileSync(new URL('../tools/trading212-r1/spike.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/chrome\.cookies/.test(code), 'no cookie read');
  assert.ok(!/Authorization/.test(code), 'no Authorization header');
  assert.ok(!/indexedDB|chrome\.storage|setMeta/.test(code), 'nothing stored');
  assert.ok(!/fetch\s*\(/.test(code), 'and the pure half makes no request at all');
});
