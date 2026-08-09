#!/usr/bin/env node
/**
 * Inventory the fields S14 stopped throwing away.
 *
 *   node tools/inspect-fields.mjs ~/Downloads/degiro-portfolio-2026-08-10.json
 *
 * 0.12.0 kept `totalPortfolio.totals` whole and carried every unnamed product
 * field in `extra`, on the argument that margin data had been arriving on every
 * sync since the first release and nobody had ever seen it. This is the looking.
 * It answers, from one export and without writing anything: does DEGIRO send
 * margin, does it send `contractSize`, does it send a strike, an expiry and
 * whether a contract is a call or a put.
 *
 * It prints **names, coverage and shapes — not amounts.** That is not politeness.
 * The output of this tool is the finding, and a finding gets pasted into a
 * document, so it is built the way CLAUDE.md rule 7 says anything leaving the
 * machine is built: a value is rendered only when its shape says it is a
 * structural constant (a contract size is a small integer count; there are four
 * of them in an account) and summarised otherwise. A number nobody classified
 * does not print by default.
 *
 * Nothing here decides anything. It reports what arrived, which is what US-07,
 * the second half of US-03 and blocker B1 have all been waiting on.
 */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

// ---------------------------------------------------------------------------
// what we are looking for
// ---------------------------------------------------------------------------

/**
 * Candidate field names from docs/NEXT.md §1. These are things to *check for*,
 * never findings — every one of them has to be seen in a real response before
 * anything is built on it. They are listed only so the first look is quick, and
 * so that "absent" is recorded as loudly as "found": a candidate that never
 * arrives is the answer to a blocker just as much as one that does.
 */
const CANDIDATES = {
  totals: [
    'reportMargin', 'reportOverallMargin', 'freeSpaceNew', 'reportDeficit',
    'marginCallStatus', 'marginCallDate', 'reportTotalLongVal',
  ],
  extra: [
    'contractSize', 'strike', 'expirationDate', 'optionRights',
    'underlyingProductId',
  ],
};

/**
 * The two values `parseUpdate` already picks out of `totals`. Marked in the
 * report so a reader does not mistake a field the code has always used for
 * something new that arrived.
 */
const ALREADY_READ = new Set([
  'reportNetliq', 'totalvalue', 'total', 'netliq',
  'totalCash', 'reportCashBal', 'cash',
]);

// ---------------------------------------------------------------------------
// rendering a value without emitting an amount
// ---------------------------------------------------------------------------

/**
 * A status word, not a value: `NO_MARGIN_CALL`, `C`, `P`, `PRODUCT`.
 *
 * No digits and no spaces, which is narrower than it first needs to be and
 * deliberately so. A looser version of this pattern let `A Person Name` and an
 * IBAN through on the first run of the test below — a name has spaces, an
 * identifier has digits, and an enum from an API has neither. If a real status
 * value turns out to carry a digit it arrives as `string, 1 distinct, 13 chars`,
 * which is a prompt to widen this on purpose rather than a silent leak.
 */
const SAFE_WORD = /^[A-Za-z][A-Za-z_-]{0,15}$/;
const DATEISH = /^\d{4}-\d{2}-\d{2}/;

/**
 * A contract size is a count of shares per contract: a small whole number, and
 * an account holds a handful of distinct ones. An amount is not that. So a
 * numeric field is printed in full only when every value in it is a small
 * integer and there are few of them — which is the shape of the question this
 * spike exists to answer, and is not the shape of anybody's money.
 */
const LISTABLE_INTEGERS = 20;
const LISTABLE_MAGNITUDE = 10_000;

/** @returns {string} a description of these values that carries no amount. */
export function shape(values) {
  const present = values.filter((v) => v !== undefined);
  const n = present.length;
  if (!n) return 'never present';

  const types = new Set(present.map((v) => (v === null ? 'null' : typeof v)));
  if (types.size > 1) return `mixed types (${[...types].sort().join(', ')}), ${n} values`;
  const type = [...types][0];

  if (type === 'boolean') {
    const t = present.filter(Boolean).length;
    return `boolean, ${t} true / ${n - t} false`;
  }

  if (type === 'number') {
    const distinct = [...new Set(present)].sort((a, b) => a - b);
    const finite = present.every(Number.isFinite);
    const integral = present.every(Number.isInteger);
    const nonZero = present.filter((v) => v !== 0).length;
    const listable = finite && integral
      && distinct.length <= LISTABLE_INTEGERS
      && Math.max(...distinct.map(Math.abs)) <= LISTABLE_MAGNITUDE;
    if (listable) return `integer, ${distinct.length} distinct: ${distinct.join(', ')}`;
    // Deliberately no minimum, maximum, sum or example. The question here is
    // "is this field populated", and that is answerable without a magnitude.
    return `number, ${distinct.length} distinct, ${integral ? 'integral' : 'fractional'}, ${nonZero}/${n} non-zero`;
  }

  if (type === 'string') {
    const distinct = [...new Set(present)];
    if (present.every((v) => DATEISH.test(v))) {
      return `date, ${distinct.length} distinct, format ${present[0].length === 10 ? 'YYYY-MM-DD' : `YYYY-MM-DD+ (${present[0].length} chars)`}`;
    }
    if (distinct.length <= 8 && distinct.every((v) => SAFE_WORD.test(v))) {
      return `string, ${distinct.length} distinct: ${distinct.sort().map((v) => `"${v}"`).join(', ')}`;
    }
    const lengths = distinct.map((v) => v.length).sort((a, b) => a - b);
    return `string, ${distinct.length} distinct, ${lengths[0]}–${lengths.at(-1)} chars`;
  }

  return `${type}, ${n} values`;
}

// ---------------------------------------------------------------------------
// the inventory
// ---------------------------------------------------------------------------

/**
 * Collect one report from one export. Pure — it takes the parsed export and
 * returns text — because the redaction above is the part that has to be right,
 * and a pure function is the part that can be tested.
 *
 * @param {object} d  a parsed `degiro-portfolio-*.json`
 * @param {string} label  what to call it in the heading
 * @returns {{lines: string[], answered: boolean}}
 */
export function inspect(d, label = 'export') {
  const lines = [];
  const say = (s = '') => lines.push(s);

  const meta = Object.fromEntries((d.meta ?? []).map((m) => [m.key, m.value]));
  const products = d.products ?? [];
  const snapshot = meta.liveSnapshot ?? null;
  const totals = snapshot?.totals ?? null;
  const withExtra = products.filter((p) => p?.extra && Object.keys(p.extra).length);

  say(`=== ${label} — ${products.length} products, exported ${String(d.exportedAt ?? '?').slice(0, 10)} ===`);

  // An export taken before 0.12.0 has neither field, and reporting "DEGIRO does
  // not send margin" off one of those would be a wrong answer to the blocker
  // rather than no answer. Say which it is.
  const stale = !totals && !withExtra.length;
  if (stale) {
    say('');
    say('   Neither totals nor extra is present anywhere in this export.');
    say('   That is the shape of an export written before 0.12.0, not evidence about');
    say('   what DEGIRO sends. Update, press "Wipe & resync", export again.');
    say(`   (liveSnapshot ${snapshot ? 'is present' : 'is absent'}, so the sync itself ${snapshot ? 'ran' : 'may not have run'}.)`);
    return { lines, answered: false };
  }

  // -- totalPortfolio.totals -------------------------------------------------
  say('');
  if (!totals) {
    say('-- totalPortfolio.totals — absent from this export --');
    say('   Products carry extra, so this is 0.12.0 or later and the sync stored a');
    say('   snapshot without totals. Worth knowing on its own: it means /update');
    say('   returned no totalPortfolio block for this account.');
  } else {
    const keys = Object.keys(totals).sort();
    const known = keys.filter((k) => ALREADY_READ.has(k));
    say(`-- totalPortfolio.totals — ${keys.length} keys, ${known.length} already read by parse.js --`);
    say('');
    say('   candidates (docs/NEXT.md §1 — margin, US-07):');
    for (const c of CANDIDATES.totals) {
      const hit = keys.includes(c);
      say(`      ${hit ? 'FOUND   ' : 'absent  '}${c.padEnd(22)}${hit ? shape([totals[c]]) : ''}`.trimEnd());
    }
    const rest = keys.filter((k) => !CANDIDATES.totals.includes(k));
    say('');
    say(`   everything else that arrived (${rest.length}):`);
    for (const k of rest) {
      const tag = ALREADY_READ.has(k) ? ' [read today]' : '';
      say(`      ${k.padEnd(26)}${shape([totals[k]])}${tag}`);
    }
  }

  // -- products[].extra ------------------------------------------------------
  say('');
  const keyRows = new Map(); // key -> product rows carrying it
  for (const p of withExtra) {
    for (const k of Object.keys(p.extra)) {
      if (!keyRows.has(k)) keyRows.set(k, []);
      keyRows.get(k).push(p);
    }
  }
  say(`-- products[].extra — ${withExtra.length}/${products.length} products carry it, ${keyRows.size} distinct keys --`);

  // Coverage per product type is the whole point for the option fields: a
  // contract size on 169 of 169 options and 0 of 121 stocks is a different
  // finding from one on 3 products, and only the first unblocks anything.
  const byType = new Map();
  for (const p of products) {
    const t = String(p?.productType ?? 'UNKNOWN');
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  const coverage = (rows) => {
    const seen = new Map();
    for (const p of rows) {
      const t = String(p?.productType ?? 'UNKNOWN');
      seen.set(t, (seen.get(t) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${n}/${byType.get(t) ?? n} ${t}`)
      .join(', ');
  };

  say('');
  say('   candidates (docs/NEXT.md §1 — option identity, US-03 / B1):');
  for (const c of CANDIDATES.extra) {
    const rows = keyRows.get(c);
    if (!rows) { say(`      absent  ${c}`); continue; }
    say(`      FOUND   ${c}`);
    say(`                 on ${coverage(rows)}`);
    say(`                 ${shape(rows.map((p) => p.extra[c]))}`);
  }

  const rest = [...keyRows.keys()].filter((k) => !CANDIDATES.extra.includes(k)).sort();
  say('');
  say(`   everything else that arrived (${rest.length}):`);
  for (const k of rest) {
    const rows = keyRows.get(k);
    say(`      ${k.padEnd(26)}${String(rows.length).padStart(4)}×  ${shape(rows.map((p) => p.extra[k]))}`);
  }

  return { lines, answered: true };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error('usage: node tools/inspect-fields.mjs <export.json> [...]');
    process.exit(2);
  }

  // Same guard as the audit: an export inside the repository is one `git add -A`
  // away from being published. Read it where it already is.
  const repo = resolve(new URL('..', import.meta.url).pathname);
  for (const p of paths) {
    if (!relative(repo, resolve(p)).startsWith('..')) {
      console.error(`refusing to read ${p}: it is inside the repository.`);
      console.error('Keep account exports outside the working tree — see CLAUDE.md rule 7.');
      process.exit(2);
    }
  }

  let answered = 0;
  for (const p of paths) {
    const r = inspect(JSON.parse(readFileSync(p, 'utf8')), p.split('/').pop());
    console.log(r.lines.join('\n'));
    if (r.answered) answered++;
  }
  console.log('');
  console.log('Names, coverage and shapes only — no amounts. Safe to paste into a finding.');
  process.exit(answered ? 0 : 1);
}
