/**
 * US-47 — a shareable card for one position. The pure half.
 *
 * This module decides *what may be on the card*. `src/ui/snapshot.js` decides
 * what it looks like and puts it on the clipboard. The split exists because a
 * PNG cannot be grepped: the leak test asserts this object's key set, and the
 * drawing code is left with no decisions to test.
 *
 * ## Two things the request asked for that this deliberately does not do
 *
 * **Nothing goes to Discord.** The described mechanism — an image on the
 * clipboard, pasted by the user — is the right one, and a webhook URL would be
 * a stored credential and an outbound egress path in one line: rules 9 and 7.
 * The button says Discord and talks to the clipboard. There is no `fetch` in
 * either half of this feature, and a test asserts it.
 *
 * **It is not "certified", and it must not say it is.** There is no authority
 * here. Any signature this extension can produce, anyone holding the extension
 * can also produce — the key would be in the source. A badge that can be forged
 * is worse than no badge, because it lends credibility to the forgeries.
 *
 * What *can* honestly go on the card is provenance, and one piece of it is
 * strong: rule 6 already checks the reconstruction against the broker's own
 * reported total, to the cent. So the card states whether it reconciled — and
 * when it did not, **it says that**, because a card from an account forty
 * thousand euro out carrying a clean line is precisely the lie this project
 * exists not to tell.
 */

/**
 * Everything a card may carry. Nothing outside this list reaches the canvas.
 *
 * An allowlist rather than a scrub, for the reason CLAUDE.md rule 7 gives: under
 * a denylist the field added tomorrow ships by default and keeps shipping until
 * somebody remembers. The 0.10.0 export leaked three fields exactly that way.
 */
export const SNAPSHOT_FIELDS = Object.freeze([
  'name', 'symbol', 'period', 'pct', 'pctBasis', 'amount', 'spark', 'provenance',
]);

/** And what a provenance line may carry. Same rule, one level down. */
export const PROVENANCE_FIELDS = Object.freeze(['broker', 'asOf', 'reconciled', 'version']);

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};

/**
 * The percentage, and why it is this one.
 *
 * `value = paidIn + result` holds exactly at every point for a single
 * instrument — a buy is money into the position, a sale is money out — which is
 * SPEC §1.4 applied to one holding. So "for every euro you put in, this came
 * back" is exact and needs no cost-basis convention, where the usual split into
 * cost and gain needs FIFO or average cost and those are an argument with no
 * right answer.
 *
 * When `paidIn` is zero or negative, more has come out than went in and there is
 * no denominator. That is a real state, not an error, and the card says it in
 * words rather than printing a percentage of nothing.
 */
export function returnOnMoneyIn(result, paidIn) {
  if (!(paidIn > 0.005)) return { pct: null, basis: 'no-money-in' };
  return { pct: (result / paidIn) * 100, basis: 'money-in' };
}

/**
 * Clip a window to where the holding actually existed.
 *
 * `from`/`to` are indices into the account's day array, chosen by the range
 * control — the account's lifespan, not the holding's. `qty` is the same
 * holding's day-by-day position size the engine already computed, so its
 * first non-zero day is the holding's first purchase. Without this, a
 * position bought years into the account's history reports a flat run of
 * zero-P/L days before it existed, which reads as "this position has been
 * open the whole time" — a card that misrepresents a holding's own history
 * rather than the account's.
 *
 * Only ever narrows the window, never widens it past what was asked for: a
 * holding bought before the selected range still starts at the range's own
 * `from`.
 */
export function holdingWindow(qty, from, to) {
  const firstHeld = (qty ?? []).findIndex((q) => q !== 0);
  if (firstHeld < 0) return { from, to };
  return { from: Math.max(from, Math.min(firstHeld, to)), to };
}

/**
 * Reduce a series to at most `max` points, keeping the first and the last.
 *
 * The sparkline is a shape, not a reading: no axis, no scale, so it discloses
 * the path and never a level. Downsampling here rather than in the drawing code
 * keeps the model the whole truth of what will be drawn.
 */
export function sparkline(series, max = 48) {
  const xs = (series ?? []).filter((v) => Number.isFinite(v));
  if (xs.length <= max) return xs;
  const stride = (xs.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => xs[Math.round(i * stride)]);
}

/**
 * Build the card's model.
 *
 * Every argument is a plain value the caller already had. Nothing is read from a
 * store, a DOM node or a network, so the whole of what may leak is visible in
 * one function.
 *
 * `anonymized` is US-46's flag and it governs: with it on the card carries no
 * amount at all. For something meant to be posted publicly that is the sensible
 * default regardless of what the page happens to be showing.
 */
export function snapshotModel({
  name,
  symbol = null,
  from = null,
  to = null,
  result = 0,
  paidIn = 0,
  series = [],
  anonymized = false,
  broker = 'DEGIRO',
  asOf = null,
  reconciled = null,
  version = null,
} = {}) {
  const { pct, basis } = returnOnMoneyIn(result, paidIn);

  const model = {
    name: String(name ?? '—'),
    symbol: symbol && symbol !== name ? String(symbol) : null,
    period: { from, to },
    pct,
    pctBasis: basis,
    // The only field US-46 controls, and the only one that can carry a figure.
    amount: anonymized ? null : result,
    spark: sparkline(series),
    provenance: pick({
      broker: String(broker),
      asOf,
      // Tri-state on purpose. `null` is "not checked", and it must never render
      // as a pass — an unknown verdict shown as a clean one is the failure this
      // field exists to prevent.
      reconciled: reconciled === true ? true : reconciled === false ? false : null,
      version,
    }, PROVENANCE_FIELDS),
  };

  // Built, then filtered. A caller that adds a key gets it dropped here rather
  // than discovering it in a screenshot somebody already posted.
  return pick(model, SNAPSHOT_FIELDS);
}

/**
 * The provenance line, as words.
 *
 * Here rather than in the renderer because *what it claims* is the part worth
 * testing, and the renderer should have no opinions left to hold.
 */
export function provenanceLine(p = {}, { unknownText = 'not checked against the broker' } = {}) {
  const bits = [p.broker].filter(Boolean);
  if (p.asOf) bits.push(p.asOf);
  bits.push(
    p.reconciled === true ? 'reconciled to the cent'
      : p.reconciled === false ? 'DOES NOT reconcile'
        : unknownText,
  );
  if (p.version) bits.push(`v${p.version}`);
  return bits.join(' · ');
}
