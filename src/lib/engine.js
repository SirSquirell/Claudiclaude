/**
 * The reconstruction engine.
 *
 * SPEC §3: "engine.js must have zero I/O and zero Chrome API calls. It takes
 * plain arrays and returns plain arrays. That is the part that will have bugs,
 * and it is the only part that is cheaply testable."
 *
 * Inputs are the normalised types from parse.js. Output is a bundle of parallel
 * arrays, all indexed by the same `days` array, plus a few aggregates.
 *
 * The two numbers that matter, from SPEC §1.4:
 *   value[t] = cash[t] + Σ qty[p][t] · price[p][t]
 *   pnl[t]   = (value[t] − value[t−1]) − netExternalCashflow[t]
 */

import { addDays, dayRange, monthKey, startOfWeek, subMonths, todayISO, weekKey } from './dates.js';
import { CATEGORY, affectsCash, isExternal } from './classify.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A price series that is missing a day this far back is stale, not just closed. */
const STALE_PRICE_DAYS = 10;

/** A one-day move beyond this with no trade smells like an unadjusted split. */
const SPLIT_JUMP_RATIO = 0.4;

/**
 * @typedef {Object} EngineInput
 * @property {Array} transactions   normalised transactions (parse.parseTransactions)
 * @property {Array} cashRows       normalised cash movements (parse.parseCashMovements)
 * @property {Record<string,Object>} products  productId -> product metadata
 * @property {Record<string,{start:string,stepDays:number,points:Array}>} prices  vwdId -> raw series
 * @property {string} [today]       ISO day to end the series on
 * @property {number|null} [liveTotal]  DEGIRO's own current total, for reconciliation
 * @property {string} [baseCurrency]
 */

/**
 * Expand a raw vwd series ({start, stepDays, points:[{offsetDays, close}]}) onto
 * a continuous daily calendar, forward-filling non-trading days.
 *
 * SPEC §2.1: "The series ... only covers trading days. Forward-fill to a
 * continuous daily calendar before summing."
 *
 * Days before the first quote get the first quote back-filled and are marked
 * estimated; days after the last quote keep the last quote (a delisting freezes
 * rather than drops to zero, SPEC §6).
 *
 * @returns {{close: Float64Array, estimated: Uint8Array}}
 */
export function expandSeries(series, days, dayIndex) {
  const close = new Float64Array(days.length);
  const estimated = new Uint8Array(days.length);

  const points = series?.points ?? [];
  if (points.length === 0) {
    estimated.fill(1);
    return { close, estimated };
  }

  // Place each quote on its calendar day.
  const quoted = new Float64Array(days.length);
  const hasQuote = new Uint8Array(days.length);
  let firstIdx = -1;
  for (const p of points) {
    const iso = addDays(series.start, p.offsetDays);
    const idx = dayIndex.get(iso);
    if (idx === undefined) continue; // outside our window
    quoted[idx] = p.close;
    hasQuote[idx] = 1;
    if (firstIdx < 0) firstIdx = idx;
  }

  if (firstIdx < 0) {
    // Every quote fell outside the window. Use the nearest one we have.
    const nearest = points[points.length - 1].close;
    close.fill(nearest);
    estimated.fill(1);
    return { close, estimated };
  }

  // Back-fill before the first quote.
  for (let i = 0; i < firstIdx; i++) {
    close[i] = quoted[firstIdx];
    estimated[i] = 1;
  }

  // Forward-fill everything after it.
  let last = quoted[firstIdx];
  let daysSinceQuote = 0;
  for (let i = firstIdx; i < days.length; i++) {
    if (hasQuote[i]) {
      last = quoted[i];
      daysSinceQuote = 0;
    } else {
      daysSinceQuote++;
      // A weekend or a bank holiday is a normal gap and stays unflagged; a
      // fortnight of silence means the series is dead and the price is a guess.
      if (daysSinceQuote > STALE_PRICE_DAYS) estimated[i] = 1;
    }
    close[i] = last;
  }

  return { close, estimated };
}

/**
 * Flag day-over-day price jumps that look like an unadjusted corporate action.
 * SPEC §6: "Cross-check one known split against the reconstructed value before
 * trusting the chart." We cannot fix it automatically without the ratio, so we
 * surface it instead of silently drawing a cliff.
 */
function detectSplits(close, days, tradeDays) {
  const hits = [];
  for (let i = 1; i < close.length; i++) {
    const prev = close[i - 1];
    const cur = close[i];
    if (prev <= 0 || cur <= 0) continue;
    const ratio = cur / prev;
    if (ratio > 1 + SPLIT_JUMP_RATIO || ratio < 1 - SPLIT_JUMP_RATIO) {
      if (!tradeDays.has(days[i])) hits.push({ date: days[i], from: prev, to: cur, ratio });
    }
  }
  return hits;
}

/**
 * Reconstruct the whole history.
 * @param {EngineInput} input
 */
export function computePortfolio(input) {
  const {
    transactions = [],
    cashRows = [],
    products = {},
    prices = {},
    today = todayISO(),
    liveTotal = null,
    baseCurrency = 'EUR',
  } = input ?? {};

  const warnings = [];
  const warn = (level, code, message, detail) => warnings.push({ level, code, message, detail });

  // ---- 1. calendar -------------------------------------------------------
  const firstActivity = [
    ...transactions.map((t) => t.date),
    ...cashRows.map((c) => c.date),
  ].sort()[0];

  if (!firstActivity) {
    return emptyResult(today, warnings);
  }

  const start = firstActivity;
  const end = today >= start ? today : start;
  const days = dayRange(start, end);
  const n = days.length;
  const dayIndex = new Map(days.map((d, i) => [d, i]));

  /** Index of the day a dated row belongs to, clamped into the window. */
  const idxOf = (iso) => {
    const i = dayIndex.get(iso);
    if (i !== undefined) return i;
    return iso < start ? 0 : iso > end ? n - 1 : -1;
  };

  // ---- 2. position ledger ------------------------------------------------
  /** @type {Map<string, Float64Array>} productId -> qty per day */
  const qtyByProduct = new Map();
  const tradeDaysByProduct = new Map();

  for (const t of transactions) {
    const i = idxOf(t.date);
    if (i < 0) continue;
    let arr = qtyByProduct.get(t.productId);
    if (!arr) {
      arr = new Float64Array(n);
      qtyByProduct.set(t.productId, arr);
      tradeDaysByProduct.set(t.productId, new Set());
    }
    arr[i] += t.quantity; // deltas first, cumulated below
    tradeDaysByProduct.get(t.productId).add(t.date);
  }
  for (const arr of qtyByProduct.values()) {
    let running = 0;
    for (let i = 0; i < n; i++) {
      running += arr[i];
      // Kill floating-point dust so a fully sold position reads as exactly 0.
      if (Math.abs(running) < 1e-9) running = 0;
      arr[i] = running;
    }
  }

  // ---- 3. cash -----------------------------------------------------------
  const cashByCurrency = new Map(); // ccy -> Float64Array of daily deltas
  const netExternal = new Float64Array(n);
  const dividendGross = new Float64Array(n);
  const dividendTax = new Float64Array(n);
  const feesDaily = new Float64Array(n);
  const interestDaily = new Float64Array(n);
  const categoryTotals = {};
  let unclassified = 0;

  for (const row of cashRows) {
    const i = idxOf(row.date);
    if (i < 0) continue;
    const cat = row.category ?? CATEGORY.UNKNOWN;
    categoryTotals[cat] = (categoryTotals[cat] ?? 0) + row.change;

    if (affectsCash(cat)) {
      let arr = cashByCurrency.get(row.currency);
      if (!arr) {
        arr = new Float64Array(n);
        cashByCurrency.set(row.currency, arr);
      }
      arr[i] += row.change;
    }

    if (isExternal(cat)) {
      netExternal[i] += row.change;
    }

    switch (cat) {
      case CATEGORY.DIVIDEND:
        dividendGross[i] += row.change;
        break;
      case CATEGORY.DIVIDEND_TAX:
        dividendTax[i] += row.change;
        break;
      case CATEGORY.FEE:
        feesDaily[i] += row.change;
        break;
      case CATEGORY.INTEREST:
        interestDaily[i] += row.change;
        break;
      case CATEGORY.UNKNOWN:
        unclassified++;
        break;
      default:
        break;
    }
  }

  if (unclassified > 0) {
    warn(
      'warn',
      'unclassified-cash-rows',
      `${unclassified} cash movements could not be classified. They still move the cash ` +
        `balance but are treated as internal, so a mis-labelled deposit would show up as profit.`,
      { count: unclassified },
    );
  }

  // Cumulate cash per currency.
  const cashSeriesByCurrency = {};
  for (const [ccy, deltas] of cashByCurrency) {
    const arr = new Float64Array(n);
    let running = 0;
    for (let i = 0; i < n; i++) {
      running += deltas[i];
      arr[i] = running;
    }
    cashSeriesByCurrency[ccy] = arr;
    if (ccy !== baseCurrency && Math.abs(arr[n - 1]) > 0.005) {
      warn(
        'warn',
        'non-base-cash',
        `Cash balance in ${ccy} is counted at a 1:1 rate against ${baseCurrency}. ` +
          `Add an FX series (SPEC §2.2) before trusting the total.`,
        { currency: ccy, balance: round2(arr[n - 1]) },
      );
    }
  }

  const cash = new Float64Array(n);
  for (const arr of Object.values(cashSeriesByCurrency)) {
    for (let i = 0; i < n; i++) cash[i] += arr[i];
  }

  // ---- 4. valuation ------------------------------------------------------
  const positionsValue = new Float64Array(n);
  const estimatedDay = new Uint8Array(n);
  /** @type {Array<{productId, name, symbol, currency, values: Float64Array, qty: Float64Array}>} */
  const byProduct = [];
  const suspectedSplits = [];
  const nonBaseCurrencies = new Set();

  for (const [productId, qty] of qtyByProduct) {
    const meta = products[productId] ?? { id: productId, name: `Product ${productId}`, currency: baseCurrency };
    const series = meta.vwdId != null ? prices[meta.vwdId] : null;

    let close;
    let priceEstimated;
    if (series && series.points?.length) {
      ({ close, estimated: priceEstimated } = expandSeries(series, days, dayIndex));
    } else {
      // No price history at all: fall back to the last traded price, forward
      // filled. Better than a zero, and every day of it is flagged.
      ({ close, estimated: priceEstimated } = fallbackFromTrades(transactions, productId, days, dayIndex, meta));
      warn(
        'warn',
        'no-price-series',
        `No price history for ${meta.name} (${productId}). Valued at the last traded price; ` +
          `these days are marked estimated.`,
        { productId, vwdId: meta.vwdId ?? null },
      );
    }

    if (meta.currency && meta.currency !== baseCurrency) nonBaseCurrencies.add(meta.currency);

    const values = new Float64Array(n);
    let held = false;
    for (let i = 0; i < n; i++) {
      const q = qty[i];
      if (q === 0) continue;
      held = true;
      values[i] = q * close[i];
      positionsValue[i] += values[i];
      if (priceEstimated[i]) estimatedDay[i] = 1;
    }

    if (!held) continue; // fully-closed position that never overlapped the window

    for (const hit of detectSplits(close, days, tradeDaysByProduct.get(productId) ?? new Set())) {
      // Only interesting while we actually held the thing.
      const i = dayIndex.get(hit.date);
      if (qty[i] !== 0) suspectedSplits.push({ productId, name: meta.name, ...hit });
    }

    byProduct.push({
      productId,
      name: meta.name,
      symbol: meta.symbol || meta.name,
      currency: meta.currency ?? baseCurrency,
      productType: meta.productType ?? 'UNKNOWN',
      values,
      qty,
    });
  }

  if (nonBaseCurrencies.size > 0) {
    warn(
      'error',
      'fx-not-implemented',
      `Positions priced in ${[...nonBaseCurrencies].join(', ')} are summed into ${baseCurrency} at a ` +
        `1:1 rate. SPEC §2.2: this is a v1 limitation — the total is wrong by the FX drift.`,
      { currencies: [...nonBaseCurrencies] },
    );
  }

  if (suspectedSplits.length > 0) {
    warn(
      'warn',
      'suspected-split',
      `${suspectedSplits.length} price jump(s) over ${Math.round(SPLIT_JUMP_RATIO * 100)}% on a day with no ` +
        `trade. If the vwd series is not split-adjusted, the value before that date is wrong.`,
      { hits: suspectedSplits.slice(0, 20) },
    );
  }

  // ---- 5. value and P/L --------------------------------------------------
  const value = new Float64Array(n);
  const pnl = new Float64Array(n);
  for (let i = 0; i < n; i++) value[i] = cash[i] + positionsValue[i];
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? 0 : value[i - 1];
    pnl[i] = value[i] - prev - netExternal[i];
  }

  // ---- 6. aggregates -----------------------------------------------------
  const cumulativeDeposited = new Float64Array(n);
  {
    let running = 0;
    for (let i = 0; i < n; i++) {
      running += netExternal[i];
      cumulativeDeposited[i] = running;
    }
  }

  const dividendsByMonth = aggregateMonthly(days, dividendGross, dividendTax);
  const flowEvents = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(netExternal[i]) > 0.005) {
      flowEvents.push({ date: days[i], amount: round2(netExternal[i]), index: i });
    }
  }

  // ---- 7. reconciliation -------------------------------------------------
  const reconstructed = value[n - 1];
  let reconciliation = null;
  if (liveTotal != null && Number.isFinite(liveTotal)) {
    const diff = reconstructed - liveTotal;
    reconciliation = {
      reconstructed: round2(reconstructed),
      live: round2(liveTotal),
      diff: round2(diff),
      ok: Math.abs(diff) < 0.01,
    };
    if (!reconciliation.ok) {
      warn(
        'error',
        'reconciliation-failed',
        `Reconstructed total ${round2(reconstructed)} does not match DEGIRO's ${round2(liveTotal)} ` +
          `(off by ${round2(diff)}). SPEC §6: if today is wrong, the history is wrong too.`,
        reconciliation,
      );
    }
  }

  // Sort holdings by their peak contribution so the stacked chart is readable.
  byProduct.sort((a, b) => peak(b.values) - peak(a.values));

  return {
    days,
    start,
    end,
    baseCurrency,
    value: Array.from(value, round2),
    positionsValue: Array.from(positionsValue, round2),
    cash: Array.from(cash, round2),
    netExternal: Array.from(netExternal, round2),
    cumulativeDeposited: Array.from(cumulativeDeposited, round2),
    pnl: Array.from(pnl, round2),
    estimated: Array.from(estimatedDay),
    byProduct: byProduct.map((p) => ({
      productId: p.productId,
      name: p.name,
      symbol: p.symbol,
      currency: p.currency,
      productType: p.productType,
      values: Array.from(p.values, round2),
      qty: Array.from(p.qty),
      current: round2(p.values[n - 1]),
    })),
    cashByCurrency: Object.fromEntries(
      Object.entries(cashSeriesByCurrency).map(([k, v]) => [k, round2(v[n - 1])]),
    ),
    dividendsByMonth,
    flowEvents,
    income: {
      dividendGross: round2(sum(dividendGross)),
      dividendTax: round2(sum(dividendTax)),
      fees: round2(sum(feesDaily)),
      interest: round2(sum(interestDaily)),
    },
    totals: {
      value: round2(value[n - 1]),
      cash: round2(cash[n - 1]),
      positions: round2(positionsValue[n - 1]),
      invested: round2(cumulativeDeposited[n - 1]),
      totalPnl: round2(value[n - 1] - cumulativeDeposited[n - 1]),
      totalReturnPct:
        cumulativeDeposited[n - 1] > 0
          ? round2(((value[n - 1] - cumulativeDeposited[n - 1]) / cumulativeDeposited[n - 1]) * 100)
          : 0,
      estimatedDays: estimatedDay.reduce((a, b) => a + b, 0),
    },
    stats: { unclassified, categoryTotals: mapValues(categoryTotals, round2), transactions: transactions.length, cashRows: cashRows.length },
    reconciliation,
    warnings,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// aggregation helpers, also pure
// ---------------------------------------------------------------------------

/**
 * Collapse the daily P/L into day / week / month buckets for chart 2.
 * P/L is additive, so a bucket is just the sum of its days.
 *
 * @returns {{labels: string[], pnl: number[], cumulative: number[], starts: string[]}}
 */
export function aggregatePnl(days, pnl, granularity = 'day', fromIndex = 0, toIndex = days.length - 1) {
  const keyFn =
    granularity === 'week' ? weekKey : granularity === 'month' ? monthKey : (d) => d;
  const labelStart =
    granularity === 'week' ? startOfWeek : granularity === 'month' ? (d) => `${d.slice(0, 7)}-01` : (d) => d;

  const buckets = new Map();
  for (let i = fromIndex; i <= toIndex && i < days.length; i++) {
    if (i < 0) continue;
    const k = keyFn(days[i]);
    const b = buckets.get(k) ?? { key: k, start: labelStart(days[i]), pnl: 0 };
    b.pnl += pnl[i];
    buckets.set(k, b);
  }

  const ordered = [...buckets.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
  let running = 0;
  const cumulative = ordered.map((b) => (running += b.pnl));
  return {
    labels: ordered.map((b) => b.key),
    starts: ordered.map((b) => b.start),
    pnl: ordered.map((b) => round2(b.pnl)),
    cumulative: cumulative.map(round2),
  };
}

/**
 * Build the stacked composition for chart 3: cash plus the `topN` largest
 * holdings, everything else folded into "Other".
 *
 * Membership is decided on the *whole* history, not on the selected range.
 * That matters: the caller paints layer i with categorical slot i, so ranking
 * per range would repaint the survivors every time you click a range button —
 * a reader who learned "green is Shell" would be misled. `result.byProduct`
 * arrives sorted by all-time peak value, so the order here is already stable.
 */
export function buildComposition(result, topN = 6, fromIndex = 0, toIndex = result.days.length - 1) {
  const slice = (arr) => arr.slice(fromIndex, toIndex + 1);
  const ranked = result.byProduct;
  const top = ranked.slice(0, topN).filter((p) => peak(p.values) > 0);
  const rest = ranked.slice(top.length);

  const layers = top.map((p) => ({
    key: p.productId,
    productId: p.productId,
    label: p.symbol || p.name,
    values: slice(p.values),
  }));

  if (rest.length) {
    const other = new Array(toIndex - fromIndex + 1).fill(0);
    for (const p of rest) {
      for (let i = fromIndex; i <= toIndex; i++) other[i - fromIndex] += p.values[i];
    }
    if (peak(other) > 0) {
      layers.push({
        key: '__other__',
        label: `Other (${rest.length})`,
        members: rest.map((p) => p.productId),
        values: other.map(round2),
      });
    }
  }

  layers.push({ key: '__cash__', label: 'Cash', values: slice(result.cash) });

  return { days: slice(result.days), layers };
}

/**
 * Month-by-month results laid out as a year × month grid — the shape you need
 * to compare the same month across years, which a single row of bars over time
 * cannot show.
 *
 * Two numbers per cell, because they answer different questions:
 *
 *  - `pnl` is the euro result. Honest, but not comparable across years: €500 on
 *    a €10k portfolio and €500 on a €120k one are not the same month.
 *  - `returnPct` is a daily-chained time-weighted return,
 *    Π(1 + pnl[d]/value[d−1]) − 1. Because `pnl` already has external cashflow
 *    removed, a month with a big deposit is not flattered by it — which is the
 *    whole reason to chain daily rather than divide by the month's opening
 *    value.
 *
 * Days where the previous value is zero or negative contribute no return: there
 * was nothing invested to earn one on.
 */
export function monthlyTable(result) {
  const { days, pnl, value } = result;
  if (!days?.length) return { years: [], maxAbsPnl: 0, maxAbsPct: 0 };

  const cells = new Map(); // 'YYYY-MM' -> {pnl, factor, hasData}
  for (let i = 0; i < days.length; i++) {
    const key = monthKey(days[i]);
    const cell = cells.get(key) ?? { pnl: 0, factor: 1, hasData: false };
    cell.pnl += pnl[i];
    const prev = i === 0 ? 0 : value[i - 1];
    if (prev > 0) cell.factor *= 1 + pnl[i] / prev;
    cell.hasData = true;
    cells.set(key, cell);
  }

  const years = new Map();
  for (const [key, cell] of cells) {
    const [y, m] = key.split('-');
    const row = years.get(y) ?? { year: y, months: new Array(12).fill(null), pnl: 0, factor: 1 };
    row.months[Number(m) - 1] = { month: key, pnl: round2(cell.pnl), returnPct: round2((cell.factor - 1) * 100) };
    row.pnl += cell.pnl;
    row.factor *= cell.factor;
    years.set(y, row);
  }

  const rows = [...years.values()]
    .sort((a, b) => (a.year < b.year ? -1 : 1))
    .map((r) => ({
      year: r.year,
      months: r.months,
      total: { pnl: round2(r.pnl), returnPct: round2((r.factor - 1) * 100) },
    }));

  // Scale bounds for the colour ramp, computed over the cells only — a year
  // total is the sum of twelve months and would flatten every individual cell.
  let maxAbsPnl = 0;
  let maxAbsPct = 0;
  for (const r of rows) {
    for (const c of r.months) {
      if (!c) continue;
      maxAbsPnl = Math.max(maxAbsPnl, Math.abs(c.pnl));
      maxAbsPct = Math.max(maxAbsPct, Math.abs(c.returnPct));
    }
  }

  const best = (metric) => {
    let hi = null;
    let lo = null;
    for (const r of rows) {
      for (const c of r.months) {
        if (!c) continue;
        if (hi == null || c[metric] > hi[metric]) hi = c;
        if (lo == null || c[metric] < lo[metric]) lo = c;
      }
    }
    return { best: hi, worst: lo };
  };

  return { years: rows, maxAbsPnl, maxAbsPct, byPnl: best('pnl'), byPct: best('returnPct') };
}

function aggregateMonthly(days, gross, tax) {
  const buckets = new Map();
  for (let i = 0; i < days.length; i++) {
    if (gross[i] === 0 && tax[i] === 0) continue;
    const k = monthKey(days[i]);
    const b = buckets.get(k) ?? { month: k, gross: 0, tax: 0 };
    b.gross += gross[i];
    b.tax += tax[i];
    buckets.set(k, b);
  }
  return [...buckets.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((b) => ({ month: b.month, gross: round2(b.gross), tax: round2(b.tax), net: round2(b.gross + b.tax) }));
}

function fallbackFromTrades(transactions, productId, days, dayIndex, meta) {
  const close = new Float64Array(days.length);
  const estimated = new Uint8Array(days.length);
  estimated.fill(1);

  const known = new Map();
  for (const t of transactions) {
    if (t.productId === productId && t.price > 0) known.set(t.date, t.price);
  }
  if (meta?.closePrice > 0 && meta.closePriceDate) known.set(meta.closePriceDate, meta.closePrice);

  const dates = [...known.keys()].sort();
  if (dates.length === 0) return { close, estimated };

  let cursor = 0;
  let last = known.get(dates[0]);
  for (let i = 0; i < days.length; i++) {
    while (cursor < dates.length && dates[cursor] <= days[i]) last = known.get(dates[cursor++]);
    close[i] = last;
  }
  return { close, estimated };
}

function emptyResult(today, warnings) {
  return {
    days: [today],
    start: today,
    end: today,
    baseCurrency: 'EUR',
    value: [0],
    positionsValue: [0],
    cash: [0],
    netExternal: [0],
    cumulativeDeposited: [0],
    pnl: [0],
    estimated: [0],
    byProduct: [],
    cashByCurrency: {},
    dividendsByMonth: [],
    flowEvents: [],
    income: { dividendGross: 0, dividendTax: 0, fees: 0, interest: 0 },
    totals: { value: 0, cash: 0, positions: 0, invested: 0, totalPnl: 0, totalReturnPct: 0, estimatedDays: 0 },
    stats: { unclassified: 0, categoryTotals: {}, transactions: 0, cashRows: 0 },
    reconciliation: null,
    warnings: [...warnings, { level: 'info', code: 'no-data', message: 'No transactions or cash movements yet.' }],
    computedAt: new Date().toISOString(),
  };
}

function peak(arr, from = 0, to = arr.length - 1) {
  let m = 0;
  for (let i = from; i <= to && i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

function sum(arr) {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

/**
 * Resolve a range button ('1W','1M','3M','YTD','1Y','ALL') to a start index.
 */
export function rangeStartIndex(days, range) {
  if (!days.length) return 0;
  const last = days[days.length - 1];
  let from;
  switch (range) {
    // A week is seven days *including* today, not today plus seven.
    case '1W': from = addDays(last, -6); break;
    // Calendar months, so "1M" on 31 March starts at 28 February and not at a
    // 30-day approximation that drifts across long months.
    case '1M': from = subMonths(last, 1); break;
    case '3M': from = subMonths(last, 3); break;
    case '6M': from = subMonths(last, 6); break;
    case 'YTD': from = `${last.slice(0, 4)}-01-01`; break;
    case '1Y': from = subMonths(last, 12); break;
    default: return 0;
  }
  const i = days.findIndex((d) => d >= from);
  return i < 0 ? 0 : i;
}
