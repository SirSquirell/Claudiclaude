/**
 * The parity guard for the redesign.
 *
 * `docs/redesign/MIGRATION.md` §5 asks for exactly this, and its own sentence about
 * it is right: *"that single test is worth more than the rest of this
 * document"*. A prose checklist rots the moment somebody renames an id; this
 * fails in CI instead of surfacing in a bug report two months later.
 *
 * What it defends against is **silent loss** — a redesign that ships a prettier
 * Overzicht and quietly drops the currency chart, the connection check and
 * Optimism Mode. So the rule has no third state: every frozen id either still
 * exists in `app.html`, or `docs/RETIRED.md` says where it went and why. An
 * element in neither is a bug, not a decision.
 *
 * `LEGACY_IDS` is frozen **before the first change**, which is the only moment
 * the inventory is trustworthy: taken later it would already be missing whatever
 * the redesign had dropped by then. Extracted from `src/ui/app.html` on
 * 2026-08-17 (83 ids in the file; the 50 below are the ones §3 lists as carrying
 * behaviour — a chart, a table, a control or a button — rather than layout
 * wrappers a redesign is free to reshape).
 *
 * **Do not add to this list.** It is a baseline, not a registry: new elements the
 * redesign introduces are not legacy and do not need protecting from it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** The 13 canvases. */
const CHARTS = [
  'c-value', 'c-invested', 'c-pnl', 'c-cum', 'c-movers', 'c-compare', 'c-comp',
  'c-holdings-pie', 'c-currency', 'c-cash', 'c-deposits', 'c-dividends', 'c-outlook',
];

/** The 7 tables. */
const TABLES = [
  'years', 'months', 'compare-summary', 'holdings', 'products', 'transactions', 'diag-table',
];

/** The 14 control groups and 5 inputs. */
const CONTROLS = [
  'range-group', 'gran-group', 'theme-group', 'lang-group', 'cum-view', 'ann-view',
  'metric-group', 'holdings-view', 'products-sort', 'products-filter', 'tx-scope',
  'outlook-horizon', 'outlook-rates', 'outlook-manual', 'outlook-monthly', 'outlook-growth',
  'outlook-yield', 'outlook-reinvest', 'toggle-cash',
];

/** The buttons and the two modes. */
const BUTTONS = [
  'btn-sync', 'btn-wipe', 'btn-export', 'btn-bugreport', 'btn-diagnose', 'btn-anon',
  'btn-copy-diag', 'btn-hide-diag', 'btn-clear-months', 'zoom-state', 'frown-toggle',
];

export const LEGACY_IDS = Object.freeze([...CHARTS, ...TABLES, ...CONTROLS, ...BUTTONS]);

/**
 * Parse the ledger.
 *
 * Deliberately strict about the shape: a line without an arrow, or a `RETIRED:`
 * with nothing after it, is not a decision — it is a note somebody wrote while
 * deleting something, and it would let the whole guard pass while the ledger says
 * nothing.
 */
function parseRetired(md) {
  const out = new Map();
  const bad = [];
  // Fenced blocks are skipped, because the file documents its own format with
  // real-looking lines. The first version of this did not, read the example as an
  // entry, and reported `frown-toggle` as retired-yet-present — which is the
  // contradiction check working on its author.
  let fenced = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^-\s*`([^`]+)`\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, id, rest] = m;
    const arrow = /^(?:→|->)\s*(.+)$/.exec(rest);
    if (!arrow) {
      bad.push(`${id}: no arrow, so it does not say where it went`);
      continue;
    }
    const decision = arrow[1].trim();
    const retired = /^RETIRED:\s*(.*)$/.exec(decision);
    if (retired && retired[1].trim().length < 10) {
      bad.push(`${id}: retired without a reason`);
      continue;
    }
    out.set(id, decision);
  }
  return { entries: out, bad };
}

test('the frozen inventory is a well-formed baseline', () => {
  /**
   * Guards the guard, but only for what stays true.
   *
   * This originally also asserted that every frozen id was still in `app.html`,
   * which was right on the day the list was frozen — a typo in it would have made
   * every later assertion theatre — and wrong from the first relocation onward:
   * US-49 merged `products` into the positions table, which is a decision in the
   * ledger, not a missing element. "Exists, or is accounted for" is the next
   * test's job, and having it twice meant a legitimate merge failed the suite.
   */
  assert.equal(new Set(LEGACY_IDS).size, LEGACY_IDS.length, 'the same id is frozen twice');
  assert.equal(LEGACY_IDS.length, 50);
});

test('the ledger says where things went, in a shape that can be read', () => {
  const { bad } = parseRetired(read('../docs/RETIRED.md'));
  assert.deepEqual(bad, [], 'entries in docs/RETIRED.md that do not carry a decision');
});

test('nothing disappears without a decision', () => {
  /**
   * The whole point of the file. Note what it does *not* check: whether the new
   * home is any good. A wrong home is a review problem; a missing element is
   * invisible, and invisible is what this catches.
   */
  const html = read('../src/ui/app.html');
  const { entries } = parseRetired(read('../docs/RETIRED.md'));

  const lost = LEGACY_IDS.filter((id) => !html.includes(`id="${id}"`) && !entries.has(id));
  assert.deepEqual(
    lost, [],
    'disappeared without a decision — give each a new home in app.html, or a line in docs/RETIRED.md',
  );
});

test('the ledger and the app do not contradict each other', () => {
  // An id that is both still present and declared retired means somebody wrote
  // the line and then changed their mind, or moved it back. Either way the
  // ledger is now lying, and a lying ledger is worse than none.
  const html = read('../src/ui/app.html');
  const { entries } = parseRetired(read('../docs/RETIRED.md'));

  const both = [...entries.keys()].filter(
    (id) => html.includes(`id="${id}"`) && /^RETIRED:/.test(entries.get(id)),
  );
  assert.deepEqual(both, [], 'declared retired in docs/RETIRED.md but still in app.html');
});

test('US-95 — every modal carries the ✕, and the action rows hold only verbs', () => {
  /**
   * Variant A, the owner's pick: the exit lives top-right and the buttons
   * below are verbs. Pinned at the source like the ledger above, because the
   * failure mode is the same silent kind — a future dialog edit that drops
   * the ✕ or sneaks the Close button back leaves three exits again on one
   * modal and one on the other, and nothing else would notice.
   */
  const html = read('../src/ui/app.html');
  const app = read('../src/ui/app.js');

  for (const [dialog, x] of [['share-sheet', 'btn-share-x'], ['diagnostics', 'btn-diag-x']]) {
    const from = html.indexOf(`id="${dialog}"`);
    const body = html.slice(from, html.indexOf('</dialog>', from));
    assert.match(body, new RegExp(`class="sheet-close" id="${x}"`), `${dialog} carries its ✕`);
    // Last in the DOM: nothing but the button's own markup after it, so Tab
    // walks the content first and opening never focuses "leave".
    const afterX = body.slice(body.indexOf(x));
    assert.ok(!/<(button|input|select|a )/.test(afterX.slice(afterX.indexOf('>') + 1)), `${x} is the last control in ${dialog}`);
    // Translated accessible name and the shortcut hint, through the static pass.
    assert.match(body.slice(body.indexOf(x) - 200, body.indexOf(x) + 200), /data-i18n-aria/);
  }
  assert.ok(!html.includes('btn-share-close'), 'the Close verb left the sheet’s action row');
  assert.ok(!html.includes('btn-hide-diag'), 'Hide left the diagnostics row (see docs/RETIRED.md)');

  // Both ✕ go through the existing close paths — no new way out.
  assert.match(app, /\$\('#btn-share-x'\)\.addEventListener\('click', closeShareSheet\)/);
  assert.match(app, /\$\('#btn-diag-x'\)\.addEventListener\('click', \(\) => closeModal\(\$\('#diagnostics'\)\)\)/);
});
