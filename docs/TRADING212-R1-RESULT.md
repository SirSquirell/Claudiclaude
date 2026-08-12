# Trading 212 R1 — result

**Status: page context MEASURED 2026-08-12 — the cookie carries the session.** The service-worker
half is still open. `tools/trading212-r1/README.md` has the steps.

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

### Step 2 — logged out (the control) — **largely covered by step 1**

| | Status |
|---|---|
| `credentials: 'include'`, logged out | `<open>` |

The `omit=401` result already establishes the endpoint is credential-gated rather than public,
which is what this control exists to rule out. Running it logged out is still worth ten seconds —
it distinguishes "the cookie authorises it" from "any cookie authorises it" — but it can no longer
change the verdict on its own.

### Step 3 — logged back in

Status: `<open>`

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
