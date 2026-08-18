# Status — one page

`docs/BACKLOG.md` is 2 000 lines of reasoning and evidence, which is the right place for *why* and
a bad place to find out *where things stand*. This is the index.

**Last updated after US-76 (unreleased).** It had been stale since 0.21.0 once, which is fifteen
releases — if it looks stale again, trust the CHANGELOG and fix this.

## Shipped and confirmed against a real account

| Story | What it did | Release |
|---|---|---|
| US-02 | Options valued with their contract size; reconciliation to the cent | 0.10.0 |
| US-04 | Exchange rates from DEGIRO's own conversions; GBX ↔ GBP | 0.10.0 |
| US-05 | Dissolved into US-03 — kept as tests, not a separate story | 0.10.0 |
| US-06 | "Results per" applies to every chart | 0.10.0 |
| US-08 | Compare specific months by clicking a cell | 0.10.0 |
| US-09 | A closed round trip no longer leaves shares behind | 0.10.0 |
| T-1 | Export allowlist, leak guard, `audit` refuses paths inside the repo | 0.11.0 |
| B11 | Contract size measured near an observed rate, not through a guessed one | 0.11.0 |
| US-12 | Drag across the value chart to zoom | 0.12.0 |
| US-13 | Candles on the cumulative result at Week and Month | 0.12.0 |
| S14 | Unrecognised API fields kept instead of dropped | 0.12.0 |
| US-14 | A result per holding, and how much of it is your own money | 0.13.0 · 0.22.0 |
| US-15 | The composition ranks on the whole history, not the window | 0.13.0 |
| US-11 | **Copy bug report** — every notice as pasteable JSON | 0.14.0 |
| US-16 | Palette measured, shape language ported, responsive, rem/clamp | 0.16–0.19 |
| US-19 | Five sections instead of one scroll | 0.21.0 |
| — | Back end audited: session 0→100 %, degiro 6→96 %, sync 40→86 % of functions | 0.20.0 |
| — | The sync button no longer gets stuck; every action button reports its failure | 0.24.0 |
| US-18 | Notices get a place of their own; nothing untrustworthy is dismissible | 0.25.0 |
| US-20 | The figures split across the sections they belong to | 0.25.0 |
| — | An "i" on every figure; light / dark / auto | 0.26.0 |
| — | A one-cent conversion used as an exchange rate — **found by a tester's bug report** | 0.28.0 |
| US-21 | What moved, currency exposure, uninvested cash over time | 0.29.0 |
| US-22 | Multi-broker plumbing, with the single-broker path running through it | 0.30.0 |
| — | 502 on accounts not on the default cluster — a cached base URL | 0.30.1 |

## Shipped, awaiting your confirmation

**On `main`. Built, tested by the suite and in a browser, not yet run against a real account by a
person.** This is the gate that is open.

| Story | What it did | Release |
|---|---|---|
| US-27 | Profit and loss per product, including what you no longer hold | 0.31.0 |
| US-28 | The transaction history, on the page | 0.31.0 |
| US-29 | Price and average paid as columns, not a second table | 0.31.0 |
| US-32 | Nederlands, with a flag beside the theme switch | 0.32.0 |
| US-31 | Annualised return, money-weighted and time-weighted, behind a toggle | 0.33.0 |
| US-30 | Year by year, with the opening year as a partial period | 0.34.0 |
| US-33 | Outlook — one, three or five years, scenarios from your own history | 0.35.0 |
| — | Every stage that loads or processes can report its own failure | 0.36.0 |
| — | F1–F5 from five testers' accounts — see below | 0.37.0 |
| — | F6–F9: the projection, and a losing holding that reported no loss | 0.38.0 |
| US-35 | **Put that frown upside down** — Optimism Mode on the Overview | 0.39.0 |
| — | U1, U2, U4, U5 resolved; the Result percentage; the version in the header | 0.39.0 |
| US-46 | **Anonymize** — every amount and quantity masked by replacement, every percentage kept. The mask lives inside the formatters, so a money field added later is masked because it had to call one to be money | 0.44.0 |
| US-47 | **A shareable card per position.** Drawn, never a DOM capture; no network; provenance instead of a badge | 0.44.0 |
| US-48 | **The Asteria mark behind the tables and charts**, drawn in the padding rather than under the series | 0.44.0 |
| US-51 | **A dollar price is no longer printed with a euro sign** — the traded price renders in the currency it was traded in, at four decimals, and Amount is the cash flow | 0.45.0 |
| US-16 | **The interface, rebuilt** — left rail and routes, one hero figure and three facts per section, a period control that actually recomputes, real chart heights, and an axis that admits when it does not start at zero. Eight phases, `docs/RETIRED.md` as the ledger | 0.46.0 |
| US-49 | **One table per position, not two.** Holdings and profit-and-loss-per-product merged, keeping the paid-in-vs-grown bar and the per-product dividend; every all-time column declares itself | 0.46.0 |
| US-50 | **The snapshot line starts at the buy and ends at the close.** One pure `positionSpan` clips the series, the period *and* the percentage's basis, so a windowed result is no longer divided by an all-time `paidIn` | 0.46.0 |
| US-47+ | **The share sheet** — four shapes, light or dark, amounts off by default, and a name the sharer chooses from four sources. Download beside the clipboard | 0.46.0 |
| US-35d | **Optimism Mode draws two different charts** rather than deforming the real one — *Belief in PROP* (conviction index, in points) and *What PROP still owes you* (upside remaining, in euros). `flipSeries` is gone | 0.46.0 |
| US-17 | **A renamed DEGIRO field is now loud.** `pick()` tallies which candidate name carried each value; a load-bearing field absent on ≥95 % of rows raises a red banner naming it, and the bug report carries the per-field shares — which is also the measurement that lets `parse.js` stop guessing | 0.46.0 |
| US-59 | **The card's small print is readable at the size it gets posted.** The ramp is a fraction of the card's width, so the four shapes are four crops of one design, and the floor is measured at the width a chat renders. It also exposed a second defect: the footer's joined line overran and truncated the reconciliation verdict to `DOES NOT rec…` | 0.47.0 |
| US-60 | **The popup speaks Dutch and carries the redesign.** Every string through `t()`, sync progress translated by phase, one hero and three facts at 320 px, one primary action | 0.47.0 |
| US-52 | **Paid in vs grown travels with the card**, from a `splitModel` both the card and the holdings table call. Moving it exposed a bar segment 400 % wide that only the table's clipping hid | 0.47.0 |
| US-54 | **A share button on every figures block, and a chartless score card.** The tile's own strings, so anonymize is inherited; the real figure even with Optimism Mode on | 0.47.0 |
| US-62 | **The chart readout says when a day's price was estimated.** Most of the story already existed via Chart.js; this is the honesty marker it was missing | 0.47.0 |
| US-55 · US-63 | **The drag on the value chart has physics** — velocity handoff, momentum projection, rubber-band, interruptible, reduced-motion aware. `src/ui/motion.js` is the one motion vocabulary | 0.47.0 |
| US-64 | **A section arrives instead of cutting** — transform and opacity only, interruptible, nothing locked out | 0.47.0 |
| US-65 | **A changed figure swaps, never counts up.** Measured: each changed figure showed exactly two strings across every frame | 0.47.0 |
| US-56 | **Three accessibility preferences, two of which had never been asked**, plus a press that is dragged away from stops looking pressed | 0.47.0 |
| US-58 | **The type scale is size-bucketed and measured** — `npm run type`, wired into `npm test` | 0.47.0 |
| US-57 | **The share sheet arrives as an object** — materialize on open, the same path backwards on close, and the four shapes as a strip you can flick | 0.47.0 |
| — | **Two defects found by the browser passes**: the chart readouts had no translations at all (the same gap US-60 found in the popup), and `npm run palette` identified the dark theme as the last `:root` block in the file | 0.47.0 |
| US-66 | **Click and drag are told apart by the hand, not the history.** Eight pixels of travel, checked before the momentum — a twitch carries a velocity, and the projection turned it into a throw. Plus the `touch-action` the canvas never had | 0.47.0 |
| US-67 | **A hover affordance is an enhancement, not the usable state.** The row share button no longer sits at 45 % forever on a touch pointer, and the 🙃 tap no longer leaves the button rotated | 0.47.0 |
| US-68 | **Reduced motion names what stops.** A property allowlist instead of forcing every duration to zero, which had also silenced the colour change that says a press registered | 0.47.0 |
| US-69 | **Two durations and one curve, named once.** The second curve the story asked for is deliberately *not* defined — nothing in this build travels across the screen, and a token with no caller is deleted | 0.47.0 |
| US-70 | **The overlays come from the control that opened them**, closing shorter than opening, with `@starting-style` and `allow-discrete` so no timer decides when a surface is gone | 0.47.0 |
| US-71 | **A chart a screen reader can read.** Every canvas carries `role="img"` and a sentence generated from its own series, in three shapes rather than thirteen; the four figure-carrying charts have a table twin | 0.47.0 |
| US-72 | **The end of a line, without hovering** — one endpoint dot and label, clamped inside the plot | 0.47.0 |
| US-73 | **A notice opens its own row** instead of shoving the figures below it, twice per notice, while you are reading them | 0.47.0 |
| US-74 | **The theme change is a cross-fade**, and the canvases fade in on the new theme rather than snapping inside a page that does not | 0.47.0 |
| US-75 | **Data arrives per card**, once per sync and never per render, as a mask over a drawing Chart.js already finished | 0.47.0 |
| US-53 | **Decided (b): no split on a sell row.** Option (a)'s arithmetic was sound and answered the wrong question — the bar is the position's state, not the trade's, and a figure needing a label to correct the reading it invites has already failed. The ledger says where the split does live; a test now fails the build if the engine grows a cost-basis field | 0.47.0 |
| US-61 | **The Positions table fits its width.** Columns-as-data: the lowest-priority ones drop as the table narrows and fold into a per-row expand, the load-bearing four (Instrument, Value, Paid in vs grown, Result) never drop, and a **Columns** chooser hides the rest, remembered like the theme. Browser-verified desktop→phone, no sideways page scroll; display only, no resync | 0.47.0 |
| US-76 | **A card and its own table row now report the same result.** Three faults on closed and partly-sold positions: the card's span stopped the day before the sale, so it dropped the sale's own P/L — enough to flip a sign; the percentage divided by the money *still* in a position rather than what went in, which also fixes the table's **% of bought** dividing a windowed result by all-time buying; and a paid-in-vs-grown bar was drawn for positions worth nothing. Display only, no resync | Unreleased |
| US-77 | **The card's line keeps its worst day.** The sparkline sampled every n-th day, so a position's peak and trough survived by luck — 5–14 % of the range gone on the demo account, invisible because the line normalises to its own extent. Min/max decimation at the same 48-point budget | Unreleased |

**What to look at first**, if you only look at one thing: the Notices tab after a sync. 0.36.0 made
background failures visible for the first time, so if something has been quietly failing for weeks
it will appear there now and nowhere else.

## From five testers' accounts — see [FINDINGS-TESTERS.md](FINDINGS-TESTERS.md)

Five real accounts in one evening, five defects, none of which the synthetic fixtures produce.
F1–F5 shipped in 0.37.0, F6–F9 in 0.38.0. U1–U5 need a decision rather than a fix.

| # | What | State |
|---|---|---|
| ~~U1~~ | **Done, 0.39.0.** Valued through the rate its own trades state; one observation or contradictory ones are refused and still reported | — |
| ~~U2~~ | **Bounded, 0.39.0.** The warning now states the share of today's total riding on the stale rate | — |
| U3 | One account is **5,8 %** out — different in kind from the rest | Blocked on a fresh 0.37.0 report, which now carries the ratios that would say |
| ~~U4~~ | **Done, 0.39.0.** Called estimated rather than measured, and counted | — |
| ~~U5~~ | **Done, 0.39.0.** Each says what it counts | — |

## Unmerged work sitting on branches

Found in the 2026-08-18 branch audit (23 `claude/*` branches; the rest were merged or duplicated
`main` and are being deleted). These five carry work `main` does not have. **A branch is not a
backlog** — a story on a branch nobody can see is how US-66 and US-76 each got claimed three times;
the numbering repair and the rule are in [BACKLOG.md](BACKLOG.md), *Refinement after 0.47.0*.

| Branch | What it carries | State |
|---|---|---|
| `claude/paid-vs-grown-discrepancy-rk40yw` | **US-76 + US-77 built**: the card and its table row agreeing, and the card's sparkline keeping the days that matter. Code + tests, on top of 0.47.0 | Ready to merge |
| `claude/v47-bug-2jcvd3` | Popup sparkline destroyed before repaint (a leak), on top of 0.47.0 | Ready to merge |
| `claude/bug-report-pbvnjs` | A 0.46.1: *Today* uses DEGIRO's own live day result, not the ragged reconstructed edge. `parse.js` + `app.js` + tests | Stranded 27 commits behind — needs a rebase onto 0.47.0 and a re-versioning before it can land |
| `claude/multi-broker-build` | US-45 built (parameterised session read) plus a 0.44.2 fix that `main` later got as US-50 | US-45 is real and unmerged; the rest is duplicate. Salvage the one commit |
| `claude/apple-fluid-poc` | `docs/prototypes/apple-fluid.html` — the validated US-55…58 prototype the backlog already cites | Imported to `main` in the same commit as this table; branch can go |

## Refined, not built

Complete as of the 2026-08-18 consolidation — every open story number appears either here, in
*Unmerged work* above, or in *Parked*.

| Story | State | Waiting on |
|---|---|---|
| US-81 | **Locate the five cents** — the −0,05 reconciliation gap on the owner's emptied account. A locator, not a fix: name the anchor, size the gap when DEGIRO's total is 0, attribute the residual across cash categories | Nothing — and it decides whether the gap is our ledger or DEGIRO's `totalCash` field |
| US-78 | The share sheet's shape strip shows one of its four shapes | Nothing |
| US-79 | Disconnect and freeze: throw the token away, keep the numbers | Nothing |
| US-80 | The test suite spends ~31 s of its 55 s asleep in real `setTimeout` backoffs — `mock.timers` fakes the clock without touching `degiro.js` | Nothing |
| US-35b (tiles) | The replacement Optimism tiles ("847 days of unwavering belief") — the charts half went via US-35c/US-35d, the tiles were never built | A decision that the joke is still wanted |
| US-26 | Instrument coverage declared per broker — verified / assumed, as a vocabulary | More relevant once a second broker lands |
| — | **A price series was rescaled by factor 4,369**, which is not a split ratio. Investigation: one factor across two regimes, or a vwd id that changed instrument. Do not tune the threshold | Nothing |
| US-37 | **Trading 212 R1 — PASS, measured 2026-08-13.** Page 200/401, logged out 401, and the service worker `PASS_JSON` with only an `Accept` header — so no device identifier is required either | Nothing. **US-39–US-45 are unblocked** |
| US-44 | **Trading 212 renders through the existing pipeline** — no separate dashboard | Gated on US-37 and the data gates. Addendum body not yet received |
| US-45 | Parameterise the session read — R1 has cleared, and an implementation already exists on `claude/multi-broker-build` (see *Unmerged work* above) | Salvaging that commit |
| US-39–43 | Multi-broker delivery sequence from an external brief | All gated on US-37 |
| US-34 | **Trading 212 — the spike is finished.** R1 through R5 are all answered: the price history is public and needs no account (daily candles to 2017), and R1 passed on 2026-08-12/13. Nothing in this row is open | Nothing. What is left is the *build* — US-39–US-45 — and the account **payload shapes**, which are still marked `hypothesis` in `tools/trading212-r1/spike.js` because no one has seen them in a Network tab |
| US-36 | **Interactive Brokers — phase 1 has begun.** One DevTools capture shows an ordinary session-backed portal: its own bundle, a 25 kB portfolio payload, a repeating `tickle` keep-alive and a `202` long-poll. See [MULTI-BROKER.md §9](MULTI-BROKER.md) | **The decisive test**: one portfolio request re-run with `credentials: 'include'` and with `'omit'`, both statuses. That decides R1 and nothing else does |
| — | An architecture report + multi-broker proposal, for an external agent. Brief at `docs/COPILOT-ARCHITECTURE-BRIEF.md` | Nothing. Hand it over with the repo |
| US-23 | Sync and wipe, per broker | Deliberately deferred (rule 8) — a second broker existing |
| US-24 | Combine, and filter | Same. The arithmetic is proven and tested; the UI is not built |
| US-25 | Two accounts under one login | A spike, not a story. Cheap *after* US-22, which has landed |
| US-03 (2nd half) | Expiry, strike, call/put from data rather than a name string | A real HAR |
| US-07 | Options & margin dashboard — the margin half drops if it is not in the response | A real HAR |

## Parked

| Story | Why |
|---|---|
| US-10 | **Trade Republic.** Parked at the user's instruction, 0.30.0. R1 is *readable yes, sendable unknown*; three earlier conclusions in `MULTI-BROKER.md` §2 were retracted as drawn from samples too small to carry them |

## Still unexplained

Not blockers, and not forgotten either.

| # | What | Impact |
|---|---|---|
| B1 | Does `products/info` return `contractSize`? | None — measuring it is the more robust route anyway |
| B7 | Flag sparse FX gaps, or fetch a real FX series? | A rate unobserved for a quarter is already flagged |
| B10 | Does DEGIRO book a split as a transaction pair? | Bounded — the rescaled instruments are all closed |
| — | `price-scale-adjusted` factor 4.369 on one account | Bounded, same reason. Would need an account that still holds one |

## Out of scope, decided

SPEC §7 stops at phase 7: no multi-account, no benchmarks, no tax reporting, no Chrome Web Store.
Rule 9 puts any broker whose data cannot be reached from an already-logged-in tab out of scope —
that is a product promise, not a preference, and it decides spikes rather than being weighed
against them.
