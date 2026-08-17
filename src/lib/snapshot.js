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
  'name', 'symbol', 'period', 'pct', 'pctBasis', 'amount', 'spark', 'provenance', 'owner',
]);

/**
 * Where the name on the card came from, and what each source is allowed to
 * claim.
 *
 * Four sources rather than a checkbox, because they are not the same promise.
 * `first` and `username` are read out of the account, so the card may present
 * them as *the account's* — that is what makes a card feel attributable at all.
 * `handle` is typed by whoever is sharing, so it is a label and nothing more: a
 * typed name rendered as though the broker confirmed it would be the card
 * asserting something no code here checked, which is the same failure as a
 * forgeable badge (see the module note above).
 *
 * `derived` is what encodes that difference, and `ownerLine` is the only thing
 * that reads it.
 */
export const OWNER_SOURCES = Object.freeze({
  none: { derived: false },
  first: { derived: true },
  username: { derived: true },
  handle: { derived: false },
});

/**
 * Resolve the name on the card.
 *
 * `first` is deliberately the default and deliberately only the first name: a
 * full name on something posted in a public channel is more than the reader
 * needed to know who it is, and less than they can take back afterwards.
 *
 * An empty value at any source collapses to no name at all — a card that says
 * "shared by" and then nothing is worse than a card with no line.
 */
export function ownerLine({ source = 'first', fullName = null, username = null, handle = null } = {}) {
  const spec = OWNER_SOURCES[source] ?? OWNER_SOURCES.none;
  const text = source === 'first' ? String(fullName ?? '').trim().split(/\s+/)[0]
    : source === 'username' ? String(username ?? '').trim()
      : source === 'handle' ? String(handle ?? '').trim()
        : '';
  if (!text) return null;
  return { text, derived: spec.derived };
}

/**
 * US-50 — the span a position actually existed for.
 *
 * The defect: a card for something bought last month drew a line starting at the
 * account's opening, so eleven twelfths of it was a flat run at zero and the
 * shape — the only thing the sparkline claims to show — was squeezed into the
 * last inch. The line has to start at the buy.
 *
 * "The buy" is the first day the position was held, and the end is the last day
 * it was held, so a closed position stops at its sale instead of trailing a flat
 * line to today. Both are clipped to the window the reader selected: a 3-month
 * card for a five-year holding shows three months, not five years.
 *
 * `null` only when the position was never open inside the window at all. A
 * position held for a single day *is* a span and is returned as one; whether one
 * point can be drawn is the renderer's problem, and `drawSpark` already declines
 * it. Deciding that here would make this function quietly about drawing.
 */
export function positionSpan(qty, from = 0, to = (qty?.length ?? 1) - 1) {
  const q = qty ?? [];
  const lo = Math.max(0, from);
  const hi = Math.min(q.length - 1, to);
  let first = -1;
  let last = -1;
  for (let i = lo; i <= hi; i++) {
    // A short is a position too, so it is `!== 0` and not `> 0`.
    if (Math.abs(q[i] ?? 0) > 1e-9) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 ? null : { from: first, to: last };
}

/**
 * The four shapes a card can be, in the order the sheet offers them.
 *
 * Pixel sizes rather than ratios, because the renderer needs a size and a ratio
 * plus a guessed base width is how two callers end up disagreeing about it. They
 * are the aspect ratios the places these get posted actually crop to — square,
 * the portrait a feed shows without cropping, a full-height story, and a
 * landscape that fits a chat message. Anything else is a fifth entry here and no
 * change anywhere else.
 */
export const FORMATS = Object.freeze([
  { id: '1:1', w: 900, h: 900 },
  { id: '4:5', w: 900, h: 1125 },
  { id: '9:16', w: 810, h: 1440 },
  { id: '16:9', w: 1280, h: 720 },
]);

export const formatById = (id) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

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
  /**
   * US-50. The position's own arrays and the reader's window, rather than three
   * numbers the caller worked out first.
   *
   * This is the shape the defect asked for. The old signature took `from`, `to`,
   * `result`, `paidIn` and `series` already computed, and the caller computed
   * them over *two different spans*: the result over the selected window, the
   * money in over all time. A 1Y card on a six-year position divided one by the
   * other. Handing over the arrays means the span is resolved once, here, and
   * used for all three — the numerator, the denominator and the dates cannot
   * drift apart again because there is only one of them.
   */
  days = [],
  qty = [],
  pnl = [],
  paidIn = [],
  window: win = null,
  anonymized = false,
  owner = null,
  broker = 'DEGIRO',
  asOf = null,
  reconciled = null,
  version = null,
} = {}) {
  const lo = win?.from ?? 0;
  const hi = win?.to ?? Math.max(0, (days.length || qty.length) - 1);
  const span = positionSpan(qty, lo, hi);

  /**
   * AC5: fewer than two days inside the window draws no line *and claims no
   * period*. The second half is the one that matters — a card carrying dates it
   * did not draw is the same lie as the over-long line, told in the footer.
   */
  const drawable = span != null && span.to > span.from;

  let result = 0;
  let moneyIn = 0;
  const series = [];
  if (span) {
    let running = 0;
    for (let i = span.from; i <= span.to; i++) {
      running += pnl[i] ?? 0;
      series.push(running);
    }
    result = running;
    // Over the same days, so numerator and denominator agree. The day before the
    // position opened is the baseline; before the series it is zero.
    moneyIn = (paidIn[span.to] ?? 0) - (span.from > 0 ? paidIn[span.from - 1] ?? 0 : 0);
  }

  const { pct, basis } = returnOnMoneyIn(result, moneyIn);

  const model = {
    name: String(name ?? '—'),
    symbol: symbol && symbol !== name ? String(symbol) : null,
    period: drawable ? { from: days[span.from] ?? null, to: days[span.to] ?? null } : { from: null, to: null },
    pct,
    pctBasis: basis,
    // The only field US-46 controls, and the only one that can carry a figure.
    amount: anonymized ? null : result,
    spark: drawable ? sparkline(series) : [],
    /**
     * Normalised here rather than trusted from the caller, so the only two
     * shapes that can reach the canvas are `null` and `{text, derived}`. A
     * caller passing a bare string would otherwise get a name on the card with
     * no answer to the question the card has to answer: did the broker say this,
     * or did somebody type it?
     */
    owner: owner?.text ? { text: String(owner.text), derived: owner.derived === true } : null,
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
