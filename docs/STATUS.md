# Status — one page

`docs/BACKLOG.md` is 2 000 lines of reasoning and evidence, which is the right place for *why* and
a bad place to find out *where things stand*. This is the index.

**Last updated at 0.63.0.** It had been stale since 0.21.0 once, which is fifteen
releases — if it looks stale again, trust the CHANGELOG and fix this.

## Light scan, 2026-08-22 (third pass)

**Landed: the reconciliation the second pass flagged as stranded.** That scan found
`claude/feature-requests-user-stories-u0rxdl` real, unlanded and colliding on story numbers, and
declined to guess a renumbering itself. Between that scan and this one, a session did the
renumbering properly — on yet another stray branch, `claude/work-items-zk6g5r` — as one commit
sitting directly on `main`'s own HEAD (7c9784a): US-97–109 renumbered to US-98–109, the
`docs/prototypes/dividend-safety-buckets.html` POC brought over, and — by design — none of the
branch's ~88 files of parallel source changes, since those forked from 0.60.3 and need a
side-by-side read against what `main` shipped since. It fast-forwarded onto `main` cleanly; this
scan landed it (`aeb803d`). `node tools/check-backlog.mjs` after landing: 67 stories, highest
US-101, next free US-110, every heading states its state — no duplicate or skipped numbers. US-98
(benchmark compare) still needs the SPEC §7 "no benchmarks" amendment before any code follows;
that decision is still the owner's, not this scan's.

**Branches**, re-checked the same way (diff content against `main`, not `git rev-list`): every
other `claude/*` branch and `poc` is still either fully contained in current `main` or an old
pre-rewrite snapshot, including the two previously-flagged look-alikes —
`degiro-portfolio-spike-7x5d4h`'s `probe.js` (84 lines) is still superseded by `main`'s own
`spike.js` (216 lines), and `claude/prulwerk-branded-back-button-x7ix4v` turned out to be a stray
snapshot that only *reverts* `docs/STATUS.md` and `package.json` to an older release — not new
work. None deleted; the git proxy still refuses it, so remote cleanup stays the owner's.

**GitHub.** Zero open issues. PR **#8** still open and untouched since 2026-08-17 — same
recommendation as every prior scan: close as superseded (US-88 already fixed what it
re-proposes), owner's call.

**Rule compliance / security**, same spot checks as every prior scan, all clean: `EXPORTABLE_META`
in `store.js` is still an allowlist; `degiro.js` still refuses to retry 401/403; `session.js`'s
`resolveSession` still persists nothing but the cookie-derived account fields, never the session
id.

**Design pass** (`apple-design` skill loaded first). Headless Playwright at 1440/380 px ×
light/dark on the demo: zero page/console errors, zero horizontal overflow in every state. This
pass specifically drove a state the last several scans hadn't isolated — opening the share sheet
(a native `<dialog>`, `#share-sheet`) from the Holdings tab at 380px — since sheets are exactly
where the task brief's own past misses lived (a menu drawn under a chart, a tile collapsed to
zero width). It renders as a proper flat sheet within the 380px viewport (348px wide, margins
intact, no overflow), consistent with `docs/redesign/DESIGN-BRIEF.md` §8's one-container-depth
rule — no translucency crept in anywhere it was checked. Nothing to fix.

**Optimization.** Not re-derived this pass; `engine.js`'s two `productIds` passes were re-checked
against the US-83/US-90 shape by the second pass today and found to be two distinct single passes,
not a rescan — no code changed there since, so that finding stands.

No new broker surfaced worth scoping — still gated on a Trading 212 Network-tab capture this
environment cannot produce.

No small fixes this pass — `package.json`/`manifest.json` versions already agree at `0.61.0` from
the second pass's fix.

`npm test` 580/580, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean — all re-run after the merge above.

## Light scan, 2026-08-22 (second pass)

**Branches.** 30 remote `claude/*` branches plus `poc`, checked by diff content against `main`
(8159200, 0.61.0) rather than commit count — `git rev-list` still overcounts on this repo's rebased
histories, as every prior scan found. 29 of the 30 collapse to net deletions against current `main`;
the two with new files each turned out to be already-superseded drafts —
`degiro-portfolio-spike-7x5d4h`'s `tools/trading212-r1/probe.js` (84 lines) is an early draft of what
`main` already has as `spike.js` (216 lines) plus its own test and README, and
`claude/eager-cannon-b3ncc4` is the same stray-branch pattern as `eager-cannon-islvb3` before it: one
commit from a prior scan run, stranded on its own throwaway branch, whose finding (the `cashChart`
axis fix) is already on `main`.

**`claude/feature-requests-user-stories-u0rxdl` reconciled, 2026-08-22.** Its numbering collided with
`main` (it called the benchmark feature US-97, continuing to US-109; `main` had already shipped a
*different* US-97 — the asteria.prulwerk.nl demo button, 0.61.0). The collision was mechanical, not a
design conflict — the branch's own US-100 was already marked superseded and folded into its US-97 —
so it was renumbered by shifting everything from there onward by one slot into `main`'s actual free
range: benchmark-compare → **US-98**, price-vs-total-return → **US-99**, lossporn → **US-100**,
prulwerk.nl hosting (deferred) → **US-101**, the dividend & income layer keeps **US-102–US-109**
unchanged. Landed as text on `main` exactly as refined — nothing here is built, and US-98 still needs
the SPEC §7 amendment it names before any code follows. The working POC
(`docs/prototypes/dividend-safety-buckets.html`) came over with it, referenced from US-109 where it
belongs. **Not reconciled: the branch's ~88 files of source changes** (`engine.js`, `snapshot.js`,
new `motion.js`/`describe.js`/`report.js`/`theme.js` modules, etc.) — this branch forked from `main`
at 0.60.3 and kept developing in parallel, so that code has not been read end to end against what
shipped on `main` since, and some of it likely reimplements stories `main` already built differently
(US-87, US-91, and others). Read it side by side with `main` before cherry-picking any of it; nothing
was merged from it this run.

Every other branch — `aan-de-slag-*`, `account-total-bug-veh3bv`, `apple-fluid-poc`,
`bought-waarde-percentage-if39gn`, `bug-report-pbvnjs`, `danny-portfolio-degiro-compat-0iwoyd`,
`degiro-reconciliation-issues-7t3iyc`, `hoi-jft2cv`, `latest-version-main-gc8x7z`,
`multi-broker-build`, `multi-broker-poc`, `new-user-story-iu926r`, `paid-vs-grown-*`, `popup-0470`,
`portfolio-visualization-testing-xs5ck4`, `readme-0460`, `refine-0470*`,
`remaining-build-items-05dbxv`, `status-0460-cleanup`, `sync-status-text-alignment-hnas3e`,
`ui-overhaul-user-stories-odcw7i`, `v47-*` — is either fully contained in `main` already or an old
pre-rewrite snapshot with no unique file `main` lacks. None can be deleted from here (the git proxy
still refuses it); GitHub-UI cleanup is the owner's, not this scan's.

**GitHub.** Zero open issues — nothing to reconcile against `main`. One open PR, **#8**, still
untouched since 2026-08-17, ninth scan in a row: same recommendation as always, close as superseded
(US-88 already fixed what it re-proposes), owner's call.

**Backlog consistency.** `node tools/check-backlog.mjs`: 63 stories, highest US-97, next free US-98 —
matches the foot of `docs/BACKLOG.md`, no duplicate or skipped numbers on `main` itself (the collision
above is between `main` and a branch, not within `main`).

**Rule compliance / security**, same spot checks as every prior scan, all clean: `EXPORTABLE_META` in
`store.js` is still an allowlist, not a denylist; `throttledFetch` is still the one queue and still
does not retry 401/403; `session.js`'s `resolveSession` still writes nothing but the cookie-derived
`intAccount`/`userToken`/`displayName`/`urls`, never the session id itself.

**Design pass** (`apple-design` skill loaded first). Driven headless via Playwright at 1440/380 px ×
light/dark: all six nav tabs, the "More" menu, and a Holdings-table row click. Zero page/console
errors and zero horizontal overflow in every state checked. No inconsistency found against
`docs/redesign/DESIGN-BRIEF.md` §8 (no translucency, one flat container depth held everywhere). First
scan in a while with nothing to fix — the last several already caught what there was (the cash-chart
axis, the 380px "More" menu overflow, the live-sync status line, the popup's alignment).

**Optimization.** Re-checked `engine.js`'s two passes over `productIds` (building each product's
price series, then auditing it against its trades) against the US-83/US-90 shape — they are two
distinct single passes over different work, not a repeated rescan. No new finding; nothing warranting
a story.

No new broker surfaced worth scoping — unchanged from the table below (still gated on a Trading 212
Network-tab capture this environment cannot produce).

**One small fix.** `package.json`'s `version` had been bumped in lockstep with `manifest.json` on
every release back through 0.60.3 — the last two commits (US-97's demo button and the static-page
hosting change, both folded into `manifest.json`'s 0.61.0) broke that pattern and left `package.json`
one release behind. Nothing reads `package.json`'s version at runtime, so this was cosmetic rather
than a live bug, but it is the kind of drift that misleads whoever checks "what version is this"
from the wrong file. Bumped to `0.61.0` to match; this `STATUS.md` header updated to match.

`npm test` 580/580, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean, re-run after the version bump above.

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

## Light scan, 2026-08-21

**Branches.** The nine-plus-one the 2026-08-20 scan reported as gone from the remote —
`aan-de-slag-*`, `eager-cannon-b3ncc4`, `degiro-reconciliation-issues-*`, `hoi-jft2cv`,
`popup-0470`, `readme-0460`, `refine-0470c`, `remaining-build-items-*`, `status-0460-cleanup`,
`ui-overhaul-user-stories-*`, `v47-bug-2jcvd3`, `degiro-portfolio-spike-7x5d4h` — are **back** on
the remote today, alongside the ones that were never reported gone. All 28 `claude/*` branches plus
`poc` re-checked the same way as every prior scan (diff content, not `git rev-list`, which still
overcounts on this repo's rebased histories): zero files in any branch that are absent from `main`,
and every diff collapses to net deletions once `main`'s own stale local ref is corrected first —
this session's local `main` had drifted to 3e58412 (0.44.1) while `origin/main` was already at
d6289c7 (0.60.1), which briefly made `HEAD` itself look 98 files diverged from "main" until
`git branch -f main origin/main` fixed the ref. Worth naming plainly since it is the opposite of
last time's finding: no unmerged story on any branch, but the "owner did GitHub-UI cleanup" read
from 2026-08-20 does not hold up today — those branches exist on the remote right now, whatever
reason. Not touched, per the standing rule that branch deletion is the owner's call.

**GitHub.** Zero open issues. One open PR, **#8**, still untouched since 2026-08-17 — same
recommendation as every prior scan: close as superseded (US-88 already fixed what it re-proposes),
owner's call.

**Backlog consistency.** `node tools/check-backlog.mjs`: 62 stories, highest US-96, next free
US-97 — matches the *Next free number* line at the foot of `docs/BACKLOG.md`. No duplicate or
skipped numbers, no heading that disagrees with the Shipped table below.

**Rule compliance / security**, same spot checks as prior scans, all clean: `engine.js` has no
`Date.now`/`new Date`/`fetch`/`chrome.*`/`indexedDB` (the 0.60.1 fix held), `degiro.js` is still the
only module with a live `fetch(`, 401/403 still return without retry, `session.js`'s `resolveSession`
still never persists the session cookie itself — only the stable, non-credential `intAccount` /
`userToken` / `displayName` it reads from `/pa/secure/client` are cached, exactly as the module's
own comment says — the export allowlist (`SNAPSHOT_FIELDS` in `snapshot.js`, the equivalent in
`report.js`) is still a `pick`, not a scrub, and manifest permissions are unchanged
(`storage`, `unlimitedStorage`, `alarms`, `cookies`; host permissions limited to
`trader.degiro.nl` and `charting.vwdservices.com`).

**Design pass** (`apple-design` skill loaded first, per `docs/redesign/DESIGN-BRIEF.md` §8 — flat
containers, no translucency, none of which this scan touched). Driven headless at 1440/380 px ×
light/dark, but this time clicking through every interactive control on every section — nav tabs,
range/granularity toggles, the sync button, and everything inside the "More" menu (language, theme,
connection check, export, disconnect, wipe & resync) — because the last three scans' "no horizontal
overflow" checks only measured the resting page, and the task brief's own warning ("green tests have
passed here three times over a menu drawn under a chart...") is specifically about a bug that only
exists while something is open. It found one: **at 380px, opening the rail's "More" menu overflowed
the viewport by 157px**, with no way to reach the language, theme or disconnect/wipe controls inside
it. Below the `60em` breakpoint the rail stacks to the top and `.rail-foot` becomes a wrapping row,
so the "More" trigger no longer sits at the foot of a column — it sits at the end of a row, at
roughly x=308 on a 380px screen. `.menu`'s `left: 0` (relative to its own trigger) grows the panel
rightward from there regardless, and its `max-width: min(22rem, 100vw - 1.5rem)` bounds the panel's
*own* width, not its distance from the right edge of the viewport, so the two combined still ran the
panel off-screen. Fixed with two lines in the same `60em` breakpoint that already flips the rail
layout: `.menu { left: auto; right: 0; transform-origin: bottom right }`, so the panel grows from the
trigger's right edge — where the trigger actually is — instead of its left. Re-verified: the full
20-control click-through at 380px and 1440px, light and dark, now measures zero overflow and zero
console/page errors throughout. Confirmed in both languages (EN default, NL via the in-menu toggle)
and both themes via screenshot. Released as **0.60.2**, display-only, no resync, no `WHATS-NEW.md`
entry (same reasoning as 0.60.1's fixes: nothing changed about what is stored or fetched).

**Optimization sweep**, repeating the US-83/US-90 shape check: the same `.indexOf(` calls as every
prior pass — `report.js:504` bounded to the handful of cash categories, the rest in `app.js` against
short, user-built arrays inside click handlers. No new finding.

`npm test` 579/579, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean, all three re-run after the fix above, before this commit.

No new broker surfaced worth scoping — unchanged from the table below.

## Light scan, 2026-08-20 (second pass)

A second routine sweep the same day — the first one (0.60.0, committed 20:11 UTC) found nothing
and this one found two, both small enough to fix inline rather than write up as stories. This
supersedes that entry.

**Branches.** All 18 remote `claude/*` branches plus `poc` re-checked against `main` (a5e4225,
0.60.0 at fetch time), by diff content rather than commit count — `git rev-list` overcounts on this
repo's rebased histories (one branch showed "88 ahead" while its actual diff against `main` was
19 205 deletions and 0 unique files). Every branch: zero files absent from `main`, and every diff
against `main` is net deletions — no unmerged story anywhere. The nine branches the 2026-08-19 audit
flagged for owner cleanup (`aan-de-slag-*`, `eager-cannon-b3ncc4`, `degiro-reconciliation-issues-*`,
`hoi-jft2cv`, `popup-0470`, `readme-0460`, `refine-0470c`, `remaining-build-items-*`,
`status-0460-cleanup`, `ui-overhaul-user-stories-*`, `v47-bug-2jcvd3`) are gone from the remote —
the owner appears to have done the GitHub-UI cleanup. `degiro-portfolio-spike-7x5d4h` is gone too.
This session's own branch, `claude/eager-cannon-7cxe6h`, is transport per the branch policy and
carries this commit to `main`.

**GitHub.** Zero open issues, matching the first pass. One open PR, **#8**, still untouched since
2026-08-17 — same recommendation as every prior scan: close as superseded (US-88 already fixed what
it re-proposes), owner's call.

**Backlog consistency.** `node tools/check-backlog.mjs`: 62 stories, highest US-96, next free
US-97 — matches the *Next free number* line at the foot of `docs/BACKLOG.md`. No duplicate or
skipped numbers, no heading that disagrees with the Shipped table below.

**Rule compliance / security**, same six spot checks as prior scans, same clean result on five —
export allowlist still default-deny, `throttledFetch` still the one fetch path with no 401/403
retry, `session.js` still write-nothing, `innerHTML` sites still routed through `esc()`, manifest
permissions unchanged — **except the sixth: `engine.js` was not fully pure.** Two occurrences of
`computedAt: new Date().toISOString()` (`computePortfolio`'s result and its empty-history fallback)
read the wall clock inside the one module rule 1 requires to be pure, and a third in `combine.js`
did the same. All three were dead output — `grep` found no reader anywhere in `src/` or `test/` —
so this was a scan-safe fix rather than a backlog story: deleted in all three places, `npm test`
still 579/579 after. Nothing else in the five-scan run of this check has ever found anything, so
it is worth stating plainly this time it did.

**Design pass** (`apple-design` skill loaded first, per the brief in `docs/redesign/DESIGN-BRIEF.md`
§8 — flat containers, no translucency, no shadows on nested elements, none of which this scan
touched or needed to). Every section (Overview, Performance, Composition, Income & cost, Holdings,
Outlook, Notices) driven headless at 1440/380 px × light/dark: no page errors, no console errors,
no horizontal overflow anywhere. One real defect, found by measuring bounding boxes rather than
eyeballing a screenshot (the same discipline the task brief asks for, because three prior scans'
green tests missed exactly this shape of bug): **`.card-head > div { flex: 1 1 220px }`**
(`styles.css`, written for the title-and-hint block beside a panel's controls) also matches every
`.group` segmented control, because a `.group` is a bare `div` too. Four toggles were growing to
fill the row instead of hugging their own buttons — Positions' *Table/Share* (422px of dead track
at 1440px), Transactions' *This range/Everything* (355px), and Performance's chart-type and
annualised-return toggles (119px and 344px) — each rendering as a stretched pill with visible empty
space instead of a tight segmented control. `.card-head > .group { flex: 0 0 auto }` fixes all four
at once; re-measured at 3px (padding only) on each, screenshotted before and after to confirm, no
regression on the controls that were already correct (`range-group`, `outlook-horizon`,
`outlook-rates` stayed at 3px throughout).

**Optimization sweep**, repeating the US-83/US-90 shape check across `src/lib/` and `src/ui/`: still
just the one `.indexOf(` at `report.js:504`, still bounded to the handful of cash categories, still
not the shape. The `.indexOf(` calls in `app.js` (drag-and-drop, month-cell selection) are all
against short, user-built arrays inside click handlers, not a per-day or per-row scan. No new
finding this pass.

`npm test` 579/579, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean, all three re-run after the fixes above, before this commit. Released as **0.60.1** — both
fixes are display-only or dead-code, so no resync and no `WHATS-NEW.md` entry (nothing changed that
a reader needs to know before their next sync); `CHANGELOG.md` carries both.

No new broker surfaced worth scoping — the multi-broker sequence's blocker is unchanged from the
table below (a Trading 212 Network-tab capture, which this environment cannot produce).

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

**The delete list, measured on 2026-08-19 and re-checked 2026-08-20** so nobody has to re-derive
it. This environment's git proxy refuses `git push --delete`, so it is a one-time job in GitHub's
UI. `main` and `poc` stay (`poc` currently equals `main`).

*Fully contained in `main` — delete without looking:* `aan-de-slag-c57smb` (new on 08-20; empty,
points at `main`'s own 0.56.0 commit), `aan-de-slag-wen7bc` (this scan's transport branch —
deletable once its commit is on `main`), `eager-cannon-b3ncc4`,
`degiro-reconciliation-issues-7t3iyc` (new since the 08-18 audit; zero diff against `main`, same as
the rest of this line), `hoi-jft2cv`, `popup-0470`, `readme-0460`, `refine-0470c`,
`remaining-build-items-05dbxv`, `status-0460-cleanup`, `ui-overhaul-user-stories-odcw7i`,
`v47-bug-2jcvd3`.

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
| — | `price-scale-adjusted` factor 4.369 on one account | Bounded, same reason. Would need an account that still holds one |
| — | One account's card reports **DOES NOT reconcile** — reported with a screenshot, not with its bug report | Unknown until that report arrives. The engine already attributes the residual three ways (share counts wrong / one position's price / the cash balance), so the answer is in the Notices tab of that account and nowhere here. Distinct from US-81, which is the owner's five cents on an account holding nothing |

## Out of scope, decided

SPEC §7 stops at phase 7: no multi-account, no benchmarks, no tax reporting, no Chrome Web Store.
Rule 9 puts any broker whose data cannot be reached from an already-logged-in tab out of scope —
that is a product promise, not a preference, and it decides spikes rather than being weighed
against them.
