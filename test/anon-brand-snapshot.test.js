import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MASK, hasDigits, maskEur, maskQty, maskSigned } from '../src/lib/anon.js';
import { DOTS, DOT_R, LINE, MIN_LOCKUP_HEIGHT, STAR, STROKE_W, VIEWBOX, markWidth } from '../src/ui/brand.js';
import {
  PROVENANCE_FIELDS, SNAPSHOT_FIELDS, holdingWindow, provenanceLine, returnOnMoneyIn, snapshotModel, sparkline,
} from '../src/lib/snapshot.js';

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

const base = {
  name: 'Some Instrument', symbol: 'SMI', from: '2026-01-01', to: '2026-08-12',
  result: 1234.56, paidIn: 1000, series: [0, 500, 1234.56], version: '0.44.0',
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
  assert.equal(snapshotModel({ ...base, paidIn: 0 }).pct, null);
});

test('a holding bought partway through the account starts at its own first purchase', () => {
  // Rocket Lab, bought long after the account's first transaction: qty is zero
  // for the account's early days and only turns on where the buy happened.
  const qty = [0, 0, 0, 0, 5, 5, 5, 5];
  assert.deepEqual(holdingWindow(qty, 0, 7), { from: 4, to: 7 });
});

test('a holding bought before the selected range keeps the range, not its own inception', () => {
  // Only ever narrows the window: a range the user picked is never widened
  // backward past what they asked for.
  const qty = [5, 5, 5, 5, 5, 5, 5, 5];
  assert.deepEqual(holdingWindow(qty, 3, 7), { from: 3, to: 7 });
});

test('a holding whose first purchase falls outside the selected range clamps to it', () => {
  const qty = [0, 0, 0, 0, 0, 0, 5, 5];
  assert.deepEqual(holdingWindow(qty, 0, 3), { from: 3, to: 3 });
});

test('a holding held for the account’s whole history is unaffected', () => {
  assert.deepEqual(holdingWindow([1, 1, 1], 0, 2), { from: 0, to: 2 });
  assert.deepEqual(holdingWindow(null, 0, 2), { from: 0, to: 2 });
});

test('the sparkline keeps both ends and never more than the cap', () => {
  const s = sparkline(Array.from({ length: 900 }, (_, i) => i), 48);
  assert.equal(s.length, 48);
  assert.equal(s[0], 0);
  assert.equal(s.at(-1), 899);
  assert.deepEqual(sparkline([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(sparkline([1, NaN, 3]), [1, 3], 'a gap is dropped, not drawn as zero');
  assert.deepEqual(sparkline(null), []);
});
