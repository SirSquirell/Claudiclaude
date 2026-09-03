# Status — one page

`docs/BACKLOG.md` is 7 600 lines of reasoning and evidence, which is the right place for *why* and
a bad place to find out *where things stand*. This is the index.

**Last updated at 0.70.3, on 2026-09-02.** It had been stale since 0.21.0 once, which is fifteen
releases — if it looks stale again, trust the CHANGELOG and fix this.

## Light scans

Seventeen re-confirmation passes (2026-08-20 to 2026-09-03) are in [SCANS.md](SCANS.md), newest
first. Their standing result: no `claude/*` branch carries a story `main` does not have, the backlog
numbering is clean, and the rule spot checks pass. What they kept finding — 38 stale remote
branches the git proxy cannot delete — is now **US-120**, an owner action in GitHub's UI. The
sixteenth pass found the ledger's first real design/motion defect —
**US-140**, a table row's arrival fade that can freeze mid-opacity when a row below the fold is
jumped to instantly (keyboard focus, a screen reader, `scrollIntoView`) rather than reached by an
ordinary scroll — refined as a story rather than patched live, still open. The seventeenth pass
found nothing new; see SCANS.md for both.

## Owner's screenshots, 2026-08-22

Two screenshots and two questions, both answered in **0.60.3** — see `CHANGELOG.md` for the full
reasoning. Worth keeping here because one of them is a class of defect the scans do not look for.

**"If it says *bezig met syncen*, is it actually syncing?"** It was — `getStatus`'s `syncing` is the
in-flight promise in `sync.js`, so it cannot be stale in the other direction (a worker that dies
loses the promise and reports *not* syncing). What was wrong is that the strip reads the status once
per page load and the opportunistic sync it was reporting starts on that same load, so the line
outlived the run it described. Fixed by following a running sync while it runs and repainting once
it ends. The design lesson: every scan so far has measured the *resting* page — 0.60.2's finding was
a control that had to be opened to be wrong, and this one is a line that had to be *waited on* to be
wrong. A state that changes after the paint is a third thing to look for.

**Text alignment in the popup.** Measured headless at 320px rather than judged by eye, which is what
turned "a bit wacky" into two numbers: the status line's box ended 0,1px *below* where the primary
button began (`.actions` has no margin of its own — it inherits its spacing from the app's header
row, which the popup does not have), and the version number sat 3,6px below the wordmark's centre
because `#lockup`'s inline `<svg>` gave the flex row a 31,3px line box for a 24px mark. Both fixed
in the popup block of `styles.css`; re-measured at 14px of separation and a header box that equals
its mark, light and dark, empty state and with data.

`npm test` 580/580 (one new case: only the busy state is marked as progress), `npm run palette`
zero collisions, `node tools/check-leaks.mjs` clean. The strip's own follow loop was verified in
headless Chromium against a stubbed worker — three status calls to go from "busy" to "up to date",
then silence, and no further calls after both surfaces are dismissed.

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
| US-90 | `carryStocksForward` looks a broker's day up in a `Map` instead of rescanning its calendar per day — O(n) instead of O(n²) per broker part. Behaviour pinned before the swap: the new ~600-day two-calendar test passed against the old `indexOf` first, numbers identical after | 0.55.0 |
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
| US-88 | **The Today tile fabricated −100 % on every account with positions.** `todayPlBase` is the negative start-of-day reference (measured to the cent on two accounts), not a day figure; the day is `value + todayPlBase` and is now read that way. One ordinary sync refreshes it | 0.54.0 |
| US-89 | **A windowed share card counts the opening value as stake.** "−212,91 % on the money put in" on a long became −20,22 % "on what was in it"; longs bottom at −100 %, written options still tell their uncapped truth, all-time cards byte-identical | 0.54.0 |
| US-87 | **The Positions table becomes yours** (variant B, the owner's pick): click a header to sort — descending/ascending/natural, ties on name, instant — drag a header to reorder against a live drop indicator, and both persist beside the chooser's hidden set. Instrument anchored first, the action last, the cash row pinned. The Largest/Best/Worst chips retired (`docs/RETIRED.md`); the default view unchanged. Verified headless in the demo, wide and narrow | 0.56.0 |
| US-91 | **The strip on the broker page** (variant D, the owner's own): Asteria's mark, one status line and *Open your analysis* at the top of trader.degiro.nl, pushing the page down, never covering it. *Sync now* only when the last attempt failed or data is >3 days old; ✕ hides until the next browser start; a disconnected account shows nothing. First content script in the manifest; reads nothing from the page. Verified headless on a mock — **not yet seen against DEGIRO's real fixed header**, which is the first question for the next live session | 0.57.0 |
| US-92 | **The toast joins the strip** ("vind beide goed"): the same status and actions bottom-right on page load, from the same model, so the two cannot disagree. Auto-clears after 12 s, touching cancels that, its ✕ dismisses independently of the strip's; with both dismissed the script goes fully quiet. Twenty headless checks on the mock | 0.58.0 |
| US-96 | **A euro option's contract size read as an exchange rate, and was applied twice.** The first heavy-options account reconstructed € −47.491,36 against DEGIRO's € 124.110,28: every euro option trade settles at price × quantity × contract size, and that constant ratio passed the settled-amount check's consistency guard as a "rate", squaring the factor on written puts. The size is now divided out before the currency question is asked; the account lands € 239,83 from DEGIRO (price noise), the false 301-trade warning is gone, no resync | 0.59.0 |
| US-93 | **The Positions headers explain themselves**: hover/focus a column head for a text naming the figure, its denominator and its window, from one table beside the column list; touch reaches the same texts through the chooser, which now lists the lock columns disabled-checked. Result stated as price-only, Dividend as net — both verified against the engine and pinned by test | 0.60.0 |
| US-94 | **Closed positions answer the flow question**: bought vs sold + dividend, whole-life, as bar plus "got back {pct}% of what went in" — one pure model (`flowModel`) drawing the row and the share card; open rows byte-identical, the stock bar provably still absent from closed cards, dash kept when nothing ever went in | 0.60.0 |
| US-95 | **Every modal closes top-right** (variant A, the owner's pick): one ✕ on the share sheet and the diagnostics dialog, same close path as Escape and the backdrop, action rows verbs-only (Hide retired in `docs/RETIRED.md`), translated accessible name via a new `data-i18n-aria` pass | 0.60.0 |
| US-97 | **The demo button on asteria.prulwerk.nl now does something.** A second content script, only on that origin, marks `documentElement.dataset.asteria` with the real manifest version at `document_start` and relays one message to the worker; the worker opens `app.html?demo=1` — no new demo flag, `wantsDemo()` already read that parameter. No new `host_permissions`; nothing is fetched. **Not yet clicked from the real published page** — the site side shipped separately in `asteria.prulwerk.nl` | 0.61.0 |
| US-82 | **The demo account has two closed positions**, one sold at a profit (the only thing that reaches *all gain — more came out than went in*) and one at a loss with its largest day on its own sale day. The **Closed** and **All** filters finally have rows; `npm run fixtures` is deterministic again. Its browser pass immediately found two share-sheet layout defects | 0.48.0 |
| US-35b | **Optimism Mode, turned up on request.** The replacement tiles existed after all (this row said "never built" for two releases); on the owner's *"nog meer over de top"* it gained two news crawls, eighteen tiles — four of them real measurements, including the share of days spent below the account's own peak — a rocket, a spinning switch and a breathing stamp. Absurdity is the safety mechanism, so more of it is strictly better; every figure is still the reader's own, and nothing downstream can see any of it | 0.50.0 |
| US-112 | **The extension stopped syncing on every DEGIRO page load.** Reported from a real account with a screenshot: the trading screen itself stuck on a spinner while the strip said *Syncing…*. `tabs.onUpdated` fires per page load and a sync is dozens of requests spaced 1,1 s apart over the same session; the gate bounding it was five minutes, which limits *clicking* in a design where the two unattended callers are an alarm and that listener. An unattended run now asks whether the history is older than 24 h. Second half, or the fix amplifies the defect: `lastSyncAt` is written only on success, so a failing account is never fresh — a run that committed to fetching stamps the attempt and waits 30 min, while runs that never reached DEGIRO (no cookie, expired) do not. `force` — every Sync button — bypasses both | 0.65.0 |
| US-121–US-128 | **The dividend layer, second half — the UI.** The Dividends table carries yield on cost, current yield, rhythm, track record and the next expected payment (an estimate, labelled), and every row opens to its payments per share with label, rule, change against a year earlier, share count and a flag on a trade within 30 days; rows no per-share figure can be formed from are listed with reasons. An *Expected annual income* tile (last twelve months of regular payments × today's shares, "5 of 7 positions"); raises, cuts and stopped streams as Notices; an income goal on Outlook with the dividend growth prefilled from the account's own measured rate. Everything in EUR as settled and says so. No engine figure changed, no resync. **Not yet seen against a real account** — the demo's per-share history is synthetic, so the first real question is whether real pay-dates land inside the rhythm buckets | 0.70.0 |

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

**The delete list that used to sit here (measured 2026-08-19, re-checked 2026-08-20) is retired** —
it named 15 branches by hand, and by the very next scan (2026-08-21) several of them had reappeared
on the remote and more had been created, which is exactly the drift a named list can't keep up
with. The current, reliably-measured answer is kept in the newest entry of [SCANS.md](SCANS.md)
instead of re-derived here, and the action itself is **US-120**: as of 2026-09-02, 37 `claude/*`
branches plus `poc` exist. `main` was rewritten on 2026-08-20, so 25 of them share no common
ancestor with it at all; of the 12 that do, 11 are fully contained in `main` and one
(`claude/feature-requests-user-stories-u0rxdl`, itself superseded — see that entry) is ten commits
of text `main` already has in another form. This environment's git proxy — and the permission
classifier before it even reaches the proxy — refuses `git push --delete`, so acting on that is a
one-time job in GitHub's UI, the owner's to do. `main` and `poc` stay. **`poc` does not equal
`main`**: it sits at `5a8465f` (the branch-policy commit), 56 commits behind `main` and with 228
commits of its own that `main` does not have — a scratchpad, as the policy says, never a backlog.

## Proposed, not decided

[PRODUCT-BRIEF.md](PRODUCT-BRIEF.md) (2026-09-02, Dutch): ten feature proposals, a sales model (open core, paid data bundle, offline-verified licence, no accounts) and the backend that fits US-101/US-104 (static signed bundle, static benchmark files, nothing that sees a portfolio). Nothing in it has a story number yet; numbers are claimed only when a story lands in `BACKLOG.md` on `main`.

## Refined, not built

Kept current as new stories open and old ones land — every open story number appears either here,
in *Unmerged work* above, or in *Parked*. (Table content was last swept for completeness on
2026-08-30, twelfth pass: **US-113 removed** — built in 0.68.0, `docs/BACKLOG.md`'s own heading
already said so, only this table still described it as awaiting the owner's pick between the
three variants.)

| Story | State | Waiting on |
|---|---|---|
| US-98 | **Benchmark compare (S&P 500 default, any ETF, PROP folded in) — the owner decided the feature in chat, 2026-08-22.** That is not the same document event as the SPEC amendment rule 8 and the branch policy both lean on: SPEC §7 still reads "no benchmarks" verbatim | The SPEC.md §7 amendment text is drafted in `docs/BACKLOG.md`'s US-98 entry, ready to land in the same commit as the first line of code — nobody has landed it yet |
| US-26 | Instrument coverage declared per broker — verified / assumed, as a vocabulary | More relevant once a second broker lands |
| US-114 | **A price series was rescaled by factor 4,369**, which is not a split ratio. Investigation: one factor across two regimes, or a vwd id that changed instrument. Do not tune the threshold. Numbered 2026-09-02; the text in `docs/BACKLOG.md` is the original | Nothing |
| US-37 | **Trading 212 R1 — PASS, measured 2026-08-13.** Page 200/401, logged out 401, and the service worker `PASS_JSON` with only an `Accept` header — so no device identifier is required either | Nothing. **US-39–US-45 are unblocked** |
| US-44 | **Trading 212 renders through the existing pipeline** — no separate dashboard | Gated on US-37 and the data gates. Addendum body not yet received |
| US-39–43 | Multi-broker delivery sequence from an external brief | **Not on US-37 — that passed.** Gated on a Network-tab capture of a **funded** logged-in Trading 212 account. One full capture arrived 2026-08-25 and did not lift this: the account held nothing, so the web app took its empty-portfolio branch and never requested a holding, an order, a transaction or a cash movement ([MULTI-BROKER.md](MULTI-BROKER.md) §8g). Transactions and dividends are still `hypothesis`. US-41 is additionally held by rule 8 until a second broker exists. See *Unattended build* above |
| US-34 | **Trading 212 — the spike is finished.** R1 through R5 are all answered: the price history is public and needs no account (daily candles to 2017), and R1 passed on 2026-08-12/13. A 44-endpoint inventory of the web app's own requests landed 2026-08-25 (§8g): it promoted `/rest/v1/accounts` to `measured`, named the instrument master that carries ISIN and currency, and named two routes rule 9 forbids — the login and the event stream, which hands out and then carries a session token | Nothing. What is left is the *build* — US-39–US-45 — and the account **payload shapes**: `/rest/reports/transactions` and `/rest/reports/dividends/v2` are still `hypothesis` in `tools/trading212-r1/spike.js`, and it takes one page load on a **funded** account to fix that |
| US-36 | **Interactive Brokers — phase 1 has begun.** One DevTools capture shows an ordinary session-backed portal: its own bundle, a 25 kB portfolio payload, a repeating `tickle` keep-alive and a `202` long-poll. See [MULTI-BROKER.md §9](MULTI-BROKER.md) | **The decisive test**: one portfolio request re-run with `credentials: 'include'` and with `'omit'`, both statuses. That decides R1 and nothing else does |
| US-115 | An architecture report + multi-broker proposal, for an external agent. Brief at `docs/COPILOT-ARCHITECTURE-BRIEF.md`. Numbered 2026-09-02 | Nothing. Hand it over with the repo |
| US-116 | **Tighten `parse.js`'s candidate field names** to the ones a real account actually sends, and delete the rest | **Blocked: one real bug report's `fieldStats`**, which only the owner can supply — nothing in this repository has ever seen a real response |
| US-120 | **Delete the 37 stale `claude/*` branches** — owner action, GitHub UI | The owner. The git proxy refuses `push --delete` from a session |
| US-104 | **The bundle pipeline — out of this repo's scope, not just unbuilt.** A GitHub Action + `pipeline/`/`data/` shape publishing to `asteria.prulwerk.nl`, which is a separate site/repo this session was not given access to | A session with that other repo attached, or the pipeline built there and only consumed from here |
| US-105 | ISIN matching and an attention list | US-104's bundle existing to match against |
| US-107 | The gross/net switch, applied everywhere | US-106 (built, 0.63.0) exists now; this is real, separate UI work — the KPI row, calendar, Year Ahead, growth report and holdings table all need the same switch wired in, not assumed from one card |
| US-108 | Safety score per holding | US-104 (blocked, see above) |
| US-109 | Income by safety bucket, the PoC screen | US-105, US-107, US-108 — all still open |
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
| US-114 | `price-scale-adjusted` factor 4,369 on one account | Bounded, same reason. Would need an account that still holds one |
| — | One account's card reports **DOES NOT reconcile** — reported with a screenshot, not with its bug report | Unknown until that report arrives. The engine already attributes the residual three ways (share counts wrong / one position's price / the cash balance), so the answer is in the Notices tab of that account and nowhere here. Distinct from US-81, which is the owner's five cents on an account holding nothing |

## Out of scope, decided

SPEC §7 stops at phase 7: no multi-account, no tax reporting, no Chrome Web Store. "No benchmarks"
is the one exception in flux — the owner decided in chat to allow it (2026-08-22), but the SPEC.md
text itself is not amended yet, so treat it as still written there until that lands; see US-98 in
`docs/BACKLOG.md` for the drafted amendment and why the feature can't just be built ahead of it.
Rule 9 puts any broker whose data cannot be reached from an already-logged-in tab out of scope —
that is a product promise, not a preference, and it decides spikes rather than being weighed
against them.
