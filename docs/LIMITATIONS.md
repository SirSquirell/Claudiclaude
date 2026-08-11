# What this does not do, and where it is known to be wrong

Moved out of the README to keep that file to installing and where the data comes from.
Nothing here is a plan to fix something — it is what is true today, so that a number on
screen can be judged rather than trusted.

## The two checks the page runs on itself

**Share counts.** DEGIRO states the size of every position you hold, and the page checks
its own counts against them. Those counts come from your transaction history, so a
disagreement means the history is incomplete or misread — and every day in the chart rests
on it. Reported in red, naming the instrument.

**The total.** The reconstructed total is compared against the total DEGIRO reports, to the
cent. When it fails it says which kind of failure it is: share counts disagreeing is the
history being wrong; share counts agreeing while values differ is a disagreement about
prices, which happens honestly, because for an instrument that rarely trades DEGIRO's own
live total and its own daily closes do not match each other.

A portfolio chart that is quietly wrong is worse than no chart, so it would rather report a
failure than round the difference away. The yellow warnings work the same way: a cash
movement whose description is not recognised is reported rather than guessed at, because
guessing "deposit" would silently turn your own money into profit.

## Known limitations

- **An account holding illiquid options will not reconcile to the cent.** DEGIRO's live
  total and its own daily closes disagree for instruments that rarely trade. The page says
  so and names them.
- **Some instruments have no price history at all** — usually a delisting. Those positions
  are held at the last price they traded at, so their movement between trades is not real.
  The page says which ones.
- **A currency you have never traded or converted has no rate**, so it stays at 1:1 and says
  so in red.
- **An option's contract size is measured, not read.** Where no exchange rate was observed
  near the trades it was measured from, the number is still used — falling back to one share
  per contract would be a hundredfold error instead of a two percent one — but it says so.
- **Coverage is not uniform across instrument types.** See the matrix below: some of it has met
  a real account and some of it has only ever met a generator.
- **The zoom needs a mouse.** Dragging across the value chart has no keyboard equivalent,
  which was an acceptance criterion of the story that shipped it and was not built.
- **`fixtures/` is generated, not captured.** The demo data reproduces the response *shapes*
  the spec describes. Real accounts have confirmed many of them; their data is not in this
  repository and will not be. What is evidence and what is still an assumption is written
  out per endpoint in [ENDPOINT-REPORT.md](ENDPOINT-REPORT.md).

## Instrument coverage, per broker

Written as a matrix rather than as prose, and with a broker column from the start, because
coverage is a property of **an adapter against an instrument type** — not of this project as a
whole. A second broker adds a column here; it does not get a document of its own, and it does not
inherit DEGIRO's evidence.

**Four levels, and the middle two are the ones people conflate:**

| Level | Means |
|---|---|
| **captured** | A real account holding this has been run through `npm run audit` and the invariants held |
| **synthetic** | A generated account exercises it and passes. The generator states the truth and the engine is never told it, so this is real evidence about the *arithmetic* |
| **arithmetic** | The model handles it by construction and nothing exercises it |
| **none** | Never considered. Not "probably fine" |

The gap between *captured* and *synthetic* is the whole reason for the table. A synthetic fixture
reproduces the response shapes we already believe in, so it cannot catch a belief that is wrong —
and the parsers accept several candidate field names per value, where a name matching nothing
returns zero **quietly**. Only a real capture closes that.

| Instrument type | DEGIRO | Notes |
|---|---|---|
| Shares, ETFs | **captured** | |
| Bonds | **synthetic** | |
| Written (short) puts | **captured** | 27 contracts in one real account, every one a `P` |
| Long calls | **synthetic** | Never met a real account |
| Short calls | **synthetic** | Never met a real account |
| Bought (long) puts | **synthetic** | A different sign from the 27 that were captured |
| Covered calls | **captured**, by construction | Not a separate case: a short call plus a long position, and neither leg needs to know about the other |
| Futures, warrants, turbos | **none** | |
| Crypto | **none** | Never considered. See below |

**If you hold calls or bought puts**, running `npm run audit` on an export and reporting the result
either way turns two rows from *synthetic* into *captured*. It is an afternoon, and it is the
single cheapest thing anyone can do for this project.

**Crypto is unconsidered rather than untested**, and two things would have to be looked at first.
A fractional quantity settled to the cent makes the contract-size measurement unreliable in
exactly the way a one-cent currency conversion made an exchange rate unreliable — the same
mechanism, in a second place. And a market that trades at the weekend, valued against a
weekday-only price series, would report most of its history as estimated: honest, and confusing.

## Checking it against your own account

```bash
npm run audit path/to/export.json
```

Runs the real engine over an account exported from the extension and checks five invariants
against DEGIRO's own figures: a closed round trip holds nothing, the ledger matches what was
booked, open positions match the sizes DEGIRO reports, P/L plus external flow equals the
change in value, and nothing is worth anything unless it is held. It refuses a path inside
the repository, and the export never leaves your machine.

If something looks broken rather than wrong, press **Check connection** in the extension: it
walks every step of the sync and reports which one failed, with HTTP statuses and row counts
but no session id, account number or amounts — so the output is safe to paste into an issue.
