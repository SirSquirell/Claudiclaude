#!/usr/bin/env node
/**
 * US-152 — sign one licence token by hand.
 *
 *   node tools/sign-licence.mjs --key ~/asteria-keys/k1.private.json \
 *        --id lic_2026_0001 --valid-until 2027-09-06
 *
 * Prints the token and nothing else, so it can be piped. The `kid` comes from
 * the key file, `issued` is today. This is the owner's tool for the first
 * buyers and for testing a build; the webhook (US-155) produces the same
 * format from the same key.
 */
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeToken } from '../src/lib/licence.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const { key, id } = args;
const validUntil = args['valid-until'];
if (!key || !id || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil ?? '')) {
  console.error('usage: node tools/sign-licence.mjs --key <private.json> --id <lic_…> --valid-until <YYYY-MM-DD>');
  process.exit(2);
}
const jwk = JSON.parse(readFileSync(key, 'utf8'));
const { kid, ...privateJwk } = jwk;
if (!kid) {
  console.error('the key file carries no kid; make it with tools/make-licence-key.mjs');
  process.exit(2);
}
const cryptoKey = await webcrypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
const issued = new Date().toISOString().slice(0, 10);
const token = await makeToken(
  { id, tier: 'plus', validUntil, issued, kid },
  async (bytes) => new Uint8Array(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, bytes)),
);
process.stdout.write(token + '\n');
