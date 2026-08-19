# Status — one page

`docs/BACKLOG.md` is 2 000 lines of reasoning and evidence, which is the right place for *why* and
a bad place to find out *where things stand*. This is the index.

**Last updated at 0.53.0.** It had been stale since 0.21.0 once, which is fifteen
releases — if it looks stale again, trust the CHANGELOG and fix this.

## Light scan, 2026-08-18

A routine sweep, not an audit: branches, an export/rule-compliance spot-check, and a browser design
pass. One thing fixed, nothing else open.

**Branches.** All 19 remaining remote `claude/*` branches plus `poc` were checked against `main` by
commit count. `claude/eager-cannon-islvb3` (1 commit ahead) turned out to be a previous run of this
same scan, stranded on its own throwaway branch — the branch-per-session problem CLAUDE.md's
*Branches* section describes, happening again live. Its one finding, the `0.46.1` Today-live-day-result
fix, is already on `main` (STATUS's own *Unmerged work* section confirms this). The two large outliers,
`claude/multi-broker-poc` (90 ahead) and `claude/portfolio-visualization-testing-xs5ck4` (22 ahead), are
not real unmerged work: diffed against `main` they are thousands of lines *behind* on files `main` has
since rewritten (`app.js`, `styles.css`, `charts.js`), i.e. old pre-rewrite snapshots whose content
already shipped through different commits. Every other branch is 0–3 commits ahead and either an empty
diff or superseded docs. **No unmerged story found.** The stale branches still can't be deleted from
here — this environment's git proxy refuses it, same as before — so they're GitHub-UI cleanup, not
code.

**Rule compliance / security.** Spot-checked the export allowlist (`store.js`'s `EXPORTABLE_META` is
still default-deny), `throttledFetch` (still the one queue, still no 401/403 retry), `session.js`
(still reads the cookie and persists nothing but the derived IDs), `engine.js` (still no `fetch`/
`chrome.*`/`indexedDB`, the two `new Date()` calls are output metadata, not inputs), `innerHTML` call
sites in `src/ui/` (all pass account-derived strings through `esc()`), and console output (no session
id, cookie or token logged anywhere). Nothing found.

**Design pass** (`apple-design` skill, browser-verified at 1440/380 × light/dark via Playwright — no
page errors, no horizontal overflow anywhere across all seven sections). One real inconsistency:
**`cashChart`'s x-axis rendered raw ISO date strings** (`2021-01-31`, `2022-09-30`, …) while every
sibling chart on the same page abbreviates (`jan 21`, `sep 22`) via `dayTickFormatter`. `valueChart`,
`compositionChart`, `investedVsValueChart` and `singleSeriesChart` all set
`opts.scales.x.ticks.callback = dayTickFormatter(days)`; `cashChart` was the one chart builder that
never did. One line added (`src/ui/charts.js`), verified in-browser before and after, no test exists
for Chart.js tick rendering (consistent with how the other four builders are covered — display only).
`npm test` (543/543), `npm run palette` and `node tools/check-leaks.mjs` all clean after the change.
No other visual defect, translucency, or depth violation found against `docs/redesign/DESIGN-BRIEF.md`
§8's one-flat-container-depth rule.

**Optimization.** `auditSeries` and `fallbackFromTrades` in `engine.js` each rescan the full
`transactions` array per product (O(products × transactions)) when the grouping they need
(`qtyByProduct`-style, keyed by `productId`) is already built once, two hundred lines below, for
other purposes. Not user-visible yet, and not a rewrite to attempt mid-scan against the pure
engine's own testability claim — refined as **US-83** in `docs/BACKLOG.md` instead.

No new broker surfaced worth scoping — the multi-broker sequence's blocker is unchanged from the table
below (a Trading 212 Network-tab capture, which this environment cannot produce).

## Unattended build — US-39 … US-45, on `main`

`docs/US-39-45-BUILD-ORDER.md` is the contract: one story per run, in the order that table gives,
not the brief's numbering. **Its "never push to `main`" rule is superseded** by the branch policy the
owner set on 2026-08-18 (CLAUDE.md, *Branches*): `main` and one `poc`, nothing else. The rule it
replaces was about not landing half a story unreviewed, and *one story per run, green tests, its own
commit* is what actually delivers that.

**Why story 2 has not started, stated once so nobody re-derives it.** US-41 namespaces every stored
row by broker, and its only consumer is a second broker. That broker cannot be built: US-40's
transactions endpoint, its dividend vocabulary (58 types) and its cash-movement wording are all
unmeasured, and the build order's own stop condition for it is *"an endpoint needs anything the R1
probe did not send"*. Building the namespacing first would be an abstraction with one implementation
that does not exist yet — rule 8, the same reason US-23 and US-24 are deferred. **What unblocks the
sequence is a Network-tab capture of a logged-in Trading 212 account**, and nothing in this repository
can produce it.

| # | Story | State |
|---|---|---|
| 1 | US-45 — Parameterise the session read | **Done**, 2026-08-16. `readSessionId` and `resolveSession` now take `{host, cookieName}`, defaulting to DEGIRO's; `brokers/degiro.js` supplies them explicitly instead of `session.js` assuming them. No import from `session.js` changed shape, the existing `test/session.test.js` passed unmodified, and `npm test` is 393/393 |
| 2 | US-41 — Storage namespacing | **Next** |
| 3 | US-40 — The Trading 212 adapter | Not started |
| 4 | US-42 — Multi-broker sync and reconciliation | Not started |
| 5 | US-44 — Renders through the existing pipeline | Not started |
| 6 | US-39 — Broker management UI | Not started |
| 7 | US-43 — Release hardening | Not started |

No CHANGELOG.md / WHATS-NEW.md entry for story 1: it is an internal refactor with no observable
behaviour and no shipped version, same treatment as the US-37/US-38 spike and the US-46/47/48 pure
modules before it — a version bump happens at a release commit that bundles stories, not at every
one of them.

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
| US-83 | The engine groups transactions by product once, instead of rescanning the list per product; the cash chart's axis formats its dates like every other chart | 0.49.0 |
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
| US-76 | **A card and its own table row now report the same result.** Three faults on closed and partly-sold positions: the card's span stopped the day before the sale, so it dropped the sale's own P/L — enough to flip a sign; the percentage divided by the money *still* in a position rather than what went in, which also fixes the table's **% of bought** dividing a windowed result by all-time buying; and a paid-in-vs-grown bar was drawn for positions worth nothing. Display only, no resync | 0.48.0 |
| US-77 | **The card's line keeps its worst day.** The sparkline sampled every n-th day, so a position's peak and trough survived by luck — 5–14 % of the range gone on the demo account, invisible because the line normalises to its own extent. Min/max decimation at the same 48-point budget | 0.48.0 |
| US-78 | **The share sheet's shape strip shows three shapes, and can be paged.** `4:3` added and the order changed so `1:1 · 16:9 · 4:3` are the three visible without sliding; the item is a third of the window so it cannot drift again; end stops and a rubber-band instead of a strip that could be pulled empty; and the defect the browser found — a captured pointer meant **tapping a shape never selected it** | 0.48.0 |
| US-79 | **Disconnect: the account number is forgotten, the figures stay.** One flag and a delete of `IDENTIFYING_META` — no snapshot, because the raw stores plus a pure recompute already *are* the frozen record. The alarm is disarmed with it (a disconnect that only deletes rows lasts an hour), the frozen date is stated on every screen, the reconciliation verdict is dated and keeps its colour, and DEGIRO's own cookie is untouched — asserted. Reconnect is one press of Sync, through the first-run path | 0.48.0 |
| US-80 | **`npm test` runs in 1,8 s instead of 55.** The suite was sleeping through the real rate-limit spacing and the real exponential backoff — 31 s in one test. Faked per test on Node's `mock.timers`, with `degiro.js` untouched, and the backoff schedule now asserted rather than waited out | 0.48.0 |
| US-81 | **The five cents can now be located, and are still five cents.** A failing banner says which anchor it failed against; the report sizes the gap against the ledger's own turnover (the old ratio is `null` whenever DEGIRO's total is zero — which is why this stayed open) and attributes it across the cash categories as ratios; the connection check names the cash field used and whether `cashFunds` adds up. A locator, not a fix: no number on any screen changed | 0.48.0 |
| US-84 | **The five cents resolved: the owner's account reconciles to 0,00.** The locator's output plus the full export named two stacked defects — the cash-fund compensation classified as a sweep (now its own `COMPENSATION` category), and the money-market-fund era's value drift, which appears in no row's amount and is now marked to the fund's own stated prices read out of the conversie rows' descriptions. Requires one wipe & resync; any pre-flatex account was slightly rich until this | 0.51.0 |
| US-85 | **The full export downloads gzipped** (`.json.gz`, 15× smaller measured on a real account) under a name that states what it is and which build made it. Nothing trimmed — the owner's explicit call — so a big account's complete export fits through a chat channel | 0.52.0 |
| US-86 | **Feature-loss audit since 0.42, by measurement**: both UIs served and inventoried headless. All charts, tables and toolbar actions survive; the one real loss — per-product Bought/Sold, dropped by US-49's unresolved "or drop" — is restored as optional columns that fold first | 0.53.0 |
| US-82 | **The demo account has two closed positions**, one sold at a profit (the only thing that reaches *all gain — more came out than went in*) and one at a loss with its largest day on its own sale day. The **Closed** and **All** filters finally have rows; `npm run fixtures` is deterministic again. Its browser pass immediately found two share-sheet layout defects | 0.48.0 |
| US-35b | **Optimism Mode, turned up on request.** The replacement tiles existed after all (this row said "never built" for two releases); on the owner's *"nog meer over de top"* it gained two news crawls, eighteen tiles — four of them real measurements, including the share of days spent below the account's own peak — a rocket, a spinning switch and a breathing stamp. Absurdity is the safety mechanism, so more of it is strictly better; every figure is still the reader's own, and nothing downstream can see any of it | 0.50.0 |

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

**Resolved on 2026-08-18, same day it was written.** Everything the branch audit found came to
`main`: US-76 + US-77 merged, the popup sparkline leak merged, US-45 cherry-picked, the Today
live-day-result fix rebased on (was stranded as a 0.46.1), and the apple-fluid prototype imported.
The policy that keeps it this way is in [CLAUDE.md](../CLAUDE.md): **work lands on `main`; a POC
lives on the one `poc` branch until it is promoted or dropped.**

**The delete list, measured on 2026-08-19** so nobody has to re-derive it. This environment's git
proxy refuses `git push --delete`, so it is a one-time job in GitHub's UI. `main` and `poc` stay
(`poc` currently equals `main`).

*Fully contained in `main` — delete without looking:* `eager-cannon-b3ncc4`, `hoi-jft2cv`,
`popup-0470`, `readme-0460`, `refine-0470c`, `remaining-build-items-05dbxv`, `status-0460-cleanup`,
`ui-overhaul-user-stories-odcw7i`, `v47-bug-2jcvd3`.

*One or two commits ahead, and every one of them is text that landed on `main` under a different
story number or code that landed as a different commit* — the subjects are in the git log, and each
was checked: `account-total-bug-veh3bv`, `apple-fluid-poc` (its prototype is in
`docs/prototypes/`), `bug-report-pbvnjs` (the Today fix, merged), `eager-cannon-islvb3`,
`multi-broker-build` (US-45, cherry-picked), `new-user-story-iu926r` (US-79's refinement),
`paid-vs-grown-discrepancy-rk40yw` and `paid-vs-grown-user-story-23ltue` (US-76/77, merged),
`refine-0470`, `refine-0470b`, `v47-nav-aspect-ratio-v0wa42` (US-78's refinement).

*Old parallel histories, 8–90 commits ahead — **look before deleting**, they are the only ones this
audit did not read end to end:* `degiro-portfolio-spike-7x5d4h`, `multi-broker-poc`,
`portfolio-visualization-testing-xs5ck4`.

## Refined, not built

Complete as of the 2026-08-18 consolidation — every open story number appears either here, in
*Unmerged work* above, or in *Parked*.

| Story | State | Waiting on |
|---|---|---|
| US-26 | Instrument coverage declared per broker — verified / assumed, as a vocabulary | More relevant once a second broker lands |
| — | **A price series was rescaled by factor 4,369**, which is not a split ratio. Investigation: one factor across two regimes, or a vwd id that changed instrument. Do not tune the threshold | Nothing |
| US-37 | **Trading 212 R1 — PASS, measured 2026-08-13.** Page 200/401, logged out 401, and the service worker `PASS_JSON` with only an `Accept` header — so no device identifier is required either | Nothing. **US-39–US-45 are unblocked** |
| US-44 | **Trading 212 renders through the existing pipeline** — no separate dashboard | Gated on US-37 and the data gates. Addendum body not yet received |
| US-39–43 | Multi-broker delivery sequence from an external brief | **Not on US-37 — that passed.** Gated on a Network-tab capture of a logged-in Trading 212 account (transactions, dividends, cash wording are all `hypothesis`), and US-41 is additionally held by rule 8 until a second broker exists. See *Unattended build* above |
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
| — | One account's card reports **DOES NOT reconcile** — reported with a screenshot, not with its bug report | Unknown until that report arrives. The engine already attributes the residual three ways (share counts wrong / one position's price / the cash balance), so the answer is in the Notices tab of that account and nowhere here. Distinct from US-81, which is the owner's five cents on an account holding nothing |

## Out of scope, decided

SPEC §7 stops at phase 7: no multi-account, no benchmarks, no tax reporting, no Chrome Web Store.
Rule 9 puts any broker whose data cannot be reached from an already-logged-in tab out of scope —
that is a product promise, not a preference, and it decides spikes rather than being weighed
against them.
