/**
 * Session discovery.
 *
 * SPEC §1.1: the whole point of shipping this as an extension is that the
 * browser already holds an authenticated DEGIRO session. We read the cookie the
 * user's own login produced and never store or ask for a credential.
 *
 * SPEC §3.1: "Check session validity via a cheap call. If invalid, surface
 * 'log in to DEGIRO' in the popup and stop. Never attempt a login."
 */

import { DEFAULT_URLS, TRADER } from './config.js';
import { SessionExpiredError, fetchClient, fetchUpdate, fetchUrls } from './degiro.js';
import { getMeta, setMeta } from './store.js';

/** Read JSESSIONID from the browser's own cookie jar. */
export async function readSessionId() {
  if (typeof chrome === 'undefined' || !chrome.cookies) return null;
  const cookie = await chrome.cookies.get({ url: `${TRADER}/`, name: 'JSESSIONID' });
  return cookie?.value ?? null;
}

/**
 * Resolve everything the API calls need: the session id from the cookie, and
 * intAccount + userToken from /pa/secure/client.
 *
 * intAccount and userToken are stable for the life of the account, so they are
 * cached; the session id never is.
 *
 * @returns {Promise<{ok: true, sessionId, intAccount, userToken} | {ok: false, reason: string}>}
 */
export async function resolveSession({ refresh = false } = {}) {
  const sessionId = await readSessionId();
  if (!sessionId) {
    return { ok: false, reason: 'no-cookie' };
  }

  let intAccount = await getMeta('intAccount');
  let userToken = await getMeta('userToken');
  let urls = await getMeta('urls');

  // Which trading cluster this account is on is account-specific and can
  // change; discover it once and cache it alongside the identifiers.
  if (refresh || !urls) {
    urls = await fetchUrls();
    await setMeta('urls', urls);
  }

  if (refresh || intAccount == null || userToken == null) {
    try {
      const client = await fetchClient({ sessionId, urls });
      if (client.intAccount == null || client.userToken == null) {
        return { ok: false, reason: 'client-endpoint-shape' };
      }
      intAccount = client.intAccount;
      userToken = client.userToken;
      await setMeta('intAccount', intAccount);
      await setMeta('userToken', userToken);
      if (client.displayName) await setMeta('displayName', client.displayName);
    } catch (err) {
      if (err instanceof SessionExpiredError) return { ok: false, reason: 'expired' };
      return { ok: false, reason: 'client-error', error: String(err.message ?? err) };
    }
  }

  return { ok: true, sessionId, intAccount, userToken, urls };
}

/**
 * The cheap validity probe from SPEC §3.1. Returns the parsed update payload on
 * success so the caller does not have to fetch it twice.
 */
export async function checkSession(session) {
  try {
    const update = await fetchUpdate({ intAccount: session.intAccount, sessionId: session.sessionId, urls: session.urls });
    return { ok: true, update };
  } catch (err) {
    if (err instanceof SessionExpiredError) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'error', error: String(err.message ?? err) };
  }
}

export const SESSION_MESSAGES = {
  'no-cookie': 'Not logged in. Open trader.degiro.nl and log in, then sync again.',
  expired: 'Your DEGIRO session timed out. Open trader.degiro.nl, log in, then sync again.',
  'client-endpoint-shape': 'DEGIRO’s /pa/secure/client response no longer has intAccount. The endpoint changed — see SPEC §2.',
  'client-error': 'Could not read the account identifiers from DEGIRO.',
  error: 'DEGIRO returned an error.',
};
