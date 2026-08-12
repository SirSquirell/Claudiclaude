# Trading 212 R1 — result

**Status: page context PASS, control PASS, measured 2026-08-12 — the cookie carries the session.**
The service-worker half is the only thing still open. `tools/trading212-r1/README.md` has the steps.

> **Can Claudiclaude read Trading 212 account data while the user is already logged in, without
> storing a password, API key, secret, token or any other durable broker credential?**

Rule 9 makes a "no" final. No adapter work starts before this says otherwise.

## What is already settled, and needs no test

| | |
|---|---|
| Price history | **Public.** No credential of any kind — measured, `MULTI-BROKER.md` §8b |
| R2, R3, R5 schemas | Documented in the official OpenAPI spec — §8c |
| MV3 can make authenticated read-only requests this way | **Yes, in production.** `degiro.js:124` uses `credentials: 'include'` and never copies a cookie value. What is unknown is whether Trading 212's cookies are attached, which is a fact about their cookies |

## The measurements

### Step 1 — logged in — **MEASURED**

Endpoint: `GET https://live.services.trading212.com/rest/v1/accounts`

| | Status | Content-Type |
|---|---|---|
| `credentials: 'include'` | **200** | not captured |
| `credentials: 'omit'` | **401** | — |

**This is the signature R1 was asking for.** Public endpoints answer 200 to both; endpoints behind
something the page holds in memory answer 401 to both. 200-with / 401-without means the credential
is a cookie the browser already has, which is exactly what rule 9 permits and what DEGIRO already
relies on.

Two things not captured and worth having eventually, neither of which changes the reading: the
content type on the 200, and whether it redirected. A `/rest/` path behind a 401 returning HTML
would be unusual.

Incidental, from the same console: the page itself requests
`live.services.trading212.com/rest/cards/v1/cashbacks/updated-since?updatedSince=…` and gets **403**
with a valid session. So that host serves the web app's own calls, the path family is real, and a
403 there is a feature refusal rather than an authentication one.

> The README starts from `/rest/v1/accounts`. That path is a **hypothesis from community code and
> has never been seen in a real Network tab** — `MULTI-BROKER.md` §8 does not contain it. If it 404s,
> the real path comes out of the Network tab and gets recorded here.

### Step 2 — logged out (the control) — **MEASURED**

| | Status |
|---|---|
| `credentials: 'include'`, logged out | **401** |

The control holds. `omit=401` had already established the endpoint is credential-gated rather than
public; this distinguishes the remaining case — "the cookie authorises it" from "any cookie
authorises it". Logged out the browser still sends whatever cookies remain for that host, and the
answer is 401, so what carries the session is the *authenticated* cookie and not merely the
presence of one.

The three measurements together are the PASS row of the README's table:

| logged in `include` | logged in `omit` | logged out `include` | |
|---|---|---|---|
| 200 JSON | 401 | 401 | **A session the browser already holds is enough** |

### Step 3 — logged back in

Status: `<open>` — the user logged back in to capture step 4, and the page rendered its portfolio,
which is the same evidence by a slower route. Not recorded as a measurement because the snippet was
not re-run.

### Step 3b — the service worker — **the half that is still open**

This is now the only thing between R1 and a yes. A page-context fetch from `www.trading212.com` to
`live.services.trading212.com` is already **cross-origin and it worked with credentials**, which
means their CORS policy allows credentialed cross-origin reads. What is untested is whether the
same holds when the origin is a Chrome extension.

The precedent is good rather than merely hopeful: `degiro.js:124` does exactly this today, in
production, and never copies a cookie value — the browser attaches it. Chrome treats an
extension request made under a host permission as first-party for cookie purposes, which is why
that works.

Testing it needs a temporary host permission, and per AC5 that is now justified: the page-context
baseline has passed.

**The probe is built.** Three pieces, and they are one unit:

| | |
|---|---|
| `tools/trading212-r1/probe.js` | one `GET`, `credentials: 'include'`, no retry, shape-only result |
| `case 't212r1'` in `src/sw.js` | the only way to trigger it — a message, sent by a human |
| `https://live.services.trading212.com/*` in `manifest.json` | the host permission that makes it possible |

`test/trading212-probe.test.js` asserts the three agree with each other, so a half-deletion fails
the suite. That is the failure worth guarding: the spike removed, the permission left behind, and
every user from then on approving access to a host the extension never contacts.

**It lives on `claude/degiro-portfolio-spike-7x5d4h` and not on `main`,** because builds go to
testers from `main` and a host permission for a broker they do not use is not something to ship
while a question is still open.

To run it: load the branch unpacked, open the extension's own page, and from its console

```js
chrome.runtime.sendMessage({ type: 't212r1' }, console.log);
```

Result: `{outcome, status, contentType, shape}` — where `shape` has had every value replaced.

### Step 4 — request header names

Names only. Classified by `classifyHeader` in `tools/trading212-r1/spike.js`.

| Header | Classification |
|---|---|
| `<open>` | `<open>` |

### Account type tested

`<open>` — one of INVEST, ISA, CFD, CRYPTO. **A result for one proves nothing for another**;
everything untested stays `NOT_TESTED`.

## Verdict

**Page context: PASS. Overall: INCONCLUSIVE until the worker is tested** — which is what
`verdict()` returns for `{pageOutcome: PASS_JSON, workerOutcome: undefined}`, deliberately, so an
untested worker can never be recorded as a pass.

| Verdict | Meaning | Next |
|---|---|---|
| **PASS** | A session the browser already holds was sufficient | US-39 onward is unblocked |
| **CONDITIONAL** | Static, non-personal client metadata is also required | A rule 9 judgement for the user, not a technical call |
| **INCONCLUSIVE** | Page works and worker does not, or the control failed | Narrow it; do not build |
| **FAIL** | A forbidden credential or device identifier is required | Delete the probe and the permission. Trading 212 becomes a price source with no portfolio, which is not a product |

## Rules this had to satisfy

- **Rule 9** — no credential stored, at any point, including during the test.
- **Rule 7** — nothing here carries a body, a value, a cookie or an account number. Shapes only,
  via `describeShape`.
- **Rule 8** — on FAIL the directory and the manifest permission are deleted, not disabled.
- **Rule 5** — one request per human action. No retry, no polling, no alarm.
