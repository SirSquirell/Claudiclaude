import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { makeToken, parseToken, summary, verify, webCryptoVerify } from '../src/lib/licence.js';

/**
 * US-152. The keypair is generated here, on every run: there is no private key
 * in the tree, not even a test one, and no token literal either — the leak
 * check treats an `AST1.…` literal anywhere as somebody's purchase.
 */
const subtle = webcrypto.subtle;
globalThis.crypto ??= webcrypto;

async function keypair() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await subtle.exportKey('jwk', pair.publicKey);
  return {
    pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y },
    sign: async (bytes) => new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, bytes)),
  };
}

const k1 = await keypair();
const k2 = await keypair();
const keys = { k1: k1.pub, k2: k2.pub };
const TODAY = '2026-09-06';
const payload = (over = {}) => ({ id: 'lic_test_0001', tier: 'plus', validUntil: '2027-09-06', issued: TODAY, kid: 'k1', ...over });

test('a token signed with a known key is plus, with its fields', async () => {
  const token = await makeToken(payload(), k1.sign);
  const v = await verify(token, keys, TODAY, webCryptoVerify);
  assert.equal(v.tier, 'plus');
  assert.equal(v.reason, null);
  assert.equal(v.id, 'lic_test_0001');
  assert.equal(v.kid, 'k1');
  assert.equal(v.validUntil, '2027-09-06');
  assert.deepEqual(summary(v, TODAY), { plus: true, expiresInDays: 365 });
});

test('the five free verdicts each carry their reason', async () => {
  assert.deepEqual(await verify(null, keys, TODAY, webCryptoVerify), { tier: 'free', reason: 'none' });
  assert.deepEqual(await verify('AST1.x.y', {}, TODAY, webCryptoVerify), { tier: 'free', reason: 'no-keys' });
  assert.equal((await verify('not a token', keys, TODAY, webCryptoVerify)).reason, 'malformed');
  assert.equal((await verify('AST1.' + 'a'.repeat(30) + '.' + 'b'.repeat(30), keys, TODAY, webCryptoVerify)).reason, 'malformed');

  const k3 = await keypair();
  const unknown = await makeToken(payload({ kid: 'k3' }), k3.sign);
  const u = await verify(unknown, keys, TODAY, webCryptoVerify);
  assert.equal(u.reason, 'unknown-kid');
  assert.equal(u.kid, 'k3');

  // Signed by k2 but claiming k1: the signature is checked against the claimed key.
  const forged = await makeToken(payload({ kid: 'k1' }), k2.sign);
  assert.equal((await verify(forged, keys, TODAY, webCryptoVerify)).reason, 'bad-signature');

  const old = await makeToken(payload({ validUntil: '2026-09-05' }), k1.sign);
  const e = await verify(old, keys, TODAY, webCryptoVerify);
  assert.equal(e.reason, 'expired');
  assert.equal(e.validUntil, '2026-09-05');
  assert.deepEqual(summary(e, TODAY), { plus: false, expiresInDays: null });
});

test('validUntil is inclusive, and a tampered payload does not verify', async () => {
  const lastDay = await makeToken(payload({ validUntil: TODAY }), k1.sign);
  assert.equal((await verify(lastDay, keys, TODAY, webCryptoVerify)).tier, 'plus');
  assert.equal((await verify(lastDay, keys, '2026-09-07', webCryptoVerify)).reason, 'expired');

  // Extend the date in the payload without re-signing: bytes change, signature fails.
  const token = await makeToken(payload(), k1.sign);
  const [p, body, sig] = token.split('.');
  const edited = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  edited.validUntil = '2099-01-01';
  const body2 = Buffer.from(JSON.stringify(edited)).toString('base64url');
  assert.equal((await verify(`${p}.${body2}.${sig}`, keys, TODAY, webCryptoVerify)).reason, 'bad-signature');
});

test('key rotation: two keys live, a token under either verifies', async () => {
  const under2 = await makeToken(payload({ kid: 'k2' }), k2.sign);
  assert.equal((await verify(under2, keys, TODAY, webCryptoVerify)).tier, 'plus');
  assert.equal((await verify(under2, { k1: k1.pub }, TODAY, webCryptoVerify)).reason, 'unknown-kid');
});

test('parseToken refuses what is not a P-256 signature, and reads only kid', async () => {
  const token = await makeToken(payload(), k1.sign);
  const parsed = parseToken(token);
  assert.equal(parsed.sigBytes.length, 64);
  assert.equal(parsed.kid, 'k1');
  assert.equal(parseToken(token.slice(0, -4)), null, 'a truncated signature is not 64 bytes');
  assert.equal(parseToken('AST2.' + token.slice(5)), null, 'another prefix is another product');
});
