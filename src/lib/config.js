/**
 * Every endpoint path, version number and tuning constant lives here.
 * SPEC §2: "Version numbers in the reporting paths (v4, v6) drift. Read them from
 * the HAR, and put them in one config module so a break is a one-line fix."
 *
 * This module is pure data. It must not import anything.
 */

export const TRADER = 'https://trader.degiro.nl';
export const CHARTING = 'https://charting.vwdservices.com';

/** Reporting API versions. Bump these when DEGIRO drifts. */
export const API_VERSIONS = {
  update: 'v5',
  transactions: 'v4',
  accountOverview: 'v6',
  productInfo: 'v5',
};

/** Earliest date we ever ask DEGIRO about. Before any DEGIRO account existed. */
export const HISTORY_START = '2013-01-01';

/**
 * SPEC §6: "max 1 request/second, chunked, with exponential backoff on non-200.
 * No polling loops, no retries in tight loops."
 */
export const RATE = {
  /** Minimum milliseconds between two outbound requests, globally. */
  minIntervalMs: 1100,
  /** How many vwd series to put in a single chart request (>~60 gives 404). */
  seriesChunkSize: 20,
  /** Retry budget per request. */
  maxRetries: 4,
  /** First backoff step; doubles each retry. */
  backoffBaseMs: 2000,
  /** Ceiling so a broken endpoint cannot park us for an hour. */
  backoffMaxMs: 60000,
  /**
   * Per-request deadline. Without one, a socket that never answers wedges the
   * whole sync: the in-flight promise never settles, the module-global `running`
   * guard never clears, and every later click silently attaches to the dead run.
   * That reads to the user as "the button does nothing".
   */
  timeoutMs: 30000,
};

/** Price history windows. P50Y for a first backfill, P1M for the daily tail. */
export const PRICE_PERIOD = {
  backfill: 'P50Y',
  tail: 'P3M',
};

/** Hourly opportunistic sync, per SPEC §6. */
export const SYNC = {
  alarmName: 'degiro-sync',
  alarmPeriodMinutes: 60,
  /** Do not re-sync more often than this, even if the user clicks a lot. */
  minSyncIntervalMs: 5 * 60 * 1000,
};

/** Base currency for reporting. SPEC §2.2: v1 is EUR-only with loud warnings. */
export const BASE_CURRENCY = 'EUR';

export const STORAGE = {
  dbName: 'degiro-portfolio',
  dbVersion: 1,
  stores: ['transactions', 'cashflows', 'products', 'prices', 'derived', 'meta'],
};

/** Build a dd/MM/yyyy string, the format the reporting endpoints want. */
export function ddMMyyyy(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Base URLs, as DEGIRO reports them from /login/secure/config.
 *
 * These are NOT constant across accounts. DEGIRO runs several trading clusters
 * and an account can sit on `/trading/`, `/trading4/` or another variant; the
 * config endpoint is the only thing that knows which. Hardcoding one of them
 * gives a 404 on every other account, which surfaces as an opaque
 * "DEGIRO returned an error" — so these defaults are a fallback, not truth.
 */
export const DEFAULT_URLS = {
  trading: `${TRADER}/trading/secure/`,
  reporting: `${TRADER}/reporting/secure/`,
  productSearch: `${TRADER}/product_search/secure/`,
  pa: `${TRADER}/pa/secure/`,
};

/** Join a discovered base (which may or may not end in '/') to a path. */
const join = (base, path) => `${String(base).replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

export const ENDPOINTS = {
  config: () => `${TRADER}/login/secure/config`,

  client: ({ sessionId, urls = DEFAULT_URLS }) =>
    `${join(urls.pa, 'client')}?sessionId=${encodeURIComponent(sessionId)}`,

  update: ({ intAccount, sessionId, urls = DEFAULT_URLS }) =>
    `${join(urls.trading, `${API_VERSIONS.update}/update/${intAccount}`)};jsessionid=${sessionId}` +
    `?portfolio=0&totalPortfolio=0&cashFunds=0`,

  transactions: ({ intAccount, sessionId, fromDate, toDate, urls = DEFAULT_URLS }) =>
    `${join(urls.reporting, `${API_VERSIONS.transactions}/transactions`)}` +
    `?fromDate=${ddMMyyyy(fromDate)}&toDate=${ddMMyyyy(toDate)}` +
    `&groupTransactionsByOrder=false&intAccount=${intAccount}&sessionId=${encodeURIComponent(sessionId)}`,

  accountOverview: ({ intAccount, sessionId, fromDate, toDate, urls = DEFAULT_URLS }) =>
    `${join(urls.reporting, `${API_VERSIONS.accountOverview}/accountoverview`)}` +
    `?fromDate=${ddMMyyyy(fromDate)}&toDate=${ddMMyyyy(toDate)}` +
    `&intAccount=${intAccount}&sessionId=${encodeURIComponent(sessionId)}`,

  productsInfo: ({ intAccount, sessionId, urls = DEFAULT_URLS }) =>
    `${join(urls.productSearch, `${API_VERSIONS.productInfo}/products/info`)}` +
    `?intAccount=${intAccount}&sessionId=${encodeURIComponent(sessionId)}`,

  /**
   * vwd daily closes. `vwdIds` is an array; each id contributes two series
   * params exactly like the real UI sends them.
   */
  chart: ({ vwdIds, userToken, period = PRICE_PERIOD.backfill }) => {
    const series = vwdIds
      .flatMap((id) => [`series=issueid:${id}`, `series=price:issueid:${id}`])
      .join('&');
    return (
      `${CHARTING}/hchart/v1/deGiro/data.js` +
      `?requestid=1&resolution=P1D&culture=nl-NL&period=${period}&${series}` +
      `&format=json&userToken=${encodeURIComponent(userToken)}&tz=Europe/Amsterdam`
    );
  },
};
