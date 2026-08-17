# The prompt

Attach `asteria-redesign.zip` to a fresh Claude Code session opened in the repo root, and paste
the block below as your first message. It does its own setup — you do not have to touch the repo.

---

```
I have attached asteria-redesign.zip. It contains a redesign brief, a migration plan and a
working reference concept for this extension's UI. Do the setup yourself; I am not editing the
repo by hand.

STEP 0 — SETUP

Locate the zip. Look for asteria-redesign.zip in the repo root, the current working directory,
~/Downloads and any path this session was given for attachments. If you cannot find it, list
where you looked and stop; do not guess or reconstruct its contents.

Then:
- Confirm `git status` is clean. If it is not, stop and show me what is uncommitted.
- Confirm you are not on the default branch. Create and switch to `redesign`.
- `unzip` the archive into docs/redesign/ (5 files: README.md, PROMPT.md, DESIGN-BRIEF.md,
  MIGRATION.md, portfolio-redesign.html).
- Commit them, message: "docs: redesign brief, migration plan and reference concept".
- Never push, never touch the default branch, never force anything. Commit locally only.

STEP 1 — READ

Read docs/redesign/DESIGN-BRIEF.md and docs/redesign/MIGRATION.md in full. Read
docs/redesign/portfolio-redesign.html as source: it is a REFERENCE CONCEPT, not code to copy.
It has hand-rolled SVG charts and generated demo data. The real implementation keeps Chart.js,
keeps src/lib/** byte-identical, and keeps every existing test passing. Copy the decisions, not
the code. You will not see it rendered, which is exactly why every decision is written out in
prose in those two documents — if something is not stated there, ask rather than infer.

MIGRATION.md §6 lists where the concept is knowingly not the product. Read it before you copy
anything from the HTML.

STEP 2 — PARITY BASELINE, BEFORE ANY REDESIGN WORK

1. Extract every id from src/ui/app.html — canvases, tables, buttons, control groups, inputs,
   data-tab values, and the zoom-state and frown elements — into test/parity-ids.js as a frozen
   array. Take it from today's app.html, before anything changes.
2. Write test/parity.test.js per MIGRATION.md §5: every frozen id must either still exist in
   src/ui/app.html or appear in docs/RETIRED.md with a one-line reason. Create docs/RETIRED.md
   with a header and no entries.
3. Run `npm test`. It must pass. Commit.

Then STOP. Report the frozen inventory and the parity test and wait for me. Do not start phase 1
in the same turn.

STEP 3 — THE PHASES

Work MIGRATION.md §2 phase by phase, in order, one commit per phase.

- Do not start a phase until the previous phase's gate is green.
- A gate is: `npm test` passes, `npm run palette` reports zero collisions, and you have exercised
  the UI. You cannot see pixels, so for the visual gates: run `npm run demo`, and verify what you
  can programmatically — element presence, computed styles, that no chart container has zero
  height, that no text node is empty where a number belongs. Say plainly which parts of a gate you
  could not verify. Never report a gate green on the strength of the code alone.
- Before deleting or renaming ANY element in src/ui/app.html or src/ui/app.js, check it against
  the parity table in MIGRATION.md §3 and either give it its new home or add it to
  docs/RETIRED.md with a reason. An element in neither is a bug, not a decision.
- Phases 4 through 7 change what numbers mean. Each needs a new test written BEFORE the
  implementation: test/window.test.js, test/mask.test.js, and an extension of
  test/anon-brand-snapshot.test.js.
- Preserve the wording of all 27 hint paragraphs. Move them behind a "?", into a panel subtitle,
  or into a panel footer. Do not rewrite, shorten or blandify them.
- Every new string needs both NL and EN in i18n.js. Every retired string leaves i18n.js in the
  same commit.
- Pause after each phase and report. I review before you continue.

DO NOT TOUCH

src/lib/**, src/sw.js, manifest.json, tools/check-palette.mjs, tools/check-leaks.mjs, the palette
values, and everything in MIGRATION.md §4. This is a UI change. If you need a number the engine
does not expose, say so instead of computing it in the view.

FOUR THINGS THAT ARE EASY TO LOSE — verify each explicitly at phase 8

- The period control recomputes, it does not re-slice: result, time-weighted return, flows,
  dividend and drawdown are all measured inside the window against an anchor point.
- Dragging across the value chart sets a custom window, with a chip that names it in full dates
  and resets it. This is what the existing #zoom-state element is for.
- Hidden amounts are replacement, not blur. The test must assert that no amount string remains in
  the DOM while hidden.
- The share card stays drawn, never a DOM capture, with the field allowlist and a provenance line
  that can still say it does not reconcile.

THREE THINGS YOU DO NOT DECIDE ALONE

Bring these to me before phase 8, with a recommendation each: the connection check (diag-table)
needs a home, Optimism Mode (frown-toggle and its stamp) needs a home, and the granularity control
(gran-group, day/week/month) is either restored beside the period control or retired with a stated
reason. Do not silently drop any of them.

HOW YOU ASK ME THINGS

Standing rule: never resolve an ambiguity by choosing. Present the options, say which one you
recommend and why, and wait. A decision I never saw is worse than a delay.

Ask when, and only when, one of these is true:
- The brief and an existing behaviour disagree.
- A figure would go on screen without it being clear which period it belongs to.
- An element has no home in the parity table and you are about to retire it.
- You need a number src/lib does not expose.
- A change would alter what an existing number means.
- A new string has no obvious NL and EN pair.

Do NOT ask about: variable names, file layout, test names, which helper to extract, formatting,
or anything else where a competent choice is invisible to me. Make those and move on.

Format: batch your questions per phase, at most five, each one answerable in a word or a line.
Give your recommendation first, then what the alternative costs. Number them so I can reply "1b,
2 your call, 3 yes".

Before phase 1, do a question round: list every decision you expect to need from me across all
eight phases that you can already see, with recommendations. I would rather answer eight things
now than be surprised at phase 6.

If I say "your call", make the call and note it in the commit message.

Start with STEP 0 and report when you reach the stop in STEP 2.
```

---

## What you do

1. **Attach the zip, paste the block, then wait.** The first reply should be: setup done, frozen
   inventory, passing parity test. Nothing else. If it starts restyling in the same turn, interrupt
   it — that baseline is the entire safety net, and it is only valid if taken before any change.
2. **Review per phase.** Phases 1–3 are cosmetic and reversible, so skim. Phases 4–7 change what
   the numbers mean: read the new test in each, not the CSS. A test that only asserts "returns a
   number" is not a gate.
3. **Push back on vague gates.** It cannot see the screen, so a gate is partly unverifiable by
   design. That is fine as long as it says so. "Verified" without naming what it checked means it
   read its own code.
4. **Read `docs/RETIRED.md` at the end as a list, not as a diff.** Every line is a feature you no
   longer have. If a line surprises you, the parity net worked — put the feature back.
5. **Decide the three open items yourself** when it asks: connection check, Optimism Mode,
   granularity.
6. **Last check before merge:** `npm run demo`, hide the amounts, look at every section. If any
   absolute amount is still readable, phase 6 is not done.

## When it drifts

- Rewrote a hint paragraph "for clarity" → revert. The copy is the product's voice.
- Changed a palette value to "improve contrast" → revert, point it at `tools/check-palette.mjs`.
  That decision has a test behind it.
- Made the period control apply to a section that ignores it → honour it or hide it, never a third
  state.
- Turned the share card into an `html2canvas` screenshot → revert. That ships whatever is on
  screen, which is what the allowlist exists to prevent.
- Wants to vendor a font for the wordmark → legitimate, but a separate commit and a brand-note
  change, not part of a phase.
