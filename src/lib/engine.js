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
 * A peak worth more than this many times everything ever paid in is not a
 * history, it is a unit error. Twenty is generous: a genuine twenty-bagger on
 * the whole account would trip it, and being told so is the right outcome.
 */
const IMPLAUSIBLE_MULTIPLE = 20;

/**
 * How far a quote may sit from the price actually paid before the series is
 * disowned. Wide on purpose: a fill is intraday against a close, and a non-EUR
 * instrument is counted at 1:1 until FX exists, which is another ~20% on top.
 *
 * Real mismatches seen in the field were 0.04x, 27x and 134,000,000x. Nothing
 * observed lands anywhere near the edge of this band, so it separates cleanly
 * without having to be tuned.
 */
const TRUST_BAND = [0.5, 2];

/**
 * How much the factor may drift between trades and still count as "the same
 * instrument in other units". A split adjustment is piecewise constant, so the
 * drift between two trades in the same regime is intraday noise; the field case
 * drifted 0.2% over two years. A series belonging to something else has no
 * reason to hold any ratio at all.
 */
const MAX_FACTOR_SPREAD = 5;

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
  /** 1 where a real quote exists at or before this day. */
  const covered = new Uint8Array(days.length);

  const points = series?.points ?? [];
  if (points.length === 0) {
    estimated.fill(1);
    return { close, estimated, covered };
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
    return { close, estimated, covered };
  }

  // Back-fill before the first quote. `covered` stays 0 here on purpose: this
  // is a guess, and after a reverse split it is a wildly wrong one — the first
  // available quote is in post-split money while the position is in pre-split
  // shares. The caller prefers the price actually traded on those days.
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
    covered[i] = 1;
  }

  return { close, estimated, covered };
}

/**
 * Audit a price series against the prices actually paid for it.
 *
 * Every transaction is hard evidence: on that day, that instrument changed
 * hands at that price. Comparing the two at the trade date is the only audit
 * trail this project has, and it settles a question nothing else can:
 *
 *  - ratio ~ 1 → the series and the ledger speak the same language. Use it.
 *  - ratio far from 1 but **stable** across trades → the same instrument in
 *    different units. Split-adjusted history against shares as they were booked
 *    at the time, or pence against pounds. Confirmed in the field: an
 *    instrument whose factor read 523,125 at a 2020 purchase and 522,000 at the
 *    2022 sale, two years and several reverse splits apart. The series is real;
 *    the share count needs converting into its units.
 *  - ratio far from 1 and **unstable** → nothing consistent relates the two.
 *    The series is not this instrument's history and cannot be used at all.
 *
 * Measured on real quotes only. Before a series' first quote the expansion
 * holds a back-filled guess, and comparing a fill against a guess would
 * manufacture a mismatch that is not there.
 *
 * @returns {{ratios, median, verdict: 'ok'|'rescale'|'reject', spread: number}}
 */
export function auditSeries(transactions, productId, close, dayIndex, covered) {
  const ratios = [];
  for (const t of transactions) {
    if (t.productId !== productId) continue;
    if (!(t.price > 0)) continue;
    const i = dayIndex.get(t.date);
    if (i === undefined) continue;
    if (covered && !covered[i]) continue;
    const quoted = close[i];
    if (!(quoted > 0)) continue;
    ratios.push({ date: t.date, index: i, traded: t.price, quoted, ratio: quoted / t.price });
  }

  if (!ratios.length) return { ratios, median: null, verdict: 'ok', spread: 1 };

  const sorted = ratios.map((r) => r.ratio).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const spread = sorted.at(-1) / sorted[0];

  if (median >= TRUST_BAND[0] && median <= TRUST_BAND[1]) return { ratios, median, verdict: 'ok', spread };
  if (spread > MAX_FACTOR_SPREAD) return { ratios, median, spread, verdict: 'reject' };

  // Smooth the factor within a split regime, so the conversion does not wobble
  // between one trade and the next. A genuine split is a jump far larger than
  // the tolerance and keeps its own regime.
  return { ratios: clusterFactors(ratios), median, spread, verdict: 'rescale' };
}

/**
 * Collapse near-equal factors onto one value per regime.
 *
 * Each day is reduced to a single ratio first. A factor converts units, and
 * units cannot change between two fills on the same day — but a volatile day
 * easily spans more than the regime tolerance, so clustering the raw fills
 * would hand two halves of the same purchase two different factors.
 */
function clusterFactors(ratios) {
  const REGIME_TOLERANCE = 1.25;
  const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  const perDay = new Map();
  for (const r of ratios) {
    if (!perDay.has(r.index)) perDay.set(r.index, []);
    perDay.get(r.index).push(r.ratio);
  }
  const days = [...perDay].map(([index, rs]) => ({ index, ratio: mid(rs) }));

  const clusters = [];
  for (const d of days.slice().sort((a, b) => a.ratio - b.ratio)) {
    const last = clusters.at(-1);
    if (last && d.ratio / last[0].ratio <= REGIME_TOLERANCE) last.push(d);
    else clusters.push([d]);
  }

  const factorOfDay = new Map();
  for (const c of clusters) {
    const f = mid(c.map((d) => d.ratio));
    for (const d of c) factorOfDay.set(d.index, f);
  }
  return ratios.map((r) => ({ ...r, ratio: factorOfDay.get(r.index) ?? r.ratio }));
}

/**
 * The factor in force on each day, from the nearest trade at or before it, held
 * flat before the first trade and after the last.
 */
function factorByDay(ratios, n) {
  const out = new Float64Array(n).fill(1);
  if (!ratios?.length) return out;
  let k = 0;
  let current = ratios[0].ratio;
  for (let i = 0; i < n; i++) {
    while (k < ratios.length && ratios[k].index <= i) current = ratios[k++].ratio;
    out[i] = Number.isFinite(current) && Math.abs(current) > 1e-12 ? current : 1;
  }
  return out;
}

/**
 * Daily exchange rates, derived from the account's own trades.
 *
 * SPEC §2.2 assumed FX would need a separate price series. It does not: every
 * foreign transaction already states both sides of the conversion. The price
 * and quantity are in the instrument's currency, and `totalPlusFeeInBaseCurrency`
 * is what actually left the account in euros. One divided by the other is the
 * rate DEGIRO itself applied that day.
 *
 *   rate = |price × quantity| ÷ |totalBase − fee|      (euros per unit)
 *
 * Checked against a real account: 267 euro-denominated trades return exactly
 * 1.0000, which is the formula proving itself. On the same account USD came out
 * at 0.86, HKD at 0.106 and SEK at 0.098 — all correct to the cent, and all of
 * them previously counted as 1.00.
 *
 * Between observations the rate is interpolated; outside them it is held flat.
 * A currency with no trade to observe keeps 1.0 and is reported, because
 * inventing a rate would be worse than admitting there is none.
 */
export function deriveFxRates(transactions, products, days, dayIndex, baseCurrency = 'EUR') {
  const perCurrency = new Map();

  for (const t of transactions) {
    const ccy = products[t.productId]?.currency ?? t.currency ?? baseCurrency;
    const i = dayIndex.get(t.date);
    if (i === undefined) continue;
    const grossCcy = Math.abs(t.price * t.quantity);
    const grossBase = Math.abs((t.totalBase ?? 0) - (t.fee ?? 0));
    if (!(grossCcy > 0) || !(grossBase > 0)) continue;
    if (!perCurrency.has(ccy)) perCurrency.set(ccy, []);
    perCurrency.get(ccy).push({ index: i, rate: grossBase / grossCcy });
  }

  const series = {};
  const report = [];

  for (const [ccy, raw] of perCurrency) {
    if (ccy === baseCurrency) continue;

    const all = raw.map((o) => o.rate).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];
    // A trade small enough for the fee to dominate, or a mis-booked row, can
    // land far from the truth. Rates cannot plausibly triple against the euro.
    const kept = raw.filter((o) => o.rate > median / 3 && o.rate < median * 3);

    // One rate per day, so several trades on the same day cannot fight.
    const byDay = new Map();
    for (const o of kept) {
      if (!byDay.has(o.index)) byDay.set(o.index, []);
      byDay.get(o.index).push(o.rate);
    }
    const points = [...byDay.entries()]
      .map(([index, rates]) => ({ index, rate: rates.sort((a, b) => a - b)[Math.floor(rates.length / 2)] }))
      .sort((a, b) => a.index - b.index);

    if (!points.length) continue;

    const arr = new Float64Array(days.length);
    let seg = 0;
    for (let i = 0; i < days.length; i++) {
      while (seg < points.length - 1 && points[seg + 1].index <= i) seg++;
      const a = points[seg];
      const b = points[seg + 1];
      if (i <= a.index || !b) arr[i] = a.rate;
      else if (i >= b.index) arr[i] = b.rate;
      else arr[i] = a.rate + ((b.rate - a.rate) * (i - a.index)) / (b.index - a.index);
    }
    series[ccy] = arr;
    report.push({
      currency: ccy,
      observations: points.length,
      median: Number(median.toPrecision(4)),
      low: Number(all[0].toPrecision(4)),
      high: Number(all.at(-1).toPrecision(4)),
      dropped: raw.length - kept.length,
    });
  }

  return { series, report };
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

  // ---- 1b. exchange rates, from the account's own trades -----------------
  const { series: fxSeries, report: fxReport } = deriveFxRates(transactions, products, days, dayIndex, baseCurrency);
  /** Euros per unit of `ccy` on day `i`. 1 for the base currency and for any
   *  currency we have no trade to learn from. */
  const fxAt = (ccy, i) => (ccy === baseCurrency ? 1 : (fxSeries[ccy]?.[i] ?? 1));
  const unknownCurrencies = new Set();

  // ---- 2. price series, before the ledger --------------------------------
  // The ledger depends on the prices: a reverse split means the quantities in
  // the transaction history and the quotes in the series are in different
  // units, and that has to be reconciled before either is used.
  const productIds = [...new Set(transactions.map((t) => t.productId))];
  /** @type {Map<string, {close, estimated, covered, meta, series}>} */
  const priceByProduct = new Map();

  for (const productId of productIds) {
    const meta = products[productId] ?? { id: productId, name: `Product ${productId}`, currency: baseCurrency };
    const series = meta.vwdId != null ? prices[meta.vwdId] : null;
    const expanded =
      series && series.points?.length
        ? expandSeries(series, days, dayIndex)
        : { close: new Float64Array(n), estimated: new Uint8Array(n).fill(1), covered: new Uint8Array(n) };
    priceByProduct.set(productId, { ...expanded, meta, hasSeries: !!(series && series.points?.length) });
  }

  // ---- 3. audit each series against the trades it should match ----------
  const rescaled = [];
  const rejected = [];
  for (const productId of productIds) {
    const entry = priceByProduct.get(productId);
    if (!entry.hasSeries) continue;
    const audit = auditSeries(transactions, productId, entry.close, dayIndex, entry.covered);
    entry.audit = audit;
    if (audit.verdict === 'ok') continue;

    const row = {
      productId,
      name: entry.meta.name,
      symbol: entry.meta.symbol || entry.meta.name,
      vwdId: entry.meta.vwdId ?? null,
      factor: Number(audit.median.toPrecision(6)),
      spread: Number(audit.spread.toPrecision(3)),
      sample: audit.ratios.slice(0, 3).map((r) => ({ date: r.date, traded: r.traded, quoted: round2(r.quoted) })),
    };

    if (audit.verdict === 'rescale') {
      rescaled.push(row);
    } else {
      // Nothing consistent links this series to these trades. Keep the
      // position, drop the series, value it at what it actually traded for.
      entry.hasSeries = false;
      entry.covered = new Uint8Array(n);
      rejected.push(row);
    }
  }

  // ---- 3b. position ledger, exactly as booked ----------------------------
  // The share count stays in the units DEGIRO booked it in, untouched. Where a
  // series quotes in other units the conversion happens at valuation, on the
  // price. Dividing each trade instead used to leave a closed round trip
  // holding a sliver of a share — 17.36 shares of a bankrupt company on one
  // real account — because two fills on one volatile day were measured against
  // one daily close and landed in different regimes. Converting the price
  // cannot do that: a position that nets to zero is worth zero whatever the
  // factor does.
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
    arr[i] += t.quantity;
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

  if (rescaled.length) {
    warn(
      'warn',
      'price-scale-adjusted',
      `${rescaled.length} instrument(s) quote in different units than their trades were booked in — a share ` +
        `split, or pence versus pounds. The quoted history is real; the quotes were converted back into the ` +
        `units your shares are booked in. Without this the value would be wrong by that factor.`,
      { instruments: rescaled.slice(0, 25) },
    );
  }

  if (rejected.length) {
    warn(
      'error',
      'price-series-mismatch',
      `${rejected.length} instrument(s) came back with a price history that cannot be reconciled with what you ` +
        `actually paid for them. Those positions are valued at their last traded price instead, so their ` +
        `movement between trades is not real.`,
      { instruments: rejected.slice(0, 25) },
    );
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
    if (ccy !== baseCurrency && !fxSeries[ccy] && Math.abs(arr[n - 1]) > 0.005) unknownCurrencies.add(ccy);
  }

  const cash = new Float64Array(n);
  for (const [ccy, arr] of Object.entries(cashSeriesByCurrency)) {
    for (let i = 0; i < n; i++) cash[i] += arr[i] * fxAt(ccy, i);
  }

  // ---- 4. valuation ------------------------------------------------------
  const positionsValue = new Float64Array(n);
  const estimatedDay = new Uint8Array(n);
  /** @type {Array<{productId, name, symbol, currency, values: Float64Array, qty: Float64Array}>} */
  const byProduct = [];
  const suspectedSplits = [];
  const noPriceSeries = [];
  const nonBaseCurrencies = new Set();

  for (const [productId, qty] of qtyByProduct) {
    const { close, estimated: priceEstimated, covered, meta, hasSeries } = priceByProduct.get(productId);

    // What this instrument actually changed hands for, forward-filled. Used on
    // days the series does not reach — a real price paid beats extrapolating
    // the first quote backwards, which after a split is off by the split factor.
    const traded = fallbackFromTrades(transactions, productId, days, dayIndex, meta);

    // Collected rather than warned about one by one: an account with 79 of
    // these produced 79 banners saying the same thing.
    if (!hasSeries) noPriceSeries.push({ productId, name: meta.name, vwdId: meta.vwdId ?? null });

    if (meta.currency && meta.currency !== baseCurrency) {
      nonBaseCurrencies.add(meta.currency);
      if (!fxSeries[meta.currency]) unknownCurrencies.add(meta.currency);
    }

    // A quote in different units than the ledger is divided back into the
    // ledger's units, so quantity x price is dimensionally sound. A price the
    // account actually paid is already in those units and is left alone.
    const audit = priceByProduct.get(productId).audit;
    const unit = audit?.verdict === 'rescale' ? factorByDay(audit.ratios, n) : null;

    const values = new Float64Array(n);
    let held = false;
    for (let i = 0; i < n; i++) {
      const q = qty[i];
      if (q === 0) continue;
      held = true;
      // Prefer a real quote; fall back to the last price actually paid.
      const quoted = covered[i] || !traded.close[i];
      const price = quoted ? (unit ? close[i] / unit[i] : close[i]) : traded.close[i];
      // Quotes are in the instrument's own currency; the portfolio is in euros.
      values[i] = q * price * fxAt(meta.currency ?? baseCurrency, i);
      positionsValue[i] += values[i];
      if (priceEstimated[i] || !covered[i]) estimatedDay[i] = 1;
    }

    if (!held) continue; // fully-closed position that never overlapped the window

    // Only worth guessing about instruments the audit could not judge. Where
    // trades exist to compare against, that evidence already settled it, and a
    // 40% day on a meme stock in 2021 is a market move, not a corporate action.
    if (!priceByProduct.get(productId).audit?.ratios?.length) {
      for (const hit of detectSplits(close, days, tradeDaysByProduct.get(productId) ?? new Set())) {
        const i = dayIndex.get(hit.date);
        if (qty[i] !== 0) suspectedSplits.push({ productId, name: meta.name, ...hit });
      }
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

  if (noPriceSeries.length) {
    warn(
      'warn',
      'no-price-series',
      `${noPriceSeries.length} instrument(s) have no price history at DEGIRO. They are valued at the last ` +
        `price they traded at, so their movement between trades is not real. Usually a delisting, or an ` +
        `instrument DEGIRO no longer carries a chart for.`,
      { instruments: noPriceSeries.slice(0, 40) },
    );
  }

  if (fxReport.length) {
    warn(
      'info',
      'fx-derived',
      `Converted ${fxReport.map((f) => f.currency).join(', ')} to ${baseCurrency} using the rates your own ` +
        `trades were settled at. Between trades the rate is interpolated, so a long gap without a trade in a ` +
        `currency is an estimate.`,
      { currencies: fxReport },
    );
  }

  if (unknownCurrencies.size > 0) {
    warn(
      'error',
      'fx-unknown',
      `No trade has ever shown what ${[...unknownCurrencies].join(', ')} is worth in ${baseCurrency}, so it is ` +
        `counted at 1:1 and the total is wrong by that much. This usually means a cash balance in a currency ` +
        `you have never traded in.`,
      { currencies: [...unknownCurrencies] },
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

  // ---- 6b. is this even a plausible history? -----------------------------
  // A portfolio cannot be worth many times everything ever paid into it plus
  // everything it is worth now. When it is, some quantity is in the wrong units
  // and the chart is fiction — that has to be said out loud rather than drawn
  // to a €450 million axis and left for the reader to notice.
  {
    let peakIdx = 0;
    for (let i = 1; i < n; i++) if (value[i] > value[peakIdx]) peakIdx = i;
    const peak = value[peakIdx];
    // Anchored on money paid in and on DEGIRO's own total — never on our own
    // last value, which in a unit error is inflated by the same factor as the
    // peak and would cancel the check out.
    const grounded = Math.max(Math.abs(cumulativeDeposited[n - 1]), Math.abs(liveTotal ?? 0), 1);
    if (peak > grounded * IMPLAUSIBLE_MULTIPLE) {
      const culprits = byProduct
        .map((p) => ({ name: p.name, productId: p.productId, at: p.values[peakIdx] }))
        .filter((p) => p.at > grounded)
        .sort((a, b) => b.at - a.at)
        .slice(0, 5)
        .map((p) => ({ ...p, at: round2(p.at) }));
      warn(
        'error',
        'implausible-history',
        `Peak reconstructed value of ${round2(peak)} on ${days[peakIdx]} is more than ` +
          `${IMPLAUSIBLE_MULTIPLE}x everything ever paid in (${round2(cumulativeDeposited[n - 1])}). ` +
          `That is not a real history — treat every chart except today's totals as wrong until it is explained.`,
        { peak: round2(peak), peakDate: days[peakIdx], investedTotal: round2(cumulativeDeposited[n - 1]), culprits },
      );
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

/**
 * The price this instrument actually traded at, forward-filled across the
 * window. Every day of it is an estimate — it is the last price paid, not a
 * market close — but it is real evidence about this instrument at this time,
 * which is more than can be said for extrapolating a future quote backwards.
 */
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
