/**
 * Trading 212 R1 — the service-worker half.
 *
 * The page context has passed: logged in with the cookie gives 200 JSON, without
 * the cookie 401, and logged out 401. What that does *not* answer is whether an
 * MV3 service worker gets the same treatment, because the request then comes
 * from a `chrome-extension://` origin under a host permission rather than from
 * `www.trading212.com`. Chrome treats such a request as first-party for cookie
 * purposes — that is why `degiro.js` works — but Trading 212's CORS policy is
 * theirs, not Chrome's, and it has never been asked this question.
 *
 * One request, made when a human asks for it. No retry (rule 5: a retried 401
 * looks like a login attempt), no alarm, no polling, no second fetch path — the
 * throttle in `degiro.js` guards a sync loop, and this is not one.
 *
 * **This file, its `case` in `src/sw.js`, and the `live.services.trading212.com`
 * host permission in `manifest.json` are one unit.** They arrive together and
 * they leave together; `test/trading212-probe.test.js` fails if two of the three
 * disagree, because a half-deleted spike leaves a host permission users approve
 * for nothing.
 */

import { OUTCOMES, classify, describeShape, validateTarget } from './spike.js';

/** The endpoint the page half measured. Nothing else is probed from here. */
export const PROBE_URL = 'https://live.services.trading212.com/rest/v1/accounts';

/**
 * Perform the one request, and report what came back without reporting what it
 * said.
 *
 * `fetchImpl` exists so the test can drive this without a browser. It is not a
 * second fetch path — production has exactly one caller and it passes nothing.
 */
export async function probeFromWorker({ url = PROBE_URL, fetchImpl = fetch } = {}) {
  const gate = validateTarget({ method: 'GET', url });
  if (!gate.ok) return { refused: gate.reason };

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      // The browser attaches the cookie. Nothing here reads one, and nothing
      // here writes one down — that is the whole of rule 9.
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    return { outcome: OUTCOMES.NETWORK_ERROR, error: e?.name ?? 'Error' };
  }

  const contentType = res.headers?.get?.('content-type') ?? '';
  const outcome = classify({
    status: res.status,
    contentType,
    // `redirect: 'manual'` hands back an opaque response with status 0 rather
    // than a 3xx, so the status alone would read as UNKNOWN.
    redirected: res.redirected === true || res.type === 'opaqueredirect',
  });

  const out = {
    outcome,
    status: res.status,
    // The parameters after `;` can carry a boundary or a charset; neither is
    // interesting and both are noise in a pasted result.
    contentType: contentType.split(';')[0],
    evidence: gate.evidence,
  };

  if (outcome === OUTCOMES.PASS_JSON) {
    // The field names are the finding the adapter needs. `describeShape`
    // replaces every value, so what travels is `{cash: "<number>"}` and never a
    // number — rule 7, enforced rather than intended.
    try {
      out.shape = describeShape(await res.json());
    } catch {
      out.shape = '<unparseable-json>';
    }
  }

  return out;
}
