# Asteria / DEGIRO Portfolio History — redesign package

Five files. Read them in this order.

| file | what it is | for whom |
|---|---|---|
| `PROMPT.md` | The block to paste into Claude Code — it handles branch, unzip and commit itself — plus what you do per phase | you, first |
| `portfolio-redesign.html` | Working reference concept. Open it in a browser. | you and Claude |
| `DESIGN-BRIEF.md` | The target: what is wrong, what to keep, what to change | Claude |
| `MIGRATION.md` | The process: 8 phases with gates, and the parity table | Claude |

## Start here

1. Open `portfolio-redesign.html` in a browser and click around: the period buttons, dragging
   across the value chart, the eye toggle, the share button next to any figure. Two minutes.
2. Open a fresh Claude Code session in the repo root, attach `asteria-redesign.zip`, and paste the
   block from `PROMPT.md`. It does its own branch, unzip and commit — you do not edit the repo.
3. The first reply must be: setup done, frozen id inventory, passing parity test. Nothing else.
   If it starts restyling in the same turn, interrupt it: that baseline is only valid if it was
   taken before any change.

## What the concept is and is not

It is a design reference: hierarchy, the window semantics, the share card, the branding, the
axis rules. Every number in it comes from the project's own demo fixtures.

It is **not** code to copy. The charts are hand-rolled SVG where the real app keeps Chart.js.
Per-holding history, monthly dividend and the account name are generated demo values, seeded so
they add up to the real fixture totals. Some toggles only move `aria-pressed`. `MIGRATION.md` §6
lists all of this explicitly.

## Three things left for you to decide

`MIGRATION.md` flags these and instructs Claude to stop and ask rather than choose:

- the connection check (`diag-table`) has no home yet
- Optimism Mode (`frown-toggle` and its `NOT THE REAL NUMBERS` stamp) has no home yet
- the granularity control (`gran-group`, day/week/month) is either restored beside the period
  control or explicitly retired with a reason
