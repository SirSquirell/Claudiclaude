# Status — one page

`docs/BACKLOG.md` is 2 000 lines of reasoning and evidence, which is the right place for *why* and
a bad place to find out *where things stand*. This is the index.

**Last updated at 0.46.0.** It had been stale since 0.21.0, which is fifteen releases — if it looks
stale again, trust the CHANGELOG and fix this.

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

## Refined, not built

| Story | State | Waiting on |
|---|---|---|
| US-52 | **Share any figure, not only a position.** One share button on the figures block, then pick which tile it draws. The Daily P/L figure already exists — only the sharing is missing | Nothing. Refined 0.47 |
| US-53 | **Paid in versus grown, on the share card.** The bar the positions table has had since US-49, on the thing that actually gets posted | Nothing. Refined 0.47 |
| US-54 | **The card's small print is unreadable** at the size a chat renders it. Type inside a card must be a fraction of the card, not of the page | Nothing. Defect, measured |
| US-55 | **The popup has no translations at all** and none of the redesign's language. The Dutch half is a defect, not a style question | Nothing. Refined 0.47 |
| — | **AMC's series was rescaled by factor 4,369**, which is not a split ratio. Investigation, not a story: the fix depends on what it is | Nothing. Do not tune the threshold to one account |
| US-37 | **Trading 212 R1 — PASS, measured 2026-08-13.** Page 200/401, logged out 401, and the service worker `PASS_JSON` with only an `Accept` header — so no device identifier is required either | Nothing. **US-39–US-45 are unblocked** |
| US-44 | **Trading 212 renders through the existing pipeline** — no separate dashboard | Gated on US-37 and the data gates. Addendum body not yet received |
| US-45 | Parameterise the session read (`session.js:19`) — renumbered twice | Deferred until R1 clears — rule 8 |
| US-39–43 | Multi-broker delivery sequence from an external brief | All gated on US-37 |
| US-34 | **Trading 212 — the spike ran.** R2, R3, R4, R5 answered; the price history is **public and needs no account**, daily candles back to 2017 | **One question left**: can the account data be reached without storing a credential? Rule 9 decides the story on it |
| US-36 | **Interactive Brokers** — spike not yet run. Brief at `docs/IBKR-SPIKE-BRIEF.md` | Phase 0 is public documentation and needs no account |
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
