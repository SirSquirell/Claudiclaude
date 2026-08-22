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

## US-16 — Redesign the interface *(built, 0.46.0 — eight phases; `docs/RETIRED.md` is the ledger)*

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

## US-11b — Get a defect into the backlog without a screenshot *(built, 0.14.0 — as the clipboard export; see the delivery note at the end of this entry)*

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

## US-17 — Notice when a field DEGIRO renamed stops arriving *(built, 0.46.0)*

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

## The US-16 implementation plan, against the delivered mockup *(built, 0.46.0)*

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

**All three are answered.** The spike ran on 2026-08-11 and R1 closed on 2026-08-13; see
`MULTI-BROKER.md` §8. What stands between here and a working adapter is no longer a *question* —
it is the build (US-39–US-45) and one thing no measurement here has produced: **the account payload
shapes.** `/rest/v1/accounts`, `/rest/reports/transactions` and `/rest/reports/dividends/v2` are all
marked `hypothesis` in `tools/trading212-r1/spike.js`, meaning they came from community code and
have never been seen in a real Network tab. §8a is what building on that instead looks like.

| # | Question | Answer |
|---|---|---|
| 1 | How far back does the candle endpoint reach? | **Answered.** Daily candles to 2017 for AAPL, weekly to 2013, paginating backwards with `&to=`. And it needs **no authentication at all** |
| 2 | Can an extension reach the account data without storing a credential? | **Answered — PASS, 2026-08-12/13.** `200` with the session cookie, `401` with `credentials: 'omit'`, `401` logged out; and the service worker got the same, carrying only an `Accept` header. The API key rule 9 forbids is not needed. See `MULTI-BROKER.md` §8d and `TRADING212-R1-RESULT.md` |
| 3 | ~~Bid, ask or mid?~~ | **Moot.** One close per candle — there is nothing to choose |

The schemas behind R2, R3 and R5 need none of that: **Trading 212 publishes them**, and only the
API *key* requires an account. That was missed on the first pass and it is most of what the spike
was for. `docs/T212-SPIKE-BRIEF.md` is split into three phases on exactly this ordering — read the
docs, then the public chart, and only then decide whether R1 is worth anyone opening an account.

### ~~Decision 3~~ — withdrawn

This said Trading 212 returns a bid and an ask and something had to choose between them. It returns
**one close per candle**. The decision does not exist, and the reason it looked like it did is worth
keeping: it came from a library written against an API version that no longer exists. A decision
carefully framed on top of a wrong fact is still wrong, and it took a measurement to notice.

### Acceptance criteria

The structural ones are already in §4A and are met by US-22 having landed. Broker-specific:

- **AC1** The adapter matches `REQUIRED` in `src/lib/brokers/index.js`, and `missingMembers()`
  returns empty for it. No second fetch path: one throttled queue, per rule 5.
- **AC2** Reconciliation runs against Trading 212's own account total and is reported per broker,
  not merged into a single verdict — a cent out at one broker must not be hidden by the other.
- ~~**AC3** A `fake` candle never reaches the engine~~ — **moot.** The real endpoint has no such
  flag; the 2021 library that suggested one described a superseded API. Replaced by: **a candle is
  a 6-element array and its shape is validated on arrival.** These are undocumented internal
  endpoints with no changelog, so a changed array format must fail loudly rather than quietly
  produce numbers.
- **AC4** An instrument the mapping cannot resolve from `TSLA_US_EQ`-style ids to something the
  engine can key on is `UNKNOWN`, counted and shown — never silently dropped.
- **AC5** Rule 7: the export and the bug report gain a second broker's fields, and each is
  allowlisted by name. `EXPORTABLE_META` and `report.js` both, with a test.
- **AC6** The chosen price basis (bid/ask/mid) is stated on the page, not only in a doc.

### What would make us stop

Written now, while it is cheap to agree to:

- ~~**The candle endpoint caps at a few hundred days.**~~ → It does not. Daily to 2017, weekly to
  2013. This stop condition is cleared.
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

---

## US-35b — Optimism Mode, phase two *(built, 0.50.0 — the charts half went via US-35c/US-35d; the tiles, and then more of them)*

0.39.0 shipped the switch, the stamp, the flipped tiles and the confetti. Two things were asked for
after seeing it work, and one of them needs a decision before it is built.

### The charts — *superseded, see US-35c below*

**Reflect the series about its own midpoint**, rather than flipping the canvas.

`transform: scaleY(-1)` on the canvas is one line and wrong: the axis labels are drawn *inside* the
canvas, so they mirror into unreadable glyphs and the picture becomes noise rather than a joke. A
joke has to be legible to land.

Reflecting the data — `y' = (min + max) − y` — inverts the *shape* while leaving the axis reading
in real euros at real gridlines. A line that fell from €22 to €0 climbs from €0 to €22. It is
absurd and it is readable, which is the whole design brief for this feature, and it is why the
stamp exists.

Explicitly **not** negating the values (`y' = −y`), which would put the line in negative territory
and look like a bug rather than a bit.

### The tiles

Replace them outright rather than flipping the existing ones. A flipped "Deepest fall" is a joke
about a tile; a tile that says **"847 DAYS OF UNWAVERING BELIEF"** is a joke about the person, and
that is funnier.

Six, computed from the real result and nothing invented:

| Tile | From | Why it is funny |
|---|---|---|
| **Conviction** | days held on the worst position | The number is real and the framing is not |
| **Discount secured** | total loss, as money "saved" | Reframes the loss without changing it |
| **Moon progress** | how far back to break-even, as a percentage | A progress bar towards zero |
| **Diamond hands** | a rating out of ten, from how long losers were held | Arbitrary scale, honest input |
| **Tuition** | realised losses | Everyone recognises it |
| **Still believing in** | the worst holding, **by name** | The punchline, and it is their own data |

The last one is the point. Naming the instrument is what makes it land — *"Still believing in PROP"*
beats *"still believing in your worst position"* — and it is safe for exactly the reason the rest of
this feature is safe: it renders on their own screen and **nothing downstream can see it**. The
existing tests pin that. Instrument names are already on screen elsewhere; what must never happen is
one reaching the export or the bug report, and this touches neither.

Where the account is **up**, the tiles say so and get out of the way. A joke about losses on a
winning account is not a joke, it is a wrong page.

### Built, and then turned up again on request

The six tiles shipped as twelve (losing) and ten (winning); `STATUS.md` said "never built" for two
releases because nothing updated the row. The owner's answer when asked whether the joke was still
wanted was **"nog meer over de top"**, so:

- **A news crawl, twice** — above and below the wall of tiles, running in opposite directions. Every
  item is a figure the tiles already carry, restated in the register being made fun of, which is the
  property that keeps this side honest: no new arithmetic, so nothing here can be wrong in a new way.
  `NOT THE REAL NUMBERS` is one of the items on purpose.
- **Eighteen tiles**, and the four new computed ones are real measurements: *Hopium reserves* is the
  share of days the account sat below its own running peak, *Time in market* is the history's length,
  *Bags held* is every instrument ever owned, *Break-even ETA* is the remaining distance to the money
  put in. The rest are constants that are jokes rather than figures (*Nights lost to this: 0*).
- **A rocket, a spinning switch, a breathing stamp, per-tile lean, half again as much confetti.**

Two limits the escalation ran into, both found in a browser and both worth keeping written down:

1. **`npm run type` refused the rocket** until it stated its tracking, and the *right* token is
   `--kpi-track` rather than `--track-display` — a rule pinning the display value directly is the
   defect US-58 measured its way out of, and `test/motion.test.js` fails the build for it.
2. **On a 380 px viewport the lean pushed the hero tile's left edge to −8 px**, and zeroing
   `transform` did nothing: `frown-lurch` runs with `fill: both`, so the last keyframe *holds* the
   rotation and outranks any declaration. The animation has to be switched off with it. The tilt is
   what goes on a phone — the crawl, the stamp, the glow and the confetti stay, because the thesis is
   *absurd and legible* and a joke nobody can read is only a broken page.

**The joke stays English** on a Dutch page, and that is a choice rather than a gap: *diamond hands*,
*STRONG BUY* and *to the moon* are English in Dutch too, and a translated meme is a joke explained.
Everything structural around it — the stamp, the button's label — goes through `t()` as before.


---

## US-35c — Invert the *performance*, not the levels *(built, 0.42.0 — superseded by US-35d in 0.46.0)*

0.41.0 reflects the value series about its own midpoint. Rejected on sight, and correctly:

> *"nu mirror je m gwn en lijkt t nergens op"*

Visual comparison: <https://claude.ai/code/artifact/51f24b32-25c0-4103-830e-05aff193cf17>

### Why the mirror is wrong

Not because it is a mirror. Because it inverts the **deposits along with everything else**. Every
moment money went *in* becomes a step *down*, the starting value is invented, and the shape no
longer corresponds to anything that happened.

Worth recording so nobody re-derives it: *"invert every daily change"* — the natural way to describe
what is wanted — is **the same operation**. `out[i] = out[i-1] − (v[i] − v[i-1])` expands to
`2·v[0] − v[i]`, a reflection about the first value. Reformulating does not fix it; the deposits
still invert.

### What it should be

```
flipped[i] = 2 × cumulativeDeposited[i] − value[i]
```

The value line is `deposits + cumulative P/L`. This keeps the deposits and negates only the P/L:

| | Real | Flipped |
|---|---|---|
| Paid in | € 17.000 | € 17.000 |
| Worth | € 3.300 | € 30.700 |
| Result | −€ 13.700 | **+€ 13.700** |

Every week that sank now climbs by the same amount. A deposit is still a step up, a withdrawal is
still a drop, and the line ends exactly as far *above* what was paid in as it really sits below it.

It is also the safer of the two, which is the argument that settles it. A mirrored chart is quietly
plausible — it is a chart that *could* be true. This one says you have € 30.700 on € 17.000 paid in,
beside a stamp saying it is not real. Absurdity is the safety mechanism; plausibility is the danger.

### A fourth option, worth looking at first: **UP ONLY**

```
out[i] = out[i-1] + |v[i] − v[i-1]|
```

Every movement, up or down, becomes an up movement. The line is *incapable* of falling.

It is the least defensible and the most obviously a joke, which by this feature's own logic makes
it the safest — nobody mistakes a monotonic staircase for a portfolio. Against it: it throws the
shape away entirely, so the account stops being recognisably yours, and half the comedy of the
other option is that the crash is still visible, just pointing the other way.

### The prototype

**`docs/prototypes/optimism-flip.html`** — open it in a browser, no build, no dependencies. Four
buttons, the same invented account in each, and the transform's own source printed underneath.
The functions are pure `(value, deposits) → number[]`, which is the shape `frown.flipSeries` takes,
so they can be lifted verbatim.

One thing the prototype settled on its own: **the mirror does not even achieve the goal.** On this
account it still reports a loss — −€ 7 200 instead of −€ 13 700. It makes the number smaller and
the picture wrong, which is the worst of both.

### Still to decide before building

- **The second chart, *Money paid in vs what it is worth*.** The flipped value line would cross the
  deposits line rather than sit under it. Possibly the funniest part of this, possibly confusing —
  look at it before deciding.
- **The axis.** Rescale to the flipped range, or leave it on the real values so the line wanders off
  the top? The second is funnier and might be unreadable.
- **A rising account.** 0.41.0 leaves one alone. Under this formula there is nothing to leave alone —
  a winning account flipped becomes a losing one, so the guard stays: only flip when the result is
  negative.


---

## US-35d — Do not deform the chart. Draw a different one. *(built, 0.46.0)*

> *"ik hoef niet dat je de graph verwisseld ik wil idd gwn dat je een nieuwe graph verzint, die
> natuurlijk wel ERGENS op slaat"*

This supersedes the whole transform question, and it is a better idea than any of the three
answers to it. Every option in US-35c deforms the real value chart, which is why each one had a
tell: the mirror inverts the deposit steps, UP ONLY discards the shape, and even the honest P/L
inversion is a chart claiming to be the value line while not being it.

**Leave the value chart alone. Add a chart that is true when read straight and happens to climb
when things go badly.** Both candidates are in the prototype, marked ★.

### Candidate 1 — Upside remaining

```
upside[i] = max(0, cumulativeDeposited[i] − value[i])
```

What you stand to make getting back to break-even. It is **literally true**: on the example account
it ends at € 13.700, which is exactly what was lost. The sign is turned around by the *framing*, not
by arithmetic — which is the difference between a joke and a lie, and it is why this one can carry
a straight face.

### Candidate 2 — Conviction index

```
peak = running max of value
score += max(0, (peak − value) / peak) × 100   // one point per day, scaled by depth
```

A point for every day held under water, weighted by how far under. A real behavioural measure —
unrealised pain sat through without capitulating — and a line that **can only rise** for anyone
whose portfolio is down. On the example account it accelerates into a near-vertical climb while the
portfolio collapses, which is exactly the picture.

Reads best of the two, because the *shape* is funny rather than only the framing: it goes parabolic
precisely when things are worst.

### Why this is also the safest version yet

Every earlier option produced something shaped like a portfolio value chart while not being one.
These are not pretending to be that chart at all — different axis, different units, its own title,
and the deposits line correctly absent. There is nothing to mistake, which means the joke no longer
leans entirely on the stamp.

### Decided

**Both, and they replace the real charts rather than sitting beside them.** One for one, in place,
so the Overview keeps its shape and nothing new has to be laid out:

| Slot | Normally | With the mode on |
|---|---|---|
| First chart | Portfolio value including cash | **Conviction index** |
| Second chart | Money paid in vs what it is worth | **Upside remaining** |

Replacing rather than adding also settles a smaller thing for free: the real charts are simply not
rendered while the mode is on, so there is no window in which a flipped chart and a real one are on
screen together to be confused with each other.

### The copy — every string names PROP

The gate already guarantees the reader holds it, so the name can be used without a fallback path
being exercised in practice. `subjectOf(r)` supplies it; nothing is hardcoded below the constant.

**Conviction index**
- Title: `Belief in {PROP}, over time`
- Subtitle: `One point for every day you held {PROP} while it was under water, weighted by how far
  under. It has never gone down. Neither should you.`
- Axis: `pts`
- Empty state cannot occur — the gate saw to it.

**Upside remaining**
- Title: `What {PROP} still owes you`
- Subtitle: `How much you make the moment {PROP} returns to what you paid. This is the number that
  grows when things go badly, which is why it is the only chart worth looking at.`
- Axis: euros.

Both keep the stamp over them, and both are drawn in the gain colour whatever they contain.

### Implementation notes, so tomorrow is typing

- The two functions are in `docs/prototypes/optimism-flip.html`, pure and
  `(value, deposits) => number[]`. Lift verbatim into `src/ui/frown.js` beside `flipSeries`.
- `flipSeries` and its call site in `app.js` come **out**. US-35c is dead; nothing should keep a
  transform nobody chose.
- The swap belongs where `cheer()` currently sits in `render()` — same place, same guard
  (`frown.isOn() && state.tab === 'overview'`), and the guard already includes the PROP gate via
  `onOverview`.
- The deposits series must not be drawn on either chart: it means nothing on both. The prototype
  shows the legend handling for this.
- Chart titles and subtitles are rendered from the DOM, not from the chart library — so they are
  swapped by setting `textContent`, and they need `tr()` entries like everything else.
- Tests: one that each function is monotonically non-decreasing on a losing account, one that the
  copy contains the subject's name, and the existing quarantine test already covers the rest.

---

## US-37 — Trading 212 R1: can the account data be read without storing a credential? *(refined)*

The last question standing for Trading 212. `MULTI-BROKER.md` §8 has the rest, measured.

> **Can Claudiclaude read Trading 212 account data while the user is already logged in to the
> Trading 212 website, without storing a password, API key, secret, token or any other durable
> broker credential?**

R1 is a gate, not a difficulty. Rule 9 makes a "no" final — not "revisit with a key form".

### The repository scan, done — 2026-08-11

The spike proposal asks for this before any code. It is cheap, so here it is.

| Found | Where | DEGIRO-specific? | Reusable? |
|---|---|---|---|
| `chrome.cookies.get({url, name:'JSESSIONID'})` | `session.js:19` | The **name and host** are; the mechanism is not | Yes, with both parameterised |
| `credentials: 'include'` | `degiro.js:124`, the **only** occurrence in the codebase | No | **Yes — and this is the finding, see below** |
| `host_permissions` | `manifest.json` — `trader.degiro.nl`, `charting.vwdservices.com` | Yes | Add hosts; no structural change |
| `permissions: ["cookies"]` | `manifest.json` | No | Already granted |
| `intAccount` / `userToken` | `session.js`, `diagnose.js`, `brokers/degiro.js:54`, and both allowlists in `store.js` | **Yes, entirely** | No. These are DEGIRO's identifiers |
| `Authorization` header | **nowhere** | — | The codebase has never sent one, which is rule 9 visible in the absence |

### What the scan settles, and it is most of H3

**The extension never copies a cookie value in order to send it.** `degiro.js` issues
`credentials: 'include'` and the browser attaches the cookie itself. `readSessionId()` reads the
value separately, and only because DEGIRO puts `sessionId` in the *query string* — a DEGIRO quirk,
not the auth mechanism.

Two consequences:

- **H3 is largely answered by precedent.** An MV3 service worker with a host permission already
  performs authenticated read-only requests this way, in production, against a real broker. What is
  unknown is not *whether MV3 can* — it is whether **Trading 212's cookies are attached** on such a
  request, which is a `SameSite` question about their cookies and nothing about our architecture.
- **Trading 212 could be *cleaner* than DEGIRO on rule 9.** If its endpoints authenticate purely by
  cookie, the extension never reads a credential value at all. DEGIRO is the weaker case, and it is
  the one already shipped.

### The one experiment

Needs a logged-in account and nothing else. `docs/T212-SPIKE-BRIEF.md` has the full prompt; the
decisive part:

> Take one request that fills the portfolio page, *Copy as fetch*, and re-run it in the Console with
> `credentials: 'include'` and again with `credentials: 'omit'`. Report both status codes.

`include` succeeding and `omit` failing is R1 answered yes. Both failing means the page authenticates
with something it holds in memory, and that is rule 9 territory.

### Acceptance criteria for the spike itself

Not for an adapter — for the spike.

- **AC1** No credential is stored, at any point, including during the experiment. Nothing is written
  to `IndexedDB` or `chrome.storage`.
- **AC2** No spike code merges to `main` behind a feature flag "for later". Rule 8: if R1 fails, the
  code is deleted, not disabled.
- **AC3** Findings land in `MULTI-BROKER.md` §8 marked **MEASURED**, in the same shape as the rest,
  with any earlier claim that turns out wrong named at the top rather than quietly corrected.
- **AC4** No value from a real account enters `test/` or any doc. Rule 7.
- **AC5** `manifest.json` gains no host permission until R1 has come back yes. A permission granted
  speculatively is a permission the user is asked to approve for nothing.

### Stop conditions, agreed now

- **`omit` and `include` behave the same** → the session is not cookie-borne. Likely a token the page
  mints; rule 9 says stop.
- **Only the documented API key works** → stop, and record Trading 212 as *a price source with no
  portfolio*, which is not a product.
- **The endpoints exist but need a header the page computes** → a rule 9 judgement, not a technical
  one, and it goes to the user rather than being decided in code.

### What is explicitly not in scope

Not a release, not an adapter, not an API-key form, no browser automation, no `BrokerConnector`, no
plugin loader, no capability flags. Everything in that list either exists already or is forbidden by
rule 8.

---

## US-45 — Parameterise the session read *(built — US-37 said yes; salvaged to main 2026-08-18)*

> Renumbered twice on 2026-08-11: US-38 → US-44 → US-45. An external brief claimed US-38 for
> onboarding contracts and then US-44 for the addendum below. Two stories under one number is worse
> than either name, and this one is the least load-bearing of the three.

`session.js:19` hardcodes `JSESSIONID` and DEGIRO's host. That is the single line standing between
the current session layer and a second broker using it.

**Deliberately deferred until R1 clears.** Rule 8: it is a generalisation with one implementation
until there is a second, and if R1 fails there never is one. Recorded so the finding is not lost,
not so it gets built.


---

## US-39 … US-43 — the multi-broker delivery sequence *(external brief, gated on US-37)*

An external delivery brief proposes onboarding contracts (US-38), a broker management UI (US-39),
the Trading 212 adapter (US-40), storage namespacing (US-41), multi-broker sync and reconciliation
(US-42) and release hardening (US-43). It is consistent with this backlog and with `CLAUDE.md`, and
it is correctly gated: **none of it starts before US-37 passes.**

Three deviations found when it was checked against the repository, recorded so they are not
rediscovered:

1. **`GET /rest/v1/accounts` is a hypothesis, not a measurement.** It appears nowhere in
   `MULTI-BROKER.md` §8. The only Trading 212 host this project has measured anything on is
   `live.services.trading212.com`, and only its charting paths. `READ_PATHS` in the spike marks each
   path `measured` or `hypothesis` for exactly this reason, and a test pins that no third value can
   appear.
2. **US-38 collided with an existing story.** Resolved by renumbering the local one to US-44.
3. **The brief says "build the full US-37 spike and tests" — the decisive part cannot be built.**
   It is two lines in a browser console and it needs an account nobody on this project has. What
   *has* been built is everything around it: the target gate, the classifier, the shape describer,
   the verdict function and 19 tests. `docs/TRADING212-R1-RESULT.md` has the measurement fields
   open.

One judgement recorded rather than silently applied: the brief specifies a service-worker probe and
a temporary host permission. **Neither is built yet**, because its own ordering says the page-context
baseline comes first, and a host permission granted before there is anything to use it for is one
the user approves for nothing. That is US-37's AC5.


---

## US-44 — Trading 212 renders through the existing pipeline, not beside it *(from an addendum)*

**Gate: US-37 passed, and the R2–R5 data gates cleared.** Nothing here starts earlier.

> ⚠ **The addendum's own text did not arrive** — only the instructions around it: add as US-44, does
> not change US-37's order or scope, refine against the current codebase and the existing visual
> pipeline, and **build no separate Trading 212 dashboard**. What follows is that requirement
> refined against the code. If the addendum contains anything beyond it, this needs revisiting.

### The requirement

One dashboard. A second broker's data enters at the adapter and comes out through the same engine,
the same combining and the same charts. There is no Trading 212 view, no Trading 212 tile, and no
Trading 212 branch in a chart builder.

### What already enforces this — refined against the code

The architecture is largely there, which is the useful finding:

| Mechanism | Where | State |
|---|---|---|
| Every result already goes through the combiner | `datasource.js` — `asPortfolio()` wraps even the single DEGIRO result | **Live.** The multi-broker path is the only path, on every page load |
| The combiner returns a single part untouched | `combine.js`, acceptance criterion A5, pinned by test T8 | **Live and tested** |
| The engine is broker-agnostic | `engine.js` takes plain arrays; it has never named a broker | **Holds** |
| Adapters normalise before the engine | `brokers/index.js` — `parseCashRows` returns rows already carrying a category | **Holds** |

So US-44 is mostly *not regressing* something that already works, rather than building it.

### What actually has to change, and it is short

- **`app.js` names DEGIRO 24 times.** Some are labels in strings, some are code paths. The
  `COPILOT-ARCHITECTURE-BRIEF.md` asks for exactly that distinction; this story consumes the answer.
  A label is fine — the page may say which broker a row came from. A *branch* is not.
- **Per-broker provenance without per-broker rendering.** A holding, a cash row and a dividend keep
  which broker they came from, and the UI can filter on it. Filtering changes presentation; it does
  not change truth. That is US-24, already refined and deferred.
- **Reconciliation stays per broker** and is shown per broker. Rule 6 must not be softened by
  combining: a cent out at one broker cannot be hidden by another. `combine.js` already carries
  this; the UI has to display it.

### Acceptance criteria

- **AC1** No file under `src/ui/` gains a broker-specific branch. A broker *name* rendered as data
  is allowed; `if (broker === 'trading212')` is not.
- **AC2** No chart builder in `charts.js` takes a broker argument.
- **AC3** `engine.js` and `combine.js` are unchanged, unless a demonstrable generic bug says
  otherwise — and then it is called out as a change to the numbers, not a refactor.
- **AC4** With one broker connected, every figure on the dashboard is **byte-identical** to before
  the second adapter existed. This is the regression that matters and it is testable today.
- **AC5** Per-broker reconciliation is visible. Combining does not average two verdicts into one.

### Stop condition

If rendering Trading 212 through the existing pipeline requires a special case in the UI or the
engine, **stop and report it** rather than adding the branch. That special case is the finding: it
means the normalisation belongs in the adapter and has been pushed too far downstream.

---

# Refinement 0.43 — three requests from the owner

Three stories, refined against the code on `main`. They are related in a way the request did not
say out loud: **US-46 decides what US-47 is allowed to put in a picture, and US-48 puts something
in that picture too.** Built in any other order they contradict each other.

---

## US-46 — Anonymize: hide the amounts, keep the percentages *(built, 0.44.0)*

> *"een hide toggle die heet anonimize, die dus alle getallen blurt en enkel percentages laat zien
> zodat iemand kan flexen met de gains"*

### What this is, and what it is not

**A screen-privacy feature.** It protects against a shoulder, a stream, a screen share and a
screenshot. It is not a security control, and the difference decides the implementation.

A CSS `filter: blur()` leaves the real string in the DOM. Select it, copy it, open devtools, or —
and this is the one that matters — hand the DOM to the snapshot renderer in US-47, and the number
is back. So a blur is the right *look* and the wrong *mechanism*.

**The mechanism is replacement; the blur is cosmetics on top.** When anonymize is on, the formatter
returns a mask. There is no number anywhere to recover.

### Where the numbers are

| Surface | Count | |
|---|---:|---|
| `app.js` | 54 | KPI tiles, holdings table, cash row, notices |
| `charts.js` | 27 | y-axis ticks and tooltip callbacks across 14 charts |
| `popup.js` | 5 | the small summary |

Eighty-six call sites, and every one of them goes through three functions in `theme.js`:
`fmtEur`, `fmtEurCents`, `fmtSigned`. **That is the choke point, and it is why this story is small.**

### Allowlist, not denylist — rule 7's shape applied to a screen

The tempting build is to tag the money elements and blur those. That is a denylist, and CLAUDE.md
rule 7 says exactly what happens next: the field added in six months ships visible, and keeps
shipping until somebody notices. The 0.10.0 export leaked three fields that way.

So: **anonymize lives inside the formatters.** A new money field added next year is masked because
it had to call `fmtEurCents` to be money at all. What stays visible is declared — percentages,
dates, instrument names, quantities of *time*, colours — and everything that formats as currency is
masked by default.

This needs one guard, and it is testable: **no currency formatting outside `theme.js`.** A grep for
`style: 'currency'` and for `toLocaleString` with a currency option, over `src/ui/`, must find
nothing but `theme.js`. Without it the choke point leaks the first time someone formats a euro
inline.

### The leak nobody asks about: quantity is an amount

`137 × AAPL` with a price anyone can look up is the position's value. Average-paid and unit-price
columns are the same story more directly. **Quantities and per-unit prices mask too**, or the
feature leaks through arithmetic and looks like it works.

Percentages, by contrast, are the point of the feature and stay: percent of portfolio, percent
grown, percent lost, the return figures. Someone can flex 340 % without saying on what.

### What must not be softened

**Rule 6 outranks this.** The reconciliation banner may mask the amount it is off by; it may not
stop being red, and it may not stop saying it is off. A hidden number is a preference. A hidden
disagreement with the broker is a false clean bill of health, and this project's whole claim is
that it does not do that.

The same for the `UNKNOWN` cash-row count and the price-gap warnings: the *count* is a number, and
masking it would hide a data-quality problem behind a privacy setting. Counts of problems are not
amounts. They stay.

### One decision left

Does the mask preserve digit count — `€ ••.•••,••` versus a fixed `€ •••`? Preserving it leaks the
magnitude, and magnitude is most of the flex. Both are defensible; it is a decision rather than an
accident. **Default: fixed width, leaking nothing.** Changing it is one constant.

### Acceptance criteria

- **AC1** A toggle labelled *Anonymize*, persisted in `localStorage` like the theme, default off.
  A display preference, not account data.
- **AC2** With it on, no euro amount and no share quantity appears anywhere on the page, in any
  tooltip, on any axis tick, or in the popup.
- **AC3** The masked value is **not in the DOM**. Asserted by reading `textContent`, not by looking.
- **AC4** Every percentage still renders.
- **AC5** The reconciliation verdict still renders, still in red when it disagrees, with the amount
  masked. Warning *counts* still render.
- **AC6** No currency formatting exists outside `theme.js`. Enforced by a test over the source.
- **AC7** Turning it off restores every figure exactly. No recomputation, no refetch — it is a
  formatting flag and nothing upstream of the formatter knows it exists.

### Stop condition

If masking requires touching `engine.js`, the design is wrong: a display preference has reached the
computation path, which rule 1 forbids.

---

## US-47 — A shareable snapshot per position, on the clipboard *(built, 0.44.0 — extended through 0.47.0)*

> *"een share to discord button per positie waarbij we een certified snapshot maken in de vorm van
> een shot oid die meteen op het klembord wordt gezet"*

### Two corrections, and one of them is the whole story

**1. Nothing goes to Discord.** The described mechanism — an image on the clipboard, pasted by the
user — is already the right one, and it is right for a reason worth writing down: a webhook URL is a
stored credential and an outbound egress path, which is rule 9 and rule 7 in one line. **The button
says Discord and talks to the clipboard.** It must not later grow a network call; if that is ever
wanted it is a different story with a different conversation.

**2. "Certified" cannot mean what it sounds like, and shipping the word anyway would be the most
dishonest thing in this codebase.** There is no authority. Any signature the extension can produce,
anyone holding the extension can forge — the key would be sitting in the source. A certification
badge that can be faked is worse than none, because it lends credibility to the fakes.

What this project *can* honestly put on a card is **provenance**, and one piece of it is genuinely
strong:

| Claim | Can we make it? |
|---|---|
| This came from a real broker account | **No.** Unfalsifiable from inside the extension |
| This is the poster's account | **No** |
| These figures reconcile to the cent against the broker's own reported total, on this date | **Yes.** Rule 6 already computes exactly this |
| Broker, date range, extension version | **Yes** |

So the badge reads *reconciled against DEGIRO, 12 Aug 2026* — and, when it does not, **it says
that instead**. A snapshot from an account that is € 40 000 out that carries a clean badge is the
lie this project exists not to tell.

### How the image gets made

No `html2canvas`: it is a remote script and MV3's CSP forbids it, and vendoring a DOM rasteriser for
one card is a lot of surface. **Draw the card on a `<canvas>` by hand**, which is better anyway:

- A DOM capture ships whatever happens to be on screen — an open tooltip, the row above, a
  reconciliation banner. A hand-drawn card ships **a declared field list**, which is rule 7.
- The sparkline is a path from `p.pnl`; no chart library needed. Chart.js offscreen is available if
  the shape gets ambitious, but it should not.
- `canvas.toBlob()` → `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`.
  Needs a user gesture and a focused document. `app.js:2943` already handles the not-focused
  rejection for text and its message is reusable.

### The field list

Declared, and nothing else reaches the canvas:

| On the card | Never on the card |
|---|---|
| Instrument name and symbol | Quantity, average paid, unit price |
| The period | Account total, any other position |
| Result **as a percentage** | Any account, session or user identifier |
| Result **as an amount, only when US-46 is off** | The broker's own reported total |
| The sparkline shape | The reconciliation *amount* |
| Provenance: broker, date, reconciliation verdict, version | |

**US-46 governs the amount.** Anonymize on means the card has no euros — which for a post meant to
be public is the sensible default regardless.

### Testable seam

`snapshotModel(position, opts)` is **pure** and returns the object that will be drawn.
`drawSnapshot(model, ctx)` touches the canvas and holds no decisions. The leak test asserts the
*model's* key set against the allowlist, with a poisoned fixture, in the same shape as the export's
guard — a PNG cannot be grepped, so the pixels are not where this is checked.

### Acceptance criteria

- **AC1** A small action on each holdings row. One click, one image, on the clipboard.
- **AC2** No network request. Asserted structurally: no `fetch` in the snapshot module.
- **AC3** The card's model contains only allowlisted keys. A poisoned fixture cannot get a value
  through.
- **AC4** The provenance line states the reconciliation verdict truthfully, including when it fails.
- **AC5** With US-46 on, the card carries no amount.
- **AC6** A clipboard refusal is reported to the user, not swallowed.
- **AC7** The word "certified" does not appear on the card unless it is qualified by what was
  actually checked.

### Stop condition

If the card needs a field that is not on the list, **the list is amended deliberately and the reason
recorded** — never widened at the call site. That is how the 0.10.0 export leaked.

---

## US-48 — A watermark behind the tables and the charts *(built, 0.44.0)*

> *"achter alle tabellen en grafieken een watermerk … een half transparent pngtje … links boven de
> grafieken ofzo"*

### Blocked on one thing

The PNG. Until it exists this cannot be built, so the asset contract is settled now:

- **Bundled**, under `assets/`, not fetched. CSP forbids remote images and the extension works
  offline.
- **Monochrome with an alpha channel**, not a coloured logo. One coloured asset is invisible on one
  of the two themes, and this project ships light, dark and auto. A mono asset is tinted per theme
  at draw time from an existing token. Two PNGs also works and is worse to maintain.
- **At least 2× the drawn size**, for the same reason the icons are.

### Tables and charts are two different problems

| | Mechanism | Note |
|---|---|---|
| Tables | CSS `background-image` on the card | Trivial, and correct |
| Charts | **A Chart.js plugin**, `beforeDraw`, `drawImage` at low alpha | `charts.js` already registers four plugins; this is a fifth of about fifteen lines |

CSS behind a canvas *appears* to work — Chart.js canvases are transparent — but it does not
composite into the canvas, so it is absent from any image US-47 produces and it does not move with
the chart on zoom. The plugin route puts it in the pixels, which is what a watermark on a shared
image has to mean.

### The thing that will actually go wrong

**Contrast.** CLAUDE.md's chart rules describe a palette that was validated against a specific
surface, and notes that slots 3–5 are already below 3:1 on the light one, with the holdings table as
the required relief. A watermark changes that surface. Every series gets harder to see, and the
validation stops being a validation.

Two ways out, and the second is what the request already asked for:

1. Cap the alpha low enough that surface luminance barely shifts, and **measure it** rather than
   picking by eye — the cap is a number derived from the existing threshold, not a taste.
2. **Draw it in the padding, not under the plot area.** Top-left, outside the data box, is where the
   request put it anyway. Nothing overlaps the series, the contrast question does not arise, and
   the watermark is more legible for it.

Recommendation: **(2), with (1) as the cap for the table backgrounds**, where there is no series to
compete with and the watermark can sit behind the content.

### Rule 8

One image, one position, one opacity, three constants in `config.js`. **Not** a watermark system
with positions, multiple assets, per-chart overrides or a settings panel. If a second position is
ever wanted, that is when the second position gets built.

### Acceptance criteria

- **AC1** The mark appears behind every table card and on every chart, from one asset and one
  opacity constant.
- **AC2** It is legible in light, dark and auto, from a single monochrome asset.
- **AC3** It does not overlap the plot area of any chart.
- **AC4** No chart's series colours change, and no contrast check that passed before fails after.
- **AC5** It composites into the canvas, so it survives into a US-47 snapshot.
- **AC6** No remote request. The asset is bundled.

### Stop condition

If the mark cannot be placed without sitting under the series on some chart, **report it rather than
lowering the opacity until it looks acceptable.** An opacity chosen by eye against one theme is how
the palette work gets quietly undone.

---

# Refinement 0.45 — two requests from the owner, both landing in the UI overhaul

Two stories, refined against the code on `main`. Neither is a new number: everything both of
them need is already computed and already on screen. **US-49 is a layout decision and US-50 is a
defect**, and it is worth keeping that distinction, because a defect that ships inside a redesign
gets remembered as "the redesign broke it".

They meet in one place. US-49 is the table US-47's snapshot button lives in, and US-50 fixes the
line that button draws — so the redesign that moves the button must not lose it, and the card that
comes out of it must be the fixed one.

---

## US-49 — One table for a position, not two *(built, 0.46.0)*

> *"can this overview be combined must include the paid in vs grown charts from the holdings, and
> the total dividends recieved from the profit and loss per product"*

### The request is right, and the reason is stronger than "fewer cards"

Both tables read the same array. `renderHoldings` (`app.js:2765`) and `renderProducts`
(`app.js:2609`) each map `r.byProduct`, and three columns are *literally the same expression* in
both — the name, `p.current`, and `sumWindow(p.pnl, from, to)`. So today a reader answering "how is
EQQQ doing" scrolls between two cards, matches a row by name, and holds four figures in their head
to do it. That is the actual complaint, and combining is the fix.

| | `#holdings` | `#products` |
|---|---|---|
| Rows | open positions only (`Math.abs(p.current) > 0.005`) — 4 in the screenshot | everything ever traded — 138 |
| Instrument, value, result | ✅ | ✅ *(same expression)* |
| Quantity, price, average paid, share % | ✅ | — |
| Paid in vs grown | ✅ | — |
| Type, status, bought, sold, **dividend**, % of bought | — | ✅ |
| Cash | a row, and it is load-bearing | — |
| Snapshot button (US-47) | ✅ | — |

### The one thing that will silently go wrong

**Half of these columns follow the range control and half do not, and nothing on screen says which.**

`result` is `sumWindow(p.pnl, from, to)` — windowed. `bought`, `sold`, `dividend` and `current` are
all-time scalars off the engine (`engine.js:1266-1270`); `paidIn` is read as `.at(-1)`, also
all-time. Today that inconsistency is *survivable* because the two tables sit in separate cards with
separate hints. Put them in one row and you get 1Y selected, a result of +€ 1 200 beside a dividend
of € 7 915 covering six years, and a reader who divides one by the other. Nobody typed a wrong
number; the layout invented the comparison.

Two honest resolutions, and picking neither is what ships the bug:

1. **Window everything.** Needs per-day `bought`/`sold`/`dividend` series per product, which the
   engine does not currently keep. Real work, and it makes the dividend column disagree with the
   Dividend received tile unless that is windowed too.
2. **Declare the span per column.** All-time columns carry it in the header — *Dividend (all time)* —
   and the range control visibly governs only what it governs.

**Decided: 2.** Rule 8 — nobody has asked to see dividend-in-window, and option 1 adds three
series per product to serve a column that would then need its own explanation. If someone does ask,
that is a story and it starts by windowing the tile too.

### The second thing: two percentages that disagree, honestly

`% of bought` is `result / bought` — the money that ever went in, gross, including the part already
sold. The split bar is `paidIn` versus `current` — the money *still* in it. For a position bought
and mostly sold, these are far apart, and both are correct. On one row they read as a contradiction.

So they do not both ship as bare percentages. **The bar keeps its sentence** — it already carries
`72% paid in · 28% grown` as text, which is what makes it readable and is also what keeps it from
being colour-alone — and the numeric column keeps a header that names its denominator. Two columns
may not share a name and differ; that rule is already written into `renderProducts`' comment about
Dividend, and it applies here to the return figures.

### Rows: the table is 4 rows today and 138 combined

A merge that replaces four open positions with 138 mostly-closed ones has not combined anything, it
has buried the thing the user opens the page for. **The combined table defaults to open positions**
and takes a segmented control — *Open · Closed · All* — beside the existing *Table · Share* toggle
and the type chips, which merge into one filter row above the table (`interaction.md`: filters in a
single row above, not scattered per card).

`Status` therefore stops being a column and becomes the filter, which is a column back. Under *Open*,
the closed-only columns (`Sold`) still mean something and stay; under *Closed*, `Quantity`, `Price`
and `Share %` are all `—` for every row and are dropped from that view rather than rendered as a
column of dashes.

### The column list, because "combine" without one means fifteen columns

Fifteen columns is not a table, it is a spreadsheet, and at this width every one of them is
unreadable. What survives, and why:

| Column | Span | Why it stays |
|---|---|---|
| Instrument + swatch + symbol | — | The swatch ties the row to the stacked chart. Non-negotiable |
| Quantity | latest | Open view only |
| Value | latest | |
| **Paid in vs grown** (bar + sentence) | latest | The request, and the only cost-basis-free split this project can honestly draw |
| Result | **window** | |
| **Dividend** | **all time** | The request. Beside Result, never inside it |
| % of bought | all time | Named by its denominator |
| Share % | latest | Open view only |
| Snapshot | — | US-47's button. It must survive the move |

Dropped: `Price` and `Average paid` fold into the bar's tooltip — they are the two numbers the bar is
computed from, and US-46 masks them anyway; `Type` becomes a chip on the instrument cell, since it is
already the filter; `Bought` and `Sold` move behind the row's disclosure with the transactions, or
drop. **`Currency` and the `est.` marker stay**, wherever they land: `est.` says this row's result is
an estimate, and a redesign that tidies away the caveat is exactly the failure mode CLAUDE.md warns
about.

### The cash row is not a row, it is an invariant

`renderHoldings` puts `accountResult − positionResult` on the cash row so the Result column adds up
to the account's result — dividends, interest, fees and FX with no position behind them. It is a
true statement rather than a plug, and it is the only reason the column sums. Under *Closed* and
*All* it still has to be reachable, because the sum it completes is the account's. Same for
`#products-note`'s unattributed-dividend count: dividends carrying no product are in the account
total and in no row, and that sentence survives the merge or the Dividend column quietly under-reports.

### Design notes for the overhaul

- **The bar is a chart mark and gets treated like one.** 2px surface gap between the two segments,
  rounded data-end anchored to the baseline, and its sentence beside it — never the colour alone.
  Green/red is a status pair and stays reserved for gain/loss; it is not a categorical slot.
- **The swatch keeps the composition's colour, which is ranked over the whole history.** Filtering to
  *Closed* must not repaint anything: colour follows the instrument, not its rank in the current
  filter. That rule already exists in `charts.js` and the merge is where it is easiest to break.
- **Sorting and filtering are not animated.** A 138-row table re-sorting is seen many times a
  session; a stagger there reads as lag. Instant, with the existing name tiebreak so equal results
  cannot jitter.
- **The header sticks and the table scrolls in its own container.** Nine columns of numbers with the
  header off screen is where reading errors come from, and horizontal overflow belongs to the table,
  never to the page.
- **One row height for both states.** The bar cell is two lines tall and the dash is one; if the
  closed rows are shorter the table visibly reflows on every filter change.

### Acceptance criteria

- **AC1** One card, one table, one row per instrument. `#holdings` and `#products` do not both exist.
- **AC2** Every column that does not follow the range control says so in its header, and a test
  asserts the windowed set is exactly `{Result}`.
- **AC3** The paid-in-vs-grown bar renders for every open position, with its sentence, including the
  under-water and the `paidIn < 0` states — the three cases `splitCell` already distinguishes.
- **AC4** Dividend per product renders, all-time, beside Result and not folded into it. The
  unattributed-dividend sentence still renders when the count is non-zero.
- **AC5** Default view is open positions. *Closed* and *All* are reachable in one click, and switching
  repaints no swatch.
- **AC6** The cash row and its `accountResult − positionResult` value survive, and the Result column
  under *Open* still sums to the account's result for the window.
- **AC7** The snapshot button is on every position row, still wired through one delegated listener.
- **AC8** With US-46 on, no amount and no quantity appears in the new table, tooltips included.
- **AC9** `npm run demo` renders it on generated fixtures at 1280px and at a narrow window with no
  horizontal page scroll.

### Stop condition

If combining needs a number the engine does not already return, stop and say which. Every figure
above is on `r.byProduct` today; a merge that requires new computation has quietly become a
different story.

---

## US-50 — The snapshot line starts when the position does *(built, phase 7)*

> *"the popouts that we can use as sharable objects show a line thats way too long, the line should
> start at buy not at the opening of an account or something"*

### It is exactly that, and the line in the code is short

`app.js:374` — `series: cumulativeWindow(p.pnl, w.from, w.to)`. `w` is the **page's** range, so with
ALL selected the series starts the day the account opened. A position bought in 2024 gets four years
of cumulative-P/L-of-zero drawn as a flat line, and then the actual position in the last third of the
card. The screenshot shows it: a card about TDIV, dated `2020-06-22 → 2026-08-13`, whose line is
about two thirds nothing.

Three consequences, and the cosmetic one is the least of them:

1. **The shape is squashed.** The spark normalises to its own extent (`ui/snapshot.js:46`), so the
   dead segment costs no vertical range — but it costs two thirds of the width, which is the whole
   point of the card.
2. **The dates are wrong for what the card is about.** `period` is the account's range printed on a
   card about one instrument. A reader takes `2020-06-22` as "I have held this since 2020".
3. **The percentage is computed over two different spans.** `result` is `sumWindow(p.pnl, w.from,
   w.to)` — windowed — over `paidIn: p.paidIn?.at(-1)` — all-time. Select 1Y on a position bought in
   2019 and the card divides one year of result by six years of money in. **This is the same defect
   at the other end and it is the one that produces a wrong number rather than an ugly one.**

### What "at buy" means precisely

The position's life, from `p.qty`: the first index where quantity is non-zero, to the last. Clipped
to the selected window, because a card must never disclose more period than the page is showing.

- **Still open** → runs to the window's end. That is today.
- **Closed** → **ends at the close.** The flat tail after a sale is the same bug pointing the other
  way, and it is the more misleading half: a line that runs flat at its final profit for two years
  reads as a position that held its gain, when in fact it did not exist.
- **Sold and re-bought** → one contiguous span, first-open to last-active, flat middle included. That
  gap is true — the money genuinely was not in it — and drawing two segments needs a discontinuity
  the sparkline has no vocabulary for.
- **Opened before the window** → the intersection, and the card's dates say the intersection, not
  the position's whole life.
- **Fewer than two points in the intersection** → no line. `drawSpark` already returns on
  `spark.length < 2`; what must change is that the card then does not claim a period it did not draw.

### Where the fix goes, and where it must not

**In `src/lib/snapshot.js`, pure, and tested there.** A new `positionSpan(qty, from, to)` returning
`{from, to}` or `null`, which `snapshotModel` uses to clip the series, the period *and* the basis of
the percentage — one span, used three times, so the three cannot drift apart again. `app.js` hands
over `p.qty` and stops deciding anything.

Not in `ui/snapshot.js`: the drawing code holds no decisions, which is the split US-47 was built
around and the reason a PNG's contents are testable at all.

`paidIn` then comes from the same span — `p.paidIn[spanTo] − p.paidIn[spanFrom−1]` — so numerator and
denominator cover the same days. For an all-time card on an open position that is the number the card
shows today; for a windowed one it is a different, correct number.

### Design notes

- **The card gets wider room, not a wider line.** With the dead segment gone the same 2.5px path
  fills the plot; nothing about the geometry needs to change, which is the sign the fix is in the
  right place.
- **The first point of a clipped series is zero by construction** (cumulative from the first day of
  the position), so the dashed zero line now sits at the left edge for every card. It should still
  be drawn only when zero falls inside the range — for a position that has only ever gained, the
  zero *is* the start, and drawing a dashed line along the top of nothing is noise.
- **The period is provenance, not decoration.** It sits with the broker, the date and the
  reconciliation verdict, and it is the field a reader uses to judge the percentage. Whatever the
  overhaul does to that line, those four stay together and stay legible at the size a Discord embed
  renders.

### Acceptance criteria

- **AC1** For a position first bought at day *k*, the card's spark starts at *k*, not at day 0.
  Asserted on the model, against a synthetic fixture, not by looking at pixels.
- **AC2** For a closed position, the spark ends at the close.
- **AC3** The card's period states the position's own span, clipped to the selected window.
- **AC4** The percentage's result and `paidIn` are measured over that same span. A 1Y window on a
  six-year position does not divide one by the other.
- **AC5** A position with fewer than two days inside the window draws no line and claims no period.
- **AC6** `positionSpan` is pure, exported, and tested for: open, closed, re-bought, opened-before-
  window, entirely-outside-window, and a `qty` array of all zeros.
- **AC7** The snapshot field list is unchanged. This story moves no new value onto the card.

### Stop condition

If clipping needs anything beyond `p.qty` and the arrays the card already receives, stop: the model
has started reading state instead of being handed it, and that is the seam US-47's leak test depends
on.

---

## US-51 — A dollar price is not a euro price *(built, 0.45.0)*

**Built as refined, with two deviations, both narrowing it:**

1. **`fmtPrice(n, ccy)`, not `fmtMoney(n, ccy)`.** A general money formatter taking a currency has
   exactly one caller and the base currency is still EUR everywhere else, so the base-currency
   plumbing the refinement sketched would have been a parameter with no second caller — rule 8. The
   choke point is intact: it lives in `theme.js`, it masks, and the guard test still passes.
2. **No implied rate in the tooltip, which the refinement had decided to add.** Two reasons found in
   the code: `totalBase` includes the fee, so `|totalBase| ÷ |price × quantity|` is wrong in the
   fourth digit — €2,00 of fee moves 1,1549 to 1,1540 — and for an option `price × quantity` is not
   the native total at all, it is short by the contract size, which is the same trap `engine.js:441`
   already documents for deriving rates from trades. A rate that is right for shares and 100× wrong
   for options is worse than no rate. The visible currency symbol does the disclosure instead, which
   is what the reader actually needed: it says the euro column is not this number times the quantity.

Also decided while building: nl-NL renders USD as **`US$`**, not `$`. More specific than DEGIRO's own
column and unambiguous between the dollars, so it stays.

### The original refinement

> *"zie je dat, DEGIRO heeft hier dollars staan en jij neemt het 1:1 over naar euro's"*

### Yes, and it is one call site

`app.js:2711` — the transactions table renders `fmtEurCents(t.price)`. `t.price` is the **traded
price in the instrument's own currency** (`parse.js:124`); `fmtEurCents` is hardwired to
`{ style: 'currency', currency: 'EUR' }` (`theme.js:44`). So a fill at **$ 3,105** is printed
**€ 3,11**, and nothing anywhere says a conversion did not happen.

Side by side, from the report:

| | DEGIRO | Us |
|---|---|---|
| Price | `$ 3,105` | `€ 3,11` |
| Rate | `1,1549` | not shown |
| Amount | `$ -2.794,50` → `€ -2.419,71` | `+€ 2.421,71` |

### The good news, and it is most of the story

**Only the label is wrong. The arithmetic is not.** The engine never touches `t.price` for
valuation: it prices positions off the product's currency and the observed rate
(`engine.js:1212`), takes the transaction's euro figure from `totalPlusFeeInBaseCurrency`
(`parse.js:127`), and derives FX as one settled amount divided by the other. The euro amount in the
row above is right — the €2,00 it differs from DEGIRO's is the fee, which DEGIRO puts in its own
column and we include.

So this is not a wrong number. **It is a true number wearing the wrong sign**, which by this
project's standards is the same size of defect: a reader who takes €3,11 as the price and multiplies
by 900 gets €2.799 and cannot reconcile it with the €2.421,71 beside it, and the only way out is to
guess that one of the two columns is lying.

Nothing else on the page has this bug. `unitPrice` and `averagePaid` divide base-currency figures
by quantities and are euros for real, and both already carry a comment saying so; `charts.js` prints
no native price. Grep confirms it: `t.price` has exactly one reader.

### Rule 7's choke point decides the fix

US-46 put every money format inside `theme.js` and `test/anon.test.js` enforces that nothing under
`src/ui/` formats a currency anywhere else. That guard is doing its job here — it forbids the
obvious patch (a `Intl.NumberFormat` with `t.currency` inlined at the call site) and points at the
right one: **a formatter that takes a currency, beside the three that assume one.**

```
fmtMoney(n, ccy)   // ccy defaults to the base currency; masks under US-46 like the rest
```

`fmtEurCents` becomes `fmtMoney(n, base)` and the 86 existing call sites do not move. This also
retires a smaller lie the same line tells: the base currency is *assumed* to be EUR in the
formatters while the engine carries `r.baseCurrency` as data.

### Three decisions this needs, all small

**1. Where does the currency come from?** `t.currency` exists, but `parse.js:125` defaults it to
`'EUR'` when the field is missing — which is the same wrong guess one level down, and rule 4 says an
unknown does not get a plausible default. Order: the product's currency (which the engine already
prefers, `engine.js:583`), then `t.currency`, then **no symbol at all** — a bare number with the
currency column empty, rather than a euro sign nobody checked.

**2. Precision.** `$ 3,105` and `$ 3,12` are two prices that both render `3,11`-ish at two decimals,
and a penny stock at `$ 0,0125` renders `€ 0,01`. Amounts are cents; **a price is not an amount** and
gets up to 4 decimals with trailing zeros trimmed. This is why the two rows in the report look like
the same fill and are not.

**3. What to do about the rate.** DEGIRO shows `1,1549` per row; we show nothing, and the euro amount
therefore appears unexplained beside a dollar price. The rate is free — it is `|totalBase|` over
`|price × quantity|`, which is the same implied rate the engine derives. **Decided: the native price
and its currency in the column, the euro amount as it is now, and the implied rate in the row's
tooltip.** Not a fourth column: nobody asked to compare rates across rows, and rule 8.

### The other thing in the same row, which is not a currency bug

The Amount column shows a **purchase as `+€ 2.421,71`** (`fmtSigned(-(t.totalBase))`), where DEGIRO
shows `-€ 2.419,71`. Money left the account and the column signs it positive, under a header that
says only *Amount*. It is presumably "what went into the position", which is defensible — but it is
the opposite of the cash flow and of the sign on every other figure on the page, and the header does
not say which. **Decide it and label it**, in this story, since it is the second thing a reader
compares against their broker in the same row. If the convention stays, the header says so.

### Where this meets the other two

US-49 folds Price and Average paid into the split bar's tooltip — both are base-currency figures, so
the merged table must not inherit this ambiguity by putting a converted price next to a native one
with no label. And US-46 masks prices like every other amount: `fmtMoney` masks, or the fix reopens
the leak that story closed.

### Acceptance criteria

- **AC1** A transaction in a non-base currency renders its price in **that** currency, with that
  currency's symbol or code, and no euro sign.
- **AC2** The euro amount beside it is unchanged. No engine change, no resync, no recomputation —
  a test asserts the reconstruction is identical before and after.
- **AC3** A transaction whose currency cannot be determined renders the number with **no** currency
  marking, and is not assumed to be the base currency.
- **AC4** Prices render to 4 decimals with trailing zeros trimmed; amounts stay at 2. `3,105` and
  `3,12` are visibly different rows.
- **AC5** All currency formatting still lives in `theme.js` — `test/anon.test.js` unchanged and
  passing.
- **AC6** With US-46 on, the price is masked like any other amount, and the *currency* may stay
  visible: a ticker's currency is public and discloses nothing.
- **AC7** The Amount column's sign convention is stated in the header or the hint.

### Stop condition

If fixing the label requires converting anything, stop. The conversion is already done and lives in
the engine; a second conversion in the UI is two answers to one question, and the rate this one
would use is not the rate that settled the trade.

---

# Refinement 0.47 — paid vs grown, in the two places it is not yet

Three requests from the owner, and the first is already shipped: *"here I miss the paid vs grown
%"* points at the overview table, where US-49 already draws the bar for every open position
(`app.js:3520`). So this refinement is the other two — **US-52 puts the split on the shareable
card**, and **US-53 asks for it on sell transactions**, which is the more interesting one because
it walks straight into the cost-basis wall this project has spent five releases staying behind.

They share a spine worth stating once. **Paid vs grown is a split of a *stock*, not a *flow*.**
`value = paidIn + result` is an identity that holds at every instant for what a position *is*
(SPEC §1.4 applied to one holding), and an identity over a stock needs no cost-basis convention —
which is the whole reason this project can draw the split honestly when nothing else about
per-holding P/L can be. A single sale is a flow, and a flow cannot be split into "capital returned"
and "profit" without FIFO or average cost. US-52 is easy because it splits the stock the card is
already about; US-53 is hard because it asks to split a flow.

---

## US-52 — Paid vs grown on the shareable card *(built, 0.47.0)*

> *"I also want paid vs grown in the shareable things."*

### What the card shows today, and what is missing

The card (US-47, `src/lib/snapshot.js` + `src/ui/snapshot.js`) already carries the paid-vs-grown
*relationship* — as the hero percentage. `returnOnMoneyIn(result, moneyIn)` is `result ÷ moneyIn`,
drawn as *"+310,48 % · on the money put in"* (`ui/snapshot.js:137`). That is grown-over-paid as a
single ratio.

What it does **not** carry is the **composition bar and its sentence** — *"72 % paid in · 28 %
grown"* — the exact mark the holdings table draws in `splitCell` (`app.js:3446`). The pct answers
*"for every euro in, how much came back"*; the bar answers *"of what this is worth, how much is
mine and how much did it make"*. Two readings of the one identity, and the request is for the
second one to travel with the card, beneath the number that is already there.

### The reason this is the *right* thing to put on a public card

It is the cost-basis-free, **amount-free** figure. The bar is two percentages and a sentence;
under US-46 (anonymize) it survives untouched because there is no euro in it to mask. A split that
says *72 % · 28 %* discloses the shape of the position without disclosing what anyone holds — which
is precisely what a card *"zodat iemand kan flexen met de gains"* wants and the export must never
leak. So this is not a euro sneaking onto the card; it is the one part of the holdings row that was
always safe to post.

### One truth, two renderers — the reuse that keeps them from drifting

`splitCell` holds the split arithmetic inline in `app.js` — the three states, the percentages, the
words. Do **not** copy it into the drawing code. Lift the maths into a pure
**`splitModel(paid, grown)`** in `src/lib/snapshot.js`, returning `{ keptPct, lostPct, state, key }`
where `state` is one of `grown | underwater | free` and `key` is the i18n string key with its
substitutions — no euros in the return value at all. `splitCell` becomes a caller of it, and
`snapshotModel` calls it too. The card and the table then cannot disagree about a losing position,
because there is one function that decides and it is the one with the test.

This is the same split-of-concerns US-47 was built around: `snapshot.js` decides *what* the split
is, `ui/snapshot.js` decides what it *looks like* and holds no arithmetic.

### The span, so the bar cannot drift from the pct beside it

US-50's whole point was that the card's numerator, denominator, dates and line are all measured
over **one** span — `positionSpan` clipped to the window. The split obeys the same rule for free:
it is computed from the `result` and `moneyIn` that `snapshotModel` already derives over that span
(`snapshot.js:227-239`). So `paid = moneyIn`, `grown = result`, and the bar covers exactly the days
the pct covers. An **all-time card reproduces the holdings row's bar to the digit** (span end is the
last day, so `moneyIn = paidIn.at(-1)` and `grown = result` — the same two numbers `splitCell`
reads); a windowed card's split is windowed like everything else on it. A test asserts the pct, the
amount and the split share one span.

### The three states are already solved — do not re-solve them

`splitCell` distinguishes grown, under water, and `paid < 0` (*"all gain — more came out than went
in"*), and it fixed a real defect getting the under-water scaling right (`app.js:3451`). The card
inherits all three by calling the shared function. The one worth calling out: a **closed** profitable
position on an all-time card has `moneyIn < 0` — you sold out, so more came out than went in — and
it lands in the `free` state and reads *"all gain"*. That is correct, not a degenerate bar to
special-case.

### The field list gains exactly one key, on purpose

`SNAPSHOT_FIELDS` is frozen and the leak test asserts the model's key set (`snapshot.js:37`). This
story adds **one** key — `split` — and the addition is deliberate and recorded here, which is the
stop condition US-47 wrote: *"the list is amended deliberately and the reason recorded — never
widened at the call site."* The key carries only `{ keptPct, lostPct, state, key, subs }` —
percentages, an enum, and an i18n key — so the poisoned-fixture leak test still cannot push an
amount, a name or an identifier through it.

### Acceptance criteria

- **AC1** The card carries the paid-in-vs-grown bar and its sentence, beneath the hero percentage.
- **AC2** The split comes from a pure `splitModel` shared with `splitCell`; an all-time card
  reproduces the holdings row's bar to the digit, asserted on the model against a fixture.
- **AC3** The split is measured over US-50's `positionSpan`. A test asserts the pct, the amount and
  the split are computed over the same span — a 1Y card on a six-year holding does not window one
  and not the others.
- **AC4** All three states render — grown, under water, and `paid < 0` (*all gain*) — the same cases
  `splitCell` distinguishes, and a closed profitable position lands in *all gain*.
- **AC5** With US-46 on, the split still renders. It is percentages and words; no amount appears.
- **AC6** `SNAPSHOT_FIELDS` gains exactly one key, carrying only percentages, an enum and an i18n
  key. The leak test's poisoned fixture cannot get an amount or an identity through it.
- **AC7** `splitCell` is reduced to a caller of `splitModel` with the table's rendering unchanged —
  `npm run demo` renders the holdings bar identically before and after.

### Stop condition

If the split needs a number `snapshotModel` does not already receive, stop: the model has started
reading state instead of being handed it, which is the seam US-47's leak test and US-50's clip both
depend on. And if anyone reaches for proceeds-minus-cost to draw it, that is US-53's trap on the
wrong card — the card's split is a composition of the position's value, never a per-trade profit.

---

## US-53 — Paid vs grown on sell transactions *(decided — option b, no split on a sell row; in [Unreleased])*

> *"and I want the paid vs grown also in all sell transactions."*

### This one asks to split a flow, and that is the cost-basis wall

`renderTransactions` (`app.js:3279`) is the ledger: date, buy/sell, instrument, quantity, price in
the instrument's own currency, and the amount that moved in euros. Every column is a fact about the
transaction. The request is to add paid-vs-grown to each **sell** row.

The reading a seller wants is *"of this sale, how much was my money coming back and how much was
profit"* — and that is **realized gain on the sale = proceeds − cost basis of the shares sold.**
Cost basis is FIFO or average cost, and **this project has refused to pick one, deliberately and
repeatedly**: US-27 trap 1, the `averagePaid` comment (*"not the running average cost of what
remains after partial sales… this project picks neither"*, `app.js:3371`), the `splitCell` comment
(*"splitting today's value into cost and gain the usual way needs FIFO or average cost, and those
are an argument with no right answer"*, `app.js:3432`), and `returnOnMoneyIn`'s note all say the
same thing. The per-holding numbers on this page are trustworthy **because** no cost-basis
convention exists anywhere in the codebase.

So per-sale paid-vs-grown is not a missing column. It is **the one number the project's whole claim
depends on not inventing.** The position bar is honest because `value = paidIn + result` splits a
*stock* — what is held right now — and an identity over a stock needs no convention. A sale is a
*flow*, and there is no convention-free way to split one flow into capital and profit. That is not a
gap in the code; it is the difference between a stock and a flow.

### Two honest options, and neither is the literal request

1. **Position-to-date paid vs grown, as of the sell date.** Computable cost-basis-free: at the sell
   day *d*, the instrument's `paidIn[d]` and its cumulative `result[d]`, with `value[d] = paidIn[d]
   + result[d]`. The same bar the holdings row draws, snapshotted at the row's date. **But it is a
   fact about the position on that day, not about the sale.** Two sells of the same instrument a
   week apart show almost the same bar, because the bar is the position's state, not the trade's.
   Putting a position figure on a per-sale row is exactly the *"the layout invented the comparison"*
   failure US-49 warned about — a reader divides this sale's amount by a split that is not about
   this sale. Honest arithmetic answering the wrong question.
2. **Decline the column; the honest per-row figure is the amount, which is already there.** A
   transaction is a flow, the amount is the flow, and paid-vs-grown belongs to the position — where
   it already lives, on the holdings row (US-49) and now the card (US-52). The ledger's job is to
   show what moved, not to attribute profit to a moment.

### Recommendation

**Option 2, and if per-sale *profit* is genuinely wanted, that is a separate, larger story that must
open the cost-basis question by name.** Option 1 ships a number that reads as per-sale profit and is
not; the literal request requires breaking the invariant every other figure on the page rests on.
Adopting FIFO or average cost is a SPEC-level decision — it changes what this project promises about
its numbers — and it should be taken deliberately, with the convention named and its consequences
written down, never smuggled in as a transactions column.

*Needed from the owner:* a decision between (a) the position-to-date bar on sell rows, clearly
labelled as a position figure and never as the sale's; (b) drop it, amount stays the per-row truth;
or (c) open cost basis as its own story, which is the only thing that answers the literal request
and is the biggest change in this backlog if taken.

### Decided, 0.47.0 — **(b)**, with the reason said on the page

The owner handed the choice to design. It is **(b)**, and the deciding argument is not the
arithmetic — option (a)'s arithmetic is sound — it is the mapping.

A bar on a sell row that is *about the position* needs a label explaining that it is not what it
looks like, and a control or a figure that needs a label to correct the reading it invites has
already failed. Two sells of one instrument a week apart would show almost the same bar; a reader
divides this sale's amount by a split that is not about this sale, and nothing on screen stops them.
That is US-49's *"the layout invented the comparison"* in a new place.

Option (c) stays available and stays a **SPEC-level** decision: adopting FIFO or average cost
changes what this project promises about every per-holding number on the page. It is not a column
somebody adds on a Tuesday, and it does not arrive by implication.

**What shipped instead:** nothing on the row, and one sentence under the table saying where the
split does live and why it is not here — so a reader who came looking finds an answer rather than
concluding the app forgot. AC0 is now a test rather than a note: `test/describe.test.js` fails the
build if `engine.js` grows a FIFO, an average cost, a cost basis or a per-sale realized gain. Four
places already said the refusal in prose; this is the first that enforces it.

### Acceptance criteria

- **AC0 — the guardrail, whichever option is chosen.** This story introduces **no** cost-basis
  convention: no FIFO, no average cost, no per-sale realized-gain field on `engine.js`. A test
  asserts the engine gains no such field. If the answer is (c), this story closes and a new one
  opens with cost basis in its title.
- **AC1 — if option (a).** The figure against a sell row is the **position's** paid-vs-grown as of
  the row's date, drawn with the shared `splitModel` (US-52), and it is labelled as a position
  figure in the column header — never presented as the sale's own split.
- **AC2 — if option (a).** It is computed from `p.paidIn` and `p.pnl` at the row's date, and a test
  proves two sells of one instrument on adjacent dates show the position figure moving with the
  position, not a per-sale split.
- **AC3 — if option (a).** A sell of an instrument that is now closed still resolves against its
  state on the sell date, not the degenerate end-of-life value.
- **AC4** Under US-46, any figure shown is percentages and words only, no amount — the same as the
  card and the holdings bar.

### Stop condition

If the column reaches for proceeds-minus-cost, stop and escalate to option (c): that is cost basis,
it contradicts `app.js:3371`, `app.js:3432` and US-27 trap 1, and it cannot ship as a column
without a story that changes what SPEC promises. A flow cannot be split into capital and profit
without the convention this project refused — and the refusal is the reason the rest of the page can
be trusted.

---

## US-54 — A share button on the block, and a score card instead of a chart *(built, 0.47.0)*

> *"nog beter zou zijn als je dat hele blok een share button geeft waarbij je daarna kan kiezen
> welke tegel je gebruikt. Make those shared objects be a score card, they don't per se need a
> chart."*

### What this is: US-47 without the sparkline, and one button per section

US-47 put a share button on each holdings *row* and drew a card with a sparkline. This asks for a
share button on each **section** — the KPI block — and a card built from a **tile**: a big figure, a
label, a caption, and nothing that has to be a chart. The screenshots are the *Portfolio history*
and *Result* blocks; the request is one share action on the block, then pick which tile it renders.

Almost everything already exists. The share sheet (US-47+), the four `FORMATS`, the clipboard-and-
download, the provenance line, the owner line, US-46's amount masking and US-48's watermark are all
built. **This story adds three things and no subsystem:** a section-level share button, a tile
picker in the sheet, and a card layout with no sparkline. Rule 8 — if it grows a second clipboard
path or a second provenance builder, it has gone wrong.

### The tile is already the model, and that is what makes it safe

A tile is `{ label, value, note, cls }` (`app.js:1982`), and `value`/`note` are **already-formatted
strings** — `fmtSigned`, `fmtEurCents`, `fmtPct`, the `theme.js` choke point US-46 masks inside. So
a card drawn from a tile's own strings **cannot show more than the page does**: anonymize is
inherited by construction rather than re-implemented, which is the property US-46 was built to give
and the reason this card does not reopen the leak. A `scoreCardModel({ label, figure, caption, … })`
carries those strings plus provenance and owner, behind a frozen `SCORECARD_FIELDS` allowlist and
the same poisoned-fixture leak test the snapshot model has.

One real seam: the sheet has its **own** amount toggle, defaulting to off for something posted in
public, independent of the page's anonymize (US-47+ `state.share.amounts`). A score card must obey
the *sheet's* toggle, so the tile figure has to be obtainable under an explicit anonymize flag
rather than only as whatever string the page currently holds. That is a small refactor — build the
tile list with a passed-in flag — and it is the one piece of plumbing this story adds. Everything
else it reuses.

### Provenance matters *more* here, not less

A holdings card is one position; a score card can be **Total value** or **Result** — the account's
headline number. So the reconciliation verdict is the whole trust claim, and the card carries the
same provenance line US-47 draws and says *"does not reconcile"* when it does not. A clean-looking
*Result +€ 16,71* card from an account that is € 40 000 out is exactly the lie rule 6 and US-47
already refuse; this card refuses it the same way, by drawing the tri-state verdict and never a pass
for an unchecked one.

### The trap: Optimism Mode must never reach a card that carries a badge

`renderTiles` replaces the real tiles with joke versions when Optimism Mode is on — *"847 days of
unwavering belief"* (`app.js:2125`). Every number *above* that line is the real one, and the
quarantine is deliberate. A share button that grabs whatever is on screen would put a gag figure on
a card that also carries a reconciliation verdict — a joke wearing a trust badge. **The share path
reads the real `tiles`, never the cheerful `shown`.** This is the one thing easy to get wrong,
because the obvious implementation shares what is rendered.

### What does *not* get built (rule 8)

- **One button per section, not per tile.** Nineteen figures would be nineteen buttons; the request
  is one button on the block and the tile chosen *after*, in the sheet's picker.
- **One tile per card, not a section collage.** Same shape as one position per card. A multi-tile
  card is a different story if it is ever wanted.
- **The holdings card keeps its sparkline.** *"They don't per se need a chart"* makes the chart
  optional for the new score card, not removed from the position card. The chartless layout is a
  shared drawer both *could* use later; converting US-47's card is not this story.
- **No per-tile "shareable" flag.** The picker lists every tile in the section; a tile that is a
  bare amount simply shows the mask when the sheet's amounts are off, visible in the preview. A
  denylist of "un-shareable" tiles is rule 7's mistake waiting to happen.

### The picker, and the layout

The sheet gains a tile selector listing the section's tiles by label, defaulting to the section's
hero (the first tile). The shape, theme, amounts and name controls are the ones already there. The
card is the hero **figure** centred, the **label** above it, the **caption** (the tile's `note`)
below, provenance at the foot, owner optional, watermark behind — the snapshot layout with the
spark region given back to the figure. A `drawScoreCard(model, ctx)` sibling to `drawSnapshot`,
holding no decisions, so a PNG's contents stay asserted through the model and not the pixels.

### Acceptance criteria

- **AC1** Each KPI section has one share button. It opens the sheet scoped to that section's tiles,
  with a picker defaulting to the section's hero tile.
- **AC2** The card is chartless: a figure, a label, a caption, provenance, optional owner, watermark.
  No sparkline, and a test asserts the score-card model carries no series.
- **AC3** The card draws the tile's own figure and caption, so under US-46 — or the sheet's own
  amount toggle off — no euro amount appears, with no masking logic of its own. A poisoned tile
  cannot get an unmasked amount onto the card.
- **AC4** `SCORECARD_FIELDS` is a frozen allowlist; the leak test's poisoned fixture cannot push a
  key through it, the same shape as `SNAPSHOT_FIELDS`.
- **AC5** The provenance line renders the tri-state reconciliation verdict truthfully, including
  *does not reconcile*, exactly as US-47.
- **AC6** With Optimism Mode on, the shared card shows the **real** figure, never the cheerful one.
  A test shares a tile with the mode on and asserts the real number.
- **AC7** The card obeys the sheet's own amount toggle, defaulting to amounts off for a public card,
  independent of the page's anonymize state.
- **AC8** `npm run demo` renders the score card for a euro tile, a percentage tile and a euro-plus-
  percent tile at one `FORMATS` shape without overflow.

### Stop condition

If the card needs a number the tile does not already carry, stop: the tile is the model, and a
score card that recomputes a figure has left the choke point where US-46 masks and where the leak
test can see it. And if sharing the block means sharing what is rendered rather than the real tiles,
stop — that is how Optimism Mode reaches a card with a reconciliation badge on it.

---

# Refinement 0.48 — an Apple-design pass on the feel

Four stories from a design pass (2026-08-17) reading the app through Apple's *Designing Fluid
Interfaces* lens. None of them is a new number and none touches `engine.js`; they are about
**directness and craft**, which is the only kind of polish this project's ethos leaves room for. A
tween on the figures themselves was considered and **rejected**: this project's whole claim is that
no number on screen was ever untrue, and an interpolated frame shows a value that never happened.
So the motion goes on the *controls and the chrome*, never on the *data*.

> **Build status.** All four are buildable on `main`. **US-55 and US-58 were POC-only and are now
> promoted** — the owner confirmed the prototype (2026-08-17): *"the POC was correct, it can go into
> full production."* The validated prototype on branch `claude/apple-fluid-poc`
> (`docs/prototypes/apple-fluid.html`) is the working reference the implementation should match — the
> spring feel, the momentum, the reduced-motion behaviour and the type scale are all demonstrated
> there.

The through-line, Apple's own: an interface feels alive when motion **starts from the current
on-screen value, inherits the user's velocity, projects momentum forward, and can be grabbed and
reversed at any instant.** Springs are the tool, and they must be ~30 lines of inline `rAF` — a
vendored animation library is a remote-script-shaped dependency this project's CSP and offline
promise (vendor policy, rule 9's neighbourhood) would reject.

---

## US-55 — Grab the chart to set the range *(built, 0.47.0 — with US-63, as src/ui/motion.js)*

> **Prototype:** `claude/apple-fluid-poc` · `docs/prototypes/apple-fluid.html`. The owner confirmed
> the feel; build to match it. The spring, the momentum projection, the rubber-band and the
> reduced-motion snap are all working there.

The window is set by discrete buttons — 1M · 3M · 6M · YTD · 1Y · ALL — but the value chart is the
most *physical* surface on the page, and US-12 already reads a drag on it (to zoom). This is the
same gesture grown up: **brush a range directly on the chart**, and it becomes the window.

**Apple principles at work:** direct manipulation (§2), velocity handoff (§5), momentum projection
(§6), rubber-banding (§9), interruptibility (§3).

**The feel, precisely:**

- **1:1 tracking.** Pointer Events with `setPointerCapture`, respecting the offset from where the
  edge was grabbed — the handle stays glued to the finger even past the plot bounds.
- **Velocity handoff on release.** Keep a short position/timestamp history; on release the window
  edge settles with a **critically-damped spring** (§4, `damping 1.0`, `response ~0.4`) continuing
  at the finger's velocity, so there is no seam between dragging and settling.
- **Momentum projection.** A flick projects where the edge is going (`current + project(v)`) and
  snaps to the nearest day *there*, not under the release point — a flick throws the window.
- **Rubber-band at the ends.** Dragging before the first day or past the last resists progressively
  rather than stopping dead (§9), so the edge of the history reads as an edge, not a freeze.

**The traps:**

1. **Animate from the presentation value, always.** The settle spring starts from the edge's live
   on-screen position, and a new grab *mid-settle* reads velocity from where it actually is — start
   from the target and the handle jumps, which is the one thing §3 forbids.
2. **Recompute per frame is honest here, and only because of rule 2.** The window moving redraws
   real numbers every frame; there is no smoothing of the *data*, only of the handle. Rule 2's
   "recomputing five years is milliseconds, measured not assumed" is the licence — so measure it,
   and if a frame's recompute blows the budget, downsample the redraw, never the truth.
3. **Reduced motion (§14) keeps the tracking, drops the overshoot.** The brush still follows the
   finger 1:1 — that is direct control, not vestibular motion — but the settle becomes an instant
   snap with no spring, under `prefers-reduced-motion`.
4. **No series repaints on range change.** The composition ranks on the whole history (charts rule),
   so moving the window must not recolour anything — the rule already exists and this is where it is
   easiest to break.
5. **The discrete buttons stay.** They are the fast path and the keyboard-accessible one; the
   gesture is an addition, not a replacement (§5 Flexibility).

**Acceptance criteria:**

- **AC1** Brushing on the value chart sets the range, tracking the finger 1:1 with the grab offset
  respected.
- **AC2** On release the window edge settles with a spring carrying the release velocity, and a
  flick lands where the momentum projects, snapped to a day.
- **AC3** Grabbing an edge mid-settle reverses from its live position with no jump.
- **AC4** Dragging past the first or last day rubber-bands rather than stopping hard.
- **AC5** Under `prefers-reduced-motion`, tracking stays 1:1 and the settle is an instant snap with
  no overshoot.
- **AC6** `engine.js` is unchanged, the per-frame recompute stays within a measured budget, and no
  series changes colour when the window moves.
- **AC7** The discrete range buttons still work and still reflect the gesture's result.

**Stop condition:** if the gesture needs the engine to expose anything it does not already return,
stop — this is UI over the arrays the page already holds, and the moment it reaches into `engine.js`
it has stopped being a rendering concern.

---

## US-56 — Response and graceful degradation, everywhere *(built, 0.47.0)*

The lowest-risk, highest-trust item: a craft pass that makes the whole page feel *responsive* and
degrade honestly. Two Apple needs at once — **response** (§1) and **accessibility** (§14) — and it
lives in one place rather than per-component, the same way US-46's mask lives in the formatters.

**What it is:**

- **Feedback on pointer-*down*, not release (§1/§10).** Every button, row, chip and toggle
  highlights the instant it is pressed, commits on release, and cancels if the finger drags away and
  does not come back. Waiting for `click` to show anything is the latency §1 calls "a cliff".
- **`prefers-reduced-motion: reduce` (§14).** Slides, springs and overshoot become short opacity
  cross-fades; motion that aids comprehension (a thing appearing) stays, motion that is decoration
  goes. Reduced motion is a *gentler* feedback, never *no* feedback.
- **`prefers-reduced-transparency: reduce`.** Any translucent chrome frosts to near-solid — raise
  background opacity, drop the blur.
- **`prefers-contrast: more`.** Near-solid backgrounds with a defined contrasting border.

**The traps:**

1. **The palette is measured, and this changes surfaces.** Any contrast or transparency fallback is
   a new surface the chart series sit on. `npm run palette` must stay green in both themes, and the
   reconciliation-red and warning text must stay above their thresholds — a fallback that quietly
   darkens a warning below legibility has failed the one thing rule 6 protects.
2. **Press-on-down is feedback, not activation.** The highlight fires on `pointerdown`; the *action*
   fires on `pointerup` over the target. Conflating them turns a highlight into an accidental
   activation, which §10's "cancel-by-dragging-away" exists to prevent.
3. **One layer, not fifty.** This belongs in the token/interaction layer so a control added next
   year inherits it, exactly as a money field added next year inherits US-46's mask by having to
   call the formatter. A per-component sprinkle is the denylist mistake in a different costume.

**Acceptance criteria:**

- **AC1** Every interactive element shows feedback on `pointerdown`, commits on `pointerup`, and
  cancels when the pointer drags away without returning.
- **AC2** Under `prefers-reduced-motion`, no slide/spring/overshoot plays; comprehension-preserving
  cross-fades remain.
- **AC3** Under `prefers-reduced-transparency`, translucent chrome renders frosted/solid.
- **AC4** Under `prefers-contrast: more`, interactive surfaces gain a contrasting border.
- **AC5** `npm run palette` passes in both themes after the change, and a test asserts the three
  media queries are present rather than assumed.

**Stop condition:** if any fallback would weaken the reconciliation-red, an `UNKNOWN`-count, or a
price-gap warning below legibility, stop — rule 6 outranks the aesthetic, and a hidden disagreement
with the broker is the failure this project exists not to ship.

---

## US-57 — The share sheet as a material *(built, 0.47.0)*

Motion only, on the sheet US-47+ built and US-52/US-54 fill with content. It changes **no field and
moves no value**; it makes the sheet *feel* like a real object arriving.

**Apple principles:** materials & depth (§12 "materialize, don't fade"), momentum (§6), spatial
consistency (§7), interruptibility (§3).

**The feel:**

- **The card materializes.** On open it animates blur radius and scale together, so it reads as a
  pane of glass arriving rather than an opacity fade; on close it mirrors the same path (§7).
- **The four `FORMATS` become a swipeable strip.** Momentum projection and snap (§6) instead of a
  click-list — flick through square / portrait / story / landscape and it lands on one.
- **Interruptible throughout (§3).** Grab the strip mid-fling and it follows; grab the sheet while it
  is closing and it reopens from where it is.

**The traps:**

1. **Content is frozen; this is motion.** The card's model stays US-47's allowlist (US-52's `split`,
   US-54's score-card fields). A test asserts the model is byte-for-byte what it was — a motion story
   that moves a value has become a different story.
2. **Reduced motion and reduced transparency (§14).** The materialize becomes a plain fade; the
   swipe still selects but snaps instantly; the blur drops to a solid under reduced-transparency.

**Acceptance criteria:**

- **AC1** The card materializes (blur + scale spring) on open and mirrors that path on close.
- **AC2** The format strip is swipeable with momentum that projects and snaps to one shape.
- **AC3** Grabbing the strip or the sheet mid-motion follows the finger from the live position.
- **AC4** Under `prefers-reduced-motion` the materialize is a fade and the snap is instant; under
  `prefers-reduced-transparency` the blur is solid.
- **AC5** The snapshot and score-card models are unchanged, asserted by test — no field added, no
  value moved.

**Stop condition:** if the motion wants to change what is drawn on the card, stop — content belongs
to US-47/US-52/US-54, and this story is the glass, not what is written on it.

---

## US-58 — Type that changes shape with size *(built, 0.47.0 — npm run type)*

> **Prototype:** `claude/apple-fluid-poc` · `docs/prototypes/apple-fluid.html`. The size slider there
> shows the tracking tightening and the leading pulling in as the figure grows — build to match.

The hero figures — the giant `€ -0,05` — are set with body tracking. Apple §15: **tracking and
leading are size-specific, never one value for all sizes.** Large display text wants *negative*
tracking and *tight* leading; body wants near-zero tracking and looser leading. A single global
`letter-spacing` is wrong somewhere, and on the biggest number on the page it is wrong most visibly.

**Apple principles:** typography (§15), craft.

**What it is:** size-bucketed tracking and leading in the tokens — display negative (~`-0.02em`) and
tight-leaded, body near-`0` and comfortably leaded, small text slightly positive; `font-optical-
sizing: auto`; all in `rem`/`em` so Dynamic-Type-style user scaling still works (US-16 already did
the responsive sizing).

**The measured check, because this repo does not assert craft — it measures it.** The palette rule
(CLAUDE.md, Charts) is the standing example: *"the palette is measured, not asserted… a comment is
not a check."* Type gets the same treatment — an `npm run type` that reads the tokens and **fails on
a fixed global letter-spacing and on any display size not carrying negative tracking**, so the
buckets cannot silently rot back to one value.

**The traps:**

1. **This is type shape, not number format.** Numbers stay `nl-NL` (a locale for money, US-32/US-46),
   and this story does not touch the formatters — the minus sign, the thousands dot and the decimal
   comma are the formatter's, and tracking must be measured *at the display size* so they do not
   crowd. Eyeballing it is the "comment is not a check" mistake.
2. **Optical sizing needs a variable font.** Confirm the bundled Inter Tight / Inter face actually
   carries an optical axis; if it does not, `font-optical-sizing` is a no-op and this is tracking and
   leading only — stated plainly rather than promised.
3. **Contrast is unaffected but re-checked.** Tighter tracking can nudge legibility; the palette/
   contrast checks stay green.

**Acceptance criteria:**

- **AC1** Tracking and leading are size-bucketed in the tokens; there is no fixed global
  `letter-spacing`.
- **AC2** Display figures carry negative tracking and tight leading; body sits near `0` with looser
  leading.
- **AC3** A measured check (`npm run type`, wired into `npm test` like the palette) fails on a fixed
  global tracking value and on a display size without negative tracking.
- **AC4** Numbers are still `nl-NL` formatted; the formatters are untouched.
- **AC5** The contrast checks still pass in both themes.

**Stop condition:** if the change reaches into the number formatters, stop — number formatting is
US-46's choke point and US-32's locale, and this story is CSS shape, not digits.

---

# Refinement 0.47c — two defects the first real run exposed

Numbered after US-58, which the Apple-design pass took while this was being written: these are
**defects** found by running the thing, not extensions of US-47, and one of them is a translation gap rather than a design
question. Both were found by the owner watching a real account rather than by reading the code.

The three wrong-number defects from the same evening are already fixed and on `main`. What follows is
what is left, plus one investigation whose shape is not yet known.

---

## US-59 — The card's small print is unreadable at the size it gets posted *(built, 0.47.0)*

> *"This tiny tekst is barely readable"* — pointing at the preview in the share sheet.

The provenance line — dates, broker, reconciliation verdict, version — is drawn at **15 px on a
1280 px card**. That is 1,2 % of the card's width, and the number was chosen against the *app's*
type scale, where 15 px is read at 1:1 on a 1440 px viewport.

**A card is never read at 1:1.** It is posted into a chat that renders it at 500–700 px wide, so
15 px arrives as 6–8 px. The preview is what made this visible before anybody posted one, which is
the preview earning its place — but the fix is in the card, not in the preview.

This also interacts with US-54: a score card is *mostly* small print by comparison — a label, a
caption, a provenance line and one big figure — so sizing it against the page rather than against
the card would make that story ship the same defect three times over.

### What to change

- Every size inside `drawSnapshot` becomes a fraction of the card's **short edge**, so a 9:16 story
  and a 16:9 banner carry the same apparent type size. Today they do not: the same 15 px is 2,1 % of
  a 720 px-tall banner and 1,0 % of a 1440 px-tall story.
- The floor comes from a measurement rather than taste: the provenance line must still be readable
  when the whole card is 500 px wide, because that is what a Discord embed does to it.
- The hierarchy does not change. The percentage still dominates and the provenance is still the
  quietest thing there — this is a scale bug, not a re-design.

### Acceptance criteria

- **AC1** At every format in `FORMATS`, the provenance line is at least 2,4 % of the short edge.
- **AC2** Rendered at 500 px wide, no string on the card computes below 10 px.
- **AC3** Nothing overlaps at any format, tested against the longest instrument name in the fixture
  *and* the longest provenance line — which is a failed reconciliation, not a passing one.
- **AC4** Measured, not eyeballed: a test that renders each format and asserts computed sizes. A
  screenshot cannot fail in CI.

### Stop condition

If making the small print readable forces the big figure smaller than the label, stop: the card has
run out of room and the answer is fewer fields, not a flatter hierarchy. Say which field you would
drop.

---

## US-60 — The popup was never redesigned, and it speaks no Dutch *(built, 0.47.0)*

Noticed from a screenshot the owner sent mid-sync. The popup shares `styles.css`, so it inherited
0.46.0's tokens and *looks* plausible — which is exactly why two real problems went unnoticed
through the whole overhaul.

### The half that is a defect

**It has no translations at all.** Every string is hardcoded English in `popup.html` and `popup.js`;
there are no `data-i18n` attributes and `applyStatic` is never called. A reader who chose Nederlands
gets a Dutch app and an English popup — and `missing()`, which exists so that an untranslated string
is *counted rather than hidden*, never sees these because they never reach `t()`.

That half goes first, and it is the reason this is a defect rather than a nice-to-have.

### The half that is design

None of the redesign's language reached it: no lockup, two equal-weight buttons where one of them is
the primary action, and a 2×2 grid of four equal tiles where the app moved to one hero figure with
supporting ones.

Scope stays small — 320 px and four figures. Not the app's hierarchy transplanted, but its
*reasoning* applied at this size: the mark, one hero (value), three small ones, the sparkline, one
primary button. Every id stays; the popup has no parity test and renaming buys nothing.

### The bug it must not grow

`popup.js:105` does `e.target.textContent = 'Sync'` in a `finally`. The connection-check button had
the same shape and it produced a real, reported defect: that button carries a broker mark, so
clicking the mark made `e.target` the `<svg>`, `disabled` did nothing, and the busy label was written
*inside the icon* where it stayed. The popup's button is plain text today, so it works — the moment
it gains an icon it breaks the same way. Use `currentTarget`.

### Acceptance criteria

- **AC1** Every string in the popup goes through `t()`, and `missing()` reports zero for both
  languages.
- **AC2** Choosing Nederlands in the app and reopening the popup shows Dutch, including the sync
  progress messages.
- **AC3** Sync reads as the primary action; *Open full chart* does not compete with it.
- **AC4** The busy label restores itself, via `currentTarget`.
- **AC5** With amounts hidden the popup shows no figures either. It already does, through the
  formatters — this pins it so a future inline format cannot open a hole.

---

## Investigation — a price series was rescaled by factor 4,369

Not a story, because what to do depends on what it is.

The split audit rescaled one instrument's history by **factor 4,369, spread 1,05**, on the owner's
account. A split ratio is 2, 3, 4, 10 or 1-for-10; **4,369 is none of those**. The instrument's last
close price is **August 2023**, which is the month it did a 1-for-10 reverse split and was renamed.
The position closed in 2021, so this cannot move the final result — but it moves the **value chart
over the months it was held**, which is the largest chart on the page.

Two hypotheses, and separating them comes before changing anything:

1. **The series spans the split and the audit fitted one factor across two regimes.** Then the factor
   is meaningless and the audit should *refuse* rather than rescale — a wrong rescale is worse than
   none, because it looks correct.
2. **After the rename the vwd id serves a different instrument's series.** Then no factor fixes it,
   and the finding is about identity rather than scale.

The deliverable is a finding with a number in it. If the audit cannot tell these apart from the data
it has, **say so** — that is more useful than a threshold nobody can justify.

### Stop condition

Do not change the rescale threshold to make one account look right. That constant polices every
account, and tuning it to one series is how the next account gets silently mis-scaled.

---

## Still open, and not to be guessed at

The reconciliation now reports **−0,05 against DEGIRO's 0,00** on the owner's account, attributed to
cash rather than to any holding. DEGIRO lists `degiroCash` and `flatexCash` as separate fields, and
`totalCash` may not cover both — the connection check's own `totalFieldsSeen` shows all three.

**This needs one look at a real response, not a fix.** Five cents in red is the correct state until
somebody knows which of those three fields is the whole balance. Picking one to make the check pass
would be defeating the check.

Reported again against 0.47.0, unchanged. Refined into **US-81** at the end of this file — whose
locator ran against the 0.50.0 report and named the rows: see **US-84**. The five cents are the
interest rows, exactly, and the balance-split question above turned out not to be the mechanism.

---

# Refinement 0.49 — the Positions table fits the width it is given

## US-61 — Responsive columns, before a column chooser *(built — awaiting confirmation)*

> **Built.** Columns are data now (`src/ui/columns.js`), the table drops lowest-priority columns to
> fit its own container and folds them into a per-row expand, the four load-bearing columns never
> drop, and a **Columns** chooser (persisted like the theme) is the escape hatch. Browser-verified
> from desktop to phone with no sideways page scroll; `test/columns.test.js` guards the pure floor.
> The refinement below is what it was built to.

> *"we need a solution for the width of the columns where we fix this unresponsive table. Maybe give
> a toggle where we can show or hide certain columns, basically make it responsive like that? Or what
> does mister apple design think."*

### The complaint is real, and US-49 half-anticipated it

The merged Positions table (US-49) carries eleven columns — Instrument, Quantity, Price, Average
paid, Value, Paid in vs grown, Result, Dividend (all time), % of bought, Share %, Currency — plus the
snapshot button. Below a wide desktop it overflows into a horizontal scrollbar on the table itself
(the second screenshot). US-49's AC9 already required the table to *"scroll in its own container… no
horizontal page scroll"*, and it does — the scrollbar is scoped, the page does not move. **But a
scoped scrollbar is the floor, not the goal.** A scrollbar under the primary content of the page
reads as "it did not fit," and the owner is right that it should fit.

**A second example settles what kind of problem this is.** With US-46 anonymize *on* — every amount
masked to `€ •••` — the table still overflows exactly as far. Masking narrows the *cells* and does
nothing to the *column count*, so the eleven columns still demand their width. That is the tell:
this is a **layout/priority** problem, not a content one, and no amount of shortening what is *in* a
cell fixes it. The lever is how many columns are shown, which is what the two mechanisms below act
on.

### What mister apple design thinks: two mechanisms, in this order

The instinct — a column on/off toggle — is **right, but it is the second half, not the first.** Apple
§16.6 (Simplicity, *not* minimalism) and §16.5 (Flexibility) split this into two jobs:

1. **Priority-based responsive disclosure — the default, and it does the real work.** Every column
   gets a priority. At full width all eleven show; as the table's own container narrows, the
   **lowest-priority columns drop first**, and the dropped ones fold into a **per-row expand** (a
   disclosure on the row reveals the hidden fields for that position). No configuration, the common
   path stays clean, and the detail is one level deeper — which is exactly *"show the common path
   first, advanced options one level deeper."* A fresh install fits on first paint, with nobody
   touching a setting.

2. **A column chooser — the escape hatch, and the owner's proposal.** A **Columns** control in the
   existing filter row (beside *Open · Closed · All*, the type chips and *Table · Share*), a
   checklist of the optional columns, persisted like the theme and anonymize. This is Flexibility's
   *"let people hide what they don't use"* — it refines the responsive default for a power user, it
   does not carry the whole load. Building only the chooser leaves a first-run reader staring at a
   scrollbar until they discover a menu, which is the thing to avoid.

The order matters because the chooser alone does not solve the reported problem, and the responsive
default alone solves it for everyone. Build the default first; the chooser is cheap once it exists.

### The load-bearing four, which never drop and cannot be hidden

The responsive drop and the chooser both respect a floor: **Instrument** (with its swatch — US-49
calls it *"non-negotiable"* because the swatch ties the row to the composition chart), **Value**,
**Paid in vs grown** (the whole reason US-49 exists, and the feature the owner singled out), and
**Result**. These four are the answer to *"how is this position doing"*; everything else is support.
The chooser locks them on; the responsive pass never removes them; and if even these four cannot fit
the narrowest screen, *that* is when the scoped scroll (US-49 AC9, header sticky) is the honest
fallback — for four columns, not eleven.

### It reuses machinery that already exists

The table already drops columns conditionally: under *Closed*, `Quantity`, `Price` and `Share %` are
`—` for every row and are dropped rather than rendered as a column of dashes (US-49). **Width-priority
is the same mechanism keyed on the container's width instead of the view.** So this is an extension of
a path that is already there, not a new table.

### The traps

1. **Measure the container, not the viewport.** The table sits in a section with a left rail (US-16),
   so the space it has is not `window.innerWidth`. A `ResizeObserver` on the table's own container
   decides which columns drop, or it drops the wrong ones on a wide window with a narrow panel.
2. **No layout jump.** US-49's *"one row height for both states"* holds: dropping a column or
   expanding a row must not reflow every row's height. The paid-in-vs-grown bar is the tall cell and
   sets the height; the expand opens beneath a row without changing the rows around it.
3. **Hiding a column changes no number.** The cash row still carries `accountResult −
   positionResult` so the Result column sums to the account's result (US-49); the `est.` marker and
   the unattributed-dividend note still appear. Column visibility is display-only and touches nothing
   the engine computed.
4. **Visibility and masking are orthogonal.** US-46 still governs amounts in whatever columns are
   shown; hiding a column is not masking it and masking a column is not hiding it. Two independent
   display states, and a test keeps them from entangling.
5. **A dropped column's caveat is not tidied away.** If `Currency` drops, the row expand still
   states the currency; if a row is estimated, the `est.` caveat survives into the compact view —
   US-49's standing warning that a redesign must not lose the caveat.
6. **No reordering, no presets, no second layout (rule 8).** Nobody asked to drag columns into a new
   order or to save named column sets, and the priority+expand reaches phone widths without a
   separate card-layout to maintain. If it turns out it cannot, a card layout is its own story — not
   smuggled in here.

### Acceptance criteria

- **AC1** At a wide width all columns render. As the table's container narrows, the lowest-priority
  columns drop in a defined priority order, and the load-bearing four never drop.
- **AC2** Every dropped column is reachable per row through a disclosure that shows that position's
  hidden fields. No data becomes unreachable at any width.
- **AC3** A **Columns** control in the filter row toggles the optional columns; the load-bearing four
  are locked on; the choice persists like the theme and survives a reload.
- **AC4** At the narrowest width the table fits with no horizontal *page* scroll; if the load-bearing
  set itself cannot fit, it scrolls in its own container with the header sticky (US-49 AC9).
- **AC5** Hiding or dropping a column changes no figure: the cash row still makes Result sum to the
  account's result, and the `est.` marker and unattributed-dividend note still render.
- **AC6** With US-46 on, amounts in the visible columns are still masked; visibility and masking are
  independent, asserted by a test.
- **AC7** No row-height reflow when columns drop, the chooser changes, or a row expands.
- **AC8** `npm run demo` renders the table at 1280 px (all columns), a tablet width (priority drop),
  and a phone width (load-bearing four + row expand) with no horizontal page scroll at any of them.

### Stop condition

If making it responsive needs a number the engine does not already return, stop — this is display
over `r.byProduct`, which already holds every figure. And if the narrow layout grows into a second
full card-rendering path with its own code, stop and make *that* its own story: the priority-drop and
the row expand are the smaller thing that answers the complaint, and rule 8 says build that first.

---

# Refinement 0.50 — a second Apple-fluid tier, on the chart

Four more from the Apple-design pass, and the discipline holds: **motion on the controls and the
chrome, never on the data.** Two extend the value chart — the app's most physical surface — and are
the ones worth building (US-62, US-63); two are polish (US-64, US-65). The count-up tween stays
rejected for the reason it always was, and US-65 is its one honest form. All four reuse the inline
`rAF` spring US-55 introduces; none is allowed a vendored animation library (CSP, rule 9's
neighbourhood).

---

## US-62 — Scrub the value chart *(built, 0.47.0)*

The value chart draws the line but never says the number under your finger. US-12 already reads a
drag on it (to zoom); this reads a **point** — a crosshair that tracks the pointer 1:1 with a readout
of the value and the date at that x, on the value chart and the cumulative-result chart. It is the
single most-requested-shaped thing a chart can do and the app does not.

**Apple principles:** direct manipulation (§2), response (§1). **Distinct from US-55:** US-55 *sets
the range* (a gesture that changes state); this *reads a value* and changes nothing. The POC
(`docs/prototypes/apple-fluid.html`) has the crosshair + glass tooltip working over a canvas, so the
feel is already demonstrated; `charts.js` is Chart.js, whose interaction layer may give most of it
as configuration plus a vertical guide rather than new plumbing.

**The traps:**

1. **The readout is an observation, not an interpolation.** The series is one value per day (SPEC,
   `dates.js`); snap the readout to the nearest day's *actual* value, never a number between two
   days. A crosshair that invents an intermediate figure is the fabricated-number failure in a new
   place.
2. **US-46 governs it.** The value in the readout is an amount, so it masks when anonymize is on,
   like every other euro; the date does not.
3. **Estimated days say so.** If the day sits on a no-series (estimated) stretch, the readout carries
   the same `est.` honesty the holdings row does.
4. **Reduced motion keeps it.** A crosshair is direct tracking, not vestibular motion — it stays
   under `prefers-reduced-motion`; there is nothing to ease.
5. **It must not fight US-55 or US-12 on touch.** Hover-to-read is free on a pointer; on touch,
   scrubbing has to hand off cleanly from the range gesture and the zoom, or all three fire at once.
   Decide the touch affordance (a scrub mode, or long-press) rather than layering three drags.

**Acceptance criteria:**

- **AC1** A crosshair tracks the pointer 1:1 across the value chart and the cumulative-result chart,
  with a readout of the value and the date at that x.
- **AC2** The value is the nearest day's actual figure — a test asserts no interpolated value is ever
  shown.
- **AC3** With US-46 on, the readout's amount is masked; the date stays.
- **AC4** A day on an estimated stretch is marked as estimated in the readout.
- **AC5** `prefers-reduced-motion` changes nothing — tracking is not motion to reduce.
- **AC6** `engine.js` is unchanged; this reads the arrays the chart already has.

**Stop condition:** if the readout needs a value the series does not hold — anything between two
days — stop. That is an invented number, and this project's whole claim is that it shows none.

---

## US-63 — Momentum and rubber-band on the zoom *(built, 0.47.0)*

US-12 zooms by dragging across the value chart, and it stops dead at the release point and at the
edges. Two Apple touches: release a zoom/pan and it **glides to rest** with a critically-damped
spring; drag the selection past the first or last day and it **rubber-bands** instead of hitting a
wall.

**Apple principles:** velocity handoff (§5), momentum projection (§6), rubber-banding (§9),
interruptibility (§3). Same surface and same spring vocabulary as US-55 — **build them together**,
since the inline spring, the velocity history and the day-snap are shared and doing them twice is how
the two drift apart.

**The traps:**

1. **The window still snaps to real days.** Momentum projects where the edge lands, then snaps to a
   day — no fractional-day window (US-55's rule, here too).
2. **Reduced motion is instant.** No glide, no overshoot; the zoom just applies.
3. **Per-frame recompute is honest (rule 2)** — the same licence US-55 has, and the same budget.
4. **No series repaints on zoom.** The composition ranks on the whole history (charts rule).

**Acceptance criteria:**

- **AC1** Releasing a zoom glides to rest with a spring carrying the release velocity.
- **AC2** Dragging past the first or last day rubber-bands rather than stopping hard.
- **AC3** The resulting window is snapped to real days.
- **AC4** Under `prefers-reduced-motion` the zoom applies instantly, no overshoot.
- **AC5** `engine.js` is unchanged and no series changes colour.

**Stop condition:** as US-55 — this is UI over the arrays the page already holds; the moment it needs
the engine it has stopped being a rendering concern.

---

## US-64 — Sections arrive, they do not cut *(built, 0.47.0)*

The left-rail routes (US-16) swap sections instantly. Apple §7 (spatial consistency) and §3: a
section change **cross-fades and slides a short distance** with a critically-damped spring — anchored,
interruptible, reduced-motion aware. Polish (rule 8) — flagged as nice-to-have, not load-bearing.

**Grounded:** hash routing (`routeFromHash` / `applyRoute`), sections toggled by `hidden`. The
transition wraps the show/hide; it does not touch the router.

**The traps:**

1. **It must not delay the content.** The new section is interactive the instant it is shown; the
   motion is decoration over an already-usable page (response §1). No input lock during the
   transition.
2. **Transform and opacity only (§11).** No animating height or layout — that reflows and janks. A
   short translate plus a fade, on the container.
3. **Charts do not re-animate on a route change.** They already drew; the transition is on the
   container, not the chart's own data draw, or every route change replays every chart.
4. **Reduced motion is an instant swap** (a short cross-fade at most), no slide.

**Acceptance criteria:**

- **AC1** A route change transitions the section with a spring on transform/opacity only.
- **AC2** Fast successive route changes stay smooth — interruptible, not queued.
- **AC3** The page is interactive immediately; nothing is locked out during the motion.
- **AC4** Charts inside a section do not replay their draw animation on a route change.
- **AC5** `prefers-reduced-motion` is an instant or short-fade swap with no slide.

**Stop condition:** if it needs to animate a layout height to work, stop — that is the janky path §11
warns against, and a route transition is not worth a reflow every time.

---

## US-65 — The honest number change *(built, 0.47.0)*

When the range changes, the hero figures jump. The obvious Apple move is a **count-up tween**, and it
stays **rejected**: an interpolated frame shows a value that was never true, which is the one thing
this project refuses. The honest form is a **swap, not a tween** — the old figure fades/slides out
and the new one in, with **no interpolated in-between value**. It signals *"this changed"* without
ever rendering a fabricated number. Polish, and its whole worth is the discipline in the trap below.

**Apple principles:** feedback (§1, §16), craft. **Grounded:** the tiles are already-formatted
strings from `theme.js` (`renderTiles`); the transition swaps the whole string and never touches a
digit.

**The traps:**

1. **Never interpolate the value — this is the entire story.** The only two frames shown are the old
   string and the new string; the motion is opacity/translate on the element, not a numeric tween. A
   test asserts no display code path produces a value between the old and the new.
2. **US-46 governs it.** Both strings come through the formatter, so a masked figure transitions as a
   mask.
3. **Optimism Mode stays quarantined (US-35).** The swap shows real→real or cheerful→cheerful, never
   a mix — it is a display swap downstream of the quarantine, not a new place the cheerful number can
   leak into the real one.
4. **Only when the value actually changed.** Transitioning on every render flickers; compare and
   animate only a real change.
5. **Reduced motion is an instant swap.**

**Acceptance criteria:**

- **AC1** A hero figure that changed value swaps with a fade/slide, old out and new in.
- **AC2** No interpolated numeric value is ever rendered — asserted, not asserted-by-comment.
- **AC3** With US-46 on, the figure transitions as a mask.
- **AC4** The swap fires only when the value changed, not on every render.
- **AC5** `prefers-reduced-motion` is an instant swap with no motion.

**Stop condition:** if any frame shows a number between the old value and the new, stop — that is the
rejected count-up wearing a different name, and it fabricates a value the account never had.

---

## Stories out of the three-lens UI review *(US-66 … US-75)*

> **Prototypes, all three clickable, `nu` beside `voorstel` on every point:**
> `docs/prototypes/ui-review-1-apple.html` (the Apple pass),
> `docs/prototypes/ui-review-2-lenses.html` (charts, the motion gate, the details),
> `docs/prototypes/ui-review-3-arrival.html` (data landing, per card, plus the exact values
> for US-70 and US-68). They carry the tokens out of `styles.css` on purpose, so nothing in
> them looks better than the app it is about.

Three skills were run over the delivered UI — `apple-design`, `dataviz` and
`emil-design-eng` — plus the `find-animation-opportunities` gate, which rejects a candidate
unless it survives frequency, purpose, speed and function. Ten stories survived. **What the
review found already covered is recorded rather than duplicated:** press-on-`pointerdown` and
the reduced-motion posture are US-56, the section transition is US-64, the count-up is US-65
(already decided against, and the review reached the same conclusion independently), the share
sheet's materialize is US-57, and the rubber-band at the ends of the zoom is US-63 AC2.

Two findings are recorded as **deliberate non-changes**, because a later pass will otherwise
"fix" them into defects that were already measured once:

1. **`tabular-nums` on the KPI figures stays.** The dataviz rule says proportional figures on a
   hero number. Here the equal glyph width is load-bearing: `--fits` (`styles.css`) derives the
   maximum string width from *character count × a constant*, which is only true with tabular
   figures, and the last time that maths was wrong the app shipped `€ 111.784,9` with a digit
   sliced off. A rule that reintroduces a measured defect is not an improvement.
2. **The `@keyframes` in Optimism Mode stay.** Emil's "transitions, not keyframes" is about
   surfaces retriggered rapidly; these are not, and US-35's reduced-motion block already stops
   them.

The one Apple chapter the review deliberately did **not** act on is §12, materials and
translucency: the redesign brief §8 took depth out on purpose, and there are figures scrolling
under the rail. A `backdrop-filter` there would reverse a decision for an aesthetic.

---

## US-66 — The drag threshold is a span of days, not a distance *(built, 0.47.0)*

US-12's zoom decides "was that a click or a drag?" in **days**:

```js
if (Math.abs(new Date(end) - new Date(start)) < 2 * 86400000) return;   // app.js:1770
```

Two days is not a length of hand movement, it is a length of history, and the window changes what
it measures on screen. On ALL over five years, two days is under a pixel — so a click that wobbles
zooms the page. On a three-week window, two days is most of a centimetre — so a deliberate drag is
thrown away and nothing happens. The same line is wrong in both directions.

**Grounded:** `wireZoom` in `app.js` (`indexAt`, `pointerdown`/`move`/`up`), the `dragSelection`
plugin in `charts.js`.

**Second half of the same defect: the selection freezes when the pointer leaves the plot.**
`indexAt` returns `null` outside `chartArea` (`app.js:1690`) and the paint stops, so dragging to
the edge looks like a hang. Worth knowing before building: **the drawing side already clamps** —
`charts.js:207` clamps `x1`/`x2` into `chartArea` and the readout box is clamped too. Only the
handler refuses to produce an index. Clamping `frac` to `[0, 1]` is the whole fix, and it is also
the ground US-63 AC2's rubber-band is built on.

**Third: `#c-value` has no `touch-action`,** so on a touch screen the page scrolls during the
gesture and the selection is half of what was drawn.

**The traps:**

1. **Pixels, and one number.** 8 px is the hysteresis §10 asks for. It goes in `config.js` with the
   other tuning constants, not inline, because US-55 and US-63 will want the same number.
2. **The live readout is already right.** The band, the dates, the day count and the result are
   drawn every frame during the drag (`charts.js:225`) — that is §1's continuous feedback, it works,
   and this story does not touch it.
3. **A click must still read the tooltip.** Below the threshold the gesture is someone reading, and
   the tooltip is re-enabled on release exactly as now.
4. **Do not build the spring here.** Momentum and rubber-band are US-63; this story is the two
   thresholds and one CSS property, so it can ship without waiting for the spring vocabulary.

**Acceptance criteria:**

- **AC1** The click/drag decision is a pointer distance in pixels (8 px, from `config.js`), not a
  span of days, and a test covers a 40 px drag inside a three-week window (zooms) and a 3 px wobble
  on ALL (does not).
- **AC2** Dragging outside the plot keeps the selection tracking to the first or last day instead of
  freezing.
- **AC3** `#c-value` carries `touch-action: none`; a drag on a touch pointer does not scroll the page.
- **AC4** The live readout during the drag is unchanged.
- **AC5** `engine.js` is untouched.

**Stop condition:** if the fix wants the spring, stop and build US-63 — this is a threshold defect and
it must be shippable on its own.

---

## US-67 — Hover-only affordances on a pointer that has no hover *(built, 0.47.0)*

Three controls state themselves through `:hover` with nothing behind it:

| Where | Now | On a touch pointer |
|---|---|---|
| `button.snap` (`styles.css:2073`) | `opacity: 0.45`, full at `tr:hover` | permanently half-visible — it reads as disabled while it works |
| `.frown-btn:hover` | `transform: rotate(-15deg) scale(1.15)` | the tap sets hover and it *stays* rotated until you tap elsewhere |
| `.tile .info:hover`, `.gran > button:hover` | surface change only | harmless, same class of bug |

**Grounded:** `styles.css`. The fix is `@media (hover: hover) and (pointer: fine)` around the
dimming and the transform, plus the un-hovered state being the *usable* one — a share button at 45%
is not "quiet", it is a control claiming to be off.

**The traps:**

1. **The un-hovered state is the default, not the fallback.** Without a hover pointer the row action
   is fully visible; the dimming is the enhancement, and writing it the other way round is how this
   bug happened.
2. **`:focus-visible` already works and must keep working** — that path is how a keyboard reaches the
   action and it is the reason the control is reachable at all today.
3. **This is US-56's layer.** One media query in the interaction layer, not a sprinkle per control,
   or the next hover effect lands with the same defect.

**Acceptance criteria:**

- **AC1** With no hover pointer, `button.snap` renders at full opacity.
- **AC2** The 🙃 rotation and every other decorative hover transform only apply under
  `@media (hover: hover) and (pointer: fine)`.
- **AC3** `:focus-visible` still reveals the row action.
- **AC4** A test asserts the hover gate is present rather than assumed.

**Stop condition:** none. This is four selectors.

---

## US-68 — Reduced motion is a sledgehammer, not a setting *(built, 0.47.0)*

```css
* { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
```

`styles.css:2307` kills every transition in the app, including the background and colour changes that
are the *only* thing telling a reader their press registered. §14 and US-56 AC2 both say the same
thing: reduced motion is *gentler* feedback, never *no* feedback.

Today the damage is small because little moves. It stops being small the moment US-70, US-73, US-74
or US-75 lands — every one of those degrades to a colour or opacity change, and the star selector
deletes exactly that.

**The replacement is written out in full** in `docs/prototypes/ui-review-3-arrival.html`: name what
must not move (transforms), keep what must still answer (surface, colour, opacity), and let the four
motion stories each state their own reduced form.

**The traps:**

1. **Longer than what it replaces, and that is the point.** The one-liner is short because it does not
   think. Four named exceptions can be read and tested.
2. **This is US-56 AC2 as a defect.** If US-56 is built first it absorbs this story; if this ships
   first, US-56 AC2 is already met and says so.
3. **Do not soften Optimism Mode's block.** US-35's `animation: none` there is correct and stays.

**Acceptance criteria:**

- **AC1** The `*` rule is gone; `prefers-reduced-motion: reduce` names the properties it stops.
- **AC2** Under reduced motion a pressed control still changes surface colour.
- **AC3** No `transform`-based motion plays under reduced motion.
- **AC4** A test asserts the media query exists and that no `*`-scoped `!important` duration rule does.

**Stop condition:** none.

---

## US-69 — Two curves and two durations, named once *(built, 0.47.0)*

Every transition in the app picks its own easing: `120ms ease`, `0.12s` with no curve at all,
`100ms ease-out`, `0.15s ease`. Nothing is wrong and nothing is shared, so the fifth one will be a
fifth guess. Four tokens beside the existing ones in `:root`, and the built-in curves replaced —
`ease-out` starts slowly at exactly the moment the reader is looking hardest.

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);   /* something arriving or leaving */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* something moving across the screen */
--t-press: 100ms;
--t-surface: 140ms;                            /* open; close is ~110ms, deliberately shorter */
```

**The traps:**

1. **A token with no caller is a token nobody maintains** (the note above `--kpi` in `styles.css` says
   this already). So this ships *with* US-70 or not at all — two curves used by four surfaces, not four
   tokens sitting in `:root` waiting for a purpose.
2. **Exit shorter than enter.** Opening is an announcement, closing is an answer. One ratio, everywhere.
3. **Springs are not in scope.** US-55/US-63 own the spring vocabulary for gestures; these are for
   surfaces that appear and disappear.

**Acceptance criteria:**

- **AC1** The four tokens exist and every transition added by US-70/US-73/US-74/US-75 uses them.
- **AC2** No new transition specifies a raw `cubic-bezier` or a bare `ease` inline.
- **AC3** A test (or `npm run palette`'s sibling check) asserts each token has at least one caller.

**Stop condition:** if it lands without a caller, delete it — rule 8.

---

## US-70 — The four overlays come from the control that opened them *(built, 0.47.0)*

The overflow menu, the granularity menu, the column chooser and the diagnostics dialog all appear with
`hidden = false` and vanish the same way: no path, no origin, no relation to the button that opened
them. §7 (spatial consistency) is one line — a thing emerges from where it came from — and this is the
most visible place in the app where it is missing. **The share sheet is not in scope: that is US-57.**

**Grounded:** `app.js:939` / `:1001` (menus), the `.cols-pop` toggle, `showModal()` at `:571` and
`renderDiagnostics`. Origins per surface, and the modals stay centred because they hang off nothing:

| Surface | `transform-origin` | Open / close |
|---|---|---|
| `#more-menu` | `bottom left` — it hangs off the foot of the rail and opens upward | 140 / 110 ms |
| `.gran .menu` | `top left` | 140 / 110 ms |
| `.cols-pop` | `top right` — it is right-aligned under its button | 140 / 110 ms |
| `.modal` (diagnostics) | `center` — no trigger to come from | 160 / 120 ms |

**The traps:**

1. **No timer, no `.closing` class.** The extension is Chromium-only, so `@starting-style` plus
   `transition-behavior: allow-discrete` animates `display` and `::backdrop` from CSS. A JS class with
   a `setTimeout` is a class that stays stuck when something interrupts it — §3's failure mode with a
   different name. The exact block is in the round-3 prototype.
2. **Never from `scale(0)`.** 0.96–0.97 with opacity; nothing in the world appears from nothing.
3. **The backdrop fades with the sheet.** The grey layer is the largest thing on screen and it is the
   part that currently snaps.
4. **Escape and the focus trap are `<dialog>`'s** and stay `<dialog>`'s — this adds motion to
   `showModal()`, it does not replace it.
5. **`hidden` still means hidden** (the `!important` rule at the top of `styles.css`). The transition
   must not leave a menu at `opacity: 0` while still hit-testable — that bug shipped three times in
   this project in another form.

**Acceptance criteria:**

- **AC1** Each of the three popovers scales and fades from the origin in the table above; the
  diagnostics dialog and its backdrop fade and scale from centre.
- **AC2** Closing mirrors opening along the same path, and is shorter than opening.
- **AC3** Implemented in CSS (`@starting-style` + `allow-discrete`); no timer decides when a surface
  is gone.
- **AC4** A closed overlay is not focusable and does not receive pointer events, asserted by test.
- **AC5** Escape, the focus trap and the click-outside dismissal behave exactly as before.
- **AC6** Under `prefers-reduced-motion` all four cross-fade with no scale (US-68's block).

**Stop condition:** if `allow-discrete` cannot carry it and a JS timer is the only route, ship the
opacity cross-fade alone and drop the scale — a stuck menu is worse than a menu with no path.

---

## US-71 — A chart a screen reader can read *(built, 0.47.0)*

Thirteen `<canvas>` elements, no `role`, no `aria-label`, no table equivalent except the one the
Positions card already has. A screen reader gets **nothing** — not a value, not even "a chart".
dataviz's own rule is blunt about it: every chart has a table-view twin, and a tooltip is never the
only way to read a value.

**Grounded:** the canvases in `app.html`, the builders in `charts.js`, and the precedent already in
the app — `renderHoldingsShare` toggles between the pie and the table for exactly this reason, and its
hint text says so.

**Two halves, both cheap:**

1. **A generated summary.** `role="img"` plus an `aria-label` built from the same array the chart
   draws: window, start value, end value, extreme and its date, direction. No new truth, so no risk of
   a summary that disagrees with the picture beside it.
2. **A table twin** on the charts that carry figures a reader would want, reusing the Positions
   pattern and the existing view-toggle control.

**The traps:**

1. **US-46 governs both.** Amounts in the label and in the table mask when anonymize is on — a summary
   sentence is a new place for an unmasked figure to escape, and the export leak in 0.10.0 is what that
   costs.
2. **The summary is derived, never stored** (rule 2). It is built at render from the arrays, so it
   cannot drift from the chart.
3. **Estimated stretches say so**, like US-62's readout and the holdings rows.
4. **Not thirteen bespoke sentences.** One function per chart *shape* (series over time, bars per
   month, part-of-whole), or the fourteenth chart ships without one.
5. **`aria-live` is wrong here.** The summary is a description of a static image, not an announcement;
   making it live means it shouts on every range change.

**Acceptance criteria:**

- **AC1** Every canvas carries `role="img"` and an `aria-label` generated from its own series.
- **AC2** The charts carrying figures have a table twin reachable from the same control pattern as the
  Positions share/table toggle.
- **AC3** With US-46 on, amounts in labels and twins are masked; dates are not.
- **AC4** A day on an estimated stretch is marked estimated in the twin.
- **AC5** A test asserts every `<canvas>` in `app.html` has a label, so a new chart cannot ship without
  one.
- **AC6** `engine.js` unchanged.

**Stop condition:** if a summary needs a number the series does not hold, stop — same rule as US-62.

---

## US-72 — The end of a line, without hovering *(built, 0.47.0)*

Where a series ends is the question most people ask a line, and on four charts it lives only in the
tooltip. The value chart is covered by the KPI tile above it; the cumulative result, invested-vs-value
and dividend charts are not. dataviz's rule is *selective* direct labels — the endpoint, the extreme,
the one series that matters — never a number on every point.

**The traps:**

1. **One label, not a series of them.** A value beside every point is the anti-pattern this replaces.
2. **US-46 masks it** like every other amount on screen.
3. **It must not collide.** Clamp inside the plot area the way the drag readout already does
   (`charts.js:238`) rather than letting it run off the edge.
4. **Text wears text tokens**, not the series colour — the dot beside it carries the identity.

**Acceptance criteria:**

- **AC1** The last point of the cumulative, invested-vs-value and dividend charts carries a dot and a
  formatted label.
- **AC2** No other point is labelled.
- **AC3** The label masks under US-46 and stays inside the plot at every width.
- **AC4** `npm run palette` still passes (the label is text on the chart surface).

**Stop condition:** none.

---

## US-73 — A notice must not shove the page *(built, 0.47.0)*

`notice()` appends a banner to `#notices` and `clearNotices()` empties it, so during a sync the page
below jumps in one frame, twice per notice, while the reader is looking at the figures. Purpose:
preventing a jarring change — the one entry on the gate's list that this is.

**Grounded:** `notice`/`setNoticeText`/`clearNotices` in `app.js:3829`, and `startAndFollow`, which
posts one progress banner, rewrites its text per step, then clears.

**The traps:**

1. **Rewriting text must not re-animate.** `setNoticeText` updates the same node every step; only
   insertion and removal transition, or the banner flickers seven times per sync.
2. **Grid rows, not `height: auto`.** `grid-template-rows: 0fr → 1fr` transitions without measuring
   and without a reflow per frame.
3. **An error is not a decoration.** A failure banner appears with the same 180 ms and no bounce; it
   must never look playful, and it must never be *slower* to appear than the failure it reports.
4. **`aria-live` behaviour is unchanged** — the notice is announced when it is added, not when the
   transition ends.

**Acceptance criteria:**

- **AC1** A notice being added or removed transitions its own height and opacity; content below does
  not jump.
- **AC2** Text rewrites in place with no transition.
- **AC3** Error and warning notices use the same timing as info ones.
- **AC4** Screen-reader announcement is unchanged, asserted by test.
- **AC5** Under `prefers-reduced-motion` the row still opens (that is layout, not vestibular motion)
  but with no translate.

**Stop condition:** none.

---

## US-74 — The theme change is a light switch *(built, 0.47.0)*

Light to dark goes from near-white to near-black in one frame. §14 names abrupt brightness jumps
specifically, and this is the app's only one. It is also rare — a handful of times ever — so it is
exactly where a little cost is affordable: a 220 ms cross-fade on the surfaces and the ink.

**Grounded:** `theme.js` sets `data-theme` on the root; the tokens are in `styles.css`.

**The traps:**

1. **Colour only, no movement.** So it survives `prefers-reduced-motion` untouched, and it is one of
   the few transitions that should.
2. **Name the properties.** `background-color`, `color`, `border-color` on the surfaces — not
   `transition: all`, which would drag every unrelated property into it.
3. **The charts are canvases and do not cross-fade.** They are redrawn on the theme change
   (`theme.js` re-reads the tokens), so they will switch instantly while the page fades. Decide that
   deliberately: either accept it, or fade the chart container too. A half-faded page around an
   instantly-switched chart is worse than no transition.
4. **Do not transition on first paint.** The class goes on after the initial render, or every load
   starts with a fade from the wrong theme.

**Acceptance criteria:**

- **AC1** Switching theme cross-fades surfaces, text and borders over ~220 ms.
- **AC2** No transform, and the transition survives `prefers-reduced-motion` deliberately.
- **AC3** The first paint after load does not animate.
- **AC4** The chart repaint and the page fade do not visibly disagree.

**Stop condition:** if the canvases cannot be brought into line with the page, ship it without the
fade — a page that fades around a chart that snaps draws attention to the seam.

---

## US-75 — Data arrives per card, and when it comes into view *(built, 0.47.0)*

The moment the data lands, the whole screen fills in one frame: `clearNotices()`, `refresh()`, done.
This is the one place in the app where the delight budget is genuinely available — it happens once per
sync, it is a rare high-emotion moment, and right now it says nothing at all. Every render-frequency
animation was rejected precisely so this one could be afforded.

**Two triggers, both real:**

1. **On arrival.** Cards reveal in document order, 60 ms apart. Charts get a soft left-to-right mask
   (520 ms hero, 360 ms the small ones); tiles, bars and cards rise 6 px and fade (260 ms); table rows
   stagger 28 ms with a cap at ten, because ninety positions at 28 ms is two and a half seconds of
   waiting for your own data.
2. **On coming into view.** A card below the fold reveals when it scrolls in — once, then the observer
   drops it. Without this, half the reveals happen off screen and are simply wasted. It is also the
   next step of a pattern the app already has: `onScreen()` (`app.js:1419`) builds only the active
   tab's charts, so charts out of view already do not exist.

**The whole story is in `docs/prototypes/ui-review-3-arrival.html`,** including the
alles-tegelijk/per-kaart switch that makes the difference visible, and the three hero variants with the
recommendation (A, the soft wipe; not B, the pen-tip dot).

**The traps:**

1. **The mask runs over a finished drawing.** This is the design decision that makes the story
   affordable: the reveal is CSS over a canvas Chart.js already drew, so **`animation: false` in
   `charts.js` stays off** — that was measured for two-thousand-point series and is not reopened here.
   A chart that animates its own data is a chart that appears to be computing while you watch, which
   is the one impression this app must not give.
2. **Once per arrival, never per render.** A range or granularity change redraws the same series and
   gets nothing — that is US-64's territory for sections and pure latency here.
3. **No value moves.** Rise and fade, on elements that already hold their final string. US-65 settles
   this for figures and the same rule applies: no digit is interpolated, and bars fade rather than
   growing from zero, because a bar growing from zero is a value climbing.
4. **Nothing waits for it.** The page is interactive during the reveal; the mask is a layer over a
   live screen.
5. **The skeleton is for an empty account only.** On a *re*-sync there is already data on screen: it
   holds at reduced opacity and is replaced. A skeleton there means the layout jumps twice per sync,
   which is the defect US-73 is fixing next door.
6. **Reduced motion turns the wipe into a cross-fade.** A mask travelling across a large surface is
   exactly what §14 is about; the arrival stays, the travel goes.
7. **One observer, disconnected on tab change.** Thirteen observers, or one that outlives its cards, is
   a leak in a page that re-renders on every range change.

**Acceptance criteria:**

- **AC1** After a sync, cards reveal per card (60 ms apart) rather than all in one frame.
- **AC2** Charts reveal with a mask over an already-drawn canvas; `animation: false` is still set in
  `charts.js`, asserted by test.
- **AC3** Tiles, bars and rows fade and rise; no numeric value is interpolated and no bar grows from
  zero.
- **AC4** A card below the fold reveals when it enters the viewport, once, and re-scrolling does not
  replay it.
- **AC5** A range, granularity or tab change does not replay any reveal.
- **AC6** The page is interactive throughout; no input is blocked.
- **AC7** A re-sync holds the previous render rather than showing a skeleton.
- **AC8** Under `prefers-reduced-motion` the wipe is a cross-fade and the stagger is gone.
- **AC9** The observer is disconnected and rebuilt with the render; a test asserts no observer outlives
  its cards.

**Stop condition:** if the reveal cannot be done without turning Chart.js's own animation on, stop.
The moment the data draws itself, this stopped being a story about arrival and became a story about
pretending to compute.



---

# Refinement after 0.47.0 — the numbers collided, and this is the repair

Four v0.47 reports were refined in parallel sessions, each on its own branch, and each session
numbered its story against the `main` it could see. Three different stories ended up as **US-76**
and three as **US-66**. This section is the repair: every pending story gets one number, here, on
`main`. US-76 and US-77 below arrived built, merged from `claude/paid-vs-grown-discrepancy-rk40yw`.

**The rule, so it cannot happen again: a story number is claimed by landing in this file on
`main`, and nowhere else.** A branch that refines a story brings the text here first (or
immediately after), rather than holding it. The next free number is stated at the end of this
section — a session that cannot see other sessions' branches *can* see this line.

## US-76 — The card and the row disagree about the same position *(built, defect)*

> *"waarom komt dit niet overeen"* — one screenshot, one instrument, two figures. The holdings row
> read **-€99,02 · -1,57 %**. The card shared from that same row, on the same day, read **+€175,50 ·
> +2,79 % op je inleg**, and under it a bar saying **97% paid in · 3% grown** for a position that was
> sold months earlier.

A different sign for the same position is the worst class of defect this project can have: both
figures look right, and a reader who never opens both never learns that one of them is wrong. It was
three faults stacked on one position, all of them on closed positions, and the third had been on
screen since US-52.

### 1. The span stopped a day before the position did

`positionSpan` ended at the last day `qty` was non-zero. But `qty` is the quantity at the **end** of a
day, so the day a position is sold out reads zero — and that is exactly the day its largest single
P/L lands on:

```
pnl[i] = values[i] - values[i - 1] - tradedIn[i]     // = 0 - yesterday's value + proceeds
```

The move between the last close and the price it actually sold at. The card's span excluded it; the
table's Result column sums the whole window and included it. The **€274,52** between the two reported
figures is that one missing day, and it is the reason the sign flipped.

The fix is one clause: a day belongs to the position if it was held at the end of that day **or at the
end of the day before**. It reaches back before the window's start on purpose — a window that opens on
the sale day contains that sale, and the row counts it there.

### 2. The percentage divided by what was *left* in it

`moneyIn` was `paidIn[to] - paidIn[from-1]` — the **net** still in the position. For anything sold out
that is zero, or negative when it sold above cost, so:

- a closed position had no denominator at all, and the only reason one appeared is that the span
  stopped a day early (fault 1) and read the net on a day the money was still in;
- and halfway there, it is wrong in a direction nobody would notice: sell half of a doubled position
  and the net falls while the result stays, so the same position reports a **rising** return as money
  comes off the table.

"For every euro I put in, this came back" asks about the euros that went in — a flow, not a stock. New
`moneyInOver(paidIn, from, to)` sums the *rises* of `paidIn` over the span: gross money in, counted
once, over the same days as the numerator.

**And the holdings row now divides by the same function.** Its `% of bought` was the window's result
over `p.bought`, which is all-time — US-50's defect, fixed on the card in phase 7 and left standing in
the table, so a 1Y window there divided one year of result by six years of buying. Two figures on one
screen answering one question two ways is what the report was about; there is one way now, and at ALL
the row and the card agree to the digit by construction.

### 3. A paid-in-vs-grown bar for a position that no longer exists

The bar splits a **stock** — this is US-53's whole finding, one story up. A closed position is worth
nothing, so there is nothing to split, and `splitModel` was being handed a net and a result that no
longer describe anything on screen. A position sold out at a loss came back as *"100% of what you paid
in is gone"* on a sale that lost 20 %, because the money left in it and the loss happened to be the
same size.

The holdings row has always printed a dash there (`cellFor.split` is `open(p) ? … : dash`). The card
now agrees: no bar unless the position is open on the last day of the span.

### Acceptance criteria

- **AC1** For a position sold on day *k*, the span ends at *k*, and the card's amount equals the
  holdings row's Result for the same window, to the cent. Asserted through `computePortfolio`, not
  from hand-written arrays — the fault was in the relationship between `qty`, `pnl` and `paidIn`, and
  a test that invents all three can quietly make them agree.
- **AC2** The card's period states the sale date, not the day before it.
- **AC3** The card's percentage and the row's `% of bought` come from `moneyInOver` over the same
  window, and the row's numerator and denominator cover the same days.
- **AC4** `moneyInOver` counts rises only: a window containing nothing but a sale took no money in, so
  the caller has no denominator and says so instead of printing a percentage of nothing.
- **AC5** No split bar on a card for a position that is not open at the end of the span.
- **AC6** The snapshot field list is unchanged. This story moves no new value onto the card.

### Why no browser pass would have caught it

`fixtures/` has **no closed position** — ten products, all still held. Every fault here is on a
position that has been sold, so `npm run demo` could not show any of them and neither could a
screenshot of it. That is a gap in the generator rather than in the story, and it is the reason AC1 is
asserted through `computePortfolio` instead of through the UI. Worth a round trip in
`tools/make-fixtures.mjs` the next time that file is opened for another reason.

### Stop condition

If agreeing needs a cost basis — proceeds minus FIFO cost, or an average — stop and re-read US-53.
Every figure here is `value = paidIn + result` applied to one holding, which is why it can be checked
at all; the moment a convention is chosen, it is a SPEC-level decision and not a defect fix.

---

## US-77 — The card's line was missing the days that mattered *(built, defect)*

> *"ook de charting gaat niet goed"* — the second half of the same report as US-76, on the same card.

`sparkline()` reduced a position's daily series to 48 points by taking every *n*-th day:

```js
const stride = (xs.length - 1) / (max - 1);
return Array.from({ length: max }, (_, i) => xs[Math.round(i * stride)]);
```

Both ends survive, and nothing else is guaranteed. The peak and the trough are kept only if the stride
happens to land on them, and on a multi-year position it lands on roughly one day in forty.

**Measured over the demo account's ten positions: 5 % to 14 % of each position's range was thrown
away.** On ASML the drawn high was €15 197 where the real one was €17 505; on INGA the drawn recovery
stopped €580 short. A crash lasting a fortnight inside a five-year holding can vanish completely.

### Why it is invisible, which is what makes it worth a story

`drawSpark` normalises the line to *its own* extent. Lose the worst day and the remaining points
simply fill the plot again: same height, same confidence, shallower shape. Nothing on the card looks
wrong, there is no gap and no artefact — the line is just no longer the one the position drew. It is
the same failure mode as the palette that was asserted rather than measured: plausible, and wrong in a
direction nobody checks.

It also disagrees with the app. The page's own charts draw every day, so the card and the chart of the
same position over the same range showed two different shapes.

### The fix

Min/max decimation, the waveform convention. The interior is cut into equal-width buckets and each
contributes its lowest and its highest day **in the order they happened**:

- the global peak and trough are always drawn — they are the extreme of whichever bucket holds them;
- no point is invented: every value is a real day's, never an average or an interpolation;
- a monotone run stays monotone, because min-then-max of a rising bucket is its first and last day;
- the point budget is unchanged (two per bucket plus both ends, ≤ 48), so nothing about the drawing,
  the card layout or the file size moves.

The one thing given up is uniform spacing in time: within a bucket, two days are drawn as if evenly
spaced across it. Buckets are equal in time and each gets two slots, so the distortion is bounded by
one bucket's width and never accumulates. On a shape with no x-axis that is the cheaper of the two
prices — the honest version of a path is the one that still contains its worst day.

### Acceptance criteria

- **AC1** A series whose extremes fall between two stride points still draws both of them.
- **AC2** Never more than `max` points, at every length either side of the cap.
- **AC3** Every drawn point is a value that occurs in the input — no averaging, no interpolation.
- **AC4** Both ends are kept; the last point is the position's result, which is the figure printed
  above it (US-76).
- **AC5** A monotone series comes back monotone.

### Stop condition

If keeping the shape needs more than 48 points, stop and re-read US-59: the card is read at the size a
chat renders it, and a denser line there is a smudge, not more information.


## US-78 — Three of the four shapes are off screen, and nothing says so *(built)*

*Refined on `claude/v47-nav-aspect-ratio-v0wa42` as US-76; renumbered here — see the note above on how the numbers collided.*

The **Shape** control in the share sheet is a strip four items long inside a window two items wide,
with no arrows, no dots, no edge fade and no page indicator. The reader sees two shapes, no reason to
believe there are more, and the one gesture that would reveal them — a horizontal drag — is announced
only by `cursor: grab` (`styles.css:810`), which is invisible until the pointer is already over the
control and does not exist at all on a touch screen. That is the same class of defect US-67 shipped a
fix for: a hover affordance standing in for the usable state.

Reported from the sheet as it ships in 0.47.0: *"this navigating feels horrible."*

### The measurement

Nothing here is estimated; every number is in the files.

| Thing | Where | Value |
|---|---|---|
| Controls column | `styles.css:746` (`.share-body`) | `15rem` = 240 px |
| Strip padding | `styles.css:811` | 3 px each side → 234 px of window |
| Item width | `styles.css:833` (`.fmt`) | `min-width: 6.5rem` = 104 px |
| Track gap | `styles.css:820` (`.fmt-track`) | 10 px |
| Pitch | measured by `stepOf`, `app.js:879` | 114 px |
| Items | `FORMATS`, `snapshot.js:127` | 4 — `1:1`, `4:5`, `9:16`, `16:9` |

234 ÷ 114 = **two items and six pixels of nothing**. The repo already knew this and wrote it down
rather than fixing it: `test/motion.test.js:481` reads *"at rest the window shows 1:1 and 4:5; tabbing
to 9:16…"*. Half the control has never been visible.

### Four mechanisms, and they compound

1. **The first paint measures a hidden dialog.** `showShareSheet` calls `paintShareControls()` before
   `openModal(dlg)` (`app.js:793` then `794`), so the strip is built and measured while the `<dialog>`
   is still closed and therefore `display: none`. Every `offsetLeft` is 0, `stepOf` returns 0, and
   `target = -index * 0` is 0. The default format is `'16:9'` (`app.js:120`) — the *last* item — so on
   the first open the pressed shape is the one shape not on screen. Move the paint after the open, or
   make the alignment re-measure once laid out.
2. **Front-alignment has no end stop.** `target = -index * stepOf(track)` (`app.js:876`) puts the
   chosen item at the left edge, which for the last item scrolls the track a full three steps and
   leaves the window showing one shape and a void where items five and six would be. A carousel needs
   a last-page clamp: `max(target, -(trackWidth − windowWidth))`.
3. **The drag itself is unbounded.** `stripX.snap(stripX.x + e.movementX)` (`app.js:898`) accepts any
   x; only the *landing* index is clamped (`app.js:917`). So the strip can be dragged completely empty
   and only snaps back on release. The rubber-band this wants already exists in `motion.js` from
   US-63 and is simply not called here.
4. **The click/drag threshold is the one US-66 replaced.** `moved += Math.abs(e.movementX)`
   (`app.js:893`) with `if (moved < 4) return` (`app.js:911`) counts *travel*, so a 2 px wobble back
   and forth is a drag. US-66 settled this for the chart: 8 px of **distance**, from `config.js`. The
   strip kept the old rule.

### What was asked for

> *"I want some smart tucked away buttons to slide through the options, and 1:1, 16:9, 4:3 should be
> the 3 default options before you slide."*

Three things, in order of what they cost:

- **`4:3` does not exist yet.** `FORMATS` is `1:1 · 4:5 · 9:16 · 16:9`. Adding `{ id: '4:3', w: 960,
  h: 720 }` is one line, and the comment above `FORMATS` (`snapshot.js:120`) already promises that is
  all it is: *"Anything else is a fifth entry here and no change anywhere else."* This story is the
  test of that claim. Short edge 720 px equals `16:9`'s, so the US-59 type floors
  (`CARD_MIN_TYPE_PX` at `CARD_RENDER_MIN_PX`) hold without a new number.
- **The three defaults must be the three that are visible**, which means both a reorder — `1:1`,
  `16:9`, `4:3`, then `4:5` and `9:16` — and a window that actually fits three. It does not today:
  three items at the current metrics need 332 px in a 234 px window. Either the item narrows to ~71 px
  (label under the shape, or the shape's long edge down from 34 px to ~24 px) or the strip spans the
  sheet's full width instead of sitting in the 15rem column. The build picks; AC2 is the outcome, not
  the route.
- **The tucked-away buttons.** Two chevrons that appear only when there is something past that edge
  and page the strip by one window. They are navigation, not choice: the shapes keep `aria-pressed`
  and the chevrons carry neither it nor a format id, or a screen reader is told there are seven
  shapes.

### The traps

1. **Do not turn the strip into a scroll container.** `overflow-x: auto` with `scroll-snap` would fix
   the geometry and break US-57: the spring writes `transform` per frame, and a scroll position plus a
   transform is two mechanisms fighting over one x. The window stays `overflow: hidden` and the spring
   stays the only thing that moves it.
2. **Do not add a second spring.** Bounds, rubber-band and projection all come from `motion.js` —
   US-69's point was one vocabulary, and a carousel with its own feel reads as a second product.
3. **The keyboard path is already built and must not regress.** The `focusin` handler (`app.js:934`)
   brings a tabbed-to shape into the window because a transform cannot be `scrollIntoView`d. Two new
   chevrons are two new tab stops between the shapes and the theme control — they may not sit between
   the shapes.
4. **The reorder is the DOM order.** Reorder `FORMATS`, not the visual layout: a CSS `order` would
   leave the tab order and the screen-reader order saying `4:5` comes second when it is fifth.
   `formatById`'s unknown-id fallback is `FORMATS[0]`, which stays `1:1`.
5. **`test/anon-brand-snapshot.test.js:385` asserts the length and the exact order** and changes with
   this story, deliberately. Every other card test loops over `FORMATS`, so `4:3` inherits the ramp,
   the floors and the footer checks for free — if it does not, that is the real finding and it is
   about US-59, not about this control.
6. **Five formats, not eight.** Only `4:3` was asked for. No `3:2`, no `21:9`, no custom size — rule 8,
   and every unreached format is a crop nobody has looked at.
7. **A defect fix, not a redesign of the sheet.** The theme and amounts controls, the preview and the
   two export buttons are untouched.

### Acceptance criteria

- **AC1** `FORMATS` is five entries, ordered `1:1`, `16:9`, `4:3`, `4:5`, `9:16`; `4:3` is 960×720 and
  a test checks its ratio like the other four.
- **AC2** At rest the window shows the first three shapes **complete**, measured at the 15rem controls
  column and at a 320 px viewport; no shape is clipped at either.
- **AC3** A chevron appears at an edge only when there is something past it, pages the strip by one
  window, and is visible without hover on a touch pointer. Neither chevron carries `aria-pressed` or a
  format id.
- **AC4** The chosen shape is always fully in the window, including on the *first* open of the sheet
  with the default `16:9` — a test asserts the alignment is computed after the dialog is open, or that
  a zero measurement is re-taken rather than used.
- **AC5** The strip cannot be dragged or sprung past either end: the last page clamps, and an
  over-drag rubber-bands through `motion.js` rather than emptying the window.
- **AC6** Click and drag are told apart by pointer **distance** in pixels, from the same `config.js`
  constant US-66 introduced, not by accumulated travel.
- **AC7** Tab and Enter still reach and choose all five shapes, and a tabbed-to shape is still brought
  into the window.
- **AC8** Under `prefers-reduced-motion` the strip jumps and the chevrons still page it.
- **AC9** `engine.js`, the snapshot renderer and the export are untouched; no resync.

**Stop condition:** if fitting three shapes requires the sheet's layout to change — the controls column
widening, the preview shrinking — stop and say so. That is a share-sheet layout story with a preview to
re-check at four sizes, and this one is a picker that hides most of itself.

### Built, and it was five mechanisms rather than four

The stop condition was not reached: the item is a *third of the window* in CSS, so three shapes are
complete at whatever width the column has, and no layout above the strip moved. Everything else landed
as refined — `4:3` cost one line and every card test picked it up unchanged, exactly as the `FORMATS`
comment claimed it would.

**The fifth mechanism was found in the browser, and it is the worst of them: tapping a shape did not
select it.** `setPointerCapture` on `pointerdown` retargets the `click` that follows to the capturing
element, so the click never reached the button — only a *flick* changed the shape, because the flick
picked on release. That is why 0.47.0's browser pass missed it: the pass flicked. The capture is now
taken at the drag threshold rather than on contact, so a tap is an ordinary click on a button and a
drag still follows a finger that has left the strip.

Two consequences of clamping the shift that the refinement did not state, both settled here:

- **A drag browses and a click chooses.** Pick-on-release cannot survive an end stop — the last two
  shapes are never at the front, so they would have become unreachable by gesture.
- **Bringing the chosen shape *into* the window replaced front-alignment**, which is also the whole of
  mechanism 2: there is no longer a position from which the strip can show a void.

Verified in a browser at 1280 px and 320 px, in both motion modes: three shapes whole at rest, the
chevrons hidden exactly when there is nothing past their edge, a 600 px over-drag rubber-banding and
settling on the last page, a 3 px wobble still selecting, a 200 px drag selecting nothing, and Tab
reaching the fifth shape with Enter picking it.

---

---

## US-79 — Disconnect and freeze: throw the token away, keep the numbers *(built)*

*Refined on `claude/new-user-story-iu926r` as US-66; renumbered here — see the note above on how the numbers collided.*

> *"Kan je ook een logout knop maken op je plugin — dat je die token er weer afgooit."*
> — *"Enkel een wipe bedoel je?"* — **"Ja wipe. Maar dat de cijfers freezen."**

The second half is the story. Read alone, the first line sounds like the wipe we already have; the
follow-up says the opposite. **He wants the connection gone and the figures still on screen** — the
account disconnected, nothing reaching out to DEGIRO any more, and the last synced history left
standing as a frozen record rather than an empty page.

That is not *Wipe & resync*, and the words collide badly enough to be worth pinning: our wipe empties
the database and immediately rebuilds it from DEGIRO, which is the one thing this asks for the
opposite of. A later session reading "wipe" in the chat log and pointing it at `wipeAll` would ship
exactly the wrong feature.

### What is actually held, and what is not

| | Where | Cleared today by |
|---|---|---|
| `userToken` | `meta` (`session.js:70`) | `wipeAll` only, and it comes straight back |
| `intAccount` | `meta` (`session.js:71`) | idem |
| `displayName` | `meta` (`session.js:73`) | idem |
| `JSESSIONID` | **nowhere** — read per request from the cookie jar | n/a |

So "throw the token away" is a real, bounded action: it is the three cached identifiers, and it is
**not** the session cookie, because that was never ours to hold. Any code that pretends to clear a
stored session id is clearing a thing that does not exist — say so in the story rather than letting
the next session write it.

Freezing costs nothing, and that is a consequence of rule 2 rather than luck: the raw stores are the
truth, the derived cache is a pure function of them, and neither needs the network to render. A
disconnected app is the demo path (`npm run demo`) with real data behind it.

### The trap that decides whether this is worth building

**The alarm brings the token straight back.** `sw.js:36` arms a periodic sync; the next firing calls
`resolveSession`, which re-reads `/pa/secure/client` and re-caches `userToken` and `intAccount`. A
logout that only deletes rows is theatre with an hour's half-life. So the action has two halves that
ship together: forget the identifiers, **and** disarm the periodic sync. Reconnecting is the reader
pressing Sync, which then behaves exactly like a first run — cookie, `client`, cache — with no new
code path.

### The other traps

1. **Frozen has to say when, everywhere the number is.** A figure with no date is a claim about today.
   Every screen already holds the two dates it needs (`lastSyncAt`, `lastDataDate`); frozen mode makes
   them non-optional rather than a line in the subtitle. This is the difference between a record and a
   lie, and it is the whole reason the story is allowed to keep showing amounts at all.
2. **The reconciliation verdict freezes with the rest, and must not read as verified today.** Rule 6's
   green *"Reconciles to the cent"* is a statement about the moment `liveTotal` was fetched. Frozen, it
   stays true *as of that date* and says so — it is not re-asserted, and it is not softened either. A
   red verdict likewise stays red; disconnecting is not a way to make a failed reconciliation go away.
3. **It cannot log you out of DEGIRO, and must not claim to.** Deleting DEGIRO's own `JSESSIONID` would
   log out the reader's own trading tab, and acting on the broker's session is the mirror image of
   rule 9. The button forgets what *we* hold; the confirm says in one line that you stay logged in at
   DEGIRO, and logging out there happens there.
4. **Measured against the constant, not against a hand-written list.** What goes is `IDENTIFYING_META`
   (`store.js:323`) — the list that already exists for exactly this classification — so a key added
   tomorrow is covered on the day it is added. Writing the four names out again rebuilds the 0.10.0
   export denylist and its next leak (rule 7).
5. **Nothing may reach the network while disconnected.** Not the alarm, not a chart that lazily fetches
   a missing price series, not the connection check running on its own. Reconnect is the one path that
   goes out, and it starts with a click.
6. **`displayName` goes, so the account label must not depend on it.** The header names the account
   from that key; frozen it has no name, and the fallback has to be a label rather than an empty
   element or the string `null` (`datasource.js:212`).
7. **It goes in the app's More menu, not the popup — for now.** US-60 is the popup's translations and
   hierarchy; a button added there first is a fifth hardcoded English string in a file whose defect is
   that it has no `t()` at all. In the menu it is `data-i18n` from the first commit, beside
   *Wipe & resync…* but **not styled as the same kind of action** — this one destroys no data. The
   popup needs the frozen *state* visible all the same, because that is where a reader checks.

### An "i" on the button, because nobody will read a changelog first

Asked for explicitly, with "keep it simple" attached. The pattern exists: the `.info` button plus
`data-tip` that 0.26.0 put on every figure, one shared fixed-position tooltip, hover *and* focus.
This is the same control on a different row.

Three sentences, in this order, because that is the order the question is asked in:

> **How it works.** The extension uses the DEGIRO session your own browser already has, and
> remembers the account number DEGIRO hands back. It never sees a password.
>
> **Disconnect** forgets that account number and stops syncing by itself.
>
> **It does not** delete your history — the figures stay, frozen at the last sync — and it does not
> log you out of DEGIRO.

Two things to get right and nothing else:

- **`wireTips` is delegated on `#tiles`** (`app.js:2258`). The menu is a different root, so it needs
  a second root registered — not a generic tooltip system with one caller today (rule 8).
- **Both languages, and the tip is prose, not a spec.** It goes through `t()` like every tile tip, so
  `missing()` counts it. If it grows past those three sentences it has turned into documentation and
  belongs in the README instead.

### Acceptance criteria

- **AC1** A disconnect action in the More menu, translated in both languages, behind a confirm that
  states what is forgotten, that the figures stay and stop updating, and that you remain logged in at
  DEGIRO.
- **AC2** Afterwards no key in `IDENTIFYING_META` exists in `meta` — asserted against the exported
  constant, so a key added later fails the test rather than surviving the disconnect.
- **AC3** The periodic alarm is cleared and no request leaves the extension until the reader presses
  Sync; that sync re-resolves from the cookie exactly as a first run does, through no new code path.
- **AC4** Every section still renders its charts, tables and figures from the cache, with the as-of
  date stated on screen, and the app says it is disconnected.
- **AC5** The reconciliation verdict is shown as of its own date, unchanged in colour.
- **AC6** DEGIRO's cookie is untouched — asserted, no `chrome.cookies.remove` anywhere — and no label
  claims otherwise.
- **AC7** Nothing is deleted from the raw or derived stores, and `engine.js` is unchanged.
- **AC8** An `i` beside the action explains, in three sentences and in both languages, that the session is the browser's own, what disconnect forgets, and what it leaves alone. Reachable by hover *and* focus, like every other tip.

### Stop condition

If frozen mode needs its own copy of the numbers — a snapshot written into a store and read back as an
input — stop. That is rule 2, and it is unnecessary: the raw stores plus a pure recompute already are
the frozen record. If instead it turns out a logout is only meaningful by invalidating the session at
DEGIRO, drop the story: that is authenticating in reverse and it belongs on DEGIRO's own site.

### Built, and the freeze cost nothing — as predicted, for the stated reason

No snapshot, no second copy of any number: `disconnectAccount()` writes one flag and deletes
`IDENTIFYING_META`, and the page renders from the same raw stores it always did. Rule 2 was the
prediction and it held.

Four notes for whoever touches this next:

1. **The two halves ship in different modules, and both are required.** `sync.js` forgets the
   identifiers (it owns the database); `sw.js` clears the alarm (it owns the alarms). Without the
   second, the next firing calls `resolveSession`, re-reads `/pa/secure/client` and re-caches everything
   the first deleted — a disconnect with an hour's half-life. There is a test for each.
2. **`scheduled: true` marks a sync nobody asked for.** The alarm and the DEGIRO-tab listener pass it
   and a disconnected account refuses them; anything else clears the flag and proceeds, so *reconnect*
   is the ordinary first-run path rather than a second one. A reconnect with its own path would be a
   second way to authenticate, and rule 9 allows zero.
3. **`disconnected` and `disconnectedAt` had to be classified before the suite would go green** —
   `store.test.js` fails on any meta key that is neither exportable nor identifying. They are
   exportable: the first question a frozen account's bug report has to answer is why nothing is syncing.
   That guard is doing precisely the job rule 7 gave it.
4. **Trap 6 turned out to be already handled.** `displayName` goes, and nothing renders the account name
   in the page header — `ownerLine` collapses an empty name to *no line at all*, which is the required
   behaviour rather than the string `null`. Nothing to fix; worth recording so nobody goes looking.

**`npm run demo` gained `?frozen=1`.** A frozen account cannot otherwise be produced without an
extension, a real session and the deliberate loss of it — so the one state whose entire point is *what
the reader sees* would have been the one state no browser pass could look at. Verified through it: the
pinned banner (at `info`, not `error` — this is a state somebody chose, not a failure), the rail row,
the dated verdict keeping its colour, all seven sections still drawing their charts and tables from the
cache, and the three-sentence tip on hover *and* focus, in both languages.

---

---

## US-80 — The suite waits in real time for retries it could fake *(built, 0.48.0)*

*Refined on `claude/eager-cannon-islvb3` as US-66; renumbered here — see the note above on how the numbers collided.*

`npm test` takes about 55 seconds for 434 tests, and one test — "the config endpoint failing
degrades to the documented defaults" in `test/degiro.test.js` — accounts for roughly 31 of those
seconds by itself. It is not doing 31 seconds of work: `throttledFetch`'s exponential backoff
(`src/lib/degiro.js:60,105-107`) calls the real `setTimeout`, and this test drives it through its
full retry budget, so the wall clock is spent asleep, not computing. A dozen more tests in the same
file and in `test/session.test.js` cost one to seven real seconds each the same way.

Node's own test runner ships `mock.timers` — a per-test fake clock that intercepts `setTimeout`
without touching `src/lib/degiro.js` at all: the test advances the clock instead of the process
sleeping through it. This is a test-only change; rule 5's queue and backoff logic does not move.

**Grounded:** `sleep()` at `src/lib/degiro.js:60` is a plain `setTimeout` wrapper, the standard shape
`mock.timers` is built to intercept. No dependency injection needed in the source.

**The traps:**

1. **Enable and disable the fake clock per test**, not once for the file — a global fake clock that
   leaks into an unrelated test changes what that test measures without saying so.
2. **`throttledFetch`'s own inter-request spacing test** ("requests are spaced out, and parallel
   callers cannot defeat it") is asserting real elapsed time between calls; check whether it stays
   meaningful under a fake clock or needs to stay real-time on purpose.
3. **Advance the clock in the same steps the backoff actually takes** (`RATE.backoffBaseMs * 2 **
   attempt`, capped at `RATE.backoffMaxMs`) rather than jumping straight to the end, so a test still
   fails if a future change alters the schedule instead of just the number of retries.
4. **Don't touch `src/lib/degiro.js`.** This is entirely inside `test/`.

**Acceptance criteria:**

- **AC1** `npm test` runs in single-digit seconds, not ~55.
- **AC2** Every retry/backoff/timeout test still exercises the real code path in `degiro.js`,
  unmodified.
- **AC3** No test's *assertions* change — only how it waits.
- **AC4** A test that should still fail on a schedule regression (wrong delay, wrong attempt count)
  still does.

**Stop condition:** if making a test pass under a fake clock requires changing what `degiro.js` does
(injecting a clock, a delay function, a config flag), stop — the point was zero production-code
change, and a hook added just for testability is the thing rule 8 exists to keep out.

---

## US-81 — Locate the five cents. Do not tune anything to hide them *(built — the locator; its first report landed and named the rows, see US-84)*

> *"The total doesn't match my account total right now"* — 0.47.0, the owner's account, with the
> banner reading **reconstructed € −0,05 · DEGIRO € 0,00 · off by € −0,05**.

This is not a new defect. It is the one already recorded above under *Still open, and not to be
guessed at*, re-reported one release later because nothing on screen has changed — and nothing on
screen **should** change until the five cents have a name. Rule 6 is working exactly as written: the
history rests on the total, the total is out, and the page says so in red.

What has changed is that it is worth doing now, and the reason is the account itself. **6
transactions, 81 cash movements, 3 instruments, every position closed.** That is the smallest ledger
this check will ever run against, and the residual is five cents. On the 1 457-transaction account in
§1 a difference of five cents could not be located by hand; here it can. If this is not resolved on
this account, it will not be resolved on a harder one.

### What is already known, without asking anybody for anything

Every position is closed, so `byProduct` contributes nothing to `value[n−1]` and the whole residual is
in the cash series. The engine already reaches that conclusion on its own: `positionsAgree` is true,
`attribution` is empty, and §7 takes its third branch — *"no individual position disagrees, so the
difference is in the cash balance rather than in any holding"*.

That leaves two mechanisms. They are mutually exclusive, they have different fixes, and **one field
already on screen tells them apart**: `reconciliation.source`.

1. **`reported`** — DEGIRO stated a net-liquidity total of 0,00 and our 81 cash rows sum to −0,05.
   Then the defect is ours, in the ledger. The suspects, in the order they should be checked:
   rows classified into a category held at `inCash:false` (`CASH_SWEEP`, `RESERVATION`); rows that
   fell through to `UNKNOWN`; and a sweep or reservation whose *pair* falls outside the window, so
   one leg is counted and the other never arrives.
2. **`derived`** — DEGIRO stated no total, so the anchor is `Σ position values + liveCash`, where
   `liveCash` is whatever `parseUpdate` picked out of `['totalCash', 'reportCashBal', 'cash']`. If
   DEGIRO splits the balance across `degiroCash` and `flatexCash`, that pick is not the whole
   balance and the **anchor** is short, not the ledger. On an emptied account the anchor is
   *entirely* that one field, which is why this account is where the question is cleanest.

Reading which of the two applies is the first ten minutes of this story, and nobody has done it.

### Why an export has not answered this, and cannot

The evidence is already on disk. `sync.js` writes `liveSnapshot` on every sync with the whole parsed
`/update` — every `totalPortfolio` field it carried *and* the per-currency `cashFunds`, which is where
`FLATEX_EUR` appears if it appears at all. Nothing surfaces it.

The bug report cannot carry the answer out either, and this is measured rather than suspected.
`report.js`'s `ratio()` returns `null` when the denominator is zero, and DEGIRO's total here **is**
zero. So on this account the export states:

- `reconciliation.ratio: null` — the one field whose job is to say how big the discrepancy is;
- `cashShare: 1` and `residualOverCash: 1` — arithmetic, not information, because on an emptied
  account cash *is* the total and the residual *is* the cash.

**The artefact designed to carry this finding off the machine is blind exactly when the anchor is
zero.** That is not a coincidence alongside two releases of "still open"; it is the cause of it.

### What to build

A locator, not a fix. This story must not move a single number on anybody's screen.

- **Say which anchor was used**, on the page and in the report, when the reconciliation fails — the
  `derived` label already exists for the case where DEGIRO stated no total; it has to be legible in
  the failing banner, because it is the field that splits the two mechanisms above.
- **State the size of a failed reconciliation when the total is zero.** The ratio degenerates, so it
  needs a denominator that cannot be zero on an account that has any rows at all: the residual over
  the summed absolute value of the cash movements. An amount in cents was considered and rejected —
  rule 7 is an allowlist and a difference is still an amount; a ratio against a denominator the
  account itself provides carries the same finding and leaks nothing.
- **Attribute the residual across the cash categories.** The engine already computes
  `categoryTotals` and throws it away for this purpose. Carried as ratios of the residual, the answer
  to this defect is legible on sight: *the rows we hold at `inCash:false` sum to exactly the gap*, or
  they do not, and the search moves on.
- **Name the cash fields the response actually carried** in the connection check, and say whether
  they agree with the sum of `cashFunds`. Names and a verdict. `totalFieldsSeen` already lists them;
  it does not say which one was used or whether it was complete.

### Acceptance criteria

- **AC1** A failing reconciliation states whether its anchor was `reported` or `derived`, on the page
  and in the bug report.
- **AC2** With DEGIRO's total at 0,00 the report still states the size of the discrepancy — asserted
  by a test that runs `computePortfolio` with `liveTotal: 0` and a non-zero reconstruction, and fails
  if the field is `null`.
- **AC3** The report attributes the residual across cash categories, as ratios, so a residual equal
  to the total of the rows held at `inCash:false` is visible as such.
- **AC4** The connection check names which cash field the anchor came from and whether the stated
  cash fields agree with `cashFunds` — names and a verdict, never amounts.
- **AC5** Nothing new leaves the machine that is not in the allowlist; the existing export test still
  passes against its declared key set.
- **AC6** **No number on the page changes.** After this ships the banner still reads −0,05 in red. It
  is explained, not resolved.

### Stop condition

Do not make this account come out at zero. Concretely, three things are forbidden as the fix:
flipping `CASH_SWEEP`'s `inCash` flag — `classify.js`'s own comment invites it, and accepting that
invitation without a capture showing **both** sweep legs would trade a visible five cents on one
account for an invisible error on every account that sweeps; widening `ok`'s 0,01, which is rule 6
itself; and adding a fourth candidate to `totalCash`'s pick list on the strength of a guess about
which field is whole, which is rule 8's dead fallback born on day one.

If the locator lands and the residual turns out to be one line, that is a **separate** story, opened
with the evidence attached. And if the locator ships and still cannot say where the five cents are,
that is the finding: write down what it ruled out, because ruling out the ledger is most of the way
to the answer.

### Built. What it can now say, and what it still cannot

Four fields, no fix, and no number moved — AC6 held by construction, because nothing in the
computation path was touched: `cashTurnover` and `categoryTotals` are additions to what the
reconciliation *reports*, not to what it computes.

| Question | Where the answer now is |
|---|---|
| Which anchor failed? | The red banner's second sentence, and `reconciliation.anchor` in the report |
| How big is a gap against a zero total? | `residualOverCashFlow` — the residual over the ledger's absolute turnover, which is zero only on an account with no cash rows |
| Is the gap the rows held outside the cash balance? | `residualByCategory` — a category at `-1` or `1` *is* the residual |
| Did DEGIRO's cash total cover its own `cashFunds`? | The connection check's `cashKey`, `cashFundsCurrencies` and `cashVerdict` (`agrees` / `short` / `over` / `foreign-cash-present` / `not-stated`) |

**What still needs the owner's account rather than this repo:** the ten minutes of reading the story
asked for. The locator says which of the two mechanisms is in play; running it is what answers the
question, and the answer is a new story with the evidence attached (rule: no fix without a capture).
Two tests pin the shape of that evidence — a `CASH_SWEEP` row that is exactly the residual reads as
`-1`, and a split `EUR`/`FLATEX_EUR` balance reads as `short`.

**Read, 2026-08-19, from the owner's 0.50.0 bug report — and the answer is neither mechanism.** The
anchor was `derived`, the foreign cash nets to zero, and `residualByCategory` carries
`INTEREST: 1.0` exactly: the interest rows *are* the five cents. The reading, the two hypotheses it
leaves standing, and what closes them are **US-84**.

---

## US-82 — There is no closed position in the fixtures *(built)*

US-76 and US-77 were two wrong numbers and a wrong shape on a shared card, both found by a reader
looking at a screenshot, and **neither could have been found here.** Every fault was on a position
that has been sold, and `fixtures/` holds ten products of which **none is closed**:

```
BESI ASML ARGX IWDA WKL INGA PRX PROP SHELL VWRL   — all still held on the last day
```

So `npm run demo` cannot show a closed row, a closed card, or the dash the table prints where the
paid-in-vs-grown bar goes. The Positions table's **Closed** and **All** filters have never had
anything to filter, `positionSpan`'s end has never been exercised outside a unit test, and the sale
day — the day a position books the move between its last close and the price it actually sold at, the
single largest day of most closed positions — has never appeared in a rendered pixel.

That is the gap this story closes, and it is worth stating why it is a fixture story rather than a
test story: the unit tests for both defects were easy to write *once the defect was known*. What was
missing was the chance to see it. A browser pass is the project's second line of defence and it was
blind to a whole class of position.

### What to add, and no more

`tools/make-fixtures.mjs` gains **two** closed positions, because one cannot show the difference
between the two ways of ending:

1. **A round trip that ended at a profit** — bought, held across a few months, sold out in one go
   above cost. Its net paid-in ends negative, which is `splitModel`'s `free` branch, and the row's
   dash. Nothing else in the fixtures reaches that branch.
2. **A round trip that ended at a loss, with a large move on the sale day itself.** This is the
   US-76 shape: the card's total and the row's Result can only agree if the sale day is inside the
   span, and this is the position where a regression makes them differ *on screen* rather than in an
   assertion.

Both synthetic, both generated (rule 7: nothing copied out of an account), and both wired into
`meta.json`'s chart list like every other instrument, so the price series exists and the position is
valued from quotes rather than from the fallback.

### What this will change, and what must not change

Adding two products moves numbers that tests assert on: the account's totals, the composition
ranking, the seven categorical slots plus *Other*, and the reconciliation anchor in `meta.json`.
**Those tests are updated to the new fixtures, never loosened** — in particular `reconciliation.ok`
stays an exact zero-cent check (rule 6), and the demo account keeps reconciling. If the new
instruments cannot be generated so that it does, the generator is wrong, not the check.

### Acceptance criteria

- **AC1** `fixtures/` contains two closed positions, one ended at a profit and one at a loss, both
  with a price series and both visible in `npm run demo` under **Closed**.
- **AC2** One of them has a material move on its own sale day, so the card's total and the row's
  Result are only equal while US-76's span rule holds.
- **AC3** The demo account still reconciles to the cent, and no test's tolerance is widened to make
  the new fixtures pass.
- **AC4** The holdings table's **Closed** and **All** filters show rows; the split cell shows the
  dash and the card for a closed position shows no bar (US-76 AC5), both in a browser.
- **AC5** `npm run fixtures` regenerates deterministically — the same seed gives the same files, so a
  diff of `fixtures/` is reviewable.

### Stop condition

If making the demo account reconcile with two extra positions needs a special case anywhere in
`engine.js`, stop: the engine is not allowed to know which instruments are fixtures, and a generator
that can only produce a reconciling account by being helped is not testing the thing it claims to.

### Built. `engine.js` was not touched, and the browser pass immediately paid for itself

`RTRP` ends at +€2 364,71 with a net paid-in of −€2 364,71 — `splitModel`'s `free` branch, which
nothing else in these fixtures reached. `DSCT` ends at −€2 005,23 and its largest single day *is* its
sale day (−€645,72, from a `saleDayShock` in the price walk), which is the US-76 shape. The account
still reconciles to the cent with no tolerance widened anywhere.

Three things worth knowing for the next fixture story:

1. **Appending the two instruments rather than inserting them kept every existing price series
   byte-identical** — the walk draws from one seeded PRNG in list order. The ledger still moved, because
   the round trips take cash the generic buys would have spent.
2. **A round trip has to be excluded from the generic buy pool.** The first attempt produced two
   positions that were closed and then bought again two months later, so the last day held both. A
   "closed position" is a property of the *end* of the series, and nothing was enforcing it.
3. **`npm run fixtures` was not deterministic** — `TODAY` defaulted to the clock, so every regeneration
   moved the window by however long it had been. Pinned, with `--today=` for a deliberate roll. AC5 was
   the only acceptance criterion that was already false before this story started.

**And the browser pass found what the fixtures existed to expose** — not on a closed position, but two
layout defects in the share sheet: the controls column was 240 px wide with 394 px of content in it,
and on a phone every shape in the strip was 23 px around a 30 px drawing. Both are in the US-78
follow-up commit. That is the story's own argument, tested: *"a browser pass is the project's second
line of defence and it was blind to a whole class of position."*

---

## US-83 — `auditSeries` and `fallbackFromTrades` rescan every transaction, once per product *(built, 0.49.0)*

Found on the 2026-08-18 light scan, not from a defect report. Both functions take `transactions`
and a single `productId`, then do the same thing: walk the *entire* transactions array and skip
every row that does not match —

```js
for (const t of transactions) {
  if (t.productId !== productId) continue;
  ...
}
```

`auditSeries` (used per instrument, to decide whether its price series needs rescaling — see its own
comment above) and `fallbackFromTrades` are both called from a loop over every product the account
ever held, so the account-level cost is **O(products × transactions)** rather than O(products +
transactions). Nothing here is currently a user-visible stall — hundreds of transactions and a few
dozen products stay well inside rule 2's "milliseconds, measured, not assumed" — which is exactly why
this is a story and not a defect: it is a real, easily-avoided duplicate scan, not a symptom of one.

**The grouping it needs already exists two hundred lines below it.** The per-product reconstruction
loop builds `qtyByProduct`, `tradedByProduct` and `tradeDaysByProduct` with a single pass over
`transactions`, keyed by `productId` (`engine.js:903-918`). A fourth map built the same way —
`transactionsByProduct: Map<productId, transaction[]>` — built once before the per-product loop and
handed to `auditSeries`/`fallbackFromTrades` in place of the full array turns both call sites into an
O(1) map lookup instead of an O(transactions) scan, dropping the account-level cost to
O(products + transactions).

### What to add, and no more

- One `transactionsByProduct` map, built once, alongside the existing per-product maps it sits next
  to.
- `auditSeries` and `fallbackFromTrades` take that product's array directly (`transactionsByProduct.get(productId) ?? []`)
  instead of the full list, and drop their own `t.productId !== productId` filter — the map already
  guarantees that.
- No new option, no config, no change to what either function returns or how it decides its verdict.

### Acceptance criteria

- **AC1** `auditSeries` and `fallbackFromTrades` no longer receive the full `transactions` array —
  each receives only the rows for its own `productId`.
- **AC2** Every existing engine test still passes unmodified — this is a call-site change, not a
  behaviour change, and no test's expected numbers move.
- **AC3** The demo account still reconciles to the cent (rule 6), because nothing about *which* rows
  are considered changes, only how they are found.

### Stop condition

If giving `auditSeries` a pre-filtered array instead of the full one plus a `productId` changes any
verdict, ratio or spread it computes, stop — that would mean the original filter was doing something
subtler than "same product", and the fix needs to find out what before it ships.

---

## US-84 — The five cents have a name: the interest rows *(built, 0.51.0 — the capture arrived; the account reconciles to 0,00)*

US-81 built the locator and ended with an instruction: run it, and the answer is a new story with
the evidence attached. The owner ran it — 0.50.0, 2026-08-19, the same account: 6 transactions, 81
cash movements, 3 instruments, every position closed, **reconstructed −0,05 against 0,00**. This is
that story, and the evidence moves the suspect list somewhere neither of US-81's two mechanisms
pointed.

### What the report says, read out

- **The anchor was `derived`.** DEGIRO stated no net-liquidity total (`reportNetliq`: sought on one
  row, missing on it), so the check ran against `Σ position values + totalCash` — which on this
  emptied account is `totalCash` alone. `liveTotalFields` shows `degiroCash`, `flatexCash` and
  `totalCash` all present; whether `totalCash` covers both is the connection check's `cashVerdict`
  question, and this report does not carry that check.
- **The residual is not foreign cash.** `fx-stale` carries `exposureShare: 0` for USD: the USD cash
  ledger nets to zero at the end, so the stale derived rate (3 observations, widest gap 1 748 days)
  prices nothing still held. The gap is EUR cash.
- **`residualByCategory` answers the question it was built for, naming a category US-81 never
  suspected: `INTEREST: 1.0`, exactly.** The interest rows sum to exactly the gap. And the other
  ratios say the rest of the ledger is internally perfect: DEPOSIT and WITHDRAWAL reproduce the
  Money-paid-in tile to the cent, and the `inCash: true` categories *minus* INTEREST sum to exactly
  zero — which is what an account emptied by a final everything-withdrawal should sum to. Neither
  US-81 suspect is it: there are **no** `UNKNOWN` rows at all, and `CASH_SWEEP` sits at 291,8× the
  residual, nowhere near ±1.
- **Fifteen of the 81 rows stated no amount.** The field tally (`change`: `missingShare 0.19` over
  162 picks, two per row) says ~15 rows carried none of `change`/`amount`/`value` and were counted
  at 0,00 — and the report could not say which categories they fell in.

### The two hypotheses still standing

Both fit every number above, and they have opposite fixes:

1. **The interest was real and the balance absorbed it — and something refunded it in a row the
   parser read as 0,00.** Fifteen amount-less rows is exactly the room such a counter-entry hides
   in, and `cashFundCompensation` (in three spellings) is among the fourteen `liveTotalFields`.
   If one of those rows is a compensation credit under a field name `parse.js` does not know, the
   ledger is one readable field away from zero.
2. **The interest rows never moved the withdrawable balance** — booked and displayed, but settled
   somewhere `totalCash` does not carry, or written off when the account emptied. Then
   `inCash: true` is wrong *for these rows*, and the distinguishing evidence is their wording,
   which rule 7 keeps out of the bug report by design.

### Built now — the locator, sharpened where this report was blind

- `parse.js` marks a cash row whose amount no candidate field carried (`changeAbsent`); a stated
  0,00 stays distinguishable from an absence. Arithmetic unchanged — absence still counts as zero.
- The engine counts those rows per category and the bug report carries the counts as
  `amountlessByCategory` — counts, never amounts (rule 7), and **all-or-nothing**: `null` unless
  every stored row carries the flag, because an ordinary sync is incremental and a partial count
  would read as measured over rows it never saw. A resync from scratch is what measures it; the
  next report from this account answers hypothesis 1's first question by sight.
- The failing banner stops guessing. When a category's total equals the gap to the cent it is
  named — *"the rows classified INTEREST sum to exactly this difference"* — instead of "most
  likely the exchange rate used for money held in another currency", which on this account blamed
  FX with zero foreign exposure while the report beside it carried the answer.
- The category keys in both report maps are filtered against `classify.js`'s vocabulary, making
  the fixed-vocabulary promise written on them enforced rather than assumed.

### The second report and DEGIRO's own screen, same day

A second 0.50.0 report (pre-locator — `amountlessByCategory` is not in that build) arrived from an
**incremental** sync, which makes its field tally a window onto exactly the rows in question: only
2026 was refetched, and 2026 alone holds **6 cash rows on an account that has been empty since
2024** — none product-bound, all typed and currencied, and **one of the six amount-less**
(`change: missingShare 0.17` over 12 picks). The account still ticks about six rows a year while
holding nothing; those recurring rows are what both hypotheses are about.

Beside it, a screenshot of DEGIRO's own app: *Totaal Account*, *Portefeuille*, *EUR* and *Vrije
Ruimte* all **0,00** — so the derived anchor equals DEGIRO's own displayed total and the ledger is
the side that is off — and *Totaal W/V* **+16,68** where this extension's Result says **+16,56**.
If DEGIRO's figure means value minus net external, its implied lifetime net external is −16,68
against our −16,61, and the 0,12 splits exactly: **0,05 is the located interest gap, 0,07 is a
separate difference in what counts as a deposit/withdrawal.** That *if* is real — DEGIRO does not
publish the definition of Totaal W/V — but `cashFundCompensation` (three spellings in
`liveTotalFields`) is precisely the kind of amount the two sides would book differently: a
compensation is P/L to one bookkeeper and a deposit to the other, and rule 3 says that choice is
exactly where a wrong guess fabricates profit. Not two mysteries, then: every open cent points at
the same handful of cash-fund/interest rows.

### The third report — the sharpened locator's first answer, and hypothesis 1 is dead

Same day, after a wipe-and-resync on the new build: `amountlessByCategory: { CASH_SWEEP: 15 }`.
**Every one of the fifteen amount-less rows is a sweep** — rows the ledger holds outside the cash
balance anyway, so their unreadable amounts cost nothing. Every row in every `inCash: true`
category carries an amount the parser read. There is no hidden counter-entry parsed as 0,00: the
ledger is fully read, it genuinely sums to −0,05, and all of it is the interest rows.

(A side-finding for free: DEGIRO's sweep rows apparently come in two shapes, with and without an
amount — 15 amount-less against a non-zero `CASH_SWEEP` total means both exist in one account.
Nothing depends on it while sweeps stay `inCash: false`; noted so nobody rediscovers it.)

That leaves hypothesis 2 alone standing, in two flavours only a capture can tell apart: the
interest was compensated in a `totalPortfolio` field rather than in a row (`cashFundCompensation`,
three spellings), or it never settled against the balance DEGIRO reports at all.

### What closes it, and only this

The rows themselves. The **full export** now answers both remaining questions at once: the
`cashflows` store carries the interest rows' wording, and `liveSnapshot` is on the export's meta
allowlist and carries the whole parsed `/update` — including the `cashFundCompensation` values. If
those compensation fields hold the missing five cents, the mechanism is named. Otherwise: the
owner reading the rente-rows' wording off the Rekeningoverzicht settles it. Then either a
classification decision lands in `classify.js` with the capture as its justification, or a
field-name candidate lands in `parse.js` on the same evidence. One or the other, and nothing
before the capture.

### Stop condition

Unchanged from US-81, and it now survives the temptation being one flag away: do **not** flip
`INTEREST`'s `inCash` on this evidence — it would zero this account by breaking every account whose
interest really does settle in cash, which is every account with a normal balance. No tolerance, no
fourth `totalCash` candidate, no guessed field names. The account stays red until the capture says
why it should not be.

### Closed — the capture arrived, and it was two defects stacked

The owner sent the full export (it had in fact been attached to every message of the day; the
bug-report JSON pasted alongside it was what got read — a lesson about assumptions, not about the
owner). The rows settle everything, and the stop condition held: the interest was real and its flag
was right. What was wrong was on either side of it:

1. **The compensation was classified as a sweep.** 2026-08-11, `DEGIRO Geldmarktfondsen
   Compensatie`, **+0,07** — DEGIRO paying back what its cash funds had cost the account. The
   wording contains "geldmarktfonds", the `CASH_SWEEP` rule matches on that word, first match wins,
   and `inCash: false` kept the credit out of the balance. New `COMPENSATION` category, rule placed
   above the sweep rule, both flags capture-backed: DEGIRO's own `totalDepositWithdrawal` (−16,61,
   **exactly** this ledger's figure) excludes it, so `external: false`; its cash absorbed it, so
   `inCash: true`. Its app's lifetime W/V of +16,68 is 16,61 + 0,07 — the compensation counted as
   profit, which is now this ledger's reading too.

2. **The money-market-fund era's value drift appeared in no row's amount.** The eight `Conversie
   geldmarktfonds` rows are amount-less (they are the 15-row `CASH_SWEEP` count from the locator,
   minus the flatex echoes); their descriptions carry units and the fund price, and between what
   went in and what came out the fund lost **0,019** — invisible to a ledger that only sums
   `change`. `parse.js` now reads units and price out of those descriptions, and the engine marks
   the fund era to its own stated prices: at each conversion row, the units held since the previous
   one are revalued to the price it states. No cost basis, no interpolation — when the era ends at
   zero units (DEGIRO closed the funds) the sum telescopes to exactly in-minus-out. Units that do
   not return to zero raise `cash-fund-outstanding` instead of being held flat.

Arithmetic on the account: −0,05 interest + 0,07 compensation − 0,019 drift = **+0,001**, inside
rule 6's cent. Replayed against the export itself: `reconstructed 0,00 · live 0,00 · diff 0 ·
ok: true`, result +16,61 = DEGIRO's own net-deposit figure, and the only warnings left are the
price-rescale note and the stale-USD-rate pair, both true statements about the data.

**Requires a wipe & resync**: both fixes live at parse time (classification and the extracted
units), and stored rows keep the category they were stored with.

What the episode adds to the standing lore: the locator earned its keep twice (it killed the
readable-counter-entry hypothesis with `amountlessByCategory`, which is what forced the export to
be read instead of theorised about), and the fund-era drift is a **shape** — any account that held
cash before the flatex migration has these amount-less conversie rows, and until 0.51.0 every one
of them was reconstructed slightly rich, hidden inside whatever else their reconciliation carried.

---

## US-85 — The full export, small enough to actually send *(built, 0.52.0)*

> *"my friends will have bigger files which dont fit in discord chat"* — the owner, the same day
> US-84 closed **because** a full export finally travelled.

US-84's lesson in one line: the bug report diagnoses, but the export decides — and an export that
cannot travel is a capture that never arrives. A small account's export is 1,8 MB; an account with
thousands of rows and a hundred price series is tens of megabytes, and chat channels stop at ~10 MB.

Trimming was considered and rejected by the owner, correctly: *"the export needs to have all the
data that you can use for diagnosis."* Every defect so far needed a field nobody predicted —
the 4,369 rescale lived in the price series, the five cents in the wording of amount-less rows —
so the export stays complete, and the fix is size, not scope.

### Built

- **The export downloads gzipped** (`CompressionStream('gzip')` — built into the browser, no
  vendor code, MV3-clean). Measured on the real export that closed US-84: **1 828 645 → 118 575
  bytes, 15,4×**; the content is byte-for-byte what the uncompressed file was, `gunzip` away.
- **The filename says what it is and what made it**:
  `degiro-portfolio-export-v0.52.0-2026-08-19.json.gz`. Two defects from the US-84 day, one line
  each: the export and the bug report shared a filename (a day of debugging went to reading the
  wrong one), and a report saying `0.50.0` could not say which build actually produced it, because
  three builds shipped under that version in one morning.

### Deliberately not built

A trimmed "diagnostic" export (rule 8 — the owner declined it, and the full one now fits), an
upload target of any kind (rule 7 — this project does not send data anywhere, ever; how the file
travels is the sender's choice), and a fallback for browsers without `CompressionStream` (every
browser this runs in has had it for years; a fallback would be an untested branch shipping the
uncompressed file exactly to the people who needed the small one).

---

## US-86 — The feature-loss audit, and the two columns it found *(built, 0.53.0)*

> *"alles wat ik wilde heeft hij niet alleen niet gedaan maar ook gewoon compleet weg gehaald"* — a
> tester, via Discord. The owner: *"check alle tabellen … denk aan de paid vs grown charts bijv"*,
> and then: *"echt even goed kijken sinds versie 42 of we feature loss hebben gehad."*

Taken as what it is: a serious complaint, answered by measurement rather than memory. The 0.42.0
release (`7dd9a9f`, reachable after unshallowing the clone) was checked out into a worktree, its
demo served beside the current one, and **both UIs were driven headless and inventoried** — every
nav section, every visible canvas, table, column and control, at 1680 px and narrow.

### What the measurement says

- **All ten charts survive, byte-for-byte the same ids**: value, invested (*Money paid in vs what
  it is worth* — the one the owner named), pnl, cumulative, movers, composition, cash, deposits,
  dividends, outlook. The per-position *Paid in vs grown* bar is there too, as a locked column.
- **The Year-by-year, Month-by-month and Transactions tables are intact**, and Performance,
  Income & cost and Holdings all *gained* controls since 0.42: 1M/3M/6M/1Y ranges, Show-as-a-table,
  Open/Closed filters, the Columns chooser, per-position snapshots.
- **The 0.42 header toolbar moved, nothing in it was lost**: EN/NL, theme, Sync now, Check
  connection, Copy bug report, Export JSON, Wipe & resync all live in the sidebar's *More* sheet,
  plus Disconnect, which 0.42 did not have.
- **One real loss, found and now closed**: the 0.42 *Profit and loss per product* table died in
  US-49's merge — by the tester's own request — and its columns went to the merged table except
  two. US-49's text said Bought and Sold "move behind the row's disclosure with the transactions,
  **or drop**", and that unresolved "or" resolved itself as *drop*: since 0.46.0 the per-product
  all-time **Bought** and **Sold** amounts rendered nowhere — not in the table, not in the chooser,
  not in the disclosure — while the engine computed them all along.
- One promise from US-49 remains undelivered and is deliberately left so: *Type* as a chip on the
  instrument cell. The type filter chips exist and the demo carries mostly one type; a per-row chip
  is a new ask if anyone actually misses it.

### Built

`bought` and `sold` return as optional columns (US-61's machinery does the rest: chooser-hideable,
first to fold into the row's disclosure when width is short, carried by the disclosure at every
width). All-time figures, so the headers say so — *Bought (all time)*, *Sold (all time)* — per
US-49's own span rule, and the windowed set stays exactly `{Result}`. Verified headless: wide shows
them when they fit, narrow folds them, the disclosure carries them with the right figures.

### What this changes about process

US-49's "or drop" is the defect here: a migration that lists what survives must resolve every
column by name, because an unresolved "or" is a decision made by nobody. The audit that caught it —
inventory the old UI and the new one, diff the surfaces — took under an hour with the demo and a
headless browser, and is the answer the next "everything is gone" complaint gets too.

---

## US-87 — The Positions table becomes yours: sort, rearrange, remember *(built, 0.56.0 — the plan said 0.55.0, which US-90 had taken by the time this ran)*

> *"we need some ways of interacting with the table, think about like sorting by, rearranging the
> columns (which will be saved in the plugin someway …), and i want a way of filtering out colums i
> dont care about so it doesnt get too wide"* — the owner, after US-86 restored two columns and made
> the table wider in the process.

Three capabilities, one open design question. The capabilities are settled:

1. **Sort by any column**, ascending/descending/natural, numeric columns defaulting to
   biggest-first. The floor is already written down twice (US-49's design notes, and the existing
   sort chips): **re-sorting is instant, never animated**, and equal values tie-break on name so
   nothing jitters. The existing *Largest/Best/Worst first* chips become redundant and go — one
   mechanism, not two.
2. **Rearrange columns**, with Instrument anchored first and the snapshot action last.
3. **Hide columns** — already shipped as the Columns chooser (US-61); whatever variant wins folds
   it in rather than adding a second way to do the same thing.
4. **All of it persists** the way the theme does (`chrome.storage`/meta, per install), and the
   US-61 floor is untouched: the four load-bearing columns can never be hidden, dropped or sorted
   away, and width-folding into the row disclosure keeps working on whatever order the user made.

The open question is *where the controls live*, and that is taste, so it is a POC and a pick rather
than a decision made here: **`docs/prototypes/holdings-table-interactions.html`** — one
self-contained page, synthetic data, all three variants live with working persistence:

- **A · everything in the header** — click sorts; a per-column ⋮ menu sorts/hides/nudges left-right.
  Cheapest, keyboard-friendly, zero new chrome.
- **B · direct manipulation** — click sorts; drag a header to reorder against a live drop
  indicator. Feels the best with a mouse; costs the most (touch, and the ⋮ menu stays as the
  keyboard path).
- **C · one management panel** — the table stays quiet (click-to-sort only); ordering and
  visibility live together in one sheet, an evolution of the existing Columns chooser.

### Acceptance criteria (variant-independent)

- **AC1** Clicking a column header cycles its sort; the sorted column and direction are visible in
  the header, re-sorting is instant, ties break on name.
- **AC2** Column order is user-changeable, Instrument stays first, the action column stays last.
- **AC3** Order, hidden set and sort survive a browser restart, live beside the theme preference,
  and never enter an export or bug report (they are preferences, not account data — but the rule 7
  reflex applies anyway).
- **AC4** `baseHidden`'s floor holds under any persisted state — the load-bearing columns cannot be
  hidden by a stored preference, exactly as `test/columns.test.js` already asserts.
- **AC5** The redundant sort chips are gone, and the demo exercises sort + reorder + hide.

### The pick — B, same day

> *"optie b vind ik het beste; ik zou wel willen als ik er niet mee ga slepen maar op klik dat dat
> de Sort by knop heeft en dan de ene is dan desc en de ander asc"* — the owner.

So variant B, stated precisely:

- **Click a header = sort.** Numeric columns start descending (biggest first), a second click
  ascends, a third returns to natural order; text columns start ascending. The header shows the
  active column and direction. This is exactly what the POC's B does — the pick confirms it.
- **Drag a header = reorder**, with the POC's live drop indicator; a click that moves less than a
  few pixels stays a click. Instrument stays anchored first, the snapshot action last.
- **Hide stays in the Columns chooser** (US-61) — no second mechanism.
- The ⋮ header menu from variant A is **not** built: B's pick is click-and-drag, and the chooser
  covers hiding. If touch or keyboard reordering turns out to be missed in practice, that is the
  A-menu's re-entry ticket, opened on that evidence and not before.

### Build plan for the unattended run — measured against the code as of 0.54.0

Written so the night session guesses nothing. One story, one run: build this, release 0.55.0,
land on `main` (CLAUDE.md, *Branches* — a forced session branch is transport; the owner's standing
instruction is that work lands on `main` the same run). `npm test` green before every commit.

**State and persistence — extend the pattern that exists, invent nothing.** The Columns chooser
already persists its hidden set in `localStorage` under `HOLDINGS_COLS_KEY =
'degiro-portfolio.holdings-cols'` (`app.js` ~4754). Add two sibling keys, same mechanism:
`'degiro-portfolio.holdings-order'` (comma-joined column keys) and
`'degiro-portfolio.holdings-sort'` (`'key:dir'` or absent). Sanitise on read exactly the way the
POC does: unknown keys dropped, missing keys appended in canonical order, `instrument` forced
first, `snap` forced last. A persisted sort on a hidden or unknown column is cleared, and hiding
the sorted column via the chooser clears the sort.

**Pure halves in `columns.js`, tested in `test/columns.test.js`:**
- `orderedColumns(orderKeys)` → the sanitised, ordered column list described above.
- `cycleSort(current, key, isNum)` → next sort state: numeric columns cycle `desc → asc → null`,
  text columns `asc → desc → null`; clicking a different column starts that column's cycle fresh.

**Sorting, in `renderHoldings` (`app.js`):**
- Every header cell except `snap` becomes a real button (the POC's `.head` shape) with an arrow
  indicator and `aria-sort` on the `th`. Click = `cycleSort`; re-render is instant — no animation,
  ties break on `a.name.localeCompare(b.name)` (the convention already written at the sort at
  ~4618).
- Sort values, named per column: `instrument` → `p.name` (text); `value`/`share` → `p.current`;
  `result` → `sumWindow(p.pnl, from, to)`; `qty` → `p.qty.at(-1)`; `price` → the same unit price
  the cell shows; `avgPaid` → `p.bought / p.boughtQty`; `dividend`/`bought`/`sold`/`pctBought` →
  their scalars; `split` → `p.current / max(paidIn.at(-1), 0.01)`; `currency` → text.
- **The cash row never sorts** — it is appended after the rows today and stays that way, pinned
  last, because it is the invariant that makes the Result column sum (US-49).
- **Remove the `#products-sort` chips** (`app.js` ~4609, plus their element in `app.html`). The
  default with nothing persisted is **windowed result, descending** — that is what today's default
  (`state.productSort: 'best'`, line ~75) shows, so the default view does not move. The i18n
  strings for the chips go with them; `npm test` counts untranslated strings, so remove both
  languages' entries.

**Drag to reorder, the POC's mechanics verbatim** (`docs/prototypes/holdings-table-interactions.html`
is the reference implementation): `pointerdown` on a `th` (never `instrument`), a 5 px movement
threshold so a click stays a click, pointer capture, `elementsFromPoint` over the header row, a
2 px accent drop indicator via inset box-shadow (`drop-before`/`drop-after`), reorder on release,
and the click that the release produces is swallowed. Order feeds `orderedColumns`; header, body
rows, the cash row and the detail row all already map over one column list, so they follow it by
construction. US-61's width-folding and the chooser are untouched — they key on `data-col`, not on
position.

**Verification, before the release commit:** the demo driven headless (the repo has no driver
dependency — `npm i playwright-core` in a scratch dir outside the repo, Chromium is at
`/opt/pw-browsers`): click Result twice and read the first row flip; drag Value left of Result and
read the header order; reload and read both again (persisted); hide the sorted column and confirm
natural order returns. Wide and narrow. Zero page errors.

**Release 0.55.0:** CHANGELOG entry + WHATS-NEW rewritten (a feature the reader will notice; no
resync for this — and keep carrying the pre-0.51.0 wipe note until the owner says everyone is
past it), STATUS row, this heading → *(built, 0.55.0)*, `manifest.json` + `package.json` bumped.

### Stop conditions

- If drag cannot be made to coexist with the sticky header and the container's own horizontal
  scroll without jank, fall back to reorder-in-the-chooser and say so — a drag that fights the
  scroll is worse than no drag.
- If removing the sort chips visibly changes the default ordering of the table, stop and keep the
  default at windowed-result-descending; the chips leave, the default stays.
- **No scope beyond this story.** Anything discovered on the way (and something will be) becomes a
  backlog entry under the next free number, not a change in this run.

---

## US-88 — `todayPlBase` is not a day figure, and the Today tile said −100 % *(built, 0.54.0)*

> *"his 'Today' is off by a mile, it should in his case be rn 1% down"* — a tester with three open
> positions, the first account with holdings whose owner actually looked at the tile.

The field was read on faith. `parseUpdate` summed `todayPlBase` per position and called it
DEGIRO's own day result; the comment even said so. Two captures in one day measured what the field
actually is: on both accounts the sum came out as **exactly the negative of the whole portfolio's
value, to the cent** (−322 736,77 against 322 736,77; −26 945,43 against 26 945,43). `todayPlBase`
is the negative of the position's start-of-day reference value — the same convention its sibling
`plBase` uses for cost, which the fixture generator had already guessed right — and the day figure
is **`value + todayPlBase`**. Every account with an open position has been told it was down ~100 %
today since the field shipped.

Fixed in `parse.js`: the sum is `value + todayPlBase` per open row; a row carrying `todayPlBase`
without a stated `value` makes the whole figure `null` rather than half a sum; the fixture
generator now encodes the field the way DEGIRO actually does, so the demo exercises the real
shape. On the captures the corrected figure lands on ±0,01 — matching the €0,00 day DEGIRO's own
app showed. When the API serves last-close prices the honest answer *is* flat; it is never a
fabricated −100 %. Known limit, inherited from the field: a position closed today drops to size 0
and leaves the figure. **One ordinary Sync now refreshes the tile — no wipe needed.**

## US-89 — A windowed card counts the opening value as stake *(built, 0.54.0)*

> *"he cant be 200% down on what he put in yk. all he can do is be 100% down"* — the same tester,
> holding a share card reading **−212,91 % on the money put in**.

He is right, and the arithmetic was wrong in a way US-50 half-fixed: that story made the numerator
and denominator share a span, but the denominator was still only the money put in *during* the
window. A month card on a position bought earlier divided the month's loss by the month's deposits
and ignored that the position entered the window already worth something. What is at stake in a
window is **the opening value plus what was put in during it**.

`snapshotModel` now computes the opening value from US-14's identity (`value = paidIn + cumulative
pnl`, read the day before the span) and it joins both denominators: the headline pct
(`returnOnMoneyIn`, new `at-stake` basis) and the bar's own-money segment, restoring
`value = paid + grown` inside the window. The copy names the denominator it has — *"on what was in
it"*, *"{lost}% of what was in it is gone"* — and the all-time card is untouched: opening value
zero, `money-in` basis, original sentences, byte-for-byte. Replayed against the reporting account's
export: the same card now reads **−20,22 % on what was in it**, which is what that month actually
did. A long position can no longer read below −100 %; a written option still can, and the sentence
keeps saying so uncapped, because for a short that is the truth.

---

## US-90 — `carryStocksForward` re-scans a broker's whole calendar to find one day *(built, 0.55.0)*

Found on the 2026-08-19 light scan, not from a defect report — the same shape as US-83, one module
over. `combine.js`'s `carryStocksForward` walks the combined n-day union calendar once per broker
part, and on every day that belongs to that broker's own calendar it does this —

```js
for (let j = 0; j < n; j++) {
  const day = out.days[j];
  if (own.has(day)) {
    const i = r.days.indexOf(day);   // full linear scan of r.days, every matching day
    ...
```

`r.days.indexOf(day)` is a fresh O(n) scan of that broker's own calendar, and because two brokers'
calendars overlap on most days in the ordinary case, this branch fires on close to every one of the
n outer iterations — **O(n²) per broker part** on a ~2 000-day history. Nothing here is user-visible
yet for the same reason US-83 wasn't: no account this project has synced holds a second broker, so
`combineResults` (`combine.js:44`) has never run on real data since US-45 landed. It is a real,
easily-avoided duplicate scan sitting in code that already exists and is already tested, not a
symptom of one — which is why this is a story and not a defect, and why it is not fixed inline
during the scan that found it, same as US-83 before it.

**The lookup it needs is built four lines above the call site and simply isn't passed down.**
`combineResults` already builds `index = new Map(days.map((d, i) => [d, i]))` for the *combined*
calendar (`combine.js:56`) before calling `carryStocksForward`. What's missing is the same kind of
map for each broker's *own* calendar — `Map<day, i>` built once per part, immediately before that
part's inner loop — turning `r.days.indexOf(day)` into an O(1) lookup and the whole function into
O(n) per broker instead of O(n²).

### What to add, and no more

- One `Map(r.days.map((d, i) => [d, i]))` built once per `part`, right where `own` (the `Set`) is
  already built on the line above it.
- The inner lookup becomes `ownIndex.get(day)` in place of `r.days.indexOf(day)`; `own` (the `Set`)
  stays, since the `own.has(day)` branch test and the index lookup are two different questions.
- No new option, no config, no change to what `carryStocksForward` returns or which days it carries.

### Acceptance criteria

- **AC1** `carryStocksForward` contains no `.indexOf(` call — the per-broker day lookup is a `Map`
  built once per part.
- **AC2** Every existing `combine.js` test still passes unmodified — this is a lookup-mechanism
  change, not a behaviour change, and no test's expected numbers move.
- **AC3** A multi-broker fixture combining two calendars of realistic size (hundreds of days,
  partial overlap, one broker starting later) reconciles to the same totals before and after —
  rule 6 applies to the combined view exactly as it does to a single broker.

### Stop condition

If replacing the scan with a map lookup changes which day's stock value gets carried forward for
any day in any existing or new test, stop — that would mean `indexOf`'s first-match semantics were
doing something the `Set`-plus-map pair does not preserve, and the fix needs to find out what before
it ships.

---

## US-91 — Asteria zichtbaar op de brokerpagina zelf *(built, 0.57.0 — variant D, de eigen inbreng van de eigenaar)*

> *"ik wil ook dat we op de giro site zelf een kleine banner zetten zovan, je heb Asteria installed
> of thanks for using, en dan sync now en analyze your data als call to actions? otherwise the user
> might forget to use the plugin"* — de eigenaar, 2026-08-20.

Het probleem is echt en het is niet de sync: de extensie synct al vanzelf (elk uur via de alarm, en
opportunistisch zodra een DEGIRO-tab klaar is met laden — `sw.js`, `tabs.onUpdated`). Wat ontbreekt
is *herinnering*: de analyse bestaat, is bijgewerkt, en niemand ziet haar tenzij hij aan het
puzzelstukje-icoon denkt. De banner is dus een geheugensteun met één primaire actie — **Open je
analyse** — en een sync-knop alleen wanneer die iets toevoegt (verouderd of mislukt), want "druk op
sync" suggereren terwijl de sync al gebeurd is, is theater.

### Wat vaststaat, welke variant ook wint

1. **Eén content script op `trader.degiro.nl`, één shadow-DOM-host, en verder niets.** Het leest
   niets van de pagina, raakt niets van de pagina aan, en zijn enige databron is het bestaande
   `status`-bericht aan de service worker (`lastSyncAt`, `lastError`, `syncing`, `disconnected` —
   alles wat de tekst nodig heeft bestaat al). Geen bedrag, geen accountgegeven, geen naam in de
   banner: statusregel en twee knoppen, meer niet — het is UI die op andermans pagina staat.
2. **Nooit voor de broker-UI hangen.** Rechtsonder, klein, verschuift geen layout, en de acties van
   de broker (koop/verkoop) blijven overal klikbaar. Een overlay die een orderknop bedekt is de
   enige manier waarop dit feature echte schade kan doen.
3. **De acties zijn bestaande berichten**: *Open je analyse* → `openApp`; *Sync nu* → `sync`, met de
   uitkomst in de banner (bezig → bijgewerkt / mislukt) zonder één verzonnen getal.
4. **Losgekoppeld is stil** (US-79): wie zijn account bevroor, vroeg om niet gevolgd te worden — dan
   ook geen banner.
5. **Wegklikken wordt onthouden** (`chrome.storage.local`, een voorkeur zoals het thema) en komt
   nooit in een export of foutrapport (rule 7-reflex).
6. **Rule 9 blijft onaangeraakt**: de banner leest geen sessie, raakt geen cookie aan — hij praat
   alleen met de eigen service worker.

### De open vraag: welk karakter heeft hij — POC en een keuze

**`docs/prototypes/degiro-banner.html`** — één zelfstandige pagina, nep-brokerpagina met verzonnen
cijfers, alle drie de varianten klikbaar met werkende toestanden (bijgewerkt / verouderd / mislukt /
net geïnstalleerd, sync-verloop, wegklikken):

- **A · Chip, altijd aanwezig** — ingeklapt merkteken + statusstip rechtsonder; klik klapt het
  kaartje uit. Nooit een verrassing, maar permanent ~80px van de hoek bezet.
- **B · Toast bij elk bezoek** — schuift binnen met status en beide acties; wegklikken is twee weken
  stil. Maximale herinnering, snelst irritant voor wie dagelijks handelt.
- **C · Stil tot er iets is** — geen UI zolang alles klopt; verschijnt bij eerste run, verouderde
  data of een mislukte sync. Minst opdringerig, maar herinnert alleen bij problemen.

Sub-vragen voor dezelfde keuzeronde: hoe lang blijft weggeklikt weg (veertien dagen?), en welke taal
spreekt hij (de taalvoorkeur van de app-pagina is voor een content script onbereikbaar —
`navigator.language`, of NL omdat DEGIRO NL is?).

### Acceptatiecriteria (variant-onafhankelijk)

- **AC1** Het content script injecteert uitsluitend zijn eigen shadow-DOM-host en leest niets van de
  pagina; alle getoonde tekst is herleidbaar tot het `status`-bericht.
- **AC2** Geen layoutverschuiving, geen overlap met broker-acties, `prefers-reduced-motion`
  gerespecteerd, en op een losgekoppeld account verschijnt niets.
- **AC3** *Open je analyse* opent de app-pagina; *Sync nu* toont bezig → uitkomst en verschijnt
  alleen wanneer de status erom vraagt.
- **AC4** Wegklikken overleeft een herstart per de gekozen variant-regel en staat in geen export.
- **AC5** De banner bevat geen bedrag, geen accountnummer, geen naam — ook niet ter begroeting.

### De keuze — D, een strip bovenaan; eigen inbreng van de eigenaar

> *"ja ik zou gwn continue een strip aan de top van t scherm willen hebben en dat als hij [de]
> plugin detecteerd hij die plek inneemt ;P"* — de eigenaar, 2026-08-20. Sub-keuzes uit dezelfde
> ronde: weggeklikt blijft weg **tot de volgende browserstart**, en de taal **volgt de browser**
> (`navigator.language` — nl → Nederlands, anders Engels).

Geen van de drie aangeboden varianten dus, maar een vierde: **permanent, de volle breedte,
bovenaan**. "Detecteert" is vanzelf waar — het content script bestaat alleen als de extensie
geïnstalleerd is, dus de strip verschijnen ís de detectie. De POC draagt de strip nu als variant D,
naast de drie afgewezen alternatieven. Eén vaststaand punt scherpt de keuze aan in plaats van hem
tegen te spreken: de strip **duwt de pagina omlaag** (marge op `<html>`) in plaats van eroverheen te
hangen — punt 2 wordt daarmee "bedekt nooit iets" in plaats van "verschuift geen layout", want een
topstrip verschuift per definitie.

### Bouwplan — gemeten tegen de code van 0.56.0

- **Pure helft: `src/lib/bannermodel.js`**, getest in `test/banner.test.js`. `pickLang(navLang)` →
  `'nl' | 'en'`; `bannerModel({ lastSyncAt, lastError, syncing, disconnected, now, lang })` →
  `{ show, tone: 'ok'|'warn'|'err', line, showSync }`. Regels: `disconnected` → `show: false`;
  `syncing` → bezig-regel, geen knop; `lastError != null` → mislukt-regel + knop (een geslaagde
  sync zet `lastError` op `null` — `sync.js:655` — dus dit ís "laatste poging mislukt");
  `lastSyncAt === 0` → eerste-run-regel, geen knop (de opportunistische sync loopt al); ouder dan
  **3 dagen** → verouderd-regel met het aantal dagen + knop; anders → bijgewerkt-regel, geen knop.
- **Content script**: `src/content/boot.js` (klassiek, drie regels: dynamische import van de eigen
  module-URL) en `src/content/banner.js` (de module: leest `chrome.storage.session` voor het
  wegklikken, vraagt `status` aan de service worker, bouwt één shadow-DOM-host bovenaan, zet
  `margin-top` op `<html>` ter hoogte van de strip en herstelt die bij sluiten). Acties:
  *Open je analyse* → `openApp`; *Sync nu* → `sync` met `force: true` (wat de popup ook stuurt),
  daarna status opnieuw ophalen en de regel bijwerken. Geen enkele leesactie op de pagina zelf.
- **Wegklikken tot browserstart**: `chrome.storage.session` (leeft per browsersessie, overleeft een
  service-worker-herstart, sterft met de browser — precies de gekozen semantiek). De service worker
  zet bij install/startup `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`,
  anders mag een content script er niet bij.
- **Manifest**: `content_scripts` op `https://trader.degiro.nl/*` (`document_idle`) en
  `web_accessible_resources` voor de twee modulebestanden, beperkt tot datzelfde origin. Geen
  nieuwe permission — `storage` is er al.
- **Verificatie**: de demo kan geen content script laden, dus headless tegen een mockpagina met een
  `chrome`-stub: strip aanwezig in shadow DOM, pagina omlaag geduwd en hersteld na sluiten,
  sync-knop alleen bij verouderd/mislukt, berichten kloppen, nul paginafouten. **Wat alleen de
  eigenaar kan zien**: hoe de strip zich verhoudt tot DEGIRO's échte koppagina (een `position:
  fixed`-header van de broker schuift niet mee met de marge-duw) — dat is de eerste vraag bij de
  volgende echte sessie, en zo nodig een vervolg-story op dat bewijs.

### Stop conditions

- Als de duw-omlaag op de mockpagina al niet schoon te krijgen is (springende layout, dubbele
  scrollbalk), stop en meld het — dan is overlappen-met-hoge-z-index de terugvaloptie en dat is een
  nieuwe afweging, geen stille wissel.
- Geen scope voorbij deze story: geen instellingenpaneel, geen frequentieregeling, geen tweede
  plek voor de strip. Wat onderweg opduikt wordt een backlog-entry onder het volgende vrije nummer.

---

## US-92 — De toast erbij: B naast D *(built, 0.58.0)*

> *"ik wil de strip en de toast svp vind beide goed"* — de eigenaar, 2026-08-20, één release na
> US-91.

De strip (US-91, variant D) blijft de blijvende aanwezigheid; variant B uit dezelfde POC komt erbij
als binnenkomst-nudge rechtsonder. Twee oppervlakken, één brein: beide tekenen exact dezelfde regel
uit `bannermodel.js`, dus er kan geen tweede waarheid ontstaan — de toast is louter een tweede
plek waar hetzelfde staat.

Eén ontwerpbeslissing die de combinatie draaglijk maakt, hier vastgelegd omdat de eigenaar hem niet
expliciet vroeg: **de toast ruimt zichzelf op na 12 seconden.** Twee permanente meldingen naast
elkaar is dubbelop; de toast zonder auto-hide zou precies dat zijn. Aanraken (pointer erin of erop)
annuleert de timer — een melding die verdwijnt terwijl je hem leest is erger dan geen melding — en
zonder kruisje is hij er bij de volgende paginalading gewoon weer. Het kruisje is de echte keuze en
heeft dezelfde semantiek als dat van de strip: weg tot de volgende browserstart, in een **eigen**
vlag (`toastDismissed` naast `bannerDismissed`), zodat de twee onafhankelijk wegklikbaar zijn.

Alles wat bij US-91 vaststond geldt onverkort: één shadow-DOM-host, niets van de pagina gelezen,
losgekoppeld (US-79) toont geen van beide, de duw-marge hoort bij de strip alleen, en de toast
respecteert `prefers-reduced-motion` (geen inschuif-animatie, wel dezelfde inhoud).

### Acceptatiecriteria

- **AC1** Strip en toast tonen dezelfde statusregel, dezelfde toon en dezelfde knoppen, uit
  hetzelfde model — een sync gestart vanuit het ene oppervlak werkt de regel in beide bij.
- **AC2** De toast verdwijnt vanzelf na de auto-hide; aanraken annuleert dat; het kruisje zet de
  eigen sessievlag en laat de strip staan (en andersom).
- **AC3** Losgekoppeld toont geen van beide; beide vlaggen gezet toont geen van beide en stuurt
  dan ook geen status-bericht.
- **AC4** De duw-marge staat er alleen wanneer de strip er staat, en gaat netjes terug bij diens
  kruisje.

---

## US-93 — De kolomkop legt zichzelf uit *(built, 0.60.0)*

> *"Zou wel lekker zijn als we een soort hover effect hebben op de kolom namen met toelichting?"*
> — de eigenaar, 2026-08-20, direct nadat hij moest vragen waarom "% of bought" (+18,98 %) een
> ander percentage is dan de 28 % "grown" op dezelfde rij.

Het antwoord op die vraag bestond — andere noemer (bruto-inleg over het venster tegenover de
huidige waarde), netto tegenover bruto, venster tegenover all-time — maar het stond in
code-commentaar bij `moneyInOver` en in een chatantwoord: nergens waar de lezer van het getal
kijkt. Dat is woordelijk het argument waarmee `TILE_TIPS` er kwam (*"a number on a dashboard is
an assertion"*, `app.js`): de tegels leggen zichzelf uit, de kolommen van de Positions-tabel nog
niet. Dit is dezelfde story, één tabel verderop.

### Wat er al ligt — gemeten tegen 0.58.0

- **Eén gedeeld tooltip-element**, `wireTips` (`app.js:3294`): `position: fixed`, hover én
  toetsenbordfocus én tik, Escape sluit, en het ontsnapt aan overflow-clipping — precies het
  probleem dat een tabelkop ook heeft. Er komt dus **geen tweede implementatie**; de root-lijst
  in `wireTips` is een besliste lijst (het commentaar bij `app.js:3332` zegt dat met zoveel
  woorden) en `#holdings thead` wordt de derde entry.
- **De kop is al een knop.** Klik sorteert, slepen herordent (US-87), en de kop wordt bij elke
  render herbouwd — de gedelegeerde listeners van `wireTips` vangen dat herbouwen al op.
- **US-67 staat er nog**: een affordance die alleen een muis beantwoordt, beantwoordt niemand op
  een touchscreen. En op een kop is een tik al bezet — die sorteert. De kop zelf kan op touch dus
  geen toelichting dragen; er moet een tweede weg naar dezelfde tekst zijn.

### Ontwerp

1. **`data-tip` op de bestaande `.col-head`-knop.** Hover en focus tonen de toelichting via het
   gedeelde element; klik blijft sorteren. Bij `dragstart` (het US-87-pad) verdwijnt de tip en
   blijft hij weg tot de drop — een tooltip die met een gesleepte kop meereist is ruis.
2. **Geen "i"-knopje per kop.** Veertien extra knoppen in een rij die al klikt én sleept, terwijl
   de breedte-drop (US-61) om elke pixel vecht. De tegels hebben het knopje omdat hun label
   verder niets doet; de kop doet al twee dingen.
3. **Touch gaat via de column chooser (US-61).** Die toont per kolom al een rij; elke rij krijgt
   dezelfde `data-tip`, en het bestaande tik-pad van `wireTips` toont hem. Zo is geen enkele
   toelichting hover-only.
4. **De bron is één tabel: een `tip` naast elk `label` in `HOLDINGS_COLUMNS`** (`columns.js`).
   Kop, chooser en detail-expand lopen al over die ene lijst, dus één bron kan niet desynchroniseren.
   Een kolom zonder tekst valt op (het `TILE_TIPS`-argument); alleen de actiekolom heeft er bewust
   geen.
5. **Elke tekst noemt zijn noemer en zijn venster** — all-time of de geselecteerde periode. Dat
   ontbrak, en dat wás de vraag van 2026-08-20. Engels als sleutel, Nederlands in `i18n.js`, via
   `tr()`, zoals elke UI-tekst.

### Conceptteksten — bij bouw te verifiëren tegen `engine.js` (AC4)

De refinement heeft twee valkuilen al gemeten, en de teksten moeten ze benoemen in plaats van ze
te herhalen:

- **Result per rij is alleen koersresultaat.** Het per-product-`pnl` (`engine.js:1348`) is
  waardebeweging minus eigen aan- en verkopen; dividend zit er *niet* in — dat staat in de
  Dividend-kolom en telt via de cash-rij in het accountresultaat. Een toelichting die "inclusief
  dividend" beweert is erger dan geen toelichting.
- **Dividend (all time) is netto**: bruto plus de (negatieve) bronbelasting (`engine.js:813`).
- **% of bought** deelt het vensterresultaat door alles wat er *in dat venster* bruto in ging
  (`moneyInOver`, `snapshot.js:156`) — verkopen verlagen die noemer niet. **Paid in vs grown**
  verdeelt wat de positie *nu* waard is, en zijn "paid in" is netto: elke verkoop haalt er geld
  uit. Twee vragen, twee noemers; de teksten moeten dat verschil dragen, want dit is de kolom
  die de story veroorzaakte.

### Acceptatiecriteria

- **AC1** Hover en toetsenbordfocus op een kolomkop tonen de toelichting via het bestaande
  gedeelde element; Escape sluit; klik sorteert nog, slepen herordent nog, en tijdens een sleep
  verschijnt geen tip.
- **AC2** Elke toelichting is op een touchscreen bereikbaar (via de chooser) — niets is
  hover-only (US-67).
- **AC3** Elke kolom behalve de actiekolom heeft een tekst; elke tekst bij een getal noemt zijn
  noemer en zijn venster; de bron is één tabel in `columns.js`; beide talen compleet.
- **AC4** Elke bewering in een tekst is geverifieerd tegen de engine — met name: geen dividend in
  Result, dividend netto, % of bought bruto over het venster.
- **AC5** `npm run demo` laat het geheel zien zonder Chrome-API's; de US-87-tests
  (sorteren/slepen) blijven groen.

### Buiten scope

Geen tips op andere tabellen (transacties, maandgrid — die hebben `title`-attributen waar nodig),
geen tips in de datacellen zelf, `TILE_TIPS` verhuist niet, geen instelbaarheid. Wat onderweg
opduikt wordt een eigen entry onder het volgende vrije nummer.

---

## US-94 — Paid in vs grown voor gesloten posities: ingelegd vs eruit gekomen *(built, 0.60.0)*

> *"waarom ziet hij niet overal paid vs grown ook voor closed holdings"* — testervraag via de
> eigenaar, 2026-08-20; op het stroom-voorstel hieronder: *"Dit vind ik wel cool!"*

Het streepje bij gesloten posities is een **beslissing, geen gat** — en de reden blijft staan. De
balk beantwoordt een voorraadvraag ("van wat dit nu waard is, hoeveel is inleg en hoeveel
aangroei?", invariant `value = paidIn + result`), en een gesloten positie is €0 waard: er valt
niets te splitsen. Toen de share-card er tóch één tekende, zei hij *"100% of what you paid in is
gone"* over een verkoop met 20% verlies — het US-82-defect dat de card het streepje van de tabel
liet overnemen (`lib/snapshot.js`, commentaar bij `split`). Die balk komt **niet** terug.

Wat er wél komt is een **andere balk met een eigen noemer**: de stroomvariant, alles-de-tijd.
Voor een gesloten positie is de zinvolle vraag niet "waar bestaat de waarde uit" maar "wat kwam
eruit tegenover wat erin ging": **gekocht (€) tegenover verkocht + dividend (€)**, als balk met de
zin *"je kreeg 92% terug van wat je inlegde"* (of 108%). De data ligt per positie klaar — `bought`,
`sold` en `dividend` zijn all-time scalars uit de engine; er is geen cost-basis-conventie nodig en
de engine blijft onaangeraakt.

Twee dingen die de story moet bewaken, allebei al eerder als defect langsgekomen:

1. **De zin benoemt zijn eigen noemer.** De balk zegt bij gesloten posities iets ánders dan bij
   open (gerealiseerde uitkomst i.p.v. huidige samenstelling) — dezelfde discipline die US-89 aan
   windowed cards oplegde: een balk die op een andere noemer staat, zegt dat er ook bij.
2. **Card en tabel uit één model.** US-52 tilde de rekensom naar `splitModel`; de gesloten variant
   krijgt hetzelfde: één pure functie (naast of in `splitModel`), getest, en zowel de rij als de
   share-card tekenen daaruit — geen tweede waarheid.

Het voegt geen nieuwe informatie toe — **Result** en **% of bought** zeggen het al als getal — maar
leesbaarheid is precies waar deze kolom voor bestaat, en de *Closed*-filter toont nu een kolom die
voor elke rij leeg is.

### Acceptatiecriteria

- **AC1** Een gesloten positie toont in *Paid in vs grown* een balk plus zin op basis van
  `bought` vs `sold + dividend` (alles-de-tijd); de zin benoemt die noemer expliciet.
- **AC2** Open posities zijn ongewijzigd, tot op de digit — de bestaande `splitModel`-uitkomsten
  en hun tests blijven staan.
- **AC3** De share-card van een gesloten positie tekent dezelfde balk uit hetzelfde model als de
  rij (en het US-82-gedrag — geen voorraadbalk voor gesloten — blijft aantoonbaar weg).
- **AC4** Sorteren op de kolom werkt ook voor gesloten rijen, op de eigen ratio (eruit/erin), en
  mengt de twee betekenissen niet stilzwijgend: de sort blijft per rij consistent met wat de cel
  toont.
- **AC5** Getest op de fixtures' twee gesloten posities (één met winst, één met verlies — daar
  zijn ze voor, US-82) en zichtbaar in `npm run demo`.

### Stop condition

- Geen herontwerp van de open-balk, geen kolom erbij, geen windowed variant van de stroom-balk:
  alles-de-tijd of niets. Wat onderweg opduikt wordt een entry onder het volgende vrije nummer.

---

## US-95 — De sheet krijgt een ✕ rechtsboven *(built, 0.60.0 — variant A)*

> *"also why is the close not on the right top"* — dezelfde testronde, 2026-08-20.

Geen beslissing die dit tegenhoudt, gewoon nooit gebouwd: de share-sheet (en de
diagnostics-dialog) sluiten via de knop onderin, Escape en de backdrop — drie uitgangen, alle drie
door één pad (`app.js`, de `cancel`-handler zegt het letterlijk) — maar de hoek waar een lezer als
eerste kijkt is leeg. De extensie heeft het patroon nota bene al: de strip en de toast op de
brokerpagina sluiten met een ✕ (US-91/92). Twee oppervlakken die op elkaar lijken moeten zich
hetzelfde gedragen; de sheet is de uitzondering, en dat is precies wat de tester voelde.

De POC — **`docs/prototypes/share-sheet-close.html`**, zelfstandig, synthetische data, de
materialize-animatie van US-57 nagebouwd — zet drie varianten naast elkaar:

- **Huidig** — nulmeting: Close onderin, geen ✕.
- **A — ✕ rechtsboven, onderin alleen acties** — de actierij houdt alleen werkwoorden over (*Copy
  image*, *Download*); de uitgang woont waar elke modal hem legt. Visueel 28 px, raakvlak 44 px,
  reactie op pointer-down, hover-cirkel identiek aan het kruisje van de strip, als laatste in de
  DOM zodat Tab eerst langs de inhoud loopt, `title="Sluiten (Esc)"` leert en passant de
  sneltoets.
- **B — ✕ én Close blijft** — twee uitgangen die hetzelfde doen, voor wie de ✕ niet ziet.

Wat vaststaat, welke variant ook wint: de ✕ gaat door hetzelfde sluitpad als Escape en de
backdrop; de materialize-animatie en het reduced-motion-gedrag blijven ongemoeid; en — US-57's
les — **elke modal, niet één**: de diagnostics-dialog krijgt dezelfde behandeling als de sheet.
Geen sleep-om-te-sluiten: dit is een desktopdialog zonder aanraak-idioom, en een gebaar dat
nergens anders in de app bestaat zou een losse belofte zijn.

### De keuze — A

> *"voor de poc kies ik A"* — de eigenaar, 2026-08-20.

✕ rechtsboven, en de actierij houdt alleen werkwoorden over. Concreet, op beide modals:

- **Share-sheet**: de *Close*-knop verdwijnt uit de actierij; *Copy image* en *Download* blijven.
  De ✕ zoals de POC hem tekent: visueel 28 px, raakvlak 44 px, hover-cirkel identiek aan het
  kruisje van de strip, reactie op pointer-down, als laatste in de DOM (Tab loopt eerst langs de
  inhoud, de focus landt bij openen niet op "weggaan"), `title` draagt de Escape-sneltoets.
- **Diagnostics-dialog**: *Hide* verdwijnt op dezelfde manier; *Copy report* blijft als enige
  actie, de ✕ sluit. Zelfde markup, zelfde stijlklasse, zelfde sluitpad (`closeModal`).

### Bouwplan — gemeten tegen de code van 0.58.0

- `src/ui/app.html`: één ✕-knop per dialog, als laatste kind; de knoppen `#btn-share-close` en
  `#btn-hide-diag` gaan eruit.
- `src/ui/styles.css`: één `.sheet-close`-klasse (de POC-stijl, op de bestaande tokens).
- `src/ui/app.js`: de ✕ wijst naar het bestaande `closeShareSheet` resp.
  `closeModal($('#diagnostics'))` — geen nieuw sluitpad, de `cancel`-handlers blijven de enige
  andere weg naar binnen.
- Teksten (`aria-label`, `title`) via `tr()`, beide talen — zoals elke UI-tekst.

### Acceptatiecriteria

- **AC1** De ✕ sluit de sheet via hetzelfde pad als Escape en de backdrop, met de bestaande
  animatie, ook onder reduced motion.
- **AC2** De actierij van de sheet bevat alleen nog *Copy image* en *Download*; die van de
  diagnostics-dialog alleen nog *Copy report*; beide dialogs dragen dezelfde ✕ en gedragen zich
  identiek.
- **AC3** De ✕ is met toetsenbord bereikbaar, draagt een vertaalde `aria-label`, en de focus
  landt bij openen niet op "weggaan".
- **AC4** `npm run demo` laat het zien zonder extensie of login.

### Stop condition

- Alleen de sluit-affordance: geen herindeling van de actierij voorbij wat variant A vraagt,
  geen nieuw modal-gedrag, geen gebaren.

---

## US-96 — A euro option's contract size read as an exchange rate, twice applied *(built, 0.59.0)*

> Renumbered from US-93 during the land: a parallel session claimed US-93 on `main` (de
> kolomkop-toelichting) while this fix was on its transport branch — the number moved, the story
> did not. Same collision, same resolution, as US-94/US-95 the same day.

> *"we are really not compatible with his margin calls i think?"* — the owner, forwarding the
> first heavy-options account: reconstructed total **€ −47.491,36** against DEGIRO's
> **€ 124.110,28**, off by **€ −171.601,63**, the whole-history chart dipping to −€ 1,4 million,
> and a red `settled-amount-mismatch` naming 301 trades across 135 instruments.

The margin guess was reasonable and wrong — the negative cash balance reconciled to within fifty
cents. The evidence pointed one layer down: every one of the 301 flagged trades was a euro option,
`positionsAgree` was true, and the per-instrument ratios read 100, 10, 9.87 — contract sizes, not
prices.

Two mechanisms measured the same number and both applied it. A derivative settles at
`price × quantity × contractSize`, so `deriveContractSizes` correctly measured 10 for the Adyen
puts and 100 for the BMW put. But the same trades then hit 0.39.0's settled-amount check, whose
premise is that for a euro instrument settled equals traded and any consistent ratio between them
is a currency conversion in disguise. A contract size is *perfectly* consistent — more so than any
real rate — so it passed the spread guard built to refuse disagreeing evidence, and the valuation
multiplied `q × price × shares × implied`: the contract size squared. Three written euro puts came
out 10× to 100× their true negative value, which is the whole €171 601,63; the flagged euro
options that have since been closed got the same treatment on the days they were held, which is
the −€ 1,4 million dip.

The fix is one factor in one line, in the settled-amount scan: divide the measured contract size
out of `settled / traded` before asking whether a currency-sized ratio remains. What the contract
size explains is not a mismatch; what survives the division is what a currency actually looks
like. The genuinely mislabelled-currency case (US: a share settling at 0,851) keeps its behaviour
untouched — a share's contract size is 1 — and a foreign-in-disguise *option* still resolves:
either the size measurement absorbs the factor whole, or it refuses to round and the implied-rate
path handles `size × rate` as before.

Replayed against the reporting account's export: total € 123.870,44 against DEGIRO's € 124.110,28
— the residual −€ 239,83 is a stale SEK rate plus last-traded-versus-close on options DEGIRO
carries no series for; the false warning is gone; all-time result +€ 65.401,69 beside DEGIRO's own
Totaal W/V of +€ 64.962,44. History minimum € 799,48 (day one) instead of −€ 1,4 million.
**No resync** — raw stores were right all along; the page recomputes on open.

---

---

## Four requests from the 2026-08-22 tester call *(refined, then refined again the same day)*

All four came out of one call and share more plumbing than they look like they do. US-97 ran
straight into SPEC §7's *"no benchmarks"* stop; put to the owner the same day, it came back
**decided** — approved, and broadened from "an S&P 500 button" into a general benchmark picker
(S&P 500 default, any ETF typed in and fetched on demand, PROP folded in as a third entry, see
former US-100). That decision also unblocks the S&P-500/ETF half of US-99's "what if" sentence,
which had been waiting on it. US-98 needed no decision at all and is unchanged. Read US-97 first —
it is now the one the other two lean on for data, not the one waiting on a decision.

---

## US-97 — Compare to a benchmark: S&P 500 by default, any ETF on toggle *(decided, refined further — needs a SPEC amendment before it's built)*

> "SP 500 compare mag wel of je moet kunnen toggelen naar een andere etf die dan dynamisch wordt
> opgehaald" — "compare to prop mag als 'etf' optie naast dus compare to SP 500" — the owner,
> 2026-08-22.

As an investor, I want a button that draws my portfolio's return next to a benchmark's — S&P 500
by default, but switchable to any other ETF I type in, fetched on the spot — over the whole
history and over whatever period is selected, so I can tell whether I am beating the market,
beating some other index I care about, or riding it.

### Decided: broader than the original ask, and PROP moved out of hiding

Two changes from the first refinement, both the owner's call, not mine:

1. **Not one fixed index.** A toggle with S&P 500 pre-selected, and a free-text field that fetches
   whatever ticker is typed in — "dynamically", i.e. on demand, the first time it is chosen, not a
   pre-loaded catalog.
2. **PROP sits in the same picker as S&P 500**, not quarantined inside Optimism Mode. The
   Compare-to-PROP button from the first refinement (US-100) is **folded into this story** as one
   built-in entry in the same list — see below for what that changes about its honesty
   obligations now that it is a peer of a real benchmark rather than a joke behind a gate.

### This still runs straight into SPEC §7, now for a wider claim

*"Stop after 7. No multi-account support, no benchmarks, no tax reporting…"* — benchmarks are
explicitly out of scope, and unlike "no multi-account" (superseded for multi-broker at 0.26.0),
"no benchmarks" has never been amended. The owner approving the *feature* in chat is not the same
document event as the SPEC amendment rule 8 and the branch policy both lean on — **the amendment
now has to describe the general capability, not just S&P 500**, since arbitrary-ticker comparison
is a materially bigger promise than one named index:

> **Proposed text for SPEC.md §7:** *"Amended, `<version>`: 'no benchmarks' is superseded — a
> portfolio-return comparison against a chosen index or ETF (S&P 500 total return by default,
> any other ticker on request, plus the account's own PROP holding as a standing joke entry) is
> now in scope; see US-97 in `docs/BACKLOG.md`."*

Land this line before or in the same commit as the first line of code, the way 0.26.0 did it.

### Why it is a bigger addition than the button suggests

Every number on this page today is either DEGIRO's own data or a pure function of it. An index
price series is neither — a new external source, fetched from somewhere that is not DEGIRO, on a
schedule, cached, and it has to answer to the same rules as everything else here:

- **Rule 1** — `engine.js` stays pure. The index series is fetched in `sync.js` or a new
  `src/lib/benchmark.js` shaped like `degiro.js` (a thin fetch wrapper, no logic), and handed into
  engine functions as a plain array, exactly like `close`/`days` already are.
- **Rule 2** — only raw responses are persisted truth. Store the raw daily closes for the index,
  not a precomputed "S&P return" — recompute the comparison on open, like everything else.
- **Rule 5** — a second host is not a second violation of "one throttled queue," but it must not
  become a second *unthrottled* path either. An index close changes once a day; fetch it once a
  day off the existing alarm, cache it, never re-fetch inside a render.
- **Rule 7** — the index series carries no personal data, but a derived claim shown on screen
  ("you beat the S&P 500 by 4,2 pp") is a new kind of statement leaving the page in a screenshot,
  and earns the same scrutiny every other on-screen figure gets.

### Three kinds of entry in one picker, and they are not the same amount of work

| Entry | Fetch | Notes |
|---|---|---|
| **S&P 500** (default) | New, scheduled | Needs a total-return series — see below |
| **Any other ETF/ticker** | New, on demand | Fetched the first time it's picked, then cached like any other raw store |
| **PROP** | None | Already an owned instrument; its price series is already fetched and stored |

**S&P 500's own trap:** "S&P 500" in casual use almost always means **price** return, but the
honest comparison is **total** return (dividends reinvested) — our own portfolio return already
includes dividends (rule 3), so a price-only index silently flatters us. Needs a source with a
total-return variant (e.g. a `^SP500TR`-style series). Whatever the default fetch, the same
provider has to answer for **arbitrary** tickers too, not just the one it was picked for —
spike both cases together, the way SPEC §8e already prescribes: confirm the real response shape
for a known-good ticker and an unknown one before writing the parser.

### The dynamic-ETF fetch is the part that actually grows the surface

A single hardcoded index is one new fetch call. "Any ETF, dynamically" is a small feature of its
own hiding inside this one:

- **No symbol search, no autocomplete, no catalog — rule 8.** A free-text ticker field that
  fetches on submit is the whole of v1. A searchable instrument picker is exactly the kind of
  "nobody asked for this option yet" surface rule 8 exists to keep out; add it only if testers
  ask for it after using the plain field.
- **Rule 5, on a second host.** The new provider is not DEGIRO, so it cannot lock a DEGIRO account,
  but it still gets **one throttled queue of its own** — no scatter-fetching a ticker on every
  keystroke, one request per submitted symbol, cached from then on.
- **A typo or an unlisted ticker is `not found`, never a guess.** The same discipline classify.js
  applies to an unrecognised cash row (rule 4) applies here: an unresolvable symbol is shown as
  unresolved, never silently substituted for the default or estimated from something adjacent.
- **Rule 2, unchanged in spirit.** Every fetched series is a raw store per symbol, keyed by ticker;
  the comparison recomputes from the raw closes on open, exactly like the account's own history.

**PROP, now that it sits beside a real benchmark rather than behind Optimism Mode's gate, picks up
a different obligation: it must say plainly what it is.** The comparison itself is honest — real
portfolio return against PROP's real, measured return, nobody's numbers invented — but the label
has to say "PROP (your own holding)" or equivalent, never dressed as a market index. That is the
whole of what rule 6 asks of it once it is a feature rather than a joke: the number must not lie,
and a silly benchmark presented as if it were a serious one would be exactly that.

### Build sketch

- `windowReturnPct(result, from, to)` already computes our own chained return over any window; the
  identical function over the benchmark's own close series gives its return over the identical
  window — one function, two inputs (ours, the chosen benchmark's), no new return arithmetic,
  whichever entry is picked.
- The existing range selector *is* "specific periods" — reuse it rather than adding a second date
  picker.
- Portfolio-% and benchmark-% legitimately share one y-axis (both are returns); portfolio-€ and
  benchmark-% must never be the two lines on one chart — the two-scales mistake the chart rules
  already forbid, in a new shape.
- The KPI line above the chart states the gap in words ("+4,2 pp vs S&P 500", "+11 pp vs PROP"),
  not only the plot.
- One picker, one code path: S&P 500, a typed ticker, and PROP are three *inputs* to the same
  comparison function, not three features.

### Open decisions

- ☐ Provider for the S&P 500 total-return series **and** for arbitrary tickers — ideally the same
  one, so there is one fetch module rather than two (spike first).
- ☐ Return-based comparison only, or value-based in €? **Recommendation: return-based only** — a
  €-vs-€ comparison drags in an FX question (most ETFs are priced outside EUR) this project does
  not otherwise need to answer.
- ☐ Where the picker lives. **Recommendation:** beside the existing range controls, so it inherits
  the period selector rather than duplicating it.
- ☐ Exact PROP label wording, so it reads as a labelled curiosity rather than a hedge on the S&P
  500 entry beside it.

### Acceptance criteria

- **AC1** The comparison is total-return for S&P 500, the chosen ticker's own return for any other
  entry, and PROP's own measured return for that entry — all against our own chained return, all
  in %, same window, one shared axis.
- **AC2** Every fetched benchmark series is its own raw store, fetched through one throttled path
  of its own; the default (S&P 500) refreshes on the daily alarm, a user-typed ticker fetches once
  on selection and is cached from then on — never re-fetched inline during render.
- **AC3** An unresolvable ticker shows "not found," never a silent fallback, a guess, or an
  estimated figure — rule 4's spirit, applied to a new data source.
- **AC4** The PROP entry's label states it is the account's own holding, not a market index, at
  every place the comparison is shown or shared.
- **AC5** SPEC.md carries the dated, named amendment, describing the general capability (default
  index, any ticker, PROP), in the shape 0.26.0 already set.

---

## US-98 — Dividend tracker, and price return vs. total return *(new, refined — no scope decision needed)*

> "Dividend tracker + een roi tracker die dan kan checken obv de tdiv eentje voor de koers en
> eentje van de total returns."

Two related asks: a dedicated view of dividend income over time, and splitting "how much of my
return is price moving vs. dividends landing" into two named numbers instead of one blended one.

### This needs no new data and no new I/O

Every input exists today. Dividend rows are classified (`classify.js`: `DIVIDEND`, `DIVIDEND_TAX`),
summed daily (`dividendGross`, `dividendTax` in `engine.js`), and already rolled up per year
(`incomeByYear`) and per product, all-time (US-50's Dividend column). The split this asks for is
exactly what US-33's Outlook section already worked out and never shipped on its own:

```
dividend yield ≈ dividend income over the period ÷ average value over the period
price growth   ≈ total time-weighted return − dividend yield
```

**The same double-counting trap US-33 named applies here, and it is the one thing to get right.**
Our measured total return (`windowReturnPct`) already contains dividends — a dividend is internal
(rule 3), so it sits inside `pnl` already. Price return must be *derived by subtraction*, never
computed a second, independent way, or a rounding gap between two measurements of the same thing
will read as a bug.

### Dividend tracker — the shape

A third chart, not a table upgrade, alongside the two that already exist (value including cash,
period P/L): dividend income per period, using the same bucketing the P/L bars already use
(`aggregatePnl`/`candleSeries` fed `dividendGross`/`dividendTax` instead of `pnl` — the
granularity and range-selector code is shared, not rebuilt). One y-axis per chart means this is
its own chart, not a second scale bolted onto the P/L bars. Two bars per period (gross, tax
withheld) reuses the stacking the month grid already draws for other pairs.

### ROI tracker — the shape

A toggle or a two-line KPI, matching the Euro/Return% and time-/money-weighted toggles this page
already carries three times over (US-31): **Total return** (today's figure, unchanged) and
**Price return** (derived), shown together — the same reasoning US-31 used for its two returns:
two answers to two questions is not a contradiction as long as the reader knows which is which.

### Traps

- **A short window with one large dividend produces nonsense** — a special dividend inside a
  narrow window can push the derived yield above the window's total return, making "price return"
  negative on a flat month. Needs a stated minimum window, in the spirit of US-31's under-a-year
  annualisation guard.
- **The per-year split (US-30) is unambiguous; an arbitrary windowed split is not** — the average-
  value denominator has to be computed over the exact selected range, not the calendar year it
  falls inside.

### Acceptance criteria

- **AC1** Price return is derived by subtraction from the measured total return and the measured
  dividend yield; a test proves an account whose entire return is dividends derives ~0 % price
  return — the same property US-33 already specifies for its own Outlook split; extend that test
  rather than writing a second one.
- **AC2** The dividend chart shares the P/L chart's range selector, granularity and bucketing
  functions — no second charting code path.
- **AC3** Below a stated minimum window, only the single measured total return shows — no split.
- **AC4** Total return and price return are both named in words wherever either appears — never a
  bare "return."

---

## US-99 — Lossporn: a shareable top 10, and a "what if" line on the worst of them *(refined again — what ships, what never will, and the path to the rest)*

> "We moeten ook Lossporn goed sharable maken, een top 10 beste en slechtste trades. Bij de
> slechtste posities zou je kunnen zeggen obv het moment van kopen een zinnetje van als je dit had
> geinvesteerd in (een ander bedrijf of sp500) dan was het nu Y waard." — "zou je 99 kunnen
> refinenen naar iets wat wel kan en wat bewust niet kan en hoe we wel alles kunnen krijgen?" —
> the owner, 2026-08-22.

### What this can do — no wall, no new decision, ships as asked

- **A top 10 (and bottom 10) of closed positions, ranked by lifetime result.** Almost everything
  needed already exists: sorting holdings by windowed result, descending, is already the default
  view (`renderHoldings`); the *Closed* filter already exists (US-50). This is a **Closed +
  all-time-result, top/bottom 10** slice of a list the app already knows how to produce.
  **Rank by % return on money in, not €** — a €50 gain on a €100 position and a €4 000 gain on a
  €50 000 position are not comparable "lossporn"; % is what makes a top 10 across wildly different
  position sizes fair. Show € alongside, not instead.
- **Fully shareable, today's machinery.** The share sheet, the four `FORMATS`, the score-card model
  (US-54) and the anonymize state are all built. This is a new card *shape* — ten rows instead of
  one figure — inside the existing pipeline, not a new subsystem.
- **The "what if" sentence, against PROP, another held instrument, S&P 500, or any ETF —
  now that US-97 is decided.** The counterfactual needs a price series for whatever it is being
  compared against; US-97's fetch module (S&P 500, any typed ticker, PROP) is exactly that series,
  for exactly the same three kinds of entry. One function,
  `counterfactualValue(buys, priceSeries, fromDate, toDate)`, fed whichever series US-97's picker
  resolved, reused by both stories. **Sequencing, not scope, is the only thing left**: land US-97's
  fetch module first (even before its UI), and this sentence has everything it needs on day one.

  The arithmetic: for every buy in the closed position, grow its euro amount at the chosen
  benchmark's own return from that buy's date to the position's close date, and sum across the
  position's buys. Pure, and the same shape as `windowReturnPct` chained over a sub-range.

### What this deliberately cannot do — and won't, without a separate, named decision

- **A top 10 ranked by per-sale realized profit — "trades" read completely literally.** US-53
  already fought this exact fight and won it the hard way: this project **refuses to compute a
  per-sale realized gain**, because that needs a cost-basis convention (FIFO or average cost) it
  has deliberately never adopted, and `test/describe.test.js` **fails the build** if `engine.js`
  grows one. This is not a missing feature; it is a wall the project put up on purpose, twice
  (US-27 trap 1, US-53's AC0), because every trustworthy per-holding number on this page depends
  on no such convention existing. A literal "top 10 sales" would tear that down to rank a joke
  feature.
- **A live/serious market-index label for PROP.** Now that PROP sits beside S&P 500 in the same
  picker (US-97), it is a real, honestly-computed comparison — but it will never be presented as a
  benchmark in the financial sense (rule 6): the label always says it is the account's own holding.

### How to actually get "everything" — the honest path, not a workaround

**Most of "top 10 trades" is already inside "top 10 closed positions."** For the common case — one
buy, held, one sell — a closed position's lifetime result *is* the trade's result; the two only
diverge on a position built or unwound across several buys or partial sells, which is a minority
of most accounts' history. So shipping the closed-position version first is not a compromise
version of the ask; it is the ask, minus the one slice that needs a convention nobody has agreed
to yet.

**If literal per-sale ranking is still wanted after seeing that**, the path is not a flag or a
special case bolted onto this story — it is opening the option US-53 already named and left on the
table: **a new story that adopts a cost-basis convention (FIFO or average cost) as a SPEC-level
decision**, named, with its consequences written down, the same way the multi-broker amendment was.
That story, once and if it exists, is what a genuine "top 10 trades" — as opposed to "top 10
positions" — would be built on. Nothing here should reach for it quietly.

### Where honesty still applies, now that PROP is not hiding

The top-10 card is a **real** figure and, if Optimism Mode is on, renders under its rule that a
shared card always shows the real number, never the cheerful one (US-54 AC6) — that part is
unchanged. The "what if against PROP" sentence is no longer the joke-quarantine case US-35b/US-35d
built (that quarantine was for *invented* figures standing in for real ones); it is now a real,
correctly-computed comparison against a labelled curiosity, so it follows US-97's AC4 labelling
rule rather than a hide-from-export rule. What still must never happen is presenting it as if PROP
were a legitimate benchmark — the label carries that weight, not a quarantine.

### Acceptance criteria

- **AC1** Ranking uses each closed position's all-time result, never a per-sale figure; a test
  extends US-53's `describe.test.js` guard rather than adding a parallel one.
- **AC2** Ranked by % on money in, € shown alongside; ties break the way the holdings table
  already does (`name.localeCompare`).
- **AC3** The top-10 card renders through the existing share sheet at every `FORMATS` size, and
  obeys the existing anonymize state and Optimism Mode's real-number rule (US-54 AC6).
- **AC4** The "what if" sentence supports PROP, another held instrument, S&P 500, and any typed
  ETF — all through the one counterfactual function, all sourced from US-97's fetch module; no
  duplicate fetch path introduced here.
- **AC5** Any PROP-flavoured "what if" sentence carries the US-97 AC4 label ("your own holding")
  wherever it is shown or shared — never presented as a market benchmark.
- **AC6** A test proves the closed-position ranking and the literal per-trade ranking give
  identical results on a fixture with only single-buy/single-sell positions, and diverge only on a
  fixture with a partial sell — documenting exactly how much of "everything" is already covered.

### Stop condition

If € (not %) turns out to be what is actually wanted after seeing both, that is a one-line sort-key
change — take it back to the owner as a decision, do not ship both. If literal per-sale ranking
turns out to matter enough to justify a cost-basis convention, that is a new story with "cost
basis" in its title, opened deliberately — never smuggled in here as an edge case.

---

## US-100 — A "Compare to PROP" button on the total portfolio *(superseded by US-97, 2026-08-22 — folded in as a picker entry)*

> "Compare to prop knop op je totale portfolio." — then, the same call: "compare to prop mag als
> 'etf' optie naast dus compare to SP 500."

The first refinement recommended keeping this inside Optimism Mode's quarantine, on the reasoning
that a "Compare to PROP" button sitting beside a real "Compare to S&P 500" button would read as a
serious feature by its placement alone. **The owner decided the opposite, deliberately, after
seeing that argument** — PROP goes in the same picker as S&P 500 and any other ETF, as one entry
among several, not behind a separate gate.

This story's content — `counterfactualValue` applied to the account's own deposits against PROP's
own price series — now lives in US-97, as the third row of its "three kinds of entry" table, with
one adjustment the promotion requires: since it is no longer behind Optimism Mode's "never leaves
the machine" quarantine, it instead carries US-97 AC4's plain label ("your own holding, not a
market index") everywhere it is shown or shared. See US-97 for the acceptance criteria that now
cover this.

No number left this story that Optimism Mode's own PROP tiles do not also compute; folding it in
adds no new arithmetic, only a new, more visible place to read it from.

---

**Next free number: US-101.**
