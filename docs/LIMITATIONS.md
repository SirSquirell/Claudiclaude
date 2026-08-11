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
- **Only written puts have ever met a real options account.** The arithmetic makes no
  distinction — a position is a signed quantity times a price times a contract size, so a call
  is the same sum as a put — and the generated account exercises long calls, short calls, long
  puts and short puts, all of which pass. But every contract in the one real options account
  this was verified against is a written put.

  So calls and bought puts rest on **arithmetic plus synthetic evidence, and no capture**. What
  that cannot rule out is a field name: the parsers accept several candidates per value, a name
  that matches nothing returns zero quietly, and a fixture built from shapes we already believe
  in cannot catch a belief that is wrong. If you hold calls, run `npm run audit` on an export
  and tell us either way — it is an afternoon and it would close this.

  *Covered* calls need nothing extra: a covered call is a short call and a long position, and
  neither leg has to know about the other.
- **Crypto has never been considered at all**, not merely untested. Nothing in the code has
  ever seen one, and two things would need looking at before it could be trusted: a fractional
  quantity settled to the cent makes the contract-size measurement unreliable in exactly the way
  a one-cent currency conversion did, and a market that trades at the weekend against a
  weekday-only price series would report most of its history as estimated.
- **The zoom needs a mouse.** Dragging across the value chart has no keyboard equivalent,
  which was an acceptance criterion of the story that shipped it and was not built.
- **`fixtures/` is generated, not captured.** The demo data reproduces the response *shapes*
  the spec describes. Real accounts have confirmed many of them; their data is not in this
  repository and will not be. What is evidence and what is still an assumption is written
  out per endpoint in [ENDPOINT-REPORT.md](ENDPOINT-REPORT.md).

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
