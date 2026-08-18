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
  'name', 'symbol', 'period', 'pct', 'pctBasis', 'amount', 'split', 'spark', 'provenance', 'owner',
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
 * "The buy" is the first day the position was held, and the end is **the day it
 * closed** — not the last day it was still held. Both are clipped to the window
 * the reader selected: a 3-month card for a five-year holding shows three months,
 * not five years.
 *
 * That end is the correction from the discrepancy report, and it is a one-day
 * difference that changed a number's sign on a real account. `qty` is the
 * quantity at the *end* of a day, so the day a position is sold out it reads
 * zero — while that is exactly the day the position's largest single P/L falls
 * on: `pnl[i] = 0 - values[i - 1] - tradedIn[i]`, the move between the last
 * close and the price it actually sold at. Ending at the last non-zero day
 * dropped it, so a card said +€175,50 for a position whose row in the table said
 * -€99,02. A day the position traded on is a day of its life, and it is in the
 * span. The rule is therefore "held at the end of this day, *or* at the end of
 * the day before".
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
  // A short is a position too, so it is `!== 0` and not `> 0`.
  const held = (i) => i >= 0 && Math.abs(q[i] ?? 0) > 1e-9;
  let first = -1;
  let last = -1;
  for (let i = lo; i <= hi; i++) {
    // `held(i - 1)` is the closing day: flat now, held yesterday. It reaches
    // back before `lo` on purpose — a window that opens on the sale day contains
    // that sale, and the table's Result column counts it, so the card must too.
    if (held(i) || held(i - 1)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 ? null : { from: first, to: last };
}

/**
 * The money that went *into* a position over a span — gross, not what is left in
 * it.
 *
 * Every euro that ever went in, counted once, over the same days as the result
 * that will be divided by it. `paidIn` is the running net, so the sum of its
 * *rises* is what went in and its falls are what came back out. The day before
 * the span is the baseline; before the series there is nothing.
 *
 * Why gross rather than the net still in it — the second half of the discrepancy
 * report, and the half that survives even after the span is fixed. The net is a
 * *stock*: a position sold out has none of your money left in it, so the net
 * denominator is zero (or negative, when it sold above cost) and the card had no
 * percentage left to show for anything closed. Worse, halfway between: sell half
 * of a doubled position and the net falls while the result stays, so the same
 * position reports a return that climbs as money is taken off the table. "For
 * every euro I put in, this came back" is a question about the euros that went
 * in, which is a *flow*, and this is that flow.
 *
 * The holdings table's "% of bought" column is the same question, so it now
 * divides by this same function over the same window. Two figures on one screen
 * that answered a question two ways is what the report was about; there is one
 * way now.
 */
export function moneyInOver(paidIn, from = 0, to = (paidIn?.length ?? 1) - 1) {
  const a = paidIn ?? [];
  const lo = Math.max(0, from);
  const hi = Math.min(a.length - 1, to);
  let total = 0;
  for (let i = lo; i <= hi; i++) {
    const rise = (a[i] ?? 0) - (i > 0 ? a[i - 1] ?? 0 : 0);
    if (rise > 0) total += rise;
  }
  return total;
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
 * US-52 — how much of what this is worth is money you put in, and how much it
 * made. One function, two renderers.
 *
 * `value = paidIn + result` holds exactly at every point for one instrument — a
 * buy is money into the position, a sale is money out, SPEC §1.4 applied to a
 * single holding. That identity is the only reason this can be drawn at all:
 * splitting today's value into "cost" and "gain" the usual way needs FIFO or
 * average cost, and those are an argument with no right answer. **It splits a
 * stock, never a flow** — which is exactly why the same bar cannot be put on a
 * sell transaction (US-53), and the wall to stop at if anybody tries.
 *
 * The arithmetic used to live inline in `app.js`'s holdings table. It is here
 * because the card needs the same split and two copies of a three-branch rule
 * drift — the under-water scaling in particular was a real defect once, and
 * fixing it in one of two places would have been worse than never having moved
 * it. `splitCell` is now a caller; so is `snapshotModel`.
 *
 * Returns percentages, an enum and an i18n key with its substitutions. **No
 * amount, no currency, no identity** — which is what makes it the one part of a
 * holdings row that was always safe to post publicly, and why it survives US-46
 * untouched: there is no euro in it to mask.
 *
 * Three states, all real:
 *  - `grown` — part of the bar is yours, the rest is what it made.
 *  - `underwater` — worth less than went in, so the bar shows the shortfall in
 *    the loss colour rather than pretending the gain segment is zero.
 *  - `free` — more has come out than went in, `paid` is negative, and every euro
 *    on screen is the market's. Said in words rather than clamped to 0 %.
 */
export function splitModel(paid, grown) {
  const value = paid + grown;
  if (paid < 0) {
    // A closed position sold at a profit lands here on an all-time card, and
    // that is correct rather than degenerate: there is nothing left of yours in
    // it. Words, because a bar of a negative denominator means nothing.
    return { state: 'free', keptPct: 0, lostPct: 100, key: 'all gain — more came out than went in', vars: {} };
  }
  if (grown >= 0) {
    // `Math.max(value, 0.01)` rather than a zero guard: a position worth nothing
    // that cost nothing is 100 % paid in, not a division by zero.
    const paidPct = Math.round((paid / Math.max(value, 0.01)) * 100);
    const grownPct = Math.max(0, 100 - paidPct);
    return {
      state: 'grown',
      keptPct: paidPct,
      lostPct: grownPct,
      key: '{paid}% paid in · {grown}% grown',
      vars: { paid: paidPct, grown: grownPct },
    };
  }
  // Scaled against what was paid in, not against what it is worth now. Against
  // the current value a total loss reads as 100 % of nothing.
  const lost = Math.round((-grown / Math.max(paid, 0.01)) * 100);
  return {
    state: 'underwater',
    keptPct: Math.max(0, 100 - lost),
    /**
     * The *bar* stops at the track; the *sentence* keeps the real figure. A
     * written option can lose four times what was paid in, and `{lost}` says
     * 400 % — but a segment 400 % wide is not a proportion of anything, and the
     * only reason it looked right in the table is that the cell clips it. A bar
     * whose correctness depends on `overflow: hidden` is one wrong stylesheet
     * away from drawing across the row, and it is drawn on a canvas now, where
     * there is no cell to clip it.
     */
    lostPct: Math.min(100, lost),
    key: '{lost}% of what you paid in is gone',
    vars: { lost },
  };
}

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
 * Reduce a series to at most `max` points, keeping the first, the last **and
 * every extreme**.
 *
 * The sparkline is a shape, not a reading: no axis, no scale, so it discloses
 * the path and never a level. Downsampling here rather than in the drawing code
 * keeps the model the whole truth of what will be drawn.
 *
 * Which is exactly why it cannot be sampled every *n*-th day, and used to be.
 * Stride sampling keeps whatever days it happens to land on, so the peak and the
 * trough survive only by luck — measured over the demo account's ten positions
 * it threw away **5 % to 14 % of the range**, and on a six-year holding the line
 * drew a best moment €2 300 below the real one. The line is then normalised to
 * its own extent (`drawSpark`), so the drop is invisible: a shallower shape,
 * drawn confidently, at full height. A crash that lasted a fortnight inside a
 * five-year position could disappear entirely.
 *
 * Min/max decimation instead — the waveform convention. The interior is cut into
 * buckets and each contributes its lowest and its highest day, in the order they
 * happened, so:
 *
 *  - the global peak and trough are always drawn, because they are the extreme
 *    of whichever bucket holds them;
 *  - no wiggle is invented: every point is a real day's value, never averaged or
 *    interpolated;
 *  - and a monotone run stays monotone, because min-then-max of a rising bucket
 *    is its first and last day.
 *
 * The cost is that spacing is no longer uniform in time. For a shape with no
 * x-axis that is the cheaper of the two prices, and it is the one the rest of
 * this file already pays: the card shows a path, and the honest version of a
 * path is one that still contains its worst day.
 */
export function sparkline(series, max = 48) {
  const xs = (series ?? []).filter((v) => Number.isFinite(v));
  if (xs.length <= max) return xs;
  // Two points per bucket, plus the first and the last, which are kept whatever
  // they are: the last is the position's result, and a card whose line ends
  // somewhere other than its own figure is the defect one story up.
  const buckets = Math.floor((max - 2) / 2);
  const out = [xs[0]];
  const step = (xs.length - 2) / buckets;
  for (let b = 0; b < buckets; b++) {
    const lo = 1 + Math.floor(b * step);
    const hi = Math.min(xs.length - 2, Math.floor(1 + (b + 1) * step) - 1);
    if (hi < lo) continue;
    let min = lo;
    let max2 = lo;
    for (let i = lo; i <= hi; i++) {
      if (xs[i] < xs[min]) min = i;
      if (xs[i] > xs[max2]) max2 = i;
    }
    // In the order they happened. Reversing them would draw a fall as a rise.
    const [a, c] = min <= max2 ? [min, max2] : [max2, min];
    out.push(xs[a]);
    if (c !== a) out.push(xs[c]);
  }
  out.push(xs[xs.length - 1]);
  return out;
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
  let netIn = 0;
  const series = [];
  if (span) {
    let running = 0;
    for (let i = span.from; i <= span.to; i++) {
      running += pnl[i] ?? 0;
      series.push(running);
    }
    result = running;
    // Over the same days, so numerator and denominator agree. Gross — see
    // `moneyInOver` for why the net still in it is the wrong denominator, and why
    // this is the same function the holdings row divides by.
    moneyIn = moneyInOver(paidIn, span.from, span.to);
    // The net, which is a different number and answers a different question: what
    // is *still* in it. Only the bar uses this, because only the bar splits a
    // value into parts that have to add up to it.
    netIn = (paidIn[span.to] ?? 0) - (span.from > 0 ? paidIn[span.from - 1] ?? 0 : 0);
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
    /**
     * US-52. The pct answers *"for every euro in, how much came back"*; the bar
     * answers *"of what this is worth, how much is mine"*.
     *
     * Measured over `span`, so a windowed card's bar is windowed like everything
     * else on it, and an all-time card reproduces the holdings row's bar to the
     * digit — the span ends on the last day, which is where `splitCell` reads.
     *
     * **Only while the position is open**, which is the third half of the
     * discrepancy report. The bar splits a *stock* — a value you are holding — and
     * a closed position is not worth anything, so there is nothing to split. It
     * drew one anyway: a position sold out at a loss came back from `splitModel`
     * as "100% of what you paid in is gone" on a sale that lost 20 %, because the
     * net left in it and the loss happened to be the same size. The holdings row
     * has always printed a dash here for anything closed (`app.js`, `cellFor
     * .split`); the card now agrees with it rather than inventing a bar for a
     * position that no longer exists.
     *
     * Not governed by `anonymized`: there is no amount in it. That is the point
     * of putting this on a public card rather than the euros beside it.
     */
    split: span && Math.abs(qty[span.to] ?? 0) > 1e-9 ? splitModel(netIn, result) : null,
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
export function provenanceLine(p = {}, { translate = (s) => s } = {}) {
  // `translate` replaces an `unknownText` option that nothing ever passed. The
  // three verdicts are one decision and they belong in one place; handing in the
  // lookup keeps this module pure — `i18n.js` is UI, and a lib module reaching
  // up into it would be the layering the whole `lib/` split exists to prevent.
  const bits = [p.broker].filter(Boolean);
  if (p.asOf) bits.push(p.asOf);
  bits.push(translate(
    p.reconciled === true ? 'reconciled to the cent'
      : p.reconciled === false ? 'DOES NOT reconcile'
        : 'not checked against the broker',
  ));
  if (p.version) bits.push(`v${p.version}`);
  return bits.join(' · ');
}

/**
 * US-59 — how big the type on a card is, and why it is not a pixel size.
 *
 * The defect, measured: the provenance line was `15px` on a 1280-wide card. A
 * chat renders that card at 500–700 px, which is a scale of 0,39–0,55, so the
 * line that says whether the figure reconciled arrived on screen at **six
 * pixels**. Nobody read it. The rest of the small print — the symbol, the
 * caption under the hero number, the name of whoever shared it — was the same.
 *
 * Absolute pixels were wrong twice over. They are unreadable after the scale a
 * chat applies, and they mean *different* sizes per format: `15px` is 1,17 % of
 * a 1280-wide landscape card and 1,85 % of an 810-wide story, so the same line
 * was a different size in two cards side by side.
 *
 * So the ramp is expressed in one unit — a thousandth of the card's width — and
 * every size on the canvas is a multiple of it. Two consequences, and both are
 * the point:
 *
 *  - **On-screen size no longer depends on the format.** At a rendered width of
 *    `Wr`, a `k`-unit size lands at `k · Wr / 1000` px whatever the card's own
 *    pixel dimensions are. The four formats become four crops of one design.
 *  - **The floor is checkable.** `CARD_MIN_TYPE_PX` at `CARD_RENDER_MIN_PX` is a
 *    measurement the test suite performs, not a comment. It is why the ramp is
 *    compressed rather than merely enlarged: lifting the small print to the
 *    floor while keeping the hero where it was is what makes it *fit*.
 *
 * ## Width, where the refinement said short edge
 *
 * Deliberate, and it is the one place this departs from what was written down.
 * The refinement's own evidence is a width — *"a chat renders it at 500–700 px
 * wide"* — and sizing on the short edge does not hold that constant: a 16:9
 * card's short edge is 56 % of its width, so at one rendered width its type
 * would come out half the size of the 9:16 beside it. Width is the dimension
 * that actually binds, and it is the dimension the measurement was taken in.
 *
 * It costs nothing on the stated acceptance either. For three of the four
 * formats the short edge *is* the width; on the fourth, 16:9, the width is the
 * longer one, so a floor expressed against width clears the same floor
 * expressed against the short edge with room to spare. The suite checks both,
 * so if a fifth, taller-than-wide format is ever added the two stop agreeing
 * loudly rather than quietly.
 */

/** The narrowest a card is rendered at once it leaves here. Measured in a chat. */
export const CARD_RENDER_MIN_PX = 500;

/**
 * The smallest type that is still readable at that width. Below this a reader
 * does not squint, they skip — and the line most often skipped was the one
 * saying the numbers did not reconcile.
 */
export const CARD_MIN_TYPE_PX = 11;

/**
 * And the floor the refinement stated, in its own terms: no line under 2,4 % of
 * the card's short edge. Kept as a second, independently-expressed check rather
 * than folded into the one above — two floors derived from different reasoning
 * catch a format that satisfies one by accident.
 */
export const CARD_MIN_SHORT_EDGE_SHARE = 0.024;

/**
 * The ramp, in thousandths of the card's width.
 *
 * Every entry is ≥ 24: 24/1000 × 500 = 12 px on screen, and 2,4 % of the short
 * edge on every format in `FORMATS`, which are the two floors above. The
 * hierarchy is carried by the gaps between the steps, not by making the bottom
 * of the ramp small — a card is a small object read at a glance, and there is
 * nothing on it that earns being hard to read.
 */
const RAMP = Object.freeze({
  brand: 24, name: 36, symbol: 25, hero: 64, caption: 25, amount: 28, owner: 25, provenance: 24,
});

/**
 * Spacing, in the same unit, so a card scales as one thing.
 *
 * These were the renderer's bare numbers; they are here beside the type because
 * a ramp that moves without its leading is a layout that collides.
 */
const SPACE = Object.freeze({
  pad: 37.5,
  markH: 26,
  markGap: 11,
  gapName: 48,
  gapSymbol: 30,
  gapHero: 68,
  gapCaption: 34,
  gapAmount: 40,
  // US-52's bar: its height, the gap above it, and the baseline of its sentence.
  gapSplit: 34,
  splitBarH: 12,
  gapSplitWords: 30,
  // US-54's chartless card. The spark's room goes to the figure, so the hero is
  // larger here than on a position card and the block is centred in what is
  // left between the mark and the footer.
  scoreLabel: 26,
  scoreFigure: 104,
  scoreCaption: 26,
  // Baseline to baseline from the label to the figure. It has to clear the
  // figure's cap height (about ¾ of 104) or the label lands inside the digits —
  // which it did, at 84.
  gapScoreFigure: 108,
  gapScoreCaption: 46,
  gapSpark: 40,
  sparkTopWide: 40,
  sparkFloor: 62,
  // Baseline to baseline in the footer stack. It has to clear the type sitting
  // in it or the lines collide — which they did, at the old 22.
  footLine: 32,
  // Headroom between the topmost footer line and whatever is drawn above it.
  footHead: 22,
});

/**
 * Resolve the ramp and the spacing for a card of a given width.
 *
 * Pure, and the only thing the renderer is allowed to get a size from. A bare
 * number in `src/ui/snapshot.js` is the defect coming back.
 */
export function cardMetrics(w) {
  const u = w / 1000;
  const scale = (spec) => Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v * u]));
  return { u, type: scale(RAMP), ...scale(SPACE) };
}

/**
 * What a size lands at on screen, once the card is rendered `renderedWidth` wide.
 *
 * Exists so the check in the test suite is the same arithmetic the renderer
 * relies on rather than a second copy of it.
 */
export const onScreenPx = (sizeInCardPx, cardWidth, renderedWidth = CARD_RENDER_MIN_PX) =>
  (sizeInCardPx / cardWidth) * renderedWidth;

// ===========================================================================
// US-54 — a score card: one figure, no chart
// ===========================================================================

/**
 * Everything a score card may carry. Same rule as `SNAPSHOT_FIELDS`, one story
 * later: an allowlist, because under a denylist the field added tomorrow ships
 * by default (CLAUDE.md rule 7).
 *
 * Note what is *not* here: no series, no quantity, no product id. A score card
 * is a figure and the words around it — the sparkline is what the position card
 * has and this one deliberately does not.
 */
export const SCORECARD_FIELDS = Object.freeze([
  'label', 'figure', 'caption', 'tone', 'period', 'provenance', 'owner',
]);

/**
 * Build a score card's model from a tile.
 *
 * The figure and the caption arrive as **strings the page already formatted**,
 * and that is the whole safety argument rather than an implementation detail.
 * Every amount on the page goes through `theme.js`'s formatters, which is where
 * US-46's mask lives — so a card drawn from a tile's own strings cannot show
 * more than the page does, and this module needs no masking logic of its own to
 * be sure of it. Handing it a number instead would put the decision back here,
 * where it would be a second implementation of the one rule.
 *
 * The caller is responsible for asking for the tile at the right mask setting —
 * the sheet's toggle, not the page's. That is `withAnonymize` in `theme.js`, and
 * it is the only plumbing this story adds.
 */
export function scoreCardModel({
  label,
  figure,
  caption = null,
  cls = null,
  period = null,
  owner = null,
  broker = 'DEGIRO',
  asOf = null,
  reconciled = null,
  version = null,
} = {}) {
  const model = {
    label: String(label ?? '—'),
    figure: String(figure ?? '—'),
    caption: caption == null ? null : String(caption),
    /**
     * Normalised to an enum rather than passed through. `cls` is a CSS class on
     * the page and a colour on the canvas, and a caller handing over an
     * arbitrary string would be choosing what gets painted — which is exactly
     * the kind of decision the allowlist exists to keep out of the renderer.
     */
    tone: cls === 'up' ? 'up' : cls === 'down' ? 'down' : 'neutral',
    period: period?.from ? { from: String(period.from), to: String(period.to ?? period.from) } : { from: null, to: null },
    owner: owner?.text ? { text: String(owner.text), derived: owner.derived === true } : null,
    /**
     * Provenance matters *more* here than on a position card, not less. A score
     * card can be the account's headline number, so the reconciliation verdict
     * is the whole trust claim — and a clean-looking Result card from an account
     * forty thousand euro out is precisely the lie rule 6 exists to prevent.
     * Tri-state, and an unchecked verdict never renders as a pass.
     */
    provenance: pick({
      broker: String(broker),
      asOf,
      reconciled: reconciled === true ? true : reconciled === false ? false : null,
      version,
    }, PROVENANCE_FIELDS),
  };

  // Built, then filtered — the same order as `snapshotModel`, so a key added to
  // the object above is dropped here rather than discovered in a screenshot.
  return pick(model, SCORECARD_FIELDS);
}
