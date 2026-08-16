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

import { SESSION_COOKIE_NAME, TRADER_HOST } from './config.js';
import { SessionExpiredError, fetchClient, fetchUpdate, fetchUrls } from './degiro.js';
import { getMeta, setMeta } from './store.js';

/**
 * Read a broker's session cookie from the browser's own jar.
 *
 * `host` and `cookieName` default to DEGIRO's — the only broker this project
 * has today — so every existing caller is unaffected. A second broker's
 * adapter passes its own; the mechanism (read a cookie the browser already
 * holds, write nothing) does not change per broker, only these two values do.
 */
export async function readSessionId({ host = TRADER_HOST, cookieName = SESSION_COOKIE_NAME } = {}) {
  if (typeof chrome === 'undefined' || !chrome.cookies) return null;
  const cookie = await chrome.cookies.get({ url: `https://${host}/`, name: cookieName });
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
export async function resolveSession({ refresh = false, host = TRADER_HOST, cookieName = SESSION_COOKIE_NAME } = {}) {
  const sessionId = await readSessionId({ host, cookieName });
  if (!sessionId) {
    return { ok: false, reason: 'no-cookie' };
  }

  let intAccount = await getMeta('intAccount');
  let userToken = await getMeta('userToken');

  /**
   * Which cluster this account is on, **re-read on every sync** rather than
   * cached.
   *
   * This used to be discovered once and kept forever, on a comment that said in
   * the same breath that it "can change". It can, and when it does nothing
   * notices: every reporting call goes to the wrong base and DEGIRO answers
   * 502. That is not a hypothetical — one account sits on
   * `/portfolio-reports/secure/` while a stale cache still said
   * `/reporting/secure/`, so its sync failed on every attempt while the
   * connection check, which fetches config fresh, reported a healthy 200 two
   * lines further down the same screen.
   *
   * A cached value that is wrong is worse than no cache: it fails in a way that
   * looks like the other end being broken. One request per sync, at 1,1 s, out
   * of dozens — and it self-heals a cache that is already poisoned, which
   * matters because every install carrying one is failing right now.
   */
  const urls = await fetchUrls();
  await setMeta('urls', urls);

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
