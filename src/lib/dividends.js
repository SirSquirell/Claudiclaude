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
 */
import { CATEGORY } from './classify.js';
import { addDays, dayRange } from './dates.js';
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
