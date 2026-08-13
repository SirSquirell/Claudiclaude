# What five testers' accounts found

One evening, five real accounts, 0.36.0 and 0.37.0. Everything here came from a bug report or a
screenshot — no export was copied, no value from a real account has entered `test/`, and accounts
are numbered rather than named (CLAUDE.md rule 7).

The synthetic fixtures had found none of these. That is the finding behind the findings: five
accounts in one evening produced more than five days of generated data, because the failures are
in the *shapes DEGIRO actually sends*, not in the arithmetic.

## The accounts, in one table

| # | Days | Tx | Cash rows | Products | Types | Currencies | Reconciliation |
|---|---|---|---|---|---|---|---|
| 1 | 2 242 | 871 | 5 907 | 149 | ETF, STOCK | CAD EUR HKD SEK USD | **absent** |
| 2 | 2 018 | 89 | 655 | 21 | STOCK, ETF | EUR USD | off by 0,42 % |
| 3 | 2 113 | 488 | 2 734 | 53 | STOCK, **LEVERAGED**, ETF | EUR USD | off by 0,60 % |
| 4 | 2 239 | 316 | 1 102 | 20 | STOCK, ETF, **OPTION** | EUR USD | off by **−5,8 %** |
| 5 | — | — | — | — | — | — | absent (same shape as 1) |

---

## Fixed in 0.37.0

### F1 — A percentage with nothing to be a percentage of · **shipped**

Account 2 showed **+291 949,64 %** as its all-time result and **−60 006,26 %** as its worst month,
next to a perfectly ordinary +19,64 % best month. The year table showed 2025 opening at **€ 0,03**
and returning **−101 275,55 %** beside a correct result of +€ 8 846,09.

The two numbers come from the same days, and that is the whole diagnosis: a deposit is booked on
one day and the value moves on the next, so `pnl` carries −12 000 and then +12 000. They **cancel
in a sum** — the euro result was always right — and they **destroy a product**, because the first
is divided by three cents.

The chain guarded only against `prev > 0`, which excludes a day that began with nothing and admits
one that began with two cents. A day's result now has to fit inside what was invested at the start
of it, or it leaves the chain — the standard treatment, and the only honest one, since a cap would
invent a number.

### F2 — The acceptance test was absent on two accounts out of five · **shipped**

Accounts 1 and 5 reported `reconciliation: null`, both listing the same fourteen `totalPortfolio`
field names — every one a cash figure, none of them net liquidity. So rule 6's check could not run
at all, on the two longest histories with the worst price rescales.

It runs now, against the sum of the position values and the cash balance DEGIRO *does* send. Not
circular — DEGIRO's prices and share counts against our reconstruction — and weaker in exactly one
way, so it is labelled `derived` in the result, the report and on the page.

### F3 — Three warnings that reported only their name · **shipped**

`price-series-mismatch` (the most severe the engine raises), `fx-stale` and
`unclassified-cash-rows` were all appearing in `unclassifiedWarningCodes` — the mechanism working,
and the gap being real. All three now carry their finding.

`unclassified-cash-rows` deliberately carries only a count: the wording is what would fix the
classifier, and a description reads "Dividend ASML", so it names a holding. **This warning can say
a row was missed but not which rule to add**, and that limit is now written down rather than
discovered.

### F4 — "A difference in prices" when no price differed · **shipped**

Accounts 2 and 3 arrived off by half a percent with **every** share count agreeing and **zero**
instruments disagreeing — and were told the difference was in prices, which sent the reader looking
in the one place it demonstrably was not. It now names the cash balance, and the report carries
`cashShare` and `residualOverCash` so the next report can confirm it. Ratios, so no amount travels.

### F5 — A trade booked in euros that did not settle for its euro amount · **shipped**

Account 4's export showed rows reading `currency: "EUR"` whose `totalBase` was **0,851** of
`price × quantity`. That is not rounding, it is the dollar rate of the day, on trades nothing had
marked as foreign. Others sat at 0,907–0,914 — the dollar rate of *their* day.

`parse.js` fills in `'EUR'` when DEGIRO sends no currency, so either the field was missing or it
does not describe the amount beside it. The engine now checks the identity that must hold for a
domestic trade — `|totalBase| − |fee| = |price × quantity|` — and raises an **error** when it does
not, because a holding treated as domestic when it is foreign is valued without conversion.

This one is a detector, not a cure. See U1.

### F6 — Eight overlapping windows counted as eight observations · **shipped 0.38.0**

The projection slides a five-year window one month at a time, so 5½ years of history yields eight
windows sharing 59 of their 60 months. `MIN_WINDOWS = 3` passed trivially and the result was called
`historical`. The caption already said *"treat 8 as fewer independent observations than it looks"* —
the code knew and did nothing. One account rode that to a forecast of **€ 89 million** on a
portfolio worth thirty-three thousand.

Now gated on `floor(months / horizon)`: the genuinely separate stretches. Most accounts move from
`historical` to `illustrative`, which is what they always were.

### F7 — "I set them" did not · **shipped 0.38.0**

`expectedAnnual` read `basis === 'historical' ? median(outcomes) : total`, so a typed growth rate was
discarded for all three lines on any account with enough windows. Only the yield survived; the
control was a decoration. A tester set growth to 100 % and watched nothing move.

The typed rate is now the middle line, and the account's observed dispersion is **recentred** on it
rather than replaced — the spread is real information about that portfolio and worth keeping.

### F8 — A rate that is not a market outcome now draws nothing · **shipped 0.38.0**

Several hundred percent a year is not a forecast, it is an account whose measured history is
dominated by deposits landing a day out of step with the trades they paid for. The section says so
and stays empty; the reader may still set the rates themselves. **Refusing beats clamping** — a clamp
invents a number.

### F9 — A losing holding reported that it had lost nothing · **shipped 0.38.0**

The holdings bar read *"100 % paid in · 0 % lost"* beside a result of −€ 766. Both shares were scaled
by whichever of paid-in and current value was larger and then clamped to 100, so under water the
paid share pinned at 100 and nothing was left for the loss. The comment directly above the code
described the correct behaviour; the code did the opposite.

Reported by the user from a tester's screen, with the right diagnosis attached: when you are down,
your money is *more* than 100 % of what the position is worth. The bar is now scaled to what was
paid in.

---

## Not patched — these need a decision, not a fix

### U1 — Decide an instrument's currency instead of defaulting it · **story**

F5 detects the disagreement. It does not resolve it, and resolving it is a real change:

- `parse.js` defaults `currency` to `'EUR'` in three places. CLAUDE.md is explicit that the
  candidate-field fallbacks are provisional and get **deleted** once a real capture confirms the
  shape — five captures now exist.
- The settled amount is evidence of its own: `|totalBase| − |fee|` over `|price × quantity|` is the
  rate, on a known date, for that instrument. That is exactly how `deriveFxRates` works already.
- **The decision is what to do when they disagree.** Trust the field, trust the arithmetic, or
  refuse and mark the instrument `UNKNOWN`. The third is the rule-4 answer and the most likely
  right one, and it changes numbers on somebody's screen, so it is not a patch.

### U2 — A stale exchange rate is reported and never bounded · **story**

Every account holding a foreign currency reported `fx-stale`, with gaps of **358, 980, 1 160, 1 275
and 1 746 days**. Between observations the rate is a straight line, and a straight line across
nearly five years is a guess with a confident face.

The suspicion worth testing, once F4's ratios come back from a report: this is where the 0,4–0,6 %
residual on accounts 2 and 3 lives, since every position agreed and only the cash could carry it.
Foreign cash valued at a rate years out of date is exactly that shape.

Options, none of them free: bound the error and show it; interpolate against a real FX series
(SPEC §2.2 said this would be needed and FX has so far avoided it); or refuse to value foreign cash
older than some gap and say so.

### U3 — Account 4 is 5,8 % out, and it is the only one that big · **story**

`ratio: 0.941821`, `positionsAgree: true`, `instrumentsDisagreeing: 1`, one held position, one
instrument with no price series, one OPTION at contract size 100. Different in kind from the
half-percent pattern, and the leading candidate is F5's currency problem on the instrument that
dominates the account. **Blocked on a fresh report from 0.37.0**, which now carries the ratios that
would say.

### U4 — A rescale factor measured from trades that disagree by 60 % · **story**

Account 3 rescaled an instrument by **0,223** with a spread of **1,6** — the trades behind the
factor disagreed by sixty percent. `MAX_FACTOR_SPREAD` is 5, so it is comfortably accepted, and the
factor is applied to the whole series.

0.29.0 already fixed the *lie* in a neighbouring case, where a row reported `anchored: false` and
`verdict: 'measured'` side by side. This is the same shape one level down: a factor is either
measured or it is not, and a 60 % spread is not a measurement. The question is where the line
between `rescale` and `reject` belongs, which needs more than one account to answer.

### U5 — Two counts that look comparable and are not · **small, still a decision**

Account 1 reported `no-price-series: 24 instruments` and `missingPriceSeries: 1` in the same
report. They measure different things — products that never had a series, against series this sync
failed to fetch — and nothing says so. A reader compares them and concludes one of them is wrong.

Rename, or state both in one place with their definitions.

---

## What this says about the fixtures

`fixtures/` is synthetic and has been since the start, and `docs/ENDPOINT-REPORT.md` records
exactly what is and is not evidence. Five accounts in one evening found five defects that the
generator does not produce, and every one is a **shape** rather than an arithmetic error:

- an account that opens at three cents and sits there for three years
- a `totalPortfolio` with fourteen cash fields and no total
- a trade whose stated currency contradicts its own settled amount
- an exchange rate with two observations five years apart
- a rescale factor whose evidence disagrees with itself

The generator makes healthy accounts. The engine is tested against healthy accounts. **The next
useful thing the fixture generator could do is produce unhealthy ones** — which is `B11`'s lesson
from earlier in this project, where making the fixtures "realistic" quietly stopped reproducing the
hard case and the defect looked fixed.

---

## From a 0.38.0 report and its export — F10, F11, F12

One account, three findings. The report alone was enough for none of them; the export settled all
three, which is itself the second finding.

### F10 — every incremental sync failed, and the advice made it come back *(fixed, 0.44.1)*

> *"Storage changed during the sync: stored 3 transactions and 17 cash movements, but rebuilt from
> 89 and 655. Press "Wipe & resync" and let it finish without interrupting it."*

Nothing was wrong with the account. `fromDate` is the watermark, so an incremental sync fetches one
window — three transactions — while `recompute` reads the whole history back — eighty-nine. The
tripwire demanded those two be **equal**. That holds on a first sync and never again.

The cruelty is in the remedy it offered. A wipe *does* make the error go away, because a full resync
fetches everything and the two numbers match again. So the advice looked sound, the user
re-downloaded five years of history, and the error returned on the next sync. Every day.

**Fixed** by asserting what the guard actually wanted: the store must contain **at least** every row
this run wrote. A wipe landing mid-sync still trips it; a normal Tuesday does not.

**And it was hiding a second fault.** The old guard fired on the count mismatch that an all-empty
fetch produces, so a sync where every window failed did fail — for the wrong reason, with the wrong
message. Removing the accident made the real gap visible: `fetchWindowed` turns an unservable window
into a reported gap rather than an exception, which is right, but when *every* window fails the run
reached `derive` with an empty array and no error at all. Now a source emptied by gaps is a named
failure, and it says the stored history is untouched.

### F11 — the report said how many instruments disagreed, never how *(fixed, 0.44.1)*

The reconciliation was out by **0.98 %**, with `instrumentsDisagreeing: 10`. That pair is a symptom
with at least three causes and the report could not narrow it.

The export carries `attribution`, and it settled it in one line: **nine instruments at about 1.005,
and one at 1.105.** Two faults, not one — a stale exchange rate lifting every foreign position by
half a percent, and a single instrument priced ten per cent wrong. One instrument accounts for
**56 % of the entire gap**. Read as a single 0.98 % the obvious move is to go looking at the cash,
which is where this began and where the answer was not.

`reconciliation-failed` now carries `perInstrument`: the ratios, unnamed, sorted by distance from 1,
capped at twelve. A ratio is not an amount and a rank is not a name, so this travels under rule 7
where `attribution` — instrument names and euro values — never could.

### F12 — the connection check fails on a step the real sync passes *(open)*

Diagnostics reported **`Failed at step: chart — No price series came back for these ids`**, 0 of 5
series. The same account's sync had all 21 series, and the report says `missingPriceSeries: 0` and
`heldWithoutPrices: 0`.

`products-info` on that account returns `identifierTypes: ['vwdkey', 'issueid']`, and `config.js`
already documents this exact trap: a `vwdkey` instrument requested as `issueid:` silently returns no
series. The sync passes the type; the diagnostics probe appears not to.

So the whole connection check reports `ok: false` on an account whose connection is fine. A
diagnostic that cries wolf is worse than no diagnostic — it is the one screen a user consults when
they already suspect something is wrong.

**Not fixed here** because it needs a logged-in browser to confirm the probe is what differs rather
than an intermittent upstream.

### Two smaller notes

- **The single `UNKNOWN` cash row is not the reconciliation gap.** It is `1.7e-7` of all cash
  movement by magnitude. It should still be classified, but it explains nothing, and the report
  placing it next to a failed reconciliation invites exactly that inference.
- **Diagnostics look at twelve months; the report counts all history.** The check said "every cash
  movement was classified" while the report said one was not — both true, of different windows. Two
  screens disagreeing about the same account is worth one sentence of wording.
