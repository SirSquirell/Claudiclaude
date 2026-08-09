#!/usr/bin/env node
/**
 * Audit an exported account by measurement.
 *
 * Reads one or more `degiro-portfolio-*.json` exports, runs the real engine over
 * them, and checks the invariants that have to hold whatever the code does. This
 * exists because reading the engine and reasoning about it has already produced
 * one confident wrong diagnosis: `clusterFactors` carried a comment claiming it
 * stopped a closed position leaving a residue, and it did not. DEGIRO's own
 * position sizes and account total are evidence; a code review is an opinion.
 *
 *   node tools/audit-export.mjs ~/Downloads/degiro-portfolio-2026-08-08.json [more.json ...]
 *
 * Exits non-zero if any invariant fails. Nothing is printed that identifies the
 * account beyond instrument names already visible in the UI.
 */
import { readFileSync } from 'node:fs';
import { computePortfolio } from '../src/lib/engine.js';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: node tools/audit-export.mjs <export.json> [...]');
  process.exit(2);
}

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

for (const path of paths) {
  const d = JSON.parse(readFileSync(path, 'utf8'));
  const meta = Object.fromEntries(d.meta.map((m) => [m.key, m.value]));
  const products = Object.fromEntries(d.products.map((p) => [p.id, p]));
  const prices = Object.fromEntries(d.prices.map((p) => [p.vwdId, p]));
  const live = new Map((meta.liveSnapshot?.positions ?? []).map((p) => [String(p.productId), p]));

  const r = computePortfolio({
    transactions: d.transactions,
    cashRows: d.cashflows,
    products,
    prices,
    today: meta.lastDataDate,
    liveTotal: meta.liveTotal ?? null,
  });

  console.log(`\n=== ${path.split('/').pop()} — ${d.transactions.length} transactions, ${d.products.length} products ===`);

  const rawNet = new Map();
  for (const t of d.transactions) rawNet.set(String(t.productId), (rawNet.get(String(t.productId)) ?? 0) + t.quantity);
  const bookedOf = (p) => rawNet.get(String(p.productId)) ?? 0;

  // A round trip that nets to zero cannot leave anything behind. Dividing each
  // trade by a factor measured from its own fill used to leave 17.36 shares of
  // a bankrupt company on one account and -4.09 of another on a second.
  const notClosed = r.byProduct.filter((p) => Math.abs(bookedOf(p)) < 1e-9 && Math.abs(p.qty.at(-1)) > 1e-9);
  check(notClosed.length === 0, 'a closed round trip holds nothing',
    notClosed.map((p) => `${p.name} ${p.qty.at(-1)}`).join(', '));

  // The holdings table shows this number, so it has to be a share count.
  const drifted = r.byProduct.filter((p) => Math.abs(p.qty.at(-1) - bookedOf(p)) > 1e-6);
  check(drifted.length === 0, 'engine quantity equals the booked quantity',
    drifted.map((p) => `${p.name}: ${p.qty.at(-1)} vs ${bookedOf(p)}`).join(', '));

  // If today's position is wrong the history is wrong too (SPEC §6), and
  // /update already states the answer.
  if (live.size) {
    const mismatched = r.byProduct
      .filter((p) => Math.abs(p.qty.at(-1)) > 1e-9)
      .filter((p) => {
        const dg = live.get(String(p.productId));
        return !dg || Math.abs(dg.size - p.qty.at(-1)) > 1e-6;
      });
    check(mismatched.length === 0, "open positions match DEGIRO's own sizes",
      mismatched.map((p) => `${p.name}: ours ${p.qty.at(-1)}, DEGIRO ${live.get(String(p.productId))?.size ?? 'absent'}`).join(' | '));
  }

  // SPEC §1.4 as an identity. Day zero's own flow is already inside value[0],
  // so it runs from day one. Every series is emitted rounded to cents, so it
  // holds only to within accumulated half-cent rounding over the history.
  const sum = (a, from) => a.slice(from).reduce((x, y) => x + y, 0);
  const drift = r.value.at(-1) - r.value[0] - (sum(r.pnl, 1) + sum(r.netExternal, 1));
  const tol = Math.max(0.02, 0.01 * Math.sqrt(r.days.length));
  check(Math.abs(drift) < tol, 'P/L plus external flow equals the change in value',
    `off by ${drift.toFixed(4)}, tolerance ${tol.toFixed(2)} over ${r.days.length} days`);

  const ghostValue = r.byProduct.filter((p) => Math.abs(p.qty.at(-1)) < 1e-9 && Math.abs(p.values.at(-1)) > 0.005);
  check(ghostValue.length === 0, 'nothing is worth anything unless it is held',
    ghostValue.map((p) => `${p.name} ${p.values.at(-1)}`).join(', '));

  const rec = r.reconciliation;
  if (rec) {
    console.log(`   ${rec.ok ? 'PASS' : 'INFO'}  reconciliation — ours ${rec.reconstructed}, DEGIRO ${rec.live}, off by ${(rec.reconstructed - rec.live).toFixed(2)}`);
  } else {
    console.log('   INFO  reconciliation — no live total in this export, skipped');
  }
  console.log(`   INFO  peak value ${Math.max(...r.value).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`);
  for (const w of r.warnings.filter((w) => w.level === 'error')) console.log(`   INFO  error banner: ${w.code}`);
}

console.log(`\n${failures === 0 ? 'all invariants hold' : `${failures} invariant(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
