# Endpoint reconciliation report

SPEC §8 asks for this before any code is written: for each endpoint in §2, state
whether the fixtures confirm the path, the parameters and the response shape, and list
every place the spec is wrong.

## Confirmed against a real account (2026-08-08)

A full export from a live account settled several of the open questions below.
No HAR, so request shapes are still unverified, but the *responses* are now
evidence. What it proved:

| Question | Answer |
|---|---|
| vwd `times` anchor | **Confirmed and correct.** With `period=P50Y` the anchor comes back as *today minus fifty years* (`1976-08-08`), and the point offsets are relative to that. Resolved spans of 2008→2026 and 2016→2026 for two instruments. SPEC §2.1 was right and the parser handles it. |
| `vwdIdentifierType` | **Not always `issueid`.** Of 149 traded instruments on one account, 62 came back as `vwdkey`, with identifiers like `AMC.BATS,E` rather than a number. Requesting those as `issueid:` returns no series at all: 77 holdings had no price history, 59 of them for this reason alone. Fixed by carrying the type through to the chart URL. |
| Cash funds among positions | `/update` lists `FLATEX_EUR` as a position with `productType: 311`. It is not an instrument, has no `vwdId`, and asking `products/info` about it is pointless. Now skipped. |
| Reporting endpoint volume | 5 907 cash movements and 871 transactions over ~6 years on one account. A single all-history query is what makes `/transactions` answer 502. |
| Cash descriptions | 230 rows in one account matched no rule: `Reservation iDEAL` (224) and `Inkomsten uit Securities Lending - <month>` (6). Both now classified — see below. |
| Row ids are not unique | **Confirmed and fixed.** `/accountoverview` reports `id: 0` on many rows; 5 907 fetched became 5 861 stored, losing 46 movements to key collisions. Worse, 541 rows on that account were byte-identical to another row, so a content hash is no help either. The key is now the reported id plus the row content plus an occurrence counter within the response. |

### The vwd series is split-adjusted; the transaction ledger is not

The finding that mattered most. A second export, this time with transactions,
showed a portfolio peaking at **€428,938,296** against €116,001 ever paid in,
with today's totals correct.

The cause is not a broken series. Sampling the shapes settles it:

| | 1995 | 2000 | 2021 | 2026 |
|---|---|---|---|---|
| ASML | 3.60 | 42.35 | 684 | 1244 |

That is ASML's real history. The instrument that blew up, a small cap through
several reverse splits, reads 7,030,800 in 2020 and 0.93 in 2026 — also real,
adjusted so that today's share is comparable with a share of six years ago.

The ledger is not adjusted. It holds the shares as they were booked at the time.
Multiplying one by the other is wrong by the cumulative split factor:

```
49 shares × 7,030,800 (adjusted) = €344 million
49 shares ÷ 523,125 × 7,030,800  = €658        ← what he actually paid: €538.92
```

The factor is measurable and stable: **523,125** at a December 2020 purchase and
**522,000** at the December 2022 sale, two years and several splits apart. The
residual €658 vs €538.92 is exactly the dollar rate of that week (1.222), which
is the documented FX limitation and nothing else.

So the audit is: compare every quote against the price actually paid on that
same day. Ratio ≈ 1 means the two agree. A large but *stable* ratio means the
same instrument in different units, and the share count is converted into the
series' units. A large and *unstable* ratio means the series cannot be
reconciled at all and is discarded. On that account: 14 rescaled (spreads 1.00
to 1.21), 2 discarded (spreads 5.5 and 9.9), peak down to €438,162.

### FX does not need its own price series

SPEC §2.2 assumed non-EUR positions would need a daily EUR/X series pulled from
vwd, and left v1 counting them 1:1 with a loud warning. That was more pessimistic
than the data warrants: **every foreign transaction already states both sides of
the conversion.** The price and quantity are in the instrument's currency;
`totalPlusFeeInBaseCurrency` is what left the account in euros.

```
rate = |price × quantity| ÷ |totalBase − fee|      (euros per unit)
```

On a real account this returns **exactly 1.0000 across 267 euro-denominated
trades** — the formula proving itself — and USD 0.8627, HKD 0.1063, SEK 0.0981,
CAD 0.7633, all correct. Previously every one of those was counted as 1.00, so
an HKD position was overstated ninefold.

The correction is invisible in that account's *current* total, because its open
positions happen to be entirely EUR. Historically it matters a great deal: USD
exposure peaked at €107,424 of a €367,599 portfolio, overstated by 15.9% on that
day.

Rates are interpolated between observations and held flat outside them. A
currency the account has never traded in still has no rate, keeps 1.0, and says
so as an error rather than guessing.

### Reservation iDEAL

Worth writing down, because guessing at it would have been costly. 224 rows,
112 positive and 112 negative, summing to exactly zero. Each positive is
followed a few days later by a matching negative *and* a real `iDEAL Deposit`
of the same amount.

DEGIRO advances the money so you can trade while the transfer clears, then
reverses the advance when it lands. So it is neither a deposit (the real one is
already there) nor part of your net worth (it is a receivable). Booking it as
cash puts a phantom gain on the day it appears and an equal phantom loss on the
day it reverses — 55 such spikes in this account.

## Everything else: still unconfirmed

**The honest answer for the rest: nothing below this heading is confirmed.** What the
section above confirms came from account *exports* — responses, not requests — so the
request shapes (paths, parameters, envelopes) are unverified even where the response
fields are known.

`fixtures/` contains no captured traffic. There was no HAR to read, and DEGIRO cannot
be reached without a logged-in browser. So the fixtures were *generated* to match the
shapes SPEC §2 describes. Testing the parsers against them proves the parsers agree
with the spec — it proves nothing about DEGIRO.

Everything below is therefore split into **assumed** (taken from the spec, unverified)
and **defended** (what the code does when the assumption turns out wrong).

## Per endpoint

### `GET /login/secure/config`

| | |
|---|---|
| Assumed | returns `{data: {sessionId, clientId, tradingUrl, …}}` |
| Used for | nothing on the critical path |
| Defended | not called during sync. `session.js` reads `JSESSIONID` from the cookie jar directly, which is one fewer thing to break. |

The spec lists this endpoint but the flow never needs it: the cookie is the session.
Kept in `config.js` and `degiro.js` for debugging only.

### `GET /pa/secure/client?sessionId={sid}`

| | |
|---|---|
| Assumed | `data.intAccount` (number) and `data.id` (number, used as the chart `userToken`) |
| Confidence | **medium.** This is the most widely-reported shape in third-party DEGIRO clients, and the `data.id`-is-the-userToken detail is unusual enough that the spec author almost certainly read it off a real response. |
| Defended | `parseClient` accepts `intAccount`/`int_account` and `id`/`userToken`. If either is missing, `resolveSession` returns `client-endpoint-shape` and the UI says the endpoint changed, rather than syncing with `undefined` in the URL. |

### `GET /trading/secure/v5/update/{intAccount};jsessionid={sid}`

| | |
|---|---|
| Assumed | the name/value-pair encoding: `{portfolio: {value: [{id, value: [{name, value}, …]}]}}`, plus `totalPortfolio` and `cashFunds` in the same shape |
| Confidence | **medium-high** for the encoding (it is distinctive and long-standing), **low** for the specific total field name |
| Spec gap | §2 does not say which field carries the account total. `parseUpdate` tries `reportNetliq`, `totalvalue`, `total`, `netliq` in that order. **This is the single field most likely to be wrong**, and it is the one the SPEC §6 reconciliation check depends on. |
| Defended | positions with `size: 0` are dropped (closed positions keep appearing). If no total field matches, `totalValue` is `null` and reconciliation is skipped rather than reported as passing. |

### `GET /reporting/secure/v4/transactions`

| | |
|---|---|
| Assumed | `{data: [{id, productId, date, buysell, price, quantity, totalPlusFeeInBaseCurrency, feeInBaseCurrency, …}]}` |
| Spec gap | §2 does not say whether `quantity` is signed on a sell, or whether the sign lives only in `buysell`. Both happen in the wild. |
| Defended | `parseTransactions` normalises: if `buysell` starts with `S` and quantity is positive, it is negated. A ledger that gets this wrong doubles your position on every sale, so it is covered by a test. |
| Note | `fromDate=01/01/2015` in the spec. `config.js` starts at `HISTORY_START = 2019-01-01` and `sync.js` walks further back a year at a time while rows keep arriving, down to `HISTORY_FLOOR = 2008-01-01`; a hardcoded 2015 would silently truncate an older account, and asking for everything since 2013 in one query made the endpoint time out on busy accounts. |

### `GET /reporting/secure/v6/accountoverview`

| | |
|---|---|
| Assumed | `{data: {cashMovements: [{date, valueDate, productId, description, currency, change, balance, type}]}}` |
| Confidence | **low on semantics, medium on structure.** The structure is probably right. The *meaning* of each row is carried in a localised free-text `description`, and that is guesswork until a real capture lands. |
| Spec gap | §1.4 says to compute "net external cashflow (deposits, withdrawals, DEGIRO transfers)" but never says how to recognise one. That gap is where this project's worst bug would live. |
| Defended | `classify.js` is an explicit ordered rule table with NL and EN patterns, unit-tested per phrase. Anything unmatched becomes `UNKNOWN` — never `DEPOSIT` — is counted, and is reported in a banner. `UNKNOWN` still moves the cash balance but never counts as external cashflow, so a misread row shows up as a P/L spike you can see, not as a silently laundered deposit. |
| Known unknown | **flatex cash sweeps.** DEGIRO books both legs of a sweep between the trading account and the flatex bank account. `CATEGORY_META.CASH_SWEEP.inCash` is `false` on the assumption that counting both would double the balance. If your reconciliation is off by exactly the sweep total, flip that one flag. |

### `POST /product_search/secure/v5/products/info`

| | |
|---|---|
| Assumed | body is a bare JSON array of productId strings; response is `{data: {"<productId>": {name, isin, symbol, currency, vwdId, vwdIdentifierType, productType, closePrice, closePriceDate}}}` |
| Confidence | **medium.** The bare-array body is unusual enough to be reported rather than invented. |
| Spec gap | §2 does not mention `vwdIdentifierType`. It matters: the chart URL hardcodes `issueid:`, and a product whose identifier type is something else will silently return no series. |
| Defended | `parseProducts` keeps `vwdIdType`. A product with no series at all falls back to its last traded price, every affected day is flagged `estimated`, and a warning names the instrument. |

### `GET charting.vwdservices.com/hchart/v1/deGiro/data.js`

| | |
|---|---|
| Assumed | `{series: [{id: "issueid:N", …}, {id: "price:issueid:N", times: "YYYY-MM-DD/P1D", data: [[offset, close], …]}]}` |
| Confidence | **high.** §2.1's "x is an offset in resolution units from `series.times`, not a timestamp" is far too specific to be a guess, and it is exactly the kind of detail you only learn by getting it wrong once. |
| Defended | `parseTimesAnchor` + `parseChartResponse`, with the unit test §2.1 explicitly asks for. `unwrapJsonp` strips a callback wrapper if one appears despite `format=json`. Chunked at 20 series per request per §2.1. |
| Untested | the >60-series 404. Chunking at 20 is taken on faith. |

## What to check first with a real capture

In priority order — these are the ones that would make the charts wrong rather than
merely broken:

1. **The account-total field on `/update`.** Everything else can be right and the
   reconciliation banner still lies if this reads the wrong number. Confirm which of
   `reportNetliq` / `totalvalue` / `netliq` your account returns.
2. **Cash-movement descriptions.** Export one year of `accountoverview` and run
   `npm test` — `test/parse.test.js` asserts nothing is left `UNKNOWN`. Whatever fails
   is a rule to add to `classify.js`.
3. **Whether sweeps are double-booked.** Compare the summed cash balance against
   `totalCash` from `/update` on the same day.
4. **Sign convention on sells** in `transactions`.
5. **Whether the vwd series is split-adjusted.** The engine flags a >40 % one-day move
   with no trade as a suspected split; pick an instrument you held through a real split
   and see whether the flag fires.

## How to produce the capture

See `docs/CAPTURE.md`. `tools/har-to-fixtures.mjs` does the extraction and the
redaction; it also prints which endpoints your HAR is missing.
