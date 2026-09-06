/**
 * US-160 — what the rail's seal shows under its stamp.
 *
 * The stamp says "reconciles to the cent"; these are the two figures it
 * compared, so a reader can see the comparison rather than take it. Pure and
 * unformatted: the caller formats with the same `fmtEurCents` the tiles use, so
 * the hide-amounts toggle masks these rows exactly as it masks a tile.
 *
 * Three states:
 *  - no reconciliation, or a disconnected account (there is no live total to
 *    compare against while frozen, US-79): no rows.
 *  - `ok`: two rows, ours and the broker's. When the broker stated no total and
 *    the anchor is the sum of its own positions and cash (`source: 'derived'`),
 *    the second label says so — that check cannot catch an error the position
 *    values already contain, and a label that hid the difference would make
 *    the seal look stronger than it is.
 *  - not `ok`: the same two rows and a third, the difference, marked `bad`.
 *
 * @param {{ reconciliation: object|null, disconnected: boolean }} input
 * @returns {Array<{ key: 'ours'|'theirs'|'diff', label: string, value: number, tone: 'plain'|'bad', derived?: boolean }>}
 */
export function sealRows({ reconciliation, disconnected }) {
  const rc = reconciliation;
  if (!rc || disconnected) return [];
  if (!Number.isFinite(rc.reconstructed) || !Number.isFinite(rc.live)) return [];
  const rows = [
    { key: 'ours', label: 'Last value', value: rc.reconstructed, tone: 'plain' },
    {
      key: 'theirs',
      label: rc.source === 'derived' ? 'DEGIRO (derived)' : 'DEGIRO says',
      value: rc.live,
      tone: 'plain',
      derived: rc.source === 'derived',
    },
  ];
  if (rc.ok !== true) rows.push({ key: 'diff', label: 'Difference', value: rc.diff ?? rc.reconstructed - rc.live, tone: 'bad' });
  return rows;
}
