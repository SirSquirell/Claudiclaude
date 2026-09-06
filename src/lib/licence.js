/**
 * US-152 — the Plus licence: a signed token, verified without a network.
 *
 *   AST1.<base64url(payload JSON)>.<base64url(signature)>
 *   payload: { "id": "lic_…", "tier": "plus", "validUntil": "2027-09-06",
 *              "issued": "2026-09-06", "kid": "k1" }
 *
 * ECDSA P-256 over the **raw payload bytes** as they travel, signature in the
 * P1363 form WebCrypto emits (raw r‖s). The payload is parsed once before the
 * signature is checked, for one field only — `kid`, which selects the public
 * key — and everything else is read from it only after the signature holds.
 * Ed25519 was the obvious choice and is not available in WebCrypto on the
 * Chrome this extension declares as its minimum (116); P-256 is (TIERS.md §3).
 *
 * Pure, by the same rule as the engine: `verify` takes `today` and the
 * verifying primitive as arguments. `webCryptoVerify` is the primitive the
 * extension passes in; the tests pass the same primitive with a keypair that
 * exists only under test/. Nothing here reads storage, the clock or the
 * network, so a verdict is reproducible from its inputs.
 *
 * Every failure names its reason. A token that does not verify is `free` with
 * a reason, never a silent `free`: the person who pasted it has to be able to
 * tell "expired" from "typo" from "this build has no key yet".
 */

const PREFIX = 'AST1';
const SEGMENT = /^[A-Za-z0-9_-]+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** base64url → bytes. Tolerates missing padding, refuses anything else. */
export function fromBase64Url(s) {
  if (!SEGMENT.test(s)) throw new Error('not base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** bytes → base64url, no padding. */
export function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const free = (reason, extra = {}) => ({ tier: 'free', reason, ...extra });

/**
 * Split a token into its parts without trusting any of them.
 *
 * @returns {{ payloadBytes: Uint8Array, sigBytes: Uint8Array, kid: string|null } | null}
 */
export function parseToken(text) {
  if (typeof text !== 'string') return null;
  const parts = text.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  let payloadBytes, sigBytes;
  try {
    payloadBytes = fromBase64Url(parts[1]);
    sigBytes = fromBase64Url(parts[2]);
  } catch {
    return null;
  }
  // P-256 r‖s is 64 bytes, always. Anything else is not a signature we accept.
  if (sigBytes.length !== 64 || payloadBytes.length === 0 || payloadBytes.length > 2048) return null;
  let kid = null;
  try {
    const peek = JSON.parse(new TextDecoder().decode(payloadBytes));
    kid = typeof peek?.kid === 'string' ? peek.kid : null;
  } catch {
    return null;
  }
  return { payloadBytes, sigBytes, kid };
}

/**
 * The verdict.
 *
 * @param {string} text            the pasted token
 * @param {Record<string, JsonWebKey>} keys  public keys by kid (config.js)
 * @param {string} today           'YYYY-MM-DD'
 * @param {(jwk: JsonWebKey, data: Uint8Array, sig: Uint8Array) => Promise<boolean>} verifyFn
 * @returns {Promise<{tier: 'free'|'plus', reason: string|null, id?: string, kid?: string, validUntil?: string, issued?: string}>}
 */
export async function verify(text, keys, today, verifyFn) {
  if (!text) return free('none');
  if (!keys || Object.keys(keys).length === 0) return free('no-keys');
  const parsed = parseToken(text);
  if (!parsed) return free('malformed');
  if (!parsed.kid || !Object.hasOwn(keys, parsed.kid)) return free('unknown-kid', { kid: parsed.kid });
  let ok = false;
  try {
    ok = (await verifyFn(keys[parsed.kid], parsed.payloadBytes, parsed.sigBytes)) === true;
  } catch {
    ok = false;
  }
  if (!ok) return free('bad-signature', { kid: parsed.kid });

  // Only now is the payload something we read.
  const p = JSON.parse(new TextDecoder().decode(parsed.payloadBytes));
  if (p.tier !== 'plus' || typeof p.id !== 'string' || !ISO_DAY.test(p.validUntil ?? '')) {
    return free('malformed', { kid: parsed.kid });
  }
  if (typeof today !== 'string' || !ISO_DAY.test(today)) throw new Error('verify: today must be YYYY-MM-DD');
  // Inclusive: a licence valid until the 6th is valid on the 6th.
  if (today > p.validUntil) return free('expired', { kid: p.kid, id: p.id, validUntil: p.validUntil });
  return { tier: 'plus', reason: null, id: p.id, kid: p.kid, validUntil: p.validUntil, issued: p.issued ?? null };
}

/**
 * The two fields anything outside the licence screen is allowed to know
 * (diagnose, bug report): whether this is Plus, and for how many more days.
 */
export function summary(verdict, today) {
  if (verdict?.tier !== 'plus') return { plus: false, expiresInDays: null };
  const days = Math.round((Date.parse(verdict.validUntil) - Date.parse(today)) / 86400000);
  return { plus: true, expiresInDays: days };
}

/** The primitive the extension passes to `verify`. WebCrypto, P-256, SHA-256. */
export async function webCryptoVerify(jwk, data, sig) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data);
}

/**
 * Build a token. Used by tools/sign-licence.mjs and by the tests; the extension
 * never calls it — it holds no private key, by design (CLAUDE.md rule 9 in
 * spirit: nothing that can be stolen is here).
 *
 * @param {(data: Uint8Array) => Promise<Uint8Array>} signFn  P-256 over the payload bytes, P1363 out
 */
export async function makeToken(payload, signFn) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await signFn(bytes);
  return `${PREFIX}.${toBase64Url(bytes)}.${toBase64Url(sig)}`;
}
