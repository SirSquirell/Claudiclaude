# Changelog

Notable changes per release. Entries are written for someone deciding whether to resync, so
they say what was wrong and what it did to the numbers, not which functions moved.

This file is updated in the same commit as the change it describes. Every story lands as one
commit carrying its identifier, so a single change can be undone with
`git revert <sha>` — see [docs/BACKLOG.md §6](docs/BACKLOG.md) for what that does and does not
buy you.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions are
plain increments — this is not a library and nothing depends on its API.

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
