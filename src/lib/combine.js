/**
 * Combine per-broker engine results into one.
 *
 * This module is the whole of multi-broker, arithmetically. `docs/MULTI-BROKER.md`
 * §A works it out: SPEC §1.4 is `pnl[t] = (value[t] − value[t−1]) − netExternal[t]`,
 * both sides of which are sums over whatever the account holds, so
 *
 *     pnl_combined[t] = Σ pnl_broker[t]
 *
 * identically — not approximately, and not subject to any convention. Which is
 * why `engine.js` needs no change at all and never learns what a broker is: run
 * it once per broker on that broker's own rows, and add the daily arrays.
 *
 * Pure, like the engine, and for the same reason: every bug worth catching is
 * here, and it is testable because there is no I/O in it.
 *
 * ## Three things that do not simply add, and are the reason this is a module
 *
 * 1. **Days.** Two brokers have different first days. Everything is re-indexed
 *    onto the union of their calendars first, and a broker's series before its
 *    own first day is zero — not missing, and not carried backwards.
 * 2. **Percentages.** A return is chained against the previous day's value, so
 *    it must be recomputed on the combined series. Averaging two brokers'
 *    percentages is wrong, and it is the mistake this shape invites.
 * 3. **Reconciliation.** There is no combined figure at any broker to compare
 *    against, so the combined result carries the *weakest* status of its parts
 *    and names who is responsible. A green banner over one unverified broker is
 *    exactly the plausible-wrong-chart failure the project exists to prevent.
 */

import { dayRange } from './dates.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * @param {Array<{broker: string, label?: string, result: object, products?: object}>} parts
 *   `products` is the broker's own product map, used only to read an ISIN.
 *   Passed in rather than read off `result.byProduct`, because the engine does
 *   not expose one and acceptance criterion A1 says it stays unchanged — a
 *   passthrough field would be a small change, and small changes to that
 *   boundary are how it stops being a boundary.
 * @returns {object} the same shape `computePortfolio` returns, plus `brokers`
 */
export function combineResults(parts) {
  const usable = parts.filter((p) => p?.result?.days?.length);
  if (!usable.length) return null;
  // One broker is not a special case worth writing twice, but it is worth
  // returning untouched: filtering the combined view to a single broker has to
  // reproduce that broker's numbers *exactly* (acceptance criterion A5), and
  // the surest way to guarantee that is to do no arithmetic at all.
  if (usable.length === 1) {
    return { ...usable[0].result, brokers: [brokerSummary(usable[0])] };
  }

  const days = unionOfDays(usable.map((p) => p.result.days));
  const index = new Map(days.map((d, i) => [d, i]));
  const n = days.length;

  // Series that are sums over the account. Everything in this list adds because
  // it is an amount of euros held or moved, and nothing in it is a ratio.
  const SUMMED = [
    'value',
    'positionsValue',
    'cash',
    'netExternal',
    'cumulativeDeposited',
    'pnl',
  ];

  const out = { days };
  for (const key of SUMMED) out[key] = new Array(n).fill(0);
  // A day is estimated if *any* broker was estimating it: the combined total is
  // only as real as its least real part.
  out.estimated = new Array(n).fill(false);

  for (const part of usable) {
    const r = part.result;
    for (let i = 0; i < r.days.length; i++) {
      const j = index.get(r.days[i]);
      if (j === undefined) continue;
      for (const key of SUMMED) out[key][j] += r[key]?.[i] ?? 0;
      if (r.estimated?.[i]) out.estimated[j] = true;
    }
  }

  // A broker whose history starts later contributes nothing before its first
  // day — which is right — but it also contributes nothing *between* its own
  // days if its calendar is sparser than the union. Carry each broker's last
  // known *stock* forward over the gap; flows must not be carried, or a single
  // deposit would be counted once per day until the next observation.
  carryStocksForward(out, usable, index, n);

  for (const key of SUMMED) out[key] = out[key].map(round2);

  out.baseCurrency = usable[0].result.baseCurrency;
  out.byProduct = mergeProducts(usable, index, n);
  out.cashByCurrency = sumMaps(usable.map((p) => p.result.cashByCurrency));
  out.income = sumMaps(usable.map((p) => p.result.income));
  out.realised = round2(usable.reduce((a, p) => a + (p.result.realised ?? 0), 0));
  out.unrealised = round2(usable.reduce((a, p) => a + (p.result.unrealised ?? 0), 0));

  out.dividendsByMonth = mergeByKey(usable.map((p) => p.result.dividendsByMonth), 'month');
  out.flowEvents = mergeEvents(usable, 'flowEvents');
  out.tradeEvents = mergeEvents(usable, 'tradeEvents');

  out.coverage = {
    days: n,
    estimated: out.estimated.filter(Boolean).length,
  };

  const last = n - 1;
  out.totals = {
    value: out.value[last],
    cash: out.cash[last],
    positions: out.positionsValue[last],
    invested: out.cumulativeDeposited[last],
    totalPnl: round2(out.value[last] - out.cumulativeDeposited[last]),
    totalReturnPct:
      out.cumulativeDeposited[last] > 0
        ? round2(((out.value[last] - out.cumulativeDeposited[last]) / out.cumulativeDeposited[last]) * 100)
        : 0,
    estimatedDays: out.coverage.estimated,
  };

  out.stats = {
    unclassified: usable.reduce((a, p) => a + (p.result.stats?.unclassified ?? 0), 0),
    transactions: usable.reduce((a, p) => a + (p.result.stats?.transactions ?? 0), 0),
    cashRows: usable.reduce((a, p) => a + (p.result.stats?.cashRows ?? 0), 0),
    // Deliberately not summed into one number: an unclassified row is a
    // *broker's* vocabulary gap, and one broker's four must not disappear
    // inside another's clean sheet (acceptance criterion A7).
    byBroker: Object.fromEntries(
      usable.map((p) => [p.broker, p.result.stats?.unclassified ?? 0]),
    ),
  };

  out.reconciliation = combineReconciliation(usable);
  out.warnings = usable.flatMap((p) =>
    (p.result.warnings ?? []).map((w) => ({ ...w, broker: p.broker })),
  );
  out.brokers = usable.map(brokerSummary);

  return out;
}

const brokerSummary = (p) => ({
  broker: p.broker,
  label: p.label ?? p.broker,
  days: p.result.days.length,
  first: p.result.days[0],
  last: p.result.days.at(-1),
  value: p.result.totals?.value ?? 0,
  reconciled: p.result.reconciliation?.ok === true,
  hasAnchor: p.result.reconciliation != null,
});

/** Every day either broker knows about, gap-filled so the axis is continuous. */
function unionOfDays(calendars) {
  let lo = null;
  let hi = null;
  for (const days of calendars) {
    if (!days.length) continue;
    if (lo === null || days[0] < lo) lo = days[0];
    if (hi === null || days.at(-1) > hi) hi = days.at(-1);
  }
  return lo === null ? [] : dayRange(lo, hi);
}

/**
 * A *stock* is what you hold — value, cash, cumulative deposits. A *flow* is
 * what moved that day — `netExternal`, `pnl`. On a day one broker has no row
 * for, its stocks are still whatever they last were, and its flows are zero.
 *
 * Getting this backwards is the bug that would be hardest to see: carrying a
 * flow forward turns one €10 000 deposit into €10 000 every day until the next
 * observation, and the value chart would look plausible the whole way up.
 */
function carryStocksForward(out, parts, index, n) {
  const STOCKS = ['value', 'positionsValue', 'cash', 'cumulativeDeposited'];
  for (const part of parts) {
    const r = part.result;
    const own = new Set(r.days);
    // Built once per part, so the lookup below is O(1) instead of a fresh
    // linear scan of this broker's whole calendar on every overlapping day.
    const ownIndex = new Map(r.days.map((d, i) => [d, i]));
    const first = index.get(r.days[0]);
    const held = Object.fromEntries(STOCKS.map((k) => [k, 0]));
    for (let j = 0; j < n; j++) {
      const day = out.days[j];
      if (own.has(day)) {
        const i = ownIndex.get(day);
        for (const k of STOCKS) held[k] = r[k]?.[i] ?? 0;
      } else if (j > first) {
        // Before this broker's first day it contributes nothing at all, which
        // is why the guard is `j > first` and not simply "no row today".
        for (const k of STOCKS) out[k][j] += held[k];
      }
    }
  }
}

/**
 * One holding per instrument, merged on ISIN where there is one.
 *
 * Never on the broker's own product id: that is broker-local by definition, and
 * two brokers will eventually issue the same number for different instruments
 * (acceptance criterion A8). An instrument with no ISIN — most derivatives —
 * stays separate and says which broker it came from, rather than being matched
 * on a name string, which is the kind of guess rule 4 forbids.
 */
function mergeProducts(parts, index, n) {
  const merged = new Map();

  for (const part of parts) {
    for (const p of part.result.byProduct ?? []) {
      const isin = part.products?.[p.productId]?.isin ?? null;
      const key = isin ? `isin:${isin}` : `${part.broker}:${p.productId}`;
      let row = merged.get(key);
      if (!row) {
        row = {
          ...p,
          key,
          isin,
          brokers: [],
          values: new Array(n).fill(0),
          qty: new Array(n).fill(0),
          pnl: new Array(n).fill(0),
          paidIn: new Array(n).fill(0),
          // Only true when it is true everywhere: one broker holding a real
          // price series does not make the other's carried-forward half real.
          hasSeries: true,
        };
        merged.set(key, row);
      }
      row.brokers.push(part.broker);
      row.hasSeries = row.hasSeries && p.hasSeries !== false;
      for (let i = 0; i < part.result.days.length; i++) {
        const j = index.get(part.result.days[i]);
        if (j === undefined) continue;
        row.values[j] += p.values?.[i] ?? 0;
        row.qty[j] += p.qty?.[i] ?? 0;
        row.pnl[j] += p.pnl?.[i] ?? 0;
        row.paidIn[j] += p.paidIn?.[i] ?? 0;
      }
    }
  }

  for (const row of merged.values()) {
    row.values = row.values.map(round2);
    row.pnl = row.pnl.map(round2);
    row.paidIn = row.paidIn.map(round2);
    row.current = row.values[n - 1];
  }

  return [...merged.values()].sort((a, b) => Math.max(...b.values) - Math.max(...a.values));
}

/**
 * The combined status is the weakest of its parts, and it names who is
 * responsible.
 *
 * There is no combined total at any broker to compare against, so this is not a
 * check — it is a report on whether the parts checked out. `ok` is true only
 * when every broker has an anchor and every anchor matched.
 */
function combineReconciliation(parts) {
  const withAnchor = parts.filter((p) => p.result.reconciliation != null);
  if (!withAnchor.length) return null;

  const missing = parts.filter((p) => p.result.reconciliation == null).map((p) => p.broker);
  const failed = withAnchor.filter((p) => !p.result.reconciliation.ok).map((p) => p.broker);

  const sumOf = (f) => round2(withAnchor.reduce((a, p) => a + (p.result.reconciliation[f] ?? 0), 0));

  return {
    ok: missing.length === 0 && failed.length === 0,
    reconstructed: sumOf('reconstructed'),
    live: sumOf('live'),
    diff: sumOf('diff'),
    /** Brokers with no anchor at all — unverifiable rather than wrong. */
    missingAnchor: missing,
    /** Brokers whose own check failed. */
    failing: failed,
    /** Only ever a partial sum when `missingAnchor` is non-empty. */
    partial: missing.length > 0,
  };
}

function sumMaps(maps) {
  const out = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m ?? {})) out[k] = round2((out[k] ?? 0) + v);
  }
  return out;
}

function mergeByKey(lists, keyField) {
  const out = new Map();
  for (const list of lists) {
    for (const row of list ?? []) {
      const existing = out.get(row[keyField]);
      if (!existing) {
        out.set(row[keyField], { ...row });
        continue;
      }
      for (const [k, v] of Object.entries(row)) {
        if (k !== keyField && typeof v === 'number') existing[k] = round2((existing[k] ?? 0) + v);
      }
    }
  }
  return [...out.values()].sort((a, b) => String(a[keyField]).localeCompare(String(b[keyField])));
}

function mergeEvents(parts, field) {
  return parts
    .flatMap((p) => (p.result[field] ?? []).map((e) => ({ ...e, broker: p.broker })))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * A combined return, chained on the combined series.
 *
 * Exported separately and deliberately not folded into `combineResults`,
 * because the whole risk here is that someone reaches for the average of two
 * brokers' percentages — which is wrong whenever the two hold different
 * amounts, and looks right in every test where they hold the same.
 */
export function combinedReturnPct(combined, fromIndex = 0, toIndex = combined.days.length - 1) {
  let factor = 1;
  let any = false;
  for (let i = Math.max(1, fromIndex); i <= toIndex && i < combined.days.length; i++) {
    const prev = combined.value[i - 1];
    if (prev > 0) {
      factor *= 1 + combined.pnl[i] / prev;
      any = true;
    }
  }
  return any ? (factor - 1) * 100 : 0;
}
