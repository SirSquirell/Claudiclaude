import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MASK, hasDigits, maskEur, maskQty, maskSigned } from '../src/lib/anon.js';
import { DOTS, DOT_R, LINE, MIN_LOCKUP_HEIGHT, STAR, STROKE_W, VIEWBOX, markWidth } from '../src/ui/brand.js';
import {
  CARD_MIN_SHORT_EDGE_SHARE, CARD_MIN_TYPE_PX, CARD_RENDER_MIN_PX, FORMATS, PROVENANCE_FIELDS,
  SCORECARD_FIELDS, SNAPSHOT_FIELDS, cardMetrics, scoreCardModel, splitModel,
  formatById, moneyInOver, onScreenPx, ownerLine, positionSpan, provenanceLine, returnOnMoneyIn,
  snapshotModel, sparkline,
} from '../src/lib/snapshot.js';
import { computePortfolio } from '../src/lib/engine.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ===========================================================================
// US-46 — anonymize
// ===========================================================================

test('a mask carries no digit at all', () => {
  // AC2/AC3 in one line: what reaches the DOM has nothing in it to recover.
  for (const s of [maskEur(), maskQty(), maskSigned(1234.56), maskSigned(-1234.56), maskSigned(0)]) {
    assert.equal(hasDigits(s), false, `"${s}" still contains a figure`);
  }
});

test('the mask is fixed width, so it does not leak the magnitude', () => {
  // A mask that preserves digit count says "six figures", which is most of what
  // a screenshot gives away. This is the decision, asserted so a later change
  // to it is deliberate.
  assert.equal(maskEur(), `€ ${MASK}`);
  assert.equal(maskEur(), maskEur());
  assert.equal(MASK.length, 3);
});

test('a masked amount keeps its sign', () => {
  // Not an oversight. Every signed figure also carries a pos/neg class that
  // colours it, so dropping the sign from the text would hide nothing and look
  // broken.
  assert.ok(maskSigned(5).includes('+'));
  assert.ok(maskSigned(-5).includes('-'));
  assert.ok(!maskSigned(0).includes('+') && !maskSigned(0).includes('-'));
});

test('no currency is formatted anywhere outside theme.js', () => {
  /**
   * The other half of the choke point. Masking lives inside the formatters so a
   * money field added next year is masked by default — but only while every
   * money field still goes through them. One inline `Intl.NumberFormat` with a
   * currency, or one `toLocaleString` with options, and the mask has a hole
   * that nothing else would notice.
   */
  for (const f of ['app.js', 'charts.js', 'popup.js', 'snapshot.js', 'frown.js', 'errors.js', 'datasource.js']) {
    let src;
    try {
      src = read(`../src/ui/${f}`);
    } catch {
      continue;
    }
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/style:\s*['"]currency['"]/.test(code), `${f} formats a currency`);
    // A date's toLocaleString takes no options object here; a number's does,
    // and that is the shape a quantity has.
    assert.ok(!/toLocaleString\([^)]*\{/.test(code), `${f} formats a number outside theme.js`);
  }
});

test('the toggle is stored as a preference, not as account data', () => {
  const src = read('../src/ui/theme.js');
  assert.ok(/localStorage/.test(src));
  assert.ok(!/indexedDB|setMeta|chrome\.storage/.test(src), 'nothing about it is persisted with the account');
});

// ===========================================================================
// US-48 — the mark
// ===========================================================================

const svgLight = read('../assets/logo/asteria-logo-light.svg');
const svgDark = read('../assets/logo/asteria-logo-dark.svg');
const css = read('../src/ui/styles.css');

const norm = (d) => d.replace(/\s+/g, ' ').replace(/\s*([A-Za-z])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim();
const paths = (s) => [...s.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
const circles = (s) => [...s.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
  .map((m) => m.slice(1).map(Number));

test('the geometry in brand.js is the geometry in the shipped SVG', () => {
  /**
   * `brand.js` is a hand-copy, because a canvas cannot use the file: an SVG
   * drawn through `drawImage` ignores `currentColor` and the page's CSS, so a
   * file-based watermark would have to pick a colour variant in JavaScript —
   * the thing the brand rule forbids. A hand-copy drifts, and this is what
   * stops it. Without it the failure is silent and long-lived.
   */
  const [line, star] = paths(svgLight);
  assert.equal(norm(LINE), norm(line));
  assert.equal(norm(STAR), norm(star));
  assert.equal(STROKE_W, Number(/stroke-width="([\d.]+)"/.exec(svgLight)[1]));
});

test('there are three dots, and the head of the line has none', () => {
  // The spark sits at the fourth point. A redraw from a screenshot puts a dot
  // there too, and it looks right until you overlay them.
  const c = circles(svgLight);
  assert.equal(c.length, 3);
  assert.deepEqual(DOTS.map((d) => [...d]), c.map(([x, y]) => [x, y]));
  assert.ok(c.every(([, , r]) => r === DOT_R));

  const head = [...LINE.matchAll(/L([\d.]+) ([\d.]+)/g)].at(-1);
  assert.ok(!c.some(([x, y]) => x === Number(head[1]) && y === Number(head[2])));
});

test('the two logo files differ in colour and in nothing else', () => {
  // If they ever differ in geometry, one of them is a different logo and the
  // "one component, two tokens" rule has quietly stopped being true.
  const strip = (s) => s.replace(/#[0-9A-Fa-f]{6}/g, '#000000');
  assert.equal(strip(svgLight), strip(svgDark));
});

test('the colours in the SVGs are the tokens in the stylesheet', () => {
  // The app never loads the file, so nothing else checks that a favicon and the
  // mark drawn from code are the same colour.
  const hexes = (s) => [...new Set([...s.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toLowerCase()))].sort();
  assert.deepEqual(hexes(svgLight), ['#16213e', '#d9531e']);
  assert.deepEqual(hexes(svgDark), ['#e8edf5', '#f97038']);

  const token = (name) => [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'gi'))].map((m) => m[1].toLowerCase());
  // Light once, dark twice — under prefers-color-scheme and under
  // [data-theme='dark'] — which is the three-state setup the stylesheet uses
  // everywhere else. All three have to carry the brand value.
  assert.deepEqual(token('brand-ink'), ['#16213e', '#e8edf5', '#e8edf5']);
  assert.deepEqual(token('brand-accent'), ['#d9531e', '#f97038', '#f97038']);
});

test('the app never names a logo file', () => {
  // Files are for the media CSS cannot reach. Anything under src/ naming one has
  // picked a colour variant at render time.
  for (const f of ['app.js', 'brand.js', 'charts.js', 'snapshot.js', 'theme.js', 'app.html', 'popup.html', 'styles.css']) {
    const code = read(`../src/ui/${f}`).replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/asteria-logo-(light|dark)\.svg/.test(code), `${f} names a logo file`);
  }
});

test('the mark cannot be stretched and the lockup has a floor', () => {
  assert.equal(markWidth(40), (40 * VIEWBOX.w) / VIEWBOX.h);
  assert.equal(MIN_LOCKUP_HEIGHT, 24);
});

test('the watermark is drawn above the plot area, never inside it', () => {
  /**
   * The measured reason, not a preference: `#d9531e` against `--series-4`
   * `#b0461a` is 1.39:1 on light and 1.05:1 on dark. Inside the plot the spark
   * would not read as a watermark, it would read as a data point — and the
   * palette was validated against a surface a tint underneath would change.
   */
  const src = read('../src/ui/charts.js');
  const plugin = /const watermark = \{[\s\S]*?\n\};/.exec(src)[0];
  assert.ok(/beforeDraw/.test(plugin), 'behind the data, not over it');
  // The claim is vertical: the mark's bottom edge is above the plot's top edge,
  // so no part of it overlaps a series. Horizontally it aligns to the plot's
  // left edge — inside the plot's *columns* but above its rows, and clear of
  // the y-axis tick labels, which are the only thing in that padding row.
  assert.ok(/y: Math\.max\(0, area\.top - height/.test(plugin), 'placed above chartArea.top');
  assert.ok(!/y:\s*area\.(top|bottom)\s*[+]/.test(plugin), 'never drawn down into the plot');
  assert.ok(/if \(area\.top < height/.test(plugin), 'and it withholds itself when there is no room');
  assert.ok(/padding: \{ top: WATERMARK\.height \+ /.test(src), 'and the space above is reserved');
});

// ===========================================================================
// US-47 — the snapshot
// ===========================================================================

/**
 * A synthetic position, in the shape the model now takes.
 *
 * US-50 changed the signature from three pre-computed numbers to the arrays plus
 * a window, because the caller was computing the result over one span and the
 * money in over another. Four days, bought on the second, so the fixture also
 * exercises the clipping: a card built from this must not mention day 0.
 */
const base = {
  name: 'Some Instrument',
  symbol: 'SMI',
  days: ['2025-12-31', '2026-01-01', '2026-04-01', '2026-06-01', '2026-08-12'],
  qty: [0, 10, 10, 10, 10],
  pnl: [0, 0, 500, 234.56, 500],
  paidIn: [0, 1000, 1000, 1000, 1000],
  version: '0.44.0',
};

test('only allowlisted fields reach the model', () => {
  const m = snapshotModel({ ...base, accountId: 7654321, iban: 'NL91ABNA0417164300', displayName: 'A Person' }); // leak-check: ok
  assert.deepEqual(Object.keys(m).sort(), [...SNAPSHOT_FIELDS].sort());
  const json = JSON.stringify(m);
  assert.ok(!json.includes('7654321'), 'no identifier'); // leak-check: ok
  assert.ok(!json.includes('NL91'), 'no account number');
  assert.ok(!json.includes('A Person'), 'no name');
});

test('a poisoned provenance cannot smuggle a field through either', () => {
  const m = snapshotModel({ ...base, broker: 'DEGIRO' });
  m.provenance.sessionId = 'x';
  const fresh = snapshotModel({ ...base });
  assert.deepEqual(Object.keys(fresh.provenance).sort(), [...PROVENANCE_FIELDS].sort());
});

test('US-46 governs the amount on the card', () => {
  assert.equal(snapshotModel({ ...base, anonymized: false }).amount, 1234.56);
  assert.equal(snapshotModel({ ...base, anonymized: true }).amount, null);
  // And the percentage survives, because that is the whole point.
  assert.ok(snapshotModel({ ...base, anonymized: true }).pct > 0);
});

test('an unchecked reconciliation is never rendered as a pass', () => {
  /**
   * The tri-state is the honest part of the card. "Certified" would be a claim
   * no code here can make — any signature the extension can produce, anyone
   * holding it can produce. What it *can* say is whether rule 6's check passed,
   * and an unknown verdict shown as a clean one is exactly the lie this field
   * exists to prevent.
   */
  assert.equal(snapshotModel({ ...base }).provenance.reconciled, null);
  assert.equal(snapshotModel({ ...base, reconciled: 'yes' }).provenance.reconciled, null);
  assert.equal(snapshotModel({ ...base, reconciled: true }).provenance.reconciled, true);

  assert.match(provenanceLine({ broker: 'DEGIRO' }), /not checked/);
  assert.match(provenanceLine({ broker: 'DEGIRO', reconciled: false }), /DOES NOT reconcile/);
  assert.match(provenanceLine({ broker: 'DEGIRO', reconciled: true }), /reconciled to the cent/);
});

test('the card never claims to be certified', () => {
  for (const f of ['../src/lib/snapshot.js', '../src/ui/snapshot.js']) {
    const code = read(f).replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/certified/i.test(code), `${f} uses the word in rendered output`);
  }
});

test('nothing in this feature makes a network request', () => {
  // The button says Discord and talks to the clipboard. A webhook URL would be
  // a stored credential and an egress path in one line: rules 9 and 7.
  for (const f of ['../src/lib/snapshot.js', '../src/ui/snapshot.js']) {
    const code = read(f).replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(code), `${f} reaches the network`);
    assert.ok(!/discord(app)?\.com|webhook/i.test(code), `${f} names an endpoint`);
  }
});

test('a position with no money in reports words, not a percentage of nothing', () => {
  // `value = paidIn + result` exactly, so when more has come out than went in
  // there is no denominator. A real state, not an error.
  assert.deepEqual(returnOnMoneyIn(500, 0), { pct: null, basis: 'no-money-in' });
  assert.deepEqual(returnOnMoneyIn(500, -20), { pct: null, basis: 'no-money-in' });
  assert.equal(returnOnMoneyIn(250, 1000).pct, 25);
  assert.equal(snapshotModel({ ...base, paidIn: [0, 0, 0, 0, 0] }).pct, null);
});

// ===========================================================================
// Phase 7 — the share sheet
// ===========================================================================

test('the card field set is exactly SNAPSHOT_FIELDS, and it now carries a name', () => {
  // The phase 7 gate, in one line. `name` is the instrument; `owner` is the
  // person, and it is the field the sheet added — a card that could not say who
  // posted it was the reason nobody could tell two accounts' cards apart.
  assert.ok(SNAPSHOT_FIELDS.includes('name'));
  assert.ok(SNAPSHOT_FIELDS.includes('owner'));
  const m = snapshotModel({ ...base, owner: { text: 'Sam', derived: true } });
  assert.deepEqual(Object.keys(m).sort(), [...SNAPSHOT_FIELDS].sort());
});

test('a typed name is never presented as the account’s', () => {
  /**
   * The distinction the whole `derived` flag exists for. `first` and `username`
   * are read out of the account, so the card may say the position is that
   * person's; a handle somebody typed may only say who is posting it. Rendering
   * the second as the first would be the card asserting something no code here
   * checked — the same failure as a forgeable badge.
   */
  assert.deepEqual(ownerLine({ source: 'first', fullName: 'Jasper de Vries' }), { text: 'Jasper', derived: true });
  assert.deepEqual(ownerLine({ source: 'username', username: 'jasper_v' }), { text: 'jasper_v', derived: true });
  assert.deepEqual(ownerLine({ source: 'handle', handle: 'jazzer#1' }), { text: 'jazzer#1', derived: false });
  assert.equal(ownerLine({ source: 'none', fullName: 'Jasper de Vries' }), null);

  // Only the first name, and only ever the first name. A full name on something
  // posted publicly is more than the reader needed and less than you can retract.
  assert.equal(ownerLine({ source: 'first', fullName: 'Jasper de Vries' }).text, 'Jasper');

  // Empty at any source collapses to no line: "shared by" followed by nothing
  // is worse than no name at all.
  for (const src of ['first', 'username', 'handle']) {
    assert.equal(ownerLine({ source: src, fullName: '  ', username: '', handle: '   ' }), null);
  }

  // And the model normalises, so a caller cannot smuggle a bare string past the
  // question the card has to answer.
  assert.equal(snapshotModel({ ...base, owner: 'Sam' }).owner, null);
  assert.deepEqual(snapshotModel({ ...base, owner: { text: 'Sam' } }).owner, { text: 'Sam', derived: false });
});

test('US-50 — the spark starts at the buy and ends at the sale', () => {
  /**
   * The defect Jasper reported: a card for something bought last month drew a
   * line from the account's opening, so eleven twelfths of it was flat at zero
   * and the shape was squeezed into the last inch.
   */
  const qty = [0, 0, 0, 5, 5, 5, 0, 0];
  assert.deepEqual(positionSpan(qty), { from: 3, to: 6 }, 'the flat run before the buy is not part of the position');

  /**
   * Day 6 is the sale: quantity is the figure at the *end* of a day, so the day
   * a position is sold out reads zero — and it is the day the sale's own P/L
   * falls on. The span ends there, not at day 5. This assertion is the whole of
   * the discrepancy report: ending at day 5 dropped the largest single day of a
   * closed position and printed a card that disagreed with its own table row.
   */
  assert.deepEqual(positionSpan(qty, 4, 6), { from: 4, to: 6 }, 'clipped at the front, still ends at the sale');
  assert.deepEqual(positionSpan(qty, 6, 7), { from: 6, to: 6 }, 'a window opening on the sale day contains the sale');

  // Clipped to the reader's window, both ends. A 3-month card for a five-year
  // holding shows three months.
  assert.deepEqual(positionSpan(qty, 3, 4), { from: 3, to: 4 });
  assert.deepEqual(positionSpan([1, 1, 1], 0, 2), { from: 0, to: 2 }, 'still held today runs to the window end');

  // A short is a position too, and closing one is a closing day like any other.
  assert.deepEqual(positionSpan([0, -3, -3, 0]), { from: 1, to: 3 });

  // Never open in the window: no span, and the caller draws nothing rather than
  // inventing one.
  assert.equal(positionSpan([0, 0, 0]), null);
  assert.equal(positionSpan(qty, 7, 7), null);
  assert.equal(positionSpan(null), null);

  // One day held, then sold: two days. Whether a line can be drawn across them
  // is the renderer's problem, and deciding it here would make this function
  // about drawing.
  assert.deepEqual(positionSpan([0, 4, 0]), { from: 1, to: 2 });
});

test('the card and the holdings row report the same result for a closed position', () => {
  /**
   * The defect as reported: one screenshot, a holdings row showing a loss and the
   * card shared from that same row showing a gain — a different sign for the same
   * position on the same day. The reported figures are in the changelog and in
   * `docs/BACKLOG.md`; no value out of a real account enters `test/` (rule 7),
   * and this scenario is built from scratch below.
   *
   * Three faults, all in this one assertion:
   *
   *  1. `positionSpan` ended on the last day the position was *held*, so the
   *     sale day — where a closed position books the move between its last close
   *     and the price it sold at — was outside the card's span and outside its
   *     total. The table's Result column sums the whole window and kept it.
   *  2. The percentage divided by the money *still* in it. Sold out, that is
   *     zero or negative, so the denominator was whatever `paidIn` happened to
   *     read on the day before the sale rather than what went in.
   *  3. A paid-in-vs-grown bar was drawn for a position worth nothing.
   *
   * Built through the engine rather than from hand-written arrays, because the
   * fault was in the relationship between `qty`, `pnl` and `paidIn` — three
   * arrays a test that invents them can quietly make agree.
   */
  const r = computePortfolio({
    products: { 1: { id: '1', name: 'TEST', symbol: 'TST', currency: 'EUR', vwdId: '900' } },
    prices: { 900: { start: '2024-01-01', stepDays: 1, points: [
      { offsetDays: 0, close: 100 }, { offsetDays: 1, close: 100 }, { offsetDays: 2, close: 110 },
      { offsetDays: 3, close: 110 }, { offsetDays: 4, close: 120 },
    ] } },
    today: '2024-01-05',
    cashRows: [
      { date: '2024-01-01', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', category: 'DEPOSIT' },
      { date: '2024-01-02', description: 'Koop 5 @ 100', change: -500, currency: 'EUR', category: 'TRADE' },
      { date: '2024-01-05', description: 'Verkoop 5 @ 120', change: 600, currency: 'EUR', category: 'TRADE' },
    ],
    transactions: [
      { date: '2024-01-02', productId: '1', quantity: 5, price: 100, currency: 'EUR', fee: 0, totalBase: -500 },
      { date: '2024-01-05', productId: '1', quantity: -5, price: 120, currency: 'EUR', fee: 0, totalBase: 600 },
    ],
  });
  const p = r.byProduct[0];
  const to = r.days.length - 1;

  // What the table prints: the window's result, and it is the whole result —
  // bought at 100, sold at 120, five of them.
  const rowResult = p.pnl.reduce((a, b) => a + b, 0);
  assert.equal(rowResult, 100);
  assert.equal(p.pnl.at(-1), 50, 'a fifth of it is on the sale day, which is where qty already reads zero');

  const m = snapshotModel({ name: p.name, days: r.days, qty: p.qty, pnl: p.pnl, paidIn: p.paidIn });
  assert.equal(m.amount, rowResult, 'the card and the row agree, to the cent');
  assert.equal(m.period.to, '2024-01-05', 'and the card says the sale day, not the day before it');

  // The percentage the row prints, from the same function, over the same days.
  assert.equal(moneyInOver(p.paidIn, 0, to), 500);
  assert.equal(m.pct, (rowResult / moneyInOver(p.paidIn, 0, to)) * 100);
  assert.equal(m.pct, 20);

  // And no bar, because there is no position left to split. The row has always
  // printed a dash here; the card now does the same rather than splitting zero.
  assert.equal(m.split, null);
});

test('money in is what went in, not what is left in', () => {
  // Buy 500, buy 300, sell 400 back out: 800 went in. The net still in it is
  // 400, and dividing a result by that reports a return that grows every time
  // money is taken off the table.
  const paidIn = [0, 500, 500, 800, 400, 400];
  assert.equal(moneyInOver(paidIn), 800);

  // Over a window, and the day before it is the baseline: the second buy only.
  assert.equal(moneyInOver(paidIn, 3, 5), 300);
  // A window with nothing but a sale in it took no money in at all. The caller
  // has no denominator and says so rather than printing a percentage of nothing.
  assert.equal(moneyInOver(paidIn, 4, 5), 0);
  assert.equal(moneyInOver([]), 0);
  assert.equal(moneyInOver(null), 0);
});

test('the account name reaches the card and nothing else', () => {
  /**
   * The rule 7 half of the name feature, and the reason it is worth a test: the
   * 0.10.0 export leaked `displayName` exactly once, by being in the bag of meta
   * that got serialised. `datasource.js` therefore reads it *outside*
   * `DIAGNOSTIC_META`, because everything in that object is folded into the
   * context the bug report and the export are built from.
   *
   * Asserted at the source rather than by calling `buildBugReport`, because the
   * failure this guards is a future edit adding one line to a list — and that
   * line would be invisible to a test that only checks today's output.
   */
  const src = read('../src/ui/datasource.js');
  const block = /const DIAGNOSTIC_META = \{[\s\S]*?\n\};/.exec(src)[0];
  assert.ok(!/displayName/.test(block), 'displayName is in the bag the bug report serialises');
  assert.match(src, /store\.getMeta\('displayName'/, 'and it is still read for the card');
  // It also must not travel inside `meta`, which is what `diagnosticContext`
  // spreads. One field of its own, named at each return.
  assert.ok(!/meta\.displayName|meta\[.displayName/.test(src));
});

test('US-50 — the card measures its number over the days it draws', () => {
  /**
   * AC3 and AC4, and AC4 is the one that produced a wrong figure rather than an
   * ugly one. `base` is bought on day 1 of four, so:
   *
   *  - the period states the position's span, not the account's;
   *  - the result is the position's own cumulative total;
   *  - and the money in is measured over the same days.
   */
  const all = snapshotModel({ ...base, anonymized: false });
  assert.deepEqual(all.period, { from: '2026-01-01', to: '2026-08-12' }, 'day 0 is not part of this position');
  assert.ok(Math.abs(all.amount - 1234.56) < 0.005);
  assert.ok(Math.abs(all.pct - 123.456) < 0.005);

  /**
   * The window, and the defect in one assertion. Over days 2–3 the position made
   * 734.56 — and the old code divided that by 1 000 of all-time money in, giving
   * 73 %. Nothing was put in during those days, so there is no denominator and
   * the card says so in words instead of printing a percentage of the wrong span.
   */
  const windowed = snapshotModel({ ...base, window: { from: 3, to: 4 }, anonymized: false });
  assert.deepEqual(windowed.period, { from: '2026-06-01', to: '2026-08-12' });
  assert.ok(Math.abs(windowed.amount - 734.56) < 0.005);
  assert.equal(windowed.pct, null);
  assert.equal(windowed.pctBasis, 'no-money-in');

  // AC5: one day inside the window draws no line and claims no period.
  const oneDay = snapshotModel({ ...base, window: { from: 4, to: 4 } });
  assert.deepEqual(oneDay.spark, []);
  assert.deepEqual(oneDay.period, { from: null, to: null });

  // AC7: no new value moved onto the card by any of this.
  assert.deepEqual(Object.keys(all).sort(), [...SNAPSHOT_FIELDS].sort());
});

test('the five formats are five distinct shapes, and an unknown one falls back', () => {
  // US-78: five, and the order is load-bearing — the first three are the ones
  // the strip shows without sliding, and it is the tab order too.
  assert.equal(FORMATS.length, 5);
  assert.deepEqual(FORMATS.map((f) => f.id), ['1:1', '16:9', '4:3', '4:5', '9:16']);
  // Ratios, checked rather than trusted: a typo in a height is invisible on
  // screen and wrong in every posted card.
  const ratio = (id, want) => {
    const f = formatById(id);
    assert.ok(Math.abs(f.w / f.h - want) < 0.01, `${id} is ${f.w}×${f.h}`);
  };
  ratio('1:1', 1);
  ratio('4:5', 0.8);
  ratio('9:16', 9 / 16);
  ratio('16:9', 16 / 9);
  ratio('4:3', 4 / 3);
  assert.equal(formatById('3:2'), FORMATS[0], 'an unknown id draws something rather than throwing');
});

test('the sparkline keeps both ends and never more than the cap', () => {
  const s = sparkline(Array.from({ length: 900 }, (_, i) => i), 48);
  assert.ok(s.length <= 48, `${s.length} points drawn where 48 is the cap`);
  assert.equal(s[0], 0);
  assert.equal(s.at(-1), 899);
  // A rising series comes back rising. Min-then-max per bucket is what keeps it
  // that way; taking them in index order rather than value order would draw a
  // staircase on a straight line.
  assert.deepEqual(s, [...s].sort((a, b) => a - b), 'a monotone series stays monotone');
  assert.deepEqual(sparkline([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(sparkline([1, NaN, 3]), [1, 3], 'a gap is dropped, not drawn as zero');
  assert.deepEqual(sparkline(null), []);
});

test('US-77 — the sparkline draws the worst day, whatever day it falls on', () => {
  /**
   * The second half of the discrepancy report: *"ook de charting gaat niet
   * goed"*. It sampled every n-th day, so the peak and the trough survived only
   * if the stride happened to land on them — and because `drawSpark` normalises
   * the line to its own extent, losing them is invisible. You get a shallower
   * shape, drawn confidently, at full height.
   *
   * Measured over the demo account's ten positions before the fix: 5 % to 14 %
   * of each position's range gone. This is that measurement as an assertion, on
   * a series built so the crash sits between two sampling points.
   */
  const days = Array.from({ length: 900 }, (_, i) => Math.sin(i / 40) * 100);
  // A one-day crash and a one-day spike, deliberately off any round stride.
  days[437] = -5000;
  days[691] = 9000;

  const drawn = sparkline(days, 48);
  assert.ok(drawn.length <= 48, 'still inside the point budget');
  assert.ok(drawn.includes(-5000), 'the worst day is on the card');
  assert.ok(drawn.includes(9000), 'and so is the best one');

  // Every point is a real day, never an average of two: a sparkline that
  // interpolates is drawing a day that did not happen.
  for (const v of drawn) assert.ok(days.includes(v), `${v} is not a day in the series`);

  // And the ends are still the ends — the last point is the position's result,
  // which is the figure printed above it (US-76).
  assert.equal(drawn[0], days[0]);
  assert.equal(drawn.at(-1), days.at(-1));

  // The old behaviour, for the record: this stride never lands on 437 or 691.
  const stride = (days.length - 1) / 47;
  const byStride = Array.from({ length: 48 }, (_, i) => days[Math.round(i * stride)]);
  assert.ok(!byStride.includes(-5000) && !byStride.includes(9000), 'which is the defect');
});

// ===========================================================================
// US-59 — the card's small print, measured rather than asserted
// ===========================================================================

test('every size on every format survives the width a chat renders it at', () => {
  /**
   * The defect, as a check. `15px` provenance on a 1280-wide card arrived on
   * screen at 5,9 px once a chat scaled it to 500 — so the test is not "is the
   * number bigger", it is "what does a reader actually see". If a later change
   * drops a step of the ramp below the floor, this fails naming the step.
   */
  for (const f of FORMATS) {
    const m = cardMetrics(f.w);
    for (const [name, size] of Object.entries(m.type)) {
      const seen = onScreenPx(size, f.w, CARD_RENDER_MIN_PX);
      assert.ok(
        seen >= CARD_MIN_TYPE_PX,
        `${f.id}: "${name}" lands at ${seen.toFixed(1)}px, under the ${CARD_MIN_TYPE_PX}px floor`,
      );
    }
  }
});

test('the same line is the same size on screen whatever format it is in', () => {
  /**
   * The second half of the defect, and the one nobody would have noticed: an
   * absolute pixel size is 1,17 % of a landscape card and 1,85 % of a story, so
   * two cards posted side by side had different small print. Expressing the ramp
   * as a fraction of the width makes the four formats four crops of one design.
   */
  const seen = (id) => {
    const f = formatById(id);
    const m = cardMetrics(f.w);
    return Object.fromEntries(
      Object.entries(m.type).map(([k, v]) => [k, +onScreenPx(v, f.w).toFixed(6)]),
    );
  };
  const ref = seen('16:9');
  for (const f of FORMATS) assert.deepEqual(seen(f.id), ref, `${f.id} renders type at a different size`);
});

test('the ramp still has a hierarchy — lifting the floor did not flatten it', () => {
  // Compressed, not collapsed. If the ramp is ever "fixed" by setting every step
  // to the floor, the card stops having a hero and this says so.
  const m = cardMetrics(1000);
  assert.ok(m.type.hero > m.type.name * 1.5, 'the number no longer dominates the name');
  assert.ok(m.type.name > m.type.amount, 'the name no longer outranks the amount');
  assert.ok(m.type.amount > m.type.provenance, 'the amount no longer outranks the small print');
});

test('the renderer holds no pixel sizes of its own', () => {
  /**
   * The rule the fix rests on: a bare `px` in the drawing code is the defect
   * coming back, one line at a time. Sizes come from `cardMetrics` or they do
   * not exist. Template holes (`${m.type.x}px`) are what the ramp looks like in
   * a canvas font string, so they are what is allowed.
   */
  const code = read('../src/ui/snapshot.js')
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const bare = code.match(/[^{][0-9]+(\.[0-9]+)?px/g) ?? [];
  assert.deepEqual(bare, [], `hard-coded type sizes in the card renderer: ${bare.join(', ')}`);
});

test('and the same sizes clear the floor stated the other way, against the short edge', () => {
  /**
   * The refinement expressed the floor as a share of the short edge; the ramp is
   * expressed against the width, for the reason `cardMetrics` gives. Both are
   * checked, because two floors from different reasoning catch a format that
   * satisfies one of them by accident — and because a fifth format taller than
   * it is wide would make them disagree, which is a thing to find out here.
   */
  for (const f of FORMATS) {
    const shortEdge = Math.min(f.w, f.h);
    const m = cardMetrics(f.w);
    for (const [name, size] of Object.entries(m.type)) {
      const share = size / shortEdge;
      assert.ok(
        share >= CARD_MIN_SHORT_EDGE_SHARE,
        `${f.id}: "${name}" is ${(share * 100).toFixed(2)}% of the short edge, `
        + `under ${(CARD_MIN_SHORT_EDGE_SHARE * 100).toFixed(1)}%`,
      );
    }
  }
});

test('the footer lines cannot collide, at any format', () => {
  /**
   * AC3, as geometry rather than as a screenshot. The footer is up to three
   * baselines with nothing between them, and the gap used to be smaller than the
   * type sitting in it. Horizontal overrun is not checked here because `clip()`
   * measures and truncates — this is the axis nothing else guards.
   */
  for (const f of FORMATS) {
    const m = cardMetrics(f.w);
    const tallest = Math.max(m.type.owner, m.type.provenance);
    assert.ok(
      m.footLine >= tallest * 1.15,
      `${f.id}: ${m.footLine.toFixed(1)}px between footer baselines, for ${tallest.toFixed(1)}px type`,
    );
    assert.ok(m.footHead >= tallest * 0.8, `${f.id}: the footer has no headroom above it`);
  }
});

// ===========================================================================
// US-52 — paid vs grown, on the card and in the table, from one function
// ===========================================================================

test('the three states are the three the holdings table already distinguished', () => {
  /**
   * AC4. These are the arithmetic `splitCell` held inline, moved rather than
   * rewritten: the same rounding, the same denominators, the same words. The
   * under-water case is scaled against what was *paid in*, not against what it
   * is worth now — against the current value a total loss reads as 100 % of
   * nothing, and getting that wrong was a real defect once.
   */
  const grown = splitModel(1000, 400);          // worth 1400, 71 % yours
  assert.equal(grown.state, 'grown');
  assert.equal(grown.keptPct, 71);
  assert.equal(grown.lostPct, 29);
  assert.deepEqual(grown.vars, { paid: 71, grown: 29 });

  const under = splitModel(1000, -250);         // a quarter of the inlay is gone
  assert.equal(under.state, 'underwater');
  assert.equal(under.lostPct, 25);
  assert.equal(under.keptPct, 75);

  const free = splitModel(-300, 800);           // sold out at a profit
  assert.equal(free.state, 'free');
  assert.equal(free.keptPct, 0);
  assert.equal(free.lostPct, 100);
  assert.deepEqual(free.vars, {});

  // Neither segment can leave the bar, in any state — including the one that
  // lost four times what went in, where the segment is capped at the track and
  // the sentence still carries the true 400 %.
  const wipeout = splitModel(1000, -4000);
  assert.equal(wipeout.lostPct, 100);
  assert.equal(wipeout.vars.lost, 400, 'the sentence must not be capped with the bar');
  for (const m of [grown, under, free, wipeout, splitModel(0, 0)]) {
    assert.ok(m.keptPct >= 0 && m.keptPct <= 100, `keptPct ${m.keptPct} is outside the bar`);
    assert.ok(m.lostPct >= 0 && m.lostPct <= 100, `lostPct ${m.lostPct} is outside the bar`);
  }
});

test('an all-time card reproduces the holdings row’s bar to the digit', () => {
  /**
   * AC2. The table reads `paidIn.at(-1)` and `current − paidIn.at(-1)`; the card
   * reads the `moneyIn` and `result` it derived over the position's span. On an
   * all-time card the span ends on the last day, so those are the same two
   * numbers — and this asserts it against the model rather than trusting that
   * they are.
   */
  const card = snapshotModel({ ...base });
  const paid = base.paidIn.at(-1);
  const grown = base.pnl.reduce((a, b) => a + b, 0);
  assert.deepEqual(card.split, splitModel(paid, grown));
});

test('the split is measured over the same span as the pct and the amount', () => {
  /**
   * AC3, which is US-50's defect asked about a different field. A windowed card
   * that divided a windowed result by all-time money in printed a percentage
   * belonging to neither span; a bar computed the same way would do it again,
   * silently, because a bar has no digits to look wrong.
   */
  const windowed = snapshotModel({ ...base, window: { from: 3, to: 4 }, anonymized: false });
  // Nothing was paid in during those days: the pct has no denominator and says
  // so, and the bar says the same thing in its own terms — none of what this is
  // worth over the window is money that went in during it.
  assert.equal(windowed.pctBasis, 'no-money-in');
  assert.equal(windowed.split.keptPct, 0);
  // And it is not the all-time bar wearing a window's dates.
  assert.notDeepEqual(windowed.split, snapshotModel({ ...base }).split);

  // A card with no drawable span claims no split either, for the same reason it
  // claims no period: it did not measure one.
  assert.equal(snapshotModel({ ...base, window: { from: 0, to: 0 } }).split, null);
});

test('US-46 does not govern the split, because there is nothing in it to mask', () => {
  /**
   * AC5 and AC6 together. The bar is two percentages, an enum and a translation
   * key — it discloses the *shape* of a position and nothing about its size,
   * which is what makes it the one part of a holdings row that was always safe
   * to post. So it survives anonymize untouched, and the check that it stays
   * that way is that nothing in it is a number outside 0–100.
   */
  const on = snapshotModel({ ...base, anonymized: true });
  assert.equal(on.amount, null, 'the amount is still masked');
  assert.deepEqual(on.split, snapshotModel({ ...base, anonymized: false }).split);

  assert.deepEqual(Object.keys(on.split).sort(), ['keptPct', 'key', 'lostPct', 'state', 'vars']);
  assert.equal(typeof on.split.key, 'string');
  assert.ok(['grown', 'underwater', 'free'].includes(on.split.state));
  for (const v of [on.split.keptPct, on.split.lostPct, ...Object.values(on.split.vars)]) {
    assert.equal(typeof v, 'number');
    assert.ok(v >= 0 && v <= 100, `${v} is not a percentage`);
  }

  // And a caller cannot push anything of its own into it: the field is built by
  // splitModel from two derived numbers, never copied off the argument.
  const poisoned = snapshotModel({ ...base, split: { key: 'x', secret: 'NL91ABNA0417164300' } }); // leak-check: ok
  assert.ok(!JSON.stringify(poisoned.split).includes('NL91'));
});

test('the holdings table holds no split arithmetic of its own any more', () => {
  /**
   * AC7. The point of lifting it was that two copies of a three-branch rule
   * drift — so the check is that the second copy is gone, not that the first one
   * works. If a branch reappears in `app.js`, this fails before the two can
   * disagree about a losing position.
   */
  const code = read('../src/ui/app.js');
  const fn = code.slice(code.indexOf('const splitInner'), code.indexOf('const resultInner'));
  assert.ok(fn.includes('splitModel('), 'splitInner no longer calls the shared function');
  assert.ok(!/keptPct\s*=/.test(fn), 'splitInner is computing percentages again');
  assert.ok(!/Math\.round/.test(fn), 'splitInner is rounding a percentage again');
});

// ===========================================================================
// US-54 — the score card
// ===========================================================================

const tile = {
  label: 'Total value',
  figure: '€ 115.940,77',
  caption: 'as of today',
  cls: 'up',
  period: { from: '2021-01-04', to: '2026-08-13' },
  broker: 'DEGIRO',
  asOf: '2026-08-13',
  reconciled: true,
  version: '0.47.0',
};

test('AC4 — only allowlisted fields reach the score card', () => {
  const m = scoreCardModel({ ...tile, accountId: 7654321, iban: 'NL91ABNA0417164300', displayName: 'A Person' }); // leak-check: ok
  assert.deepEqual(Object.keys(m).sort(), [...SCORECARD_FIELDS].sort());
  const json = JSON.stringify(m);
  assert.ok(!json.includes('7654321'), 'no identifier'); // leak-check: ok
  assert.ok(!json.includes('NL91'), 'no account number');
  assert.ok(!json.includes('A Person'), 'no name');

  // Same shape as the position card's, one level down: a poisoned provenance
  // cannot smuggle a key through the nested allowlist either.
  const p = scoreCardModel({ ...tile, broker: 'DEGIRO', provenance: { secret: 'x' } });
  assert.deepEqual(Object.keys(p.provenance).sort(), ['asOf', 'broker', 'reconciled', 'version']);
});

test('AC2 — the score card carries no series at all', () => {
  /**
   * The whole point of the story: *"they don't per se need a chart"*. If a
   * sparkline ever reappears in this model it is because someone reached for
   * the position card's drawer, and the two have different subjects.
   */
  const m = scoreCardModel(tile);
  assert.ok(!('spark' in m), 'a series reached the score card');
  assert.ok(!SCORECARD_FIELDS.includes('spark'));
  for (const v of Object.values(m)) assert.ok(!Array.isArray(v), 'a series reached the score card under another name');
});

test('AC3 — the card takes the page’s own strings and formats nothing', () => {
  /**
   * The safety argument, as a check. Every amount on the page goes through the
   * formatters, which is where US-46's mask lives — so a card drawn from a
   * tile's own strings cannot show more than the page does, and this module
   * needs no masking logic of its own. A masked figure arrives masked.
   */
  const masked = scoreCardModel({ ...tile, figure: '€ •••' });
  assert.equal(masked.figure, '€ •••');
  assert.ok(!/\d/.test(masked.figure), 'the mask was undone somewhere in here');

  // And a number handed in instead of a string is not silently formatted into
  // one that could disagree with the page.
  assert.equal(scoreCardModel({ ...tile, figure: 115940.77 }).figure, '115940.77');

  const src = read('../src/lib/snapshot.js');
  const fn = src.slice(src.indexOf('export function scoreCardModel'));
  assert.ok(!/Intl|toLocaleString|toFixed/.test(fn), 'the score card model has started formatting figures');
});

test('AC5 — the verdict is tri-state here too, and never a pass by default', () => {
  // It matters more on this card than on a position's: this can be the account's
  // headline number, so the verdict is the whole trust claim.
  assert.equal(scoreCardModel({ ...tile, reconciled: undefined }).provenance.reconciled, null);
  assert.equal(scoreCardModel({ ...tile, reconciled: 'yes' }).provenance.reconciled, null);
  assert.equal(scoreCardModel({ ...tile, reconciled: false }).provenance.reconciled, false);
  assert.match(provenanceLine(scoreCardModel({ ...tile, reconciled: false }).provenance), /DOES NOT reconcile/);
  assert.match(provenanceLine(scoreCardModel({ ...tile, reconciled: undefined }).provenance), /not checked/);
});

test('the tone is an enum, not whatever class the page happened to have', () => {
  assert.equal(scoreCardModel({ ...tile, cls: 'up' }).tone, 'up');
  assert.equal(scoreCardModel({ ...tile, cls: 'down' }).tone, 'down');
  assert.equal(scoreCardModel({ ...tile, cls: undefined }).tone, 'neutral');
  // A caller cannot choose what gets painted by handing over a string.
  assert.equal(scoreCardModel({ ...tile, cls: 'up flipped' }).tone, 'neutral');
});

test('AC6 — the share path reads the real tiles, never the cheerful ones', () => {
  /**
   * The one thing easy to get wrong, because the obvious implementation shares
   * what is rendered. `renderTiles` replaces the figures with joke versions when
   * Optimism Mode is on, so a card built from the rendered list would put "847
   * days of unwavering belief" next to a reconciliation verdict — a gag wearing
   * a trust badge.
   *
   * The quarantine is structural: `buildTiles` produces the real list and knows
   * nothing about the mode, `renderTiles` applies the joke one level down, and
   * the share path calls `buildTiles`. This asserts that wiring, which is the
   * thing a later refactor would break.
   */
  const src = read('../src/ui/app.js');
  const build = src.slice(src.indexOf('function buildTiles'), src.indexOf('function renderTiles'));
  assert.ok(!/frown\.|cheerful/.test(build), 'buildTiles can now see Optimism Mode');

  const score = src.slice(src.indexOf('function scoreModel'), src.indexOf('function shareTileChoices'));
  assert.ok(/buildTiles\(/.test(score), 'the share path no longer builds its own tiles');
  assert.ok(!/frown\.|cheerful|shown/.test(score), 'the share path can see the cheerful list');
  // And it asks for the figure at the sheet's mask setting, not the page's.
  assert.ok(/withAnonymize\(!state\.share\.amounts/.test(score), 'the card follows the page instead of the sheet');
});

test('the score card and the position card do not share a drawer by accident', () => {
  /**
   * Which layout is drawn comes from the caller's `kind`, never from sniffing
   * which keys the model has. A card that guesses its layout is one renamed
   * field away from drawing the wrong one, on the path that reaches a clipboard.
   */
  const ui = read('../src/ui/snapshot.js');
  assert.ok(/opts\?\.kind === 'score' \? drawScoreCard : drawSnapshot/.test(ui));
  const app = read('../src/ui/app.js');
  assert.ok(/kind: score \? 'score' : 'position'/.test(app), 'the export path no longer says which card it is');
});

// ===========================================================================
// US-57 — the sheet is the glass, never what is written on it
// ===========================================================================

test('AC5 — a motion story moved no value and added no field', () => {
  /**
   * The stop condition, as a check. US-57 is motion on the sheet US-47 built and
   * US-52/US-54 fill: if it changes what a card can carry it has become a
   * different story, and the two allowlists are exactly where that would show.
   *
   * Pinned as literal lists rather than as "unchanged", because a test that
   * compares a thing to itself passes whatever the thing becomes.
   */
  assert.deepEqual([...SNAPSHOT_FIELDS], [
    'name', 'symbol', 'period', 'pct', 'pctBasis', 'amount', 'split', 'spark', 'provenance', 'owner',
  ]);
  assert.deepEqual([...SCORECARD_FIELDS], [
    'label', 'figure', 'caption', 'tone', 'period', 'provenance', 'owner',
  ]);
  assert.deepEqual([...PROVENANCE_FIELDS], ['broker', 'asOf', 'reconciled', 'version']);

  // And the model still produces exactly its allowlist for a full set of inputs.
  const m = snapshotModel({ ...base, owner: { text: 'Sam', derived: true } });
  assert.deepEqual(Object.keys(m).sort(), [...SNAPSHOT_FIELDS].sort());
});

test('the sheet’s motion holds no opinion about the card’s contents', () => {
  /**
   * Structural version of the same rule: `materialize` animates the dialog and
   * reads one custom property. If it ever reaches for the model, the glass has
   * started editing what is written on it.
   */
  const app = read('../src/ui/app.js');
  const fn = app.slice(app.indexOf('function materialize(dlg, open)'), app.indexOf('function openModal(dlg)'));
  assert.ok(!/model|snapshotModel|scoreCardModel|figure|amount/.test(fn));
  // The close waits for the animation and swallows a cancellation, because a
  // cancelled close means somebody re-opened it. And it is `closeModal`, shared
  // by every dialog rather than written for the sheet: US-57 gave the arrival to
  // one of two identical-looking surfaces, which is the consistency rule broken
  // by the change meant to improve things.
  const close = app.slice(app.indexOf('function closeModal(dlg)'), app.indexOf('const closeShareSheet'));
  assert.match(close, /materialize\(dlg, false\)\s*\n\s*\.then\(\(\) => dlg\.close\(\)\)/);
  assert.match(close, /\.catch\(\(\) => \{\}\)/);
  // Comments stripped: the prose explains the guard that lives inside
  // `openModal`, and counting it would make this pass for the wrong reason.
  const code = app.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((code.match(/showModal\(\)/g) ?? []).length, 1, 'a dialog opens without going through openModal');
  assert.match(app, /openModal\(box\)/, 'the diagnostics dialog no longer materializes');
});
