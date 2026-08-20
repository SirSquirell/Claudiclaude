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
 * `tip`    — US-93: the header explains itself. One sentence set per column,
 *            here and nowhere else, so the header, the chooser and anything
 *            else that shows it cannot desynchronise. Every text about a
 *            number names its denominator and its window (all time or the
 *            selected range) — that distinction is the question that caused
 *            the story. Only the action column has none: a button is not an
 *            assertion. Each claim is verified against the engine, and two of
 *            them are the measured pitfalls: Result excludes dividend, and
 *            Dividend is net of withheld tax.
 */
export const HOLDINGS_COLUMNS = Object.freeze([
  { key: 'instrument', label: 'Instrument', lock: true,
    tip: 'Name and symbol, with the colour this position keeps in every chart. The arrow opens the columns hidden at this width.' },
  { key: 'quantity', label: 'Quantity', openOnly: true, num: true, pri: 85,
    tip: 'Units held today. Options and other contracts count contracts, not the shares they cover.' },
  { key: 'price', label: 'Price', openOnly: true, num: true, pri: 90,
    tip: 'What one unit is worth today: the position’s value divided by the units held, in euros.' },
  /**
   * US-86: restored. The 0.42 "Profit and loss per product" table carried
   * Bought and Sold per product; US-49's merge said they "move behind the
   * row's disclosure with the transactions, or drop" and they dropped —
   * silently, which a measured 0.42-vs-0.52 audit caught as the one real
   * feature loss since the redesign. All-time figures, so the headers say so
   * (US-49's span rule), and the highest drop priorities in the table: they
   * fold into the disclosure first when width is short.
   */
  { key: 'bought', label: 'Bought (all time)', num: true, pri: 96,
    tip: 'Every euro that ever went into buying this position, fees included — all time, whatever range is selected.' },
  { key: 'sold', label: 'Sold (all time)', num: true, pri: 94,
    tip: 'Every euro selling ever returned, after fees — all time, whatever range is selected.' },
  { key: 'avgPaid', label: 'Average paid', num: true, pri: 70,
    tip: 'Bought (all time) divided by the units bought. Not the running cost of what remains after sales — this project deliberately picks no cost-basis convention.' },
  { key: 'value', label: 'Value', lock: true, num: true,
    tip: 'What the position is worth today — units held times the last known price, in euros. It does not follow the selected range.' },
  { key: 'split', label: 'Paid in vs grown', lock: true,
    tip: 'Splits what the position is worth today into the part that is money you put in and the part it made. Its “paid in” is net: every sale takes money back out. A different question from “% of bought”, whose denominator is gross and follows the selected range.' },
  { key: 'result', label: 'Result', lock: true, num: true,
    tip: 'Price result over the selected range: how the value moved, minus what you put in or took out. Dividend is not in here — it has its own column, and reaches the account result through the cash row.' },
  { key: 'dividend', label: 'Dividend (all time)', num: true, pri: 50,
    tip: 'Dividend that actually landed from this instrument, net — gross minus the tax withheld at source. All time, whatever range is selected.' },
  { key: 'pctBought', label: '% of bought', num: true, pri: 55,
    tip: 'The Result over the selected range, divided by every euro that went in during that same range — gross, so sales do not shrink the denominator. A different question from “Paid in vs grown”, which splits today’s value and whose “paid in” is net.' },
  { key: 'share', label: 'Share', openOnly: true, num: true, pri: 75,
    tip: 'This position’s value as a share of today’s whole account — positions plus cash.' },
  { key: 'currency', label: 'Currency', pri: 80,
    tip: 'The currency the instrument trades in; foreign values are converted at rates learned from your own conversions and trades. “est.” marks an instrument with no price history, held at the last price it traded at.' },
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
