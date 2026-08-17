/**
 * Phase 6's gate: while amounts are hidden, no amount is on the page.
 *
 * `test/anon-brand-snapshot.test.js` already checks the *strings* — `anon.js` is
 * pure and its output carries no digit. That is not the same claim. What reaches
 * the DOM is whatever `src/ui/theme.js` returns, and the mask lives one layer
 * further in: inside the formatters, so a money field added next year is masked
 * because it had to call `fmtEurCents` to be money at all. This file tests that
 * layer, with the real module and the real toggle.
 *
 * The three parts of the gate, in order:
 *
 *  1. every money formatter goes digit-free while the toggle is on, and comes
 *     back when it is off — a mask you cannot turn off is a broken page;
 *  2. percentages survive, because they are the point of the feature: someone
 *     can say +340 % without saying on what;
 *  3. the money y-axis stops drawing labels, rather than drawing `€ •••` five
 *     times down the side of every chart.
 *
 * `theme.js` is a browser module. It needs `document` for one line
 * (`applyAnonymize` writes the state onto `<html>` so the stylesheet can react),
 * and that is the whole of the stub below — the formatters themselves are
 * `Intl.NumberFormat`, which node has.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.document ??= { documentElement: { dataset: {} } };

const { fmtEur, fmtEurCents, fmtPct, fmtPrice, fmtQty, fmtSigned, getAnonymize, setAnonymize } =
  await import('../src/ui/theme.js');

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Run `fn` with the toggle in a known state, and put it back either way. */
const withMask = (on, fn) => {
  const before = getAnonymize();
  setAnonymize(on);
  try {
    return fn();
  } finally {
    setAnonymize(before);
  }
};

test('no amount survives the formatters while amounts are hidden', () => {
  // The list is every money formatter `theme.js` exports. If one is added and
  // not masked, it is not in this list either — which is why the last assertion
  // reads the module instead of trusting the list.
  const amounts = () => [
    fmtEur(123456.78), fmtEur(0), fmtEur(-9),
    fmtEurCents(123456.78), fmtEurCents(0),
    fmtSigned(1234.56), fmtSigned(-1234.56), fmtSigned(0),
    fmtPrice(3.105, 'USD'), fmtPrice(3.105, null), fmtPrice(3.105, 'EUR'),
    fmtQty(137), fmtQty(0.5),
  ];

  withMask(true, () => {
    for (const s of amounts()) {
      assert.equal(/\d/.test(s), false, `"${s}" still carries a figure while masked`);
    }
  });

  // And it is a toggle, not a one-way door.
  withMask(false, () => {
    assert.ok(fmtEur(123456.78).includes('123'));
    assert.ok(fmtQty(137).includes('137'));
    assert.ok(fmtPrice(3.105, 'USD').includes('3'));
  });

  /**
   * The reason the list above cannot be the whole test: it is a list. Every
   * exported formatter whose name says money has to consult `anonymized`, and
   * this is what notices the one somebody adds without doing so.
   */
  const src = strip(read('../src/ui/theme.js'));
  // Each declaration runs to the next top-level `export` or to the end of the
  // file; a one-liner and a braced body both fall out of that without the scan
  // having to parse either.
  const found = [];
  for (const [, name, body] of src.matchAll(/^export (?:const|function) (fmt\w+)([\s\S]*?)(?=^export |\Z)/gm)) {
    found.push(name);
    if (name === 'fmtPct') continue; // deliberately unmasked; asserted below
    assert.match(body, /anonymized/, `${name} does not consult the toggle`);
  }
  // A scan that matches nothing passes every assertion inside it. This is the
  // line that fails if a refactor changes the shape it looks for.
  assert.deepEqual(found.sort(), ['fmtEur', 'fmtEurCents', 'fmtPct', 'fmtPrice', 'fmtQty', 'fmtSigned']);
});

test('a percentage is not an amount, and keeps its digits', () => {
  withMask(true, () => {
    assert.equal(fmtPct(340), '+340.00%');
    assert.equal(fmtPct(-2.5), '-2.50%');
  });
});

test('a share count is masked, against the brief, on purpose', () => {
  /**
   * `MIGRATION.md`'s phase 6 row says "percentages, shares and counts survive".
   * They do not, and this test is where that disagreement is written down rather
   * than discovered.
   *
   * 137 shares of something whose price anyone can look up *is* the value of the
   * position — a mask over the euros with the count left beside it is a feature
   * that looks like it works and does not. The brief is right about percentages,
   * which cannot be reversed into a balance, and right about counts that are not
   * quantities (the number of transactions, the number of positions, a month
   * count) — none of those go through `fmtQty`. Changing this is a decision for
   * the owner; until then the stricter behaviour stands and it is the older one.
   */
  withMask(true, () => assert.equal(/\d/.test(fmtQty(137)), false));
});

test('the money axis stops drawing labels rather than repeating the mask', () => {
  /**
   * Checked at the source because `baseOptions` is not exported and Chart.js
   * needs a canvas to resolve a scale. The claim is narrow and the two halves
   * belong together: the default y-axis is money and drops, and the one chart
   * with a percentage y-axis puts it back.
   */
  const src = strip(read('../src/ui/charts.js'));
  const y = /y: \{[\s\S]*?\n {6}\},/.exec(src)[0];
  assert.match(y, /display: !getAnonymize\(\)/, 'the money y-axis still labels itself while masked');
  assert.match(
    src,
    /ticks\.display = money \? !getAnonymize\(\) : true/,
    'the percentage axis loses its labels too',
  );
});

test('nothing builds a euro string by hand', () => {
  /**
   * The choke point, from the other side. `anon-brand-snapshot.test.js` catches
   * an inline `Intl.NumberFormat`; this catches the cheaper hole — a template
   * literal that puts a symbol in front of a number and never touches a
   * formatter. Both are the same failure: an amount that stays on screen after
   * the eye is closed.
   */
  for (const f of ['app.js', 'charts.js', 'popup.js', 'snapshot.js', 'frown.js']) {
    let code;
    try {
      code = strip(read(`../src/ui/${f}`));
    } catch {
      continue;
    }
    assert.ok(!/[€$]\s*\$\{/.test(code), `${f} builds an amount with a currency symbol by hand`);
  }
});
