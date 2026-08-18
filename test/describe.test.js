import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { describeBars, describeParts, describeSeries } from '../src/lib/describe.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const eur = (n) => `€ ${n.toFixed(2)}`;

// ===========================================================================
// US-71 — a chart a screen reader can read
// ===========================================================================

test('a series says where it started, where it ended, and which way that is', () => {
  /**
   * The direction in words as well as in the two figures: a reader hearing two
   * amounts should not have to subtract them to learn which way the line went.
   * And the extreme, because that is the one thing the shape of a line tells a
   * sighted reader instantly and a start-and-end pair does not.
   */
  const s = describeSeries({
    title: 'Portfolio value',
    days: ['2026-01-01', '2026-02-01', '2026-03-01'],
    values: [100, 180, 140],
    fmt: eur,
  });
  assert.match(s, /2026-01-01 to 2026-03-01/);
  assert.match(s, /from € 100\.00 to € 140\.00/);
  assert.match(s, /up over the period/);
  assert.match(s, /highest € 180\.00 on 2026-02-01/);

  // An extreme that is simply one of the ends says nothing and is left out.
  const rising = describeSeries({ title: 'x', days: ['a', 'b'], values: [1, 2], fmt: eur });
  assert.ok(!/highest|lowest/.test(rising));

  assert.match(describeSeries({ title: 'x', days: [], values: [], fmt: eur }), /no data/);
  assert.match(describeSeries({ title: 'x', days: ['a', 'b'], values: [5, 5], fmt: eur }), /unchanged/);
});

test('an estimated stretch is said out loud, not only drawn', () => {
  /**
   * US-62's honesty in the other channel. A history reconstructed largely from
   * stale prices is a different object from one built from quotes, and a reader
   * who cannot see the chart has even less chance of finding that out elsewhere.
   */
  const s = describeSeries({
    title: 'x',
    days: ['a', 'b', 'c'],
    values: [1, 2, 3],
    fmt: eur,
    estimated: [false, true, true],
  });
  assert.match(s, /2 of 3 days estimated from the last traded price/);
});

test('bars say how many, how many were good, and the two extremes', () => {
  const s = describeBars({ title: 'Result per month', labels: ['jan', 'feb', 'mar'], values: [10, -5, 30], fmt: eur });
  assert.match(s, /3 periods/);
  assert.match(s, /2 positive, 1 not/);
  assert.match(s, /best mar at € 30\.00/);
  assert.match(s, /worst feb at € -5\.00/);
  // Singular reads as singular; a summary that says "1 periods" is a summary
  // nobody proofread.
  assert.match(describeBars({ title: 'x', labels: ['jan'], values: [1], fmt: eur }), /1 period\./);
});

test('a part-of-whole is shares first, because that is what it is about', () => {
  /**
   * A proportion is what this shape means, and it survives anonymize untouched
   * for the same reason US-52's split bar does — there is no amount in it.
   */
  const s = describeParts({
    title: 'Composition',
    parts: [{ name: 'ASML', value: 60 }, { name: 'Cash', value: 40 }],
    fmt: eur,
  });
  assert.match(s, /2 parts totalling € 100\.00/);
  assert.match(s, /ASML 60\.0%, Cash 40\.0%/);

  // The tail is named rather than dropped: a summary that quietly stops at five
  // reads as a complete list of five.
  const many = describeParts({
    title: 'x',
    parts: Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, value: 9 - i })),
    fmt: eur,
  });
  assert.match(many, /and 4 smaller parts/);
});

test('US-46 governs a summary, and it does so without this module knowing what a mask is', () => {
  /**
   * The caller hands in `fmt`, which *is* the page's formatter with the mask
   * already inside it. A second masking rule here would be a second thing to get
   * wrong, and the 0.10.0 export leak is what that costs. Browser-checked with
   * anonymize on: `from € ••• to € •••`, dates and percentages intact.
   */
  const masked = () => '€ •••';
  const s = describeSeries({ title: 'x', days: ['2026-01-01', '2026-02-01'], values: [1, 2], fmt: masked });
  assert.ok(!/\d+\.\d\d/.test(s), 'an amount survived the mask');
  assert.match(s, /2026-01-01/, 'the date is not an amount and stays');

  const src = read('../src/lib/describe.js');
  assert.ok(!/Intl|toLocaleString|€/.test(src), 'the module has started formatting money itself');
});

test('AC5 — every canvas is built by something that labels it', () => {
  /**
   * The point of testing this rather than the labels themselves: a fourteenth
   * chart must not be able to ship silently unlabelled, which is exactly how
   * thirteen of them did.
   */
  const charts = read('../src/ui/charts.js');
  const builders = [...charts.matchAll(/^export function (\w+)\(/gm)].map((m) => m[1]);
  assert.ok(builders.length >= 14, 'the scan has stopped finding the builders');
  for (let i = 0; i < builders.length; i++) {
    const from = charts.indexOf(`export function ${builders[i]}(`);
    const to = i + 1 < builders.length ? charts.indexOf(`export function ${builders[i + 1]}(`) : charts.length;
    assert.match(charts.slice(from, to), /a11yLabel/, `${builders[i]} draws a chart nobody can read`);
  }

  // And every canvas on the page is drawn by one of them, so none is orphaned.
  const html = read('../src/ui/app.html');
  const app = read('../src/ui/app.js');
  const ids = [...html.matchAll(/<canvas id="([\w-]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 13, 'the canvas count changed; check the new one has a builder');
  for (const id of ids) assert.ok(app.includes(`#${id}`), `#${id} is drawn by nothing`);
});

test('the label is a description, never an announcement', () => {
  // `aria-live` here would make every chart shout on every range change. It is a
  // static picture with a caption, and `role="img"` is what says so.
  const charts = read('../src/ui/charts.js');
  const plugin = charts.slice(charts.indexOf('const a11yLabel = {'), charts.indexOf('Chart.register('));
  assert.match(plugin, /setAttribute\('role', 'img'\)/);
  assert.ok(!/aria-live/.test(plugin));
  // A builder that forgets its text still gets a role and a generic label rather
  // than being silently unlabelled.
  assert.match(plugin, /opts\?\.text \|\| 'Chart'/);
});

test('AC2 — the figure-carrying charts have a table twin, from one helper', () => {
  /**
   * dataviz's rule, and the one the Positions card has followed since 0.46.0:
   * every chart has a table view, and a tooltip is never the only way to read a
   * value. A tooltip needs a pointer and a hover; a screen reader has neither,
   * and neither does anybody reading a screenshot.
   *
   * One helper rather than a twin per chart, and the toggle is built in JS
   * rather than in the markup, so a chart that gains a twin needs no HTML — the
   * same reasoning `columns.js` applies to the Positions columns.
   */
  const app = read('../src/ui/app.js');
  assert.match(app, /function chartTwin\(canvasId, \{ columns, rows \}\)/);
  for (const id of ['c-cum', 'c-pnl', 'c-deposits', 'c-dividends']) {
    assert.match(app, new RegExp(`chartTwin\\('${id}'`), `${id} has no table twin`);
  }
  // Figures go through the page's formatters, so US-46 masks them here too and
  // the helper needs no rule of its own. Browser-checked with anonymize on:
  // `€ -•••` in the cells, the dates intact.
  const fn = app.slice(app.indexOf('function chartTwin('), app.indexOf('function paintTwinToggle'));
  assert.ok(!/Intl|toLocaleString/.test(fn), 'the twin formats money itself');

  // AC4: the cumulative twin says which periods were priced from a stale quote.
  assert.match(app, /cumEstimated\[i\] \? tr\('estimated'\) : tr\('measured'\)/);
});

test('the twin toggle says what pressing it does, not what is on screen', () => {
  /**
   * It got this backwards once: the label was derived from a local flag rather
   * than read back off the element after the flip, so the button offered *show
   * as a table* while the table was already up. One source of truth, read after.
   */
  const app = read('../src/ui/app.js');
  const click = app.slice(app.indexOf("toggle.addEventListener('click'"), app.indexOf('twin.after(toggle)'));
  assert.match(click, /box\.hidden = !box\.hidden;/);
  assert.match(click, /paintTwinToggle\(toggle, !box\.hidden\)/);
  assert.ok(!/const showTable/.test(click), 'the label is derived from a local flag again');
});
