# Multi-broker — compatibility study, acceptance criteria and test cases

**Status: research. No code, no behaviour change.** Everything here is either arithmetic that can
be checked on paper, or a question with a written method for answering it. Nothing is a finding
until a real capture says so — the distinction `docs/ENDPOINT-REPORT.md` already draws for
DEGIRO, applied to a broker nobody here has ever synced.

The architecture and the user stories are US-22 to US-24 in `docs/BACKLOG.md`. This document is
the layer underneath them: **can it be done at all, how would we know it works, and what breaks
first.**

---

## 1. What a broker must be able to answer

Not "what would be nice". These four are what the reconstruction is made of, and each one has a
way of being absent that kills the whole thing rather than degrading it.

| # | Requirement | Why it is load-bearing | What absence does |
|---|---|---|---|
| R1 | **A replayable session, from a browser the user already logged into** | The project's central promise: no password, no credential stored, nothing to phish. `README.md` says so in the first line of "Where the data comes from" | Not "harder" — **a different product**, one that asks for credentials. Stop here |
| R2 | **A transaction ledger** with date, instrument, signed quantity, price, currency **and what settled in the base currency** | The settled amount is what FX rates and contract sizes are *measured* from. `deriveFxRates` divides one by the other | FX and contract size become guesses. On a foreign holding, every historical valuation is then a guess |
| R3 | **A cash ledger with descriptions** | `classify.js` turns a description into a category, and rule 3 says only `DEPOSIT`/`WITHDRAWAL` are external | Without categories, a dividend is indistinguishable from a deposit, and **a deposit counted as a gain fabricates profit**. This is the failure the whole project exists to prevent |
| R4 | **A daily price series per instrument, backwards** | The history is reconstructed by valuing yesterday's positions at yesterday's close | Live quotes only ⇒ no history ⇒ no product |
| R5 | **The broker's own current total** | SPEC §6 makes it the acceptance test of everything | No check. A plausible wrong chart, silently. Shippable only with the limitation stated in red, as US-10 already requires |

R1 is a gate. R2–R5 are gates too, but they can each be answered from one capture, where R1 needs
a decision about what the product is.

---

## 2. Trade Republic — what is known, and what is assumed

**Read the second column before quoting anything from this table.** This project has been burned
once by a fixture set that reproduced *shapes* nobody had verified, and `docs/ENDPOINT-REPORT.md`
exists because of it.

| Claim | Status |
|---|---|
| Trade Republic is app-first; the web client is the newer surface | Widely reported, low risk, still unverified here |
| Authentication is phone number + PIN, then a second factor | Widely reported. **Unverified** |
| The session is carried over a WebSocket rather than as a cookie on REST calls | Reported by third-party clients. **Unverified, and it is the single most important claim in this table** |
| There is a device-pairing step producing a key pair, and requests are signed | Reported for the *mobile* API. Whether the *web* client does this is **unknown** |
| A logged-in web tab holds something an extension can read and replay | **Unknown. This is the R1 question and nothing else can be planned until it is answered** |
| Historical daily closes are available per instrument | **Unknown.** R4 |
| The API reports an account total | **Unknown.** R5 |

**What must not happen:** writing an adapter against this table. Every row above is a hypothesis,
and three of them are the ones that decide whether the story exists.

### 2b. The rate-limit posture is different, and it is the risk that is not about code

DEGIRO hands the browser a cookie and accepts it on ordinary requests; a wrong move looks like a
misbehaving browser. If Trade Republic's session is device-bound and signed, **a wrong move looks
like an unrecognised device authenticating** — which is the shape of an attack, and brokers
respond to that shape by locking the account rather than by returning 401.

CLAUDE.md rule 5 already says rate limits are an account-safety issue and forbids retrying
401/403. For Trade Republic that rule needs to be *stricter*, not merely inherited:

- one queue for this broker alone (US-22 §E), and
- **no retry on any authentication-shaped failure at all**, not even the first, and
- the spike is run against an account whose owner has been told it may get locked.

That last point is not paperwork. It is the difference between a spike and an incident.

---

## 3. How the spike gets run

Half a day, and the output is this document with the *Status* column rewritten. In order, stopping
at the first "no":

1. **R1.** Log in to the Trade Republic web client. DevTools → Application: is there a cookie, a
   `localStorage` entry or a token an extension with `cookies` + `host_permissions` could read?
   Network: is there any plain HTTPS request carrying it, or is everything on the socket?
   → *Answer: yes / no / yes-but-signed.*
2. **R4 before R2.** Deliberately out of order: if there is no backwards price history, the story
   is dead regardless of how good the ledger is, and R4 is the cheaper thing to look at.
3. **R2 and R3.** Export or capture a ledger. Do the rows carry a settled base-currency amount
   (R2)? Write down the **distinct set of cash descriptions** — that is the raw material for the
   broker's `classify` table, and the count of distinct wordings is a direct estimate of the work.
4. **R5.** Is there a current total, and does it mean the same thing as DEGIRO's `netliq`?

**Rule 7 applies to the spike itself.** The capture is a real account. Nothing from it enters
`test/`; fixtures are built synthetically from the observed *shapes*, exactly as
`tools/make-fixtures.mjs` does today. Findings name the broker and the account, never a person.

---

## 4. Acceptance criteria

Split by what they depend on, because the first group can be satisfied **before Trade Republic
exists** and is the honest measure of "multi-broker ready".

### A. Structural — no second broker required

These are testable today, with DEGIRO as the only adapter and a second synthetic broker built
from the existing fixtures.

- **A1** `engine.js` is byte-for-byte unchanged by the whole of US-22.
- **A2** Per-broker-then-sum equals combined, to the cent, for `value`, `netExternal` and `pnl`.
- **A3** A cross-broker transfer produces zero combined P/L on both the withdrawal day and the
  deposit day, and no `TRANSFER` category exists anywhere in the codebase.
- **A4** Combined return is computed on the combined series. A test fails if two brokers'
  percentages are averaged.
- **A5** Filtering the combined view to one broker reproduces that broker's single-broker numbers
  exactly.
- **A6** Reconciliation is per broker. The combined view reports the **weakest** status among its
  parts and names the broker responsible.
- **A7** Unclassified cash rows are counted and surfaced per broker.
- **A8** Two brokers issuing the same product id do not collide in storage.
- **A9** Instruments merge on ISIN; one without an ISIN stays separate and says so.
- **A10** Syncing or wiping one broker does not touch another's rows, and the wipe-during-sync
  race is tested per broker.
- **A11** One connected broker is indistinguishable from today — no submenu for a choice of one.
- **A12** Export and bug report carry a broker dimension and stay default-deny (rule 7).
- **A13** Each broker has its own throttle queue, and two brokers do not sync concurrently.

### B. Broker-specific — required of any adapter, including a second one

- **B1** R1 answered in writing, with the answer in this document rather than in a commit message.
- **B2** The adapter supplies all of R2–R5, or the gap is stated on the page in the same red the
  DEGIRO reconciliation failure uses.
- **B3** Its `classify` table is its own, and an unmatched description is `UNKNOWN` — never
  defaulted to `DEPOSIT` (rule 3).
- **B4** No retry on any authentication-shaped failure.
- **B5** `npm run audit` passes against a real export from that broker.
- **B6** Fixtures are synthetic. No value from a real account appears in `test/`.

---

## 5. Test cases

`Now` = writable against synthetic fixtures before any second broker exists. `Capture` = needs a
real Trade Republic session.

### The arithmetic — these are the ones that would catch a wrong architecture

| # | Case | Expected | When |
|---|---|---|---|
| T1 | Split one fixture account's rows into two synthetic brokers by product; run per broker and sum | `value`, `netExternal`, `pnl` identical to running the engine once on all rows | Now |
| T2 | Broker A withdraws €10 000 on day *d*; broker B deposits €10 000 on day *d+2* | combined `pnl[d] == 0` and `pnl[d+2] == 0` | Now |
| T3 | Same as T2 | combined `value` **dips** for days *d*…*d+1* | Now |
| T4 | A gains 10 % while B loses 10 %, with different balances | combined return is the value-weighted result on the combined series, **not** 0 % | Now |
| T5 | Two brokers, both holding ASML, same ISIN, different product ids | one combined holding of the summed quantity; two rows when filtered | Now |
| T6 | Two brokers issue the same numeric product id for different instruments | two distinct holdings; neither overwrites the other | Now |
| T7 | An instrument with no ISIN at two brokers | stays two holdings, and says why | Now |
| T8 | Filter to broker A only | every figure equals the single-broker run, to the cent | Now |
| T9 | Broker A reconciles, broker B has no anchor | combined status is *unverified*, and names B | Now |
| T10 | Broker B has 4 unclassified cash rows, A has none | A reports 0 and B reports 4; neither is hidden in a combined count | Now |

### Sync, wipe and failure

| # | Case | Expected | When |
|---|---|---|---|
| T11 | Sync A while B's session has expired | A completes; B reports expiry against B's row; no retry on B | Now |
| T12 | Wipe B while A is mid-sync | B's rows go, A's run completes untouched, A's rows survive | Now |
| T13 | Wipe A while A is mid-sync | the wipe waits for A's run — the 0.19.0 race, per broker | Now |
| T14 | Two brokers connected, "Sync now" pressed once | they run one after another, never concurrently | Now |
| T15 | Worker killed mid-sync of B | A's data intact; B resumes from its own checkpoint | Now |
| T16 | Storage upgraded from the single-broker schema | announced wipe and resync; no silent partial migration | Now |

### The adapter, against a real broker

| # | Case | Expected | When |
|---|---|---|---|
| T17 | Session resolved from a logged-in tab only | works with no credential entered anywhere | Capture |
| T18 | A transaction in a foreign currency | settled base-currency amount present; derived rate within tolerance of the published rate that day | Capture |
| T19 | Every distinct cash description in the capture | each maps to a category or is `UNKNOWN` and counted. **Zero silent classifications** | Capture |
| T20 | Daily closes for a held instrument, backwards to first purchase | a complete series, or the instrument is flagged as it is today | Capture |
| T21 | Reconstructed total vs the broker's own | equal to the cent, or red | Capture |
| T22 | A deliberately wrong session | one failure, no retry, no lockout | Capture |

### Egress — rule 7, which now has a second thing to leak

| # | Case | Expected | When |
|---|---|---|---|
| T23 | Bug report from a two-broker install | broker ids and counts present; no amounts, no instrument names, no account numbers | Now |
| T24 | A new meta key added for the second broker | the classification test fails until somebody classifies it | Now |
| T25 | Export from a two-broker install | only declared fields; a second broker's session token is not one of them | Now |

**T24 is the one that matters most.** Every leak this project has had was a field nobody decided
about, and a second broker is a second set of fields arriving at once.

---

## 6. What would make us stop

Written down now, while it is cheap to agree to:

- **R1 is "no".** The extension cannot reach a Trade Republic session read-only from a logged-in
  tab. → Drop US-10. Do not build a credential form. US-22 to US-24 keep their value regardless,
  because a third broker may answer differently.
- **R4 is "no".** No backwards daily history. → Drop it; there is no chart to draw.
- **R3 is "partly".** Descriptions exist but are ambiguous. → Buildable, but every ambiguous
  wording is `UNKNOWN` and visible, and the story ships with an honest count rather than a
  guess.
- **R5 is "no".** No account total. → Buildable, with the missing check stated in red on the page.
  That is the same treatment two DEGIRO accounts already get today.

---

## 7. Two accounts at the same broker — why it stays out, and the correction

It is out of scope. The reason usually given is "we have no login system", and that is *close to*
right rather than right, which is worth recording so nobody re-derives the wrong version later.

- The real constraint is that this extension replays **the session the browser already has**, and
  a browser profile holds one logged-in DEGIRO session at a time. A second account under a
  second login would need a stored credential, which the README promises never to happen. That
  part is settled.
- **But a second account does not necessarily need a second login.** DEGIRO identifies an account
  by `intAccount`, and one client login can cover more than one account number — a joint account
  alongside a personal one, for instance. In that case both are reachable with the session
  already in the browser, and the blocker is not authentication at all: it is simply that
  `session.js` reads one `intAccount` and everything downstream assumes it.

So the honest statement is: **two logins is out; two `intAccount`s under one login has never been
looked at.** It is plausibly much cheaper than multi-broker, since it needs no new adapter, no new
classify table and no new price source — the same shape as US-22's per-broker split, with an
account id instead of a broker id. Worth a spike of its own **after** US-22, because US-22's
structure is the thing that would make it nearly free.
