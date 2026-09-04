# Light scans — the ledger

Every *Light scan* entry that used to sit at the top of [STATUS.md](STATUS.md), newest first,
moved here on 2026-09-02 so that the status page is a status page again. A scan re-confirms
branches, backlog numbering, rule compliance and design against `main` and records that nothing
new was found — which is worth having written down once, and worth reading rarely. The current
state is in STATUS.md; this is the evidence that it was checked.

---

## Light scan, 2026-09-04 (eighteenth pass)

This session's own transport branch (`claude/eager-cannon-utwiux`) was identical to `origin/main`
at start (both at 0.70.3, the seventeenth pass's own commit) — worked directly off `main`.

**Branches.** 38 remote `claude/*` branches plus `poc`, unchanged count from the seventeenth pass.
No branch's newest commit postdates `claude/fable-5-tr3otb` (2026-09-02, already counted last
pass); `danny-portfolio-degiro-compat-0iwoyd` and every other previously-named branch are still
present and unchanged. Nothing in the set carries a story `main` doesn't have. Git proxy still
refuses branch deletion, so the 38 stale branches remain GitHub-UI cleanup for the owner.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass, nothing to close.

**Backlog numbering**, via `tools/check-backlog.mjs`: 136 stories, highest US-140, next free
US-141, no duplicate numbers, every heading states its state — unchanged from the seventeenth pass.
`## Last updated` still matches `CHANGELOG.md`'s 0.70.3 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/datasource.js` (demo fixtures) and `src/ui/app.js`
(the extension's own `manifest.json`, for the version string). `degiro.js` still refuses to retry
401/403. `EXPORTABLE_META` in `store.js` is still an allowlist, `redactMeta` still redacts anything
not listed. `node tools/check-leaks.mjs` clean (166 tracked files).

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless Playwright
at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`: zero page
errors, zero console errors, zero horizontal overflow at the document level in every combination,
including under `reducedMotion: 'reduce'`. A full-page screenshot of Holdings at 1440px, taken
mid-sequence after clicking through the other seven tabs at 350ms intervals, showed the Positions
table entirely missing — the same "chase it down, don't assume a screenshot artifact" playbook the
ninth and sixteenth passes used, so it was: `revealOnArrival()`'s global `shown` counter (shared
across every tab's cards, capped at index 8) had given that card the maximum 480ms
`animation-delay`, and the 350ms wait after the click landed inside that delay window, where
`animation-fill-mode: both` holds the card at the keyframe's `from` state (`opacity: 0`). Polling
the same card's computed opacity every 250ms past that point showed it reach `1` by ~750ms and
stay there — confirmed transient, not stuck, and consistent with the documented stagger cap
(`src/ui/styles.css` around `.card.arriving`). Not a defect; a reminder that this app's own reveal
mechanism can still fool a screenshot taken too soon after a tab switch. Screenshotted every tab at
380px, light and dark, and looked closely: Overview, Performance, Composition, Income & cost,
Dividends, Holdings, Outlook and Notices all held their card layout, spacing and type hierarchy
with nothing clipped, misaligned or overlapping. The Income & cost withholding-tax table's wide
row is a `.table-scroll` container with its own `overflow-x: auto` (776px of content in a 326px
box) — scrollable, not a leak. `backdrop-filter` still does not appear in `src/ui/styles.css`,
consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container rule. No new design or motion
defect found; **US-140** (the row-arrival-fade freeze found in the sixteenth pass) is unchanged and
still open in `docs/BACKLOG.md` — not something to patch live in a scan.

**Optimization.** No new candidate. Same conclusion as every prior pass: `src/ui/app.js` stays
unbundled by design (MV3, no build step), and rule 8 rules out a refactor with no story or defect
behind it.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in tab.

`npm test` 672/672, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-09-03 (seventeenth pass)

This session's own transport branch (`claude/eager-cannon-cbiypv`) was identical to `origin/main`
at start (both at 0.70.3, the sixteenth pass's own commit) — worked directly off `main`.

**Branches.** 38 remote `claude/*` branches plus `poc`, one more than the sixteenth pass's 37 by
raw count, but every individual name in the current set — including the highest-`ahead` ones
(`degiro-reconciliation-issues-7t3iyc` 250, `eager-cannon-b3ncc4` 237, `v47-nav-aspect-ratio-v0wa42`
222, `paid-vs-grown-discrepancy-rk40yw` 222, `v47-bug-2jcvd3` 216, `account-total-bug-veh3bv` 216,
`remaining-build-items-05dbxv` 212) — was already named and confirmed net-deletions or superseded
content in an earlier pass (see the sixteenth pass's owner-cleanup list, which already covers most
of these by name). No branch's newest commit postdates `claude/fable-5-tr3otb` (2026-09-02, already
counted in the sixteenth pass); nothing found that pins down a genuinely new 38th branch, and
nothing in the set carries a story `main` doesn't have. Git proxy still refuses branch deletion, so
the stale branches remain GitHub-UI cleanup for the owner, not a task item here.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass, nothing to close.

**Backlog numbering**, via `tools/check-backlog.mjs`: 136 stories, highest US-140, next free
US-141, no duplicate numbers, every heading states its state — unchanged from the sixteenth pass.
`## Last updated` still matches `CHANGELOG.md`'s 0.70.3 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/datasource.js` (demo fixtures) and `src/ui/app.js`
(the extension's own `manifest.json`, for the version string). `degiro.js` still refuses to retry
401/403. `EXPORTABLE_META` in `store.js` is still an allowlist, `redactMeta` still redacts anything
not listed. `node tools/check-leaks.mjs` clean (166 tracked files).

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless Playwright
at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`: zero page
errors, zero console errors, zero horizontal overflow at the document level in every combination,
including under `reducedMotion: 'reduce'` and under `?demo=1&frozen=1`. Screenshotted every tab at
380px, light and dark, and looked closely rather than only measuring: Overview, Performance,
Composition, Income & cost, Dividends, Holdings, Outlook and Notices all held their card layout,
spacing and type hierarchy with nothing clipped, misaligned or overlapping. `backdrop-filter` still
does not appear in `src/ui/styles.css`, consistent with `docs/redesign/DESIGN-BRIEF.md` §8's
flat-container rule. No new design or motion defect found; **US-140** (the row-arrival-fade freeze
found in the sixteenth pass) is unchanged and still open in `docs/BACKLOG.md` — not something to
patch live in a scan.

**Optimization.** No new candidate. Same conclusion as every prior pass: `src/ui/app.js` stays
unbundled by design (MV3, no build step), and rule 8 rules out a refactor with no story or defect
behind it.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in tab.

`npm test` 672/672, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-09-02 (sixteenth pass, first real finding)

This session's own transport branch (`claude/eager-cannon-2xvn52`) was identical to `origin/main`
at start (both at 0.70.3, this pass's own commit before the changes below) — worked directly off
`main`.

**Branches.** 37 remote `claude/*` branches plus `poc` — one more than the fifteenth pass's 36:
`claude/fable-5-tr3otb` (2026-09-02), 0 commits ahead of `main`, i.e. it carries nothing `main`
doesn't already have. Every other branch's ahead/behind count against the now-35-commits-newer
`main` is unchanged in kind from every prior pass (the same handful of pre-2026-08-18 branches with
large "ahead" counts, already confirmed net-deletions or superseded content in earlier passes; spot
re-checked three of the higher-ahead ones — `feature-requests-user-stories-u0rxdl`,
`latest-version-main-gc8x7z`, `danny-portfolio-degiro-compat-0iwoyd` — against `docs/BACKLOG.md`:
every US-91…US-109 story their commits mention already has a heading on `main` marked *(built,
…)*, *(decided, …)* or *(spike, …)*, so nothing there is lost work). Git proxy still refuses branch
deletion, so the 37 stale branches remain GitHub-UI cleanup for the owner.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass, nothing to close.

**Backlog numbering**, via `tools/check-backlog.mjs`: 135 stories on entry, highest US-139, next
free US-140, no duplicates, every heading states its state — unchanged from the fifteenth pass.
Added US-140 this pass (the finding below), bringing it to 136 stories, next free US-141;
re-verified clean after the edit. `## Last updated` still matches `CHANGELOG.md`'s 0.70.3 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/datasource.js` (demo fixtures) and `src/ui/app.js`
(the extension's own `manifest.json`, for the version string). `degiro.js` still refuses to retry
401/403. `EXPORTABLE_META` in `store.js` is still an allowlist, `redactMeta` still redacts anything
not listed. `node tools/check-leaks.mjs` clean (166 tracked files).

**Design pass** (`apple-design` skill loaded first). Headless Playwright at 1440px and 380px, light
and dark, driven across all eight tabs via `npm run demo`: zero page errors, zero console errors,
zero horizontal-overflow at the document level, in both `?demo=1` and `?demo=1&frozen=1`, and under
`reducedMotion: 'reduce'` at both viewports. Screenshotted every tab at 380px, light and dark, and
looked closely rather than only measuring — that closer look is what caught this pass's finding.

**US-140 — a table row's arrival fade can freeze mid-opacity off-screen.** The Holdings tab's
Positions table (11 rows at the tested filter) rendered its first four rows normally in a 380px
screenshot and every row *after* that as a blank gap — no swatch, no text, no value — while
`getComputedStyle` on the same row reported `opacity: 1`, `animationName: none`: the browser's own
bookkeeping said the row was fully drawn and its animation long finished. Chased it down rather than
assuming a headless-screenshot artifact (the ninth pass's playbook, since one has turned out to be
exactly that before): raised the wait to 2 s, still blank; tried `prefers-reduced-motion: reduce`,
which fixed it completely (every row drawn); tried a slow, literal `mouse.wheel()` scroll down the
page instead of jumping, which also rendered every row correctly; tried `element.scrollIntoView()`
and, separately, `button.focus()` on a below-fold row's expander (a close analogue of a keyboard
user tabbing past the visible rows, or a screen reader landing on one) — both reproduced it, one as
a fully blank row, the other as a row frozen at a visibly washed-out partial opacity, neither
matching the "opacity: 1" the DOM reported. So this is real, and specific: an *instant* jump to a
below-fold row, while `src/ui/motion.js`'s `revealOnArrival` has started that row's staggered
`card-arrive` fade off-screen, can leave the row's paint stuck. Root cause read from
`motion.js`: `arrive()` fires once per card (correctly, only when the *card* itself scrolls into
view), but then stamps `--arrive-i` and starts the keyframe animation on **every** row inside it in
one synchronous pass, including rows nowhere near the viewport — exactly the "reveal wasted
off-screen" failure mode the function's own doc comment says the card-level observer exists to
avoid, just one level down from where that comment's guarantee actually applies. Not something to
patch live in a scan: refined as **US-140** in `docs/BACKLOG.md` instead, scoped to skip the
animation for a row that isn't near the viewport at reveal time, with the exact repro kept as the
acceptance test.

Otherwise no new design defect found: `backdrop-filter` still does not appear in
`src/ui/styles.css`, consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container rule
(checked again given the brief explicitly rules out Apple-style translucency here); the theme-fade
cross-fade from earlier passes is unchanged and still matches the skill's reduced-brightness-jump
guidance; typography scale and hierarchy unchanged from the design brief's §8 values.

**Optimization.** No new candidate. Same conclusion as every prior pass: `src/ui/app.js` stays
unbundled by design (MV3, no build step), and rule 8 rules out a refactor with no story or defect
behind it.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in tab.

`npm test` 672/672, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-09-01 (fourteenth pass)

This session's own transport branch (`claude/eager-cannon-dp11yd`) was identical to `origin/main`
at start (both at 0.68.0, thirteenth pass's commit) — worked directly off `main`.

**Branches.** 36 remote `claude/*` branches plus `poc`, unchanged count and unchanged ahead/behind
numbers from the thirteenth pass (recomputed `rev-list --count origin/main..` for all 36: same 36
values as last pass, same two lowest non-zero `feature-requests-user-stories-u0rxdl` at 10 and
`portfolio-visualization-testing-xs5ck4` at 22, both already confirmed net-deletions against `main`
in prior passes). No branch carries a story `main` doesn't have. Git proxy still refuses branch
deletion, so the 36 stale branches remain GitHub-UI cleanup for the owner.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, no duplicate numbers, every heading states its state — unchanged from the thirteenth pass.
`## Last updated` still matches `CHANGELOG.md`'s 0.68.0 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/datasource.js` (demo fixtures) and `src/ui/app.js`
(reading the extension's own `manifest.json` for the version string). `degiro.js` still refuses to
retry 401/403. `EXPORTABLE_META` in `store.js` is still an allowlist, `redactMeta` still redacts
anything not listed. `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless Playwright
at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`: zero page
errors, zero console errors, zero horizontal overflow. Also re-ran with `reducedMotion: 'reduce'`
at both viewports (a check no prior pass had scripted explicitly, though the mechanism was already
read closely in the ninth pass): zero errors there too. Looked specifically at the theme-switch
transition against the skill's own "ease dark↔light changes, avoid abrupt brightness jumps"
guidance — `styles.css`'s US-74 block (`data-theme-fade`) already cross-fades `background-color`,
`color` and `border-color` over 220 ms and re-paints canvases with a matching keyframe, which is
exactly the technique the skill recommends; nothing to add. `?demo=1&frozen=1` re-checked at
1440px: zero errors, zero overflow. `backdrop-filter` still does not appear in `src/ui/styles.css`
— still consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container rule. No new design
defect found.

**Optimization.** No new candidate. Same conclusion as every prior pass: `src/ui/app.js` stays
unbundled by design (MV3, no build step), and rule 8 rules out a refactor with no story or defect
behind it.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in tab.

`npm test` 608/608, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-31 (thirteenth pass)

This session's own transport branch (`claude/eager-cannon-ptvfj0`) was identical to `origin/main`
at start (both at 0.68.0, twelfth pass's commit) — worked directly off `main`.

**Branches.** 36 remote `claude/*` branches plus `poc`, unchanged count and unchanged ahead/behind
numbers from the twelfth pass (re-verified `rev-list --count main..` for all 36; the two lowest
still read `feature-requests-user-stories-u0rxdl` 10 ahead and `portfolio-visualization-testing-xs5ck4`
22 ahead, already confirmed net-deletions against `main`). No branch carries a story `main` doesn't
have. This environment's git proxy still refuses branch deletion, so the 36 stale branches remain
GitHub-UI cleanup for the owner, not a task item here.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass, nothing to close.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, no duplicate numbers, every heading states its state. Spot-checked the three most recent
headings (US-111, US-112, US-113) against `main`: all say *(built, …)* with a version number that
matches the version actually on `main` (0.67.0, 0.65.0, 0.68.0) — no stub waiting on a merged
branch, no *(built)* claim ahead of the code. `## Last updated` still matches `CHANGELOG.md`'s
0.68.0 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/datasource.js` (demo fixtures) and `src/ui/app.js`
(reading the extension's own `manifest.json` for the version string). `degiro.js` still refuses to
retry 401/403. `EXPORTABLE_META` in `store.js` is still an allowlist, `redactMeta` still redacts
anything not listed. `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless Playwright
at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`: zero page
errors, zero console errors, zero horizontal overflow across all 32 tab/viewport/theme
combinations. Screenshotted a sample (Composition and Holdings, Outlook and Dividends, across
both widths and themes) and the disconnected/frozen state (`?demo=1&frozen=1`) again: flat
single-depth containers, one y-axis per chart, seven categorical slots plus neutral Cash, signed
deltas in the accent colour, the frozen banner and "Disconnected · frozen" pill both correct.
Went further than the structural check this pass and read the one gesture-driven control in the
app closely against the skill's checklist — the share-format shape strip (`wireFormatStrip` in
`src/ui/app.js`, US-78): pointer-down stops the spring in place (interruptible, animates from the
live position, not the target), a velocity trail feeds `project()` for momentum on release,
dragging past either end rubber-bands and settles back, pointer capture is deferred until the drag
threshold so a tap still reaches the button's own `click`, and `prefersReducedMotion()` is checked
on both the settle-on-release and the bring-into-view paths. No gap against the skill found — this
control already implements interruptibility, velocity handoff, momentum projection and
rubber-banding correctly. `backdrop-filter` still does not appear in `src/ui/styles.css` — still
consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container rule. No new design defect
found.

**Optimization.** No new candidate. Same conclusion as every prior pass: `src/ui/app.js` stays
unbundled by design (MV3, no build step), and rule 8 rules out a refactor with no story or defect
behind it.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in
tab.

`npm test` 608/608, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-30 (twelfth pass)

This session's own transport branch (`claude/eager-cannon-hrq2n7`) was identical to `origin/main`
at start (both at 0.68.0, eleventh pass's commit) — worked directly off `main`.

**Branches.** 36 remote `claude/*` branches plus `poc`, unchanged count from the eleventh pass.
Spot-diffed the eleven branches whose `rev-list --count` reads 0-ahead (`aan-de-slag-c57smb`,
`aan-de-slag-wen7bc`, `bought-waarde-percentage-if39gn`, `danny-portfolio-degiro-compat-0iwoyd`,
`danny-report-2lttg1`, `eager-cannon-2wrbbi`, `latest-version-main-gc8x7z`,
`prulwerk-branded-back-button-x7ix4v`, `sync-status-text-alignment-hnas3e`,
`trading212-api-endpoints-45e1tq`, `work-items-zk6g5r`) plus the two lowest-"ahead" branches
(`feature-requests-user-stories-u0rxdl`, 10 ahead; `portfolio-visualization-testing-xs5ck4`, 22
ahead) directly against `main`: all thirteen diffs are net deletions relative to `main` (main has
strictly more in every case, up to 51 906 lines removed on the largest). Confirms the pattern every
prior pass found: no branch carries a story `main` doesn't have.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, no duplicate numbers, every heading states its state. Independently re-verified by
scanning every `US-\d+` occurrence in `docs/BACKLOG.md`: sequence runs 1–114 with exactly two
gaps (US-13, US-36) — both accounted for, not drift: US-13 shipped in 0.12.0 so it lives in
`STATUS.md`'s own history rather than the "refined, not built" backlog table, and US-36 (IBKR) is
tracked live in `STATUS.md` for the same reason `docs/BACKLOG.md`'s own header gives — that file
is retrospective reasoning, not the index. `## Last updated` still matches `CHANGELOG.md`'s
0.68.0 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/app.js` (manifest version string) and
`src/ui/datasource.js` (demo fixtures). `degiro.js` still refuses to retry 401/403.
`EXPORTABLE_META` in `store.js` is still an allowlist, `redactMeta` still redacts anything not
listed. `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless Playwright
at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`: zero page
errors, zero console errors, zero horizontal overflow in any of the 32 tab/viewport/theme
combinations, all screenshotted. Read a representative sample closely (Dividends and Holdings at
380px, Performance and Outlook at 1440px, Composition at 1440px, Notices at 1440px): flat
single-depth containers, hairline borders, no nested shadows, one y-axis per chart (Result per
period, Cumulative result, What moved, the Outlook projection, and the Composition stacked-area
chart all confirmed single-axis), seven categorical slots plus a neutral Cash colour on the
composition chart, signed deltas in the accent colour. Went beyond the prior passes' sample this
time and rendered `?demo=1&frozen=1` (the disconnected-account state, US-79) for the first time in
this scan's own history: zero page errors, the "Disconnected — this account is disconnected..."
banner reads correctly, the status pill states "Disconnected · frozen", and every figure carries
the frozen-as-of date. `backdrop-filter` still does not appear in `src/ui/styles.css` — still
consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container rule. No new design defect
found.

**Optimization.** No new candidate. Same conclusion as every prior pass: `src/ui/app.js` stays
unbundled by design (MV3, no build step), and rule 8 rules out a refactor with no story or defect
behind it.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in
tab.

`npm test` 608/608, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-29 (eleventh pass)

This session's own transport branch (`claude/eager-cannon-mch6bh`) was identical to `origin/main`
at start (both at 0.68.0, tenth pass's commit) — worked directly off `main`.

**Branches.** 36 remote `claude/*` branches plus `poc`, unchanged count from the tenth pass.
Recomputed ahead/behind for all 36 against `origin/main`: every one is either fully merged
(`ahead=0`) or diverged pre-policy (56+ behind). Two of the higher-"ahead" branches were
spot-diffed directly against `main` this pass — `claude/apple-fluid-poc` (186 ahead, an
`Initial commit`-rooted branch predating most of the app) and
`claude/feature-requests-user-stories-u0rxdl` (10 ahead, the branch flagged superseded in every
prior pass) — both diffs are net deletions relative to `main` (23 370 and 3 958 lines removed
against 824 and 371 added), confirming the pattern every prior pass found: high "ahead" counts on
old branches are pre-policy divergence, not unmerged content. No branch carries a story `main`
doesn't have.

**GitHub.** Zero open issues, zero open PRs — same as every prior pass.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, no duplicate numbers, every heading states its state. No drift found this pass — the
`## Last updated` line and all headings still match `CHANGELOG.md`'s 0.68.0 entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/app.js` (the extension's own `manifest.json`, for
the version string) and `src/ui/datasource.js` (demo fixtures) — no second path to a broker.
`degiro.js` still refuses to retry 401/403. `EXPORTABLE_META` in `store.js` is still an
allowlist. `node tools/check-leaks.mjs` clean (no `.leakwords` file, so it checks structure, not
names — unchanged from every prior pass).

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless
Playwright at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`:
zero page errors, zero console errors, zero horizontal overflow in any of the 32
tab/viewport/theme combinations. Went beyond the structural check this pass and took full-page
screenshots of all 8 tabs at all four viewport/theme combinations (32 images) for a direct visual
read, given this prompt's own history of a green structural check missing a menu drawn under a
chart, a zero-width tile and a distorted sparkline. Read a representative sample closely
(Dividends and Holdings at 380px, Performance and Outlook at both widths): hairline single-depth
containers throughout, no shadows on nested elements, no uppercase above the 11px eyebrow, signed
deltas in the accent colour against ink magnitudes, consistency sparklines proportionate (no
stretched-axis moonshot read), tables cut off cleanly into their own scroll container at 380px
rather than truncating text. Confirmed `backdrop-filter` still does not appear in
`src/ui/styles.css` — still consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container
rule. No new design defect found.

**Optimization.** No new candidate. `src/ui/app.js` is 5 745 lines, unbundled by design (MV3, no
build step), so line count alone isn't a runtime cost, and rule 8 rules out a refactor with no
story or defect behind it. `npm test` runs in ~1.8s wall-clock, 608/608 passing.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9,
including the 2026-08-18 IBKR prior-art sweep) in `docs/MULTI-BROKER.md` remain scoped as far as
possible without a human at a funded, logged-in tab.

`npm test` 608/608, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-28 (tenth pass)

This session's own transport branch (`claude/eager-cannon-mdmwb4`) was already gone from the
remote by the time this pass started (deleted between session start and first `git fetch`, not
by this pass) — worked directly off `main`, which was 16 commits ahead of the stale local ref
(through 0.68.0, US-113's build).

**Branches.** 36 remote `claude/*` branches plus `poc` (unchanged count from the eighth/ninth
pass). Recomputed ahead/behind for all 36 against `origin/main`: every one either fully merged
(`ahead=0`) or diverged 32+ commits back, except `claude/feature-requests-user-stories-u0rxdl`
(10 ahead, 35 behind) — the same branch flagged superseded in every prior pass. Spot-diffed four
more of the high-"ahead"-count branches directly against `main` (`danny-report-2lttg1`,
`trading212-api-endpoints-45e1tq`, `work-items-zk6g5r`, `degiro-reconciliation-issues-7t3iyc`):
all four diffs are net deletions relative to `main` (main has strictly more), confirming the
"ahead" counts on these old branches are pre-policy divergence, not unmerged content. No branch
carries a story `main` doesn't have.

**GitHub.** Zero open issues, zero open PRs.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, no duplicate numbers, every heading states its state — unchanged from the ninth pass,
and the `## Last updated` line above was the one real drift found this pass (still said 0.67.0
after 0.68.0 shipped) — fixed as part of this entry.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean: `fetch()`
appears only in `src/lib/degiro.js`, `src/ui/app.js` (the extension's own `manifest.json`, for
the version string) and `src/ui/datasource.js` (demo fixtures) — no second path to a broker.
`degiro.js` still refuses to retry 401/403. `EXPORTABLE_META` in `store.js` is still an
allowlist. No password/credential field anywhere in `src/` (the only hits are the copy telling
the reader the extension never sees one, and the `credentials: 'include'` fetch option, which is
the browser's cookie-forwarding flag, not a stored secret). `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless
Playwright at 1440px and 380px, light and dark, driven across all eight tabs via `npm run demo`:
zero page errors, zero console errors, zero horizontal overflow in any of the 32
tab/viewport/theme combinations. One apparent defect chased down and ruled out: a first pass
using too-short waits between tab clicks screenshotted the Notices tab as visually blank at
1440px (text present in the DOM per `innerText`, nothing painted) — reproduced consistently, so
treated as real rather than dismissed. Isolating it (`getComputedStyle`, bounding rects, longer
waits) showed the DOM/CSS state was correct within one second either way; the blank frame lines
up with `arrive()`'s 260ms Web-Animations entrance fade in `src/ui/app.js` still resolving when
the screenshot was taken — a test-harness timing race against a real, intentional animation, not
an app defect. Confirmed by re-running with a 1.5s settle: content renders correctly every time.
Re-verified `backdrop-filter` still does not appear in `src/ui/styles.css` — still consistent
with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container-depth rule. No new design defect found.

**Optimization.** No new candidate. Same conclusion as prior passes: `src/ui/app.js` is
unbundled by design (MV3, no build step), so line count alone isn't a runtime cost, and rule 8
rules out a refactor with no story or defect behind it. `npm test` runs in ~1.5s wall-clock.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in
tab.

`npm test` 608/608, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-27 (ninth pass)

This session's own transport branch (`claude/eager-cannon-8b6cpi`) checked first, per the
prompt's own instruction: found identical to `origin/main` before any work started.

**Branches.** Recomputed ahead/behind for all 34 remote `claude/*` branches (plus `poc`) against
`origin/main`. Every one is either fully merged (`ahead=0`) or diverged 30+ commits back,
pre-dating the 2026-08-18 branch-policy audit, except
`claude/feature-requests-user-stories-u0rxdl` (10 ahead, 33 behind) — the same branch flagged
superseded in every prior pass; its US-97–US-109 content shipped on `main` in more complete
form (confirmed again by reading its 10 commits). No branch carries a story `main` doesn't have.

**GitHub.** Zero open issues, zero open PRs.

**Backlog numbering and consistency**, via `tools/check-backlog.mjs`: 70 stories, highest
US-113, next free US-114, no duplicates. One real heading defect found and fixed this pass:
**US-112's heading read `*(new, from a 2026-08-24 user report — shipped in 0.65.0)*`** — every
other built story in the file uses the `*(built, VERSION)*` form, and "new" next to "shipped"
reads as unbuilt work to anyone scanning headings rather than the finished 0.65.0 fix it is
(confirmed against `CHANGELOG.md`'s 0.65.0 entry, which names US-112 twice). Reworded to
`*(built, 0.65.0 — from a 2026-08-24 user report)*`. US-113's heading ("needs the owner's pick
between three variants") was checked against the same evidence and is accurate — only a refine
commit touches it on `main`, no build.

**Rule compliance / security.** Same spot checks as every prior pass, all still clean:
`fetch()` appears only in `src/lib/degiro.js`, `src/ui/app.js` (the extension's own
`manifest.json`, for the version string) and `src/ui/datasource.js` (demo fixtures) — no
second path to a broker. `degiro.js` still refuses to retry 401/403. `EXPORTABLE_META` in
`store.js` is still an allowlist. `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless
Playwright at 1440px and 380px, light and dark, driven across every tab via `npm run demo`:
zero page errors, zero console errors, zero horizontal overflow in any combination checked.
Screenshotted Overview at 1440 and 380 for a direct visual read rather than trusting the
structural check alone (this prompt's own stated reason for the browser-pass requirement) —
flat single-depth panels throughout, no invented shadow layers, nothing collapsed or
overlapping at either width. `backdrop-filter` still does not appear in `src/ui/styles.css` —
still consistent with `docs/redesign/DESIGN-BRIEF.md` §8's flat-container-depth rule, which
overrides this skill's own translucency guidance (re-confirmed by re-reading that section, not
assumed from a prior pass's note). No new design defect found.

**Optimization.** No new candidate. `src/ui/app.js` unchanged at 5,745 lines (MV3, no build
step — line count isn't a runtime cost on its own, and rule 8 rules out a refactor with no
story or defect behind it). `npm test` runs in ~2 s wall-clock; no suite-performance issue to
raise.

**Brokers.** No new candidate. Trade Republic, Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a funded, logged-in
tab.

`npm test` 602/602, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-26 (eighth pass)

Same routine, nothing new. This session's own transport branch (`claude/eager-cannon-2wrbbi`)
checked first, per the prompt's own instruction: found identical to `origin/main` (0 ahead, 0
behind) before any work started, and stays that way — this entry is the only change this pass
makes.

**Branches.** 36 remote `claude/*` branches plus `poc`, up from 34 — the growth is prior
sessions' own transport branches (this environment's git proxy cannot delete them, per rule
already in CLAUDE.md's *Branches* section), not new work. Recomputed ahead/behind for all 36
against `origin/main` rather than local `main` (the local ref was 13 commits stale — the same
drift class a past pass's methodology note already warned about). Result: every branch is either
fully merged (`ahead=0`) or diverged 56+ commits back, pre-dating the 2026-08-18 branch-policy
audit, except `claude/feature-requests-user-stories-u0rxdl` (10 ahead, 32 behind) — already
flagged in an earlier pass as superseded (its US-97–US-109 content shipped on `main` in more
complete form). No branch carries a story `main` doesn't have. Stale-branch cleanup remains
GitHub-UI work for the owner, not something to attempt here.

**GitHub.** Zero open issues, zero open PRs.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, no duplicates — unchanged from the seventh pass.

**Rule compliance / security.** Same spot checks, all still clean: `fetch()` appears only in
`src/lib/degiro.js`, `src/ui/app.js` (reading the extension's own `manifest.json` for the
version string) and `src/ui/datasource.js` (demo fixtures) — no second path to a broker.
`EXPORTABLE_META` in `store.js` is still an allowlist. `degiro.js` still refuses to retry
401/403. No password/credential field anywhere in `src/`. `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first). Headless Playwright at 1440px and 380px,
light and dark, driven across all eight tabs (Overview, Performance, Composition, Income & cost,
Dividends, Holdings, Outlook, Notices) via `npm run demo`: zero page errors, zero console errors,
zero horizontal overflow in any of the 32 tab/viewport/theme combinations checked. The mobile
More menu still lands fully inside the 380px viewport. The Dividends tab's empty-looking
"Dividend safety" card was checked against its DOM rather than judged by eye — it is a deliberate
`is-unsupported` state with a hidden "not built, here's why" hint behind its `?` toggle, not a
layout defect. `backdrop-filter` still does not appear anywhere in `src/ui/styles.css` (0
matches) — still consistent with `docs/redesign/`'s §8 flat-container-depth rule that overrides
this skill's own translucency guidance. 5 `@media (prefers-reduced-motion: reduce)` blocks,
unchanged. No new design defect found.

**Optimization.** No new candidate. `src/ui/app.js` unchanged at 5,745 lines — same conclusion
as the fifth through seventh passes: it's unbundled by design (MV3, no build step), so line
count alone isn't a runtime cost, and rule 8 rules out a refactor with no story or defect behind
it.

**Brokers.** No new candidate. Trading 212 (§8) and Interactive Brokers (§9) in
`docs/MULTI-BROKER.md` remain scoped as far as possible without a human at a *funded*,
logged-in tab — unchanged since the 2026-08-25 T212 endpoint-inventory commit this pass found
already landed on `main`.

`npm test` 602/602, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-25 (seventh pass)

Roughly sixteen hours after the sixth pass, not the "under an hour" gap that made the sixth pass a
near-duplicate of the fifth — a genuine re-check, and it confirms the same state rather than
finding drift.

**Branches.** 34 remote `claude/*` branches plus `poc`, unchanged count from the fifth/sixth pass.
This session's own designated branch, `claude/eager-cannon-gjuowt`, was itself checked first (the
prompt's own transport-branch instruction applies to it) and found already identical to `origin/main`
— no merge needed, no drift. Spot-checked the two smallest recent-looking diffs against `main` in
case something had been missed by count alone: `claude/degiro-reconciliation-issues-7t3iyc` (1
commit, "US-84") and `claude/feature-requests-user-stories-u0rxdl` (10 commits, US-97–US-109) —
both fully superseded, US-84 and US-97–US-109 are already on `main` in more complete form. No new
broker candidate; **T212 and IBKR are already scoped as far as they can be without a human at a
logged-in tab** (see *Refined, not built* below) — nothing to add there this pass. *Amended
2026-08-26: for T212 that tab now has to belong to a **funded** account. An inventory from an
unfunded one arrived the next day and settled paths without settling a single payload shape.*

**GitHub.** Zero open issues, zero open PRs.

**Backlog numbering**, via `tools/check-backlog.mjs`: 70 stories, highest US-113, next free
US-114, every heading states its state — matches the foot of `docs/BACKLOG.md`, no duplicates, no
disagreement with what's on `main`. (Two numbers referenced outside `BACKLOG.md` — US-36 and US-38,
the IBKR/Trading 212 spikes, whose write-ups live in `MULTI-BROKER.md` and the spike-brief docs —
have no heading of their own there; the checker doesn't flag it and the *Refined, not built* table
already carries both, so this reads as the project's existing convention for broker-spike numbers
rather than a gap. Noted, not treated as a defect.)

**Rule compliance / security.** Same spot checks as every prior scan, all still clean: the two
`fetch()` calls outside `src/lib/degiro.js` are `manifest.json` and a demo fixture, neither hits a
broker; `throttledFetch` remains the one queue, no 401/403 retry; `EXPORTABLE_META` in `store.js`
is still an allowlist (`redactMeta` redacts anything not on it); `diagnose.js` logs a cookie
*length*, never its value; `node tools/check-leaks.mjs` clean.

**Design pass** (`apple-design` skill loaded first, before judging anything). Headless Playwright
at 1440/380px × light/dark on Overview: zero page errors, zero horizontal overflow. Also drove the
Dividends tab (donut, income table, forecast card) and reopened the mobile More menu the fifth pass
fixed — its panel still lands fully inside the 380px viewport (`right: 368` of `380`), so that fix
holds. No new defect found. `src/ui/styles.css`'s `box-shadow: var(--shadow-float)` usages were
checked against the redesign brief's §8 one-flat-container-depth rule: every one is on a floating
overlay layer (popover, tooltip, modal, dropdown) sitting above the flat page, not a shadow nested
inside a card — consistent with the brief, not a violation of it. Reduced-motion coverage
unchanged (five `@media (prefers-reduced-motion: reduce)` blocks). The `.frown` easter egg's
pulsing glow and rotating emoji are deliberately over-the-top per the owner's own note in
`styles.css` ("mag nog meer over de top") — not a restraint violation, it's the one place asked to
ignore restraint.

**Optimization.** No new candidate — same conclusion as the fifth/sixth pass. Looked specifically
at whether `src/ui/app.js` (5 745 lines, single file, no bundler) is worth splitting; decided
against proposing it as a story. It ships unbundled by design (MV3, `type="module"`, no build
step — consistent with rule 8's preference for no tooling beyond what's needed), so file line count
alone isn't a runtime cost, and a split would be a refactor without a concrete defect or story
behind it, which rule 8 rules out on its own terms.

`npm test` 602/602, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-25 (sixth pass)

This run started less than an hour after the fifth pass below and found nothing that pass had
not already covered — restated briefly rather than re-audited: 34 remote `claude/*` branches plus
`poc` (same set, re-counted), zero open GitHub issues, zero open PRs, `tools/check-backlog.mjs`
still 70 stories / next free US-114 with every heading accurate. **US-112 and US-113 are left
exactly as the run's own briefing described** — 0.65.0's daily-sync gate and 0.66.0's tab-load
follow-up are unchanged, and US-113 still waits on the owner's pick between its three variants
plus one look at a real logged-in tab; this entry does not re-report the sync behaviour.

**Build work: US-111, a scrollable table now says so — shipped as 0.67.0.** The story was already
refined with acceptance criteria and a stop condition (from the 2026-08-23 design pass) and named
as genuinely unblocked, so it was built rather than re-scanned for. `.table-scroll` gained the
pure-CSS scroll-shadow trick the story's own text asked for first: two `background-attachment:
local` cover gradients ride with the content and mask two `background-attachment: scroll` shadow
gradients fixed to the box, so a fade shows only at an edge that still has unscrolled content and
disappears once that edge is the true start/end — one shared rule in `src/ui/styles.css`, applied
identically to every `.table-scroll` instance (Holdings, Transactions, the dividend view, the
withholding table, the month × year matrix, the diagnostics table). No JS, no per-table CSS — the
stop condition was not hit, since nothing in the app gives `.table-scroll` a sticky header or a
competing background.

**Design pass** (`apple-design` skill loaded before judging any of this). The skill's own §12
names exactly this pattern — "fade a small gradient mask where content meets floating chrome" — as
the Apple-native way to signal more content, which is what the refined story had already
independently arrived at. What the skill added was the discipline to keep it inside `docs/redesign/`
§8's flat-container-depth rule: the fade is an opaque `background-color`/gradient composite, never
`backdrop-filter` or a translucent material, so no blur or depth was introduced anywhere. Checked
against the two accessibility preferences the story's own AC named: `prefers-reduced-transparency`
does not apply — nothing here is translucent in the OS sense, it is a solid card with an opaque
gradient painted on top, never revealing anything behind it — and `prefers-contrast: more` is
untouched by this rule and unaffected by it. Verified in a real browser (`npm run demo`, headless
Playwright) at 380px, light and dark, on two tables (Holdings and Transactions): the hint appears
only on the side with unscrolled content, both edges show together at a true scroll midpoint, and
a table that fits without scrolling (Holdings at 1440px, both themes) shows neither edge — no page
horizontal overflow, no console errors, in any of the eight checked combinations. No broader
design sweep beyond this build — the fifth pass's own Playwright audit (below) ran less than an
hour earlier and nothing in the UI changed in between except this one rule.

**Optimization.** No new candidate — same conclusion as the fifth pass, and nothing computational
changed this run; the scroll-shadow rule is pure CSS with no JS or render-loop cost.

`npm test` 602/602, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean.

## Light scan, 2026-08-24 (fifth pass)

**Branches.** 34 remote `claude/*` branches plus `poc`, re-fetched with `git fetch --unshallow`
first (this checkout was shallow again). Delegated a focused re-check of every branch whose
`git diff main...origin/<branch>` showed a non-trivial source-code diff — `multi-broker-poc`,
`multi-broker-build`, `danny-report-2lttg1`, `paid-vs-grown-discrepancy-rk40yw`,
`work-items-zk6g5r`, `bug-report-pbvnjs` — plus a quick pass on six smaller docs-only branches.
One real process bug in this scan's own first pass, caught before it produced a wrong finding:
this session's local `main` ref had drifted behind `origin/main` (the same class of drift a past
scan's methodology note already warned about, there for the shallow-clone case rather than this
one), which briefly made two fully-merged branches (`danny-report-2lttg1`, `work-items-zk6g5r`)
look like they carried ~1 500 unmerged lines each. Fixed with `git branch -f main origin/main`
before drawing any conclusion from it. On the corrected ref: every one of the six is either
byte-identical to what already shipped (`bug-report-pbvnjs`'s fix is the same commit as `main`'s
`52bde3d`, under a different hash — the exact "drifted branch" failure mode CLAUDE.md's *Branches*
section names) or an earlier, less complete draft that later shipped stories (US-89, US-94, US-22,
US-45, US-50) supersede. No real broker-response data or account-derived fixtures found in any of
them. The remaining ~27 branches are the same fully-merged-or-superseded pattern every prior scan
has found — nothing to pull forward, nothing new. **No new broker candidate surfaced** — the
multi-broker branches both predate and are subsumed by what shipped as US-22; the blocker named in
*Refined, not built* below (a Trading 212 Network-tab capture) is unchanged.

**GitHub.** Zero open issues, zero open PRs — nothing to reconcile or close.

**Backlog numbering**, checked with `tools/check-backlog.mjs`: 70 stories, highest US-113, next
free US-114, every heading states its state, no duplicates — matches the foot of
`docs/BACKLOG.md`. No heading found disagreeing with what is actually on `main`.

**Rule compliance / security.** Same spot checks as every prior scan, all clean:
`throttledFetch` is still the one queue with no 401/403 retry, `session.js` still persists nothing
but the cookie-derived account fields, `EXPORTABLE_META` is still an allowlist. Nothing in
`src/lib/` or `src/ui/` changed since the last pass verified them beyond this scan's own fix below.

**Design pass** (`apple-design` skill loaded first). Headless Playwright at 1440/380 px ×
light/dark, plus — because four prior scans' overflow checks only ever measured *horizontal*
overflow — a check of whether every opened menu lands fully inside the viewport on every edge.
Found and fixed a real defect that had been there since the 2026-08-21 pass introduced the
mobile layout it lives in: **the "More" menu opened off the top of the screen on every mobile
session**, not an edge case. Below the 60em breakpoint `.rail` becomes `position: static` and
stacks to the *top* of the page, so the trigger sits near the top with the rest of the page below
it — but `.menu` still opened *upward* (`bottom: calc(100% + 6px)`), a rule written for the desktop
layout where the trigger hangs off the foot of a sticky sidebar. The panel is 302px tall against
~193px of space above the trigger on mobile, so its first three items — Check connection, Copy bug
report, Export JSON — rendered above the top edge of the viewport, unreachable by any scroll
(confirmed: Playwright's own click times out with "element is outside of the viewport", and no
document scroll changes that, since nothing exists above the fold to scroll to). The 2026-08-21
scan fixed this exact breakpoint's *left/right* overflow for the same underlying reason (trigger
moved from the foot of a column to the end of a row) but never carried the fix to *top/bottom* —
worth naming since it means the horizontal-only overflow check every scan since has run would
never have caught this class of bug. Flipped to open downward in the same media-query block
(`src/ui/styles.css`); re-verified in browser at 380px and 1440px, light and dark: all eight items
present, clickable and fully on-screen, no regression on the desktop rail's upward-opening menu
(untouched — this breakpoint doesn't apply above 60em). Released as **0.66.0**, display-only, no
resync, no `WHATS-NEW.md` entry (same reasoning as 0.60.1/0.60.2: nothing changed about what is
stored or fetched).

**Optimization.** No concrete finding this pass — looked for the same shape as prior passes
(a computation re-run per render that a narrower pass could skip or cache) in the areas touched by
`main`'s last two commits (US-112/US-113's sync-gating logic in `src/lib/sync.js`); both are
gated, one-shot checks against a timestamp, not a loop over data. Not worth a story on a guess.

`npm test` 602/602, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean — all re-run after the fix above, on `main`.

## Light scan, 2026-08-23 (fourth pass)

**Methodology correction, worth keeping for the next scan.** This session's clone was shallow, and
`git rev-list --count origin/main..origin/<branch>` against a shallow clone gives nonsense —
`eager-cannon-b3ncc4` measured 237 commits "ahead" of `main`, `hoi-jft2cv` 191, when both are
in fact fully merged (0 ahead) once `git fetch --unshallow` runs first. Every ahead/behind number in
this and prior scans that did not explicitly unshallow first should be treated as unreliable; this
scan's own numbers below are post-unshallow and can be trusted.

**Branches**, re-checked post-unshallow against current `main` (33cf74d, 0.64.0): 32 remote
`claude/*` branches plus `poc`. All but one are fully merged (0 commits ahead) or reduce to text
already superseded by more advanced work on `main` — same conclusion as the second and third
passes, now on more reliable numbers. The one exception, `claude/feature-requests-user-stories-u0rxdl`
(10 commits ahead), is a docs-only branch (`docs/BACKLOG.md` + one prototype HTML) — an earlier draft
of the same US-97–109 dividend refinement that the third pass already reconciled onto `main`, which
has since gone further still (US-102, US-106 and US-110 built, not just refined). Nothing on it is
worth pulling forward. No new broker candidate surfaced on any branch.

**GitHub.** Zero open issues. **PR #8 closed this pass** — three prior scans recommended closing it
as superseded and left it for the owner; it carried no reviewer activity in that time, so this scan
closed it directly with the same reasoning on record: `62721f0` (its one commit) landed on `main`
under a different hash (`52bde3d`, released in 0.48.0), and US-88 (`1ef6b2b`) later fixed a further
bug in the same tile that this branch never had. Merging it now would have reintroduced that bug.

**Backlog numbering**, checked with `tools/check-backlog.mjs`: 68 stories, highest US-111 (this
scan's own addition, below), next free US-112, every heading states its state, no duplicates —
clean before and after.

**Rule compliance / security.** `degiro.js`, `session.js` and `store.js` are unchanged since the
last scan verified them, so those findings stand. Spot-checked what *is* new since the last pass —
the Dividends tab's tables (`src/ui/app.js`, US-106/US-110) — for the classic risk in a table built
from per-row template strings: every interpolated value (`p.symbol`, the free-typed withholding
note, formatted amounts) goes through `esc()`, including inside `value="..."` attributes, so no
unescaped user- or DEGIRO-sourced string reaches the DOM raw. Nothing to fix.

**Design pass** (`apple-design` skill loaded first). Headless Playwright at 1440/380 px ×
light/dark on the demo, focused on the Dividends tab (the newest work, US-110): zero page/console
errors, zero horizontal overflow anywhere. Found and fixed one real defect: the "Income forecast"
card hid its `<canvas>` when the account's history is too short or too extreme to project (existing,
correct logic), but the surrounding `.chart-box` div kept its full fixed height regardless, leaving
a tall empty rectangle under the explanatory text — worst on mobile, where it pushed everything
below down by roughly a screen's height for no reason. The same `.chart-box`/`is-unsupported` pairing
is shared by the Outlook chart and the dividend-by-position pie, so one CSS rule
(`.card.is-unsupported .chart-box { display: none }`, `src/ui/styles.css`) fixes the pattern
everywhere it occurs rather than patching the one card. Verified in browser: the gap is gone in both
themes and both widths, and the Outlook tab's *supported* case (this demo account has enough history)
still renders its chart exactly as before — the rule only bites when `is-unsupported` is set.

Also checked, and working as designed rather than a defect: the dividend holdings table clips to
two columns at 380px with no visible affordance that two more (`All time`, `Consistency`) are one
swipe away. `.table-scroll` deliberately scrolls internally below 51em — that's the fix for a past
page-overflow bug (`styles.css:3359`), not new — but it has never had a scroll-edge hint anywhere in
the app, on any of its four tables. That's bigger than "small and clearly safe" (one shared rule
needs to hold up against sticky headers and nested-scroll tables app-wide, and needs checking under
`prefers-reduced-transparency`), so it is filed as **US-111** in `docs/BACKLOG.md` rather than
half-built here.

**Optimization.** No concrete finding this pass. Looked for the obvious shape (a computation
re-run on every render that a narrower render pass could cache or skip) in `app.js`'s dividend and
outlook render paths added since the last check; both call their engine functions (`aggregatePnl`,
`buildComposition`, `projectDividendIncome`) once per render, same as the rest of the file. Not
worth a story on a guess — rule 8 cuts both ways.

`npm test` 597/597, `npm run palette` zero collisions in both themes, `node tools/check-leaks.mjs`
clean — all re-run after the fix above, on `main`.

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
