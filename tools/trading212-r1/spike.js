/**
 * Trading 212 R1 — the pure half.
 *
 * US-37 asks one question: can this extension read Trading 212 account data
 * from a session the user already has, without storing a credential? The
 * experiment that answers it is two lines in a browser console. Everything in
 * this file is the machinery around that — target validation, response
 * classification, and scrubbing — and it exists for two reasons rather than one.
 *
 * **Safety.** Any code that will eventually make requests to a broker needs a
 * gate that refuses anything not explicitly measured. Rule 5 says rate limits
 * are an account-safety issue; the same reasoning applies to what a spike is
 * allowed to call at all.
 *
 * **Rule 7.** The spike's *result* is a document somebody pastes into a chat.
 * It cannot carry a body, a cookie, an account id or a device id, and the way
 * this project keeps that true is an allowlist rather than a scrub-on-the-way-
 * out. That is what `describeShape` is.
 *
 * Pure: no `fetch`, no `chrome.*`, no storage. Every function here is testable
 * without a browser, which is the point — the parts that need a logged-in
 * account are the two lines that are *not* in here.
 *
 * **Deleted on FAIL.** If R1 comes back no, this directory goes, along with any
 * manifest permission. Not disabled behind a flag: rule 8, and a spike kept
 * "just in case" is the thing that rots.
 */

/**
 * Origins this spike may talk to.
 *
 * Only hosts that have actually been observed serving Trading 212's own web
 * app. `live.services.trading212.com` is measured — `MULTI-BROKER.md` §8b
 * records the charting endpoints there answering without any credential.
 */
export const ALLOWED_ORIGINS = Object.freeze(['https://live.services.trading212.com']);

/**
 * Paths this spike may call, and their status.
 *
 * `measured` means somebody watched the real web app request it. `hypothesis`
 * means it came from community code and **has not been seen in a Network tab**
 * — those are allowed for the probe, because probing is how a hypothesis
 * becomes a measurement, and forbidden for anything else.
 */
export const READ_PATHS = Object.freeze({
  '/charting/v1/eq/ohlc/ONE_DAY': 'measured',
  // Promoted 2026-08-25. Twice over: the probe reached it and got 200 JSON
  // (`TRADING212-R1-RESULT.md`, step 3b), and a full Network-tab capture of
  // `app.trading212.com/portfolio` shows the web app itself requesting it
  // (`MULTI-BROKER.md` §8g). The second is what the marker actually asks for.
  '/rest/v1/accounts': 'measured',
  // Still guesses from community code, and the capture that promoted the line
  // above could not promote these: it came from an account holding nothing, so
  // the web app never asked for a transaction or a dividend. §8g.
  '/rest/reports/transactions': 'hypothesis',
  '/rest/reports/dividends/v2': 'hypothesis',
});

/** Trading 212 account types. A result for one proves nothing for another. */
export const ACCOUNT_TYPES = Object.freeze({
  INVEST: 'INVEST',
  ISA: 'ISA',
  CFD: 'CFD',
  CRYPTO: 'CRYPTO',
  UNKNOWN: 'UNKNOWN',
  NOT_TESTED: 'NOT_TESTED',
});

/**
 * May this request be made at all?
 *
 * Default-deny in every dimension. Returns `{ok: true}` or
 * `{ok: false, reason}` — a reason rather than a boolean, so a refusal can be
 * reported rather than merely happening.
 */
export function validateTarget({ method, url } = {}) {
  if (method !== 'GET') return { ok: false, reason: 'method-not-get' };

  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: 'unparseable-url' };
  }

  if (u.protocol !== 'https:') return { ok: false, reason: 'not-https' };
  // Credentials in a URL are never legitimate here and would end up in a log.
  if (u.username || u.password) return { ok: false, reason: 'credentials-in-url' };
  if (!ALLOWED_ORIGINS.includes(u.origin)) return { ok: false, reason: 'origin-not-allowed' };
  if (!(u.pathname in READ_PATHS)) return { ok: false, reason: 'path-not-registered' };
  // Any query at all is a refusal rather than a filter: this spike calls
  // parameterless endpoints, and a parameter nobody registered is a parameter
  // nobody has reasoned about.
  if ([...u.searchParams.keys()].length) return { ok: false, reason: 'unexpected-query' };

  return { ok: true, evidence: READ_PATHS[u.pathname] };
}

/** What came back, without looking at what it said. */
export const OUTCOMES = Object.freeze({
  PASS_JSON: 'PASS_JSON',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  LOGIN_HTML: 'LOGIN_HTML',
  REDIRECTED: 'REDIRECTED',
  RATE_LIMITED: 'RATE_LIMITED',
  NON_JSON: 'NON_JSON',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Classify a response by status and content type only.
 *
 * Deliberately never reads the body to decide. A login page served with status
 * 200 is the case that matters — it looks like success and is not — and the
 * content type separates it without anything being parsed.
 */
export function classify({ status, contentType = '', redirected = false, threw = false } = {}) {
  if (threw) return OUTCOMES.NETWORK_ERROR;
  if (redirected || (status >= 300 && status < 400)) return OUTCOMES.REDIRECTED;
  if (status === 401) return OUTCOMES.UNAUTHENTICATED;
  if (status === 403) return OUTCOMES.FORBIDDEN;
  if (status === 429) return OUTCOMES.RATE_LIMITED;
  if (status === 200) {
    if (/json/i.test(contentType)) return OUTCOMES.PASS_JSON;
    if (/html/i.test(contentType)) return OUTCOMES.LOGIN_HTML;
    return OUTCOMES.NON_JSON;
  }
  return OUTCOMES.UNKNOWN;
}

/**
 * Names that must never appear in the spike's output, whatever they hold.
 *
 * Matched case-insensitively and as a substring, so `X-Trader-Device-Model`
 * catches on `device` without needing to be listed. An allowlist would be
 * stronger still and is not available here — the whole point of the spike is
 * that we do not yet know the field names, so this is a denylist used at the
 * one place where a denylist is the honest tool: naming what is known to be
 * dangerous while the shape is still unknown. Nothing downstream trusts it;
 * `describeShape` is what actually leaves.
 */
const FORBIDDEN = [
  'authorization', 'cookie', 'token', 'session', 'secret', 'apikey', 'password',
  'account', 'iban', 'email', 'name', 'address', 'phone', 'device', 'duuid', 'uuid',
];

const isForbidden = (key) => {
  const k = String(key).toLowerCase().replace(/[-_]/g, '');
  return FORBIDDEN.some((f) => k.includes(f));
};

/**
 * A response's *shape*, never its contents.
 *
 * `{cash: 12.34}` becomes `{cash: "<number>"}`. A forbidden key is not
 * described at all — it is replaced by its own name being noted, so the report
 * can say "there was a field called `accountId`" without saying what was in it,
 * which is exactly the finding a reader needs.
 */
export function describeShape(value, depth = 0) {
  if (depth > 4) return '<deep>';
  if (value === null) return '<null>';
  if (Array.isArray(value)) {
    return value.length ? [`<array:${value.length}>`, describeShape(value[0], depth + 1)] : '<array:0>';
  }
  const t = typeof value;
  if (t !== 'object') return `<${t}>`;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isForbidden(k) ? '<redacted:name-only>' : describeShape(v, depth + 1);
  }
  return out;
}

/**
 * Header names, classified — never values.
 *
 * The spike's most consequential finding after the status codes: a request that
 * needs a device identifier the page generated is a different thing from one
 * that needs a cookie the browser already has, and rule 9 treats them
 * differently.
 */
export function classifyHeader(name) {
  const n = String(name).toLowerCase();
  if (/^(authorization|cookie)$/.test(n)) return 'session credential';
  if (/duuid|device/.test(n)) return 'device identifier';
  if (/account/.test(n)) return 'account identifier';
  if (/^x-trader-(client|platform|target-type)$/.test(n)) return 'static client metadata';
  if (/^(accept|content-type|user-agent|referer|origin|sec-.*|accept-.*)$/.test(n)) return 'browser metadata';
  return 'unknown';
}

/**
 * The verdict, from what was observed. Pure, so the decision rules are testable
 * rather than argued about after the fact.
 */
export function verdict({ pageOutcome, workerOutcome, headersNeeded = [], loggedOutOutcome } = {}) {
  const needs = headersNeeded.map(classifyHeader);
  if (needs.includes('session credential') || needs.includes('device identifier')) {
    return { verdict: 'FAIL', why: 'a forbidden credential or device identifier is required' };
  }
  if (pageOutcome !== OUTCOMES.PASS_JSON) {
    return { verdict: 'FAIL', why: `the page context itself could not read it (${pageOutcome})` };
  }
  if (workerOutcome && workerOutcome !== OUTCOMES.PASS_JSON) {
    return { verdict: 'INCONCLUSIVE', why: `the page works and the worker does not (${workerOutcome})` };
  }
  if (loggedOutOutcome === OUTCOMES.PASS_JSON) {
    return { verdict: 'INCONCLUSIVE', why: 'it answered while logged out, so this is not account data' };
  }
  if (!workerOutcome) return { verdict: 'INCONCLUSIVE', why: 'the worker was never tested' };
  if (needs.includes('unknown')) {
    return { verdict: 'CONDITIONAL', why: 'an unclassified header is required' };
  }
  if (needs.includes('static client metadata')) {
    return { verdict: 'CONDITIONAL', why: 'static, non-personal client metadata is required' };
  }
  return { verdict: 'PASS', why: 'a session the browser already holds was sufficient' };
}
