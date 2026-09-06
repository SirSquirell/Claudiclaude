/**
 * US-152 — the one place the UI asks "is this Plus".
 *
 * The token lives in `chrome.storage.local` under `licence`, deliberately not in
 * IndexedDB beside the portfolio: it is the identifier of a purchase, and by
 * rule 7 it is in no allowlist — not `EXPORTABLE_META`, not the bug report, not
 * the diagnose. Those two carry `plus` and `expiresInDays` from `summary()` and
 * nothing else.
 *
 * Verified once per refresh, cached, read synchronously by every screen through
 * `entitlements()`. Screens never verify themselves. `body.plus` is set here so
 * the stylesheet's Plus states (the Upgrade button, the nav dots, the painted
 * column of the comparison) follow the same verdict.
 *
 * The demo page has no `chrome`; it keeps the token in localStorage so the
 * screen can be exercised against the test key. A real install never takes
 * that branch.
 */

import { LICENCE_KEYS } from '../lib/config.js';
import { summary, verify, webCryptoVerify } from '../lib/licence.js';
import { todayISO } from '../lib/dates.js';
import { inExtension } from './datasource.js';

const KEY = 'licence';
const DEMO_KEY = 'asteria.licence';

let cached = { plus: false, expiresInDays: null, verdict: { tier: 'free', reason: 'none' }, hasToken: false };

async function readToken() {
  if (inExtension) {
    const got = await chrome.storage.local.get(KEY);
    return typeof got?.[KEY] === 'string' ? got[KEY] : null;
  }
  try {
    return localStorage.getItem(DEMO_KEY);
  } catch {
    return null;
  }
}

async function writeToken(text) {
  if (inExtension) {
    if (text) await chrome.storage.local.set({ [KEY]: text });
    else await chrome.storage.local.remove(KEY);
    return;
  }
  try {
    if (text) localStorage.setItem(DEMO_KEY, text);
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    /* a blocked store means "no licence", which is what the verdict will say */
  }
}

export async function refreshEntitlements(today = todayISO()) {
  const token = await readToken();
  const verdict = await verify(token, LICENCE_KEYS, today, webCryptoVerify);
  cached = { ...summary(verdict, today), verdict, hasToken: !!token };
  document.body.classList.toggle('plus', cached.plus);
  return cached;
}

/** The cached verdict. Synchronous, so a render can read it without awaiting. */
export const entitlements = () => cached;

export async function activate(text, today = todayISO()) {
  await writeToken(String(text ?? '').trim());
  return refreshEntitlements(today);
}

export async function removeLicence(today = todayISO()) {
  await writeToken(null);
  return refreshEntitlements(today);
}
