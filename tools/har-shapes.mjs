#!/usr/bin/env node
/**
 * What a broker's API actually looks like, from a HAR — **without the HAR ever
 * leaving the machine**.
 *
 *   node tools/har-shapes.mjs ~/Downloads/app.traderepublic.com.har
 *
 * ## Why this exists
 *
 * R2 to R5 in `docs/MULTI-BROKER.md` are all one question: *what does this
 * broker actually send?* A HAR answers all four at once — every request the app
 * made, and every field in every response. It is by far the most efficient way
 * to close a compatibility spike.
 *
 * It is also the most dangerous file anyone in this project will handle. A HAR
 * contains the session cookie, every `Authorization` header, and the full body
 * of every response — which is to say the entire portfolio, in the clear. It
 * must never be sent to anyone, pasted into a chat, or committed.
 *
 * **So the file stays put and only its shape travels.** This prints endpoint
 * paths, field names, types and counts. No value is ever printed unless it is
 * structural: a status code, a count, an ISO date's *format*. That is CLAUDE.md
 * rule 7 applied to a spike instead of to the export — the output is the
 * finding, a finding gets pasted somewhere, so the tool is built as an
 * allowlist rather than a redactor.
 *
 * Broker-agnostic on purpose (US-26): it knows nothing about DEGIRO or Trade
 * Republic, so it works on the third one too.
 */

import { readFileSync } from 'node:fs';

const path = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!path) {
  console.error('usage: node tools/har-shapes.mjs <file.har> [--max-depth 4]');
  process.exit(2);
}
const MAX_DEPTH = Number(process.argv.find((a, i, all) => all[i - 1] === '--max-depth') ?? 4);

/**
 * A field name, or something wearing one.
 *
 * The first version of `inspect-fields.mjs` let a person's name and an IBAN
 * through because "starts with a letter, then alphanumerics" describes both an
 * identifier and an IBAN. The digit-run rule is what actually separates them,
 * and it is here for the same reason it is in `sync.js`.
 */
const isFieldName = (k) => /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(k) && !/\d{3}/.test(k);

/** What a value *is*, never what it says. */
function shapeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]`;
  const t = typeof v;
  if (t === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (t === 'boolean') return 'bool';
  if (t === 'object') return 'object';
  if (t !== 'string') return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date(YYYY-MM-DD)';
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return 'datetime(ISO)';
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(v)) return 'date(dd/MM/yyyy)';
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(v)) return 'ISIN-shaped';
  if (/^[A-Z]{3}$/.test(v)) return 'currency-shaped';
  if (/^-?\d+([.,]\d+)?$/.test(v)) return 'numeric-string';
  if (v.length > 60) return `string(long, ${v.length})`;
  return `string(${v.length})`;
}

/** Walk an object, collecting `path -> set of shapes` and how often each appears. */
function collect(node, into, prefix = '', depth = 0) {
  if (depth > MAX_DEPTH || node == null) return;
  if (Array.isArray(node)) {
    // Only the first few elements: a thousand rows of the same shape teach
    // nothing the first three did not.
    for (const item of node.slice(0, 3)) collect(item, into, `${prefix}[]`, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const name = isFieldName(key) ? key : '(non-identifier key)';
    const p = prefix ? `${prefix}.${name}` : name;
    const row = into.get(p) ?? { shapes: new Set(), count: 0 };
    row.shapes.add(shapeOf(value));
    row.count++;
    into.set(p, row);
    if (value && typeof value === 'object') collect(value, into, p, depth + 1);
  }
}

/** A URL with anything account-shaped taken out of it. */
function safePath(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname
      .split('/')
      .filter(Boolean)
      .map((seg) => (/\d{3}/.test(seg) ? '{id}' : seg));
    // Query *names* only. A query value is where session ids live.
    const names = [...new URLSearchParams(u.search).keys()].filter(isFieldName).sort();
    return { host: u.host, path: '/' + parts.join('/'), query: names };
  } catch {
    return { host: '(unparseable)', path: '', query: [] };
  }
}

const har = JSON.parse(readFileSync(path, 'utf8'));
const entries = har?.log?.entries ?? [];
if (!entries.length) {
  console.error('no entries in this HAR');
  process.exit(1);
}

/** One row per distinct endpoint, whatever it was called with. */
const endpoints = new Map();

for (const e of entries) {
  const req = e.request ?? {};
  const res = e.response ?? {};
  const { host, path: p, query } = safePath(req.url ?? '');
  const key = `${req.method ?? '?'} ${host}${p}`;

  const row = endpoints.get(key) ?? {
    calls: 0,
    statuses: new Set(),
    query: new Set(),
    reqHeaders: new Set(),
    mime: new Set(),
    fields: new Map(),
    bytes: 0,
  };
  row.calls++;
  row.statuses.add(res.status ?? 0);
  for (const q of query) row.query.add(q);
  // Header *names*, so `authorization` shows up as a fact without its value.
  for (const h of req.headers ?? []) if (isFieldName(h.name?.replace(/-/g, '_'))) row.reqHeaders.add(h.name.toLowerCase());
  row.mime.add((res.content?.mimeType ?? '').split(';')[0]);
  row.bytes += res.content?.size ?? 0;

  const text = res.content?.text;
  if (text && /json/i.test(res.content?.mimeType ?? '')) {
    try {
      collect(JSON.parse(text), row.fields);
    } catch {
      /* not JSON after all */
    }
  }
  endpoints.set(key, row);
}

// --- report ----------------------------------------------------------------

const sorted = [...endpoints.entries()].sort((a, b) => b[1].calls - a[1].calls);

console.log(`\n=== ${entries.length} requests, ${sorted.length} distinct endpoints ===`);
console.log('Field names, types and counts only. No value from this HAR is printed.\n');

for (const [key, row] of sorted) {
  console.log(`${key}`);
  console.log(
    `   ${row.calls}x · status ${[...row.statuses].join(',')} · ${[...row.mime].filter(Boolean).join(',') || 'no body'}` +
      ` · ${Math.round(row.bytes / 1024)} kB`,
  );
  if (row.query.size) console.log(`   query: ${[...row.query].join(', ')}`);

  // The one header fact the spike turns on.
  const auth = [...row.reqHeaders].filter((h) => /^(authorization|x-[a-z-]*(token|auth|session)[a-z-]*)$/.test(h));
  console.log(`   auth header: ${auth.length ? auth.join(', ') : 'none — the cookie is carrying it'}`);

  if (row.fields.size) {
    const fields = [...row.fields.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    console.log(`   ${fields.length} field path(s):`);
    for (const [p, f] of fields.slice(0, 80)) {
      console.log(`      ${p.padEnd(46)} ${[...f.shapes].join('|')}`);
    }
    if (fields.length > 80) console.log(`      … and ${fields.length - 80} more`);
  }
  console.log('');
}

console.log('Paste this output. Do not paste, upload or commit the HAR itself: it holds the');
console.log('session token and every response body in the clear.');
