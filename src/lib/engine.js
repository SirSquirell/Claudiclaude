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

import { addDays, dayRange, monthKey, startOfMonth, startOfWeek, subMonths, todayISO, weekKey } from './dates.js';
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
 * How long an exchange rate may go unobserved before the stretch between two
 * observations is called an estimate. A quote older than ten days is already
 * flagged (`STALE_PRICE_DAYS`); leaving a rate unflagged for years while doing
 * that to prices was never defensible, and euros are what the whole page is
 * denominated in. A quarter is about as long as a straight line between two
 * rates stays honest.
 */
const STALE_FX_DAYS = 92;

/** Five years. A ceiling, not a default — see US-33: past it the band is so
 *  wide the picture stops distinguishing anything. */
const MAX_HORIZON_MONTHS = 60;

/**
 * Below this many **independent** stretches, a scenario is an example, not
 * history.
 *
 * The word that was missing is *independent*. `rollingOutcomes` slides its
 * window one month at a time, so five and a half years of history yields eight
 * five-year windows that share fifty-nine of their sixty months. Those are not
 * eight observations; they are about one, and the card on screen already said
 * so — *"treat 8 as fewer independent observations than it looks"* — while the
 * code counted them as eight and called the result `historical`.
 *
 * A tester's account rode that straight to a projection of **€ 89 million** on
 * a portfolio worth thirty-three thousand.
 *
 * The overlapping windows are still what the distribution is measured from —
 * they are real months and throwing them away loses information. What changes
 * is that the *right to call it history* is gated on how many genuinely
 * separate stretches there are, which is `floor(months / horizon)`.
 */
const MIN_WINDOWS = 3;

/**
 * Beyond this annual rate, in either direction, the number is not describing a
 * market and must not be drawn as a projection.
 *
 * Deliberately a wide band rather than a tuned one, and it is a judgement, so
 * here is the reasoning: the three lines are labelled *good market*, *expected
 * market* and *bad market*. No broad equity market has compounded near this
 * over five years in either direction. A rate outside it is therefore not a
 * market outcome at all — it is an account whose measured history is dominated
 * by something else, which on the accounts that produced it meant deposits
 * landing a day out of step with the positions they bought.
 *
 * Refusing beats clamping. Clamping would invent a number, and this project's
 * standing rule is that a figure must not look more confident than it is.
 */
const PLAUSIBLE_ANNUAL = 50;

/**
 * How far the rates implied by one instrument's own trades may disagree before
 * they stop being a currency.
 *
 * A real exchange rate moves. EUR/USD spanned roughly 1.03 to 1.25 over the
 * histories these accounts cover, which is about 1.2 end to end, so the band
 * has to be wider than that or a genuine multi-year holding is refused. It must
 * also be tight enough that a set of ratios measuring something *other* than a
 * currency — a contract size, a split, a fee model — falls outside it.
 */
const MAX_IMPLIED_FX_SPREAD = 1.6;

/**
 * Beyond this, a rescale factor is estimated rather than measured.
 *
 * Well inside `MAX_FACTOR_SPREAD`, which decides whether the series is usable
 * at all. This decides whether the number may be described as measured — the
 * same distinction 0.29.0 drew for contract sizes, where a row claimed
 * `verdict: 'measured'` beside `anchored: false` and the UI believed the
 * confident half.
 */
const SHAKY_FACTOR_SPREAD = 1.25;

/**
 * Smallest currency conversion, in the base currency, that states a usable rate.
 *
 * Both legs are rounded to the cent, so the rate a conversion states carries a
 * relative error of roughly `0.005 / amount`. At €1 that is half a percent,
 * which is already the size of a real move; below it the number is noise, and a
 * residual-cent sweep divides to exactly 1.0000. See `fxFromConversions`.
 */
const MIN_FX_LEG = 1;

/**
 * How far a measured contract size may sit from a whole number before it is
 * disowned rather than rounded. A contract size counts shares, so it is an
 * integer; 99.7 is a stale snapshot price and 103 is a corporate action. A
 * measurement landing on 87.3 is neither, and rounding it would manufacture a
 * plausible wrong number.
 */
const CONTRACT_SIZE_TOLERANCE = 0.03;

/**
 * How far measurements of one instrument's contract size may disagree with each
 * other. This is the check that carries the weight: a contract size is fixed, so
 * every trade in the same instrument has to produce the same number, and a
 * measurement that will not repeat is not a measurement. Distance from a whole
 * number cannot tell "87 after a corporate action" from "wrong"; disagreement
 * between two trades can.
 *
 * Loose enough to absorb an interpolated exchange rate — ordinary USD shares
 * measure 0.999 with observations 17% apart, and none of that is a contract
 * size. Tight enough that a hundred one day and forty the next does not pass.
 */
const CONTRACT_SIZE_SPREAD = 1.5;

/**
 * How close a trade must sit to a stated exchange rate for its contract-size
 * measurement to be trusted. Inside this window the rate is the one DEGIRO
 * applied, or a short interpolation between two of them; outside it, a straight
 * line across months carries percents of error, and a contract size is an
 * integer that a percent of error can move to the wrong one.
 */
const FX_OBSERVATION_WINDOW = 20;

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
/** Sum a set of daily series into UTC calendar years. */
function byYear(days, seriesByName) {
  const out = {};
  for (let i = 0; i < days.length; i++) {
    const year = days[i].slice(0, 4);
    const row = (out[year] ??= {});
    for (const [name, arr] of Object.entries(seriesByName)) {
      row[name] = (row[name] ?? 0) + (arr[i] ?? 0);
    }
  }
  for (const row of Object.values(out)) {
    for (const k of Object.keys(row)) row[k] = round2(row[k]);
  }
  return out;
}

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
 * Every currency conversion DEGIRO booked, as a dated rate.
 *
 * A conversion is two cash rows: one leg out in the foreign currency, one leg
 * in in euros. They carry consecutive `sourceId`s and the same `productId`,
 * which pairs them exactly even on a day holding several conversions in
 * several currencies. Dividing one leg by the other is the rate DEGIRO itself
 * applied, to the cent, on a known date.
 *
 * This is the only unambiguous rate in the data. A trade states its rate too,
 * but multiplied by the instrument's contract size, and there is no way to
 * separate the two without already knowing one of them.
 *
 * **A conversion smaller than `MIN_FX_LEG` states no usable rate**, and the
 * reason is arithmetic rather than caution. Both legs are rounded to the cent,
 * so the rate carries a relative error of about `0.005 / amount`: on a €500
 * conversion that is a thousandth of a percent, and on a €0.01 one it is fifty
 * percent. Worse, the two roundings are independent, so a residual-cent sweep
 * — €0.01 out, $0.01 in — divides to **exactly 1.0000**, which is not a rate
 * any real currency pair has ever had.
 *
 * A real account reported `fx-derived` for USD with four observations, a median
 * of 0.8647 and a high of exactly 1. One junk observation in four, interpolated
 * across a 1 554-day gap, prices years of holdings.
 *
 * Dropping it is not a guess (rule 4): it is declining to use a measurement
 * whose error bar is wider than the thing being measured. The count is reported
 * so the decision is visible rather than silent.
 */
export function fxFromConversions(cashRows, dayIndex, baseCurrency = 'EUR') {
  const rows = cashRows
    .filter((c) => c.category === 'FX' && Number.isFinite(Number(c.sourceId)) && Math.abs(c.change) > 0)
    .sort((a, b) => Number(a.sourceId) - Number(b.sourceId));

  const out = [];
  /** Pairs too small to state a rate. Counted, never silently discarded. */
  const dropped = [];
  out.dropped = dropped;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (Number(b.sourceId) - Number(a.sourceId) !== 1) continue;
    if (String(a.productId ?? '') !== String(b.productId ?? '')) continue;
    if ((a.currency === baseCurrency) === (b.currency === baseCurrency)) continue;

    const [base, other] = a.currency === baseCurrency ? [a, b] : [b, a];
    const index = dayIndex.get(other.date);
    if (index === undefined) continue;
    i++; // both legs consumed, whether or not the pair is usable
    if (Math.abs(base.change) < MIN_FX_LEG) {
      dropped.push({ currency: other.currency, index });
      continue;
    }
    out.push({ currency: other.currency, index, rate: Math.abs(base.change) / Math.abs(other.change) });
  }
  return out;
}

/**
 * How many shares one unit of an instrument covers, measured per product.
 *
 * A share is one share. An option contract is a hundred of them, or ten, or —
 * after a corporate action — a hundred and three. The number is not derivable
 * from the exchange, the underlying or the product type, and hardcoding a table
 * of contract sizes would be wrong for exactly the instrument that matters, so
 * it is measured from what the account actually paid:
 *
 *   |totalBase − fee| ÷ |price × quantity| = contractSize × rate
 *
 * With the rate known from currency conversions, the contract size falls out.
 * It counts shares, so it is a whole number; a measurement that will not round
 * to one within `CONTRACT_SIZE_TOLERANCE` is reported rather than guessed at.
 *
 * Without this every option was valued at a tenth to a hundredth of its size.
 * On a real account that put the total €39 758,03 above what DEGIRO reported,
 * with 27 written puts booked as if each contract covered a single share.
 */
export function deriveContractSizes(transactions, products, fxAt, baseCurrency = 'EUR', observedAt = {}, dayIndex = null) {
  // Where a rate was actually stated, the measurement is exact. Between two
  // observations it rides an interpolated rate, and that error lands straight on
  // the contract size: a true 100 measured through a rate 2% out reads 102 and
  // rounds there, silently, with the verdict still saying "measured". So a trade
  // near an observation is worth more than one far from it, and if any of an
  // instrument's trades are near enough, the far ones are not used at all.
  const nearObservation = (ccy, date) => {
    if (ccy === baseCurrency) return true; // no rate, no error
    const seen = observedAt[ccy];
    const i = dayIndex?.get(date);
    if (!seen?.length || i === undefined) return false;
    return seen.some((o) => Math.abs(o - i) <= FX_OBSERVATION_WINDOW);
  };

  const perProduct = new Map();
  for (const t of transactions) {
    const meta = products[t.productId];
    const ccy = meta?.currency ?? t.currency ?? baseCurrency;
    const grossCcy = Math.abs(t.price * t.quantity);
    const grossBase = Math.abs((t.totalBase ?? 0) - (t.fee ?? 0));
    if (!(grossCcy > 0) || !(grossBase > 0)) continue;
    const rate = fxAt(ccy, t.date);
    if (!(rate > 0)) continue;
    if (!perProduct.has(t.productId)) perProduct.set(t.productId, { near: [], far: [] });
    const bucket = nearObservation(ccy, t.date) ? 'near' : 'far';
    perProduct.get(t.productId)[bucket].push(grossBase / grossCcy / rate);
  }

  const sizes = {};
  const report = [];
  for (const [productId, buckets] of perProduct) {
    // Trades near a stated rate if there are any; otherwise all of them, with
    // the reduced confidence recorded rather than hidden.
    const measured = buckets.near.length ? buckets.near : buckets.far;
    const anchored = buckets.near.length > 0;
    const sorted = measured.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (!(median > 0)) continue;

    const rounded = Math.round(median);
    const residual = rounded > 0 ? Math.abs(median - rounded) / rounded : Infinity;
    const spread = sorted.at(-1) / sorted[0];
    const agrees = spread <= CONTRACT_SIZE_SPREAD;
    // One is the overwhelming case and needs no reporting; anything else is a
    // claim about the instrument and is written down with its evidence.
    if (rounded === 1 && residual <= CONTRACT_SIZE_TOLERANCE && agrees) continue;

    const meta = products[productId] ?? {};
    const row = {
      productId,
      name: meta.name ?? `Product ${productId}`,
      symbol: meta.symbol || meta.name || productId,
      productType: meta.productType ?? 'UNKNOWN',
      measured: Number(median.toPrecision(6)),
      size: rounded,
      residualPct: Number((residual * 100).toPrecision(3)),
      observations: measured.length,
      anchored,
      spread: Number(spread.toPrecision(3)),
    };

    if (!(rounded >= 1) || residual > CONTRACT_SIZE_TOLERANCE || !agrees) {
      report.push({ ...row, size: null, verdict: 'unresolved' });
      continue;
    }
    sizes[productId] = rounded;
    // **`measured` means measured.** A size derived through an interpolated
    // exchange rate is an estimate, and calling it anything else is the whole of
    // B11: the report already carried `anchored: false` and the verdict beside
    // it said "measured", so the row contradicted itself and the UI believed the
    // confident half.
    //
    // The number is still used. Falling back to one share per contract would be
    // a hundredfold error in place of an eight percent one, and the
    // reconciliation is what catches the remainder — on the synthetic account it
    // names the instrument and the euros. But it is reported as what it is.
    report.push({ ...row, verdict: anchored ? 'measured' : 'estimated' });
  }
  return { sizes, report };
}

/** Split observations into regimes an order of magnitude apart. */
function rateClusters(rates) {
  const sorted = rates.slice().sort((a, b) => a.rate - b.rate);
  const groups = [];
  for (const r of sorted) {
    const last = groups.at(-1);
    if (last && r.rate / last[0].rate <= 3) last.push(r);
    else groups.push([r]);
  }
  return groups;
}

/**
 * Daily exchange rates, from the account's own books.
 *
 * Two sources, in order of how much they can be trusted:
 *
 *  1. **Currency conversions.** Exact, dated, and independent of anything else
 *     — see `fxFromConversions`. Used whenever the account has any.
 *  2. **Trades**, as a fallback: `|totalBase − fee| ÷ |price × quantity|`. For a
 *     share that is the rate. For a derivative it is the rate times the
 *     contract size, so the observations for one currency cluster at the rate,
 *     ten times it, a hundred times it. The lowest cluster is taken, since a
 *     contract size is never below one.
 *
 * Deriving from trades alone is what put CHF at 107 and DKK at 13.39 on a real
 * account — a hundredfold, because the median landed on the option cluster and
 * the outlier filter then discarded the correct observations as noise. A
 * DKK position was charted at €1 040 993.
 *
 * GBX is pence and GBP is pounds, so either gives the other. Between
 * observations the rate is interpolated and outside them it is held flat; a gap
 * longer than `STALE_FX_DAYS` is reported, because a straight line across five
 * years is a guess with a confident face on it. A currency with nothing to
 * observe keeps 1.0 and says so.
 */
export function deriveFxRates(transactions, products, days, dayIndex, baseCurrency = 'EUR', cashRows = []) {
  const conversions = new Map();
  const observed = fxFromConversions(cashRows, dayIndex, baseCurrency);
  for (const o of observed) {
    if (o.currency === baseCurrency) continue;
    if (!conversions.has(o.currency)) conversions.set(o.currency, []);
    conversions.get(o.currency).push(o);
  }
  /** Per currency, how many conversions were too small to state a rate. */
  const tooSmall = {};
  for (const d of observed.dropped ?? []) tooSmall[d.currency] = (tooSmall[d.currency] ?? 0) + 1;

  const trades = new Map();
  for (const t of transactions) {
    const ccy = products[t.productId]?.currency ?? t.currency ?? baseCurrency;
    if (ccy === baseCurrency) continue;
    const index = dayIndex.get(t.date);
    if (index === undefined) continue;
    const grossCcy = Math.abs(t.price * t.quantity);
    const grossBase = Math.abs((t.totalBase ?? 0) - (t.fee ?? 0));
    if (!(grossCcy > 0) || !(grossBase > 0)) continue;
    if (!trades.has(ccy)) trades.set(ccy, []);
    trades.get(ccy).push({ index, rate: grossBase / grossCcy });
  }

  /** @type {Map<string, {points: Array<{index, rate}>, source: string, dropped: number}>} */
  const chosen = new Map();
  for (const ccy of new Set([...conversions.keys(), ...trades.keys()])) {
    if (conversions.has(ccy)) {
      chosen.set(ccy, { raw: conversions.get(ccy), source: 'conversions', dropped: tooSmall[ccy] ?? 0 });
      continue;
    }
    const raw = trades.get(ccy) ?? [];
    if (!raw.length) continue;
    const lowest = rateClusters(raw)[0];
    chosen.set(ccy, { raw: lowest, source: 'trades', dropped: raw.length - lowest.length });
  }

  // Pence and pounds are the same currency, so their observations are pooled
  // rather than chosen between. Picking one loses the other: an account that
  // trades in pence but converts in pounds has a three-year-old GBX trade and a
  // GBP conversion from this week, and taking the trade prices today's holding
  // at a rate from 2023.
  for (const [from, to, factor] of [
    ['GBP', 'GBX', 1 / 100],
    ['GBX', 'GBP', 100],
  ]) {
    if (!chosen.has(from)) continue;
    const src = chosen.get(from);
    const converted = src.raw.map((o) => ({ ...o, rate: o.rate * factor }));
    const existing = chosen.get(to);
    if (!existing) {
      chosen.set(to, { raw: converted, source: from.toLowerCase(), dropped: 0 });
    } else if (src.source === 'conversions' && existing.source !== 'conversions') {
      // A stated rate outranks an inferred one, so the pooled set is led by it.
      chosen.set(to, {
        raw: [...existing.raw, ...converted],
        source: `${existing.source}+${from.toLowerCase()}`,
        dropped: existing.dropped,
      });
    }
  }

  const series = {};
  const report = [];
  /** Days on which a rate was actually observed, per currency. */
  const observedAt = {};

  for (const [ccy, { raw, source, dropped }] of chosen) {
    // One rate per day, so two conversions on one day cannot fight.
    const byDay = new Map();
    for (const o of raw) {
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
    observedAt[ccy] = points.map((p) => p.index);

    // How far this currency is ever extrapolated or interpolated, so the UI can
    // say which stretches of the chart rest on a straight line.
    let widestGap = points[0].index;
    for (let k = 1; k < points.length; k++) widestGap = Math.max(widestGap, points[k].index - points[k - 1].index);
    widestGap = Math.max(widestGap, days.length - 1 - points.at(-1).index);

    const all = points.map((p) => p.rate).sort((a, b) => a - b);
    report.push({
      currency: ccy,
      source,
      observations: points.length,
      median: Number(all[Math.floor(all.length / 2)].toPrecision(4)),
      low: Number(all[0].toPrecision(4)),
      high: Number(all.at(-1).toPrecision(4)),
      dropped,
      widestGapDays: widestGap,
      stale: widestGap > STALE_FX_DAYS,
    });
  }

  // A currency whose every conversion was too small has no rate at all, and it
  // must still appear here. Falling back to 1:1 and saying nothing is precisely
  // the silent wrong number the project exists to avoid — and it is the state
  // one real account is in, where the only USD evidence was a residual sweep.
  for (const [ccy, count] of Object.entries(tooSmall)) {
    if (series[ccy]) continue;
    report.push({
      currency: ccy,
      source: 'none',
      observations: 0,
      median: null,
      low: null,
      high: null,
      dropped: count,
      widestGapDays: days.length,
      stale: true,
    });
  }

  return { series, report, observedAt };
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
    liveCash = null,
    livePositions = null,
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
  const { series: fxSeries, report: fxReport, observedAt: fxObservedAt } = deriveFxRates(transactions, products, days, dayIndex, baseCurrency, cashRows);
  /** Euros per unit of `ccy` on day `i`. 1 for the base currency and for any
   *  currency we have no trade to learn from. */
  const fxAt = (ccy, i) => (ccy === baseCurrency ? 1 : (fxSeries[ccy]?.[i] ?? 1));
  const unknownCurrencies = new Set();

  // ---- 1b. how many shares one unit of each instrument covers -------------
  // Needs the rates above and nothing else, and everything downstream needs it:
  // an option contract is not one share, and valuing it as one understates the
  // position by its contract size.
  const { sizes: contractSizes, report: contractReport } = deriveContractSizes(
    transactions,
    products,
    (ccy, date) => fxAt(ccy, dayIndex.get(date) ?? 0),
    baseCurrency,
    fxObservedAt,
    dayIndex,
  );
  const unitsOf = (productId) => contractSizes[productId] ?? 1;
  const unresolvedSizes = contractReport.filter((r) => r.verdict === 'unresolved');

  // ---- 2. price series, before the ledger --------------------------------
  // The ledger depends on the prices: a reverse split means the quantities in
  // the transaction history and the quotes in the series are in different
  // units, and that has to be reconciled before either is used.
  const productIds = [...new Set(transactions.map((t) => t.productId))];
  /** @type {Map<string, {close, estimated, covered, meta, series}>} */
  /**
   * The two halves of what moved through each product, and what it paid out.
   *
   * The engine already carries the *net* per product — that is what the
   * per-holding result rests on — but "what did I put in and what came back
   * out" needs them apart, and a net figure cannot be split back into them.
   *
   * `bought` and `sold` are money, not quantities: what left and what returned,
   * in the base currency. `dividend` is what actually landed, gross plus the
   * withholding tax (which is negative), so it is the net cash received.
   *
   * A dividend row with no `productId` cannot be attributed to anything, and is
   * counted rather than dropped — the same rule that makes an unclassified cash
   * row visible instead of quietly absent.
   */
  const boughtByProduct = new Map();
  const boughtQtyByProduct = new Map();
  const soldByProduct = new Map();
  const dividendByProduct = new Map();
  let unattributedDividend = 0;

  for (const t of transactions) {
    const spent = -(t.totalBase ?? 0);
    const target = spent >= 0 ? boughtByProduct : soldByProduct;
    target.set(t.productId, (target.get(t.productId) ?? 0) + Math.abs(spent));
    // The quantity bought, alongside the money, so an average price can be
    // formed from the two without a cost-basis convention entering anywhere.
    if (spent >= 0 && t.quantity > 0) {
      boughtQtyByProduct.set(t.productId, (boughtQtyByProduct.get(t.productId) ?? 0) + t.quantity);
    }
  }

  for (const row of cashRows) {
    if (row.category !== CATEGORY.DIVIDEND && row.category !== CATEGORY.DIVIDEND_TAX) continue;
    const id = row.productId == null || row.productId === '' ? null : String(row.productId);
    if (id === null) {
      unattributedDividend++;
      continue;
    }
    dividendByProduct.set(id, (dividendByProduct.get(id) ?? 0) + row.change);
  }

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
  /**
   * Euros that moved into a position on a day: a buy is money in, a sale is
   * money out. It is to one instrument exactly what `netExternal` is to the
   * account, and it is what makes a per-holding result computable without
   * arguing about cost basis — see `pnlOf` below.
   *
   * `totalBase` is what actually settled, fee included, and it is already
   * signed the right way round by DEGIRO: negative when money left to buy. The
   * sign is flipped here so that "into the position" is positive, matching
   * `netExternal`'s convention for the account.
   */
  const tradedByProduct = new Map();

  for (const t of transactions) {
    const i = idxOf(t.date);
    if (i < 0) continue;
    let arr = qtyByProduct.get(t.productId);
    if (!arr) {
      arr = new Float64Array(n);
      qtyByProduct.set(t.productId, arr);
      tradedByProduct.set(t.productId, new Float64Array(n));
      tradeDaysByProduct.set(t.productId, new Set());
    }
    arr[i] += t.quantity;
    tradedByProduct.get(t.productId)[i] += -t.totalBase;
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
    /**
     * A factor measured from trades that disagree with each other is not a
     * measurement.
     *
     * One account rescaled an instrument by 0,223 with a spread of **1,6** —
     * the trades behind the factor differed by sixty percent. `MAX_FACTOR_SPREAD`
     * is 5, so it sailed through and the factor was applied to the whole series
     * as if it were known.
     *
     * 0.29.0 fixed the same shape one level up: a contract size reported
     * `anchored: false` and `verdict: 'measured'` side by side, and the UI
     * believed the confident half. The answer there was to stop calling it
     * measured, and it is the answer here. The factor is still used — falling
     * back would be a hundredfold error in place of a proportional one — but
     * the ones resting on disagreeing evidence are counted and named, so a
     * reader can tell a pence-to-pounds conversion apart from a guess.
     */
    const shaky = rescaled.filter((r) => r.spread > SHAKY_FACTOR_SPREAD);
    warn(
      'warn',
      'price-scale-adjusted',
      `${rescaled.length} instrument(s) quote in different units than their trades were booked in — a share ` +
        `split, or pence versus pounds. The quoted history is real; the quotes were converted back into the ` +
        `units your shares are booked in. Without this the value would be wrong by that factor.` +
        (shaky.length
          ? ` ${shaky.length} of them ${shaky.length === 1 ? 'rests' : 'rest'} on trades that disagree with each ` +
            `other by more than a quarter, so ${shaky.length === 1 ? 'that factor is' : 'those factors are'} ` +
            `estimated rather than measured.`
          : ''),
      { instruments: rescaled.slice(0, 25), shaky: shaky.length },
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

  /**
   * A trade that says it settled in the base currency, and did not.
   *
   * When an instrument is in euros, `|totalBase| − |fee|` has to equal
   * `|price × quantity|`. It is the same number twice. On a tester's account it
   * was not: rows reading `currency: "EUR"` settled at **0,851** of what they
   * traded for — which is not a rounding difference, it is the dollar rate of
   * the day, on trades nothing had marked as foreign.
   *
   * Either DEGIRO sent no currency and `parse.js` filled in `'EUR'`, or it sent
   * one that does not describe the amount beside it. This does not decide which
   * — it says the two disagree, which nothing did before, and CLAUDE.md's note
   * about the parsers applies exactly: **loose parsing that silently returns a
   * plausible value is worse than a loud failure.** A holding treated as
   * domestic when it is foreign is valued without conversion, and that is a
   * chart wrong by the exchange rate with nothing on screen to say so.
   *
   * The tolerance is deliberately wide. This is hunting for a currency-sized
   * discrepancy, not auditing rounding, and a narrow band would fire on every
   * account over fractional shares and fee models nobody has modelled.
   */
  const settledMismatches = [];
  /** productId -> the dated conversions its own trades state. See below. */
  const impliedFx = new Map();
  for (const t of transactions) {
    const ccy = products[t.productId]?.currency ?? t.currency ?? baseCurrency;
    if (ccy !== baseCurrency) continue;
    const traded = Math.abs(t.price * t.quantity);
    const settled = Math.abs((t.totalBase ?? 0) - (t.fee ?? 0));
    if (!(traded > 0) || !(settled > 0)) continue;
    const r = settled / traded;
    if (r > 0.98 && r < 1.02) continue;
    const id = String(t.productId);
    settledMismatches.push({ productId: id, ratio: Number(r.toPrecision(4)) });
    const i = dayIndex.get(t.date);
    if (i !== undefined) {
      if (!impliedFx.has(id)) impliedFx.set(id, []);
      impliedFx.get(id).push({ date: t.date, index: i, ratio: r });
    }
  }

  /**
   * Use the rate the trades state, rather than the currency the record claims.
   *
   * 0.37.0 detected the disagreement and stopped there, because resolving it
   * changes numbers on somebody's screen and that is not a patch. This is the
   * resolution, and it needs no guess about *which* currency the instrument is
   * in — which is fortunate, because there is no way to know.
   *
   * The evidence is already complete. `|totalBase| − |fee|` over
   * `|price × quantity|` is the conversion DEGIRO itself applied, to the cent,
   * on a known date. That is the same construction `fxFromConversions` uses for
   * currency rows, and it is the strongest kind of evidence in this data: not a
   * field that might be wrong, but two amounts whose ratio can only be a rate.
   *
   * So the instrument keeps its stated currency for every other purpose and is
   * *valued* through its own dated conversions, interpolated between trades the
   * way every other rate here is.
   *
   * **Two guards, both refusals.** A single observation states a rate on one
   * day and nothing about any other, and a set of observations that disagree
   * with each other is not measuring a currency at all — it is measuring
   * something else, and applying its median would replace a visible error with
   * an invisible one. Either way the instrument is left alone and the warning
   * still fires, which is 0.37.0's behaviour and the honest floor.
   */
  const impliedRates = new Map();
  const impliedRejected = [];
  for (const [id, obs] of impliedFx) {
    const sorted = [...obs].sort((a, b) => a.index - b.index);
    const rates = sorted.map((o) => o.ratio).sort((a, b) => a - b);
    const spread = rates.at(-1) / rates[0];
    if (sorted.length < 2 || spread > MAX_IMPLIED_FX_SPREAD) {
      impliedRejected.push({ productId: id, observations: sorted.length, spread: Number(spread.toPrecision(3)) });
      continue;
    }
    impliedRates.set(id, sorted);
  }

  if (settledMismatches.length) {
    const affected = new Set(settledMismatches.map((m) => m.productId));
    const sorted = settledMismatches.map((m) => m.ratio).sort((a, b) => a - b);
    const median = Number(sorted[Math.floor(sorted.length / 2)].toPrecision(4));
    const fixed = impliedRates.size;
    warn(
      fixed === affected.size ? 'warn' : 'error',
      'settled-amount-mismatch',
      `${settledMismatches.length} trade(s) across ${affected.size} instrument(s) are booked in ${baseCurrency} but ` +
        `settled for a different amount than they traded for — a median of ${median}×. That ratio is what an ` +
        `exchange rate looks like, so those instruments are probably not in ${baseCurrency} at all. ` +
        (fixed
          ? `${fixed} of them state a consistent rate across at least two trades and ${fixed === 1 ? 'is' : 'are'} ` +
            `now valued through it. `
          : '') +
        (fixed < affected.size
          ? `${affected.size - fixed} do not — one trade only, or trades that disagree — and ${
              affected.size - fixed === 1 ? 'is' : 'are'
            } still valued without the conversion ${affected.size - fixed === 1 ? 'it needs' : 'they need'}.`
          : ''),
      {
        trades: settledMismatches.length,
        instruments: affected.size,
        resolved: fixed,
        ratios: sorted.slice(0, 20),
        unresolved: impliedRejected.slice(0, 20),
      },
    );
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
    // Interpolated between the trades that state it, exactly as every other
    // rate in this file is. `null` for the ordinary case.
    const implied = impliedRates.has(String(productId))
      ? factorByDay(impliedRates.get(String(productId)), n)
      : null;
    // A quote is per share. One unit of this instrument covers this many.
    const shares = unitsOf(productId);

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
      // An instrument whose own trades state a conversion is valued through it,
      // whatever currency its record claims. See `impliedRates`.
      values[i] = q * price * shares * (implied ? implied[i] : fxAt(meta.currency ?? baseCurrency, i));
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

    // SPEC §1.4, applied to one instrument instead of to the account: what a
    // position made is how its value moved, less the money put into it. A buy
    // is this position's deposit and a sale is its withdrawal.
    //
    // The reason to build it this way rather than from a cost basis: **no cost
    // basis has to be chosen.** FIFO against average cost is an argument with no
    // right answer, and this question never needs one. A position closed inside
    // the window is worth zero at both ends, so its trades are all that is left
    // and the sum *is* the realised result; a position still held gives what it
    // gained plus anything realised on the way. One expression, both cases.
    //
    // Day zero has no previous day, so it opens against zero — the same
    // convention the account-level `pnl` uses ten lines up, which makes a
    // position bought on the first day score nothing rather than its full value.
    const tradedIn = tradedByProduct.get(productId) ?? new Float64Array(n);
    const productPnl = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      productPnl[i] = values[i] - (i === 0 ? 0 : values[i - 1]) - tradedIn[i];
    }

    // How much of this position is your own money, running.
    //
    // `value = paidIn + result`, exactly, at every point, and with no cost-basis
    // convention anywhere near it — which is what makes "how much of this is
    // what I put in, and how much is what it made" answerable at all. It goes
    // negative when you have taken out more than you put in, and that is a real
    // state rather than an error: the position is running on the market's money.
    const paidIn = new Float64Array(n);
    let stillIn = 0;
    for (let i = 0; i < n; i++) {
      stillIn += tradedIn[i];
      paidIn[i] = stillIn;
    }

    byProduct.push({
      productId,
      isin: meta.isin ?? null,
      bought: boughtByProduct.get(productId) ?? 0,
      boughtQty: boughtQtyByProduct.get(productId) ?? 0,
      sold: soldByProduct.get(productId) ?? 0,
      dividend: dividendByProduct.get(productId) ?? 0,
      name: meta.name,
      symbol: meta.symbol || meta.name,
      currency: meta.currency ?? baseCurrency,
      productType: meta.productType ?? 'UNKNOWN',
      contractSize: shares,
      paidIn,
      // Whether this instrument has a price series at all. Without one it is
      // held flat at the last price it traded at, so its movement between
      // trades is not real — diluted in a total, but the whole of a
      // per-holding result, which is why the row needs to say so.
      hasSeries,
      values,
      qty,
      pnl: productPnl,
    });
  }

  if (noPriceSeries.length) {
    warn(
      'warn',
      'no-price-series',
      `${noPriceSeries.length} instrument(s) have never had a price history at DEGIRO. They are valued at the ` +
        `last price they traded at, so their movement between trades is not real. Usually a delisting, or an ` +
        `instrument DEGIRO no longer carries a chart for. This is a permanent property of the instrument, not ` +
        `a series that failed to arrive this sync — that is counted separately, as "series not fetched".`,
      { instruments: noPriceSeries.slice(0, 40) },
    );
  }

  if (fxReport.length) {
    const fromConversions = fxReport.filter((f) => f.source === 'conversions').length;
    warn(
      'info',
      'fx-derived',
      `Converted ${fxReport.map((f) => f.currency).join(', ')} to ${baseCurrency}${
        fromConversions ? `, ${fromConversions} of them at the rate DEGIRO itself applied when it moved the money` : ''
      }. Between observations the rate is interpolated.`,
      { currencies: fxReport },
    );
  }

  const staleFx = fxReport.filter((f) => f.stale);
  if (staleFx.length) {
    /**
     * How much of today's total is riding on a rate nobody has observed lately.
     *
     * The warning said a rate was stale and left the reader to guess whether
     * that mattered. It matters in proportion to what is held in that currency,
     * and that is computable: the positions in it, plus the cash balance in it,
     * over the total. Every account holding a foreign currency reported this
     * warning, with gaps from 358 to 1 746 days, and none of them could say
     * whether the answer was "a rounding error" or "a fifth of your portfolio".
     *
     * A share, not a euro amount, so it travels in the bug report — and it is
     * the number that decides whether a half-percent reconciliation gap is
     * explained by this or not.
     */
    /**
     * `cash + positionsValue`, not `value`.
     *
     * `value` is the same sum — and it is declared eighty lines *below* this,
     * so reading it here threw `Cannot access 'value' before initialization`
     * and took the whole page down on a tester's account. Second temporal-dead-
     * zone defect of the day, both mine, both from reaching for a name that
     * reads correctly and does not exist yet.
     */
    const totalNow = Math.abs(cash[n - 1] + positionsValue[n - 1]) || 1;
    for (const f of staleFx) {
      let exposed = Math.abs(cashSeriesByCurrency[f.currency]?.[n - 1] ?? 0) * (fxSeries[f.currency]?.[n - 1] ?? 1);
      for (const p of byProduct) {
        if (products[p.productId]?.currency !== f.currency) continue;
        exposed += Math.abs(p.values[n - 1] ?? 0);
      }
      f.exposureShare = Number((exposed / totalNow).toFixed(4));
    }
    const worst = [...staleFx].sort((a, b) => (b.exposureShare ?? 0) - (a.exposureShare ?? 0))[0];
    warn(
      'warn',
      'fx-stale',
      `${staleFx.map((f) => `${f.currency} (${f.widestGapDays} days)`).join(', ')} went that long without a rate ` +
        `to observe, so the euro value of anything held in it over that stretch is a straight line between two ` +
        `points rather than the real rate. ` +
        `Today ${Math.round((worst.exposureShare ?? 0) * 100)}% of your total is held in ${worst.currency}, so ` +
        `that is roughly how much of the figure moves if the rate is wrong.`,
      { currencies: staleFx },
    );
  }

  if (unknownCurrencies.size > 0) {
    warn(
      'error',
      'fx-unknown',
      `Nothing in your account has ever shown what ${[...unknownCurrencies].join(', ')} is worth in ` +
        `${baseCurrency}, so it is counted at 1:1 and the total is wrong by that much. This usually means a cash ` +
        `balance in a currency you have never traded or converted.`,
      { currencies: [...unknownCurrencies] },
    );
  }

  // `estimated` *is* the unanchored case now, so this reads the verdict rather
  // than reconstructing it. Written the old way it silently stopped matching
  // the moment the verdict was corrected, and the warning would have vanished
  // along with the lie it was compensating for.
  const unanchoredSizes = contractReport.filter((r) => r.verdict === 'estimated');
  if (unanchoredSizes.length) {
    warn(
      'warn',
      'contract-size-unanchored',
      `${unanchoredSizes.length} instrument(s) had no stated exchange rate near any of their trades, so how many ` +
        `shares one contract covers was measured through an interpolated rate. It is the best available answer and ` +
        `it is a whole number, but a rate a few percent out moves it to the neighbouring one — treat their value as ` +
        `approximate. Converting more often in that currency would settle it.`,
      { instruments: unanchoredSizes.slice(0, 25) },
    );
  }

  if (unresolvedSizes.length) {
    warn(
      'error',
      'contract-size-unresolved',
      `${unresolvedSizes.length} instrument(s) do not settle at a whole number of shares per unit — what the ` +
        `account paid does not divide cleanly by the quoted price. They are valued as one share per unit, which ` +
        `is a guess, so treat their value as unknown rather than small.`,
      { instruments: unresolvedSizes.slice(0, 25) },
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

  // Days the account traded, and what it did. The value chart already marks the
  // days money went in or out; it marks nothing for the days a decision was
  // made, which is the question people actually ask of that line — "where did I
  // buy this". One entry per day rather than per trade, because five fills of
  // one order are one decision and would otherwise draw five arrows.
  const tradeDays = new Map();
  for (const t of transactions) {
    const i = idxOf(t.date);
    if (i < 0 || !t.quantity) continue;
    let e = tradeDays.get(i);
    if (!e) {
      e = { date: t.date, index: i, buys: 0, sells: 0, symbols: new Set() };
      tradeDays.set(i, e);
    }
    if (t.quantity > 0) e.buys++;
    else e.sells++;
    const sym = products?.[t.productId]?.symbol || products?.[t.productId]?.name;
    if (sym) e.symbols.add(String(sym));
  }
  const tradeEvents = [...tradeDays.values()]
    .sort((a, b) => a.index - b.index)
    .map((e) => ({
      date: e.date,
      index: e.index,
      buys: e.buys,
      sells: e.sells,
      // Two names is a label; ten is a wall. The rest are counted.
      names: [...e.symbols].slice(0, 3),
      more: Math.max(0, e.symbols.size - 3),
    }));

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
  // Two checks, and the first one is the strict one. Quantities are ours to get
  // right: DEGIRO states the size of every open position, and any disagreement
  // is a defect in the ledger with no innocent explanation. Values are not
  // wholly ours — a quote is a price at a moment, and DEGIRO's own two sources
  // disagree with each other on illiquid instruments, where /update carries a
  // last trade that can be older than the daily close. So the total is still
  // reported to the cent, but the residual is attributed per position rather
  // than left as a number to shrug at.
  const positionMismatches = [];
  if (Array.isArray(livePositions) && livePositions.length) {
    const held = new Map(byProduct.map((p) => [String(p.productId), p]));
    for (const live of livePositions) {
      const id = String(live.productId ?? live.id ?? '');
      // /update lists the cash funds among the positions — 'EUR', 'FLATEX_EUR'.
      // They are balances, not instruments, and they are counted as cash.
      if (!products[id]) continue;
      const theirs = Number(live.size ?? live.quantity);
      if (!Number.isFinite(theirs)) continue;
      const ours = held.get(id)?.qty[n - 1] ?? 0;
      if (Math.abs(ours - theirs) > 1e-6) {
        positionMismatches.push({
          productId: id,
          name: products[id]?.name ?? held.get(id)?.name ?? `Product ${id}`,
          ours: Number(ours.toPrecision(10)),
          theirs,
        });
      }
    }
    for (const p of byProduct) {
      const q = p.qty[n - 1];
      if (Math.abs(q) < 1e-9) continue;
      const id = String(p.productId);
      if (!products[id]) continue;
      if (!livePositions.some((l) => String(l.productId ?? l.id ?? '') === id)) {
        positionMismatches.push({ productId: id, name: p.name, ours: Number(q.toPrecision(10)), theirs: 0 });
      }
    }
  }

  if (positionMismatches.length) {
    warn(
      'error',
      'position-mismatch',
      `${positionMismatches.length} position(s) do not match what DEGIRO reports you hold: ` +
        `${positionMismatches.slice(0, 4).map((m) => `${m.name} (${m.ours} vs ${m.theirs})`).join(', ')}` +
        `${positionMismatches.length > 4 ? ', and more' : ''}. The share counts come from your transaction ` +
        `history, so a difference means the history is incomplete or misread — and the whole chart rests on it.`,
      { positions: positionMismatches.slice(0, 25) },
    );
  }

  const reconstructed = value[n - 1];

  /**
   * When DEGIRO states no total, add up the parts it *does* state.
   *
   * Two real accounts in a row came back with `reconciliation: null`, both
   * listing the same fourteen field names under `totalPortfolio` — every one of
   * them a cash figure, none of them net liquidity. That is not an anomaly to
   * note, it is the normal case for these accounts, and it leaves rule 6's
   * acceptance test absent exactly where the history is longest and the price
   * rescales are worst.
   *
   * But the pieces are there. DEGIRO states a value per open position and a
   * cash balance, and those sum to the same quantity the missing field would
   * have held. Crucially it is **not circular**: those are DEGIRO's prices and
   * DEGIRO's share counts, while `reconstructed` is our valuation of our own
   * ledger. A wrong share count, a mis-scaled series, a bad FX rate or a
   * dropped instrument still shows up as a difference.
   *
   * It is weaker than a stated total in one specific way — it cannot catch an
   * error DEGIRO's own position values share — so it is labelled `derived`
   * wherever it surfaces rather than presented as DEGIRO's own figure.
   *
   * The guards are deliberately strict. A partial sum silently compared against
   * a full one would report a shortfall that is not real, and crying wolf on
   * the one check the whole project rests on is worse than the check being
   * absent. So: every held position must carry a finite value, there must be at
   * least one, the cash figure must be finite, and the share counts must
   * already agree — if they do not, `position-mismatch` above is the finding
   * and a total is beside the point.
   */
  let anchor = liveTotal;
  let anchorSource = liveTotal != null && Number.isFinite(liveTotal) ? 'reported' : null;

  if (anchorSource === null && Number.isFinite(liveCash) && !positionMismatches.length && Array.isArray(livePositions)) {
    let sum = 0;
    let counted = 0;
    let complete = true;
    for (const live of livePositions) {
      const id = String(live.productId ?? live.id ?? '');
      // Same test the position check above uses: a row we have no product for
      // is a cash fund, not an instrument, and `liveCash` already covers it.
      if (!products[id]) continue;
      // `live.value == null` first, and not merely `Number.isFinite`: `Number(null)`
      // is 0, which is finite, so a position DEGIRO gave no value for would have
      // been silently counted as worth nothing — a partial sum wearing the face
      // of a complete one, which is the exact failure these guards exist to stop.
      const v = live.value == null ? NaN : Number(live.value);
      if (!Number.isFinite(v)) {
        complete = false;
        break;
      }
      sum += v;
      counted++;
    }
    /**
     * `counted > 0` **or** we hold nothing either.
     *
     * The guard was there to stop a partial sum wearing the face of a complete
     * one, and it does — but it also refused the one case that is complete by
     * definition. A real account came back with `reconciliation: null` on an
     * emptied portfolio: every position closed, so `counted` was 0, so no anchor,
     * so rule 6's acceptance test never ran on the account where it was easiest.
     * DEGIRO stated the cash and we had reconstructed the cash; there was nothing
     * missing except permission to compare them.
     *
     * The condition is our own ledger holding nothing, not DEGIRO reporting
     * nothing — if we think we hold something and DEGIRO lists none of it, that
     * disagreement is `position-mismatch` above and a total would paper over it.
     */
    const heldByUs = byProduct.reduce((k, p) => k + (Math.abs(p.qty[n - 1]) > 1e-9 ? 1 : 0), 0);
    if (complete && (counted > 0 || heldByUs === 0)) {
      anchor = sum + Number(liveCash);
      anchorSource = 'derived';
    }
  }

  let reconciliation = null;
  if (anchor != null && Number.isFinite(anchor)) {
    const liveTotal = anchor; // eslint-disable-line no-shadow -- the rest of this block reads better named
    const diff = reconstructed - liveTotal;
    const attribution = [];
    if (Array.isArray(livePositions) && livePositions.length) {
      const theirValue = new Map(livePositions.map((l) => [String(l.productId ?? l.id ?? ''), Number(l.value)]));
      for (const p of byProduct) {
        if (Math.abs(p.qty[n - 1]) < 1e-9) continue;
        const mine = p.values[n - 1];
        const theirs = theirValue.get(String(p.productId));
        if (!Number.isFinite(theirs)) continue;
        if (Math.abs(mine - theirs) > 0.5) {
          attribution.push({ name: p.name, ours: round2(mine), theirs: round2(theirs), diff: round2(mine - theirs) });
        }
      }
      attribution.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    }

    reconciliation = {
      reconstructed: round2(reconstructed),
      live: round2(liveTotal),
      diff: round2(diff),
      ok: Math.abs(diff) < 0.01,
      positionsAgree: positionMismatches.length === 0,
      /**
       * `reported` — DEGIRO stated a total. `derived` — it did not, and this is
       * the sum of the position values and the cash balance it did state. The
       * page says which, because the second cannot catch an error DEGIRO's own
       * position values already contain, and a check must not look stronger
       * than it is.
       */
      source: anchorSource,
      /**
       * Where the total splits, so the residual can be located.
       *
       * Two testers' accounts came back with the same signature — off by half a
       * percent, **every** share count agreeing, and **zero** instruments
       * disagreeing by more than fifty cents. That combination says the
       * residual is not in the positions at all, and the report had no way to
       * say where it *was*: it carried one ratio and stopped.
       *
       * These two turn into ratios in `report.js` and never travel as amounts.
       * A residual that is a sensible fraction of the cash balance, on an
       * account holding a foreign currency with a stale rate, is a very
       * different finding from one that is not — and neither could be told
       * apart before.
       */
      cash: round2(cash[n - 1]),
      positions: round2(positionsValue[n - 1]),
      attribution: attribution.slice(0, 10),
    };

    if (!reconciliation.ok) {
      const led = attribution[0];
      warn(
        positionMismatches.length ? 'error' : 'warn',
        'reconciliation-failed',
        `Reconstructed total ${round2(reconstructed)} does not match DEGIRO's ${round2(liveTotal)} ` +
          `(off by ${round2(diff)}).` +
          (positionMismatches.length
            ? ' Your positions do not match either, so the history is wrong — see above.'
            : led
              ? ` Every share count matches what DEGIRO reports, so this is a difference in prices, not in the ledger;` +
                ` the largest is ${led.name} at ${led.diff}, where DEGIRO's last trade and the daily close disagree.`
              : // Every share count agrees *and* no single position is out by
                // more than fifty cents, so the residual is not in the
                // instruments at all — it is in the cash balance. Two testers'
                // accounts hit exactly this and were told "a difference in
                // prices", which sent the reader looking in the one place the
                // difference demonstrably was not.
                ` Every share count matches what DEGIRO reports and no individual position disagrees, so the` +
                ` difference is in the cash balance rather than in any holding — most likely the exchange rate` +
                ` used for money held in another currency.`),
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
    /**
     * **Rounded for reading, exact for summing.**
     *
     * `pnl` and `netExternal` used to be rounded to cents here like everything
     * else, and it produced a wrong number on a real account: the Result tile
     * sums a window of daily figures, and 2 000 values each rounded by up to half
     * a cent drifted **15 cents** away from the truth — 16,71 on screen where the
     * engine's own `totals.totalPnl` said 16,56. Visibly wrong, too, because
     * `value = paid in + result` then does not add up on the page.
     *
     * The drift grows with the length of the history rather than the size of the
     * account, so it is worst on exactly the accounts this project is for. And it
     * is CLAUDE.md rule 2 in miniature: a derived number was written down, read
     * back as an input, and 2 000 small lies became one visible one.
     *
     * So the two series a caller is expected to *add up* keep full precision, and
     * the rounding happens where it belongs — in the formatters, at the edge.
     * `value`, `cash` and the rest are levels rather than addends: nobody sums a
     * value series, so rounding those costs nothing and keeps the payload and the
     * tooltips clean.
     */
    value: Array.from(value, round2),
    positionsValue: Array.from(positionsValue, round2),
    cash: Array.from(cash, round2),
    netExternal: Array.from(netExternal),
    cumulativeDeposited: Array.from(cumulativeDeposited, round2),
    pnl: Array.from(pnl),
    estimated: Array.from(estimatedDay),
    byProduct: byProduct.map((p) => ({
      productId: p.productId,
      isin: p.isin,
      bought: round2(p.bought),
      boughtQty: p.boughtQty,
      sold: round2(p.sold),
      dividend: round2(p.dividend),
      name: p.name,
      symbol: p.symbol,
      currency: p.currency,
      productType: p.productType,
      contractSize: p.contractSize,
      hasSeries: p.hasSeries,
      values: Array.from(p.values, round2),
      qty: Array.from(p.qty),
      // Summed per window by the positions table and by the share card, so the
      // same rule applies one level down: exact for summing.
      pnl: Array.from(p.pnl),
      paidIn: Array.from(p.paidIn, round2),
      current: round2(p.values[n - 1]),
    })),
    cashByCurrency: Object.fromEntries(
      Object.entries(cashSeriesByCurrency).map(([k, v]) => [k, round2(v[n - 1])]),
    ),
    dividendsByMonth,
    flowEvents,
    tradeEvents,
    /**
     * The same four figures, per calendar year.
     *
     * A yearly review needs them split and the totals cannot be, so they are
     * aggregated here rather than by re-walking the cash rows in the UI — the
     * engine already holds the daily series, and a second implementation of
     * "which year is this row in" is a second place to get a boundary wrong.
     * Years are UTC calendar years, like every other date in this project.
     */
    incomeByYear: byYear(days, { dividendGross, dividendTax, fees: feesDaily, interest: interestDaily }),
    income: {
      dividendGross: round2(sum(dividendGross)),
      dividendTax: round2(sum(dividendTax)),
      fees: round2(sum(feesDaily)),
      interest: round2(sum(interestDaily)),
    },
    /**
     * Split of the account result into what is banked and what is still riding
     * on prices. Realised is every closed position's whole result; unrealised is
     * what the open ones have made so far. Together they are the position
     * result, which is not the account result — cash earns and loses too, and
     * `report.js` records why.
     */
    realised: round2(
      byProduct
        .filter((p) => Math.abs(p.qty[n - 1]) < 1e-9)
        .reduce((a, p) => a + sum(p.pnl), 0),
    ),
    unrealised: round2(
      byProduct
        .filter((p) => Math.abs(p.qty[n - 1]) >= 1e-9)
        .reduce((a, p) => a + sum(p.pnl), 0),
    ),
    /** Days valued from a real quote, against days valued from a stale one. */
    coverage: {
      days: n,
      estimated: Array.from(estimatedDay).filter(Boolean).length,
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
    /** Dividend rows DEGIRO did not attach to a product. Counted, never dropped. */
    unattributedDividends: unattributedDividend,
    stats: { unclassified, categoryTotals: mapValues(categoryTotals, round2), transactions: transactions.length, cashRows: cashRows.length },
    fx: fxReport,
    contracts: contractReport,
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
/**
 * The cumulative result as candles: open, high, low and close per bucket.
 *
 * **Built on the deposit-free curve, and that is the whole point.** A candle on
 * portfolio value would say a deposit was volatility: the high of a month is
 * its maximum daily total, so paying 10 000 in on the 12th raises it by 10 000
 * and the candle draws a long upper wick where nothing swung — money arrived.
 * That is SPEC §1.4 rebuilt inside a new chart, by the project whose reason for
 * existing is that error. The running sum of `pnl` already has external
 * cashflow removed, so a long wick here means what a long wick means.
 *
 * A day has one number, so a daily candle is a flat dash: four times the ink
 * for the same value, and a chart that looks like it is describing volatility
 * while describing nothing. The caller only offers this at week and month.
 */
export function candleSeries(days, pnl, granularity = 'month', fromIndex = 0, toIndex = days.length - 1) {
  const keyFn = granularity === 'week' ? weekKey : monthKey;
  const labelStart = granularity === 'week' ? startOfWeek : startOfMonth;

  const buckets = new Map();
  let running = 0;
  for (let i = Math.max(0, fromIndex); i <= toIndex && i < days.length; i++) {
    const k = keyFn(days[i]);
    let b = buckets.get(k);
    if (!b) {
      // The bucket opens where the previous one closed, so the candles form one
      // continuous curve rather than a row of independent little charts.
      b = { key: k, start: labelStart(days[i]), open: running, high: running, low: running, close: running };
      buckets.set(k, b);
    }
    running += pnl[i];
    b.high = Math.max(b.high, running);
    b.low = Math.min(b.low, running);
    b.close = running;
  }

  const ordered = [...buckets.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
  return {
    labels: ordered.map((b) => b.key),
    starts: ordered.map((b) => b.start),
    candles: ordered.map((b) => ({
      open: round2(b.open),
      high: round2(b.high),
      low: round2(b.low),
      close: round2(b.close),
      up: b.close >= b.open,
    })),
  };
}

export function aggregatePnl(days, pnl, granularity = 'day', fromIndex = 0, toIndex = days.length - 1) {
  const keyFn =
    granularity === 'week' ? weekKey : granularity === 'month' ? monthKey : (d) => d;
  const labelStart =
    granularity === 'week' ? startOfWeek : granularity === 'month' ? startOfMonth : (d) => d;

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
 * holdings inside the selected window, everything else folded into "Other".
 *
 * **Membership is decided inside the window; nothing outside it votes.** It used
 * to be decided on the whole history, which meant a position that peaked in 2021
 * and was sold in 2022 outranked everything bought since — it passed the filter,
 * took one of the categorical slots, and then drew a flat zero across a 2026
 * range while a position actually held sat in "Other".
 *
 * That was not a trade-off for colour stability, though it looked like one. The
 * charting rule is *colour follows the instrument, not its rank*, and the old
 * code satisfied it by accident: the caller painted layer i with slot i, so one
 * decision was doing two jobs. They are separate questions. Which instruments
 * get a layer belongs to the window. Which hue an instrument gets belongs to the
 * instrument — so each layer carries a `preferredSlot` derived from its all-time
 * rank, and the caller resolves collisions the way `monthColours` already does.
 *
 * Ranking is by **mean value across the window**, not by peak. Over the whole
 * history the two agree closely, but over one year they do not: a position that
 * spiked for a single day outranks one that sat steadily large for twelve
 * months, and the second one is the answer to "what was this portfolio, then".
 */
/**
 * Time-weighted return across a window, as a percentage.
 *
 * The same daily chaining `monthlyTable` uses — Π(1 + pnl[d]/value[d−1]) − 1 —
 * and for the same reason: `pnl` already has external cashflow removed, so a
 * deposit landing inside the window cannot flatter the number. Dividing the
 * window's result by its opening value would let one, which is exactly the
 * error this project exists to avoid.
 *
 * Days with nothing invested contribute nothing: there was no capital to earn a
 * return on.
 */
export function windowReturnPct(result, fromIndex = 0, toIndex = result.days.length - 1) {
  let factor = 1;
  let any = false;
  for (let i = Math.max(1, fromIndex); i <= toIndex && i < result.days.length; i++) {
    const prev = result.value[i - 1];
    if (usableReturnDay(prev, result.pnl[i])) {
      factor *= 1 + result.pnl[i] / prev;
      any = true;
    }
  }
  return any ? (factor - 1) * 100 : 0;
}

/**
 * Is this day's ratio a return, or an artefact?
 *
 * `prev > 0` was the whole guard, and it is not enough. It excludes a day that
 * began with nothing, and admits a day that began with two cents — where five
 * euros of movement is a factor of 250, and a chain of those is a number like
 * the **+291 949 %** and **−60 006 %** a tester's account put on screen. Those
 * are not returns anyone earned; they are the first days of an account, when
 * a deposit and the trade it paid for land a day apart and `pnl` briefly
 * absorbs capital that the cashflow record has not caught up with.
 *
 * The rule is scale-free rather than a euro floor, because a euro floor is
 * arbitrary at both ends — wrong for an account that trades in tens, and wrong
 * again for one that trades in millions:
 *
 * > **A day's result cannot exceed everything that was invested at the start of
 * > it.** If it does, capital moved during the day and the ledger disagrees
 * > about when. That is a bookkeeping artefact, not a hundredfold gain.
 *
 * Excluding the sub-period rather than capping it is the standard treatment —
 * GIPS drops sub-periods with no capital from the chain — and it is also the
 * only honest one available: a cap would invent a number, and this project's
 * rule is that a figure must not look more confident than it is.
 */
export function usableReturnDay(prev, pnl) {
  if (!(prev > 0)) return false;
  return Math.abs(pnl) <= prev;
}

/**
 * The deepest peak-to-trough fall over a window, in euros and as a share.
 *
 * Measured on the **deposit-free** curve — the running sum of `pnl` — and never
 * on portfolio value. A withdrawal drops the value line without anything having
 * gone wrong, so a drawdown taken from it reports the day you paid for a house
 * as the worst market event of your life. This is SPEC §1.4 again: the whole
 * project exists because those two curves are not the same object.
 *
 * The percentage needs a denominator that means something. The deposit-free
 * curve passes through zero and can be negative, so dividing by its own peak is
 * meaningless; the portfolio's value on the peak day is what the fall was
 * actually a fall *of*.
 *
 * @returns {{amount: number, pct: number, from: number, to: number}} `amount`
 *   is negative or zero, and the indices are into the same arrays, not the window.
 */
export function maxDrawdown(result, fromIndex = 0, toIndex = result.days.length - 1) {
  let running = 0;
  let peak = 0;
  let peakAt = Math.max(0, fromIndex);
  let worst = { amount: 0, pct: 0, from: peakAt, to: peakAt };

  for (let i = Math.max(0, fromIndex); i <= toIndex && i < result.days.length; i++) {
    running += result.pnl[i] ?? 0;
    if (running > peak) {
      peak = running;
      peakAt = i;
    }
    const fall = running - peak;
    if (fall < worst.amount) {
      const base = result.value[peakAt];
      worst = { amount: fall, pct: base > 0 ? (fall / base) * 100 : 0, from: peakAt, to: i };
    }
  }

  return worst;
}

/**
 * Annualised return, both kinds, with the honest answer available.
 *
 * Two different questions, and the page shows one at a time behind a toggle
 * because a page that shows both unnamed contradicts itself:
 *
 *  - **money-weighted** — the rate at which *your money* grew, given when you
 *    paid it in. An IRR over the actual cashflows. This is the question a
 *    private investor is asking.
 *  - **time-weighted** — how the portfolio performed regardless of when you
 *    paid in. The chained daily return the month grid already uses, annualised.
 *    This is what a fund reports, and the only fair comparison against one.
 *
 * They differ, sometimes by a lot: pay a large sum in just before a fall and
 * your money did badly while the portfolio did fine.
 *
 * ## Two guards, and both refuse rather than guess
 *
 * **An IRR can have more than one root.** Every sign change in the cashflow
 * sequence permits another solution (Descartes), and an account that pays in,
 * takes out and pays in again has several. A solver started at a guess returns
 * whichever it walks into, with no sign that the others exist. So the range is
 * *scanned* first, and if more than one sign change in the net present value
 * turns up, the answer is `null` with `reason: 'multiple-roots'` — the same
 * refusal a contract size makes, for the same reason.
 *
 * **Under a year, annualising is nonsense.** Three months at +10 % is +46 % a
 * year said with a straight face. Below one year both come back `null` with
 * `reason: 'too-short'` and the caller shows the period return instead.
 *
 * @returns {{years: number, moneyWeighted: number|null, timeWeighted: number|null, reason: string|null}}
 */
export function annualisedReturn(result, fromIndex = 0, toIndex = result.days.length - 1) {
  const from = Math.max(0, fromIndex);
  const to = Math.min(toIndex, result.days.length - 1);
  // *Elapsed* time, not a count of days. A window covering indices 0…730 holds
  // 731 daily observations and spans 730 days, and discounting a terminal value
  // over 731/365 years prices it a day late — €1 000 growing to €1 210 comes
  // back as 9,986 % where it is exactly 10 %. Small, and wrong in the direction
  // that makes every long history look slightly worse than it was.
  const elapsed = to - from;
  const years = elapsed / 365;

  if (!(years >= 1)) return { years, moneyWeighted: null, timeWeighted: null, reason: 'too-short' };

  // Time-weighted: the same chained factor the month grid computes, spread
  // over the period. Reusing `windowReturnPct` keeps one definition of return.
  const chained = 1 + windowReturnPct(result, from, to) / 100;
  const timeWeighted = chained > 0 ? (chained ** (1 / years) - 1) * 100 : null;

  // Money-weighted: cashflows from the investor's side. A deposit is money out
  // of pocket and therefore negative; the value at each end is the position you
  // opened with and the one you closed with.
  const flows = [];
  const opening = from === 0 ? 0 : result.value[from - 1];
  if (opening !== 0) flows.push({ t: 0, amount: -opening });
  for (let i = from; i <= to; i++) {
    const external = result.netExternal[i] ?? 0;
    if (Math.abs(external) > 0.005) flows.push({ t: (i - from) / 365, amount: -external });
  }
  flows.push({ t: years, amount: result.value[to] });

  const moneyWeighted = solveIrr(flows);
  return {
    years,
    moneyWeighted: moneyWeighted == null ? null : moneyWeighted * 100,
    timeWeighted,
    reason: moneyWeighted == null ? 'multiple-roots' : null,
  };
}

/**
 * The internal rate of return, or nothing.
 *
 * Bisection over a scanned bracket rather than Newton from a guess. Slower and
 * it does not care: a few hundred iterations on a few hundred cashflows is
 * imperceptible, it cannot diverge, and — the reason it is written this way —
 * scanning the range first is what makes a *second* root visible instead of
 * invisible.
 */
function solveIrr(flows, lo = -0.95, hi = 5, steps = 400) {
  const npv = (r) => flows.reduce((sum, f) => sum + f.amount / (1 + r) ** f.t, 0);

  const brackets = [];
  let prevR = lo;
  let prevV = npv(lo);
  for (let k = 1; k <= steps; k++) {
    const r = lo + ((hi - lo) * k) / steps;
    const v = npv(r);
    if (Number.isFinite(prevV) && Number.isFinite(v) && prevV !== 0 && Math.sign(v) !== Math.sign(prevV)) {
      brackets.push([prevR, r]);
    }
    prevR = r;
    prevV = v;
  }

  // No root in a plausible band, or several. Both are "we cannot say", and
  // picking one of several is the failure this guard exists for.
  if (brackets.length !== 1) return null;

  let [a, b] = brackets[0];
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2;
    if (Math.sign(npv(mid)) === Math.sign(npv(a))) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}


/**
 * Where this goes from here — the only unverifiable number in this project.
 *
 * Everything else here is a measurement, checked against DEGIRO's own total and
 * refused when it cannot be. A projection is definitionally uncheckable, so the
 * rules around it do the work the reconciliation does everywhere else:
 *
 *  - **scenarios come from the account's own history, not from a fitted
 *    distribution.** PRIIPs — the living standard, where the older Dutch GUISE
 *    method is legacy — builds them from actual historical subperiods, because
 *    assuming lognormality makes the tail systematically too thin exactly where
 *    the scenario is used. It is also this project's own principle: measure,
 *    do not assume.
 *  - **the bad case is the *average of the worst tenth*, not the tenth
 *    percentile.** A percentile says "it was at least this bad"; the mean of
 *    the tail says "when it went badly, this is how badly on average", and only
 *    the second answers the question being asked.
 *  - **`basis` says how much evidence there was.** A five-year horizon over a
 *    five-year history has exactly one observable window, and a projection
 *    drawn from one observation must not look like one drawn from fifty. Under
 *    `MIN_WINDOWS` the scenarios are `illustrative` and the UI is required to
 *    label them as an example rather than as history — the same rule the Dutch
 *    regulator applies below four years of track record, and the strongest
 *    thing in that regulation.
 *
 * Deterministic: no random draws, no Monte Carlo. Overlapping windows over real
 * months, so the reader can in principle find every input on their own screen.
 *
 * @param {object} result       a computePortfolio result
 * @param {object} opts
 * @param {number} opts.months          horizon, capped at MAX_HORIZON_MONTHS
 * @param {number} opts.monthly         contribution per month, base currency
 * @param {number|null} opts.growthPct  annual price growth; null = derive
 * @param {number|null} opts.yieldPct   annual dividend yield; null = derive
 * @param {boolean} opts.reinvest       do dividends go back to work
 */
export function projectPortfolio(result, opts = {}) {
  const months = Math.max(1, Math.min(MAX_HORIZON_MONTHS, Math.round(opts.months ?? 60)));
  const monthly = opts.monthly ?? 0;

  const derived = deriveRates(result);
  const growthPct = opts.growthPct ?? derived.growthPct;
  const yieldPct = opts.yieldPct ?? derived.yieldPct;
  const reinvest = opts.reinvest ?? derived.reinvest;

  const outcomes = rollingOutcomes(result, months);
  /**
   * How many genuinely separate stretches this long the history contains.
   *
   * `outcomes.length` counts overlapping ones and is what the distribution is
   * measured from; this counts the independent ones and is what decides whether
   * the word "history" may be used at all. See `MIN_WINDOWS`.
   */
  const independent = Math.floor(monthlyReturns(result).length / months);
  const manual = opts.growthPct != null || opts.yieldPct != null;

  const total = growthPct + yieldPct;

  /**
   * A rate the reader typed is the reader's, and it overrides everything.
   *
   * It did not. `expectedAnnual` read `basis === 'historical' ? median(outcomes)
   * : total`, so on any account with enough windows the typed growth rate was
   * discarded for all three lines and only the yield survived. Someone set
   * growth to 100 % and watched nothing move — the control was a decoration.
   *
   * The historical dispersion is still used, because it is real information
   * about *this* account: the tails are **recentred** on the reader's number
   * rather than replaced by a formula. "Good market" then means what a good
   * market did to this portfolio, relative to the expectation they chose.
   */
  const haveHistory = independent >= MIN_WINDOWS && outcomes.length > 0;
  const expectedAnnual = manual || !haveHistory ? total : median(outcomes);

  let spread;
  if (haveHistory) {
    const shift = manual ? total - median(outcomes) : 0;
    spread = { bad: tailMean(outcomes, 'low') + shift, good: tailMean(outcomes, 'high') + shift };
  } else {
    spread = illustrativeTails(result, total, months);
  }

  /**
   * Three states, not two.
   *
   * `historical` — enough independent stretches to call it history.
   * `illustrative` — not enough, so it is arithmetic on an assumption and the
   * UI must say so.
   * `unsupported` — the middle line is not a market outcome at all, so no
   * projection is drawn. That is new, and it is the only honest answer when a
   * measured rate says a portfolio compounds at several hundred percent a year:
   * the history is real, and what it measures is not growth.
   *
   * A rate the reader typed is never `unsupported`. They were told it is an
   * assumption, and it is theirs to make.
   */
  const credible = manual || Math.abs(expectedAnnual) <= PLAUSIBLE_ANNUAL;
  const basis = !credible ? 'unsupported' : haveHistory ? 'historical' : 'illustrative';

  const scenarios = credible
    ? {
        bad: buildPath(result, months, monthly, spread.bad, yieldPct, reinvest),
        expected: buildPath(result, months, monthly, expectedAnnual, yieldPct, reinvest),
        good: buildPath(result, months, monthly, spread.good, yieldPct, reinvest),
      }
    : null;

  return {
    months,
    basis,
    windows: outcomes.length,
    independentWindows: independent,
    manual,
    rates: {
      growthPct: round2(growthPct),
      yieldPct: round2(yieldPct),
      expectedAnnual: round2(expectedAnnual),
      badAnnual: round2(spread.bad),
      goodAnnual: round2(spread.good),
      derived,
      reinvest,
    },
    scenarios,
  };
}

/**
 * The two rates, split so they cannot double-count.
 *
 * A dividend is internal (rule 3), so it is already inside `pnl` and therefore
 * inside the total return. Taking that total as "growth" and adding a yield on
 * top counts dividends twice, and on a dividend-led portfolio over five years
 * that is not a rounding error. So the yield is measured and the growth is what
 * is left of the total after it.
 */
function deriveRates(result) {
  const n = result.days.length;
  const years = Math.max(1 / 12, (n - 1) / 365);

  const dividend = (result.income?.dividendGross ?? 0) + (result.income?.dividendTax ?? 0);
  let sum = 0;
  for (const v of result.value) sum += v;
  const averageValue = sum / Math.max(1, n);
  const yieldPct = averageValue > 0 ? (dividend / years / averageValue) * 100 : 0;

  const chained = 1 + windowReturnPct(result, 0, n - 1) / 100;
  const totalAnnual = chained > 0 ? (chained ** (1 / years) - 1) * 100 : 0;

  return {
    yieldPct,
    growthPct: totalAnnual - yieldPct,
    totalAnnual,
    ...reinvestment(result, dividend),
  };
}

/**
 * Did the dividends go back to work?
 *
 * A **bound**, not an estimate, and the difference is the point.
 *
 * The first version of this compared the drift in the cash balance against the
 * dividends received, after removing deposits and withdrawals. It was dominated
 * by something else entirely — every purchase moves cash too — so on any
 * account that ever bought anything it read a drift of tens of thousands
 * against a few thousand of dividend and clamped to "100 % reinvested". A
 * number that is right for the wrong reason, which is worse than no number.
 *
 * What can be said without a model: **dividends that are still uninvested must
 * still be in the cash balance.** So the cash held today is a ceiling on how
 * much of the dividend could be sitting idle, and everything above that ceiling
 * demonstrably went somewhere. That is a bound, it cannot be confounded by
 * purchases, and it is checkable against two numbers already on the reader's
 * screen.
 *
 * It sets the *default* of a switch the reader can flip, which is the right
 * weight for a bound rather than a measurement.
 */
function reinvestment(result, dividend) {
  const cash = result.cash.at(-1) ?? 0;
  if (!(dividend > 0)) return { reinvest: true, maxIdleShare: null, cashNow: round2(cash) };
  const maxIdle = Math.min(1, Math.max(0, cash) / dividend);
  return {
    reinvest: maxIdle < 0.5,
    maxIdleShare: Math.round(maxIdle * 100),
    cashNow: round2(cash),
    dividendSeen: round2(dividend),
  };
}

/** Every H-month stretch the history actually contains, as an annual rate. */
function rollingOutcomes(result, months) {
  const monthly = monthlyReturns(result);
  const out = [];
  for (let i = 0; i + months <= monthly.length; i++) {
    let factor = 1;
    for (let k = 0; k < months; k++) factor *= 1 + monthly[i + k] / 100;
    if (factor > 0) out.push((factor ** (12 / months) - 1) * 100);
  }
  return out.sort((a, b) => a - b);
}

/** Chained monthly returns, from the same table the month grid draws. */
function monthlyReturns(result) {
  return monthlyTable(result)
    .years.flatMap((y) => y.months.map((m) => (m ? m.returnPct : null)))
    .filter((x) => x != null);
}

/**
 * Tails when the history cannot show one.
 *
 * The monthly spread scaled by the square root of the horizon — the textbook
 * move, used here only because the alternative is silence. `basis` is already
 * `illustrative` whenever this runs, and the UI is required to say so.
 */
function illustrativeTails(result, totalAnnual, months) {
  const monthly = monthlyReturns(result);
  if (monthly.length < 2) return { bad: totalAnnual, good: totalAnnual };
  const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length;
  const variance = monthly.reduce((a, b) => a + (b - mean) ** 2, 0) / (monthly.length - 1);
  // 1,28 σ is the tenth percentile of a normal; the *mean* of that tail sits
  // further out, at about 1,75 σ. Using the tail mean keeps the definition the
  // same as the historical branch's.
  const annualSigma = Math.sqrt(variance) * Math.sqrt(12);
  return { bad: totalAnnual - 1.75 * annualSigma, good: totalAnnual + 1.75 * annualSigma };
}

/**
 * One scenario, month by month.
 *
 * Growth compounds inside the position. The dividend yield arrives as cash and
 * only compounds if it was put back to work — which is the whole reason the two
 * rates are separate, and the difference that matters most on a distributing
 * holding over five years.
 */
function buildPath(result, months, monthly, annualPct, yieldPct, reinvest) {
  const start = result.totals?.value ?? result.value.at(-1) ?? 0;
  // The scenario rate is a *total* return; the part of it that is dividend is
  // handled explicitly below, so only the rest compounds inside the position.
  const priceMonthly = (1 + Math.max(-0.99, (annualPct - yieldPct) / 100)) ** (1 / 12) - 1;
  const yieldMonthly = yieldPct / 100 / 12;

  const path = [];
  let invested = start;
  let idleCash = 0;
  for (let m = 1; m <= months; m++) {
    invested *= 1 + priceMonthly;
    const income = invested * yieldMonthly;
    if (reinvest) invested += income;
    else idleCash += income;
    invested += monthly;
    path.push(round2(invested + idleCash));
  }
  return { path, end: path.at(-1) ?? start, idleCash: round2(idleCash) };
}

const median = (sorted) => sorted[Math.floor(sorted.length / 2)] ?? 0;

/**
 * The mean of the worst or best tenth — not the percentile at its edge.
 *
 * GUISE's own definition, and the better statistic: a percentile says "it was
 * at least this bad", the mean of the tail says "when it went badly, this is
 * how badly on average".
 */
function tailMean(sorted, side) {
  const take = Math.max(1, Math.round(sorted.length / 10));
  const slice = side === 'low' ? sorted.slice(0, take) : sorted.slice(-take);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function buildComposition(result, topN = 6, fromIndex = 0, toIndex = result.days.length - 1) {
  const slice = (arr) => arr.slice(fromIndex, toIndex + 1);
  const width = Math.max(1, toIndex - fromIndex + 1);

  const meanBetween = (p, a, b) => {
    let total = 0;
    for (let i = a; i <= b; i++) total += p.values[i] ?? 0;
    return total / Math.max(1, b - a + 1);
  };
  const meanInWindow = (p) => meanBetween(p, fromIndex, toIndex);

  // A product's rank over the *whole* history is a property of the account
  // rather than of the window, which is what a stable colour needs. The caller
  // turns it into a slot and uses it to break ties.
  //
  // It is deliberately the same metric the window ranking uses. `byProduct`
  // arrives sorted by all-time *peak*, and ranking membership by mean while
  // keying colour off peak means the two orderings disagree — which produced
  // collisions, and instruments trading hues between ranges, for no reason at
  // all. With one metric, the ALL window needs no tie-breaking whatsoever,
  // because its ranking *is* the all-time ranking.
  const lastIndex = result.days.length - 1;
  const allTimeRank = new Map(
    [...result.byProduct]
      .sort((a, b) => meanBetween(b, 0, lastIndex) - meanBetween(a, 0, lastIndex))
      .map((p, i) => [p.productId, i]),
  );

  const ranked = result.byProduct
    .map((p) => ({ p, weight: meanInWindow(p) }))
    .sort((a, b) => b.weight - a.weight);

  // Filter before slicing, not after. The old order took the first six and then
  // dropped any that were empty, so an empty one cost a layer that was never
  // backfilled — six slots, five bands, and no reason on screen.
  const top = ranked.filter((x) => x.weight > 0).slice(0, topN).map((x) => x.p);
  const inTop = new Set(top.map((p) => p.productId));
  const rest = result.byProduct.filter((p) => !inTop.has(p.productId));

  const layers = top.map((p) => ({
    key: p.productId,
    productId: p.productId,
    label: p.symbol || p.name,
    rank: allTimeRank.get(p.productId) ?? 0,
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
        // "Other" gets a slot no instrument may take, so it stays the same
        // colour in every window while its membership changes underneath it.
        rank: null,
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
    // Same test as `windowReturnPct`: a day whose result exceeds everything
    // invested at the start of it is a bookkeeping artefact, and chaining it
    // produced the -60 006 % that a tester's April 2025 cell displayed.
    if (usableReturnDay(prev, pnl[i])) cell.factor *= 1 + pnl[i] / prev;
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
    tradeEvents: [],
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
/**
 * The last index of a selected range. Only a dragged selection ends anywhere
 * but today; the buttons all run to the newest day.
 */
export function rangeEndIndex(days, range) {
  if (!days.length) return 0;
  if (typeof range === 'string' && range.includes('..')) {
    const to = range.split('..')[1];
    for (let i = days.length - 1; i >= 0; i--) if (days[i] <= to) return i;
    return 0;
  }
  return days.length - 1;
}

export function rangeStartIndex(days, range) {
  if (!days.length) return 0;
  // A dragged selection, as 'YYYY-MM-DD..YYYY-MM-DD'. The six buttons only
  // reach six windows; everything between them — March 2024, the fortnight
  // around a crash — was unreachable.
  if (typeof range === 'string' && range.includes('..')) {
    const from = range.split('..')[0];
    const i = days.findIndex((d) => d >= from);
    return i < 0 ? 0 : i;
  }
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
