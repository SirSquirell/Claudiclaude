#!/usr/bin/env node
/**
 * Turn a DevTools HAR export into the fixture set, with the identifiers
 * redacted. This is step 2-4 of SPEC §5 done for you.
 *
 *   node tools/har-to-fixtures.mjs ~/Downloads/trader.degiro.nl.har --out fixtures/real
 *
 * What it does:
 *   - picks out the responses whose URLs match the endpoints in SPEC §2
 *   - keeps, per endpoint, **only the field names `src/lib/parse.js` reads**
 *     (see KEEP below) and drops every other field — an allowlist, CLAUDE.md
 *     rule 7. The identifiers the parser does need (`intAccount`, the
 *     `userToken`, the display name) are kept as fixed dummies so the shape
 *     survives and the value does not.
 *   - writes transactions.json, accountoverview.json, update.json,
 *     products-info.json, client.json, config.json and chart-{vwdId}.json
 *   - prints what it found and, more usefully, what it did NOT find
 *
 * It used to be a denylist — a regex per identifier we had thought of — and
 * a denylist encodes its own next failure: the field nobody listed ships. Now
 * a field that is not in KEEP does not exist in the output. The corollary is
 * that when `parse.js` gains a candidate field name, KEEP gains it too, or the
 * real fixture will not carry it — which is the point, and it will be loud.
 *
 * It writes to fixtures/real/ by default, which .gitignore excludes. Read the
 * files, run `node tools/check-leaks.mjs fixtures/real/`, and only then move
 * them to fixtures/.
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

/**
 * The field names `parse.js` reads, per fixture. Everything not listed here is
 * dropped. `substitute` names the fields whose *presence* the parser needs but
 * whose value must never leave the account: they are replaced, not copied.
 *
 * Kept in the same order as the `pick()` calls in `parse.js`, so the two can be
 * diffed by eye.
 */
const KEEP = {
  // parseConfigUrls — the base URLs this account's cluster uses.
  'config.json': {
    envelope: ['data'],
    fields: ['tradingUrl', 'reportingUrl', 'productSearchUrl', 'paUrl'],
  },
  // parseClient — the two identifiers and the display name, all substituted.
  'client.json': {
    envelope: ['data'],
    fields: ['intAccount', 'int_account', 'id', 'userToken', 'displayName', 'username'],
    substitute: {
      intAccount: 9999999,
      int_account: 9999999,
      id: 11111111,
      userToken: '11111111',
      displayName: 'REDACTED',
      username: 'REDACTED',
    },
  },
  // parseTransactions — one row per trade.
  'transactions.json': {
    envelope: ['data.transactions', 'data', 'transactions'],
    rows: [
      'date', 'transactionDate', 'valueDate',
      'quantity', 'size', 'amount',
      'buysell', 'buySell', 'side',
      'id', 'transactionId',
      'productId', 'product_id',
      'price', 'tradedPrice',
      'currency', 'productCurrency',
      'feeInBaseCurrency', 'fee', 'totalFeesInBaseCurrency',
      'totalPlusFeeInBaseCurrency', 'totalInBaseCurrency', 'totalPlusAllFeesInBaseCurrency', 'total',
    ],
  },
  // parseCashMovements — one row per cash movement. `description` is DEGIRO's
  // wording and names holdings; it is what the classifier reads, so it stays.
  'accountoverview.json': {
    envelope: ['data.cashMovements', 'cashMovements', 'data.values', 'data'],
    rows: [
      'date', 'valueDate',
      'change', 'amount', 'value',
      'id', 'orderId',
      'productId', 'product_id',
      'description', 'text', 'label',
      'currency', 'ccy',
      'type', 'transactionType',
    ],
  },
  // parseUpdate — name/value pairs, three sections, nothing else in the
  // response (orders, alerts, historical orders) is read. `totalPortfolio` is
  // one pair list rather than rows of them, and every pair in it stays:
  // `parseUpdate` returns the whole flattened object as `totals`, `sync.js`
  // records its field names when no total matched, and the connection check
  // lists them (`totalFieldsSeen`) — which cash field is the whole balance is
  // an open question a real capture is meant to answer. They are amounts,
  // not identifiers.
  'update.json': {
    sections: {
      portfolio: ['id', 'productId', 'size', 'qty', 'quantity', 'value', 'valueInEur', 'todayPlBase', 'price'],
      totalPortfolio: 'all',
      cashFunds: ['currencyCode', 'currency', 'value'],
    },
  },
  // parseProducts — the named fields, plus `rest()`: every other *flat scalar*
  // on a product, which is how an option's contract size or expiry is meant to
  // surface once a real capture shows the field (US-03). Nested objects and
  // nulls are dropped, exactly as `rest()` drops them. Instrument metadata is
  // per product, not per account; there is no identifier to keep out.
  'products-info.json': {
    envelope: ['data', 'products'],
    flatScalars: true,
  },
  // parseChartResponse — the price series only: its id, its `times` anchor and
  // its points. The `issueid:NNN` metadata series and the request echo go.
  '__chart__': {
    series: ['id', 'times', 'data'],
  },
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
    body = redact(match.name, JSON.parse(stripJsonp(text)));
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

/**
 * Rebuild a response out of the fields `parse.js` reads, and nothing else.
 *
 * The envelope is preserved — `{data: [...]}` stays `{data: [...]}` — because
 * the fixture exists to exercise the parser's real path, `unwrap()` included.
 * Only the first envelope path that resolves is rebuilt; the rest of the
 * response does not exist afterwards.
 */
function redact(name, body) {
  const spec = KEEP[name];

  if (spec.sections) {
    // update.json: {portfolio: {value: [row, …]}, …}, each row {id, value: [{name, value}, …]}.
    const out = {};
    const isPair = (p) => p && typeof p === 'object' && 'name' in p && !Array.isArray(p.value);
    const keepPairs = (pairs, names) =>
      pairs.filter((p) => isPair(p) && (names === 'all' || names.includes(p.name)));
    for (const [section, names] of Object.entries(spec.sections)) {
      const rows = body?.[section]?.value ?? body?.[section];
      if (!Array.isArray(rows)) continue;
      if (rows.every(isPair)) {
        // One flat pair list — the shape totalPortfolio has.
        out[section] = { value: keepPairs(rows, names) };
        continue;
      }
      out[section] = {
        value: rows.map((row) => {
          if (Array.isArray(row?.value)) {
            const pairs = keepPairs(row.value, names);
            return row.id == null ? { value: pairs } : { id: row.id, value: pairs };
          }
          return names === 'all' ? { ...row } : keepFields(row, names);
        }),
      };
    }
    return out;
  }

  if (spec.series) {
    const list = body?.series ?? body?.data?.series;
    const series = (Array.isArray(list) ? list : [])
      .filter((s) => /^price:/.test(String(s?.id ?? '')))
      .map((s) => keepFields(s, spec.series));
    return { series };
  }

  const found = firstPath(body, spec.envelope);
  if (!found) return {};
  let value;
  if (spec.flatScalars) {
    const products = found.value;
    value = Array.isArray(products)
      ? products.map(flatScalars)
      : Object.fromEntries(Object.entries(products ?? {}).map(([k, p]) => [k, flatScalars(p)]));
  } else if (spec.rows) {
    value = (Array.isArray(found.value) ? found.value : []).map((r) => keepFields(r, spec.rows));
  } else {
    value = keepFields(found.value, spec.fields, spec.substitute);
  }
  return rebuild(found.path, value);
}

function keepFields(obj, fields, substitute = {}) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of fields) {
    if (!(k in obj)) continue;
    out[k] = k in substitute ? substitute[k] : obj[k];
  }
  return out;
}

/** What `rest()` in parse.js keeps: flat, non-null scalars. */
function flatScalars(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

/** The first dotted path that resolves to a non-null value. */
function firstPath(obj, paths) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path.split('.')) {
      if (cur == null || typeof cur !== 'object' || !(key in cur)) {
        ok = false;
        break;
      }
      cur = cur[key];
    }
    if (ok && cur != null) return { path, value: cur };
  }
  return null;
}

function rebuild(path, value) {
  return path.split('.').reduceRight((inner, key) => ({ [key]: inner }), value);
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
  `\nNow: read the files. Only the fields parse.js reads were kept, but read them\n` +
    `anyway, then run: node tools/check-leaks.mjs ${outDir}\n` +
    `before moving anything into fixtures/. Then: npm test\n`,
);
