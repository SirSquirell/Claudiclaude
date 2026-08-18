/**
 * US-71 — what a chart says to someone who cannot see it.
 *
 * Thirteen canvases carried no `role`, no label and no table twin, so a screen
 * reader got **nothing** — not a value, not even "a chart". This is the half
 * that fixes that for all of them at once.
 *
 * ## Three shapes, not thirteen sentences
 *
 * A bespoke sentence per chart is a sentence the fourteenth chart ships without.
 * Every chart in this app is one of three things — a series over time, a bar per
 * period, or a part of a whole — and each shape has one description that reads
 * correctly for every chart of that shape.
 *
 * ## Why this module is pure, and why it takes a formatter
 *
 * The numbers in a summary are amounts, so US-46 governs them: with anonymize on
 * they mask, exactly as they do on screen. Rather than reimplement that here —
 * a second masking rule is a second thing to get wrong, and the export leak in
 * 0.10.0 is what that costs — the caller hands in `fmt`, which *is* the page's
 * formatter with the mask already inside it. So a masked page produces a masked
 * sentence without this module knowing what a mask is.
 *
 * Everything is derived at render from the arrays the chart draws (rule 2), so a
 * summary cannot drift from the picture beside it. Nothing here is stored.
 *
 * Dates are never masked: US-46 hides what you have, not when.
 */

/** No data is a state, and saying so beats a sentence built out of `undefined`. */
const EMPTY = 'no data';

const finite = (v) => Number.isFinite(v);

/**
 * A series over time: value, cumulative result, invested-vs-value, cash, the
 * projection, a sparkline.
 *
 * The four facts worth having are where it started, where it ended, which way
 * that is, and the extreme it reached on the way — which is the one thing the
 * shape of a line tells a sighted reader instantly and a start-and-end pair does
 * not.
 */
export function describeSeries({ title, days = [], values = [], fmt = String, estimated = null } = {}) {
  const points = [];
  for (let i = 0; i < values.length; i++) if (finite(values[i])) points.push(i);
  if (!points.length) return `${title}: ${EMPTY}`;

  const first = points[0];
  const last = points[points.length - 1];
  let hi = first;
  let lo = first;
  for (const i of points) {
    if (values[i] > values[hi]) hi = i;
    if (values[i] < values[lo]) lo = i;
  }

  const bits = [`${title}, ${days[first] ?? '?'} to ${days[last] ?? '?'}`];
  bits.push(`from ${fmt(values[first])} to ${fmt(values[last])}`);
  const change = values[last] - values[first];
  // The direction in words as well as in the two numbers: a reader hearing two
  // amounts should not have to subtract them to learn which way it went.
  bits.push(Math.abs(change) < 0.005 ? 'unchanged' : change > 0 ? 'up over the period' : 'down over the period');
  // Only when the extreme is not simply one of the ends, or it says nothing.
  if (hi !== first && hi !== last) bits.push(`highest ${fmt(values[hi])} on ${days[hi] ?? '?'}`);
  if (lo !== first && lo !== last) bits.push(`lowest ${fmt(values[lo])} on ${days[lo] ?? '?'}`);

  /**
   * US-62's honesty, in the other channel. A history reconstructed largely from
   * stale prices is a different object from one built from quotes, and a reader
   * who cannot see the chart has even less chance of finding that out elsewhere.
   */
  const est = estimated ? estimated.filter(Boolean).length : 0;
  if (est) bits.push(`${est} of ${points.length} days estimated from the last traded price`);

  return `${bits.join('. ')}.`;
}

/**
 * A bar per period: result per week or month, deposits, dividends, the month
 * comparison.
 *
 * The count and the two extremes, because that is what a row of bars is read
 * for — which one was biggest, which was worst, and how many there are.
 */
export function describeBars({ title, labels = [], values = [], fmt = String } = {}) {
  const idx = [];
  for (let i = 0; i < values.length; i++) if (finite(values[i])) idx.push(i);
  if (!idx.length) return `${title}: ${EMPTY}`;

  let hi = idx[0];
  let lo = idx[0];
  for (const i of idx) {
    if (values[i] > values[hi]) hi = i;
    if (values[i] < values[lo]) lo = i;
  }
  const positive = idx.filter((i) => values[i] > 0).length;

  return [
    `${title}, ${idx.length} ${idx.length === 1 ? 'period' : 'periods'}`,
    `${positive} positive, ${idx.length - positive} not`,
    `best ${labels[hi] ?? '?'} at ${fmt(values[hi])}`,
    `worst ${labels[lo] ?? '?'} at ${fmt(values[lo])}`,
  ].join('. ') + '.';
}

/**
 * A part of a whole: composition, currency exposure, the holdings pie.
 *
 * Shares rather than amounts wherever possible — a proportion is what a
 * part-of-whole chart is *about*, and it survives anonymize untouched for the
 * same reason US-52's split bar does. The total is still an amount and still
 * goes through `fmt`.
 */
export function describeParts({ title, parts = [], fmt = String, max = 5 } = {}) {
  const rows = parts
    .filter((p) => finite(p?.value))
    .map((p) => ({ name: String(p.name ?? '?'), value: p.value }))
    .sort((a, b) => b.value - a.value);
  if (!rows.length) return `${title}: ${EMPTY}`;

  const total = rows.reduce((a, p) => a + p.value, 0);
  const share = (v) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—');
  const shown = rows.slice(0, max);
  const rest = rows.length - shown.length;

  const bits = [`${title}, ${rows.length} ${rows.length === 1 ? 'part' : 'parts'} totalling ${fmt(total)}`];
  bits.push(shown.map((p) => `${p.name} ${share(p.value)}`).join(', '));
  // Named rather than dropped: a summary that quietly stops at five reads as a
  // complete list of five.
  if (rest > 0) bits.push(`and ${rest} smaller ${rest === 1 ? 'part' : 'parts'}`);
  return `${bits.join('. ')}.`;
}
