/**
 * Raw DEGIRO / vwd JSON  ->  the engine's plain input types.
 *
 * SPEC §5: "Reads fixtures/ first and derives the actual response shapes from
 * them. Does not trust the field names in this spec."
 *
 * We have no real HAR yet, so every extractor here is written defensively:
 * a list of candidate field names per value, numbers coerced from both
 * '1.234,56' and '1234.56', and the container located by shape rather than by a
 * single hard-coded path. When a real capture lands, tighten these — but the
 * loose version should already swallow most drift.
 *
 * Pure module: no I/O, no Chrome APIs.
 */

import { isoDayOf } from './dates.js';
import { classifyCashRow } from './classify.js';
import { TRADER_HOST } from './config.js';

/** Coerce anything DEGIRO calls a number into a real number. */
export function num(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value).trim().replace(/[\s\u00a0\u202f]/g, '');
  // European format: '1.234,56' -> '1234.56'. Only when a comma is present.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  s = s.replace(/[^0-9eE+\-.]/g, '');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A storage key that is unique per row and stable across syncs.
 *
 * DEGIRO's own `id` is not unique on the account-overview feed: a real account
 * returned `id: 0` on dozens of rows, which collapsed them onto one another in
 * IndexedDB and quietly lost 46 movements. Nor is the content unique — 541 rows
 * on that same account were identical in every field, which is what an FX leg
 * repeated across a basket order looks like.
 *
 * So the key is the reported id plus the row's content plus how many times that
 * exact combination has already been seen in this response. Rows for a given
 * day always arrive from the same request window, so the ordering — and
 * therefore the count — is reproducible on the next sync.
 */
function stableKey(seen, parts) {
  const base = parts.map((p) => String(p ?? '').replace(/\|/g, '/')).join('|');
  const nth = seen.get(base) ?? 0;
  seen.set(base, nth + 1);
  return nth === 0 ? base : `${base}|${nth}`;
}

/** First non-nullish value among the candidate keys. */
function pick(obj, keys, fallback = undefined) {
  for (const k of keys) {
    if (obj != null && obj[k] != null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

/**
 * Find the payload array/object inside a response whose envelope we are not
 * sure about. Tries the given paths in order, then falls back to the first
 * array-valued property.
 */
function unwrap(res, paths) {
  for (const path of paths) {
    let cur = res;
    let ok = true;
    for (const key of path.split('.')) {
      if (cur == null || typeof cur !== 'object' || !(key in cur)) {
        ok = false;
        break;
      }
      cur = cur[key];
    }
    if (ok && cur != null) return cur;
  }
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    for (const v of Object.values(res)) if (Array.isArray(v)) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// transactions  (reporting/secure/v4/transactions)
// ---------------------------------------------------------------------------

/**
 * @returns {Array<{id, date, productId, quantity, price, currency, fee, totalBase}>}
 * `quantity` is signed: positive for a buy, negative for a sell.
 */
export function parseTransactions(res) {
  const rows = unwrap(res, ['data', 'transactions', 'data.transactions']) ?? [];
  if (!Array.isArray(rows)) return [];

  const seen = new Map();
  const parsed = rows
    .map((r) => {
      const date = isoDayOf(pick(r, ['date', 'transactionDate', 'valueDate']));
      if (!date) return null;

      let quantity = num(pick(r, ['quantity', 'size', 'amount'], 0));
      // Some responses report an unsigned quantity plus a buysell flag.
      const bs = String(pick(r, ['buysell', 'buySell', 'side'], '')).toUpperCase();
      if (bs.startsWith('S') && quantity > 0) quantity = -quantity;
      if (bs.startsWith('B') && quantity < 0) quantity = Math.abs(quantity);

      return {
        // Same reasoning as the cash rows: never trust the reported id to be
        // unique on its own.
        id: stableKey(seen, [
          date,
          pick(r, ['id', 'transactionId'], ''),
          pick(r, ['productId'], ''),
          quantity,
          pick(r, ['price'], ''),
        ]),
        sourceId: pick(r, ['id', 'transactionId'], null),
        date,
        productId: String(pick(r, ['productId', 'product_id', 'id'], '')),
        quantity,
        price: num(pick(r, ['price', 'tradedPrice'], 0)),
        currency: String(pick(r, ['currency', 'productCurrency'], 'EUR')),
        fee: num(pick(r, ['feeInBaseCurrency', 'fee', 'totalFeesInBaseCurrency'], 0)),
        totalBase: num(
          pick(r, ['totalPlusFeeInBaseCurrency', 'totalInBaseCurrency', 'totalPlusAllFeesInBaseCurrency', 'total'], 0),
        ),
      };
    })
    .filter((t) => t && t.productId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // What did not survive, and why.
  //
  // That `.filter` used to be the end of it, which is the quietest way a parser
  // can fail: DEGIRO renames one field, every row loses its product id, the
  // array comes back empty, and the sync reports success over an account with
  // no history. The candidate field names in this file exist *because* we are
  // guessing at shapes — so a guess that misses has to be counted rather than
  // swallowed.
  return withDropped(parsed, rows, (r) => {
    if (!isoDayOf(pick(r, ['date', 'transactionDate', 'valueDate']))) return 'no-date';
    if (!String(pick(r, ['productId', 'product_id', 'id'], ''))) return 'no-product-id';
    return null;
  });
}

/**
 * Attach a drop report to a parsed array, without changing what it is.
 *
 * An array with a non-enumerable property on it is still an array: every caller
 * that maps, filters or spreads it is untouched, and `sync.js` can ask what was
 * lost. The alternative — returning `{rows, dropped}` — would have rewritten
 * nine call sites to carry a number most of them do not want.
 */
function withDropped(parsed, rawRows, reasonOf) {
  const lost = (rawRows?.length ?? 0) - parsed.length;
  if (lost <= 0) {
    Object.defineProperty(parsed, 'dropped', { value: { count: 0, reasons: {} }, enumerable: false });
    return parsed;
  }
  const reasons = {};
  // Only the reasons, never the rows: a row that failed to parse is still a row
  // out of somebody's account.
  //
  // `reasonOf` returns null for a row that parsed, so the counts describe the
  // losses rather than the whole set — and whatever is left over becomes
  // `other`, so the reasons always add up to the count. A breakdown that does
  // not sum to its own total invites the reader to distrust both numbers.
  for (const row of rawRows ?? []) {
    try {
      const why = reasonOf(row);
      if (why) reasons[why] = (reasons[why] ?? 0) + 1;
    } catch {
      reasons.threw = (reasons.threw ?? 0) + 1;
    }
  }
  const named = Object.values(reasons).reduce((a, b) => a + b, 0);
  if (named < lost) reasons.other = (reasons.other ?? 0) + (lost - named);
  Object.defineProperty(parsed, 'dropped', { value: { count: lost, reasons }, enumerable: false });
  return parsed;
}

// ---------------------------------------------------------------------------
// cash movements  (reporting/secure/v6/accountoverview)
// ---------------------------------------------------------------------------

/**
 * @returns {Array<{id, date, productId, description, currency, change, type, category}>}
 */
export function parseCashMovements(res) {
  const rows =
    unwrap(res, [
      'data.cashMovements',
      'cashMovements',
      'data.values',
      'data',
    ]) ?? [];
  if (!Array.isArray(rows)) return [];

  const seen = new Map();
  const parsed = rows
    .map((r) => {
      const date = isoDayOf(pick(r, ['date', 'valueDate']));
      if (!date) return null;
      const row = {
        id: stableKey(seen, [
          date,
          pick(r, ['id', 'orderId'], ''),
          pick(r, ['productId'], ''),
          pick(r, ['currency'], ''),
          pick(r, ['change', 'amount'], ''),
          pick(r, ['description'], ''),
        ]),
        /** DEGIRO's own id, kept for debugging; not unique, so not the key. */
        sourceId: pick(r, ['id', 'orderId'], null),
        date,
        productId: pick(r, ['productId', 'product_id'], null),
        description: String(pick(r, ['description', 'text', 'label'], '')),
        currency: String(pick(r, ['currency', 'ccy'], 'EUR')),
        change: num(pick(r, ['change', 'amount', 'value'], 0)),
        type: String(pick(r, ['type', 'transactionType'], '')),
      };
      row.productId = row.productId == null ? null : String(row.productId);
      row.category = classifyCashRow(row);
      return row;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // A cash row that cannot be dated cannot be placed on the calendar, so it is
  // dropped — and a dropped deposit is money that never appears to have arrived,
  // which the reconciliation will report as a shortfall with no explanation.
  // Counting it here is what turns that into an explanation.
  return withDropped(parsed, rows, (r) => (isoDayOf(pick(r, ['date', 'valueDate'])) ? null : 'no-date'));
}

// ---------------------------------------------------------------------------
// product metadata  (product_search/secure/v5/products/info)
// ---------------------------------------------------------------------------

/** Fields `parseProducts` names. Anything else is carried in `extra`. */
const NAMED_PRODUCT_FIELDS = [
  'id', 'productId', 'name', 'productName', 'symbol', 'ticker', 'isin',
  'currency', 'productCurrency', 'vwdId', 'vwdIdentifier', 'vwdid',
  'vwdIdentifierType', 'productType', 'productTypeId', 'closePrice',
  'lastPrice', 'closePriceDate',
];

/** The part of a response this parser does not claim. */
function rest(obj, named) {
  if (!obj || typeof obj !== 'object') return undefined;
  const skip = new Set(named);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (skip.has(k)) continue;
    if (v === null || typeof v === 'object') continue; // keep it flat and small
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** @returns {Record<string, {id,name,symbol,isin,currency,vwdId,productType,closePrice,closePriceDate,extra}>} */
export function parseProducts(res) {
  const data = unwrap(res, ['data', 'products']) ?? res;
  if (!data || typeof data !== 'object') return {};
  const entries = Array.isArray(data) ? data.map((p) => [pick(p, ['id']), p]) : Object.entries(data);

  const out = {};
  for (const [key, p] of entries) {
    if (!p || typeof p !== 'object') continue;
    const id = String(pick(p, ['id', 'productId'], key));
    out[id] = {
      id,
      name: String(pick(p, ['name', 'productName'], id)),
      symbol: String(pick(p, ['symbol', 'ticker'], '')),
      isin: String(pick(p, ['isin'], '')),
      currency: String(pick(p, ['currency', 'productCurrency'], 'EUR')),
      // vwdId is what the charting host keys on. vwdIdentifierType is usually
      // 'issueid'; when it is not, the chart request needs a different prefix.
      vwdId: pick(p, ['vwdId', 'vwdIdentifier', 'vwdid'], null),
      vwdIdType: String(pick(p, ['vwdIdentifierType'], 'issueid')),
      productType: String(pick(p, ['productType', 'productTypeId'], 'UNKNOWN')),
      closePrice: num(pick(p, ['closePrice', 'lastPrice'], 0)),
      closePriceDate: isoDayOf(pick(p, ['closePriceDate'], null)),
      // Whatever this parser does not name. An option's contract size, strike,
      // expiry and whether it is a call or a put are all candidates, and none
      // of them could be answered from a 50 MB export because they were thrown
      // away here before ever reaching disk.
      extra: rest(p, NAMED_PRODUCT_FIELDS),
    };
    if (out[id].vwdId != null) out[id].vwdId = String(out[id].vwdId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// current portfolio  (trading/secure/v5/update)
// ---------------------------------------------------------------------------

/**
 * DEGIRO's update endpoint uses a name/value-pair encoding:
 *   { value: [ { name: 'size', value: 10 }, ... ] }
 * Flatten it back into an ordinary object.
 */
function flattenPairs(entry) {
  const src = entry?.value;
  if (!Array.isArray(src)) return { ...entry };
  const out = {};
  for (const pair of src) {
    if (pair && typeof pair === 'object' && 'name' in pair) out[pair.name] = pair.value;
  }
  return out;
}

/**
 * @returns {{positions: Array<{productId, size, price, value}>, totalValue: number|null,
 *            totalCash: number|null, cash: Record<string, number>}}
 */
export function parseUpdate(res) {
  const positions = [];
  const portfolioRows = unwrap(res, ['portfolio.value', 'portfolio']) ?? [];
  if (Array.isArray(portfolioRows)) {
    for (const row of portfolioRows) {
      const f = flattenPairs(row);
      const productId = String(pick(f, ['id', 'productId'], row?.id ?? ''));
      if (!productId) continue;
      const size = num(pick(f, ['size', 'qty', 'quantity'], 0));
      if (size === 0) continue; // closed positions still show up with size 0
      positions.push({
        productId,
        size,
        price: num(pick(f, ['price'], 0)),
        value: num(pick(f, ['value', 'valueInEur'], 0)),
      });
    }
  }

  const totalRows = unwrap(res, ['totalPortfolio.value', 'totalPortfolio']) ?? [];
  const totals = Array.isArray(totalRows)
    ? flattenPairs({ value: totalRows })
    : totalRows && typeof totalRows === 'object'
      ? totalRows
      : {};

  const cash = {};
  const cashRows = unwrap(res, ['cashFunds.value', 'cashFunds']) ?? [];
  if (Array.isArray(cashRows)) {
    for (const row of cashRows) {
      const f = flattenPairs(row);
      const ccy = String(pick(f, ['currencyCode', 'currency'], ''));
      if (ccy) cash[ccy] = num(pick(f, ['value'], 0));
    }
  }

  const totalValue = pick(totals, ['reportNetliq', 'totalvalue', 'total', 'netliq']);
  const totalCash = pick(totals, ['totalCash', 'reportCashBal', 'cash']);

  return {
    positions,
    totalValue: totalValue == null ? null : num(totalValue),
    totalCash: totalCash == null ? null : num(totalCash),
    cash,
    // Everything else DEGIRO put in totalPortfolio, kept rather than dropped.
    // Two fields were being picked out of this object and the rest discarded
    // three lines later — which is why margin data has been arriving on every
    // sync since the first release and nobody has ever seen it. CLAUDE.md rule
    // 2 says only the raw response is truth; that was being violated here, in
    // the parse layer, upstream of the storage it was written about.
    totals,
  };
}

// ---------------------------------------------------------------------------
// vwd price series  (charting.vwdservices.com/hchart/v1/deGiro/data.js)
// ---------------------------------------------------------------------------

/**
 * SPEC §2.1, and the single most bug-prone conversion in the project:
 *
 *   "Series data comes back as [[x, y], ...] where x is an offset in resolution
 *    units from series.times (e.g. "2021-01-04/P1D"), not a timestamp."
 *
 * So x=0 means the day named in `times`, x=1 the next resolution step, and the
 * step is whatever the ISO-8601 period after the slash says.
 */
export function parseTimesAnchor(times) {
  const raw = String(times ?? '');
  const [startPart, periodPart = 'P1D'] = raw.split('/');
  const start = isoDayOf(startPart);
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(periodPart);
  let stepDays = 1;
  if (m) {
    const [, y, mo, w, d] = m.map((v) => (v == null ? 0 : Number(v)));
    // Only daily resolution is used by this extension; anything coarser is
    // approximated so a surprise resolution still plots roughly right.
    stepDays = (y || 0) * 365 + (mo || 0) * 30 + (w || 0) * 7 + (d || 0) || 1;
  }
  return { start, stepDays };
}

/** Strip a JSONP wrapper if the endpoint decided to send one anyway. */
export function unwrapJsonp(text) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  const m = /^[^(]*\((.*)\)\s*;?\s*$/s.exec(trimmed);
  if (m) return JSON.parse(m[1]);
  throw new Error('vwd response is neither JSON nor JSONP');
}

/**
 * @returns {Record<string, Array<{date: string, close: number}>>} keyed by vwdId
 */
export function parseChartResponse(res) {
  const body = typeof res === 'string' ? unwrapJsonp(res) : res;
  const seriesList = unwrap(body, ['series', 'data.series']) ?? [];
  const out = {};
  if (!Array.isArray(seriesList)) return out;

  for (const s of seriesList) {
    const id = String(s?.id ?? '');
    // We only want the price series; the bare `issueid:NNN` series carries
    // instrument metadata, not points. The identifier type varies — `issueid`
    // for most things, `vwdkey` for others — and the key we return has to be
    // the raw identifier, because that is what products store as `vwdId`.
    const m = /^price:(?:issueid|vwdkey|vwdid):(.+)$/.exec(id) || /^price:(.+)$/.exec(id);
    if (!m) continue;
    const vwdId = decodeURIComponent(m[1]);

    const { start, stepDays } = parseTimesAnchor(s.times);
    if (!start) continue;

    const points = [];
    const data = Array.isArray(s.data) ? s.data : [];
    for (const point of data) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const [offset, close] = point;
      if (!Number.isFinite(offset) || !Number.isFinite(close)) continue;
      points.push({ offsetDays: offset * stepDays, close });
    }
    points.sort((a, b) => a.offsetDays - b.offsetDays);

    out[vwdId] = { start, stepDays, points };
  }
  return out;
}

// ---------------------------------------------------------------------------
// session identifiers  (pa/secure/client)
// ---------------------------------------------------------------------------

/**
 * /login/secure/config -> the base URLs this account actually uses.
 *
 * DEGIRO moves accounts between trading clusters (`/trading/`, `/trading4/`,
 * …), so these must be read rather than assumed. Anything missing falls back to
 * the documented default in config.js.
 */
export function parseConfigUrls(res, defaults) {
  const data = unwrap(res, ['data']) ?? res ?? {};
  // This is the only place in the extension where a *response* decides where a
  // later request is sent, and every one of those requests carries the session
  // id in its query string — `?sessionId=` and `;jsessionid=`. So a base URL
  // that arrived over the wire is checked before it is trusted.
  //
  // `startsWith('http')` was not a check. It accepts `http://` — a plaintext
  // downgrade — and it accepts any host in the world, which would put a live
  // session id in someone else's access log. The cookie would not follow (the
  // manifest grants two hosts and no more) but the id in the query string is
  // already sent by the time CORS refuses the answer, and a session id is the
  // account until it expires.
  //
  // Rejecting falls back to the documented default, which is exactly what
  // `fetchUrls` already does when the call fails outright. A DEGIRO that moves
  // to a new hostname therefore degrades to the defaults rather than following
  // the new host, and that needs a manifest change anyway.
  const take = (key, fallback) => {
    const v = pick(data, [key]);
    if (typeof v !== 'string') return fallback;
    let url;
    try {
      url = new URL(v);
    } catch {
      return fallback;
    }
    if (url.protocol !== 'https:') return fallback;
    if (url.host !== TRADER_HOST) return fallback;
    return v;
  };
  return {
    trading: take('tradingUrl', defaults.trading),
    reporting: take('reportingUrl', defaults.reporting),
    productSearch: take('productSearchUrl', defaults.productSearch),
    pa: take('paUrl', defaults.pa),
  };
}

export function parseClient(res) {
  const data = unwrap(res, ['data']) ?? res ?? {};
  const intAccount = pick(data, ['intAccount', 'int_account']);
  const userToken = pick(data, ['id', 'userToken']);
  return {
    intAccount: intAccount == null ? null : Number(intAccount),
    userToken: userToken == null ? null : String(userToken),
    displayName: String(pick(data, ['displayName', 'username'], '')),
  };
}
