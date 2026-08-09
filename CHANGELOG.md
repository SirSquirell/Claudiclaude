# Changelog

Notable changes per release. Entries are written for someone deciding whether to resync, so
they say what was wrong and what it did to the numbers, not which functions moved.

This file is updated in the same commit as the change it describes. Every story lands as one
commit carrying its identifier, so a single change can be undone with
`git revert <sha>` — see [docs/BACKLOG.md §6](docs/BACKLOG.md) for what that does and does not
buy you.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are
plain increments — this is not a library and nothing depends on its API.

## [Unreleased] — 0.11

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
