# Changelog

Notable changes per release. Entries are written for someone deciding whether to resync, so
they say what was wrong and what it did to the numbers, not which functions moved.

There is a second changelog beside this one: **[WHATS-NEW.md](WHATS-NEW.md)**, in Dutch, written
for whoever is using the extension rather than building it. It covers **only the latest release** and
is rewritten each time, so this file is the history and that one is the announcement. Anything a
reader would notice goes in both — see [CLAUDE.md](CLAUDE.md) for which entries those are.

This file is updated in the same commit as the change it describes. Every story lands as one
commit carrying its identifier, so a single change can be undone with
`git revert <sha>` — see [docs/BACKLOG.md §6](docs/BACKLOG.md) for what that does and does not
buy you.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are
plain increments — this is not a library and nothing depends on its API.

## [Unreleased]

### Added

- **US-71 (second half) — the figure-carrying charts have a table twin.** Result per period, the
  cumulative result, deposits and dividends each carry a *Show as a table* link that swaps the canvas
  for the same numbers as rows. A tooltip needs a pointer and a hover; a screen reader has neither,
  and neither does anybody reading a screenshot. The cumulative twin also states, per period, whether
  its prices were measured or estimated.

- **US-72 — the end of the line, without hovering for it.** The cumulative, invested-vs-value and
  dividend charts carry a dot and one label at their last point, clamped inside the plot. One label,
  not a number beside every point — and not on the value chart, whose KPI tile already says that
  figure.

- **US-73 — a notice opens its own row instead of shoving the page.** `#notices` was appended to and
  emptied outright, so during a sync the figures below jumped in one frame, twice per notice, while
  you were reading them. The row now grows and collapses; rewriting a progress banner's text does not
  reopen it, which matters because a sync rewrites the same banner seven times.

- **US-74 — the theme change is a cross-fade.** Light to dark went from near-white to near-black in a
  single frame, the app's one abrupt brightness jump. It is 220 ms of colour now — and deliberately
  alive under `prefers-reduced-motion`, because there is no travel in it and the jump is the thing
  being softened. The canvases cannot cross-fade, so they fade *in* on the new theme over the same
  duration rather than snapping inside a page that does not.

- **US-75 — the data arrives, and the page says so.** The moment a sync landed, the whole screen
  filled in one frame. Cards now rise and fade in document order, charts reveal behind a soft
  left-to-right mask, table rows stagger with a cap, and a card below the fold waits until you scroll
  to it. Once per sync and never per render: a page that flourishes every time you press 3M is a page
  you stop reading.

  The reveal is a mask over a drawing Chart.js has already finished, which is what keeps
  `animation: false` off — a chart that animates its own data looks like it is computing while you
  watch. Nothing waits for it, and no value moves: every element holds its final string.


- **US-71 (first half) — every chart says what it shows.** Thirteen canvases carried no `role`, no
  label and no table equivalent, so a screen reader got **nothing** — not a value, not even *"a
  chart"*. Each now carries `role="img"` and a sentence generated from the same array it draws:
  where the series started and ended and which way that is, the extreme it reached and when, or for a
  row of bars how many periods and the best and worst, or for a part-of-whole the shares and the tail
  it did not name.

  Three shapes rather than thirteen sentences, because a bespoke sentence per chart is a sentence the
  fourteenth chart ships without — and a test now fails if a builder draws a chart nobody can read.
  Derived at render from the arrays, so a summary cannot drift from the picture beside it.

  Amounts in a summary mask under anonymize, and they do so without the module knowing what a mask
  is: the caller hands in the page's own formatter. Dates and percentages stay — US-46 hides what you
  have, not when. An estimated stretch says so, like US-62's readout does. And Optimism Mode's two
  charts carry *NOT THE REAL NUMBERS* in their label, because a reader who cannot see the stamp is
  the one person the joke could actually mislead.

  **The table twin (AC2) is not built.** This half takes every chart from silent to described; the
  twin gives exact values on the charts that carry figures, and it is a separate piece of work.


- **US-69 / US-70 — the overlays come from the control that opened them.** The overflow menu, the
  granularity menu, the column chooser and the diagnostics backdrop all appeared and vanished with no
  path and no origin. Each now scales and fades from the corner it hangs off — the rail menu from the
  foot of the rail, the granularity from under its label, the column chooser from its button's corner
  — and closing mirrors opening along the same path, a little shorter, because opening is an
  announcement and closing is an answer.

  No timer decides when a surface is gone: `@starting-style` and `allow-discrete` do it from CSS, so
  there is no class left stuck when something interrupts. A closed overlay is still `display: none`
  rather than a transparent one that takes clicks — that has shipped here before in another form.

  Underneath: two durations and one curve, named once. Every transition used to pick its own — `120ms
  ease`, `0.12s` with no curve at all, `100ms ease-out`, `0.15s ease` — none wrong, none shared, so
  the fifth would have been a fifth guess. The refinement asked for a second curve as well; nothing in
  this build travels across the screen, so it is not defined, and a test fails if a token lands
  without a caller.


- **US-57 — the share sheet arrives as an object.** Motion only: it moves no value and adds no field,
  and a test pins both allowlists literally so that stays true.

  The sheet **materializes** — blur and scale move together on open, so it reads as a pane of glass
  arriving rather than a picture becoming opaque, and the close runs the same path backwards. Grab it
  again mid-close and it reverses from where it is; the dialog only actually closes when the
  animation finishes, and a cancelled close is swallowed, because a cancelled close means somebody
  re-opened it.

  The four shapes are now a **strip you can flick** rather than four words: each draws itself at its
  own aspect ratio, and a flick throws it with the same momentum projection the value chart uses —
  one motion vocabulary, from one module, because two springs with different feels on one page read
  as two products.

  They are still buttons in a group, and tabbing to one brings it into the window without selecting
  it: two of the four sit outside the strip and are in the tab order, so without that the gesture
  would have quietly replaced the accessible path.

  `prefers-reduced-motion` makes the arrival a short fade with no travel; `prefers-reduced-transparency`
  drops the blur and keeps the scale, because glass with nothing behind it is only a slow fade.


- **US-58 — the type scale is measured.** Tracking and leading are size-specific: display text wants
  negative tracking and tight leading, body wants near-zero and comfortable, small uppercase labels
  want positive tracking or the caps run together. Those values were already in the stylesheet and
  already correct — scattered across the rules that used them, with nothing that would notice them
  collapsing back to one global value, which is the failure mode a single `letter-spacing` has.

  `npm run type` reads the tokens out of `styles.css` and fails on a fixed global letter-spacing and
  on any display-sized rule that is not negatively tracked, naming which. It runs in `npm test`
  alongside `npm run palette`, and it has been watched failing on both regressions rather than only
  on passing.

  `font-optical-sizing: auto` is declared, and here is the plain version of what it does: **no font
  is bundled** — the stack is the system UI face — so it acts where that face carries an optical axis
  (Apple, recent Windows) and is inert elsewhere. The tracking and leading buckets are the part that
  works everywhere.


- **US-56 — the page answers three accessibility preferences, and two of them it had never been
  asked.** `prefers-reduced-motion` was already handled in five places. `prefers-reduced-transparency`
  and `prefers-contrast: more` were absent entirely, so a reader who had set either got the default
  page with nothing to show it had been considered. Both are token overrides rather than
  per-component rules, so a control added next year inherits them by using the tokens.

  And a press that is dragged away from now stops looking pressed. CSS `:active` gets the press right
  and the cancel wrong: a held mouse button keeps `:active` on the element it started on even after
  the pointer has left, because the browser captures the pointer there. The click was already
  abandoned — one only fires when press and release share an element — but the control went on
  looking armed, which is the opposite of what backing out of a press is for. Returning to it re-arms.

  Nothing a warning is drawn in is weakened by any of the three: the reconciliation red, the
  price-gap amber and the critical tone resolve identically under all of them, checked in a browser
  and pinned by a test.



- **US-64 — a section arrives instead of cutting.** Switching rail routes swapped instantly. The new
  section now rises a few pixels and fades in over a quarter of a second, on transform and opacity
  only — animating a height would reflow the whole grid on every route change, and on a page of
  charts that is expensive as well as janky.

  It is decoration over an already-usable page: the section is shown and interactive before the
  motion starts, and nothing is locked out while it runs. Flicking through the rail leaves one
  section arriving rather than five queued behind each other. `prefers-reduced-motion` keeps a short
  fade and drops the travel — something appearing helps you follow where you are; the journey is the
  part that does not.


- **US-65 — a figure that changed says so, without ever showing a figure that was not true.** Change
  the range and the hero numbers used to jump. The obvious move is a count-up tween, and it stays
  rejected: every frame of a count-up renders a value the account never had. The honest form is a
  **swap** — the old string leaves, the new one arrives, and there is nothing in between.

  That is a different mechanism, not a gentler one. A tween interpolates the *number*; this animates
  the *element*, in CSS, which has no access to the digits at all. Measured rather than asserted: a
  browser sampled every figure on every frame across a range change, and each changed one showed
  exactly two distinct strings and never a third.

  Only figures that actually changed swap — two of seven on a 1M switch — and `prefers-reduced-motion`
  makes it an instant replacement rather than a slower fade.


- **US-55 / US-63 — the drag on the value chart has physics.** Built together, because they are the
  same gesture on the same surface and the spring, the velocity trail and the day-snap are shared.

  Dragging still tracks the finger 1:1 — an eased drag feels laggy and is not motion the reader
  asked for, it is their own hand. What changed is everything after the finger leaves. **The edge
  settles with a critically-damped spring carrying the release velocity**, so there is no seam
  between dragging and settling; **a flick throws the window**, landing where the momentum projects
  and snapping to the day *there* rather than under the release point; and **dragging past the first
  or last day resists** progressively instead of stopping dead, so the end of the history reads as an
  edge rather than as a control that has frozen.

  Grabbing the edge again while it is still settling takes it over **from where it is on screen** —
  measured at a zero-index jump — because the one thing an interruptible animation must never do is
  teleport to where it was heading.

  Under `prefers-reduced-motion` the tracking stays and only the glide goes: the window applies where
  the finger left it. Reduced motion is a gentler feedback, never no feedback.

  The discrete range buttons are untouched — they are the fast path and the keyboard one, and this is
  an addition to them. Nothing recomputes per frame either: the band and its readout update from
  arrays the chart already holds, and the window applies once, on settle.

  No animation library. MV3's CSP forbids a remote script and the extension is offline by design, so
  the spring is thirty lines in `src/ui/motion.js` — with its physics separated from the frame loop
  so a test can drive it, which is how two defects were found: a spring that never quite finished (so
  the window applied most of a second late), and a velocity read from before the pause a hand makes
  before letting go (so a deliberate drag released on July 2024 was thrown to April 2025).

- **US-62 — the chart says when a day's price was estimated.** Hovering the value chart or the
  cumulative-result chart already drew a crosshair and a readout of the date and the figure, and
  that readout is always a day the series actually holds — Chart.js resolves the pointer to a data
  point, so no number between two days can ever be shown. What it did not say is when that day had
  **no quote** and was valued at the last price the instrument traded at. The holdings row has said
  `est.` about exactly this since 0.46.0; the chart, which is where the number is actually read, said
  nothing.

  At Week or Month the marker is true when *any* day folded into that point was estimated — reading
  only the bucket's last day would let a month of stale prices pass as measured because its final day
  happened to quote.

  Nothing was added to the engine for it: the flags have been on the result since the coverage tile,
  and the bucketing is the page's own.

- **US-54 — a share button on each figures block, and a card with no chart.** The share sheet used
  to open only from a holdings row. Every KPI section now carries one button; the sheet gains a
  picker for *which* figure, and draws a score card — the label, the figure, its caption, provenance
  at the foot — with the sparkline's room given back to the number.

  One button per section rather than one per tile: nineteen figures would be nineteen buttons, and
  which one to post is a decision better made beside the preview that shows it. Everything else is
  US-47's: the four shapes, light or dark, amounts off by default, the name you choose, the
  clipboard and the download. No second export path and no second provenance builder.

  The card takes the tile's **own already-formatted strings**, so it cannot show more than the page
  does and needs no masking logic of its own — US-46 is inherited by construction. The one piece of
  plumbing this adds is `withAnonymize`, because the sheet's amount toggle is independent of the
  page's and the figure has to be obtainable at the *sheet's* setting.

  Provenance matters more here than on a position card, not less: this can be the account's headline
  number, so the reconciliation verdict is the whole trust claim and an unchecked one still never
  renders as a pass.

  **With Optimism Mode on the card carries the real figure**, never the joke. That is structural
  rather than promised: the share path reads the tile list before the substitution happens, and a
  test fails if either half can see the other. A gag figure next to a reconciliation verdict is the
  one thing this feature must not produce.

- **US-52 — paid in vs grown travels with the shareable card.** The card already carried the
  relationship as its hero percentage (*"for every euro in, this came back"*). It now also carries
  the composition bar the holdings table draws — *"64 % paid in · 36 % grown"* — which answers the
  other question: *of what this is worth, how much is mine and how much did it make*. It is the one
  part of a holdings row that was always safe to post: two percentages and a sentence, no amount, so
  US-46's anonymize does not govern it and there is nothing in it to mask.

  The arithmetic moved into one pure `splitModel`, which both the table and the card call. Two copies
  of a three-branch rule drift, and the under-water branch — scaled against what was paid in, not
  against what it is worth now — was a real defect once; fixing that in one of two places would have
  been worse than never having moved it. Moving it also exposed a case the table had been hiding: a
  position that lost four times its inlay produced a bar segment 400 % wide, visible only because the
  table cell clips. The bar now stops at the track and the sentence still says 400 %.

  The split is measured over US-50's span, so it cannot drift from the percentage beside it: a 1Y
  card on a six-year holding windows all three, and an all-time card reproduces the holdings row's
  bar to the digit.

- **The card follows the reader's language.** It was English while the page around it was Dutch —
  invisible until US-52 put a translated sentence on it and the card went half-and-half.

### Fixed

- **US-66 — a click and a drag are told apart by the hand, not by the history.** The zoom decided it
  in *days*: below two days of history it was a click. Two days is not a length of hand movement, and
  the window changes what it measures on screen — under a pixel on a five-year view, so a click that
  wobbled zoomed the page; most of a centimetre on a three-week window, so a deliberate drag did
  nothing. The same line was wrong in both directions, and this release's momentum made it worse: a
  twitch carries a velocity, and the projection turned that into a throw. It is now eight pixels of
  travel, checked before the momentum.

  Dragging past the edge of the plot no longer freezes, and `#c-value` carries `touch-action: none`
  so a drag on a touch screen stops scrolling the page out from under the selection.

- **US-67 — a hover affordance is an enhancement, not the usable state.** The share button on a
  holdings row sat at 45 % opacity and came up on hover. On a pointer with no hover that is
  permanent: a control claiming to be off, on the one device with no way to find out otherwise. The
  🙃 button had the matching bug the other way — a tap set `:hover` and left it rotated. Both are
  behind `@media (hover: hover) and (pointer: fine)` now, and `:focus-visible` still reveals the row
  action.

- **US-68 — reduced motion stopped saying anything at all.** `* { transition-duration: 0.01ms
  !important }` is short because it does not think: it also silenced the colour change that is the
  only thing telling a reader their press registered. It now forces a *property allowlist* instead of
  a duration — colour, surface and opacity keep answering, movement stops. It still needs
  `!important`, and the first attempt without it proved why: a rule with its own `transition`
  shorthand wins on specificity, and the row expander went on rotating.


- **A 17px amount was tracked as display type.** `--kpi` is re-set in six contexts — a hero tile takes
  it to 3.5rem, a fact and the all-figures grid to 1.0625rem, the popup to 0.9375rem — while the
  tracking was written once, on the shared rule, at the display value. So the supporting figures on
  every screen, and every figure in the popup, were set at `-0.025em`: display tracking on body-sized
  text, which is the exact mistake US-58's buckets exist to prevent. Its check did not catch it
  because it only ever asked whether *display* rules were negative. Tracking now travels with the
  size, and `npm run type` fails when a context sets one without the other or when the two disagree.

- **The tile notes had never been translated.** The line under every figure — *"as of today"*,
  *"banked, from 3 closed positions"*, *"still riding on prices · all time"* — was English on the
  Dutch page, and `missing()` had never counted a single one because none of them reached `t()`.
  This is the same gap as the popup (US-60) and the chart readouts, one surface further in; it
  surfaced because US-54's score card is the first thing that puts a note through the dictionary.

- **The wipe confirmation asked in English.** The one genuinely irreversible action on the page, and
  `confirm()` never reaches `t()` on its own, so nothing had counted it either.

- **Only one of the two dialogs materialized.** US-57 gave the arrival to the share sheet and left
  the diagnostics dialog cutting in — two surfaces that look identical behaving differently, which is
  the consistency rule broken by the change meant to improve things. Both now open, close and take
  Escape by the same path.

- **The popup acknowledged nothing when a sync changed its figures.** It is the surface most likely
  to be open across a sync — you press Sync in it and watch — and US-65's swap had reached only the
  page. Its actions are also a comfortable 44px now rather than 38.


- **`npm run palette` took the last `:root` block for the dark theme.** It is the check that keeps
  the categorical slots honest, and it identified the palette by position — so the moment US-56 added
  a `:root` under `prefers-contrast: more`, which redefines borders and nothing else, it died with
  `--series-1 not found`. Loudly, which was the right failure; but the assumption was wrong rather
  than the change. It now selects the blocks that actually carry a palette.

- **The cumulative-result chart threw on the Performance tab.** US-62 handed it the estimated-day
  flags from a variable that is only in scope in the caller, so opening Performance raised
  `ReferenceError: ends is not defined` and the chart did not draw. Found by clicking through every
  tab in a browser, which no test does — the suite cannot import `charts.js`, and the section had
  never been opened during the change that broke it.

- **The chart readouts speak Dutch.** The same gap US-60 found in the popup, one surface over and
  found while building US-62: `charts.js` had no translations at all — every tooltip line was a
  hardcoded English literal, so the numbers a Dutch reader actually reads were labelled *Value*,
  *Day change*, *Cumulative*, *Withholding tax*. Twenty-two sites now go through `t()`, and
  `missing()` reports zero.

  Buy and sell counts are singular and plural keys rather than an English `s` glued on: Dutch does
  not form its plural the same way, and a dictionary keyed on the finished phrase cannot repair a
  word assembled from pieces.

- **US-60 — the popup speaks Dutch, and looks like the rest of the extension.** Every string in it
  was hardcoded English: no `data-i18n` attributes, `applyStatic` never called. Choosing Nederlands
  gave you a Dutch app and an English popup — and `missing()`, which exists precisely so an
  untranslated string is *counted rather than hidden*, never saw these because they never reached
  `t()`. That is why it survived a whole interface rebuild unnoticed.

  The worker's progress now shows in Dutch too. It is translated by *phase* rather than by the
  worker's sentence: two of those sentences interpolate a count (`Fetched 412 transactions.`), and
  the dictionary is keyed by the English string, so a sentence with a number in it has as many keys
  as the account has transactions. The full page still shows the worker's own words step by step.

  The layout carries the redesign's reasoning at 320 px: the mark, one hero figure (total value),
  three supporting ones, the shape, and one primary action. It was four equal tiles in a 2×2 grid
  and two equal buttons, on an extension that had moved to one hero and one primary action
  everywhere else. Before the first sync the figures and the sparkline collapse instead of leaving a
  blank block that reads as a failed load.

  Also pinned: the busy label restores itself via `currentTarget`. The button is plain text today so
  both work — but the connection-check button had this exact shape, gained a broker mark, and then a
  click on the mark wrote "Checking…" *inside the icon*, where it stayed.

  **No resync is needed.** Nothing computed changed; this is what the panel says and how it is laid
  out.

- **US-59 — the small print on a shareable card is readable again.** The card is drawn at 900–1280 px
  wide and a chat renders it at 500–700, so every size on it was scaled to roughly a half. The
  provenance line — the one that says whether the figures reconciled against DEGIRO's own total — was
  `15px` on a 1280-wide card, which arrives on screen at **six pixels**. So did the ticker, the
  caption under the percentage, and the name of whoever shared it: a card whose whole claim is its
  provenance was posting that claim in type nobody could read.

  Absolute pixels were wrong a second way. `15px` is 1,17 % of a landscape card and 1,85 % of a
  story, so the same line was a *different* size in two cards side by side. The ramp is now expressed
  in thousandths of the card's own width, which makes on-screen size independent of the format — the
  four shapes became four crops of one design — and makes the floor checkable: `test/` measures every
  step of every format at the narrowest width a chat renders, and fails naming the step that falls
  under it. The ramp was compressed rather than enlarged, so the hero percentage stayed where it was
  while the lines under it came up to a readable size. The sparkline's stroke scales with the card
  for the same reason a hairline does not survive being halved.

  A second defect fell out of fixing the first. The footer joined the period to the provenance on
  one line, and at 500 px that line ran past the card — so the truncation landed on the tail, which
  is where the verdict is. A card from an account that does **not** reconcile printed
  `DOES NOT rec…`: the one line that must never be the one cut off was the one being cut off. The
  period now has its own baseline and the verdict has the full width.

  **No resync is needed.** Nothing about what the card *says* changed — the field allowlist, the
  masking and the reconciliation verdict are untouched. This is the size it is said at.

### Added

- **US-61 — the Positions table fits the width it is given.** The merged holdings table (US-49)
  carries eleven columns, and below a wide desktop it overflowed into a horizontal scrollbar. It now
  drops its lowest-priority columns as the table narrows and folds them into a per-row expand,
  keeping the four that answer *"how is this position doing"* — Instrument, Value, Paid in vs grown,
  Result — visible at every width. A **Columns** control beside the view filters hides the ones you
  do not want, remembered like the theme. The page never scrolls sideways again; the scoped scroll
  remains only as the last resort for the four load-bearing columns on the narrowest screens.

  **No resync is needed.** This is display only: every figure is the same number computed the same
  way, hiding a column changes nothing the engine produced, and the cash row still makes the Result
  column sum to the account's result. Verified in a browser from a desktop width down to a phone —
  ten of twelve columns on a wide desktop, the load-bearing four on a phone, no sideways page scroll
  at any width.

## [0.46.0] — 2026-08-17

The interface, rebuilt. Eight phases, each with its own commit and its own gate; `docs/redesign/`
holds the brief and `docs/redesign/MIGRATION.md` §3 is the parity table this release answers to.
Nothing was dropped without a line in [docs/RETIRED.md](docs/RETIRED.md), and `test/parity.test.js`
fails the build if anything is.

**No resync is needed.** Not one stored response, parser or engine path changed — `src/lib/**` was
touched in exactly one place, `snapshot.js`, and only to fix the two defects below. Every figure on
the page is recomputed from the same raw responses as before.

### Fixed

- **A window's figures are now measured over that window.** The range control used to be a floating
  bar that re-sliced all-time numbers, so every preset reported the same result. Each range now
  recomputes from the engine's windowed helpers, anchored on the value the day *before* the window
  opens — measuring from inside it makes the first day's move zero. Time-weighted return chains
  daily factors rather than dividing endpoints, so a deposit landing mid-window cannot flatter it.
  `test/window.test.js` asserts both.

- **A chart whose y-axis does not start at zero now says so.** A 3-month value chart resolves to a
  102.000–118.000 axis, which draws an ordinary quarter as a doubling. The axis is still allowed to
  zoom — forcing zero throws away the detail the window was selected for — but a line under the plot
  states the opening level.

- **US-50: the shareable card's line started at the account's opening rather than at the buy.** Two
  thirds of a card about a position bought last year was a flat run at zero. Underneath it was a
  worse one: the result was measured over the selected window while the money paid in was all-time,
  so a 1Y card on a six-year position divided one span by another and reported a percentage that
  belonged to neither. One pure `positionSpan` now clips the series, the dates and the denominator
  together. A position with fewer than two days in the window draws no line and claims no period.

- **Amounts hidden meant hidden text and a shouting axis.** With the eye closed every chart drew
  `€ •••` down its left edge — a masked figure repeated seven times, costing 65px of plot. The money
  axis now drops its labels entirely; percentage axes keep theirs. `test/mask.test.js` asserts no
  amount reaches the page while masked, and it was verified in a browser across all seven sections.

### Added

- **US-17: a field DEGIRO renames is now loud instead of silent.** Every `pick()` in `parse.js`
  records which candidate name actually carried the value, and a load-bearing field absent on 95 %
  or more of rows raises a red banner naming it. The signal is a *rate* on purpose: a renamed field
  does not go missing on three transactions out of 1 457, it goes missing on all 1 457 — and a raw
  count would cry wolf on ordinary sparse data, which is worse than silence.

  The same tally answers a question this project has been carrying since the fixtures were written.
  The parsers accept several candidate names per value because nobody knew which one DEGIRO sends;
  the bug report now states, per field, which name matched and on what share of rows. A candidate at
  0 % is dead code, and per CLAUDE.md rule 8 it gets deleted rather than kept in case. The report
  also carries `discovered`, so an account silently running on default cluster URLs says so.

- **US-35d: Optimism Mode draws two different charts** instead of deforming the real one.
  *Belief in {PROP}* is a conviction index — one point per day held under water, weighted by depth —
  and *What {PROP} still owes you* is `max(0, paid in − worth)`, which ends at exactly the amount
  that was lost. Both are true read straight and both happen to climb when things go badly, so the
  sign is turned around by the framing rather than by arithmetic.

  `flipSeries` is **gone**. It reflected the value series about its own midpoint, which produced
  something shaped like a portfolio value chart while not being one — and it inverted the deposit
  steps, so every moment money went in the line dropped. Both new charts keep the
  NOT THE REAL NUMBERS stamp, and the deposits line is correctly absent from both.

### Changed

- **A left rail replaces the tab row**, and the sections became routes: the section you are in is
  visible rather than inferred, and last sync, reconciliation and data coverage moved to the rail's
  foot. They used to sit among the KPI tiles, where "Data coverage 100,0 %" was rendered at the same
  size as the total value.
- **One Sync button and one "Meer" menu** instead of six top-level actions. Wipe & resync sits below
  a rule, in red. The connection check opens in a modal.
- **Each section has one hero figure, three supporting facts and an "Alle cijfers" disclosure** that
  contains the rest. Nineteen figures in one grid is a wall; the same nineteen across five sections
  is four per screen. Hint paragraphs became `?` disclosures with their wording unchanged.
- **Charts have real heights** — viewport-scaled rather than a fixed 190px — and no chart forces a
  symmetric axis on single-signed data.
- **The share sheet.** The card button on a position now opens a sheet with a live preview: four
  shapes (1:1, 4:5, 9:16, 16:9), light or dark independently of the page, amounts on or off, and a
  name from four sources — none, first name, the account name, or one typed in. Download sits beside
  Copy. Amounts default to hidden there whichever way the page is set, because a card leaves the
  machine. A name read out of the account renders as "X's position"; a typed one renders as "shared
  by X" and is never presented as the account's, for the same reason the card carries no badge.
- **Uppercase above 11px is gone**, card-in-card nesting is flattened to one panel depth, and the
  dark palette was re-measured: `npm run palette` reports zero collisions in both themes.

### Not changed, deliberately

- **A share count is still masked** while amounts are hidden, against the migration brief's "shares
  survive". 137 shares of something with a public price *is* the position's value. The disagreement
  is written down in `test/mask.test.js` rather than settled quietly.

## [0.45.0] — 2026-08-17

### Fixed

- **A price quoted in dollars was printed with a euro sign.** The transactions table rendered the
  traded price through the euro formatter, so a fill at `$ 3,105` read `€ 3,11` — and nothing said
  no conversion had happened. Reported from a real account, beside DEGIRO's own row.

  **No number was wrong and nothing needs resyncing.** The engine never reads that field for
  valuation: positions are priced through the product's own currency and the observed rate, and each
  row's euro figure comes from DEGIRO's base-currency total. What was wrong was the label, which is
  its own defect — multiply the printed € 3,11 by 900 shares and you get € 2.799, which cannot be
  reconciled with the € 2.421,71 beside it, and the only way out is to assume one of the two columns
  is lying.

  The price now renders in the currency it was actually traded in, resolved from the product first
  and the transaction second. When neither states one it renders **without a currency at all** — a
  bare number rather than a euro sign nobody checked.

- **Two different fills looked like the same one.** Prices were rounded to cents, so `$ 3,105` and
  `$ 3,12` both printed as `3,11`-ish and a penny stock at `$ 0,0125` printed as `0,01`. A price is
  not an amount: prices now carry up to four decimals, amounts still two.

- **A purchase was signed positive.** The Amount column showed money leaving the account as
  `+€ 2.421,71` where the broker's own statement shows `−€ 2.419,71`, under a header that said only
  *Amount*. It is now the cash flow — negative when money left — and the hint says so, including
  that fees are inside it, which is where the remaining difference from DEGIRO's row comes from.

### Changed

- **A transaction that does not state a currency no longer becomes a euro one.** The parser
  defaulted the field to `EUR`; it is now `null`. Every reader already fell through to the product's
  currency and then to the account's base, so nothing downstream changes — but an unrecognised value
  acquiring a plausible meaning is the failure mode rule 4 exists for, and it was one layer under
  the defect above.

## [0.42.0] — 2026-08-11

### Changed

- **Optimism Mode only exists for people holding what the joke is about.** The 🙃 button does not
  appear at all otherwise — and only while that holding is inside the range currently on screen, so
  filtering it out takes the button with it.

  This is the best property the feature has rather than a limitation. A tester who would not get the
  joke cannot be confused by it, and it cannot be stumbled into by accident, which was the standing
  objection to making it a hidden easter egg. The qualifying list is one line in
  `src/ui/frown.js`, because the next person will hold something else.

- **The tiles are written about the holding, by name.** *"1325 days of unwavering belief"* is a joke
  about a tile; *"1325 days of unwavering belief in PROP"* is a joke about a person, and the name is
  the only reason it lands. The name now appears throughout — the analyst consensus, the panic
  level, the exit strategy, the portfolio rating.

### Still pending

The chart transform is **not** in this release. 0.41.0's mirror was rejected, and the prototype at
`docs/prototypes/optimism-flip.html` shows why: it inverts the deposit steps along with everything
else, and on the example account it does not even reach its own goal — it reports a smaller loss
rather than a gain. Three ways to do it properly are in there, switchable, with their source. See
US-35c.

## [0.41.0] — 2026-08-11

### Added

- **Optimism Mode, phase two.** The 🙃 button on the Overview now goes considerably further.

  - **The charts turn around.** A falling line climbs, by reflecting the series about its own
    midpoint rather than flipping the canvas — the axis labels are drawn *inside* the canvas and
    mirroring them makes unreadable glyphs, and a joke has to be legible to land. Only ever in the
    flattering direction: a line already going up is left alone, because a switch that makes a
    winning account look worse is not a joke, it is a bug.
  - **The tiles are replaced outright** rather than flipped, with twelve computed from your own
    figures: *Discount secured*, *Conviction* (days you have held your worst position), *Diamond
    hands*, *Tuition*, *Lambo ETA*, *Analyst consensus: STRONG BUY*, and **Still believing in —
    <your worst holding, by name>**. A winning account gets a different set, because a joke about
    losses on a portfolio that is up is a wrong page.
  - The header claims an all-time high, the page drifts through a hue cycle, the tiles glow, and
    there is a great deal more confetti.

  **NOT THE REAL NUMBERS** is still stamped across all of it, and it is still the only element here
  with a job. Nothing downstream can see any of this — not the export, not the bug report, not the
  engine, not the store — and there are now tests that pin each of those, plus one that pins the
  whole thing is a no-op while the switch is off.

## [0.40.0] — 2026-08-11

### Fixed

- **0.39.0 could not load at all on some accounts.** *"Sync failed: Cannot access 'value' before
  initialization"*, a white page, and no button anywhere — including the new one. The stale-rate
  warning added in 0.39.0 reached for a total that is assembled eighty lines further down the same
  function. It reads the two halves it is made of instead, which exist by then.

  **Anyone who saw that message should update and press Sync.** Nothing was stored wrong; the
  reconstruction never finished.

- **The test suite stayed green through it**, which is the more serious half. Every warning's
  arithmetic was covered and nothing checked that the branches could be *entered*, so a reference
  error inside one was invisible to 341 passing tests. There is now a test that walks an account
  through every warning path and asserts only that each comes back — the second time a defect of
  exactly this shape has taken this page down.

## [0.39.0] — 2026-08-11

### Fixed

- **A foreign instrument is now valued through the rate its own trades state.** 0.38.0 spotted that
  a trade booked in euros had settled for 0,851 of what it traded for and stopped there. The ratio
  of what settled to what was traded *is* the conversion DEGIRO applied, on a known date — no guess
  about which currency the instrument is in required. Instruments stating a consistent rate across
  at least two trades are now converted with it. One trade only, or trades that disagree, is
  refused and still reported: applying a rate measured from contradictory evidence would swap a
  visible error for an invisible one.

- **"+207 % all time" next to +€ 16.621 on € 16.676 paid in.** The percentage under a euro result
  is read as "that much of what I put in" — the two tiles sit beside each other and a reader
  divides them. It was a time-weighted chained return, which answers a different question and falls
  apart on an account that sat at three cents for three years. It now says what it looks like it
  says. The chained return still lives under **Annualised return → The portfolio**, labelled.

- **The version is in the header.** A tester reported against **v0.21.0** without noticing, because
  the version sat in small grey text at the bottom of a long page. Demo mode shows it too, so a
  screenshot from the demo can be tied to a build.

- **A stale exchange rate now says how much it matters.** Every account holding a foreign currency
  reported one, with gaps from 358 to 1 746 days, and none could say whether the answer was a
  rounding error or a fifth of the portfolio. It now states the share of today's total riding on it.

- **A rescale factor measured from trades that disagree is called estimated**, not measured — the
  same distinction 0.29.0 drew for contract sizes. And *"no price history"* now says it means the
  instrument never had one, which is a different thing from a series that failed to arrive.

### Added

- **Put that frown upside down.** A button on the Overview that turns every losing figure the right
  way up, gives it a more flattering description, tips the tiles onto their heads and throws
  confetti at them.

  It stamps **NOT THE REAL NUMBERS** across the whole thing, and that is not a disclaimer bolted on
  — it is the reason the feature is allowed to exist. Plausibility is the danger, not absurdity: a
  tastefully inverted chart is one somebody screenshots and sends to their accountant. This cannot
  be mistaken for anything. It never leaves the Overview, switches itself off when you navigate
  away, is gone on reload, and nothing downstream can see it — not the export, not the bug report,
  not a single stored figure. There is a test for each of those.

## [0.38.0] — 2026-08-11

The projection release. Five testers ran 0.37.0 and the Outlook section produced a five-year
forecast of **€ 89 million** on one account and **−42 % a year** on another. Three separate defects,
one shared cause: it trusted its own history far too readily.

### Fixed

- **Eight overlapping windows are not eight observations.** The projection slides a five-year window
  over your history one month at a time, so five and a half years of data yields eight windows that
  share fifty-nine of their sixty months. Those are not eight observations — they are about one.
  The caption on screen already said *"treat 8 as fewer independent observations than it looks"*
  while the code counted them as eight and called the result **history**.

  It now counts the genuinely separate stretches. Most accounts will find their Outlook has become
  an *example* rather than a scenario from their own past, which is what it always was.

- **The rate you type is now used.** Setting *Growth % a year* did nothing on any account with
  enough windows: all three lines came from the historical distribution and the typed figure was
  discarded. Only the dividend yield survived. The control was a decoration. Your number is now the
  middle line, and the spread your own account really showed is kept and recentred on it — so
  "good market" still means what a good market did to *this* portfolio.

- **A rate that is not a market outcome draws no chart.** Where the measured growth comes out at
  several hundred percent a year, there is no honest projection to draw: the history is real and
  what it measures is not growth — it is deposits and the trades they paid for being recorded a day
  apart. The section now says so and stays empty, and you can still set the rates yourself. Refusing
  beats clamping; a clamp would invent a number.

- **A losing holding said it had lost nothing.** The bar on the holdings table read
  *"100 % paid in · 0 % lost"* beside a result of −€ 766. Two numbers on one row contradicting each
  other. When a position is under water the money you put in is *more* than what it is worth, so the
  bar is now scaled to what you paid in and reads **"23 % of what you paid in is gone"**.

## [0.37.0] — 2026-08-11

Three testers' accounts, three findings. **Press Wipe & resync after updating** — the percentages
below are recomputed from the raw responses, and a stored result predates the fix.

### Fixed

- **A percentage where there was nothing to earn it on.** One account showed **+291 949,64 %** as
  its all-time result and **−60 006,26 %** as its worst month, next to a perfectly ordinary
  +19,64 % best month. The chained return only skipped days that began with *nothing*, so a day
  that began with two cents and moved five euros multiplied the running figure by 250. Those are
  the opening days of an account, where a deposit and the trade it paid for land a day apart.

  A day's result now has to fit inside what was invested at the start of it, or the day is left out
  of the chain — the standard treatment, and the only honest one: capping would invent a number.
  An ordinary history is untouched, which has its own test.

- **The check that confirms every number was missing on two accounts out of three.** Both reported
  no account total, because DEGIRO sent only cash figures under it — fourteen fields, not one of
  them net liquidity. So the one test that proves the history is right could not run at all, on the
  two longest histories.

  It runs now, against the sum of the position values and the cash balance DEGIRO *did* send. That
  is an independent check — DEGIRO's prices and share counts against our reconstruction of your
  ledger — so a wrong share count, a mis-scaled price or a bad exchange rate still shows up. It is
  weaker in exactly one way, it cannot catch an error already inside DEGIRO's own position values,
  and **the page says so** rather than showing a green tick that means less than it looks.

- **A trade booked in euros that did not settle for its euro amount.** One account's rows read
  `currency: "EUR"` while what actually settled was **0,851** of price × quantity — not a rounding
  difference, the dollar rate of that day, on trades nothing had marked as foreign. An instrument
  treated as domestic when it is foreign is valued without its conversion, and nothing said so.

  The extension now checks the identity that has to hold for a euro trade — what settled equals
  what was traded, fee aside — and reports it in red when it does not. **This finds the problem
  rather than fixing it**; deciding an instrument's real currency is a change to what the numbers
  say and is written up as its own story.

- **"A difference in prices" when no price differed.** Two accounts came back off by half a percent
  with every share count agreeing and not one holding disagreeing — and were told to look at
  prices, which is the one place the difference demonstrably was not. It now points at the cash
  balance, and the bug report carries enough to confirm it next time.

### Added

- **Three warnings that reported only their name now report their finding**: the price history that
  cannot be reconciled with what you paid (the most severe one the extension raises, and it had been
  carrying no detail at all), a stale exchange rate, and unrecognised cash rows. All three were
  showing up in the bug report as *"unclassified"* — which is that mechanism working, and the gap
  being real.

## [0.36.0] — 2026-08-11

Nothing on screen changes shape in this release. What changes is what happens when something
goes wrong: every stage that loads or processes anything can now produce a failure you can send
somewhere, instead of a red banner and a shrug.

### Fixed

- **A background sync that fails no longer fails silently.** `sw.js` carried two
  `catch(() => {})` handlers — this project's only deliberate discard of an error — written when
  the only failure worth expecting was "the session is gone". That stopped being true once the
  worker began writing to IndexedDB and reconstructing five years of daily values. An alarm-driven
  sync that failed at four in the morning left **nothing at all** behind, because Chrome tears the
  worker down thirty seconds later. Those failures are now written to storage, scrubbed, and the
  page says so: *"Something failed in the background"*, with how many times and what it was.

  If you have been syncing for weeks and something has been quietly failing, **this is the release
  where you find out**.

- **A single unservable month no longer costs the whole sync.** DEGIRO occasionally refuses a date
  window even narrowed to one month. That used to throw, which discarded every window already
  fetched — five years of successful, throttled requests binned over one bad month, and the user
  got nothing. The other eleven months are now kept and the hole is named in red, with its dates
  and its HTTP status, so it is stated as loudly as the failure was.

- **A failed database open is no longer permanent.** `openDb` cached its promise before it
  resolved and never cleared it, so the *first* failure was replayed forever without IndexedDB
  ever being asked again. Two of the reasons it fails are transient — another tab holding an older
  schema, a disk that fills up — and caching turned both into "broken until you reload the
  extension".

- **Storage failures say which failure.** They arrived as bare `DOMException`s, and *"The
  transaction was aborted"* is what a full disk, a private window and a second tab all look like.
  Three situations, three different answers, one indistinguishable message. Each now names the
  next thing to do.

### Added

- **The bug report carries what the page and the worker threw.** Both were previously invisible to
  it: the two worst defects this project has shipped took the whole page down while the unit suite
  stayed green, and both arrived as a screenshot and a sentence. Scrubbed at the point of
  recording — URLs, any run of four or more digits, and every stack frame but the first are gone
  before the value is written, not on the way out.

- **Rows the parsers could not read are counted and surfaced**, per source and with reasons. A
  renamed field used to empty an array quietly: the sync reported success, the chart was short of
  a year, and nothing said so.

- **The popup captures its own errors.** It had none, so a defect in its render — which runs on
  every sync — showed a blank panel and reported nothing. It writes to storage rather than memory,
  because the popup closes when you click away from it, and that is usually the same gesture as
  giving up on it.

- **The Dutch page is Dutch in the notices too.** Every notice title and every page-authored body
  now goes through the dictionary — including the fourteen titles keyed by engine warning code,
  which are looked up where they are displayed, because the engine is pure and cannot reach a
  dictionary. Reconciliation, demo data and "nothing to reconcile against" had all been rendering
  in English on a Dutch page.

  `npm test` now scans the UI for translatable literals with no entry, which is what would have
  caught them. It sees literal call sites only, so a clean run means "no orphan among the ones
  that can be checked" — not "none anywhere".

## [0.35.0] — 2026-08-11

### Added

- **Outlook** — where this goes over the next one, three or five years, with a monthly deposit if
  you make one. **The only screen in this extension showing a number nobody can check**, which is
  why it is a section of its own with the caveat above the numbers rather than a continuation of
  the value chart. Nothing from it reaches a tile, the export or the bug report; those are
  measurements.

  - **Scenarios come from your own history, not from a fitted curve.** *Good market / expected
    market / bad market* are the best, middle and worst of the stretches your account actually
    lived through — the method the current European standard uses, and for the reason it gives:
    assuming a normal distribution makes the tail systematically too thin exactly where the
    scenario is used. It is also this project's own rule arriving from outside. **The bad case is
    the average of the worst tenth**, not the tenth percentile: a percentile says "it was at least
    this bad", the mean of the tail says "when it went badly, this is how badly on average".
  - **It says how much evidence it had.** Five years of history contains 9 overlapping five-year
    stretches and 57 one-year ones, and the card states which — including that overlapping
    stretches are fewer independent observations than they look. Below three, the scenarios are
    labelled an **example** rather than drawn from your past, which is the rule the Dutch regulator
    applies below four years of track record and the strongest thing in it.
  - **Growth and dividend yield are separate, and derived so they cannot double-count.** A dividend
    is internal, so it is already inside the total return; taking that total as "growth" and adding
    a yield on top counts it twice, and on a dividend-led portfolio over five years that is not a
    rounding error. Both are shown, and both can be overridden.
  - **Dividends only compound if they went back to work**, and the card bounds whether yours did:
    dividend still uninvested must still be in your cash balance, so today's cash is a ceiling on
    how much of it can be idle. A bound rather than an estimate — the first version compared the
    drift in cash against dividends received and was swamped by ordinary purchases, reading "100 %
    reinvested" on any account that had ever bought anything. Right for the wrong reason is worse
    than no number.
  - **Five years is a ceiling, not a default.** The band widens with the square root of time while
    the middle line grows linearly, so past five years the good and bad cases are so far apart the
    picture stops distinguishing anything.

## [0.34.0] — 2026-08-11

### Added

- **Year by year**, on Performance. The month grid already held every number; what it did not have
  was a *year*, and a year is the unit people actually review in. Opening and closing value, paid
  in, taken out, result, return, dividend, costs and trades — whole history, never the selected
  range, because a "2024" row that quietly covered March to November would be worse than no row.

  Three things it gets right that a naive version would not:

  - **The first year does not open on 1 January.** It opens when the account did, and the row says
    the date. Showing €0 makes its return infinite; showing 1 January makes it wrong by however
    long the account had been running.
  - **A year's return is not (close − open) ÷ open.** On the demo account 2025 took €28 500 in and
    €22 000 out; that formula would report nonsense. It is the same daily-chained figure the month
    grid uses, from the same function, so there is one definition of return in this codebase.
  - **It says it is not a tax document, under the table rather than in a page footer.** "Dividend"
    is what arrived after the tax DEGIRO withheld at source, not what can be reclaimed — and this
    project holds no cost basis at all, deliberately, so the capital-gains figure a tax return asks
    for cannot be derived from anything here. A footnote elsewhere is a footnote nobody read.

### Engine

- `incomeByYear` — dividend, withheld tax, fees and interest split into UTC calendar years. The
  totals were already there and cannot be split back, and a second implementation of "which year is
  this row in" is a second place to get a boundary wrong.

## [0.33.0] — 2026-08-11

### Added

- **Annualised return, both kinds, behind a toggle** — *My money* and *The portfolio*, on
  Performance. They are answers to two different questions and they genuinely differ: on the demo
  account, 14,2 % against 11,3 %. Pay a large sum in just before a fall and your money did badly
  while the portfolio did fine.

  Showing both at once with neither named is how a page contradicts itself, which is what had this
  story parked. A toggle answers it — one at a time, named by the control that chose it — and it is
  the shape this page already uses three times over. *My money* leads because that is the question
  a private investor is asking; *The portfolio* is the only fair comparison against a fund, and the
  month grid already computed it.

  **Both refusals are refusals, not blank dashes.** An IRR has a root per sign change in the
  cashflow sequence, so an account that pays in, takes out and pays in again has several
  mathematically valid answers — the solver scans its range before it bisects, and when it finds
  more than one root it says so instead of returning whichever it walked into first. And under a
  year nothing is annualised at all: three months at +6,87 % would report +30,45 % a year, so the
  card says that in those words rather than showing it.

### Fixed

- **Elapsed time was a day long.** The discounting used a *count* of days where it needed the span
  between them, so €1 000 growing to €1 210 over two years came back as 9,986 % instead of 10 %.
  Small, and wrong in the direction that makes every long history look slightly worse than it was.
  Found because a test asserted the exact rate rather than a range.

## [0.32.0] — 2026-08-11

### Added

- **Nederlands**, with a flag beside the theme toggle. Every tester is Dutch and the entire
  interface was English — including a card headed *"Profit and loss per product"* sitting next to a
  proposal that says *"Winst en verlies per product"*. There was no translation layer at all.

  **English stays the source language**, and the dictionary is keyed by the English string rather
  than by an identifier. So a string with no translation renders in English instead of
  `tiles.totalValue.label`, the English text stays visible in the code that uses it, and there is
  no key to get wrong because the key *is* the text.

  The cost of that choice is that editing an English string orphans its translation — which is why
  **an untranslated string is counted rather than hidden**. A page that silently falls back looks
  finished and is not, and this project already has a rule about numbers that look more confident
  than they are. Right now the count is zero: all 121 strings are translated, tile explanations
  included, which is the half a Dutch reader most needs since it is where every caveat lives.

  Numbers and dates stay `nl-NL` in both languages. That is a locale for money, not a language for
  prose: two people looking at the same DEGIRO account should see the same € 1.234,56.

### Fixed

- **Controls built once at boot did not re-label.** The first version switched to Dutch and left
  the tab bar and the theme buttons in English — the static markup is walked on every change, but
  anything whose text is written by JavaScript has to be told. Caught in a browser, not by a test.

## [0.31.0] — 2026-08-11

Three tables on the Holdings section, from the per-product page proposal (US-27, US-28, US-29).

### Added

- **Profit and loss per product** — one row per product **including everything you no longer
  hold**, with what you put in, what came back, what it paid in dividend, and what it left. The
  holdings table answers *what do I hold*; this answers *was that a good idea*, and on an account
  that has sold everything the first table is empty while all of the answer sits here.

  Filter chips are built from the product types actually present, so nobody sees an empty
  *Warrants* filter for warrants they have never held. Sorting best-first or worst-first breaks
  ties on the name, so equal results do not reorder between renders.

  **Dividend is beside Result, never inside it.** The per-product result is value moved less money
  put in; a dividend is cash and lands in the cash ledger, not in the instrument's value. Folding
  it in would make this column disagree with the identically named column one card above, and two
  columns may not share a name and differ. Dividend rows DEGIRO attaches to no product are counted
  and said out loud under the table rather than quietly dropped.

  **The percentage names its denominator in the header** — *% of bought*. Result ÷ what you put in
  is honest and needs no cost-basis convention; divided by a cost basis it would inherit an
  argument this project refuses to have.

- **Transactions** — the rows behind every figure on the page, newest first, following the range
  control like everything else, with *Everything* beside it. The count states how many are shown of
  how many are in range and how many exist, so a filtered list can never be mistaken for the whole
  history. Capped at 500 rendered rows, and the cap is in that sentence rather than silent.

- **Price and Average paid** on the holdings table — as two columns, **not a second positions
  table**. The proposal drew one; building it would have put two tables of the same positions on
  one page with different columns and, eventually, different numbers.

  *Average paid* is total paid ÷ total quantity bought, over every purchase. That is a fact. It is
  deliberately **not** the running average cost of what remains after partial sales — that is the
  average-cost method, FIFO answers it differently, and this project picks neither. **No result on
  the page is derived from it**, so it cannot disagree with anything.

  *Price* is value ÷ quantity in euros, which for a share is the euro price and for a contract
  covering a hundred shares is a hundred times the quoted premium. Said in the tooltip rather than
  left to be assumed.

### Engine

- `byProduct` gains `bought`, `sold`, `boughtQty`, `dividend` and `isin`. The net was already
  there — it is what the per-product result rests on — but a net figure cannot be split back into
  its halves, and *what went in against what came out* needs them apart.

## [0.30.1] — 2026-08-11

### Fixed

- **Sync failed with `HTTP 502` on accounts that are not on the default cluster.** DEGIRO runs
  several reporting clusters and tells you which one your account is on; this discovered that
  once, cached it forever, and then used the cache. On one real account the cache said
  `/reporting/secure/` while the account actually lives on `/portfolio-reports/secure/`, so every
  transaction and cash request went to the wrong base and came back 502 — **every sync, every
  time**, while the connection check reported a healthy `200` two lines further down the same
  screen, because it fetches the config fresh.

  The comment above that cache said the cluster "can change" and then cached it for the life of
  the install. It is now re-read on every sync. That is one request out of dozens, at the same
  1,1 s as the rest — and it **repairs a cache that is already poisoned**, which matters because
  an install carrying one cannot sync at all until it does.

  A cached value that is wrong is worse than no cache: it fails in a way that looks like the other
  end being broken, and that is exactly how this presented.

- Nothing else changed. 0.30.0's numbers, charts and layout are untouched.

### Known, from the same connection check, and not a bug in this extension

- **Some accounts genuinely have no account-total field.** The 0.26.0 diagnostic did its job: the
  `update` response for one account carries `degiroCash`, `flatexCash`, `totalCash`,
  `totalDepositWithdrawal`, `freeSpaceNew`, `pendingSettlement` and `cryptoTotalCash`, and no
  net-liquidity value under any name. So `reconciliation: null` there is **correct** — DEGIRO does
  not send the number, rather than our parser missing it. What to anchor against instead is an open
  question, not a typo to fix.

## [0.30.0] — 2026-08-11

Nothing on screen changes. This is US-22's structural half, and the point of shipping it now is
that it **runs** rather than waits.

### Added

- **The multi-broker plumbing, with one broker in it.** `src/lib/combine.js` takes per-broker
  engine results and returns one; `src/lib/brokers/` is the adapter boundary, its registry, and
  DEGIRO expressed as an adapter over the modules that already existed.

  `docs/MULTI-BROKER.md` §A works out why the engine needs no change at all: SPEC §1.4 is linear,
  so combined profit and loss is **identically** the sum of the per-broker series. Run the engine
  once per broker and add the daily arrays. `engine.js` is untouched by this release.

- **And the existing single-broker path now goes through it.** That is the deliberate part. A
  single part comes back from `combineResults` byte-for-byte, so no number on the page moves —
  what it buys is that the multi-broker path is the *only* path. It runs on every page load, so it
  cannot rot unnoticed between now and a second adapter, and "one broker looks exactly like today"
  is enforced continuously instead of asserted in a test nobody runs against the real UI. The
  alternative was an unreferenced module sitting on `main` until it was needed, which is precisely
  the dead code rule 8 is about.

- **22 tests for it**, including the arithmetic that would catch a wrong architecture rather than a
  wrong line: per-broker-then-sum equals the whole; a cross-broker transfer produces **zero**
  combined P/L on both the withdrawal day and the deposit day; the combined value genuinely dips
  while the money is in transit, because it was at neither broker; combined return is
  value-weighted rather than the average of two percentages; instruments merge on ISIN and never on
  a broker-local product id; and a broker without a reconciliation anchor makes the combined status
  *unverified* and names itself.

### Still deferred, and still on rule 8

Storage keyed by broker, per-broker sync and wipe (US-23), and the broker filter (US-24). With one
broker a submenu over a choice of one is invisible by specification, and the storage rekey is a
`dbVersion` bump every tester pays for in minutes and cannot see. That migration is the same size
the day a second broker is real. Trade Republic is parked, which makes this *more* true rather than
less.

## [0.29.0] — 2026-08-11

### Added

- **What moved, in this range** — result per instrument as a horizontal bar chart, on Performance.
  The same number the holdings table prints and the winner and loser tiles pick from; this is the
  shape of the distribution between them, which neither a table nor two tiles can show. Capped at
  twelve, taken from both ends, because the middle of that list is the part nobody is asking
  about.
- **Currency exposure** — which currencies today's value is riding on. Everything on the page is
  in euros; this is what those euros depend on, which the FX work made concrete. **It hides itself
  on an all-euro account**: a doughnut with one segment implies a question was asked and answered
  when it was not.
- **Uninvested cash over time**, on Composition. Its own chart rather than a band on the value
  chart, which already has one — on a stacked total, idle cash is a thin strip at the top of a
  much larger number.

### Fixed

- **A contract size derived through an interpolated exchange rate no longer claims to be
  measured.** The row carried `anchored: false` and `verdict: "measured"` side by side — it
  contradicted itself, and the UI believed the confident half. It now reads `estimated`.

  The number is still used, deliberately: falling back to one share per contract would be a
  hundredfold error in place of an eight percent one, and the reconciliation is what catches the
  remainder — it already names the instrument and the euros.

  **The reproduction had been lost, which is the more interesting half.** The synthetic account
  used to show this and stopped: its conversion cadence was made "realistic" from an account that
  books 915 USD conversions, which put every trade within a fortnight of a stated rate and quietly
  repaired the fixture while leaving the defect in the wild. A real account still reports contract
  sizes of 101, 104 and 218 where 100 belongs. The generator now carries a currency converted
  twice in five years, with the trade 455 days from the nearest stated rate, and a true 100 reads
  108 there — as it should, until the measurement itself gets better.

  Measuring it *better* remains open (B11). This release closes only the part where the report was
  untrue about its own confidence.
- **A bar chart that dropped half its labels.** Chart.js skips category labels when it judges them
  crowded, which on a chart whose entire point is *which* instrument moved left nine bars and five
  names. Caught in a browser, not by a test — the suite was green throughout.

## [0.28.0] — 2026-08-11

### Fixed

- **A one-cent currency conversion was being used as an exchange rate.** A bug report showed USD
  with four derived observations, a median of 0.8647 and a **high of exactly 1** — and no currency
  pair has ever had a rate of 1,0000, so one observation in four was junk. With 1 554 days between
  observations, one junk point prices years of holdings.

  The mechanism is rounding rather than a coding slip. Both legs of a conversion are stored to the
  cent, so the rate it states carries a relative error of about `0.005 / amount`: a thousandth of
  a percent on €500, and fifty percent on a cent. A residual-cent sweep — one cent out, one cent
  in — divides to exactly 1.

  Conversions below €1 no longer state a rate, and **the count is reported rather than silently
  discarded**. Declining to use a measurement whose error bar is wider than the thing being
  measured is not a guess (rule 4); doing it quietly would be. A currency whose every conversion
  was too small still appears in the report with zero observations, because falling back to 1:1
  and saying nothing is exactly the silent wrong number this project exists to avoid.

  **Resync to pick this up.** Every derived number is rebuilt from the raw responses, so it needs
  no re-download — but the cached result predates the fix.

### Changed

- **US-23 and US-24 deferred**, against the recommendation this project made two versions ago.
  "Do the structural work while there is only one broker to get it wrong with" is right about the
  arithmetic and the adapter boundary — both pure, both tested, both free. It is not right about a
  sync submenu over a choice of one, which the acceptance criteria already require to be
  invisible, nor about the storage rekey, which is a `dbVersion` bump every tester pays for in
  minutes and cannot see. That migration is the same size the day a second broker is real, so
  waiting costs nothing and building now buys a maybe with someone else's afternoon. Rule 8.

  The work that *was* done sits on `claude/multi-broker-poc` and is deliberately not merged: with
  one broker, `combine.js` has no caller, and an unused module on `main` is the thing rule 8 is
  about.

## [0.27.0] — 2026-08-11

**Research only. No behaviour change, no new code paths — the extension does exactly what 0.26.0
did.** Version bumped so the study has a name to be referred to.

### Added

- **`docs/MULTI-BROKER.md`** — the compatibility study behind US-22 to US-24: what a broker has
  to be able to answer, what is actually known about Trade Republic against what is merely
  assumed, how the spike gets run, 13 structural acceptance criteria that can be met **before a
  second broker exists**, and 25 numbered test cases split by whether they need a real capture.

  Three things in it are worth reading even if multi-broker never ships:

  - **Every Trade Republic claim is marked unverified**, including the one everything else rests
    on — whether an extension can reach a session from a logged-in tab the way it reads DEGIRO's
    cookie. Writing an adapter against that table is named as the thing not to do.
  - **The rate-limit posture has to be stricter, not merely inherited.** DEGIRO accepts a cookie,
    so a wrong move looks like a misbehaving browser. If Trade Republic's session is device-bound
    and signed, a wrong move looks like an unrecognised device authenticating — which is the
    shape of an attack, and brokers answer that shape by locking the account rather than by
    returning 401. So: no retry on any authentication-shaped failure at all, and the spike runs
    against an account whose owner has been warned it may get locked.
  - **What would make us stop**, agreed in advance while it is cheap to agree to.
- **A correction on two accounts at the same broker.** The reason given for excluding it was "we
  have no login system", which is close to right rather than right. Two *logins* is genuinely out
  — that needs a stored credential and the README promises there will never be one. But DEGIRO
  identifies an account by `intAccount`, and one client login can cover more than one account
  number; in that case both are reachable with the session already in the browser and the blocker
  is not authentication at all — it is that `session.js` reads one `intAccount` and everything
  downstream assumes it. **Two logins is out; two `intAccount`s under one login has never been
  looked at**, and is plausibly much cheaper than multi-broker because it needs no new adapter,
  no new classify table and no new price source.

### Changed

- SPEC §7's "no multi-account support" is amended for the multi-broker case, with the
  same-broker case explicitly still excluded and the reason recorded.

## [0.26.0] — 2026-08-11

### Added

- **An "i" on every figure**, saying what it means on hover, on focus and on tap. Several of
  these are assertions a reader would reasonably get wrong, and the caveats lived only in the
  changelog and in code comments — which is to say nowhere near the number: that *Fees paid* does
  not include what a margin balance costs, that a deposit is not a gain, that *Biggest winner* is
  a position and not a trade. Escape closes it, and it is a shared fixed-position element because
  the tile grid clips its own corners and would have sliced a tooltip on the last row in half.
- **Light / Dark / Auto**, in the header. The stylesheet has been written for exactly these three
  states for several versions — the dark tokens appear once under `prefers-color-scheme` and
  again under `[data-theme="dark"]` — and **nothing ever set the attribute**, so the page followed
  the operating system and only the operating system. Auto stays the default and is a real third
  state rather than a synonym: someone whose machine flips at sunset should not have to give that
  up to state a preference once. The choice persists, and the popup follows it.
- **When DEGIRO's account total cannot be read, the page now reports which fields it *did* send.**
  Two real accounts come back with `reconciliation: null`, which means the one check that says
  whether any of this is right could not run at all — and until now a wrong field name looked
  exactly like an empty response. The candidate names in `parseUpdate` were guessed without a
  real capture; this is how the guess ends. Names only, never values, and it travels in the bug
  report.

  The name filter let an IBAN through on first write — `NL91ABNA0417164300` is a letter followed
  by alphanumerics, so it satisfied "looks like an identifier" — in the very function whose
  comment said it would not. Its own test caught it before it ran anywhere. This is the second
  time that exact string shape has beaten a hand-written safe-name check in this project, so the
  rule is now about digit runs rather than about shape, and there are three independent gates in
  front of the value rather than one.

## [0.25.0] — 2026-08-11

### Added

- **A Notices section**, which is where everything the reconstruction is unsure about now lives:
  a severity chip, a short subject line and the full explanation, sorted worst-first, with the
  bug-report button next to them. The page used to stack all of it at the top, so eight notices
  pushed the first chart below the fold and the one that mattered looked like the seven that did
  not.

  **With one exception, and the exception is the point.** Anything that makes a number
  untrustworthy — a failed reconciliation above all — stays pinned to the top of every section,
  where it cannot be navigated away from. Filing *"the total is off by €39 758"* behind a tab
  would be softening it, and CLAUDE.md rule 6 exists to forbid exactly that.
- **An account with no anchor now says so.** When DEGIRO does not report a current total there is
  nothing to reconcile against, and the page showed neither the green banner nor the red one —
  indistinguishable, at a glance, from a check that passed. One real account reports exactly
  this, alongside eighteen price rescales that have nothing to be verified against.
- **The figures follow the section.** Nineteen of them in one grid is a wall nobody reads; split
  across the five sections that already existed they are four to seven per screen, each next to
  the charts it is about. Five are new:
  - **Deepest fall** — the worst peak-to-trough on the **deposit-free** curve, in euros and as a
    share of what the account was worth at the peak, with the dates. Taken from portfolio value
    instead, a withdrawal would be reported as the worst market event of your life.
  - **Months in profit** — how many of them ended up, out of how many there have been.
  - **Total cost** — fees, withheld dividend tax and interest paid, added up. Each is small and
    forgettable alone, which is the argument for stating the sum.
  - **Largest position** and **Positions held** — concentration, said plainly. A portfolio where
    one name is 60 % of the value behaves like that name.
  - **Cash**, as an amount and as a share of the total.

### Fixed

- **Tile values were being cut off.** `€ 111.784,99` needs about 230 px at the headline size and
  the cell was 193 px, so the page displayed `€ 111.784,9` — the last digit sliced away by the
  container's `overflow: hidden`. A wrong number, silently, which is the one thing this project
  must not do. Long amounts now shrink to fit their cell instead, computed from the character
  count against tabular figures, so a seven-figure account fits for the same reason.
- **A tile row that did not fill left a solid block of border colour** across the rest of the
  grid — five empty beige cells next to seven tiles.
- **`hidden` now means hidden, once and globally.** Any class that sets a `display` silently
  beats the browser's own `[hidden] { display: none }`, and this project shipped that same bug
  three times: a zoom bar in 0.12.0, five whole sections in 0.21.0, and the toolbar, which stayed
  on screen over a section with no charts for it to drive. Each was patched on the one element
  somebody noticed. Three instances of one defect is a missing rule, and the per-element patches
  are deleted with it.

## [0.24.0] — 2026-08-10

### Fixed

- **The sync button no longer gets stuck**, and the reason it did is worth stating because it
  was not an error anyone could have caught: the page waited on the reply to its `sync` message,
  and MV3 does not promise that reply arrives. Chrome may terminate the extension's worker
  mid-run, and a terminated worker does **not** reliably fail the pending call — the callback
  simply never fires, `chrome.runtime.lastError` is never set, nothing rejects. The promise never
  settled, so the `finally` that re-enables the button never ran. No stack trace, no failed
  request, no log line. Just a button reading *Syncing…* until the tab was reloaded.

  The reply is now fire-and-forget and the **checkpoint is authoritative**. `sync.js` has always
  written `meta.syncState` after every step precisely because the worker is ephemeral; the page
  now reads that instead of trusting a message channel. Four ways out, and the button comes back
  in all of them: the checkpoint reaches *done*; the worker is up, reports nothing running and an
  unfinished checkpoint (the run died with an earlier worker — say so at once rather than wait);
  nothing moves at all for two minutes; or it simply finishes.

  Two further changes make *stuck* structurally hard rather than merely unlikely. Every message
  now has a deadline, so no call to the worker can hang forever again — a deadline ends this
  page's wait and claims nothing about whether the work finished. And **Sync now is never
  disabled**: a disabled button catches no hover and can be asked nothing, which is exactly what
  you want to do when you think it is stuck. A second click reports which step the run is on.
- **Wipe & resync had no error handling at all.** It awaited a message that takes minutes,
  outside any `try`, so a failure left *"Wiping and re-downloading"* on screen forever with the
  rejection swallowed. It now follows the checkpoint exactly like a sync, because after the wipe
  that is what it is.
- **Both copy buttons failed silently.** `navigator.clipboard.writeText` rejects when the
  document is not focused; the rejection was swallowed and the "copied" notice never appeared, so
  the button looked dead. It now says the clipboard refused and what to do about it.
- **Export JSON** reported nothing when it failed, and got a deadline long enough for a large
  account.
- **The popup no longer reports a failure that did not happen.** Losing the reply is not the same
  as the sync failing; it asks the checkpoint before turning the status line red.

## [0.23.0] — 2026-08-10

### Added

- **Interest is on screen.** It was being computed and shown nowhere, which mattered more than
  it sounds: *Fees paid* covers transaction and service costs only, and margin interest has
  always been a separate category in `classify.js`. On a leveraged account that made the single
  largest cost of holding the position invisible on a page whose whole point is where the money
  went. Signed, because a credit balance earns interest and a debit balance pays it, and one
  absolute number would hide which way it went. It is not folded into *Fees paid* — a financing
  cost is not a fee, and adding them would answer neither question.
- **Biggest winner and biggest loser**, per instrument, following the selected range like
  *Result* does.

  Per instrument rather than per trade, and that limit is the point rather than a shortcut. A
  single sale has no result of its own: what it made depends on which purchase you match it
  against, and FIFO against average cost are two different answers to a question with no right
  one. The engine picks no convention anywhere — that is what makes the per-holding numbers
  trustworthy — so a stock bought and sold three times reports one figure, not three. A range in
  which nothing gained shows a dash under *Biggest winner* rather than the least-bad loser in
  green.

## [0.22.0] — 2026-08-10

### Added

- **Per holding: how much of it is your money, and how much it made.** A bar and a sentence in
  the holdings table — *"15 % paid in · 85 % grown"*. Value equals what you put in plus what it
  made, exactly, at every point, and **no cost-basis convention is involved**: a buy is money
  into the position and a sale is money out, which is the same identity the whole account rests
  on. Splitting today's value the usual way needs FIFO or average cost, and those are an
  argument with no right answer.

  A position worth less than went in shows the shortfall in the loss colour rather than a zero
  gain, and one you have taken more out of than you put in says *"all gain — more came out than
  went in"* instead of being clamped to nothing. Both are real states.
- **Five more figures**: realised and unrealised result, best and worst month, and **data
  coverage** — what share of the history was valued from a real quote rather than a stale one.
  That last is the honesty tile: a history reconstructed largely from carried-forward prices is
  a different object from one reconstructed from quotes, and until now the page only said so in
  a warning about instruments.
- **The version is on screen**, in the footer line and in the popup. A bug report about a build
  nobody can name costs a round trip, and this project shipped several versions in a day.

## [0.21.0] — 2026-08-10

### Added

- **Five sections instead of one scroll.** Overview, Performance, Composition, Income & cost and
  Holdings, each with the number of cards behind it. The page was 3 788 pixels of continuous
  scrolling and every chart was equally far away; a section is now between 1 000 and 1 600.

  The range and granularity controls stay global, because the whole page describes one window —
  they are hidden on Holdings, which has no chart for them to drive.

### Fixed

- **A hidden section stayed on screen.** `display: grid` on a class beats the browser's own
  `[hidden] { display: none }`, so the tabs switched what was *marked* visible and changed
  nothing about the page. This is the same defect 0.12.0 fixed once already in a different
  element, which is why the rule is now written against the attribute rather than a class.
- Charts belonging to a hidden section are no longer built at all. A canvas inside
  `display: none` measures zero, and a chart sized from it comes back as a sliver when its tab
  is opened.

## [0.20.0] — 2026-08-10

Nothing visible changed. This release is the validation that should have existed before any of
the previous ones.

### Security

- **A live session id could reach the exported file.** Error messages strip the query string
  from a URL before recording it, but DEGIRO's `/update` endpoint carries the session id in a
  *path segment* — `…/v5/update/1234567;jsessionid=…` — so stripping the query left it in
  place. Those messages are stored as the last error, the last error is in the export, and the
  export is the file people send to each other. The account number went the same way. Both are
  removed now, from every typed error rather than the one that was noticed.

### Fixed

- **The network and session layer had never been executed by a test.** Not "thinly covered":
  `session.js` was at zero percent of its functions and `degiro.js` at six. The rules living
  there are the account-safety ones — requests spaced a second apart, a rejected session never
  retried because a retry looks like a login attempt, a login page returned with a 200 read as
  an expired session rather than parsed as data. All of them were enforced by code nobody had
  run. They are now: `session.js` and `degiro.js` are at 100 % and 96 % of their functions.
- **A whole sync now runs in the test suite**, against a stand-in broker: seven steps in order,
  rows landing in the right stores, a second run not refetching what it has, a failure part-way
  leaving a findable error instead of a half-written database, and the reconstruction agreeing
  with the total the broker reported. `sync.js` went from 40 % to 86 %.
- **The connection report is checked for what it must not contain** — no session id, no account
  number, no name, no amounts. It is the one output in this project explicitly meant to be
  handed to a stranger, and it had no test at all.

## [0.19.0] — 2026-08-10

### Fixed

- **The page ignored the text size you set in your browser.** Sizes were in pixels, so someone
  who sets a larger default because the small one is hard to read still got the small one, and
  the breakpoints did not respond to that setting either. Type and spacing are relative now,
  and the figures scale continuously with the window instead of stepping at fixed widths — at a
  20px browser default the page grows with it and still does not scroll sideways. The only
  pixels left are the hairline rules, which are meant to stay one pixel.

## [0.18.0] — 2026-08-10

### Changed

- **The interface, ported from the mockup's own HTML** rather than read off a screenshot. The
  header is its own surface, the figures are one grid whose hairlines are a one-pixel gap
  showing the container through, the toolbar is a pill with the chosen option raised out of its
  track, and every size is a token.

### Fixed

- **The page scrolled sideways at every window width, including a wide one.** A card with a
  long title and its own controls was 1 509 px wide inside an 820 px window: a grid item
  defaults to refusing to shrink below its content, so nothing could get narrower. Nobody had
  noticed because the extension opens in a full tab.
- **Narrow windows are supported now**, which they never were — the page had one breakpoint and
  below it kept its desktop measurements. Four steps down to a phone-width window, with the
  holdings table scrolling inside its own card rather than pushing the page wide, because that
  table is the accessible relief for the chart colours and may not be the thing that breaks.

## [0.17.0] — 2026-08-10

### Changed

- **The shape language from the mockup.** The page is now one rounded surface on a warm ground
  rather than a stack of cards floating on it, the six figures are a single grid divided by
  hairlines instead of six separate boxes, labels are tracked small caps, and the buttons are
  pills. Every size is a token — `--kpi`, `--title`, `--hint`, `--track`, `--outer` — so the
  denser variant the mockup also draws is a swap of values rather than a rewrite.
- **The header's four actions are no longer equals.** *Sync now* is what you came to do and
  *Wipe & resync* throws your stored data away, and they looked identical. One is filled, the
  other is dashed and turns red on hover.

## [0.16.0] — 2026-08-10

### Changed

- **New colours and surfaces**, the first stage of the interface redesign. Warm paper instead of
  grey, cards with room to breathe, and a categorical palette taken from the delivered mockup.
  Layout is unchanged; this is the paint.

### Fixed

- **Two series in dark mode were the same colour to a colour-blind reader.** The palette carried
  a comment saying it was validated, and it was — in light mode. Measured properly, the dark set
  had five collisions, the worst of them two holdings at ΔE 2,2, which is not "similar" but
  "identical". Both themes now pass with zero, and every categorical slot clears the 3:1
  contrast floor, where three of the old light slots did not.

  It is a command now rather than a claim: `npm run palette` checks contrast against the surface
  and simulates protanopia, deuteranopia and tritanopia, and `npm test` runs it. A palette that
  makes two visible series indistinguishable fails the build.

## [0.15.0] — 2026-08-10

### Added

- **Markers on the value chart where you traded.** The chart marked the days money went in or
  out and marked nothing for the days you made a decision — which is the question people
  actually ask of that line: *where did I buy this*. Small ticks now sit along the top, and the
  tooltip names what happened: *"Traded: 2 buys, 1 sell — NWI, CTS"*. At Week or Month several
  trading days merge into one mark rather than smudging over each other.

  They are not tinted by profit. A purchase is not good or bad on the day it happens, and
  colouring it would be the chart claiming to know something it does not.

### Changed

- **The tiles follow the range you picked**, and say which range. Pressing 1M used to leave
  *TOTAL RESULT +€97 842,64* on screen above a chart showing one month — the same complaint
  that was fixed for the charts in 0.10.0, still true for the numbers above them.

  Two of the six deliberately do not follow it. **Total value** and **Money paid in** are
  positions rather than periods: what the account is worth, and what has been put into it, as
  of the end of the window. A "value over the last month" is not a quantity that exists.

  The percentage is the same daily-chained return the month grid uses, not the result divided
  by the opening value. That is what lets it follow a range honestly: a deposit landing inside
  the window would otherwise inflate the denominator and flatter the return.

## [0.14.0] — 2026-08-10

### Added

- **"Copy bug report"** — every notice the run produced, as JSON on your clipboard, safe to
  paste into a chat.

  It exists because reporting a problem meant screenshots, and a screenshot of a red banner is
  the least useful half of the story. The page shows a warning's *message*; everything behind
  it — the ratio that triggered it, how many instruments hit it, what the sync was doing two
  steps earlier — has never been on screen to photograph.

  It carries codes, counts, ratios, currencies and product types. **No amounts, no instrument
  names, no account number, no session id.** That is not a compromise on usefulness: every
  defect this project has fixed was found in a ratio or a count. A total 44% too high is a
  missing contract multiplier; CHF deriving to 107 instead of 1.07 is the exchange rate read
  off option trades. Neither needs to know how much money anyone has.

  A warning nobody has classified contributes its code and its count and nothing else, so a
  warning added later cannot leak by being forgotten.

  **This does not replace Export JSON.** That file reconstructs a portfolio and therefore
  contains one — it is still something you send to someone you trust. This one you can paste
  anywhere.

## [0.13.0] — 2026-08-10

Two reports from testing 0.12.0, and the two features they turned into.

### Fixed

- **The candle toggle refused instead of acting.** Reported as "the candles don't work", and
  they worked — at Week and Month. At Day the button was disabled, because a day has one
  number and a daily candle is a flat dash. But a disabled button explains nothing where you
  click it: the reason sat in the hint under the chart, and a disabled button catches no
  hover, so there is not even a tooltip. You click, nothing happens, and "broken" is the only
  conclusion on offer. Pressing **Candles** at Day now moves *Results per* to Week and says
  so. Someone pressing Candles wants candles.
- **A drag across the value chart showed nothing while you dragged.** Both ends of the
  selection had to be guessed at. There is now a shaded band with marked edges, and a readout
  naming the two dates, the number of days and what the portfolio **made** over that stretch.
  Deliberately the result and not the change in value, and it says which: a deposit inside the
  selection lifts its end without anything being earned, and this is the chart where that
  matters most.

### Added

- **The composition chart follows the range you are looking at.** It ranked holdings over your
  whole history, so a position that peaked in 2021 and was sold in 2022 kept one of the seven
  colours and drew a flat zero across a 2026 view — while something you actually hold sat in
  "Other", and anything bought recently could not get in at all. It now ranks inside the
  selected window.

  This turns the range buttons into a question worth asking: select 2018 and the chart shows
  what that portfolio *was* then; select ALL and it shows what dominated the whole history.
  Ranking is by average value across the window rather than by peak, because a position that
  spiked for one day is not what dominated a year.

  Your six largest holdings keep their own colour in every view and "Other" keeps its own, so
  the two answers can be compared. Below those six there are no colours left to reserve, so a
  smaller holding can take a different one in a different window.
- **A result per holding**, in the holdings table, over the range you have selected. Closed
  positions show what they realised, open ones what they have made so far, and no cost-basis
  convention is involved — a position closed inside the window is worth nothing at both ends,
  so what it made is simply what came back minus what went in.

  The rows do not add up to the account result on their own, and the cash row carries the
  difference: dividends, interest, fees, and — if you hold foreign currency — the euro value
  of those balances moving with the rate. None of that belongs to a position. A holding whose
  prices are estimated is marked, because an estimate diluted in a total is the whole of a
  per-holding number.

## [0.12.0] — 2026-08-09

*Tested by users and accepted — the release gate in [docs/BACKLOG.md §5](docs/BACKLOG.md).*

### Added

- **Drag across the value chart to zoom.** The six range buttons reached six windows and nothing
  between them — March 2024 was unreachable, so was the fortnight around a crash. A drag sets a
  custom range in the same state the buttons drive, so every chart follows it, and it gives the
  arbitrary start-and-end date the page never had. A drag under two days is a click and does not
  zoom. The selected window is stated above the chart with a Back button, because a zoom you
  cannot leave is a trap.
- **Candles on the cumulative result**, at Week or Month. Each candle opens where the last one
  closed and spans the highest and lowest the result reached inside the period — which is exactly
  what the line hides: a month that ended flat after a 12 % drawdown looks identical to a month
  that did nothing.

  Two things about it are deliberate. It is built on the **deposit-free** curve, because a candle
  on portfolio value would say a deposit was volatility: the high of a month is its maximum daily
  total, so paying €10 000 in on the 12th grows a long upper wick where nothing swung. And it is
  blue-up/red-down rather than the green and red of a trading terminal, because that pair is the
  worst there is for colour-vision deficiency and this project's diverging pair was validated
  against exactly that.

  At Day granularity the toggle is disabled and says why. A day has one number, so a daily candle
  is a flat dash — four times the ink for the same value, and a chart that looks like it is
  describing volatility while describing nothing.
- **Unrecognised API fields are kept instead of dropped.** `parseUpdate` flattened every pair
  DEGIRO sends in `totalPortfolio` and returned two of them; `parseProducts` named ten fields and
  dropped the rest. So margin data has been arriving on every sync since the first release and
  nobody has ever seen it, and an option's contract size, strike, expiry and call/put identity
  were thrown away before reaching disk — which is why a 50 MB export could not answer whether
  DEGIRO returns `contractSize` at all. Your next export answers all of it.

### Fixed

- A `display` value on a class overrides the browser's `[hidden] { display: none }`, so an
  element could be visible while holding the hidden attribute. Found while testing the zoom.

## [0.11.0] — 2026-08-09

*Tested by users and accepted — the release gate in [docs/BACKLOG.md §5](docs/BACKLOG.md).*

Safety and honesty, plus two things to look at. **Press "Wipe & resync" after updating.**

### Fixed

- **A contract size measured through a guessed exchange rate landed on the wrong whole number.**
  How many shares one option contract covers is worked out from what the account actually paid,
  divided by the rate that day. Between two rates DEGIRO stated, that rate is a straight line —
  and a line a couple of percent off moves a contract size of 100 to 102, which then rounds
  there and reports itself as measured. Every valuation of that option was quietly a few percent
  out, and only non-euro instruments were affected, because a euro trade has no rate to guess.
  Measurements now prefer trades that sit near a rate DEGIRO actually stated; where none does,
  the number is still used — falling back to one share per contract would be a hundredfold error
  instead of a two percent one — but it says so.
- **Pence and pounds are pooled rather than chosen between.** An account that trades in GBX but
  converts in GBP was pricing today's holding off a three-year-old trade instead of this week's
  conversion.

### Added

- **Holdings toggle between a table and a share ring.** Same grouping and same colours as the
  stacked chart, so the two agree slice for slice. Written positions are not drawn and are named
  underneath instead: a share of a whole cannot be negative, and a liability drawn as a slice
  reads as an asset.
- **`npm run audit:synthetic`** — builds a complete account out of nothing and runs every
  invariant over it. Long and short calls and puts, contract sizes 1, 10, 100 and 103, a currency
  reached only through options, GBX against GBP, a split-adjusted round trip that must close, and
  a delisted instrument. **This is the first time a call has been run through this engine at
  all**, and it found both defects fixed above on the day it was built.

### Security

- **The export declares what it may carry** instead of listing what to strip. The previous shape
  meant a field added tomorrow would be exported by default — which is exactly how it leaked a
  name and an account number. A test now fails when a key nobody has classified is written.
- **`npm test` refuses account data in the repository**, and `npm run audit` refuses to read an
  export from inside it.
- **The repository history was rewritten** to remove tester names and identifiers that earlier
  revisions carried.



### Security

- **The export declares what it may carry instead of what it must strip.** 0.10.0 shipped a
  denylist of four keys, which meant a key added to the store tomorrow would be exported by
  default — the exact shape that leaked `displayName` in the first place. It is now an
  allowlist, and a test fails when a meta key is written that nobody has classified. Verified
  by adding one and watching it fail.
- **`npm test` now refuses account data in the repository.** A blunt pattern check for exports,
  identifying keys set to literals, account-like numbers, and names from a local (never
  committed) `.leakwords` file. Checked against the two incidents that actually happened: a
  pasted account number and a tester's name in a document. Zero findings on a clean tree.
- **`npm run audit` refuses a path inside the repository**, so an export cannot be staged by
  accident.

### Added

- **Holdings toggle between a table and a share ring.** The ring uses the same grouping and the
  same colours as the stacked composition chart, so the two agree slice for slice. Written
  positions are not drawn and are named underneath instead: a share of a whole cannot be
  negative, and a liability drawn as a slice reads as an asset.

## [0.10.0] — 2026-08-09

The options release. Three separately-reported problems turned out to be one defect, and a
fourth was found while proving it. **Everyone should press "Wipe & resync" after updating**:
every number on the page is recomputed from the raw responses, and the stored ones predate
these fixes.

### Fixed

- **Options were valued as if one contract were one share.** An option contract covers a
  hundred shares, or ten, or — after a corporate action — a hundred and three, and that number
  was nowhere in the code. On one real account it put the total **€39 758,03 above** what
  DEGIRO reported, with 27 written puts each booked at a fraction of its size. The contract
  size is now measured per instrument from what the account actually paid. That account
  resolves 169 of 169.
- **Exchange rates were derived from trades, which include options.** For a share the ratio of
  euros settled to price times quantity is the rate; for an option it is the rate times the
  contract size. Where every trade in a currency was an option the median landed on that
  cluster: **CHF came out at 107,1 instead of 1,07 and DKK at 13,39 instead of 0,13389**, which
  charted a single Novo Nordisk position at €1 040 993 and the whole account at €1,15 million.
  Rates now come from the currency conversions DEGIRO itself booked, which state the rate
  outright on a known date.
- **A GBP cash balance was counted at 1:1.** Pence and pounds are the same currency, so trading
  in GBX now gives the GBP rate and vice versa.
- **A closed position could leave shares behind.** Buys and sells were each divided by the
  split factor measured from their own fill, so two fills on one volatile day fell into
  different regimes and stopped cancelling. This invented **17,36 shares of Bed Bath & Beyond**
  — bankrupt and delisted — on one account and **−4,09 of GameStop** on another, in both cases
  out of a ledger that nets to exactly zero. The unit conversion now applies to the price
  rather than the share count, so a position that closes is worth nothing whatever the factor
  does.
- **The holdings table showed a converted number, not a share count.** With four decimals in
  Dutch formatting, `17,363` sat directly beneath `2.000` and read as seventeen thousand. It
  now shows the shares DEGIRO booked.

### Added

- **Positions are checked against DEGIRO's own sizes.** Any share count that disagrees is an
  error naming the instrument. The counts come from your transaction history, so a difference
  there means the history is incomplete — and the whole chart rests on it.
- **A reconciliation failure now says which kind it is.** Share counts disagreeing is an error.
  Share counts agreeing while values differ is a price disagreement, reported with the
  instrument responsible — DEGIRO's own two sources disagree on illiquid options, where
  `/update` carries a last trade older than the daily close.
- **Exchange rates unobserved for more than a quarter are flagged.** Between observations the
  rate is a straight line, and a straight line across five years is a guess with a confident
  face on it. Prices were already flagged after ten days; rates were not.
- **`npm run audit`** — runs the engine over an exported account and checks five invariants
  against DEGIRO's own figures. This is what found the fabricated positions.
- **"Results per" now applies to every chart.** It drove two of eight, so pressing Month left
  the largest chart on the page unchanged and pressing Day did nothing at all when Auto had
  already chosen day.
- **Compare specific months.** Click a cell in the grid — September 2025 against November 2020,
  up to four. Clicking a month name still compares that month across every year.

### Security

- **The exported JSON no longer carries your name, account number or user token.** That file is
  how every defect in this project has been reported, so it gets sent to other people; it was
  shipping `displayName`, `intAccount` and `userToken` along with the numbers. Those are now
  redacted. Values, dates and instrument names stay — they are what the file is for.

  Nothing else was exposed. This extension has no API keys: it uses the session cookie your
  browser already holds, which is read per request and never stored, logged or exported. The
  connection check reports the length of that cookie and never its value. Requests go to
  `trader.degiro.nl` and `charting.vwdservices.com` and nowhere else, and the content security
  policy forbids loading any remote script.

### Changed

- The month comparison drops its aggregate columns when specific months are picked. Averaging
  one observation, or reporting "1 of 1 positive", dresses two data points up as evidence; it
  now shows where each month ranks across the whole history instead.

### Known limitations

- `fixtures/` is still generated rather than captured. Two real accounts now inform the tests,
  but their data is not in this repository — see [README](README.md#status-honestly).
- An account holding illiquid options will not reconcile to the cent, because DEGIRO's live
  total and its daily closes disagree. The page says so and names the instruments.
- Instruments with no price history are still valued at the last price they traded at.

## [0.9.0] — 2026-08-08

- Foreign currencies converted using the rates the account's own trades settled at, instead of
  being counted 1:1.
- Storage keys made unique, after 46 cash movements were lost to `id: 0` collisions.
- Split-adjusted price series reconciled against the prices actually paid, after a portfolio
  charted at €429 million against €116 001 ever paid in.
- Month-by-month grid and month comparison.
- Connection check reporting which of the seven sync steps broke.
