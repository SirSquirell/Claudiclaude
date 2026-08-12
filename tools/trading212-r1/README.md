# Trading 212 R1 — how to run it

**Ten minutes, a Trading 212 login, and a browser console.** Nothing is installed and nothing is
stored.

The question: *can this extension read Trading 212 account data from a session you already have,
without storing any credential?* Rule 9 makes a "no" final, so this runs before any adapter work.

## Step 1 — logged in

Log in to Trading 212. Open the portfolio page. **F12 → Console.** Paste:

```js
(async () => {
  const t = async (url, credentials) => {
    try {
      const r = await fetch(url, { method: 'GET', credentials, cache: 'no-store',
                                   redirect: 'manual', headers: { Accept: 'application/json' } });
      return `${credentials}: ${r.status} ${r.headers.get('content-type') ?? '-'}${r.redirected ? ' REDIRECTED' : ''}`;
    } catch (e) { return `${credentials}: threw ${e.name}`; }
  };
  const url = 'https://live.services.trading212.com/rest/v1/accounts';
  console.log(await t(url, 'include'));
  console.log(await t(url, 'omit'));
})();
```

**Report the two lines.** Nothing else — no body, no headers.

> If both say 404, that path is wrong. It is a hypothesis from community code and has never been
> seen in a real Network tab. Open the **Network** tab, reload the portfolio page, and find the
> request that actually fills it. Report its **path** — not its response. Then re-run with that URL.

## Step 2 — the same request, logged out

Log out of Trading 212. Run the identical snippet. **Report both lines again.**

This is the control, and it is not optional. An endpoint that answers the same logged out is not
account data, and a "yes" from step 1 alone would be a false positive.

## Step 3 — log back in

Run it once more. Access should return. That confirms the thing being read is the session and not
something cached.

## Step 4 — the headers, names only

In the Network tab, click the request that fills the portfolio. Under **Request Headers**, report
**the names only** — never values. Especially anything like `X-Trader-Client`,
`X-Trader-Device-Model`, or anything containing `dUUID`.

## What the answers mean

| Step 1 `include` | Step 1 `omit` | Step 2 logged out | |
|---|---|---|---|
| 200 JSON | 401/403 | 401/403 | **PASS.** A session the browser already holds is enough |
| 200 JSON | 200 JSON | 200 JSON | Not account data — you found a public endpoint |
| 401/403 | 401/403 | — | The page authenticates with something it holds in memory. **Rule 9 territory** |
| 200 HTML | — | — | A login page with a 200 status. Not success |

If a **device identifier** turns out to be required, that is a rule 9 judgement rather than a
technical one, and it goes to the user rather than being decided here.

## What this deliberately does not do

No service worker probe yet — that comes only after step 1 passes, because a host permission
granted speculatively is one the user approves for nothing. No API key. No automation. No content
script.

## If it fails

Delete this directory and any manifest permission. Keep only the scrubbed finding in
`MULTI-BROKER.md` §8. **Not a feature flag** — rule 8.
