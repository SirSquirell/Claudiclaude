#!/usr/bin/env node
/**
 * Turn a DevTools HAR export into the fixture set, with the identifiers
 * redacted. This is step 2-4 of SPEC §5 done for you.
 *
 *   node tools/har-to-fixtures.mjs ~/Downloads/trader.degiro.nl.har --out fixtures/real
 *
 * What it does:
 *   - picks out the responses whose URLs match the endpoints in SPEC §2
 *   - replaces sessionId / JSESSIONID / intAccount / userToken / account
 *     numbers / IBAN / email / name with fixed dummy values
 *   - writes transactions.json, accountoverview.json, update.json,
 *     products-info.json, client.json, config.json and chart-{vwdId}.json
 *   - prints what it found and, more usefully, what it did NOT find
 *
 * It writes to fixtures/real/ by default, which .gitignore excludes. Read the
 * files, satisfy yourself the redaction worked, and only then move them to
 * fixtures/. Redaction is a regex, not a guarantee — check before committing.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const harPath = args.find((a) => !a.startsWith('--'));
const outDir = (args.find((a) => a.startsWith('--out='))?.split('=')[1]) ?? 'fixtures/real';

if (!harPath) {
  console.error('usage: node tools/har-to-fixtures.mjs <file.har> [--out=fixtures/real]');
  process.exit(1);
}

const DUMMY = {
  sessionId: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.prod_b_128_3',
  intAccount: '9999999',
  userToken: '11111111',
};

/** url pattern -> fixture filename (chart is special-cased) */
const MATCHERS = [
  { name: 'config.json', re: /\/login\/secure\/config/ },
  { name: 'client.json', re: /\/pa\/secure\/client/ },
  { name: 'update.json', re: /\/trading\/secure\/v\d+\/update\// },
  { name: 'transactions.json', re: /\/reporting\/secure\/v\d+\/transactions/ },
  { name: 'accountoverview.json', re: /\/reporting\/secure\/v\d+\/accountoverview/ },
  { name: 'products-info.json', re: /\/product_search\/secure\/v\d+\/products\/info/ },
  { name: '__chart__', re: /charting\.vwdservices\.com\/hchart\/v1\/deGiro\/data\.js/ },
];

const har = JSON.parse(readFileSync(harPath, 'utf8'));
const entries = har?.log?.entries ?? [];
if (!entries.length) {
  console.error('No entries in that HAR. Did the export include response bodies?');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const seen = new Map();
const observed = [];

for (const entry of entries) {
  const url = entry.request?.url ?? '';
  const match = MATCHERS.find((m) => m.re.test(url));
  if (!match) continue;

  const text = entry.response?.content?.text;
  if (!text) {
    observed.push({ url: short(url), status: entry.response?.status, note: 'no body in HAR' });
    continue;
  }

  let body;
  try {
    body = JSON.parse(redact(stripJsonp(text)));
  } catch {
    observed.push({ url: short(url), status: entry.response?.status, note: 'body is not JSON' });
    continue;
  }

  if (match.name === '__chart__') {
    // One file per vwdId, named after the price series inside it.
    for (const s of body.series ?? []) {
      const m = /^price:issueid:(\d+)$/.exec(String(s.id ?? ''));
      if (!m) continue;
      const file = `chart-${m[1]}.json`;
      writeFileSync(join(outDir, file), JSON.stringify(body));
      seen.set(file, url);
    }
    continue;
  }

  // Keep the widest response when the same endpoint was called more than once
  // (a full-history transactions call beats a one-week one).
  const prev = seen.get(match.name);
  if (prev && prev.size > text.length) continue;
  writeFileSync(join(outDir, match.name), JSON.stringify(body, null, 2));
  seen.set(match.name, { url, size: text.length });
}

function stripJsonp(text) {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const m = /^[^(]*\((.*)\)\s*;?\s*$/s.exec(t);
  return m ? m[1] : t;
}

/** Replace every identifier we can recognise with a fixed dummy. */
function redact(text) {
  return (
    text
      // session ids: 32 hex/base64-ish chars, optionally with a .prod_ suffix
      .replace(/[A-Za-z0-9]{28,}\.prod_[a-z0-9_]+/g, DUMMY.sessionId)
      .replace(/("sessionId"\s*:\s*")[^"]+(")/g, `$1${DUMMY.sessionId}$2`)
      .replace(/("(?:intAccount|clientId|loggedInPersonId)"\s*:\s*)\d+/g, `$1${DUMMY.intAccount}`)
      .replace(/("(?:userToken)"\s*:\s*"?)[^",}]+("?)/g, `$1${DUMMY.userToken}$2`)
      // personal details
      .replace(/("(?:iban|bic)"\s*:\s*")[^"]*(")/gi, '$1REDACTED$2')
      .replace(/("(?:email)"\s*:\s*")[^"]*(")/gi, '$1demo@example.invalid$2')
      .replace(/("(?:firstName|lastName|displayName|username|streetAddress|zip|cellphoneNumber|memberCode)"\s*:\s*")[^"]*(")/g, '$1REDACTED$2')
  );
}

const short = (u) => u.split('?')[0].replace('https://', '');

console.log(`\nwrote ${seen.size} fixture file(s) to ${outDir}:`);
for (const name of [...seen.keys()].sort()) console.log(`  ${name}`);

const missing = MATCHERS.filter((m) => m.name !== '__chart__' && !seen.has(m.name)).map((m) => m.name);
const charts = [...seen.keys()].filter((k) => k.startsWith('chart-'));
if (!charts.length) missing.push('chart-*.json');

if (missing.length) {
  console.log(`\nNOT found in this HAR — capture these and re-run:`);
  for (const m of missing) console.log(`  ${m}`);
  console.log(`\n  transactions/accountoverview come from the Account overview page,`);
  console.log(`  update/products-info from the Portfolio page, chart-* from opening one instrument.`);
}

if (observed.length) {
  console.log(`\nskipped entries:`);
  for (const o of observed) console.log(`  ${o.status} ${o.url} — ${o.note}`);
}

console.log(
  `\nNow: read the files. Redaction is a regex, not a guarantee — grep for your\n` +
    `own name, account number and IBAN before moving anything into fixtures/.\n` +
    `Then run: npm test\n`,
);
