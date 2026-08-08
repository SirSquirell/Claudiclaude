/**
 * Thin fetch wrappers, one per endpoint. No logic beyond throttling, retrying
 * and turning a failure into a typed error (SPEC §3: "no logic").
 *
 * SPEC §6: "Automated hammering of DEGIRO's endpoints is a real risk to the
 * account. Backfill must be slow and once-only: max 1 request/second, chunked,
 * with exponential backoff on non-200. No polling loops, no retries in tight
 * loops."
 *
 * Every outbound request in the extension goes through `throttledFetch`. There
 * is exactly one queue, module-global, so parallel callers cannot defeat it.
 */

import { DEFAULT_URLS, ENDPOINTS, HISTORY_START, PRICE_PERIOD, RATE } from './config.js';
import { parseChartResponse, parseClient, parseConfigUrls, unwrapJsonp } from './parse.js';

export class SessionExpiredError extends Error {
  constructor(message = 'DEGIRO session expired') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class DegiroHttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url.split('?')[0]}`);
    this.name = 'DegiroHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export class RequestTimeoutError extends Error {
  constructor(url, ms) {
    super(`No response within ${ms / 1000}s from ${url.split('?')[0]}`);
    this.name = 'RequestTimeoutError';
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serialises every request in the extension and spaces them out. */
let chain = Promise.resolve();
let lastStart = 0;

function enqueue(task) {
  const run = chain.then(async () => {
    const wait = RATE.minIntervalMs - (Date.now() - lastStart);
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    return task();
  });
  // Keep the chain alive even when a task rejects.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * One request, rate-limited, with exponential backoff on transient failures.
 * 401/403 are not transient: they mean the cookie is gone, so we stop rather
 * than retry (SPEC §3.1: "Never attempt a login").
 */
export async function throttledFetch(url, init = {}, { retries = RATE.maxRetries } = {}) {
  let attempt = 0;
  for (;;) {
    const res = await enqueue(() => fetchWithDeadline(url, init));

    if (res.ok) return res;

    if (res.status === 401 || res.status === 403) {
      throw new SessionExpiredError(`DEGIRO returned ${res.status}`);
    }

    // A 502 from the reporting endpoints is usually the query timing out on
    // DEGIRO's side, not a blip — repeating it unchanged just wastes 30s. The
    // caller lowers `retries` and narrows the date window instead.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new DegiroHttpError(res.status, url, await safeText(res));
    }

    const delay = Math.min(RATE.backoffBaseMs * 2 ** attempt, RATE.backoffMaxMs);
    attempt++;
    await sleep(delay);
  }
}

/**
 * One fetch with a hard deadline.
 *
 * There is exactly one request queue in this module, so a socket that never
 * answers does not just stall its own call — every later request waits behind
 * it forever and the sync appears to hang with the button stuck on "Syncing…".
 * An AbortController turns that into an ordinary, reportable error.
 */
async function fetchWithDeadline(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RATE.timeoutMs);
  try {
    return await fetch(url, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*', ...init.headers },
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new RequestTimeoutError(url, RATE.timeoutMs);
    // A network-level failure (DNS, offline, blocked) arrives as a bare
    // TypeError; say which endpoint it was so the message is actionable.
    throw new Error(`Could not reach ${new URL(url).host}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

async function getJson(url, init, opts) {
  const res = await throttledFetch(url, init, opts);
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A session timeout sometimes arrives as an HTML login page with a 200.
    if (/<html/i.test(text)) throw new SessionExpiredError('DEGIRO returned an HTML page instead of JSON');
    throw new Error(`Unparseable response from ${url.split('?')[0]}`);
  }
}

// --- endpoints -------------------------------------------------------------

/**
 * Ask DEGIRO which cluster this account lives on. Falls back to the documented
 * defaults if the call fails, so a config outage degrades rather than blocks.
 */
export async function fetchUrls() {
  try {
    return parseConfigUrls(await getJson(ENDPOINTS.config()), DEFAULT_URLS);
  } catch {
    return { ...DEFAULT_URLS, discovered: false };
  }
}

export async function fetchClient({ sessionId, urls }) {
  return parseClient(await getJson(ENDPOINTS.client({ sessionId, urls })));
}

/** Current portfolio + cash. Also our cheap "is the session alive" probe. */
export async function fetchUpdate({ intAccount, sessionId, urls }) {
  return getJson(ENDPOINTS.update({ intAccount, sessionId, urls }));
}

export async function fetchTransactions({ intAccount, sessionId, urls, fromDate = HISTORY_START, toDate }, opts) {
  return getJson(ENDPOINTS.transactions({ intAccount, sessionId, urls, fromDate, toDate }), undefined, opts);
}

export async function fetchAccountOverview({ intAccount, sessionId, urls, fromDate = HISTORY_START, toDate }, opts) {
  return getJson(ENDPOINTS.accountOverview({ intAccount, sessionId, urls, fromDate, toDate }), undefined, opts);
}

/** POST body is a bare array of productId strings. */
export async function fetchProductsInfo({ intAccount, sessionId, urls, productIds }) {
  if (!productIds.length) return { data: {} };
  return getJson(ENDPOINTS.productsInfo({ intAccount, sessionId, urls }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productIds.map(String)),
  });
}

/**
 * Daily closes for up to RATE.seriesChunkSize instruments.
 * SPEC §2.1: ">~60 series in one URL returns 404. Chunk to 20 per request."
 */
export async function fetchPriceChunk({ vwdIds, userToken, period = PRICE_PERIOD.backfill }) {
  if (!vwdIds.length) return {};
  const url = ENDPOINTS.chart({ vwdIds, userToken, period });
  const res = await throttledFetch(url);
  const text = await res.text();
  // format=json should give us plain JSON, but guard against the JSONP shape
  // anyway — SPEC §2.1 says "still guard against a wrapper".
  return parseChartResponse(unwrapJsonp(text));
}

/** Split an array into fixed-size chunks. */
export function chunk(items, size = RATE.seriesChunkSize) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
