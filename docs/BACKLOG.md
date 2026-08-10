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

#### What is deliberately not in scope

One extension holding two brokers at once. Two accounts, two sets of instruments, two currencies
of record, and a combined total nobody can reconcile against anything. SPEC §7 already stops at
one account; this stops at one broker per install until there is a reason.

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
