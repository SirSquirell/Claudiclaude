/**
 * US-61 — the Positions table as columns-of-data.
 *
 * The merged table (US-49) is eleven columns plus a share action, and below a
 * wide desktop it overflowed into a horizontal scrollbar. The fix is not fewer
 * columns; it is columns that know their own priority, so the lowest-priority
 * ones drop as the table narrows and fold into a per-row expand, with a chooser
 * as the escape hatch. This module is the pure half — the list, the priority
 * order and the load-bearing floor — so app.js can render from it and a test can
 * check it without a DOM.
 *
 * `lock`   — the load-bearing four (Instrument, Value, Paid in vs grown, Result)
 *            plus the share action. Never dropped by width, never hidden by the
 *            chooser. These are the answer to "how is this position doing".
 * `pri`    — the order the responsive pass removes columns, higher first. Absent
 *            on `lock` columns because they never drop.
 * `openOnly` — already blank under the Closed view (US-49), so it also drops
 *            there; kept as data rather than a special case in the renderer.
 * `num`    — right-aligned numeric cell.
 * `action` — the snapshot button; a column with no header label.
 */
export const HOLDINGS_COLUMNS = Object.freeze([
  { key: 'instrument', label: 'Instrument', lock: true },
  { key: 'quantity', label: 'Quantity', openOnly: true, num: true, pri: 85 },
  { key: 'price', label: 'Price', openOnly: true, num: true, pri: 90 },
  /**
   * US-86: restored. The 0.42 "Profit and loss per product" table carried
   * Bought and Sold per product; US-49's merge said they "move behind the
   * row's disclosure with the transactions, or drop" and they dropped —
   * silently, which a measured 0.42-vs-0.52 audit caught as the one real
   * feature loss since the redesign. All-time figures, so the headers say so
   * (US-49's span rule), and the highest drop priorities in the table: they
   * fold into the disclosure first when width is short.
   */
  { key: 'bought', label: 'Bought (all time)', num: true, pri: 96 },
  { key: 'sold', label: 'Sold (all time)', num: true, pri: 94 },
  { key: 'avgPaid', label: 'Average paid', num: true, pri: 70 },
  { key: 'value', label: 'Value', lock: true, num: true },
  { key: 'split', label: 'Paid in vs grown', lock: true },
  { key: 'result', label: 'Result', lock: true, num: true },
  { key: 'dividend', label: 'Dividend (all time)', num: true, pri: 50 },
  { key: 'pctBought', label: '% of bought', num: true, pri: 55 },
  { key: 'share', label: 'Share', openOnly: true, num: true, pri: 75 },
  { key: 'currency', label: 'Currency', pri: 80 },
  { key: 'snap', label: '', lock: true, action: true },
].map(Object.freeze));

/** The four load-bearing columns, by key — the floor the width drop and the
 *  chooser both respect. The share action is `lock` too but is not one of the
 *  four the reader reads. */
export const LOAD_BEARING = Object.freeze(['instrument', 'value', 'split', 'result']);

export const isLockColumn = (key) =>
  HOLDINGS_COLUMNS.some((c) => c.key === key && c.lock);

/** Columns the chooser may offer to hide — every non-lock, non-action column,
 *  in table order. */
export const optionalColumns = () =>
  HOLDINGS_COLUMNS.filter((c) => !c.lock && !c.action);

/**
 * The order the responsive pass drops columns: highest `pri` first. A column
 * that is `lock` is never here, so the load-bearing four and the share action
 * can never be dropped by width — the invariant the whole story rests on.
 */
export const droppableByPriority = () =>
  HOLDINGS_COLUMNS.filter((c) => !c.lock).sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0));

/**
 * The keys hidden for a given view *before* the width pass runs: the user's
 * chosen-hidden set, plus the open-only columns when the Closed view is showing
 * (they are all dashes there anyway, US-49). Load-bearing keys are filtered out
 * defensively — a persisted set from a future build must never hide one.
 */
export function baseHidden(status, userHidden = new Set()) {
  const hidden = new Set([...userHidden].filter((k) => !isLockColumn(k)));
  if (status === 'closed') {
    for (const c of HOLDINGS_COLUMNS) if (c.openOnly) hidden.add(c.key);
  }
  return hidden;
}

/**
 * US-87 — the column list in the reader's own order.
 *
 * `orderKeys` is whatever storage held, and storage is not trusted: unknown
 * keys are dropped, duplicates keep their first appearance, keys a future
 * build added are appended in canonical order rather than lost, and the two
 * anchors hold whatever was stored — Instrument first, because the row is
 * unreadable without its name, and the share action last, because an action
 * is not data. The canonical list with no stored order is the identity case.
 */
export function orderedColumns(orderKeys = []) {
  const byKey = new Map(HOLDINGS_COLUMNS.map((c) => [c.key, c]));
  const seen = new Set();
  const kept = orderKeys.filter((k) => byKey.has(k) && !seen.has(k) && seen.add(k));
  const rest = HOLDINGS_COLUMNS.map((c) => c.key).filter((k) => !seen.has(k));
  const middle = [...kept, ...rest].filter((k) => k !== 'instrument' && k !== 'snap');
  return ['instrument', ...middle, 'snap'].map((k) => byKey.get(k));
}

/**
 * US-87 — the next sort state after a header click.
 *
 * Numeric columns start biggest-first because that is the question a number
 * column answers ("where is the most?"); text columns start A-first. The
 * third click returns `null` — natural order, which the caller defines (the
 * table's default of windowed result, descending). Clicking a different
 * column starts that column's own cycle fresh rather than inheriting the old
 * direction.
 */
export function cycleSort(current, key, isNum) {
  const first = isNum ? 'desc' : 'asc';
  if (current?.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === 'desc' ? 'asc' : 'desc' };
  return null;
}
