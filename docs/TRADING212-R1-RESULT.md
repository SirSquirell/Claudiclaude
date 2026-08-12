# Trading 212 R1 — result

**Status: NOT YET RUN.** Everything below marked `<open>` needs a human with a Trading 212 login.
Ten minutes; `tools/trading212-r1/README.md` has the steps.

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

### Step 1 — logged in

| | Status | Content-Type | Redirected |
|---|---|---|---|
| `credentials: 'include'` | `<open>` | `<open>` | `<open>` |
| `credentials: 'omit'` | `<open>` | `<open>` | `<open>` |

Endpoint actually used: `<open>`

> The README starts from `/rest/v1/accounts`. That path is a **hypothesis from community code and
> has never been seen in a real Network tab** — `MULTI-BROKER.md` §8 does not contain it. If it 404s,
> the real path comes out of the Network tab and gets recorded here.

### Step 2 — logged out (the control)

| | Status | Content-Type |
|---|---|---|
| `credentials: 'include'` | `<open>` | `<open>` |

**Not optional.** An endpoint that answers the same logged out is not account data, and step 1
alone would read as a pass.

### Step 3 — logged back in

Status: `<open>`

### Step 4 — request header names

Names only. Classified by `classifyHeader` in `tools/trading212-r1/spike.js`.

| Header | Classification |
|---|---|
| `<open>` | `<open>` |

### Account type tested

`<open>` — one of INVEST, ISA, CFD, CRYPTO. **A result for one proves nothing for another**;
everything untested stays `NOT_TESTED`.

## Verdict

`<open>` — computed by `verdict()`, not decided by hand.

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
