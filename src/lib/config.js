/**
 * Every endpoint path, version number and tuning constant lives here.
 * SPEC §2: "Version numbers in the reporting paths (v4, v6) drift. Read them from
 * the HAR, and put them in one config module so a break is a one-line fix."
 *
 * This module is pure data. It must not import anything.
 */

export const TRADER = 'https://trader.degiro.nl';
const CHARTING = 'https://charting.vwdservices.com';

/**
 * The only host a discovered base URL may live on, and the same one the
 * manifest grants permission for. DEGIRO's clusters differ by *path*
 * (`/trading/`, `/trading4/`), never by hostname, so this is exact rather than
 * a suffix match — see `parseConfigUrls`, which is the one place a response
 * decides where a later request goes.
 */
export const TRADER_HOST = 'trader.degiro.nl';

/** The cookie DEGIRO's own login sets. Read, never written — rule 9. */
export const SESSION_COOKIE_NAME = 'JSESSIONID';

/** Reporting API versions. Bump these when DEGIRO drifts. */
const API_VERSIONS = {
  update: 'v5',
  transactions: 'v4',
  accountOverview: 'v6',
  productInfo: 'v5',
};

/**
 * Where a first sync starts looking.
 *
 * Asking for everything since 2013 makes the reporting endpoints time out and
 * answer 502 on busy accounts, and most people do not care about that far back
 * anyway. 2019 is the default.
 *
 * It is a starting point, not a floor: sync.js walks further back a year at a
 * time while it keeps finding rows (see HISTORY_FLOOR). Without that, an
 * account opened before this date would silently lose its early positions and
 * the SPEC §6 reconciliation would fail with no explanation.
 */
export const HISTORY_START = '2019-01-01';

/** Hard stop for the backwards walk. DEGIRO itself did not exist before this. */
export const HISTORY_FLOOR = '2008-01-01';

/**
 * How many consecutive empty years end the backwards walk. One is too eager: a
 * year with no trades and no deposits is perfectly ordinary.
 */
export const EMPTY_YEARS_BEFORE_STOP = 2;

/**
 * US-17. When a missing field stops being sparse data and becomes a renamed one.
 *
 * A threshold, so per SPEC §3 it lives here as a constant a human reviewed rather
 * than being derived from the data it polices — a rate computed from the same
 * rows it is judging would move with them and never fire.
 *
 * The six fields are load-bearing in a specific sense: a silent `0` from any of
 * them does not lose a few rows, it makes every figure on the page wrong while
 * looking fine. `totalBase` is what exchange rates, contract sizes and every
 * per-holding result are measured from; `quantity` empties the position ledger;
 * `price` leaves the split audit with nothing to compare against; `change` zeroes
 * cash so the account is worth only its positions; `closePrice` values positions
 * at nothing; and `size` is what the reconciliation check reconciles against.
 *
 * Named by their **first** candidate, which is the key `parse.js` tallies under —
 * so adding a candidate to one of those lists does not have to be mirrored here.
 *
 * 0.95 rather than 1.0 because a real feed has the odd genuinely empty row, and a
 * threshold that only fires at exactly every row would be defeated by one of
 * them.
 */
export const FIELD_ALARM = {
  /** Fraction of rows a load-bearing field must be absent on to raise. */
  missingShare: 0.95,
  /** Below this many rows the rate says nothing, so nothing is raised. */
  minRows: 20,
  loadBearing: ['totalPlusFeeInBaseCurrency', 'quantity', 'price', 'change', 'closePrice', 'size'],
};

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

/**
 * US-66 — how far the pointer has to travel before a press is a drag.
 *
 * The zoom used to decide this in **days**: below two days of history it was a
 * click. Two days is not a length of hand movement, it is a length of history,
 * and the window changes what it measures on screen — under a pixel on a
 * five-year view, so a click that wobbled zoomed the page; most of a centimetre
 * on a three-week window, so a deliberate drag was thrown away. The same line
 * was wrong in both directions.
 *
 * Eight pixels is the hysteresis a gesture wants: past a hand's tremor, under
 * anything anybody would call a drag. Here rather than inline because more than
 * one gesture needs the same number, and a threshold that is a tuning constant
 * in one place and a literal in another drifts.
 */
export const GESTURE = {
  dragThresholdPx: 8,
};

export const STORAGE = {
  dbName: 'degiro-portfolio',
  /**
   * 2: row keys changed. The old scheme used DEGIRO's reported id, which is not
   * unique — rows stored under it must be discarded and re-fetched, or the new
   * keys would land alongside the old ones and double the cash.
   */
  dbVersion: 2,
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
   * vwd daily closes. Each instrument contributes two series params, exactly
   * like the real UI sends them.
   *
   * `vwdIds` accepts either a bare id (assumed `issueid`) or `{id, type}`. The
   * type matters: DEGIRO returns `vwdIdentifierType: 'vwdkey'` for some
   * instruments, whose identifier looks like `US7731211089.TRADE,E` rather than
   * a number. Requesting those as `issueid:` silently returns no series, which
   * shows up as a holding with no price history.
   */
  chart: ({ vwdIds, userToken, period = PRICE_PERIOD.backfill }) => {
    const series = vwdIds
      .map((v) => (typeof v === 'object' ? v : { id: v, type: 'issueid' }))
      .flatMap(({ id, type = 'issueid' }) => {
        const ref = `${type}:${encodeURIComponent(id)}`;
        return [`series=${ref}`, `series=price:${ref}`];
      })
      .join('&');
    return (
      `${CHARTING}/hchart/v1/deGiro/data.js` +
      `?requestid=1&resolution=P1D&culture=nl-NL&period=${period}&${series}` +
      `&format=json&userToken=${encodeURIComponent(userToken)}&tz=Europe/Amsterdam`
    );
  },
};

/**
 * US-48 — the Asteria watermark.
 *
 * Three numbers, in one place, and deliberately no more than three. Rule 8: a
 * watermark *system* with positions, variants and per-chart overrides is a
 * configuration surface nobody asked for. If a second position is ever wanted,
 * that is when the second position gets built.
 *
 * `opacity` is high for a watermark because the mark is drawn in the chart's
 * padding rather than under the plot, so it competes with nothing: the alpha is
 * chosen for legibility, not to keep the series readable. Under the data it
 * would have to be a fraction of this, and `charts.js` explains why it is not
 * drawn there.
 */
export const WATERMARK = {
  /** Drawn height in CSS pixels. Width follows; the mark is never stretched. */
  height: 13,
  /** From the left edge of the canvas. */
  inset: 4,
  opacity: 0.35,
};
