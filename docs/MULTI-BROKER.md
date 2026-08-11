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
| The session is carried over a WebSocket **rather than** as a cookie | **Contradicted.** Dozens of ordinary XHRs to `api.traderepublic.com`, with the token in a header the page sets — see 2g |
| There is a device-pairing step producing a key pair, and requests are signed | Reported for the *mobile* API. Whether the *web* client does this is **unknown** |
| A logged-in web tab holds something an extension can read and replay | **Readable: yes** (2c). **Sendable: one test away** — the session is in a cookie and nothing in the request carries it, so it turns on whether an extension's fetch attaches it. See 2g |
| Historical daily closes are available per instrument | **Unknown.** R4 |
| The API reports an account total | **Unknown.** R5 |

**What must not happen:** writing an adapter against this table. The rows still marked unknown are
hypotheses, and two of them decide whether the story exists.

### 2c. First real observation — one probe run, 2026-08-11

`tools/r1-probe.js` on a logged-in `app.traderepublic.com` tab. Names, lengths and shapes only;
no value was read, transmitted or recorded, and none is recorded here.

**Cookies, readable from JavaScript** — which means **not** `HttpOnly`:

| Name | Length | Shape | Reading |
|---|---:|---|---|
| `tr_claims` | 843 | opaque token-like | **The candidate.** "Claims" is session vocabulary and 843 characters is the right order of magnitude for one |
| `tr_external_id` | 36 | uuid-like | An account or device identifier |
| `aws-waf-token` | 378 | uuid-like | See 2d — this is the finding that matters most |
| `_sp_id.a13a`, `_sp_ses.a13a` | 153, 1 | | Snowplow analytics. Irrelevant |
| `tr_locale`, `pro-trading_consent` | 2, 7 | | Preferences |

`localStorage` and `sessionStorage` hold feature flags, UI preferences, a Snowplow queue and
Grafana Faro telemetry — nothing session-shaped. Two entries are worth naming anyway:
`awswaf_session_storage` (658) and `awswaf_token_refresh_timestamp`, both from 2d, and
`idleLogoutPhoneNumber`, which is a phone number sitting in the page's own storage. **An adapter
must never copy `localStorage` wholesale into anything** — rule 7 applied before the code exists.

**What this does and does not establish.**

It establishes that the web client uses cookies at all, which the assumption above said it might
not. That is the difference between "same shape as DEGIRO" and "a rewrite of the transport", and
it lands on the good side.

It does **not** establish that `tr_claims` is what authenticates a request. A perfectly ordinary
design is a readable claims cookie for the UI *plus* an `HttpOnly` session cookie the probe cannot
see by construction. Either way the answer to R1 is likely yes — an extension can read HttpOnly
cookies through `chrome.cookies`, which is exactly how `JSESSIONID` is read today — but *which*
cookie matters for building anything.

**The `HttpOnly` question is answered: none of them are.** The Application panel lists exactly the
same seven cookies the console probe saw, and no row carries a flag in the `HttpOnly` column.
There is no hidden session cookie — whatever authenticates a request is among the seven above, and
`tr_claims` is the only one big enough to be it.

So **R1 is yes on the reading half**: an extension with a host permission can get at this, and it
does not even need `chrome.cookies` to do it.

### 2f. `SameSite` — asked, and answered *no longer a problem* by 2g

*Kept because the reasoning is right for the next broker, even though it turned out not to bite
here: 2g found the token in a header the page sets, so nothing depends on the browser attaching a
cookie by itself.*


`tr_claims` and `tr_external_id` show a different `SameSite` from the analytics cookies — the
column reads `S…` where Snowplow's read `Lax`, which is almost certainly `Strict`. That matters
for one specific reason, and it is a reason this project has never had to think about:

**DEGIRO does not send its session as a cookie.** `config.js` puts it in the URL —
`?sessionId=…` and `;jsessionid=…` — so `resolveSession` reads the cookie value with
`chrome.cookies` and *transcribes* it. `SameSite` is a rule about when a browser attaches a cookie
automatically, and nothing here relies on that happening.

Trade Republic may not offer the same escape. If its API only accepts the session as a cookie, and
that cookie is `SameSite=Strict`, then a request initiated by the extension's service worker — a
different site than `traderepublic.com` — would not carry it. `credentials: 'include'` does not
override `SameSite`, and `Cookie` is a forbidden header for `fetch` to set.

Three outcomes, and they are not equally likely:

| If the API accepts the token as | Then |
|---|---|
| an `Authorization` header, or a query parameter | **Fine.** Read `tr_claims`, transcribe it, exactly as DEGIRO's session is transcribed today |
| a cookie only, `SameSite=Lax` | Fine — a top-level-ish extension request still carries it |
| a cookie only, `SameSite=Strict` | **The one real obstacle found so far.** Attaching it would need `declarativeNetRequest` header rewriting, which is a heavier permission and a discussion rather than a default |

**One check settles it, and `tools/r1-headers-probe.js` does it without anyone reading a header
off a screen.** Paste it into the console of a logged-in tab, click around the app for a few
seconds, run `__r1report()`. It reports header *names* per request, plus the host and whether a
WebSocket opened — never a value, and long digit runs in a path are masked.

It cannot see headers the browser adds by itself (`Cookie`, `User-Agent`), and that is the finding
rather than a gap: an `authorization` in the output means the token travels in a header and can be
transcribed exactly as DEGIRO's session id is today; **no** auth header on requests reaching an API
host means the cookie is carrying it, and the table above decides what follows.

Worth noting what this is *not*: it is not a reason to reach for anything clever. Rule 9 is about
authenticating, and none of the three rows above involves logging in — but the third one does
involve making a request look more like the page's than it is, and that deserves a decision rather
than an implementation.

### 2g. What the requests actually carry — three readings, and only the third is evidence

Three probe runs, in order, because the wrong two are the useful part of this section.

| Run | Caught | Concluded | Verdict |
|---|---|---|---|
| 1 | nothing yet | — | — |
| 2 | an `app-version.txt` poll and a telemetry beacon | *"the data probably arrives over a WebSocket"* | **wrong**, from two rows neither of which was data |
| 3 | 69 XHRs to `api.traderepublic.com` | *"an auth header is set, the token is transcribable"* | **wrong**, and this one was the tool's fault |

**Run 3, read properly.** The headers the page sets on `api.traderepublic.com` are exactly:

```
accept   accept-language   content-type   x-aws-waf-token   x-tr-platform
```

There is **no `authorization`, and no session header of any kind.** `x-aws-waf-token` is the AWS
WAF bot-challenge token and `x-tr-platform` identifies the client as web. The probe's pattern was
`x-.*token`, which matched the WAF token and announced an auth header that does not exist — a
pattern loose enough to catch any scheme is loose enough to catch something else, and this is the
kind of wrong answer that gets a broker declared compatible. Tightened.

#### So what is observed, stated separately from what is inferred

**Observed:**

- Dozens of ordinary XHRs to `api.traderepublic.com`, on `/api`, `/api-gateway` and
  `/web-trading-gateway`. Not a WebSocket-only API — run 2's conclusion stays retracted.
- Every one of them with `credentials: include`.
- The page sets no authentication header.
- `tr_claims` (843 chars) and `aws-waf-token` (378) are cookies, neither `HttpOnly` (2c).
- `tr_claims` shows a `SameSite` the Application panel renders as `S…` where the analytics cookies
  render `Lax`. **Probable `Strict`, not confirmed.**

**Inferred, and it is an inference:** nothing else in the request can be carrying the session, so
the cookie is. Which puts 2f back on the table rather than settling it.

#### The one question left, and it is cheaper to test than to reason about

Does a `fetch` from an extension service worker, holding a host permission for
`api.traderepublic.com`, carry that cookie?

Chrome's treatment of extension-initiated requests under `SameSite` is not something this document
should assert from memory — three wrong calls in one day is the argument for not trying a fourth.
It is **directly testable, and cheaply**: a throwaway unpacked extension with that host permission,
one `fetch` to one endpoint, and look at whether it comes back as data or as a 401. An afternoon,
and it answers with a fact instead of a recollection.

Two outcomes:

- **The cookie goes** — the adapter is ordinary. Read `aws-waf-token` from the cookie jar, set
  `x-aws-waf-token` and `x-tr-platform` by hand (both are settable; only `Cookie` is forbidden),
  and the session rides along.
- **The cookie does not go** — then attaching it needs `declarativeNetRequest` header rewriting.
  That is a heavier permission and a decision for the person whose extension it is, not a detail
  for whoever is implementing. Bring it back rather than build it.

Either way `x-aws-waf-token` has to be set from the cookie, and it is refreshed by a challenge the
page solves — so 2d's *scheduling* conclusion survives its retracted risk assessment: sync while a
tab is open and the token is fresh, not on an hourly alarm.

### 2d. AWS WAF is in front of this API — a scheduling constraint, not a safety cliff

`aws-waf-token`, `awswaf_session_storage` and `awswaf_token_refresh_timestamp` say Trade Republic
runs AWS WAF's bot-control challenge in front of the web client. DEGIRO has nothing like it in
the path.

**Calibrating this correctly matters, because the first draft of this section overstated it** and
an overstated risk gets a story dropped for the wrong reason.

What is true:

- WAF's token is **refreshed by a JavaScript challenge the page solves**. A service worker is not
  running that page, so it inherits a token it cannot renew. When it expires the answer is a
  challenge or a block rather than a clean 401.
- Reproducing the challenge is out. It is indistinguishable in kind from defeating a bot check,
  and rule 9 closes that door already.

What is **not** true, and was claimed here before:

- *"A wrong move gets the account locked."* It does not. **WAF blocks requests; it does not lock
  accounts.** Account lockouts come from failed authentication attempts, and this extension never
  authenticates — so the mechanism that produces a lockout is one we cannot reach. Those two were
  run together in one paragraph; they are separate things.
- *"Automated traffic will be detected."* A sync is a burst of a few dozen requests at 1,1 s
  intervals, from **Chrome itself**, with the browser's own TLS fingerprint and headers, carrying
  the same cookie the page carries. That is a great deal closer to ordinary browsing than to the
  scripted traffic WAF is aimed at, and no persistent connection is involved.

So the real consequence is about **when**, not whether: the WAF token has to be one the page has
recently refreshed, which means syncing **while a Trade Republic tab is open and the user is
present** rather than on a schedule. Closer to the existing opportunistic `chrome.tabs.onUpdated`
sync than to the hourly alarm — the same conclusion 2e reaches from a different direction.

And a clean failure is available: on a WAF challenge, one failure, no retry, and *"open Trade
Republic and press Sync again"* on screen. That is an ordinary error path, not an incident.

### 2e. The session almost certainly expires quickly

`lastActivityAt`, `lastActive` and `idleLogoutPhoneNumber` in `localStorage` describe an idle
logout. DEGIRO's cookie survives long enough that an hourly alarm usually finds a live session;
if Trade Republic logs out after minutes of inactivity, **the hourly sync would fail nearly every
time**, and the honest design is not to have one.

Not a blocker, but it changes what the feature *is*: a broker that syncs when you visit it, rather
than one that quietly keeps itself up to date. That belongs in US-10's acceptance criteria and on
the page, not as a surprise for whoever installs it.

### 2b. The rate-limit posture is different, and it is the risk that is not about code

**Partly retracted by 2c and 2d — read those first.** This section was written before the probe
ran, on the assumption that Trade Republic's session was device-bound and signed. It is not
obviously either: the web client uses cookies. The lockout scenario below therefore describes a
design we have no evidence of, and the calibrated version is in 2d.

What survives, and is worth keeping whatever the broker turns out to be:

- one throttle queue for this broker alone (US-22 §E), and
- **no retry on any authentication-shaped failure**, not even the first — rule 5 already forbids
  retrying 401/403, and a broker whose auth we understand less well is not the place to soften it.

What does not survive: the claim that a wrong move gets the account locked. That is what a *failed
login* does, and rule 9 means this extension never makes one.

---

## 3. How the spike gets run

Half a day, and the output is this document with the *Status* column rewritten. In order, stopping
at the first "no":

1. **R1** — the protocol below. → *Answer: yes / no / yes-but-signed.*
2. **R4 before R2.** Deliberately out of order: if there is no backwards price history, the story
   is dead regardless of how good the ledger is, and R4 is the cheaper thing to look at.
3. **R2 and R3.** Export or capture a ledger. Do the rows carry a settled base-currency amount
   (R2)? Write down the **distinct set of cash descriptions** — that is the raw material for the
   broker's `classify` table, and the count of distinct wordings is a direct estimate of the work.
4. **R5.** Is there a current total, and does it mean the same thing as DEGIRO's `netliq`?

**Rule 7 applies to the spike itself.** The capture is a real account. Nothing from it enters
`test/`; fixtures are built synthetically from the observed *shapes*, exactly as
`tools/make-fixtures.mjs` does today. Findings name the broker and the account, never a person.

### 3b. The R1 protocol, exactly

Five minutes in a browser. It answers the only question that decides whether US-10 exists, and it
is written out step by step because **the obvious way to report the answer leaks the session.**

> **Never paste, screenshot or send the value of anything found below.** A session token is a live
> credential: anyone holding it is logged into the account until it expires. What is needed is
> *whether* something is there, *what it is called* and *roughly how long it is* — never what it
> says. This is the same rule that makes the connection check report a cookie's length and not
> its contents, and the same shape of mistake as the 0.10.0 export.

1. Log in to the Trade Republic web client as normal, and open the portfolio.
2. **F12 → Application** (Chrome) / **Storage** (Firefox).
3. **Cookies**, the entry for the app's own domain. Write down: how many there are, and their
   *names*. Values: only the length, and only for anything whose name suggests a session.
4. **Local storage** and **Session storage** for the same domain. Same again: names only, plus a
   length and a rough shape for anything session-like — *"looks like a JWT: three
   dot-separated chunks"* is exactly the right amount of detail, and its contents are not.
5. **F12 → Network → Fetch/XHR.** Reload the page. Are there ordinary HTTPS requests to an API
   host, or is the list essentially empty?
6. **Network → WS.** Is there a WebSocket? Click it → **Messages**. Do not copy the messages;
   just note whether the first one looks like a handshake carrying a token.
7. If there *is* a plain HTTPS request: click one → **Headers → Request Headers**. Is there an
   `Authorization` header, or is the cookie doing the work? Name of the header only.

**What each outcome means:**

| What you find | R1 | What follows |
|---|---|---|
| A cookie the browser sends automatically, on ordinary HTTPS requests | **yes** | Same shape as DEGIRO. Continue to R4 |
| A token in local storage, used as an `Authorization` header | **yes, probably** | An extension can read local storage on a granted host. Continue, but the token is a credential the extension must never store — read per request, exactly as the cookie is today |
| Everything on a WebSocket, opened with a token from storage | **yes, but harder** | The transport is a rewrite of `degiro.js`, and the throttle has to be re-thought for a socket. Worth continuing only if R4 also says yes |
| Nothing in storage; the session only exists after a PIN entered in the page | **no** | **Stop.** See §7 and the project rule — the extension does not log in |
| Requests carry a signature the page computes from a device key | **no, for now** | Replaying it means reproducing their signing, and a wrong attempt looks like an unknown device authenticating. Bring this back to a decision rather than building it |

Report it as prose. *"Two cookies, neither looks like a session; one local-storage key called
`…state`, about 900 characters, three dot-separated chunks; no Fetch/XHR at all, one WebSocket"*
is a complete answer to R1 and contains nothing dangerous.

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
- **B7** The adapter starts at **none** for every instrument type in the coverage matrix
  (`docs/LIMITATIONS.md`) and earns each level itself. It does not inherit DEGIRO's rows —
  the arithmetic is shared, the field names are not, and it is the field names that fail
  quietly. See US-26.

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
  tab. → **Drop US-10.** Not "revisit with a login form" — CLAUDE.md rule 9 makes this a product
  promise rather than a trade-off, so a "no" here is final and the correct outcome of the spike is
  closing the story. US-22 to US-24 keep their value regardless, because a third broker may answer
  differently.
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
