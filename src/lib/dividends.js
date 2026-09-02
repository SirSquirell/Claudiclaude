/**
 * The dividend layer, US-121 onwards: everything that can be said about a
 * position's dividends from the account's own cash rows and share counts.
 *
 * Pure, like `engine.js`: plain arrays in, plain arrays and objects out, a
 * `today` passed in wherever a date matters, no I/O, no clock. Nothing here is
 * persisted; it is recomputed from the raw rows on every load (rule 2), and it
 * changes no figure `computePortfolio` produces — the one engine change was to
 * export its ledger (`positionLedger`) so a payment is divided by the same
 * share count the valuation multiplies.
 *
 * Two data decisions hold for the whole module, from the backlog (US-121):
 *
 *  - **Euros per share, from what settled.** A cash row's `change` is the euro
 *    amount that landed, so a foreign payer's per-share figure moves with the
 *    exchange rate even when the declared dividend did not. Nothing here
 *    converts it back, and every figure is tagged `unit: 'EUR/share'`.
 *  - **Never guess.** A row whose per-share figure cannot be formed — no
 *    position on the pay-date, no product, a reversal — becomes an entry in
 *    `undetermined` with a reason and the amount, and is counted. It is never
 *    a silent zero, and the guardrail test proves the two halves (points and
 *    undetermined) still sum to the engine's own `dividendGross` to the cent.
 *
 * Exports and shapes:
 *
 *   perShareSeries(transactions, cashRows, products) →
 *     { unit: 'EUR/share',
 *       byProduct: { [productId]: { productId, name, heldFrom, heldTo,
 *                    points: [{ date, grossPerShare, taxPerShare, gross, tax,
 *                               quantity, quantityChangedRecently }] } },
 *       undetermined: [{ date, productId, category, amount, reason }] }
 *
 *     `grossPerShare` or `taxPerShare` is null on a date that had only the
 *     other kind of row — no pairing is assumed (US-102 AC3). `gross` and `tax`
 *     are the day's euro totals. `heldTo` is null while the position is open.
 *
 *   detectRhythm(points) →                                           (US-124)
 *     { rhythm: 'monthly'|'quarterly'|'semiannual'|'annual'|'irregular',
 *       confidence, intervalDays, gaps, reason }
 *     `intervalDays` is the nominal length of the detected interval, null when
 *     irregular; `reason` says why it is irregular, null otherwise.
 *
 *   classifyPayments(series) →                                       (US-125)
 *     the same shape as perShareSeries, plus `classified: true`, a `rhythm`
 *     (detectRhythm over the regular payments) per product, and on every
 *     point: label 'regular'|'special'|null (null for a tax-only point),
 *     rule 'amount'|'off-rhythm'|null, comparedAgainst (how many earlier
 *     regular payments the amount rule saw), deviationPct (from their median,
 *     null when there were too few). Trailing only: a point's label never
 *     depends on a later point.
 *
 *   changes(series, today) →                                         (US-122)
 *     { unit, byProduct: { [productId]: { productId,
 *         payments: [{ date, grossPerShare, label, pct, comparedTo, reason }],
 *         stopped: null | { lastDate, expectedBy, overdueDays, rhythm } } } }
 *     One entry per regular payment; label 'raised'|'unchanged'|'cut'|'new'
 *     (the stream is younger than eleven months), or null with a reason when
 *     older history exists but nothing 11 to 13 months earlier does. `comparedTo` is { date, grossPerShare } or null. `pct` is
 *     the change in EUR per share. `stopped` is set when the detected rhythm
 *     says a payment is more than 1.5 intervals overdue as of `today`.
 */
import { CATEGORY } from './classify.js';
import { addDays, dayRange, daysBetween, subMonths } from './dates.js';
import { positionLedger } from './engine.js';

/**
 * A trade this close before (or on) a pay-date means the share count on the
 * pay-date may not be the count that earned the payment: ex-date and pay-date
 * straddle it. Thirty days covers every ex-to-pay gap seen on ordinary equities
 * and ETFs; the point is kept and flagged rather than dropped, because the
 * money did land and the figure is right for the quantity stated.
 */
export const RECENT_TRADE_DAYS = 30;

const UNIT = 'EUR/share';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** `null` for a row that cannot be attributed to a product, else the id as a string. */
function productKey(row) {
  return row.productId == null || row.productId === '' ? null : String(row.productId);
}

/**
 * US-121. Dividend per share, from the account's own payments.
 *
 * @param {Array<{date, productId, quantity, totalBase}>} transactions normalised, from parse.js
 * @param {Array<{date, productId, change, category}>} cashRows classified, from parse.js + classify.js
 * @param {Record<string, {name?: string, symbol?: string}>} products for the display name only
 */
export function perShareSeries(transactions = [], cashRows = [], products = {}) {
  const undetermined = [];
  const byProduct = {};

  const dividendRows = cashRows.filter(
    (r) => r.category === CATEGORY.DIVIDEND || r.category === CATEGORY.DIVIDEND_TAX,
  );
  if (!dividendRows.length) return { unit: UNIT, byProduct, undetermined };

  // The ledger over the whole span the rows and trades cover. Cheap: days ×
  // products of doubles, the same arrays the engine builds on every load.
  const dates = [...transactions.map((t) => t.date), ...dividendRows.map((r) => r.date)].sort();
  const start = dates[0];
  const end = dates.at(-1);
  const days = dayRange(start, end);
  const n = days.length;
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const idxOf = (iso) => dayIndex.get(iso) ?? -1;
  const { qtyByProduct, tradeDaysByProduct } = positionLedger(transactions, n, idxOf);
  // The ledger keys by the transaction's own productId; cash rows are keyed
  // as strings. Look both ways so a numeric id on one side still meets a
  // string id on the other, exactly as `computePortfolio` does.
  const ledgerOf = (map, id) => map.get(id) ?? map.get(Number(id));

  // Sum same-day rows per product and category first: two lines on one day
  // are one payment as far as a per-share figure is concerned.
  /** @type {Map<string, Map<string, {gross: number, tax: number, grossRows: number, taxRows: number}>>} */
  const dayTotals = new Map();
  for (const row of dividendRows) {
    const id = productKey(row);
    if (id === null) {
      undetermined.push({ date: row.date, productId: null, category: row.category, amount: row.change, reason: 'no-product' });
      continue;
    }
    let perDay = dayTotals.get(id);
    if (!perDay) dayTotals.set(id, (perDay = new Map()));
    let t = perDay.get(row.date);
    if (!t) perDay.set(row.date, (t = { gross: 0, tax: 0, grossRows: 0, taxRows: 0 }));
    if (row.category === CATEGORY.DIVIDEND) {
      t.gross += row.change;
      t.grossRows++;
    } else {
      t.tax += row.change;
      t.taxRows++;
    }
  }

  for (const [id, perDay] of dayTotals) {
    const qty = ledgerOf(qtyByProduct, id);
    const tradeDays = ledgerOf(tradeDaysByProduct, id) ?? new Set();
    const meta = products[id] ?? {};
    const points = [];

    for (const date of [...perDay.keys()].sort()) {
      const t = perDay.get(date);
      const i = idxOf(date);
      const quantity = qty && i >= 0 ? qty[i] : 0;

      if (!(quantity > 0)) {
        if (t.grossRows) undetermined.push({ date, productId: id, category: CATEGORY.DIVIDEND, amount: t.gross, reason: 'no-position-on-pay-date' });
        if (t.taxRows) undetermined.push({ date, productId: id, category: CATEGORY.DIVIDEND_TAX, amount: t.tax, reason: 'no-position-on-pay-date' });
        continue;
      }

      // A reversal or a zero cannot be read as a payment. Tax keeps whatever
      // sign it has: it is negative by nature and a positive tax row is a
      // refund, which is still a fact about the same payment.
      let gross = null;
      if (t.grossRows) {
        if (t.gross > 0) gross = t.gross;
        else undetermined.push({ date, productId: id, category: CATEGORY.DIVIDEND, amount: t.gross, reason: 'non-positive-amount' });
      }
      const tax = t.taxRows ? t.tax : null;
      if (gross === null && tax === null) continue;

      let quantityChangedRecently = false;
      for (let d = addDays(date, -RECENT_TRADE_DAYS); d <= date; d = addDays(d, 1)) {
        if (tradeDays.has(d)) {
          quantityChangedRecently = true;
          break;
        }
      }

      points.push({
        date,
        grossPerShare: gross === null ? null : gross / quantity,
        taxPerShare: tax === null ? null : tax / quantity,
        gross,
        tax,
        quantity,
        quantityChangedRecently,
      });
    }

    if (!points.length) continue;

    let heldFrom = null;
    let heldTo = null;
    if (qty) {
      for (let i = 0; i < n; i++) {
        if (qty[i] !== 0) {
          heldFrom = days[i];
          break;
        }
      }
      // Open while the last day still holds shares; else the first day at zero
      // after the last day that held any.
      if (qty[n - 1] === 0) {
        for (let i = n - 1; i >= 0; i--) {
          if (qty[i] !== 0) {
            heldTo = days[i + 1] ?? days[n - 1];
            break;
          }
        }
      }
    }

    byProduct[id] = {
      productId: id,
      name: meta.name ?? `Product ${id}`,
      heldFrom,
      heldTo,
      points,
    };
  }

  undetermined.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { unit: UNIT, byProduct, undetermined };
}

// ---------------------------------------------------------------------------
// US-124: payment rhythm
// ---------------------------------------------------------------------------

/**
 * Gap buckets in days, inclusive lower bound, exclusive upper. Wide on purpose:
 * pay-dates drift by weeks around holidays and a monthly payer's gap runs 28 to
 * 35 days. A gap in no bucket is a fact about an irregular payer, not a
 * rounding problem.
 */
export const RHYTHM_BUCKETS = {
  monthly: [20, 45],
  quarterly: [60, 125],
  semiannual: [150, 230],
  annual: [300, 431],
};

/** Nominal interval per rhythm, in days, for "how overdue is the next one". */
export const NOMINAL_INTERVAL_DAYS = {
  monthly: 365.25 / 12,
  quarterly: 365.25 / 4,
  semiannual: 365.25 / 2,
  annual: 365.25,
};

/** Regular payments per year, per rhythm. What one full cycle of data means. */
export const PAYMENTS_PER_YEAR = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };

/**
 * Below this share of gaps agreeing with the median gap's bucket, the answer
 * is irregular. 0.6 lets a quarterly payer skip one quarter in four and still
 * be quarterly (2 of 3 gaps agree), and refuses a payer whose gaps are split
 * evenly between two buckets.
 */
export const MIN_RHYTHM_CONFIDENCE = 0.6;

/** Two gaps are the least that can agree or disagree with each other. */
export const MIN_POINTS_FOR_RHYTHM = 3;

const IRREGULAR = (gaps, reason) => ({ rhythm: 'irregular', confidence: 0, intervalDays: null, gaps, reason });

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function bucketOf(gapDays) {
  for (const [rhythm, [lo, hi]] of Object.entries(RHYTHM_BUCKETS)) {
    if (gapDays >= lo && gapDays < hi) return rhythm;
  }
  return null;
}

/**
 * US-124. The rhythm behind a list of dated payments, from the gaps between
 * them. Pass regular payments only — a special in the list is a gap that
 * disagrees, which is exactly what US-125 uses this for.
 *
 * @param {Array<{date: string}>} points any order; sorted here
 */
export function detectRhythm(points) {
  const dates = points.map((p) => p.date).sort();
  const gaps = [];
  for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
  if (dates.length < MIN_POINTS_FOR_RHYTHM) return IRREGULAR(gaps, 'too-few-points');

  const rhythm = bucketOf(median(gaps));
  if (!rhythm) return IRREGULAR(gaps, 'gap-outside-buckets');
  const agreeing = gaps.filter((g) => bucketOf(g) === rhythm).length;
  const confidence = agreeing / gaps.length;
  if (confidence < MIN_RHYTHM_CONFIDENCE) return IRREGULAR(gaps, 'gaps-disagree');
  return { rhythm, confidence, intervalDays: NOMINAL_INTERVAL_DAYS[rhythm], gaps, reason: null };
}

// ---------------------------------------------------------------------------
// US-125: special dividends
// ---------------------------------------------------------------------------

/**
 * A payment more than this far from the median of the recent regular ones is
 * a special. 60 % is wide enough that a raise of half again passes as a raise;
 * a doubling does not, and a genuine special is usually several times the
 * regular amount.
 */
export const SPECIAL_AMOUNT_DEVIATION = 0.6;

/** The amount rule compares against the regular payments this far back. */
export const SPECIAL_LOOKBACK_MONTHS = 24;

/** A median of one number is not a median: the amount rule needs two others. */
export const MIN_COMPARISON_PAYMENTS = 2;

/**
 * A payment that recurs yearly is regular by definition, whatever its size:
 * the larger final of an interim/final payer, or a fixed year-end extra. A
 * twin is a regular payment 11 to 13 months earlier within this tolerance.
 */
export const YEARLY_TWIN_TOLERANCE = 0.2;
export const YEARLY_WINDOW_MONTHS = [11, 13];

/**
 * With a rhythm known, a payment closer than this fraction of the interval to
 * the previous regular one is an extra payment inside the cycle.
 */
export const OFF_RHYTHM_FRACTION = 0.5;

/** Earlier regular payments whose date falls inside [date − hi months, date − lo months]. */
function inYearlyWindow(regular, date) {
  const [lo, hi] = YEARLY_WINDOW_MONTHS;
  const from = subMonths(date, hi);
  const to = subMonths(date, lo);
  return regular.filter((q) => q.date >= from && q.date <= to);
}

function hasYearlyTwin(regular, p) {
  return inYearlyWindow(regular, p.date).some(
    (q) => Math.abs(q.grossPerShare - p.grossPerShare) / q.grossPerShare <= YEARLY_TWIN_TOLERANCE,
  );
}

/**
 * US-125. Label every gross point regular or special, trailing only.
 *
 * Idempotent: classifying a classified series returns an equal series. Every
 * downstream function accepts either and classifies for itself when needed.
 */
export function classifyPayments(series) {
  const byProduct = {};
  for (const [id, prod] of Object.entries(series.byProduct ?? {})) {
    const points = [...prod.points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const regular = [];
    const out = [];
    for (const p of points) {
      if (p.grossPerShare === null) {
        out.push({ ...p, label: null, rule: null, comparedAgainst: 0, deviationPct: null });
        continue;
      }
      const others = regular.filter((q) => q.date >= subMonths(p.date, SPECIAL_LOOKBACK_MONTHS));
      const twin = hasYearlyTwin(regular, p);
      let deviationPct = null;
      let rule = null;

      if (others.length >= MIN_COMPARISON_PAYMENTS) {
        const med = median(others.map((q) => q.grossPerShare));
        deviationPct = ((p.grossPerShare - med) / med) * 100;
        if (Math.abs(deviationPct) / 100 > SPECIAL_AMOUNT_DEVIATION && !twin) rule = 'amount';
      }
      if (!rule && !twin && regular.length) {
        const rhythm = detectRhythm(regular);
        if (rhythm.rhythm !== 'irregular') {
          const gap = daysBetween(regular.at(-1).date, p.date);
          if (gap < OFF_RHYTHM_FRACTION * rhythm.intervalDays) rule = 'off-rhythm';
        }
      }

      const labelled = { ...p, label: rule ? 'special' : 'regular', rule, comparedAgainst: others.length, deviationPct };
      out.push(labelled);
      if (!rule) regular.push(labelled);
    }
    byProduct[id] = { ...prod, points: out, rhythm: detectRhythm(regular) };
  }
  return { ...series, classified: true, byProduct };
}

/** The series, classified if it is not already. */
function classified(series) {
  return series.classified ? series : classifyPayments(series);
}

/** Regular gross points of one classified product, sorted. */
function regularPoints(prod) {
  return prod.points.filter((p) => p.label === 'regular');
}

// ---------------------------------------------------------------------------
// US-122: raises and cuts
// ---------------------------------------------------------------------------

/**
 * Below this, a change is noise rather than a decision: a per-share figure is
 * a cent-rounded euro total over a share count, and a foreign payer's figure
 * moves with the exchange rate. One percent is the rounding of a €0,50
 * dividend on a hundred shares.
 */
export const UNCHANGED_TOLERANCE_PCT = 1;

/**
 * A stream is stopped when the next payment its rhythm predicts is this many
 * intervals overdue. One interval late is a shifted pay-date; one and a half
 * means the following payment is already due too.
 */
export const STOPPED_AFTER_INTERVALS = 1.5;

/**
 * Whether a classified product's regular payments have stopped as of `today`:
 * null when its rhythm is irregular (nothing predicts a next payment) or when
 * the next payment is not yet overdue.
 */
function stoppedAsOf(prod, today) {
  const regular = regularPoints(prod);
  if (!regular.length || prod.rhythm.rhythm === 'irregular') return null;
  const lastDate = regular.at(-1).date;
  const expectedBy = addDays(lastDate, Math.round(STOPPED_AFTER_INTERVALS * prod.rhythm.intervalDays));
  if (today <= expectedBy) return null;
  return { lastDate, expectedBy, overdueDays: daysBetween(expectedBy, today), rhythm: prod.rhythm.rhythm };
}

/**
 * US-122. Each regular payment against the closest regular payment 11 to 13
 * months earlier.
 */
export function changes(series, today) {
  const c = classified(series);
  const byProduct = {};
  for (const [id, prod] of Object.entries(c.byProduct)) {
    const regular = regularPoints(prod);
    const payments = regular.map((p, i) => {
      const earlier = regular.slice(0, i);
      const candidates = inYearlyWindow(earlier, p.date);
      if (!candidates.length) {
        // Younger than a year: every earlier payment is inside the last eleven
        // months, so there is nothing to compare with yet. Older history with
        // a hole where the comparison should be is a different fact.
        const olderHistory = earlier.some((q) => q.date < subMonths(p.date, YEARLY_WINDOW_MONTHS[0]));
        return olderHistory
          ? { date: p.date, grossPerShare: p.grossPerShare, label: null, pct: null, comparedTo: null, reason: 'no-payment-11-13-months-earlier' }
          : { date: p.date, grossPerShare: p.grossPerShare, label: 'new', pct: null, comparedTo: null, reason: null };
      }
      // Closest to exactly a year before.
      const target = subMonths(p.date, 12);
      const q = candidates.reduce((best, x) =>
        Math.abs(daysBetween(target, x.date)) < Math.abs(daysBetween(target, best.date)) ? x : best);
      const pct = ((p.grossPerShare - q.grossPerShare) / q.grossPerShare) * 100;
      const label = Math.abs(pct) < UNCHANGED_TOLERANCE_PCT ? 'unchanged' : pct > 0 ? 'raised' : 'cut';
      return { date: p.date, grossPerShare: p.grossPerShare, label, pct, comparedTo: { date: q.date, grossPerShare: q.grossPerShare }, reason: null };
    });
    byProduct[id] = { productId: id, payments, stopped: stoppedAsOf(prod, today) };
  }
  return { unit: UNIT, byProduct };
}
