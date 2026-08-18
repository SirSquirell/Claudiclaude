import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `charts.js` cannot be imported here: it registers Chart.js plugins at module
 * scope and `Chart` is a global the vendored UMD bundle puts there. So these are
 * source assertions — the same shape the leak and parity checks use, and the
 * only kind available for this module without a DOM.
 *
 * What a browser confirmed, and what these pin so it stays confirmed: the
 * readout under the pointer reports a day the series actually holds, says when
 * that day's price was estimated, and masks its amount like every other euro.
 */
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const charts = read('../src/ui/charts.js');
const app = read('../src/ui/app.js');

// ===========================================================================
// US-62 — the readout under the pointer
// ===========================================================================

test('AC2 — the readout can only report a day the series holds', () => {
  /**
   * The story's first trap: *"a crosshair that invents an intermediate figure is
   * the fabricated-number failure in a new place."* It is answered by the
   * interaction layer rather than by code — `index` mode with `intersect: false`
   * resolves the pointer to the nearest **data index**, so the figure handed to
   * the callback is a member of the array. Change that mode to an interpolating
   * one and this fails.
   */
  assert.match(charts, /interaction:\s*\{\s*mode:\s*'index',\s*intersect:\s*false\s*\}/);

  // And the callbacks read the parsed point rather than computing anything from
  // the pointer's x. A tooltip that did arithmetic on a pixel position is how an
  // in-between value would get in.
  const value = charts.slice(charts.indexOf('export function valueChart'), charts.indexOf('export function pnlChart'));
  const label = value.match(/label:\s*\(item\)\s*=>\s*tr\('Value: \{v\}',\s*\{\s*v:\s*([^}]+)\}\)/);
  assert.ok(label, 'the value readout no longer reports the point it was given');
  assert.match(label[1], /item\.parsed\.y/);
});

test('AC3 — the readout’s amount goes through the masking formatters', () => {
  // US-46's choke point. The readout is an amount like any other, so it masks
  // for the same reason and by the same route — not by a rule of its own.
  const value = charts.slice(charts.indexOf('export function valueChart'), charts.indexOf('export function pnlChart'));
  assert.match(value, /tr\('Value: \{v\}', \{ v: fmtEurCents\(/);
  assert.match(value, /tr\('Day change: \{v\}', \{ v: fmtSigned\(/);
});

test('AC4 — a day valued from a stale price says so, on both charts', () => {
  /**
   * The holdings row has said `est.` about exactly this since 0.46.0. The chart
   * — which is where the number is actually read — said nothing, so a history
   * reconstructed largely from stale prices looked identical to one built from
   * quotes.
   */
  assert.match(charts, /export const estimatedNote =/);
  for (const [fn, next] of [['valueChart', 'pnlChart'], ['cumulativeChart', 'compositionChart']]) {
    const body = charts.slice(charts.indexOf(`export function ${fn}`), charts.indexOf(`export function ${next}`));
    assert.match(body, /\{[^}]*\bestimated\b/, `${fn} does not take the flags`);
    assert.match(body, /estimatedNote\(estimated,/, `${fn} does not render the marker`);
  }
});

test('AC4 — a bucket is estimated when any day in it was, not just its last', () => {
  /**
   * At Week or Month one drawn point stands for several days. Reading the
   * bucket's final flag would let a month of stale prices pass as measured
   * because its last day happened to quote — which is the opposite of what the
   * marker is for. Both call sites aggregate over the bucket.
   */
  const calls = [...app.matchAll(/sumInBuckets\(r\.estimated[^)]*\)\.map\(\(n\) => n > 0\)/g)];
  assert.equal(calls.length, 2, 'the value chart and the cumulative chart should each get bucket-aggregated flags');
});

test('AC6 — the engine gained nothing for this', () => {
  /**
   * US-62's stop condition. `estimated` is already on the result (it has been
   * since the coverage tile), and the bucketing is the UI's own — `bucketEnds`
   * and `aggregatePnl` key the same range the same way, which is what lets the
   * flags be carried across without the engine growing an output for a rendering
   * concern.
   */
  const engine = read('../src/lib/engine.js');
  assert.match(engine, /estimated: Array\.from\(estimatedDay\)/, 'the flags are still on the result');
  const agg = engine.slice(engine.indexOf('export function aggregatePnl'), engine.indexOf('export function aggregatePnl') + 1400);
  assert.ok(!/estimated/.test(agg), 'aggregatePnl has grown an output for a rendering concern');
});
