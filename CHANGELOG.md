# Changelog

Notable changes per release. Entries are written for someone deciding whether to resync, so
they say what was wrong and what it did to the numbers, not which functions moved.

This file is updated in the same commit as the change it describes. Every story lands as one
commit carrying its identifier, so a single change can be undone with
`git revert <sha>` — see [docs/BACKLOG.md §6](docs/BACKLOG.md) for what that does and does not
buy you.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are
plain increments — this is not a library and nothing depends on its API.

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
