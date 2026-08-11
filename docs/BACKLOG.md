# Backlog 0.10.0 — refinement

Refinement of the user stories in *Claudiclaude — Portfolio & Options User Stories v2*,
against the account export `degiro-portfolio-2026-08-08.json` (first account, 1 457 transactions,
8 088 cash movements, 303 products, 181 price series).

This document does not describe a solution. It records what the data proves, what is still
an assumption, and what each story needs before it can be built. Where it disagrees with
the story document, it says so and shows the number it disagrees with.

Status: **refinement**, nothing implemented.

**Where things stand is in [STATUS.md](STATUS.md)** — one page. This file is the reasoning
and the evidence behind it.

---

## 1. What the export proves

Three reported problems turn out to be one defect with three faces.

### 1.1 The contract multiplier is missing

An option contract is not one share. Its value is
`quantity × price × contractSize × fx`, and `contractSize` is nowhere in this codebase —
`parse.js` never reads it, `engine.js` never applies it. Every option is valued as if one
contract were one share.

DEGIRO's own portfolio page, next to ours, for the same positions on the same day:

| Contract | Qty | Price | DEGIRO's value | qty × price | implied `mult × fx` |
|---|---:|---:|---:|---:|---:|
| ADY P900.00 20DEC30 | −4 | € 279,73 | −11 189,20 | −1 118,92 | **10** |
| ADY P1400.00 20DEC30 | −1 | € 619,53 | −6 195,30 | −619,53 | **10** |
| WKL P70.00 17DEC27 | −2 | € 12,95 | −2 590,00 | −25,90 | **100** |
| BMW P56.00 18DEC26 | −1 | € 2,43 | −243,00 | −2,43 | **100** |
| RND P38.81 15DEC28 | −1 | € 7,71 | −794,13 | −7,71 | **103** |
| EVO P600.000000 18JUN27 | −1 | SEK 29,20 | −265,75 | −29,20 | 9,1010 (= 100 × 0,09101) |
| BETSB P100.000000 18DEC26 | −5 | SEK 19,00 | −864,60 | −95,00 | 9,1011 (= 100 × 0,09101) |

Confirmed independently against `liveSnapshot`, where DEGIRO states a `value` per position:
26 open option positions resolve to **×10 (7), ×100 (19), ×103 (1)**; all 18 stock positions
resolve to ×1.

**`RND P38.81 15DEC28` is the story in one row.** A multiplier of 103 with a strike of 38,81
is a contract adjusted for a corporate action. It cannot be derived from the exchange, the
underlying, or any rule. It is per-contract data and must be measured, never assumed.

Sized against DEGIRO's own numbers: positions valued our way come to **€ 166 936,93** where
DEGIRO reports **€ 115 553,37**. The screenshot's red banner — *off by +€ 39 758,03* — is
this defect, plus the cash leg.

### 1.2 The missing multiplier corrupts the exchange rates

`deriveFxRates` reads every transaction as `|totalBase − fee| / |price × quantity|` and calls
the result an exchange rate. For a stock that is true. For an option the same ratio is
`contractSize × rate`, roughly a hundred times larger.

Where option trades outnumber stock trades in a currency, the median lands on the option
cluster, and the outlier filter (`median/3 … median×3`) then discards the *correct*
observations as noise. Running the real `deriveFxRates` over this export:

| Currency | Derived | Correct | | Observations kept / dropped |
|---|---:|---:|---|---|
| CHF | **107,1** | ~1,07 | **×100 too high** | 24 / 0 — every CHF trade is an option |
| DKK | **13,39** | 0,13389 | **×100 too high** | 26 / 9 — the 9 dropped are the stock trades |
| SEK | 0,09254 | 0,09132 | ok | 24 / 20 — the option trades were correctly dropped |
| USD | 0,86 | 0,86 | ok | 339 / 0 |
| CAD, GBX, HKD | ok | | | |

DKK is the currency named in US-04. This is the mechanism.

### 1.3 The €1,15 million spike is the DKK rate

Peak of the reconstructed history: **2026-01-16, € 1 153 124,30**. On that day a single
position accounts for € 1 040 993,75 — *Novo Nordisk A/S Class B*, denominated in **DKK**.
Divided by the factor-100 rate error: ≈ € 10 410, an ordinary position.

So the causal chain is one defect:

```
no contract multiplier
   ├─ option positions valued 10–100× too small ──► reconciliation off by +€39 758
   └─ option trades pollute the FX derivation
         ├─ DKK rate ×100 ──► the €1,15M spike in the value chart
         └─ CHF rate ×100 ──► every CHF position wrong throughout the history
```

Fixing the multiplier is a prerequisite for fixing the currencies. **That inverts the phasing
in the story document** — see §4.

### 1.4 GBP is counted 1:1, and the fix is already in the data

28 cash movements are in **GBP**; zero transactions are. The rate therefore has no
observation and stays at 1,0, which the UI reports in red. But 14 transactions are in
**GBX** (pence) at 0,01174 — the same currency at 1/100. GBP is derivable as GBX × 100.

### 1.5 Option history cannot be fully reconstructed, and we should say so

Of 169 option products, **82 have no price series** (of the 119 instruments the UI reports
as having no price history: 82 options, 33 stocks, 3 ETFs, 1 warrant). Options that have
expired are not carried by the charting service.

Today's total can be made exact. The *history* of an options account cannot be, unless
expiry is modelled — an option is worth zero after its expiration date, and the date is
in the contract name (`P70.00 17DEC27`). Whether we parse that, or find it in the product
data, is an open question (§3, US-03).

This must be stated in the story. Promising a correct historical chart for an options
account is promising something the available data does not support.

### 1.6 The ledger and the classifier are clean — two suspicions ruled out

Both answered from the export, and both came back negative. Recorded because a negative
result here is what keeps the sprint small.

**B2 — expiring options do produce closing transactions.** Of 169 option products ever traded,
every one that DEGIRO no longer reports has a net quantity of **exactly zero** in our ledger.
Zero phantom positions, options or otherwise, against 27 still-open option positions. So expiry,
assignment and exercise all settle through the transaction feed and the position ledger is
correct. Option *quantities* over time are reconstructible; only the *price* between trades is
estimated for the 82 products with no series, and that is already flagged.

**B5 — a written premium is not booked as external cashflow.** All 8 088 cash movements
classify; **not one is `UNKNOWN`**. Every row attached to an option product lands in `TRADE`
(370), `FEE` (364) or `FX` (150) — all `external: false`. Nothing option-related reaches
`DEPOSIT` or `WITHDRAWAL`.

So the first account's total is too high by the contract multiplier and by nothing else. There is no second
defect hiding behind it.

### 1.7 We persist parsed products, not raw responses

`sync.js:338` stores `parseProducts(...)` output. Every field the parser does not pick is
discarded before it reaches disk — which is why a 50 MB export cannot answer whether DEGIRO
returns `contractSize`.

This contradicts CLAUDE.md rule 2, *"Only raw API responses are persisted truth"*. Worth
noting that had the rule been followed, this refinement would have taken one query instead
of an inference chain.

---

## 2. Verdict per story

| Story | Verdict |
|---|---|
| US-01 Codebase review & dynamic data | **Not a story.** A spike, or a standing rule. See §3. |
| US-02 Correct portfolio valuation | **Confirmed**, root cause found (§1.1). Acceptance test is reconciliation = 0. |
| US-03 Calls & puts | **Confirmed and split.** Valuation is sprint work; expiry/assignment/margin is not. |
| US-04 Currency conversion | **Confirmed**, root cause found (§1.2). DKK and CHF, not just DKK. Plus GBP (§1.4). |
| US-05 Negative positions | **Mostly dissolves into US-03.** One open question remains. See §3. |
| US-06 Graph slicers | **Confirmed.** "Results per" drives 2 of 8 charts. See §3. |
| US-07 Options & margin tab | **Valid, next sprint.** Depends on US-03 landing first. |
| US-08 Compare arbitrary months | **New, in scope.** Three decisions first. See §3. |

---

## 3. What each story still needs

### US-01 — Codebase review & dynamic data architecture

**This cannot be a story in this sprint.** It produces no user-visible change, so it can never
satisfy the DoD items *"gebruikers hebben de wijziging zelf getest"* and *"expliciet akkoord
bevonden"*. It is either a spike with a written outcome, or — better — a standing rule in
CLAUDE.md that every story is checked against.

**One requirement must be narrowed before it is accepted.** The story asks to hunt for
hardcoded *"dates, API endpoints, IDs, thresholds en business rules"*. Thresholds must stay
hardcoded. `TRUST_BAND [0.5, 2]`, `MAX_FACTOR_SPREAD 5`, `IMPLAUSIBLE_MULTIPLE 20` and
`STALE_PRICE_DAYS 10` are not lazy constants; they are the guardrails that catch the measured
values when those go wrong. Derive a threshold from the same data it is meant to police and
it can never fire again — which is how a €429 million chart passed review once already.

The distinction to write into the story: **measurements are dynamic, limits are fixed and
reviewed by a human.**

*Needed:* agreement on that distinction, and a decision whether US-01 becomes a spike or a rule.

### US-02 — Correct portfolio valuation

Root cause is established. What is still open is one decision:

- **How is the multiplier obtained?** Two independent sources exist in the data — `liveSnapshot`
  (exact, but only for the 26 currently open positions) and the transaction ledger (all 169
  option products, but entangled with the exchange rate at the trade date). They agree where
  both exist, which makes a cross-check possible in the same shape as the existing split-factor
  audit.
- **What happens to an option with neither source?** Per CLAUDE.md rule 4: flag it, do not guess.

**B6 — rounding policy. Decided, no user input needed.**

Measure the multiplier per product. If the measurement falls within a fixed tolerance of a whole
number, take the whole number. If it does not, do not guess: flag the instrument and say so in the
UI, exactly as an unrecognised cash row is handled.

The reasoning is that a contract size is a whole number by definition — it is a count of shares per
contract. So `99,7` is measurement noise from a snapshot price a few seconds stale, and `103` is
real. A measurement landing on, say, `87,3` is neither, and that is precisely the case where
rounding would manufacture a plausible wrong number. Rounding is not a hardcoded value; it is the
use of a structural fact. No contract size is ever written into the source.

The tolerance itself **is** a threshold, so per §3/US-01 it is a fixed constant in `config.js`,
reviewed by a human, and explicitly not derived from the data it polices.

*Needed from you:* nothing. Overrule it if you disagree.

### US-03 — Calls & puts

The options tester's note — *"voor puts kunnen we uitgaan van dagwaarde om de portfolio waarde te bepalen"* —
is the right model and is what the engine already does for stocks. With the multiplier applied it
extends to options unchanged.

His other note — *"als je een put optie schrijft, krijg je een − bedrag als cash op je portfolio
die wordt nu niet goed afgetrokken van de portfolio waarde"* — is a correct observation with a
different cause than he assumes. The total is indeed too high, by € 39 758,03, but not because
the premium is booked wrongly: because the liability it creates is valued at 1/10th to 1/100th of
its size. Worth confirming with him, because if he is *also* seeing a premium booked as external
cashflow, that is a second and separate defect.

**Split this story.** In scope for 0.10.0: valuation of long and short options, including the
multiplier, the currency, and the sign. Out of scope: expiry, assignment, exercise, and margin.
Those need answers we do not have:

- **Expiry.** Our position ledger is built from transactions. Does an expiring option generate a
  closing transaction, or does the position simply vanish from `/update`? If it vanishes, our
  ledger holds it at its last price forever. *This is a testable question against the export and
  I can answer it — but it is a day of work, not a five-minute check.*
- **Assignment and exercise.** Same question, plus the resulting stock position.
- **Margin.** `/update` may report margin fields we do not parse. Unknown until we look at a raw
  response.

*Needed:* confirmation from the tester on the premium question, and agreement on the split. The reference
data the story asks for has now been supplied and is sufficient for the in-scope half.

### US-04 — Currency conversion

Root cause established (§1.2). Two decisions:

- **GBX and GBP as one currency.** Derivable (§1.4), and it removes a red warning. Confirm this is
  wanted rather than treating them as separate.
- **Sparse-rate honesty.** Between two trades in a currency the rate is linearly interpolated, and
  outside the last trade it is held flat. A currency traded once has one flat rate for the whole
  history. Nothing warns about this today, while a stale *price* is flagged after
  `STALE_PRICE_DAYS = 10`. That asymmetry is not defensible when the stated requirement is that
  every value is shown in euros. The cheap fix is to flag long gaps as estimated, the same way
  prices are; the real fix is a daily FX series, which SPEC §2.2 assumed would be needed.

*Needed from you:* a decision — flag the gaps in 0.10.0, or fetch a real FX series. My
recommendation is to flag first: it is honest, it is small, and it tells us how much of the
history is actually affected before we build the bigger thing.

### US-05 — Negative positions

Every negative position in this account is a short option. Once US-03 values options correctly,
this story has almost nothing left. The acceptance criteria (`quantity = -1`, `< -1`, `= 0`) are
worth keeping as *tests* on US-03 rather than as a separate story.

One thing does not dissolve, and it turned out to be the biggest find of the refinement: the
holdings screenshot shows **GameStop Corp. Class A, −4,0941 shares**. **B3 is answered — it is not
a short position and the account does not hold it.** It is fabricated by the split rescaling, and it is
the same defect as the phantom holdings on the second account. Moved to US-09.

### US-06 — Graph slicers

**B4 answered: the "Results per" group** (Auto / Day / Week / Month), not the range buttons.

It is wired, but to two of the eight charts. `state.granularity` feeds `aggregatePnl` only, which
draws *Result per period* and *Cumulative result*. Every other chart on the page — including
*Portfolio value including cash*, the largest thing on screen and the one directly beneath the
control — ignores it entirely.

Two consequences, both of which read as a dead button:

- With **Range 1M**, `autoGranularity` resolves to `day` (≤ 45 days). Pressing **Day** then changes
  literally nothing, because Auto had already chosen it. That is the exact state in the screenshot.
- Pressing **Month** does change the two result charts, but the eye is on the value chart, which
  stays daily.

So the control is not broken so much as **silently scoped**. It sits in the global toolbar and
behaves like a local one.

*Decision needed, and the two options are different products:*

1. **Make it global.** Apply granularity to every time series: values take the period-end
   observation, flows are summed over the bucket. The control then does what its placement
   promises.
2. **Make its scope visible.** Move it beside the two result charts, or relabel it.

*Recommendation:* option 1. The complaint is that pressing a button does nothing visible, and
option 2 keeps that true. The one residual is that Day-under-Auto(day) is still a no-op; the
`Auto (day)` label already discloses that, which is enough.

The KPI tiles ignoring the range is a separate, still-open question — `renderTiles(r)` is called
with the whole history before the range window is computed, so **1M** leaves *TOTAL RESULT
+€ 97 842,64 (+170,25 %)* on screen. Not what was reported, but worth deciding while we are here:
should the tiles follow the range, or are they deliberately all-time?

### US-08 — Compare any two months, not the same month across years *(new)*

Requested during refinement. Today you click a **month name** and get that month across every year
— all Septembers side by side. Wanted: click a **cell** in the grid and compare specific months,
e.g. September 2025 against November 2020.

This is a small change to state (`state.selectedMonths` holds month numbers 1–12; it would hold
`YYYY-MM` keys) and a larger change to what the view *means*. Three things need deciding, because
they do not follow from the request:

1. **The summary table stops making sense.** Its columns — count, total, average, best, worst,
   *"X of N positive"* — are aggregates over years. Pick one specific month and every column
   collapses to the same number, with *"1 of 1 positive"* underneath. It has to be replaced, not
   carried over. *Recommendation:* per selected month show the euro result, the return %, and its
   rank over the whole history (*"3rd best of 81 months"*), which gives a single month context
   without inventing an average from one observation.
2. **Colour.** `monthColours()` assigns a stable preferred slot per month number and shifts on a
   clash, so that a month keeps its colour between selections. Select September 2025 *and*
   September 2024 and that rule has nothing to say. *Recommendation:* colour by selection order for
   this view. It breaks "colour follows the entity" only within a view where the entity is the
   selection itself, and it keeps the hard rule — no two visible series share a colour.
3. **Does the existing mode stay?** You said it does not have to. *Recommendation:* keep both.
   They answer different questions and only one of them carries any weight — twelve Septembers is a
   pattern, one September against one November is two data points. Keeping the across-years mode
   costs nothing and stops the new view from being read as evidence it cannot be.

*Needed:* a yes or no on those three. Nothing else is unclear, and it is small enough to fit
alongside US-06 in this sprint.

### US-09 — Phantom holdings and the share count we display *(new)*

Reported on the second test account: holdings that are no longer held, and *"17k shares in
something he doesn't own"*. **Reproduced in the first account's export, and it is a fabricated position, not a
display artefact.**

`GameStop Corp. Class A` — 19 transactions, all in early 2021, buys and sells cancelling to a raw
ledger net of **exactly 0**. The engine's final quantity is **−4,094054**. DEGIRO does not report the
position at all. It appears in the holdings table at −€ 67,84 and it is in the total.

**The engine manufactures a position out of a ledger that closes.** The mechanism is in
`computePortfolio`:

```js
const f = useFactor ? factorAt(entry.audit.ratios, i) : 1;
arr[i] += Number.isFinite(f) && Math.abs(f) > 1e-12 ? t.quantity / f : t.quantity;
```

Each trade is divided by the split factor in force on *its own day*, so that `qty × price` is
dimensionally sound against a split-adjusted series. But when trades on different days fall into
different factor regimes, the buys and the sells are divided by different numbers and no longer
cancel. 19 shares in and 19 shares out leave a residual of −4,09.

`clusterFactors` (REGIME_TOLERANCE 1.25) was added to stop precisely this — it fixed an earlier
€0,47 ghost — but it narrows the spread rather than guaranteeing closure. **A position that closes
must close regardless of what the factors do**, and today nothing enforces that.

**Confirmed on the second account, and it is the reported "17k".** `Bed Bath & Beyond` on the second account's
export: bought 26 and 17 on 2022-08-16, sold 43 on 2022-08-22 — a clean round trip, **raw ledger net
0**. The engine holds **17,362971728699264**, DEGIRO reports nothing, and it sits in the holdings
table at € 69,22.

One fabricated position per account, in both cases from a ledger that closes:

| Account | Instrument | Engine | Ledger | DEGIRO | Invented value |
|---|---|---:|---:|---|---:|
| First account (303 products) | GameStop Corp. Class A | −4,0941 | 0 | absent | −€ 67,84 |
| Second account (149 products) | Bed Bath & Beyond | 17,3630 | 0 | absent | € 69,22 |

**The magnitude was misread, and that is a second defect.** It is 17,36 *shares*, not 17 000. The
holdings table formats with `nl-NL` and up to four decimals (`app.js:681`), so `17,363` sits in a
column directly beneath `2.000` and `1.159` — where the separator means thousands. The number is
genuinely ambiguous, and it cost a round of diagnosis in a bug report. Share counts should not be
rendered in a format where the decimal separator can be read as a grouping separator.

The value defect is real either way: € 69,22 of a position that does not exist, in the total.

*Direction (to be settled in the sprint, not here):* apply the factor as a step change to the
accumulated position at a regime boundary, rather than as a per-trade divisor. Closure is then
preserved by construction instead of by luck.

**Two acceptance tests, both available from this export:**

1. If the raw ledger nets to zero for a product, the engine's quantity is exactly zero. *(GameStop:
   currently fails.)*
2. For every open position, the engine's quantity equals DEGIRO's reported `size`. *(All others:
   currently pass, 1 of 27 fails.)*

The second one is worth keeping permanently as a red warning naming the instrument, in the same
class as the reconciliation banner — *if today's position is wrong, the history is wrong too*. It
would have caught the 17k the day it appeared.

**Separately, the holdings table shows the converted quantity, not the share count.** `app.js:678`
renders `p.qty.at(-1)`, which is in the price series' units. Where a factor is below 1 the displayed
count is inflated even when the value is right. The converted quantity should stay internal.

**B10 — does DEGIRO book a split as a transaction pair?** Strong prior evidence that it does not:
the €429 million case showed 49 shares at an adjusted quote of 7 030 800 against € 538,92 actually
paid, which only holds if the ledger is *un*adjusted. That is one instrument, so it is evidence
rather than proof, and it should be checked against the 18 rescaled instruments on the second account
during the sprint. It does not block the acceptance tests above: closure must hold whichever way the
answer falls.

*Scale of the machinery involved:* the second account rescales **18** instruments and rejects **3**;
the first account rescales 3. This code path fires often, so a defect in it is not an edge case.

### US-07 — Options & margin dashboard

Agreed, and the tester's framing is right — the dashboard is built around buy-and-hold stocks. But the
margin half depends on data we have not confirmed exists, and the whole thing must sit on the final
valuation model rather than lead it.

*Recommendation:* not in 0.10.0. Revisit once US-03 is in and we know what margin data `/update`
actually carries.

---

## 4. Proposed sprint 0.10.0

**The story document's phasing is wrong and the data says so.** It puts US-01 first, then
US-02/04/05, then options in phase 3. But the currencies are wrong *because* options are
mishandled: DKK is off by a factor of 100 as a direct consequence of the missing multiplier.
Fixing currency conversion before options means fixing it twice.

Order by causality instead:

| # | Item | Why here |
|---|---|---|
| 1 | Instrument model + contract multiplier, measured per product | Root cause of everything below |
| 2 | FX derived from non-derivative trades only; GBX ↔ GBP | Depends on 1 to know what a derivative is |
| 3 | Reconciliation to zero on both test accounts | The acceptance test for 1 and 2 |
| 4 | Real fixtures from this export → regression tests | DoD requires automated tests; also closes the gap from the sprint review |
| 5 | "Results per" applies to every chart (US-06) | Independent, small, no dependency |
| 6 | Compare arbitrary months by cell (US-08) | Independent, same area of the UI as 5 |
| 7 | Decide the CHANGELOG mechanism | DoD requires it to be decided during refinement |

Deferred to 0.11.0: US-07, and the expiry/assignment/margin half of US-03.

Item 4 is worth defending. The sprint review found that the test suite has never caught a defect
that reached a user — every one came from an account export, because `fixtures/` is generated from
the same assumptions as the code. This export is the first real capture the project has ever had.
Turning it into fixtures is how these bugs get regression tests at all, and it is the reason the
DoD item *"automated tests zijn succesvol"* means something here.

---

### US-11 — Report a bug without handing over your portfolio *(new, refined)*

**As a tester I want to report a defect without sending someone my holdings and amounts.**

Today the only way to report anything is the full export: every position, every amount, every
date. But look at what was actually needed to diagnose the four defects in 0.10.0 — a contract
size is a ratio, an exchange rate is a ratio, a fabricated position is a count against a count,
a mis-scaled series is a quoted price over a paid price. **Not one of them needed to know how
much money anyone has.**

So: a **"Share diagnostics"** export carrying counts, ratios, verdicts, warning codes and
instrument *types*, with no amounts, no instrument identities and no dates beyond the range.

*Acceptance criteria:*

- ☐ Each of the four 0.10.0 defects is demonstrably diagnosable from the diagnostics file
  alone, checked against the two real exports — **or it is written down which one is not, and
  why.** This is the criterion that decides whether the story is worth anything.
- ☐ The file contains no amount, no instrument name or ISIN, no account number, no name.
- ☐ A tester can produce it without reading it first to check what is in it.
- ☐ The full export still exists, and the README says plainly that it is something you send to
  someone you trust.

*Note on what cannot be fixed:* an export that is useful for reconstructing a portfolio
contains that portfolio. This reduces how often the full file is needed. It does not make the
full file safe.

### T-1 — The guards that make a leak harder than not leaking *(tooling, not a story)*

Not a user story: no user-visible outcome, so it can never satisfy "gebruikers hebben de
wijziging zelf getest". It is an afternoon of plumbing and it belongs before US-11, because it
closes a hole that is open right now.

Three leaks happened in one sprint — the export shipping `displayName`/`intAccount`/
`userToken`, a real account number pasted into a test, both testers named in this file beside
their holdings. All three are fixed. **None was prevented**, all three were found by someone
happening to look, and two were introduced by the person who then found them. That is the
defect worth fixing: nothing makes leaking harder than not leaking.

- **Invert `IDENTIFYING_META` to an allowlist**, with a test that fails on an unclassified meta
  key. About ten lines, and it closes the hole the 0.10.0 fix left open — see CLAUDE.md rule 7.
- **A guard before a commit lands**, refusing a diff containing an account export, an
  identifying meta value, or a long digit run inside `test/`. It does not need to be clever;
  a dumb pattern check catches all three real incidents.
- **`npm run audit` refuses a path inside the repository**, so an export cannot be staged by
  accident.
- **A synthetic account generator for tests**, because incident 2 happened when the real value
  was on screen and pasting it was the path of least resistance.
- **`diagnose.js` output asserted** to carry no session id, account number or amount. It is
  already designed that way and it is the one output explicitly meant for a stranger, so it is
  the one that should have a test.

### Standing rule, not a backlog item

Default-deny on anything leaving the machine, no real values in `test/`, and findings that name
accounts rather than people are now **CLAUDE.md rule 7**. Rules get checked on every story;
backlog items get done once and forgotten.

### US-10 — Trade Republic *(refined)*

**As someone who does not hold everything at DEGIRO, I want the same chart for a Trade Republic
account.**

#### The question that decides whether this is possible at all

Everything this project does rests on one thing: **a logged-in browser session that can be
replayed.** DEGIRO hands the browser a `JSESSIONID` cookie, and every endpoint accepts it. That
is why the extension needs no password, stores no credential, and can be honest about it.

Trade Republic is app-first. Its web client authenticates with a phone number and a PIN, then a
device-bound token, and the session is carried over a websocket rather than as a cookie on
ordinary REST calls. **If that token cannot be read from an ordinary logged-in tab the way a
cookie can, this story is not "harder" — it is a different product**, one that would have to ask
for credentials, which the README explicitly promises it never will.

**So the first task is not to build anything. It is to answer one question:** open a logged-in
Trade Republic web session, and see whether an extension with `cookies` and `host_permissions`
can reach account data using only what the browser already holds. A day, and the answer is yes or
no. Everything below is conditional on yes.

#### If yes: what the shape of the work actually is

The good news, and the reason this is worth refining rather than dismissing: **`engine.js` has
never heard of DEGIRO.** It takes transactions, cash movements, products and price series as
plain arrays and returns plain arrays. Nothing in it names a broker.

So a second broker is a second **adapter** — `session`, `degiro` (fetch), `parse`, `classify` —
and not an engine change. Protecting that boundary is most of the work, and most of the risk:
the temptation will be to reach into the engine for one broker-specific special case, and the
first one of those makes the second one inevitable.

Four things a new adapter has to supply, and each has a way of being absent:

1. **A transaction ledger** with a signed quantity, a price, a currency and what actually settled
   in euros. That last field is what this project measures exchange rates and contract sizes
   from; without it, both become guesses.
2. **A cash ledger with categories.** `classify.js` is DEGIRO's vocabulary in Dutch and English.
   Trade Republic's wording is its own, so this is a new rule table, and CLAUDE.md rule 4 applies
   unchanged: an unmatched row is `UNKNOWN` and is surfaced, never assumed to be a deposit.
3. **A daily price series per instrument.** DEGIRO leans on vwd. If Trade Republic offers only
   live quotes and no history, the chart cannot be reconstructed backwards at all — which is the
   whole product.
4. **An account total to reconcile against.** This is the one people skip. SPEC §6 makes the
   comparison against the broker's own figure the acceptance test of the entire project. Without
   an equivalent, there is no check, and a plausible wrong chart is exactly what this codebase
   exists to avoid.

#### Acceptance criteria

- ☐ The spike is written up first, with a yes or no on browser-session access, and the story is
  dropped rather than half-built if the answer is no.
- ☐ `engine.js` is unchanged. Not "barely changed" — unchanged. If the engine needs a new input,
  that is a finding worth its own discussion, not a patch.
- ☐ `npm run audit` runs against a Trade Republic export and every invariant holds.
- ☐ A reconciliation anchor exists, or the limitation is stated on the page in the same red the
  DEGIRO one uses.
- ☐ An unrecognised cash description is `UNKNOWN` and visible, exactly as it is today.

#### What was deliberately not in scope, and now is

This story used to end here:

> *One extension holding two brokers at once. Two accounts, two sets of instruments, two
> currencies of record, and a combined total nobody can reconcile against anything. SPEC §7
> already stops at one account; this stops at one broker per install until there is a reason.*

**There is now a reason, and it is the actual product.** Money sits at more than one broker, and
the question people want answered — *what am I worth, and what did it make* — is not a
per-broker question. US-22 to US-24 below replace this paragraph. One of the objections in it
turns out to be wrong, and saying which one is most of the design.

---

### US-22 — One extension, several brokers *(new, refined — read §A first)*

**As someone with money at more than one broker, I want one chart for all of it, and the ability
to look at one broker at a time.**

#### A. The objection above was wrong, and here is the arithmetic

The old scope note said a combined total is something *"nobody can reconcile against anything"*.
That conflates two different things, and the difference decides the whole architecture.

SPEC §1.4 is `pnl[t] = (value[t] − value[t−1]) − netExternal[t]`. Both sides of that are sums
over whatever is in the account, so for two brokers D and T:

```
value_combined[t]       = value_D[t] + value_T[t]
netExternal_combined[t] = netExt_D[t] + netExt_T[t]

pnl_combined[t] = Δvalue_combined[t] − netExternal_combined[t]
                = (Δvalue_D − netExt_D) + (Δvalue_T − netExt_T)
                = pnl_D[t] + pnl_T[t]
```

**Combined profit and loss is exactly the sum of the per-broker series.** Not approximately, not
subject to a convention — identically, because the identity is linear and both sides add. That
is a theorem about the model, and three consequences fall straight out of it:

1. **`engine.js` needs no change at all.** Not "a small change". Run it once per broker on that
   broker's own rows, then add the daily arrays together. The engine keeps never having heard of
   a broker, which is the property US-10 already made an acceptance criterion.
2. **Reconciliation stays per broker, and the combined total is never reconciled.** Each broker
   has its own anchor and its own check; the combined figure has no counterpart at any broker, so
   there is nothing to compare it to. This is the part the old note got right — it just does not
   condemn the feature, it decides where the check lives.
3. **Percentages do not add.** `windowReturnPct` chains daily returns against the previous day's
   value, so a combined return must be computed on the combined series. Averaging two brokers'
   percentages is wrong and would be an easy mistake to ship.

#### B. Moving money between brokers, which is the case everyone assumes breaks it

Withdraw €10 000 from DEGIRO on Monday, and it lands at Trade Republic on Wednesday. It is
tempting to invent a `TRANSFER` category that nets the two out. **Do not** — and the arithmetic
says why it is unnecessary:

| | Δvalue | netExternal | pnl |
|---|---|---|---|
| Mon, DEGIRO | −10 000 | −10 000 | **0** |
| Wed, Trade Republic | +10 000 | +10 000 | **0** |

Each side is already self-consistent, so the combined P/L is zero on both days. **No profit is
fabricated and none is lost.** A `TRANSFER` category would be inventing a classification to fix a
problem that does not exist, against rule 4.

There *is* a visible artefact, and it is in a different place than expected: for Tuesday the
money is at neither broker, so the **combined value line dips by €10 000 for two days**. That is
not an error — the money genuinely was not at either broker — but it reads as a loss to the eye
while the P/L correctly says nothing happened.

*Recommendation: annotate, never net.* A withdrawal at one broker matched by a deposit of the
same amount at another within a few days is almost certainly a transfer; mark it on the chart and
say so in the tooltip. **It must change no number** — it is a label on a true value, and the
moment it starts adjusting figures it is a guess about intent that rule 4 forbids.

#### C. What a broker is, as a module

Today `session.js`, `degiro.js`, `parse.js` and `classify.js` are four modules with DEGIRO's
assumptions in them. They become one **adapter** per broker behind a named interface, and the
interface is the deliverable of this story:

| The adapter must supply | Why it cannot be shared |
|---|---|
| `id`, `label` | Everything is keyed by it |
| `resolveSession()` | Cookie for DEGIRO; whatever Trade Republic turns out to need |
| `fetchTransactions`, `fetchCashRows`, `fetchProducts`, `fetchPrices` | Different endpoints, different shapes |
| `fetchLiveTotal()` | The reconciliation anchor, per broker |
| **its own `classify` rule table** | `classify.js` is DEGIRO's wording in Dutch and English. Another broker's descriptions are its own vocabulary, and rule 4 means every unmatched row is `UNKNOWN` and counted — **per broker**, so one broker's unclassified rows cannot hide inside another's clean sheet |
| its own throttle queue | See §E |

#### D. Instruments held at two brokers

100 ASML at DEGIRO and 50 at Trade Republic is one holding of 150 in the combined view, and two
rows when filtered. Merge on **ISIN**, never on the broker's own product id, which is
broker-local by definition. An instrument with no ISIN — most derivatives — stays separate and
says so, rather than being matched on a name string.

#### E. Rate limiting, which is a safety question and not a performance one

CLAUDE.md rule 5 puts every outbound request through one module-global queue at ≥1,1 s. With two
brokers that single queue is both too strict and too loose: a Trade Republic request would wait
behind a DEGIRO one for no reason, and — worse — a shared budget makes it possible to reason
about the total rate while getting each individual broker's rate wrong. **One queue per broker**,
and brokers sync one after another rather than at the same time, so a slow first sync cannot
double the worker's outbound rate.

#### F. Storage, and the migration nobody can skip

Every store gains a broker dimension; keys become `broker:id`, because two brokers will
eventually issue the same numeric product id and one silently overwriting the other is a class of
bug that produces a plausible wrong chart. That is a `dbVersion` bump, and per rule 2 there is
nothing to migrate — the raw responses are re-fetchable, so the upgrade is a wipe and a resync,
announced.

#### Acceptance criteria

- ☐ `engine.js` is byte-for-byte unchanged by this story.
- ☐ A test proves the theorem in §A on real fixtures: engine-per-broker-then-sum equals the
  combined series, to the cent, for `value`, `netExternal` and `pnl`.
- ☐ A test proves a cross-broker transfer produces **zero** combined P/L on both days.
- ☐ Each broker reconciles against its own anchor. The combined view shows the **weakest** status
  of its parts and names the broker responsible — a green combined banner over one unverified
  broker is exactly the plausible-wrong-chart failure this project exists to prevent.
- ☐ Combined return is computed on the combined series, and a test fails if anyone averages two
  percentages.
- ☐ Unclassified cash rows are counted per broker and surfaced per broker.
- ☐ Instruments merge on ISIN; one without an ISIN stays separate and says why.
- ☐ The bug report and the export gain a broker dimension and stay default-deny (rule 7).
  Findings name accounts and now brokers — never people.

#### Recommended order, and it is not the obvious one

**Do the refactor while there is still only one broker.** Introduce the adapter interface, the
broker key in storage and the run-per-broker-then-sum path with DEGIRO as the only implementation
and nothing visible changing. Every existing test must still pass, and any that break are
describing a real behaviour change.

The alternative — build Trade Republic first and generalise afterwards — means doing the risky
structural change with two brokers to get wrong instead of one, while the second one is also the
one nobody understands yet.

---

### US-23 — Sync and wipe, per broker *(refined — **deferred**, see below)*

> **Deferred on rule 8, deliberately and against my own earlier recommendation.**
> US-22's advice was "do the structural work while there is only one broker to get it wrong
> with", and that argument is right about `combine.js` and the adapter boundary: both are pure,
> both are tested, and both de-risk the design at no cost to anyone.
>
> It is *not* right about this story or US-24, and the difference is who pays. A24 already
> requires that one connected broker looks exactly like today — so a submenu over a choice of one
> is invisible by specification. The storage rekey is worse than invisible: it is a `dbVersion`
> bump, which means every tester wipes and resyncs, minutes each, for nothing they can see.
>
> Waiting costs nothing. That migration is the same size the day a second broker is real as it is
> today; there is no compounding interest on deferring it. Building it now buys a maybe with
> someone else's afternoon.
>
> **Unblocks when:** a second adapter passes `test/brokers.test.js` — i.e. R1 and R4 have come
> back yes and there is something to combine.

**As someone with two brokers connected, I want to sync or wipe one of them without touching the
other.**

A single **Sync now** that always does everything is wrong in both directions once there are two
brokers: a Trade Republic outage should not stop a DEGIRO sync, and a DEGIRO session that has
expired should not force a five-minute Trade Republic re-download to find that out.

*Shape:* **Sync now** keeps doing all connected brokers — the common case stays one click — with a
split control beside it listing each broker plus its last-synced time. **Wipe & resync** gets the
same treatment, and per broker it wipes only that broker's rows.

*The part that will be got wrong:* the guards. `runSync` today holds one module-global `running`
promise and `wipeAndResync` awaits it, and that is what stops a wipe landing halfway through a
sync — a failure that once produced a real report of a portfolio with cash and no holdings. With
two brokers that becomes **one guard per broker**, and a wipe of broker A must wait for A's run
only. A single global guard would serialise everything and quietly re-introduce the multi-minute
wait §E is trying to avoid; a guard per broker that is forgotten re-introduces the wipe race.

*Acceptance criteria:*

- ☐ Syncing one broker leaves the other's rows and its last-synced time untouched.
- ☐ Wiping one broker leaves the other's data intact, and the page still reconciles the survivor.
- ☐ A broker whose session has expired reports that against **that broker's** row, and the others
  still sync.
- ☐ The wipe-during-sync race is tested per broker, not assumed.
- ☐ One connected broker looks exactly like today: no submenu for a choice of one.

---

### US-24 — Combine, and filter *(refined — **deferred**, same reasoning as US-23)*

**As someone looking at €50 000 at DEGIRO and €60 000 at Trade Republic, I want to see €110 000,
and to be able to take either one out of the picture.**

*Shape:* a broker filter beside the range control, defaulting to everything, driving every chart
and every figure on the page — the same way the range control already does. Not a sixth tab and
not a per-chart setting: the whole page describes one selection.

*Three things that must be true and are easy to miss:*

1. **Every figure has to say what it covers.** "Total value €110 000" is a different claim from
   "€50 000 (DEGIRO only)", and the tile note is where that belongs — the `i` tooltips added in
   0.26.0 are the place for the caveat.
2. **Colour follows the instrument, not the broker.** The composition chart's rule is that a
   series keeps its colour when the range changes; the same must hold when a broker is filtered
   out, or every repaint invents a new reading. ASML is one colour whether it is held at one
   broker or two.
3. **Filtering to one broker must produce exactly what a single-broker install produces.** That
   is the strongest available test of the whole design, and it is cheap: the fixtures for one
   broker already exist.

*Acceptance criteria:*

- ☐ Filtering to a single broker reproduces the single-broker numbers exactly.
- ☐ The reconciliation shown is the filtered selection's, not the combined one's.
- ☐ Every tile states which brokers it covers when the selection is not everything.
- ☐ An instrument's colour does not change when a broker is filtered out.
- ☐ A cross-broker transfer is marked on the value chart and changes no number.

---


---

### US-30 — A year you can read *(new, refined)*

**As someone doing their yearly review — or handing something to an accountant — I want one block
per calendar year instead of twelve cells in a grid.**

The month matrix already holds every number. What it does not have is a *year*: opening and closing
value, what went in and out, what it made, what it paid, and how it compares to the year before.
Zeus ships this and we do not; it is the one content gap a competitor actually fills.

*Per year:* opening value, closing value, deposits, withdrawals, result in euros, return in percent,
dividend received, tax withheld, fees, interest, best and worst month, number of trades.

#### Three traps, and the third is the one that matters

1. **The first year does not open on 1 January.** It opens when the account did. Showing €0 as the
   opening value of the first year makes its return infinite; showing 1 January makes it wrong by
   however long the account had been running. Use the account's own first day and say so in the row.
2. **A year's return is not (close − open) ÷ open.** A deposit in March inflates that. It must be
   the daily-chained return the month grid already uses, for the same reason and by the same code.
3. **This is not a tax document, and it will be mistaken for one.** Our dividend tax figure is what
   DEGIRO withheld, not what is reclaimable. There is no cost basis anywhere in this project —
   deliberately, see US-27 trap 1 — so the capital-gains number a tax return wants **cannot** be
   derived from it. If a year block does not say that in the year block itself, somebody will file
   with it. A footnote elsewhere is not enough.

*Acceptance criteria:*

- ☐ The first year states its real opening date rather than implying 1 January.
- ☐ Each year's return equals the chained return over that year's days, and a test proves a year
  containing a large deposit and no market movement reports ~0 %.
- ☐ Every year block carries the "not a tax document, and here is what is missing" line.
- ☐ Years with no activity are absent rather than rendered as rows of zeros.
- ☐ It reads sensibly when the account opened in December: a three-week first year is a three-week
  first year, and is not annualised into anything.

### US-31 — Annualised return *(refined — **decided**: a toggle, money-weighted first)*

**As someone comparing this to a savings rate or a fund, I want one number per year.**

#### The decision, which is not an implementation detail

Two different questions, two different answers, and they can differ by a lot:

| | Answers | We already show |
|---|---|---|
| **Time-weighted** | *"How did the portfolio perform, ignoring when I paid in?"* | yes — the month grid's chained return |
| **Money-weighted** (IRR over the actual cashflows) | *"What did my money earn?"* | no |

**Decided: build both, behind a toggle, money-weighted first.**

The objection to showing both was that a money-weighted figure sitting beside a time-weighted one
without either being named is how a page contradicts itself. A toggle answers that — one at a time,
each named in the control that selected it — and it is a shape this page already uses three times
over: Euro / Return %, Line / Candles, Table / Share. Two answers to two different questions is not
a contradiction as long as the reader is told which question is on screen.

Money-weighted is the default because *"what did my money earn"* is the question a private investor
is actually asking. Time-weighted is the honest comparison against a fund, and the month grid
already computes it, so the second half of the toggle is nearly free.

#### Two traps in the arithmetic

1. **An IRR can have more than one root.** Descartes' rule: every sign change in the cashflow
   sequence permits another solution. An account that pays in, takes out, and pays in again has
   several, and a solver will confidently return whichever one it walks into first. **Report
   `unresolved` when more than one root is found in a plausible band** rather than picking — the
   same rule that governs a contract size, for the same reason.
2. **A short history annualises into nonsense.** Three months at +10 % is +46 % a year, stated with
   a straight face. Below a year it should show the period return and say the period, never an
   annualised figure.

*Acceptance criteria:*

- ☐ Both returns are named in words wherever either appears. Never a bare "return".
- ☐ A test with a known IRR — a single deposit and a single closing value — matches to four
  decimal places.
- ☐ A cashflow sequence with multiple sign changes and multiple roots reports `unresolved`.
- ☐ Under one year, no annualised number is shown at all.
- ☐ The solver is bounded: it terminates on a pathological input rather than iterating forever.

### US-32 — Dutch, with a flag *(new)*

**As a Dutch user I want the interface in Dutch.**

Every tester is Dutch and the entire interface is English, including a card literally headed
*"Profit and loss per product"* sitting beside a proposal that says *"Winst en verlies per
product"*. There is no translation layer at all.

*Shape:* a language toggle beside the theme toggle, flag plus code, with the choice stored the same
way. English stays the source: the dictionary is keyed by the English string, so an untranslated
string renders in English rather than as a missing key.

*The rule that keeps it honest:* **untranslated strings are counted, not hidden.** A half-translated
page that silently falls back looks finished and is not; the count says how far it actually got.

*Acceptance criteria:*

- ☐ Switching language re-renders without a reload and survives closing the page.
- ☐ Numbers and dates stay `nl-NL` formatted in both languages — that is a locale for money, not a
  language for prose, and it was already right.
- ☐ A missing translation falls back to English and is counted.
- ☐ Nothing in the bug report or the export changes with the language: a diagnostic that shifts
  wording per reader is a diagnostic nobody can grep.

---

### US-33 — Where does this go from here *(new, refined — the riskiest thing in this backlog)*

**As a long-term investor I want to see where my whole portfolio goes over the next few years, so
I stop maintaining a worse copy of that in a spreadsheet.**

Found by asking a tester what he keeps open *next to* us. The answer was a spreadsheet projecting
forward — which is the sharpest feature list there is, because it is by definition the thing we do
not provide.

**The whole portfolio, not one instrument**, over a horizon the reader sets in months or years.
And **two rates rather than one**, because they behave differently: expected price growth, which
compounds inside the position, and expected dividend yield, which arrives as *cash* and only
compounds if it is put back to work. One tester's account is concentrated in a **distributing**
dividend ETF, which is precisely the case where conflating the two is worth the most money.

#### Why this is the most dangerous story here

Everything else in this project is a **measurement**, checked against DEGIRO's own total and
refused when it cannot be verified. A projection is the opposite: a number that is definitionally
unverifiable, drawn in the same typeface as numbers that are. Rule 6 exists because a plausible
wrong chart is the failure mode; a forecast *is* a plausible chart with no right answer.

So the argument for building it is not "it would be nice". It is that **he is already doing it, in
a tool with worse inputs than ours**, and a spreadsheet compounding a price series is wrong in ways
we can see and it cannot:

- **A distributing ETF's dividends sit in cash and do not compound** unless they were reinvested. A
  spreadsheet compounding the price return assumes they did. We hold the dividend rows and the cash
  balance, so we know which actually happened.
- **The rate he is compounding is probably the wrong one.** Growth measured off a value line that
  includes his own deposits is not a return (SPEC §1.4, in a spreadsheet).

If we build it, those two are the reason. If we cannot beat the spreadsheet on them, do not build
it at all.

#### The arithmetic trap, and it is not obvious

**Our measured return already contains the dividends.** A dividend is internal (rule 3), so it is
in `pnl`, so it is in the time-weighted return US-31 computes. Defaulting "growth" to that figure
and then adding a dividend yield on top **counts the dividends twice**, and on a dividend-led
portfolio over twenty years that is not a rounding error.

So the split has to be derived, not assumed:

```
dividend yield ≈ dividend income over the year ÷ average value over the year
price growth   ≈ total time-weighted return − dividend yield
```

Both from the account's own history, and both shown, so the reader can see the split rather than
trust it.

#### The lever nobody's spreadsheet has, and we do

For a distributing holding, whether the dividend cash was **reinvested** is the single largest
factor over a long horizon — and it is the one thing a spreadsheet cannot know and we can measure.
The cash ledger says when a dividend landed; the transaction ledger says whether a purchase
followed. So the default is not a guess:

> *"Over the last five years you reinvested 78 % of your dividends within a month. The projection
> assumes you keep doing that."*

That sentence is worth more than the projection it precedes, and it is the reason to build this
here rather than leave it in Excel.

*Three states, and each is real:* reinvested (compound it), left in cash (do not), or withdrawn
(it leaves the account entirely and is not part of the portfolio's future at all).

#### Scenario method — what the research settled, and what it corrected

Two Dutch regimes were looked at. **Neither binds a personal-use extension**; the point was to find
out what people who have watched this go wrong actually do.

**The old regime (Nrgfo art. 3:9, GUISE)** prescribes a historical scenario, a fixed 4 % one, and a
pessimistic one. Three of its details are worth taking:

- **The bad scenario is not a percentile — it is the *average of the worst tenth*.** GUISE is
  literally *"gemiddelde uitbetaling in geval van slechte eventualiteiten"*, approximated as
  `0,3125·x₀,₀₁ + 0,4375·x₀,₀₅ + 0,25·x₀,₁₀`. **This corrects an earlier draft of this story**,
  which said tenth percentile. The mean of a tail is the more honest statistic: a tenth percentile
  says "it was at least this bad", the mean of the worst tenth says "when it went badly, this is
  how badly on average", and only the second answers the question a reader is asking.
- **The bad scenario is horizon-dependent, and steeply.** For equities the prescribed pessimistic
  annual return is **−30,4 % at one year, −10,7 % at five, −5,3 % at ten and +0,6 % at thirty**. So
  a single "bad market" haircut applied across horizons is wrong whatever number is chosen — it has
  to be computed per horizon.
- **The naming rule, which is the strongest thing in the article and maps straight onto us.** With
  twenty years of history you may head it *"Historisch scenario"*; with four to twenty you may fill
  the gap with a prescribed parameter and still call it historical; **with under four years you may
  not call it historical at all — it must be headed *"Voorbeeld scenario"***. Our accounts are five
  and two years old. So: **an account with under four years of history gets scenarios labelled as
  illustrative, not as "based on your history"**, and the card says which of the two it is doing.

**The living regime is PRIIPs, not GUISE** — and it points at a better method. Four scenarios
(stress, unfavourable, moderate, favourable) built from **actual historical subperiods rather than a
fitted normal distribution**, because lognormality makes the tail systematically too thin, which is
precisely where the scenario is used.

That is also this project's own principle arriving from outside: **measure, do not assume.** So the
method is rolling windows over the account's own returns, not a distribution fitted to them — and
where there is not enough history to cut a five-year window from, that is not a modelling problem
to paper over, it is the *"you may not call this historical"* case above.

*The fallback parameters, if one is ever needed:* the AFM's own recalibrated standard deviations
(1999–2024) — developed-market equities **17,5 %**, emerging **22,5 %**, investment-grade euro
corporates **5 %**, cash **2,5 %**. Prefer these to the Nrgfo's, which are visibly stale: they still
price a deposit at 3,7 % and put equity σ at 25,5 %.

*Single-sourced, and marked as such:* the μ/σ table above came from one retrieval of the Nrgfo
appendix, and the appendix listing expected returns per class could not be fetched whole. Treat the
numbers as indicative until a second source confirms them — the same standard `ENDPOINT-REPORT.md`
holds DEGIRO's field names to.

#### The rules it has to obey

1. **A projection is never drawn in the same treatment as history.** Different line, visible break
   at today, and the word *projection* on the chart itself rather than in a caption. If somebody
   screenshots it, the screenshot has to carry the caveat.
2. **Both rates are inputs, shown and editable, never hidden assumptions — with a toggle between
   *derived from your history* and *I set them myself*.** Give the reader the freedom, and make the
   derived option the default so the freedom is a departure from something measured rather than
   from a blank field. Derived means the split above; money-weighted is about his past timing and
   must not be the default here.
3. **Future contributions are an input too.** A forecast that ignores the monthly deposit is
   useless to someone who makes one, and quietly assuming zero is the same class of error as
   assuming a deposit is a gain.
4. **One line is a lie, and there is an established shape for saying so.** Researched rather than
   invented — the sources and the caveats are in §Scenario method below. The short version:

   **Name them the way a Dutch reader already knows them.** Brand New Day shows exactly this over
   five years as *goede markt / verwachte markt / slechte markt*, which is the same idea in plain
   language, and a pension provider's wording beats a regulator's because the reader has met it.

   - three lines, named;
   - **the ceiling applies to the middle line, not to the outer ones.** An earlier draft said the
     optimistic line may not exceed what the account's own history did, and that is wrong: an
     outcome in the good tail exceeding the historical mean is what a good tail *is*, and capping
     it would misdraw the very thing the line exists to show. It is *verwachte markt* that must not
     quietly beat the past it was derived from;
   - **five years, and that is a ceiling rather than a default.** Partly because it is the horizon
     a reader has already seen, and partly for a reason of our own: the band widens with the square
     root of time while the middle line grows linearly, so past five years the good and bad cases
     are so far apart that the picture stops distinguishing anything. A ten-year projection is not
     more information than a five-year one — it is the same information drawn wider, and read as
     though it were more.

5. **Backtest the assumption against his own history, on the same chart.** "This rate, applied from
   five years ago, would have predicted X; you actually have Y." That single comparison is worth
   more than the projection itself, and it is the honest way to show how much a forecast is worth.
6. **Never a tax or a retirement claim.** No "you will have enough". A number and a band, and
   nothing that reads as advice.

#### Acceptance criteria

- ☐ The projected segment is visually distinct from history, and labelled on the chart.
- ☐ Growth, yield, contribution and horizon are visible inputs with stated defaults, not constants
  in the code, and a toggle switches between derived and manual.
- ☐ Growth and yield are derived **separately**, and a test proves they do not double-count: an
  account whose entire return came from dividends must derive a price growth of ~0 %.
- ☐ The measured reinvestment rate is stated in words, and the projection follows it.
- ☐ A band, derived from the account's own monthly distribution.
- ☐ The backtest line is present and its gap against reality is stated in words.
- ☐ Under a year of history, no projection at all — the same guard as US-31, for the same reason.
- ☐ A distributing holding whose dividends were *not* reinvested does not compound them, and the
  card says that is what happened.

#### Where it lives: its own section, and that is the safeguard

**A seventh tab, not a card on Overview.** The temptation is to continue the value line straight off
the right-hand edge of the chart everybody already looks at, and that is exactly the thing not to
do: every other number on this page is measured and checked against DEGIRO's own total, and a
forecast drawn in the same frame inherits that credibility without earning it.

So:

- the projection gets **its own section**, with the caveat at the top of it, so anyone reading a
  projected number has passed the sentence explaining what it is;
- it draws **its own chart** — history *and* projection, with a visible break at today — rather
  than extending the Overview one. Overview stays entirely measured;
- the tab carries no count badge. There is nothing to count, and a number there would read as
  findings;
- and nothing from this section appears in a tile, the export or the bug report. Tiles are
  measurements; a projected figure among them would be indistinguishable from one.

#### What it is not

Not per-instrument. Not a goal planner. Not a Monte Carlo with a thousand paths and a confidence
interval nobody can interpret — the band comes from his own months, which he can check.

---

### Where we now stand against Zeus

The competitor analysis in `docs/NEXT.md` §3b listed four things Zeus had and we did not. Three are
now done: **annual reports** (US-30), a **language switch** (0.32.0), **trade markers** on the value
chart, and an **arbitrary date range** (drag-to-zoom, 0.14.0). A tester uses both, which is the
useful signal: the gap that keeps a spreadsheet open is US-33, and Zeus does not fill it either.

## Stories out of the third mockup — the per-product page

A proposal from a tester's friend: one page carrying **profit and loss per product**, **positions**
and **transaction history**. Refined here, not built. Its figures were blurred in the screenshot,
so no account data entered this repository.

Three sections, and they are not three stories: one of them is a table we already ship.

### US-27 — Profit and loss per product *(new)*

**As someone who wants to know which products made me money, I want one row per product —
including the ones I no longer hold — with what I put in, what came out and what it left me.**

The strongest idea in the proposal and the one the page genuinely lacks. Today's holdings table
shows what is **held**; this shows everything ever **traded**, closed positions included, which is
where most of the answer to *"was that a good idea"* actually lives.

| Column | Source | Note |
|---|---|---|
| Product, type | `byProduct` + `productType` | The filter chips are DEGIRO's own strings, so per US-26 they are a **per-broker** vocabulary rather than a shared one |
| Status open / closed | final quantity | Already computed |
| Gekocht, Verkocht | buy and sell `totalBase` per product | **New** — the engine emits the *net* per product, never the two halves |
| Dividend | `DIVIDEND` cash rows carrying a `productId` | **New**, and see trap 2 |
| Huidige waarde | `values.at(-1)` | Already computed |
| Resultaat | the per-product identity result | Already computed — read trap 2 before adding anything to it |
| % | see trap 3 | |

#### Trap 1 — GAK is a cost-basis convention, and this project has refused to pick one

The *Posities* section asks for **GAK**, the average purchase price. That is average cost — and the
reason the per-holding numbers here are trustworthy is that **no cost-basis convention exists
anywhere in the engine**: a position's result is how its value moved less the money put into it,
which needs neither FIFO nor average cost.

Two different things are being conflated and only one is safe:

- **"Total paid ÷ total quantity bought", across every purchase.** A fact. Nothing to argue about.
- **"Average cost of what you still hold", after partial sales.** That *is* a convention — it is
  the average-cost method, and FIFO gives a different answer. It is also what brokers usually mean
  by GAK.

*Recommendation:* show the first, label it in those words, and **never compute a result from it**.
A `(koers − GAK) × aantal` column would be a second number called *Resultaat* disagreeing with the
first, and a page that contradicts itself about profit is worse than a page missing a column.

#### Trap 2 — the proposal's own subtitle changes what "Resultaat" means

It reads *"Gerealiseerd + ongerealiseerd + dividend"*. Our per-product result is **value moved less
money put in**; a dividend is cash and lands in the cash ledger, not in the instrument's value, so
it is *not* in there. Folding it in silently would make this column disagree with the identically
named column on the holdings table.

*Recommendation:* keep `Resultaat` the identity number, keep `Dividend` its own column exactly as
the proposal already draws it, and if a combined figure is wanted call it **`Totaal`**. Two columns
may not share a name and differ.

A dividend row with no `productId` cannot be attributed to anything. Count those and say so, rather
than dropping them — the same rule that makes an unclassified cash row visible.

#### Trap 3 — the % column needs its denominator stated

Result ÷ *what*? Divided by **Gekocht** it is honest and convention-free: what the money put into
this product returned. Divided by a cost basis it inherits trap 1. Say which, in the column header
rather than in a tooltip.

*Acceptance criteria:*

- ☐ Closed positions appear, with their whole result. That is the point of the story.
- ☐ `Resultaat` equals the holdings table's result for every product appearing in both.
- ☐ Dividend is its own column, and any dividend that could not be attributed is counted and shown.
- ☐ The percentage's denominator is named in the column header.
- ☐ Type filters are built from the product types actually present — a broker with no warrants
  shows no warrants chip.
- ☐ Best-first and worst-first sorting is stable for equal values, so the order does not jitter.

### US-28 — The transaction history, on the page *(new)*

**As someone checking a number, I want to see the transactions behind it without exporting JSON.**

Genuinely missing: every figure on this page is derived from the transaction list, and there is no
way to look at that list.

*Two decisions:*

- **886 rows is not a table, it is a list that needs a strategy.** Rendering all of them costs a
  second of layout and a minute of scrolling. *Recommendation: follow the range control that
  already exists* — the rest of the page is about a window, and a history that ignores it is the
  inconsistency US-06 was about. A "show all" escape hatch beside it.
- **It has to reconcile with the charts.** If the selected range shows twelve trades, the count
  says twelve.

*Acceptance criteria:*

- ☐ The list follows the range, and states how many rows it shows out of how many exist.
- ☐ Newest first, with the columns the proposal names.
- ☐ No visible pause on an account with several thousand transactions.

### US-29 — Two columns on the holdings table, not a second table *(new, small)*

**As a reader I want the current price and what I paid on average, beside the holding.**

The proposal's *Posities* section is the holdings table we already ship, plus **Koers** and **GAK**.
Building it separately would put two tables of the same positions on one page, with different
columns and — eventually — different numbers.

So the story is: **add two columns to the existing table.** Koers is value ÷ quantity on the last
day. GAK is trap 1's safe definition, labelled as such.

*Acceptance criteria:*

- ☐ No second positions table exists.
- ☐ The GAK header states it is the average over all purchases, and nothing on the page derives a
  result from it.

---

### US-26 — Instrument coverage, declared per broker *(new)*

**As someone whose account is not the one this was built against, I want to know which instrument
types have been verified for my broker and which have only ever been assumed.**

Raised as "are calls, bought puts and crypto tested?" — a DEGIRO question. It is written up as a
general one, because **coverage is a property of an adapter against an instrument type**, not of
this project. A second broker does not inherit DEGIRO's evidence: the arithmetic is shared, the
field names are not, and it is the field names that fail quietly.

#### The vocabulary, which is most of the value

Four levels, and the middle two are the ones that get conflated:

| Level | Means |
|---|---|
| **captured** | A real account holding this ran through `npm run audit` and the invariants held |
| **synthetic** | A generated account exercises it and passes — real evidence about the *arithmetic* |
| **arithmetic** | The model handles it by construction; nothing exercises it |
| **none** | Never considered. Not "probably fine" |

The live matrix is in [`docs/LIMITATIONS.md`](LIMITATIONS.md#instrument-coverage-per-broker), with
a broker column from the start so a second adapter adds a column rather than a document.

#### Where DEGIRO stands, and why "untested" was too strong

`make-account.mjs` already generates long calls, short calls, long puts and short puts, and they
pass. The generator states the truth and never tells the engine, so that is genuine evidence that
the arithmetic handles a call: a position is a signed quantity times a price times a contract
size, and a call is the same sum as a put.

What it cannot prove is that the *fields* are what we assume. `parse.js` accepts several candidate
names per value, a name matching nothing returns zero quietly, and a fixture built from shapes we
already believe in cannot catch a belief that is wrong. Against a real account, only **written
puts** have ever been checked — every contract in the one options account is a `P`.

**What the synthetic column is worth, and what it is not.** The generator states the truth and the
engine is never told it, so a green run proves the *arithmetic* handles a call: a position is a
signed quantity times a price times a contract size, and a call is the same sum as a put. That is
real evidence and it is why "calls are untested" is too strong.

What it cannot prove is that DEGIRO's **fields** for a call are the ones we assume. `parse.js`
accepts several candidate names per value on purpose, and a name that matches nothing returns
zero — quietly. A synthetic fixture reproduces the shapes we already believe in, so it cannot
catch a belief that is wrong. That is the same gap `docs/ENDPOINT-REPORT.md` exists to record.

**Covered calls are not a separate case.** Writing a call against stock you hold is a short call
plus a long position, and neither leg needs to know about the other. There is nothing for the
engine to model, so "covered" adds no risk that "short call" does not already carry.

#### Crypto is a different question, and possibly two

1. **Which broker?** DEGIRO's crypto exposure is exchange-traded notes rather than coins, and a
   crypto *option* is not obviously a product either broker offers retail. Trade Republic does
   offer spot crypto. **This may be a US-10 question wearing a US-03 costume**, and it is worth
   settling before any of it is scheduled — the answer changes which broker it belongs to.
2. **What would actually break.** Not the sign, and not the price series. Two things:

   - **Fractional quantities meet a cent-rounded settlement.** `deriveContractSizes` measures
     `|totalBase − fee| ÷ |price × quantity|` and expects a whole number. `totalBase` is rounded
     to the cent, so on a 0,0004 BTC trade the relative error on that ratio is enormous, and the
     measurement lands on a wrong integer with the verdict still reading *measured*. **This is the
     defect 0.28.0 just fixed for exchange rates, in a second place** — the mechanism is
     identical, and it is a strong reason to look before assuming crypto is "just another
     instrument".
   - **A 24/7 market against a weekday price series.** The calendar already includes weekends, so
     a Saturday trade lands on a real day and nothing crashes. But if the price series carries
     weekday closes only, every weekend is `estimated`, and an account that is mostly crypto would
     report a data coverage in the seventies with nothing actually wrong. Honest, and confusing.

#### Acceptance criteria

**General — true of every adapter, now and later:**

- ☐ The coverage matrix exists, is per broker, and uses the four levels above. *(Done — in
  `LIMITATIONS.md`.)*
- ☐ A new adapter starts at **none** for every instrument type and earns each level. It does not
  inherit another broker's row, and "the arithmetic is the same" is explicitly not evidence about
  field names.
- ☐ A level is only raised by something reproducible: `npm run audit:synthetic` for *synthetic*,
  `npm run audit` against a real export for *captured*.
- ☐ Whatever the page claims about an instrument type is consistent with its level. It must not
  present a *synthetic* row with the same confidence as a *captured* one.

**DEGIRO, specifically:**

- ☐ An export from an account that has held **calls** runs through `npm run audit`, and the
  finding is written down either way. One afternoon; it needs a volunteer, not a sprint.
- ☐ The same for a **bought put**, which is a different sign from the 27 written ones.

**Crypto, before it is scheduled at all:**

- ☐ Settle which broker it is even about — DEGIRO's crypto exposure is notes rather than coins,
  and Trade Republic has spot. This may be a US-10 question wearing a US-03 costume.
- ☐ If it proceeds: a fractional-quantity case in the synthetic account, and
  `deriveContractSizes` reporting `unresolved` rather than a wrong integer when the settled amount
  is too small to measure through — the same rule `MIN_FX_LEG` now applies to exchange rates.

#### What this story is not

A promise that calls are broken. The arithmetic says they work and the synthetic run agrees. It is
a statement that **nobody has ever pointed this at a real one**, and that the docs should say so
in those words rather than leaving a reader to assume coverage is uniform.

It is also **not** a new field on the adapter interface. A `coverage` member with one adapter to
declare it is rule 8 exactly — the matrix is a document until there is a second broker whose rows
differ from the first's, and at that point the question is whether the *page* needs to read it,
which is a different story.

---

### US-25 — Two accounts under one login *(new — a spike, not a story yet)*

**As someone whose DEGIRO login also reaches a second account, I want both of them in the
chart.**

Kept separate from US-22 because it sounds like the same feature and is not, and because the
reason usually given for excluding it is *close to* right rather than right — worth recording so
nobody re-derives the wrong version:

- **Two logins is out, and stays out.** A second login means a stored credential, and the README
  promises there will never be one. Not a scoping call; a product one.
- **But a second account does not necessarily need a second login.** DEGIRO identifies an account
  by `intAccount`, and one client login can cover more than one — a joint account beside a
  personal one. Both are then reachable with the session already in the browser, and
  authentication is not the blocker at all: `session.js` reads one `intAccount` from
  `/pa/secure/client` and caches it, and everything downstream assumes there is only ever one.

*The spike, and it is small:* on an account known to have two, does `/pa/secure/client` report
both, or only the one the web UI happens to be showing? An afternoon, and the answer decides
whether this is a week or impossible.

*Why after US-22, not before:* this is the same shape as the per-broker split — an id threaded
through storage, sync and the filter — with an account id instead of a broker id. Built on top of
US-22 it needs no new adapter, no new classify table and no new price source, which is most of
the cost gone. Built before it, it is the same refactor done twice.

*Acceptance criteria:*

- ☐ The spike is written up, and the story is dropped if one login reaches only one account.
- ☐ No credential is stored, entered or requested. If the answer needs one, the answer is no.
- ☐ Reconciliation is per account, exactly as US-22 makes it per broker.
- ☐ Filtering to one account reproduces the single-account numbers exactly.

---

#### What is still deliberately not in scope

Two accounts at the same broker under **two separate logins** — see US-25 for why the one-login
case is a different question, and why that one is worth a spike.

## 5. Definition of Done — reconciling the two versions

The DoD in chat supersedes the one on page 12 of the PDF, but the PDF has two items the chat
version dropped that are worth keeping given §1:

- *Geen duplicated business logic is geïntroduceerd*
- *Portfolio valuation gebruikt de centrale valuation logic*

Both are already load-bearing here: the multiplier must be applied in exactly one place, or the
holdings table and the value chart will disagree.

Two items need a decision before the sprint starts:

- **CHANGELOG.** There is none. The DoD says the mechanism is to be determined during refinement —
  so it needs deciding now. Recommendation: a plain `CHANGELOG.md`, *Keep a Changelog* format,
  updated in the same commit as the change. The README already carries a Status section that
  duplicates part of this; it should link to the changelog instead of repeating it.
- **"Gebruikers hebben de wijziging zelf getest" and "expliciet akkoord bevonden."** This makes
  the testers and you a release gate. Fine, but it means 0.10.0 cannot ship on a green test suite alone,
  and both of you need a **Wipe & resync** run before sign-off. Worth agreeing who does what.

---

## 6. Reverting a single story

The DoD asks that a change can be safely reverted. That works, with one convention and two
caveats worth knowing before the sprint rather than during an incident.

**The convention.** Each story lands as exactly one merge commit on `main`, with its identifier in
the subject — `S1/US-02: …`. Undoing that story is then `git revert -m 1 <merge-sha>`, which removes
the whole story and nothing else, and leaves the revert itself in the history. Each release gets a
tag (`v0.10.0`) so a whole version can be dropped back in one step too.

**Caveat 1 — the chained stories cannot be reverted independently.** S1 → S2 → S3 are causally
linked: S2 removes derivatives from the FX derivation, which is only correct because S1 taught the
code what a derivative is. Revert S1 alone and you get a state that is neither the old behaviour nor
the new one, and that nothing has ever tested. **Revert a chain from the top down**, or not at all.
S5 and S8 touch only the UI and revert freely.

**Caveat 2 — reverting code does not un-migrate storage.** If a story changes the IndexedDB schema,
rolling the code back leaves the new schema on disk. This is survivable here, and by design: only
raw API responses are truth (CLAUDE.md rule 2), so **revert + Wipe & resync** always recovers. It
does mean a storage-touching story's revert instruction is two steps, not one, and the changelog
entry should say so.

**What "undeploy" cannot mean.** There is no server and no auto-update. Users run an unpacked folder
or a downloaded ZIP, so there is no remote kill switch — a revert reaches someone only when they
pull or re-download. If a release turns out to be wrong, the honest move is a fast follow-up version
plus telling people to resync, not a silent rollback.

## 7. Open blockers

| # | Blocker | Blocks |
|---|---|---|
| B1 | Does `products/info` return `contractSize`? Needs a raw response or HAR — our export discards it | US-02 approach choice (measure vs read) |
| ~~B2~~ | ~~Closing transaction on expiry?~~ **Answered: yes, zero phantom positions** | — |
| ~~B3~~ | ~~Is GME −4,0941 a real short?~~ **Answered: no — fabricated by the split rescaling** | now US-09 |
| B10 | Does DEGIRO book a split as a transaction pair? the first account's rescaled instruments are all closed | US-09 |
| ~~B11~~ | ~~Contract size measured through an interpolated rate lands on the wrong integer~~ **Partly answered, 0.29.0.** It reproduces (a true 100 reads 108 on a currency converted twice in five years) and the number is still used, because falling back to one share per contract is a hundredfold error in place of an eight percent one. What is fixed is the **lie**: the row reported `anchored: false` and `verdict: 'measured'` side by side, and the UI believed the confident half. Now `estimated`. Measuring it *better* is still open, and needs an account that converts rarely | US-02 |
| ~~B4~~ | ~~Which slicer, which chart?~~ **Answered: "Results per", scoped to 2 of 8 charts** | US-06 |
| ~~B8~~ | ~~KPI tiles: range or all-time?~~ **Decided: follow the range, with the period in the label.** Same reasoning as US-06 — a global control half the page ignores reads as a dead button. The percentage uses the daily-chained return the month grid already uses, so a deposit inside the window does not flatter it | US-06 |
| B9 | US-08: replace the summary table, colour by selection order, keep both modes? | US-08 |
| ~~B5~~ | ~~Premium booked as external cashflow?~~ **Answered: no, and zero `UNKNOWN` rows** | — |
| ~~B6~~ | ~~Rounding policy~~ **Decided: round to whole numbers within tolerance, flag the rest** | — |
| B7 | Flag sparse FX gaps, or fetch a real FX series? | US-04 |

B1 does not block the sprint: the multiplier is measurable from data we already hold, and that is
the more robust route anyway since it is verified against DEGIRO's own numbers rather than trusted
from a field.

Remaining: **B3** and **B8** are one-line answers from you, **B7** and **B9** are choices where a
recommendation is on the table, and **B1** only matters if we later prefer reading the field over
measuring it.

---

## Refinement after 0.12.0 — a tester's two requests

One message, two stories. The second one appears to contradict a rule in CLAUDE.md and turns
out not to, which is the interesting part.

### US-14 — See the result per holding, not just the total *(new)*

**As a user I want to see how much each holding has made or lost, so that the coloured chart
tells me which position is carrying the portfolio and which is dragging on it.**

Today every result number on the page is an account-level one. The composition chart shows
what each holding is *worth*; nothing anywhere says what each holding has *made*.

#### The model, and why it is the one already in the spec

Per instrument, the same identity SPEC §1.4 applies to the account:

```
pnl_p[t] = (value_p[t] − value_p[t−1]) − netTraded_p[t]
```

where buying is money into that instrument and selling is money out, exactly as a deposit and
a withdrawal are for the account. Summed over the selected window it gives that holding's
result for that window.

The property worth having: **one formula covers realised and unrealised.** A position closed
inside the window is worth zero at both ends, so the trades are all that is left and the sum
*is* the realised result. A position still held gives what it gained plus anything realised on
the way. No cost-basis convention has to be chosen — no FIFO, no average cost — because the
question "what did this instrument do to my account" never needs one. That is worth stating
explicitly, because "P/L per holding" normally drags a cost-basis argument in with it.

#### Where it goes, and where it cannot go

The request says "in that coloured chart". It cannot literally go there: that chart stacks
*value*, and a stacked area cannot also encode a signed result without becoming two charts on
one plot. The holdings table is the place — it already carries the swatch colours read off the
same layer list, so the number lands next to the colour it belongs to. The stacked chart's
tooltip is the cheap second home.

#### What has to be decided

1. **Over the selected range, or all-time?** This is **B8 again**, and B8 is now blocking two
   things rather than one. Whatever the KPI tiles do, this should do, or the page contradicts
   itself in two places at once.
2. **Does a dividend count toward the instrument that paid it?** It should — a dividend is
   internal and belongs in P/L (CLAUDE.md rule 3) — but that requires the cash row to carry a
   product id. Needs checking against a real export before it is promised.

#### The caveat that has to ship with it

A per-holding number exposes the accuracy caveats that a total hides. An instrument with no
price series is held flat at its last traded price, so its result between trades is
fabricated; an option whose contract size was measured through a guessed rate carries that
error into its own row. Both are already flagged globally. Per row they must be flagged per
row, or the least trustworthy number on the page becomes the most specific-looking one.

*Acceptance criteria:*

- ☑ Per holding, the sum of every holding's result plus the cash row equals the account
  result. **Corrected during the build:** the first version of this criterion said the
  holdings alone should add up to the total, and that is false. Measured on the synthetic
  account, positions came to −8 817 against an account result of +8 603. The difference is
  not an error — a multi-currency account earns and loses on its cash: dividends, interest,
  fees, and the euro value of a foreign balance moving with the rate, none of which belongs
  to any position. The cash row carries it, and is labelled with what it is.
- ☐ A position bought and sold inside the window shows its realised result, not zero.
- ☐ A holding whose price series is missing or whose contract size is unanchored says so in
  its own row.

### US-15 — The colours should follow what you hold, not what you once held *(new)*

**Reported after 0.12.0:** *"it takes my largest positions ever, and the rest is Other, even
though I no longer hold those positions. If I now buy something alongside my 3 holdings it
probably also shows as Other."*

**Both halves are correct, and the mechanism is one line.** `engine.js:1133` sorts
`byProduct` by **all-time peak value**, and `buildComposition` takes the first six. So a
position that peaked at €50 000 in 2021 and was sold in 2022 outranks everything bought since,
and a position opened last week — with a small peak — cannot reach the top six at all.

#### Why it was built that way

`engine.js:1280` says so outright: the caller paints layer *i* with categorical slot *i*, so
ranking per range would repaint the survivors every time a range button is pressed, and a
reader who learned "green is Shell" would be misled. That is CLAUDE.md's charting rule —
*colour follows the instrument, not its rank* — and it is a good rule.

#### Why the rule and the request do not actually conflict

**One decision is currently doing two jobs.** A holding's position in the sorted list picks
both *whether it gets a layer* and *which colour that layer is*. Those are separate questions:

- **Membership** — who gets a layer and who folds into Other — is a question about the range
  being looked at. It should follow it.
- **Colour** — which hue a given instrument gets — is a question about identity. It must not.

Split them and both goals hold at once. The mechanism already exists in this codebase:
`monthColours()` keeps a stable preferred slot per month and shifts only on a clash inside the
current selection. The same applies here — a stable preferred slot per instrument, shifted only
when two visible instruments want the same one. Shell is then the same colour every time Shell
is on screen, and the range decides who is on screen.

#### The part that makes this a defect rather than a preference

`top` is filtered on `peak(p.values) > 0` over the **whole** history, and then sliced to the
range. So a position closed before the selected range **passes the filter, occupies one of the
seven categorical slots, and draws a flat zero across the entire chart.** It is not a
stability trade-off — the slot buys nothing at all. Meanwhile something currently held sits in
Other.

*Decisions needed:*

1. **The membership rule: rank on the slice.** Whatever range is selected, the top N and Other
   are decided from the values *inside that range*, and nothing outside it votes.

   That is the whole fix, and it is simpler than it first looked. An earlier draft here
   proposed giving currently-held positions a reserved slot before filling the rest by
   in-range peak; that reservation is unnecessary. A position you hold during the selected
   window has a non-zero value inside it and therefore ranks on its own merits, and a position
   sold in 2022 has a peak of zero across a 2026 window and drops out by the same arithmetic.
   One rule, both halves of the report, no special case.

   What stays in Other is then genuinely small *within the window being looked at*, which is
   what Other should have meant all along.
2. **How many.** It is six today plus Other plus Cash, which exactly fills the seven
   categorical slots and the neutral. The report says five; six is what it is. Changing the
   count is a separate question from fixing the ranking, and the palette does not have an
   eighth slot to give.
3. **Other stays one bucket**, named with its count. Nothing here argues for splitting it.

*Acceptance criteria:*

- ☐ A position closed before the start of the selected range never occupies a layer. *(Today's
  failing case: it does, and draws zero.)*
- ☐ A position opened inside the selected range competes on equal terms with everything else
  in it. Buying something today puts it in the running immediately, rather than leaving it in
  Other until it out-peaks a position from five years ago.
- ☑ An instrument in the account's six largest holdings keeps its colour in every window,
  and no two visible series ever share one. **Weakened during the build, deliberately:** the
  criterion first read "any instrument that appears in two selections has the same colour in
  both", which six hues cannot promise a tenth holding. What is guaranteed is that the top six
  own a hue, that "Other" keeps the last slot, and that anything below the six takes the first
  free colour — which can differ between windows. Verified across ALL / 1Y / 6M in a browser;
  the first implementation moved four instruments, this one moves none that has a hue of its
  own.
- ☐ The holdings table's swatches still agree with the chart, slice for slice.
- ☐ No two visible series share a colour — unchanged, and the reason the clash shift exists.

#### What ranking on the slice actually buys, and the choice it exposes

Ranking per window is not only a fix for a wrong-looking chart. It turns the range control
into a question worth asking: *who was this portfolio, in this period?* Select 2018 and the
chart answers with 2018's five; select ALL and it answers with the five that dominated the
whole history. Two different and both true answers, from a control that already exists — no
extra feature, it falls out of the fix.

It works precisely **because** colour is split off from rank. An instrument that is large in
both windows keeps its colour across them, so "this one was big then and is still big now" is
readable at a glance. Without that split the comparison would be noise.

**But it makes the ranking metric a real decision, where today it is not.** Membership is
currently decided by `peak(values)` — the highest the position ever reached. Over the whole
history that is a reasonable proxy for importance. Over one window it is not: a position that
spiked for a single day in 2018 outranks one that sat steadily large for the entire year, and
the second one is obviously the answer to "who dominated 2018".

*Recommendation: rank by mean value across the window* — equivalently the area under the
position's value curve, which is how much of the portfolio it actually was, for how long.
Peak keeps a one-day spike; the mean keeps what was really there. All-time rankings barely
move under this change, which is the point: it only differs where it matters.

*One thing to be careful about, and it is the cost of this whole story.* Once membership moves
with the range, a layer disappearing between two views means "it fell below the cut here", not
"it was sold". Those read identically on a stacked chart. So Other has to carry its count and
be inspectable, and the legend has to be unmistakably about the window on screen. Otherwise the
fix trades a chart that shows the wrong holdings for one that implies a sale that never
happened — and inventing an event is worse than mis-ranking one.

- ☐ Selecting a range and then returning to ALL restores exactly the previous chart, colours
  included.
- ☐ A layer that leaves the top N on a narrower range is still reachable — its value is in
  Other, Other says how many, and nothing suggests the position was closed.

---

## US-16 — Redesign the interface *(new)*

**As someone opening this page, I want it to look like a product rather than a stack of
charts, and to find the answer I came for without scrolling past six I did not.**

### The trap this story has to avoid

The two real usability defects found in 0.12.0 were **a button that stayed silent when
pressed** and **a drag that drew nothing while you dragged**. Both were interaction. Neither
would have been found by a visual redesign, and neither would have been fixed by one.

So this story starts with what the page is *for*, not with what it looks like. If it becomes
a repaint, it will produce a prettier version of the same confusions.

**First deliverable is an audit, not a design.** Take four questions a real user actually has
and time how long each takes on the current page:

1. What did I make last year, and was that good?
2. Which position is dragging me down right now?
3. Did I put more in than I took out, and when?
4. Is this number trustworthy — is anything estimated?

Question 4 is the one this project is built around, and it is currently answered by coloured
banners stacked above a chart. Whether that survives contact with a designer is the most
interesting thing this story will find out.

### Non-negotiable, and this list goes to whoever does the design

These are not preferences. Each one is either a correctness rule or validated accessibility
work, and a generic design pass will break every one of them because the broken version looks
better in a screenshot.

- **One y-axis per chart.** Never two scales on one plot. The alignment between them is
  arbitrary and invents a correlation — it is the single most common charting mistake, and a
  competitor already ships it.
- **Colour follows the instrument, not its rank or its position in a list.** Two views of the
  same holding must agree.
- **Seven categorical slots, then "Other".** An eighth holding does not get a generated hue.
  Cash uses a neutral, deliberately outside the categorical set.
- **The diverging pair stays blue-up / red-down.** Not green/red. That pair is the worst there
  is for colour-vision deficiency and this palette was validated against exactly that. Slots
  3–5 are already below 3:1 on the light surface, which is why the holdings table exists as
  the required relief — a redesign that removes the table removes the relief.
- **Colour is never the only channel.** A sign, a baseline or a label carries the meaning too.
- **A warning is not decoration.** Red means the reconstruction disagrees with DEGIRO and the
  numbers cannot be trusted; yellow means something was estimated. Neither may be softened,
  collapsed into an icon with no text, or moved somewhere you can miss it.
- **No remote anything.** MV3 forbids remote scripts, and the content security policy enforces
  it. No web fonts, no icon CDN, no analytics, no image host. Everything ships in the folder.

### Open for redesign, which is most of it

Layout and information hierarchy — the page is one long vertical stack of cards and nothing
has earned its position. Type scale, spacing, density. The holdings table, which just gained a
Result column. Empty, loading and error states. The popup. Narrow windows, which nobody has
ever looked at. And the first-run experience, where someone has installed an extension and has
no idea whether to press Sync or Demo.

### How to hand it over

The brief is written and ready to paste: **[DESIGN-BRIEF.md](DESIGN-BRIEF.md)**. Everything
below is the reasoning behind it.

`npm run demo` serves the entire interface as an ordinary web page on localhost, running the
real engine on generated data. **That is the artefact to give a designer**, and it contains no
account data of any kind — which is the one time rule 7 makes something easier rather than
harder. Screenshots of a real account must not be sent, and do not need to be.

### Why the output cannot be dropped in, and what to ask for instead

Tools like Lovable emit React, Vite and Tailwind. This extension has **no build step**: no
`npm install`, no bundler, Chart.js vendored in `vendor/`. That is why a tester downloads a
ZIP, presses "Load unpacked" and is finished, and why `npm test` and `npm run demo` work on a
clean checkout.

Adopting a React toolchain means either committing a build artefact or asking every tester to
build. Neither is worth a visual refresh, and it is a decision that should be taken on its own
merits and not smuggled in through a design tool.

*So ask for the design, not the code:* layout, spacing scale, type scale, component states,
and a palette **built on the existing validated hues**. Implementation stays in the current
vanilla stack, where the chart rules above already live.

### Acceptance criteria

- ☐ The four questions above are each answerable, and each is faster than it is today. Timed,
  not asserted.
- ☐ Every rule in the non-negotiable list still holds after the redesign, checked one by one.
- ☐ No new network request of any kind. `grep -rho "https\?://[a-z.]*" src/` returns the same
  two hosts it does today.
- ☐ Still no build step: a fresh clone runs `npm run demo` and a fresh ZIP loads unpacked.
- ☐ The page is usable at a narrow window width, which is a new requirement rather than a
  regression check.
- ☐ Dark and light both verified, and the diverging pair checked against a colour-vision
  simulation rather than by eye.

---

## US-11b — Get a defect into the backlog without a screenshot *(new, the transport half)*

**As a tester I want a problem I hit to arrive somewhere it can be refined, without taking
screenshots and without sending my portfolio.**

US-11 above settles *what* a diagnostics share may contain. This is the other half: how it
gets from a tester's browser to the backlog. The two ship together or neither is useful — a
safe payload nobody can send is a document, and a convenient button carrying amounts is a
leak.

### What exists today

A **Copy report** button that puts the connection check on the clipboard. It covers the seven
sync steps and nothing else, so a reconstruction that produces warnings — the actual case —
has no button at all, and the tester reaches for a screenshot. Which is the complaint.

### Why this is not an automatic upload, and the reasons are not theoretical

1. **A token inside an extension is a public token.** Anyone who installs it can read it out of
   the folder and write to the repository. There is no way to ship a write credential to
   untrusted machines and keep it a credential.
2. **It fires without anyone pressing anything.** The whole posture is that nothing leaves
   unless it was asked for. An automatic uploader inverts that, and inverts it for the one
   payload most likely to contain something nobody classified.
3. **Error text carries amounts and instrument names today.** "Reconstructed total is X but
   DEGIRO reports Y" states the size of the account. An automatic sender would have shipped
   that before anyone reviewed the wording.

### The shape that avoids all three

**A "Report a problem" button that opens a prefilled GitHub issue in a new tab.** The
diagnostics payload goes in the issue body via the query string; the tester sees exactly what
is about to be filed, presses submit, and it is filed under their own account.

No credential in the extension. No request the tester did not initiate. No new host
permission — it is a link, opened in a tab, not a fetch. And the review step is not friction
to be engineered away: it is the thing that makes the payload safe to widen later.

*Two limits worth knowing before building:*

- **Length.** A prefilled issue URL is good for roughly 8 KB in practice. That is a constraint
  on the payload, and a healthy one — US-11 already argues the useful report is counts,
  ratios, verdicts and warning codes. If it does not fit in a URL it is carrying something it
  should not. Clipboard is the fallback when it genuinely overflows, not the default.
- **The repository is private.** A tester without access cannot open an issue at all, and will
  get a 404 rather than an explanation. Either they are added as collaborators, or the button
  falls back to copying and says who to send it to.

### Acceptance criteria

- ☐ From a page showing a red or yellow banner, one click produces a filed issue with the
  diagnostics payload in it. No screenshot, no clipboard, no retyping.
- ☐ The payload is the US-11 one, and the same test that guards that content guards this: no
  amount, no instrument name, no account number, no session id.
- ☐ The tester sees the body before it is filed. Not a preference — it is what removes the
  need to trust the payload rule at the moment it is being widened.
- ☐ No token anywhere in the shipped folder, and `grep -rho "https\?://[a-z.]*" src/` still
  returns the two hosts it does today plus, at most, the github.com link target.
- ☐ A tester without repository access gets a clear fallback, not a 404.
- ☐ The button appears where the problem is — next to the banner — rather than only on the
  diagnostics panel, because the tester who needs it is looking at a wrong number, not at a
  connection check.

### US-11 / US-11b — delivered in 0.14.0, and what changed on the way

**Built as a clipboard export, not as a GitHub write.** The transport question in US-11b was
settled by the person who has to live with it: no automatic upload, no prefilled issue, just
JSON on the clipboard that a tester sends and a human pastes. That is better than what was
refined here, and for a reason worth keeping — it needs no token, no repository access for the
tester, and no size budget, so the payload can grow without anyone re-checking a URL limit.
The prefilled-issue idea in US-11b stays written down as the thing to build *if* pasting ever
becomes the bottleneck. It is not the bottleneck today.

**What the payload turned out to need**, beyond what US-11 predicted: the UI renders a
warning's `message` and drops its `detail` on the floor, always has. So the interesting half
of every warning in this codebase has never been visible anywhere — not on screen, not in a
screenshot, and not in a bug report. That, plus the sync log leading up to a failure, is the
substance of the file.

**The acceptance criterion held.** Each of the four defects from 0.10.0 is diagnosable from the
report alone, and there is a test per defect asserting it: the contract multiplier as a
reconciliation ratio of 1.44, the exchange rate as a `median` of 107 against a `source` of
`trades`, the rescale as a factor near 100 with its spread, and the fabricated positions as a
share count that disagrees. The one it cannot do is name the instrument responsible, which is
the honest limit and is what the full export remains for.

---

## US-17 — Notice when a field DEGIRO renamed stops arriving *(new)*

Refined after 0.14.0, from a question I asked badly. The question was "should the nine
swallowed catches and the silent parser fallbacks go in the bug report too". Measured, one
half of it is nearly a non-issue and the other half is worse than stated.

### The nine catches: seven are fine, and saying so is the finding

Read one by one rather than counted:

| Where | What it swallows | Verdict |
|---|---|---|
| `app.js:85` | worker did not answer | **Not swallowed** — shows an error notice |
| `app.js:250`, `popup.js:35` | a 400 ms poll tick while the worker restarts | Correct. The next tick recovers, and a failure that persists shows as a frozen progress bar |
| `app.js:1368` | `new URL()` on a display label | Harmless, returns null |
| `diagnose.js:254` | `JSON.parse` of a probe body | **Not swallowed** — converted into a structured failure |
| `degiro.js:124` | `res.text()` on an error body | Cosmetic; it decorates a message |
| `degiro.js:135` | `JSON.parse` of a response | **Not swallowed** — rethrown as a typed error |
| `parse.js:430` | an unparseable config URL | Falls back to the documented default, and `discovered: false` records it |
| `degiro.js:151` | the whole config call failing | Same — `discovered: false` |

So there is no instrumentation story here. **There is one field to carry:** `discovered`
already exists, `diagnose.js` already reads it, and the bug report does not. An account
silently running on default cluster URLs is worth a line in the report, and it is a line, not
a subsystem.

*Recorded because the temptation was to wrap all nine and count them.* That is the framework
rule 8 warns about: nine new counters, seven of which can only ever report zero, and each one
a branch no test covers.

### The parser fallbacks are the real story, and the danger is not what it looks like

Ten numeric fields in `parse.js` fall back to `0`. Six of them are load-bearing:

| Field | What a silent `0` does |
|---|---|
| `totalBase` | Exchange rates, contract sizes and every per-holding result are measured from it |
| `quantity` | The position ledger is empty; every chart is flat |
| `price` | The split audit has nothing to compare a quote against |
| `change` | Cash is zero, so the account is worth only its positions |
| `closePrice` | Positions value at nothing |
| `size` / `value` (live snapshot) | The reconciliation check has nothing to reconcile against |

**The failure mode is not a few missing rows.** If DEGIRO renames
`totalPlusFeeInBaseCurrency`, it does not go missing on three transactions out of 1 457 — it
goes missing on all 1 457. So the signal worth having is a **rate, not a count**: "absent on
1457 of 1457" is a renamed field and "absent on 3 of 1457" is ordinary sparse data. A raw
count cannot tell those apart, and would cry wolf on the second.

That also settles how loud it should be. CLAUDE.md already says loose parsing that silently
returns `0` is worse than a loud failure — so a load-bearing field absent on effectively every
row is not a line in a diagnostics file, it is **a red banner**, in the same class as the
reconciliation check. The bug report carries the tally; the page carries the alarm.

### The part that pays for itself twice

The parsers accept several candidate names per value on purpose, and nobody knows which one
DEGIRO actually sends. **The same counter that catches a rename answers that.** If
`totalBase` resolves through `total` on every row and never through
`totalPlusFeeInBaseCurrency`, that is the real field name, measured rather than guessed — and
per rule 8 the other three candidates then get deleted rather than kept in case.

So this is not only a safety net. It is the instrument that lets `parse.js` stop being
defensive, which is what `CLAUDE.md` has been promising since the fixtures were written and
what the spike has been waiting on.

### Scope, deliberately small

- `pick()` records which candidate matched, and when nothing did, per field. A counter, not an
  event log — no timestamps, no rows, no per-row detail.
- Six load-bearing fields are named as such in one place. The other four are counted the same
  way but do not raise anything.
- A load-bearing field missing on more than a high fixed fraction of rows raises an error
  banner naming the field. The fraction is a threshold, so per §3/US-01 it is a constant in
  `config.js`, reviewed by a human, and explicitly not derived from the data it polices.
- The bug report gains the tally and the `discovered` flag. Field names are ours, not the
  account's, so nothing here needs redacting.

*Acceptance criteria:*

- ☐ Renaming one load-bearing field in a fixture turns the page red and names the field.
  Written as a test that renames it, since that is the only way to know the alarm can fire.
- ☐ A field absent on a handful of rows raises nothing.
- ☐ The bug report states, per load-bearing field, which candidate name matched and on what
  fraction of rows.
- ☐ Adding a candidate name to a `pick()` list does not require touching a second list. If it
  does, the two will drift and the tally will lie.
- ☐ The report still contains no amount, no instrument name and no account number — checked by
  the test that already guards that, not a new one.

---

## US-16 — implementation plan, against the delivered mockup

The mockup arrived. Read rather than rendered: it loads React from unpkg, which the sandbox
blocks and which the extension could not use anyway, so the assessment is from its source.

### It is implementable, and almost none of it is the framework

What is actually being delivered is **CSS custom properties plus a structure**. Two skins
(`studio`, generous and warm; `terminal`, dense) × two themes, and the whole visual language
is tokens: `--r-lg`, `--pad`, `--gap`, `--kpi`, `--chart-h`, `--base`. That ports to the
current vanilla stack directly, and `theme.js` already reads chart colours back out of CSS —
so the charts pick up the new palette without touching a chart builder.

React, `_ds_bundle.js` and unpkg are the preview harness, not the design. None of it ships.

### The brand system in the zip is not the design, and that is the right call

The archive also carries **House of Covebo's** design system — the staffing brand. Its
conventions say *"Status (NO red, ever)"*, put `--hoc-error` at burnt orange, lead 60 % warm
orange, and prescribe a script-font accent word in every heading plus microcopy like *"Gewoon
doen joh!"*.

**The mockup does not use it**, and must not. Three of those rules break this product rather
than restyle it:

- Red is how this page says a number cannot be trusted, and red is also the loss half of a
  diverging pair chosen for colour-vision deficiency. Recolouring errors to burnt orange on an
  orange-led page makes the one message that matters the least visible thing on it.
- An orange lead collides with `--c4`, a categorical series colour.
- Warm jokey microcopy on a reconciliation failure is the wrong register for "treat every
  number on this page as unverified".

Recorded so that nobody later reopens it as "but we have a brand".

### What the mockup gets right, and it read the brief

`--gain: #0b5fc4` / `--loss: #c02434` — blue and red, kept. Seven categorical slots plus a
neutral cash, exactly the existing rule. Severity as three full triplets (foreground,
background, rule) rather than a tinted border. And a chart label that reads *"Side of the zero
line carries the sign too"*, which is the colour-is-never-the-only-channel rule, understood.

**The palette still needs validating before it is final.** `--c1…c7` is a sensible qualitative
set, but "sensible" is what the current palette was tested for and this one has not been. Same
check, same standard: contrast on both surfaces and a colour-vision simulation.

### The three answers to what was asked

**Notifications get their own space, properly.** A warning stops being one line of text and
becomes tag / title / body / action — *"Unverified"*, *"The reconstruction disagrees with your
broker"*, the explanation, then *"Compare price by price"*. Five states are drawn, not one:
warnings, clean, syncing, failed, first run. And the strongest idea in the whole mockup: when a
red severity is present, **the KPI tiles carry it too** — *"Broker says € 108 900,00"* under
the total, *"Rests on the disputed total"* under the result. A contested number says so where
it is read, not only in a banner above it.

**Extra KPIs**: notes gain substance — fees *"Across 41 transactions"*, dividend *"withheld at
source"*, the result as *"+75,8 % on money paid in"*.

**Extra visualisations**: Drawdown from peak, Currency exposure, Allocation today, Fees paid
cumulative, Result by month — arranged under five tabs (Overview, Performance, Composition,
Income & cost, Holdings) with a count on each. That is the answer to a 3 788-pixel scroll, and
a better one than shortening the cards.

### One trap in the new charts, before anybody builds it

**Drawdown from peak must not be computed on portfolio value.** A withdrawal drops the line,
and a drawdown chart would draw that as a loss of 20 % when nothing was lost — the same error
that was caught for candles in 0.12.0, in a new shape. It goes on the deposit-free curve, the
running sum of `pnl`, where a fall means a fall.

`Fees paid, cumulative` needs a daily fee series the engine does not currently emit; everything
else is computable from what `computePortfolio` already returns.

### Order of work

| # | Stage | Why here |
|---|---|---|
| 1 | Tokens and shell — palette, spacing, radii, type, cards | Largest visible change per unit of risk, and no new data |
| 2 | Notifications in their own space, and the five states | The half that is about honesty rather than looks |
| 3 | Tabs | Structural; the toolbar's scope changes with it |
| 4 | New charts and KPI notes | Needs engine additions; sits on the final layout |

Stage 1 lands first because if the palette does not survive its contrast check, everything
after it is drawn in the wrong colours.

---

## Stories out of the second mockup

The updated mockup adds a notification centre, six KPIs and five visualisations. Split below by
deliverable and by what each one needs, because most of it is buildable today and two things
are not.

**Why most of it is cheap:** 0.13.0 put a `pnl` series on every product and 0.14.0 exposed
`hasSeries`. Between them, realised/unrealised, biggest movers, the scatter and data coverage
are all reads rather than new computation. That was not planned for; it is a dividend.

### US-18 — Notifications get a place of their own

**As someone reading this page I want to see, in one place, everything the reconstruction is
unsure about — and I do not want to be able to make it go away.**

Today a warning is one line of text in a stack of banners. In the mockup it is a panel with a
severity summary — *3 blocking · 2 estimated · 1 info*, or *All clear* — that collapses, and
each entry has four parts: a tag, a title, an explanation, and where useful an action.

Three things in it are decisions rather than decoration, and all three are right:

- **Nothing is dismissible.** The mockup states it outright: *"3 open · none dismissible"*. You
  cannot dismiss "your total does not match your broker" — dismissing it is exactly the failure
  mode the whole product exists to prevent.
- **The severity summary is a count, not a badge.** *3 blocking* is a number you can act on.
- **A contested total says so in the tile.** When a red severity is present the KPIs carry
  *"Broker says € 108 900,00"* and *"Rests on the disputed total"*. The warning travels to
  where the number is read, instead of sitting above it hoping to be noticed.

*Needs no engine work.* Every input is already in `r.warnings`, `r.reconciliation` and the
sync log — the same three the bug report reads.

*Acceptance criteria:*

- ☐ Every level the engine emits appears, grouped and counted by severity.
- ☐ No control anywhere dismisses, hides or snoozes a warning. Collapsing the panel leaves the
  severity summary and the tile flags visible.
- ☐ With a red severity present, the affected tiles say so without the panel being open.
- ☐ The five states are all reachable: warnings, clean, syncing, failed, first run.

### US-19 — Five tabs instead of one scroll

**As a user I want to find the chart I came for without scrolling past six I did not.**

Overview / Performance / Composition / Income & cost / Holdings, each with a count. The page is
3 788 px today; this is the answer, and a better one than making the cards shorter.

*One thing to decide, and it is not obvious.* The range and granularity controls are global,
and with tabs they become global-across-a-thing-you-cannot-see. Recommendation: keep them
global — the whole page describes one window, and that is the promise US-06 made — but the KPI
tiles should follow the tab rather than showing all twelve everywhere. Twelve tiles above every
tab is a wall in front of the content.

### US-20 — The six new KPIs

| KPI | Where it comes from | State |
|---|---|---|
| Realised result, *"from 23 closed positions"* | Sum of `pnl` over products whose final quantity is zero | **Available today** |
| Unrealised result, *"on what you still hold"* | The same sum over products still held | **Available today** |
| Best month / Worst month | `monthlyTable` already computes every month | **Available today** |
| Data coverage, *"73 of 2 043 days estimated"* | `result.estimated` is already a per-day flag | **Available today** |
| Annualised return, *"money-weighted, 5,6 years"* | **Needs a decision and then a solver** | See below |

**Annualised return is not one number, and the label has to say which.** Money-weighted (an
IRR over the actual cashflows) answers *"what did my money earn"*; time-weighted answers *"how
did the portfolio perform, ignoring when I paid in". They differ, sometimes by a lot, and this
page already shows a time-weighted return in the month grid. Putting a money-weighted figure
beside it without naming both is how a page contradicts itself.

*Recommendation:* build the money-weighted one, because "what did my money earn" is the
question a private investor is actually asking — and label both, everywhere, in words.

### US-21 — The five new visualisations

| Chart | Where it comes from | State |
|---|---|---|
| Biggest movers in this range | Per-holding `pnl` summed over the window — the same number the holdings table already prints | **Available today** |
| How the monthly results are spread, and the median month | `monthlyTable` | **Available today** |
| Position size against its result | Share % against per-holding result | **Available today** |
| Uninvested cash over time | `result.cash` | **Available today** |
| Currency exposure | Product currency plus `cashByCurrency` | **Available today** |
| Data quality per year | `result.estimated` grouped by year, with a third band for days with no data at all | Small addition |
| Drawdown from peak | **Must be built on the deposit-free curve** | Small addition, see the trap below |
| Fees paid, cumulative | Needs a daily fee series the engine does not emit | Small addition |

**The trap, again, in a new shape.** Drawdown from peak on *portfolio value* draws a withdrawal
as a 20 % loss. It is the candle error of 0.12.0 and the deposit error of SPEC §1.4 wearing a
third disguise, and it must be computed on the running sum of `pnl`, where a fall means a fall.

**And one the mockup gets right that is worth keeping right:** the monthly histogram colours
bars below zero as loss and above as gain, but the zero line is what actually separates them.
Colour stays the second channel.

### What this does not settle

The palette. `--c1…c7` and the gain/loss pair still have to pass the contrast and
colour-vision check the current palette passed, and that happens in stage 1 before any of this
is drawn in them.

---

## US-34 — Trading 212 *(new, refined — a spike with a brief, not yet a story)*

> As someone who holds part of my money at Trading 212, I want it in the same chart as my DEGIRO
> account, so that "what am I worth" is one number rather than two tabs and a calculator.

The compatibility study is `docs/MULTI-BROKER.md` §8; the brief that would close it is
`docs/T212-SPIKE-BRIEF.md`. This entry is what the backlog needs to know without reading either.

### Why this one is different from US-10

Trade Republic was refined against reported behaviour and three of those reports turned out to be
wrong. Trading 212 has an **official, documented API**, and the parts that are not documented are
visible in two independently-written clients that agree with each other. That is a better evidence
base — and it is still desk research, and §8e records that the strongest single piece of it is an
example response from **February 2021** on a path that has since versioned.

### What is already established

- **R2 and R3 are yes, and better shaped than DEGIRO's.** Trading 212 states the **exchange rate
  per row** rather than leaving it to be divided out of the settled amount — which is the division
  that put CHF at 107,1 — and its cash movements are **typed** (`Dividend`, `Deposit`,
  `Withdrawal`) rather than prose for `classify.js` to match. Rule 4 gets *easier* here, which is
  not what anyone expected.
- **R5 is probably yes**: an account-summary endpoint is documented.
- **R4 is answered at the shape level.** `POST /charting/v2/batch` returns daily candles as
  `{timestamp, bid:{o,h,l,c}, ask:{o,h,l,c}, volume, fake}`.
- **R1 needs no decision.** The charting endpoint is on the web host, not on `/api/v0`, so the
  cookie route is the only one that reaches prices — and a ledger without prices is not a product.
  The route that satisfies rule 9 is the only route that works. The official API key, which rule 9
  would forbid, would buy nothing anyway.

### The three things between here and a story

| # | Question | Kind | Costs |
|---|---|---|---|
| 1 | **How far back does `size` reach on the candle endpoint?** | The one real unknown. Decides the story | A logged-out browser. Trading 212 publishes instrument pages with charts to anyone |
| 2 | Does an extension's fetch carry `CUSTOMER_SESSION` / `TRADING212_SESSION_LIVE`? | Empirical. The `SameSite` question that decided Trade Republic | **An account.** Only worth asking after 1 says yes |
| 3 | **Bid, ask or mid?** | A domain decision, not an unknown. See below | Nothing. A decision |

The schemas behind R2, R3 and R5 need none of that: **Trading 212 publishes them**, and only the
API *key* requires an account. That was missed on the first pass and it is most of what the spike
was for. `docs/T212-SPIKE-BRIEF.md` is split into three phases on exactly this ordering — read the
docs, then the public chart, and only then decide whether R1 is worth anyone opening an account.

### Decision 3, stated now so it is not made by accident

DEGIRO returns one close per day. Trading 212 returns a bid and an ask, and **something has to
choose**. The honest position is that there is no obviously right answer: bid is what the position
could have been sold at, mid is how a holding is conventionally marked, and on an illiquid
instrument the spread between them is the difference between two defensible charts.

What must not happen is the parser settling it by reading whichever field comes first. **The
decision gets written down before it is coded**, and whichever way it goes, the page says which —
the same treatment `fake` candles and estimated contract sizes already get.

### Acceptance criteria

The structural ones are already in §4A and are met by US-22 having landed. Broker-specific:

- **AC1** The adapter matches `REQUIRED` in `src/lib/brokers/index.js`, and `missingMembers()`
  returns empty for it. No second fetch path: one throttled queue, per rule 5.
- **AC2** Reconciliation runs against Trading 212's own account total and is reported per broker,
  not merged into a single verdict — a cent out at one broker must not be hidden by the other.
- **AC3** **A `fake` candle never reaches the engine, and the count of them is surfaced.** Trading
  212 pads its series with synthetic values; a fabricated close entering a reconstruction silently
  is exactly the failure this project exists to prevent. `includeFake:false` is not enough on its
  own, because it is a request parameter and the response is the thing to trust.
- **AC4** An instrument the mapping cannot resolve from `TSLA_US_EQ`-style ids to something the
  engine can key on is `UNKNOWN`, counted and shown — never silently dropped.
- **AC5** Rule 7: the export and the bug report gain a second broker's fields, and each is
  allowlisted by name. `EXPORTABLE_META` and `report.js` both, with a test.
- **AC6** The chosen price basis (bid/ask/mid) is stated on the page, not only in a doc.

### What would make us stop

Written now, while it is cheap to agree to:

- **The candle endpoint caps at a few hundred days.** → The history is too short to be the chart
  this project is. Drop the story; do not source prices from a third party. That is a different
  product and it breaks the property that makes this one defensible.
- **The session cookie is not carried by an extension fetch.** → Route B closes, route A cannot
  reach prices, and the story closes with them. Rule 9 makes this final rather than a trade-off.
- **The charting endpoint is gone or unrecognisable.** → §8e said this was possible. Re-spike or
  drop; do not build against the 2021 shape.

---

## US-35 — "Put that frown upside down" *(new, to refine — a joke, and the joke has a constraint)*

> As someone who is 17k down, I want a switch that flips the chart upside down so it looks like I
> am up, because the alternative is looking at it the right way round.

Requested with a screenshot of a real account at −€ 18 943. The comedy is the point and it should
be *properly* comical rather than a tasteful 180° rotation — a CSS transform with some physical
comedy in it, a wobble, an easing that overshoots.

### The constraint, and it is not a small one

This project's whole claim is that its numbers do not lie. Rule 6 refuses a tolerance on the
reconciliation. The Outlook section is quarantined because it is the one screen showing a figure
nobody can check. `estimated` replaced `measured` on a contract size because the difference
mattered. **A feature whose entire function is to make a loss look like a gain is, read literally,
the opposite of all of that.**

That is not a reason to refuse it. It is a reason to build it so the joke cannot be mistaken for
the product:

- **It must be unmistakable in a screenshot.** A screenshot is how every finding in this project
  has travelled, and a flipped chart that looks like a normal chart is a chart that will eventually
  be sent to someone as if it were real. Whatever it does — the axis labels going with it, a
  banner, the whole page tilting — a still frame has to give it away with no context.
- **The axis has to flip too.** If the line goes up while the scale still reads € 25 000 to
  € 50 000 downward, that is not a joke, it is a wrong chart. Flip the numbers with the line and
  the picture is self-consistently absurd rather than quietly false.
- **It never touches anything that leaves the machine.** Not the export, not the bug report, not a
  tile, not a figure. The switch is a rendering state and nothing downstream may read it — the same
  quarantine Outlook already has, for the same reason.
- **It does not persist.** A joke you turned on in March should not still be on in June when you
  are actually trying to read the thing. Off on reload.
- **It is off by default and it says what it does.** Not a hidden easter egg — a labelled switch,
  because a hidden one that a user finds by accident is the "quietly false" case again.

### To refine

- Where does the switch live? A footer curiosity, or beside the range buttons where the real
  controls are? (Recommendation: the footer. It is not a control for reading your portfolio.)
- Does it flip one chart or the whole page?
- Does it also negate the numbers, or only the picture? (Recommendation: only the picture. A
  negated *figure* is the thing that could actually mislead; an upside-down *line* is visibly a
  gag.)
- Is there a sound? There should probably not be a sound.
