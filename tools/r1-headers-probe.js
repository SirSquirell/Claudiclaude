/*
 * R1, second half — how does a request carry the session?
 *
 * `r1-probe.js` answered the reading half: seven cookies, none `HttpOnly`,
 * `tr_claims` at 843 characters. What it could not answer is whether an
 * extension could ever *send* that — because `tr_claims` looks like
 * `SameSite=Strict`, and a request from a service worker is cross-site.
 * See `docs/MULTI-BROKER.md` §2f.
 *
 * The decisive question is one line of DevTools: does the page set an
 * `Authorization` header, or is the cookie doing the work? This answers it
 * without anyone reading a header value off a screen.
 *
 * **Names only, never values.** Same rule as the first probe, for the same
 * reason: a session token is a live credential and the obvious way to report
 * the answer hands over the account.
 *
 * ## What it cannot see, and it matters
 *
 * Headers the *browser* adds by itself — `Cookie`, `User-Agent`, `Origin` — are
 * invisible to this by construction. Only what the page explicitly sets is
 * observable. That is not a gap, it is the finding:
 *
 *  - an `authorization` header in the output ⇒ the token travels in a header,
 *    which an extension can transcribe exactly as DEGIRO's session id is
 *    transcribed today. **Good case.**
 *  - requests to the API host with no auth header ⇒ the cookie is carrying it,
 *    `SameSite` applies, and that is the case that needs a decision rather than
 *    an implementation.
 *
 * ## Using it
 *
 *   1. Paste into the console of a logged-in tab.
 *   2. Click around the app for a few seconds — switch views, open a position.
 *      Nothing is captured until a request actually goes out.
 *   3. Run `__r1report()`.
 *
 * The table it prints is safe to screenshot.
 */
(() => {
  const seen = [];
  const MAX = 200;

  const record = (row) => {
    if (seen.length < MAX) seen.push(row);
  };

  const where = (u) => {
    try {
      const url = new URL(u, location.href);
      // The path can carry an account number. First segment only, and any long
      // digit run masked — the same rule `fieldNames` in sync.js applies.
      const first = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return { host: url.host, path: '/' + first.replace(/\d{3,}/g, (m) => 'X'.repeat(m.length)) };
    } catch {
      return { host: '(unparseable)', path: '' };
    }
  };

  // --- fetch ---------------------------------------------------------------
  const originalFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    try {
      const req = typeof input === 'object' && input !== null ? input : null;
      const headers = new Headers((req && req.headers) || init.headers || {});
      record({
        kind: 'fetch',
        ...where(req ? req.url : input),
        headers: [...headers.keys()].sort().join(' ') || '(none set by the page)',
        credentials: init.credentials ?? req?.credentials ?? '(default)',
      });
    } catch {
      /* never let the probe break the page */
    }
    return originalFetch.apply(this, arguments);
  };

  // --- XMLHttpRequest ------------------------------------------------------
  const { open: xhrOpen, setRequestHeader: xhrSet, send: xhrSend } = XMLHttpRequest.prototype;

  XMLHttpRequest.prototype.open = function (_method, url) {
    try {
      this.__probe = { kind: 'xhr', ...where(url), names: [] };
    } catch {
      /* ignore */
    }
    return xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name) {
    this.__probe?.names.push(String(name).toLowerCase());
    return xhrSet.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this.__probe) {
      record({
        kind: 'xhr',
        host: this.__probe.host,
        path: this.__probe.path,
        headers: this.__probe.names.sort().join(' ') || '(none set by the page)',
        credentials: this.withCredentials ? 'include' : '(default)',
      });
    }
    return xhrSend.apply(this, arguments);
  };

  // --- WebSocket -----------------------------------------------------------
  const OriginalWebSocket = window.WebSocket;
  function ProbedWebSocket(url, protocols) {
    record({ kind: 'websocket', ...where(url), headers: '(a socket sets none)', credentials: '' });
    return new OriginalWebSocket(url, protocols);
  }
  ProbedWebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket = ProbedWebSocket;

  // Exposed so an automated test can assert what would be reported. Not part
  // of the instructions above; nothing outside a test looks at it.
  window.__probeRowsForTest = seen;

  window.__r1report = () => {
    if (!seen.length) {
      console.log('Nothing captured yet — click around the app first, then run __r1report() again.');
      return;
    }
    console.table(seen);
    const auth = seen.some((r) => /authorization|bearer|x-.*token/i.test(r.headers));
    console.log(
      auth
        ? 'An auth header is set by the page: the token can be transcribed, like DEGIRO’s session id.'
        : 'No auth header set by the page. If requests are reaching an API host, the cookie is carrying the session — and SameSite then decides whether an extension can. See MULTI-BROKER.md 2f.',
    );
  };

  console.log('Probe armed. Click around the app for a few seconds, then run:  __r1report()');
})();
