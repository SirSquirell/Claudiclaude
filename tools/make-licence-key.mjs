#!/usr/bin/env node
/**
 * US-152 — make a licence signing keypair.
 *
 *   node tools/make-licence-key.mjs --kid k1 --out ~/asteria-keys/k1.private.json
 *
 * Prints the public half as the entry to paste into `LICENCE_KEYS` in
 * src/lib/config.js, and writes the private half to `--out`. The tool refuses
 * an `--out` inside this repository: the private key is the one thing in this
 * product that must never be committed, and a refusal is cheaper than a leak
 * check catching it later. The webhook (US-155) signs with the same file.
 */
import { webcrypto } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const kid = args.kid;
const out = args.out && resolve(args.out);
if (!kid || !/^[a-z0-9-]{1,16}$/.test(kid) || !out) {
  console.error('usage: node tools/make-licence-key.mjs --kid <k1> --out <path outside the repo>');
  process.exit(2);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (out.startsWith(repo + '/')) {
  console.error(`refusing: ${out} is inside the repository. The private key never goes in here.`);
  process.exit(2);
}
if (existsSync(out)) {
  console.error(`refusing: ${out} exists. Rotate by choosing a new kid and a new file.`);
  process.exit(2);
}

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const priv = await webcrypto.subtle.exportKey('jwk', pair.privateKey);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ kid, ...priv }, null, 2) + '\n', { mode: 0o600 });

console.log(`private key written to ${out} (mode 600). Back it up; it cannot be regenerated.\n`);
console.log('paste into LICENCE_KEYS in src/lib/config.js:\n');
console.log(`  ${JSON.stringify(kid)}: { kty: 'EC', crv: 'P-256', x: ${JSON.stringify(pub.x)}, y: ${JSON.stringify(pub.y)} },`);
