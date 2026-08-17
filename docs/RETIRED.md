# Retired and relocated elements

The redesign's ledger. Every id frozen in `test/parity.test.js` must either still exist in
`src/ui/app.html` **or** appear here with a decision. An element in neither is a bug, not a
decision — that is what the test says when it fails.

This file exists because the failure mode of a redesign is not "it looks wrong", it is **silent
loss**: a prettier Overzicht that quietly drops the currency chart, the connection check and
Optimism Mode, and nobody notices for two months. `docs/redesign/MIGRATION.md` §3 is the parity table
this ledger answers to.

## Format

One line per id, and the arrow decides which kind it is:

```
- `c-cash` → Posities · Contanten over tijd
- `frown-toggle` → RETIRED: superseded by …, because …
```

**Relocated** — the text after the arrow is where it now lives, section first. The element still
exists under a new id or inside a new panel; say which.

**Retired** — the line starts with `RETIRED:` and carries a reason, not a shrug. "No longer needed"
is not a reason; "the granularity it selected is now the source's own resolution, so the control had
nothing left to choose" is.

A line without an arrow, or a `RETIRED:` line without a reason, fails the test. Both halves are
load-bearing: the arrow is what makes the ledger reviewable, and the reason is what makes a deletion
a decision somebody can disagree with later.

## Relocated

*(nothing yet — the migration has not started)*

## Retired

*(nothing yet)*
