/*
 * R1 probe — paste into the DevTools console of a logged-in broker tab.
 *
 * Answers the one question that decides whether a broker can be supported at
 * all (docs/MULTI-BROKER.md §1, R1): is there something in this tab that an
 * extension could read and replay, without anyone ever typing a credential
 * into our software (CLAUDE.md rule 9)?
 *
 * **It prints names, lengths and shapes. It never prints a value.** That is the
 * entire reason this file exists rather than "have a look in Application and
 * send a screenshot": a session token is a live credential, and the obvious way
 * to report the answer hands the account to whoever reads the message. The
 * output of this is safe to screenshot; the Application panel is not.
 *
 * Two things it deliberately cannot see, both of which matter:
 *
 *  1. **HttpOnly cookies are invisible to `document.cookie`** — by design, that
 *     is what HttpOnly means. And they are the *most likely* home for a session:
 *     DEGIRO's own `JSESSIONID` is HttpOnly, and this extension reads it anyway,
 *     through `chrome.cookies` with a host permission. So an empty cookie
 *     section here is **not** an answer of "no". It has to be read off the
 *     Application → Cookies panel by eye, names only.
 *  2. Anything the page holds only in memory. If the session lives in a
 *     JavaScript variable and nowhere else, nothing outside the page can reach
 *     it, and that is a genuine "no" — but this probe cannot distinguish it from
 *     case 1 on its own.
 */
(() => {
  const shapeOf = (v) => {
    if (typeof v !== 'string') return typeof v;
    if (!v) return 'empty';
    const parts = v.split('.');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p) && p.length > 2)) {
      return 'JWT-like (3 dot-separated chunks)';
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return 'uuid-like';
    if (/^[0-9a-f]{32,}$/i.test(v)) return 'long hex';
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) return 'JSON';
    if (/^[A-Za-z0-9+/=_-]{40,}$/.test(v)) return 'opaque token-like';
    return 'other';
  };

  // A key can itself be identifying — `user-31612345` or a phone number. Names
  // are reported, so any long digit run in one is masked, on the same reasoning
  // that made `fieldNames` in sync.js reject an IBAN.
  const safeName = (k) => String(k).replace(/\d{3,}/g, (m) => 'X'.repeat(m.length));

  const rows = [];
  const add = (source, k, v) =>
    rows.push({
      source,
      name: safeName(k),
      length: typeof v === 'string' ? v.length : null,
      shape: shapeOf(v),
    });

  for (const c of document.cookie.split(';').map((s) => s.trim()).filter(Boolean)) {
    const i = c.indexOf('=');
    add('cookie (JS-readable only)', i < 0 ? c : c.slice(0, i), i < 0 ? '' : c.slice(i + 1));
  }

  for (const store of ['localStorage', 'sessionStorage']) {
    try {
      const s = window[store];
      for (let i = 0; i < s.length; i++) add(store, s.key(i), s.getItem(s.key(i)));
    } catch (err) {
      rows.push({ source: store, name: '(blocked)', length: null, shape: err.name });
    }
  }

  console.log('host:', location.host, '· JS-readable cookies:', document.cookie ? 'some' : 'none');
  console.log('NB: HttpOnly cookies never appear above. Check Application → Cookies by eye — names only.');
  if (rows.length) console.table(rows);
  else console.log('Nothing readable from JS. That is not yet a "no" — see the note above.');
})();
