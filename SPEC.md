# SPEC: DEGIRO Portfolio History (Chrome extension)

Personal-use Chrome extension (MV3) that shows the total value of a DEGIRO account
over time, with selectable ranges (1W / 1M / 3M / YTD / 1Y / ALL) and a per-period
P/L view. DEGIRO's own UI only shows the day delta; this fills that gap.

Target output: two charts, matching the reference screenshots.

1. Portfolio value including cash, daily line, full account history.
2. Period results, bars per day/week with the P/L number, plus a cumulative line.

## 1. Architecture decisions (do not renegotiate these without a reason)

### 1.1 Chrome extension, not a script or web app

The reason is the session, not the UI. The browser already holds an authenticated
DEGIRO session. A local Python/Node script would need username, password and 2FA
handling, and would store credentials on disk. A plain web app cannot call DEGIRO at
all: their CORS policy blocks browser-origin requests. An MV3 extension with
`host_permissions` for `trader.degiro.nl` bypasses CORS and reuses the existing
cookie. No credentials are ever stored.

### 1.2 Reconstruct history, never snapshot it

DEGIRO exposes no daily NAV series. The obvious design (take a snapshot of total
value every day and build the chart from that) produces an empty chart today and a
useful one in 2031. Instead, derive everything:

```
transactions (all-time)      -> position ledger: qty per productId per day
cash movements (all-time)    -> cash balance per day
daily close price per vwdId  -> valuation per position per day
                             -> total value per day
```

This gives the full history from account opening on the first sync, and any bug fix
is just a recompute. The only persisted "truth" is the raw API responses; every
chart value is derived and disposable.

### 1.3 No manual entry, no PDF import, no screenshot OCR

Dropped from scope. The transactions endpoint returns the complete trade history
already, so an importer would be significant work for data we get for free. Keep the
internal model transaction-shaped (`{date, productId, qty, price, currency, fees}`)
so a CSV importer stays a small addition if DEGIRO ever breaks the endpoint.

### 1.4 Value ≠ performance

A "value including cash" chart jumps when money is deposited. A naive week delta then
reports a deposit as a gain. Compute and store net external cashflow per day
(deposits, withdrawals, DEGIRO transfers) and report:

- `value[t]` for the value chart
- `pnl[t] = (value[t] - value[t-1]) - netExternalCashflow[t]` for the results chart

Dividends, fees and interest are internal: they belong in P/L, not in cashflow.

## 2. Endpoints

Treat this list as the last-known shape, not as truth. It is a reverse-engineered API
and DEGIRO changes it without notice. Step 1 of the build is verifying each endpoint
against a real HAR capture (see §5).

| Purpose | Request |
|---|---|
| Session config | `GET https://trader.degiro.nl/login/secure/config` |
| Account ids | `GET https://trader.degiro.nl/pa/secure/client?sessionId={sid}` → `data.intAccount`, `data.id` (= userToken for charts) |
| Current portfolio | `GET https://trader.degiro.nl/trading/secure/v5/update/{intAccount};jsessionid={sid}?portfolio=0&totalPortfolio=0&cashFunds=0` |
| Transactions | `GET https://trader.degiro.nl/reporting/secure/v4/transactions?fromDate=01/01/2015&toDate={dd/MM/yyyy}&groupTransactionsByOrder=false&intAccount={ia}&sessionId={sid}` |
| Cash movements | `GET https://trader.degiro.nl/reporting/secure/v6/accountoverview?fromDate=01/01/2015&toDate={dd/MM/yyyy}&intAccount={ia}&sessionId={sid}` |
| Product metadata | `POST https://trader.degiro.nl/product_search/secure/v5/products/info?intAccount={ia}&sessionId={sid}` body: `["1234567","7654321"]` → per product: `isin, symbol, currency, vwdId, productType` |
| Daily price history | `GET https://charting.vwdservices.com/hchart/v1/deGiro/data.js?requestid=1&resolution=P1D&culture=nl-NL&period=P50Y&series=issueid:{vwdId}&series=price:issueid:{vwdId}&format=json&userToken={userToken}&tz=Europe/Amsterdam` |

Version numbers in the reporting paths (v4, v6) drift. Read them from the HAR, and
put them in one config module so a break is a one-line fix.

### 2.1 vwd chart response gotchas

- The response is JSONP-ish when a callback param is present. Use `format=json` and no
  callback, then still guard against a wrapper.
- Series data comes back as `[[x, y], ...]` where `x` is an offset in resolution units
  from `series.times` (e.g. `"2021-01-04/P1D"`), **not a timestamp**. Convert
  explicitly and write a unit test for it.
- Batch requests: >~60 series in one URL returns 404. Chunk to 20 per request and
  throttle (see §6).
- The series is in the instrument's own currency and only covers trading days.
  Forward-fill to a continuous daily calendar before summing.

### 2.2 Currency

Positions in USD/GBP need a daily FX series to be valued in EUR. For v1: build the
engine in the instrument currency, convert with a hardcoded EUR base, and log a loud
warning when a non-EUR product appears. Add FX in v2 by pulling the EUR/X series from
the same vwd endpoint. Do not silently mix currencies; a wrong chart is worse than an
incomplete one.

## 3. Components

```
manifest.json          MV3, "type": "module" service worker
src/session.js         reads JSESSIONID + intAccount + userToken, detects expiry
src/degiro.js          thin fetch wrappers per endpoint, no logic
src/store.js           IndexedDB: rawTransactions, rawCashflows, products, priceSeries, meta
src/engine.js          PURE: (transactions, cashflows, prices) -> { valueSeries, pnlSeries }
src/engine.test.js     node --test, runs against fixtures
src/app.html/js        full-page UI: chart + range selector
src/popup.html/js      small: current value, today, this week, click -> full page
vendor/chart.umd.js    bundled locally, MV3 CSP forbids remote scripts
```

`engine.js` must have zero I/O and zero Chrome API calls. It takes plain arrays and
returns plain arrays. That is the part that will have bugs, and it is the only part
that is cheaply testable.

### 3.1 Sync flow

1. Service worker wakes on `chrome.alarms` (hourly) or on user click.
2. Check session validity via a cheap call. If invalid, surface "log in to DEGIRO" in
   the popup and stop. Never attempt a login.
3. Fetch transactions and cash movements incrementally from `meta.lastSyncDate`.
4. For any new productId, fetch product info, then its full price history.
5. For known products, fetch only the missing tail (`period=P1M` is enough for a daily run).
6. Recompute the full derived series and cache it.

Recomputing 5 years of daily values is milliseconds. Do not build incremental derivation.

### 3.2 UI

Popup is too cramped for a 5-year chart. Popup shows the numbers (value, day, week,
month) and a sparkline; the toolbar click or a button opens a full extension page with
the real chart. Range selector, hover tooltip with date + value + delta, toggle for
including/excluding cash, and a marker on days with an external cashflow.

## 4. Storage

IndexedDB, not `chrome.storage.local`. Price series is the bulky object (~1300 points ×
number of instruments ever held) and `chrome.storage` is a poor fit for it. Add the
`unlimitedStorage` permission.

Stores: `transactions`, `cashflows`, `products`, `prices` (key: vwdId), `derived`
(single cached result), `meta` (lastSyncDate, endpoint versions, intAccount).

Ship an "export JSON" and "wipe and resync" button. Both will be needed during debugging.

## 5. Development loop (important)

Claude Code cannot log into the DEGIRO account, so it cannot discover or test any of
this live. The loop has to be fixture-driven:

**Human, once, up front:**

1. Log into trader.degiro.nl, open DevTools → Network, load the portfolio page, the
   account overview page, and one instrument chart.
2. Export HAR. Also save individual responses for each endpoint in §2.
3. Redact: replace `sessionId`, `JSESSIONID`, `intAccount`, `userToken`, and account
   numbers with fixed dummy values. Amounts and productIds can stay, it is a local repo.
4. Save to `fixtures/` as `transactions.json`, `accountoverview.json`, `update.json`,
   `products-info.json`, `chart-{vwdId}.json`.

**Claude Code:**

- Reads `fixtures/` first and derives the actual response shapes from them. Does not
  trust the field names in this spec.
- Builds `engine.js` against the fixtures with tests.
- Builds the fetch layer to match the observed request shapes exactly, including headers.

**Human, at the end of each phase:** loads the unpacked extension, runs a sync against
the real account, reports failures back.

## 6. Constraints and risks

- **Rate limiting / account safety.** Automated hammering of DEGIRO's endpoints is a
  real risk to the account. Backfill must be slow and once-only: max 1 request/second,
  chunked, with exponential backoff on non-200. Daily sync should be a handful of
  requests. No polling loops, no retries in tight loops.
- **Terms of service.** This is an unofficial API. Read-only access to your own data
  from your own logged-in browser is the mildest form of it, but it is not sanctioned
  and can break or be blocked at any time. Personal use only, never publish to the
  Chrome Web Store.
- **MV3 service workers are ephemeral.** Use `chrome.alarms`, never `setInterval`.
  Assume the worker dies mid-sync; make sync resumable from `meta`.
- **Session timeout is short (~30 min idle).** Sync opportunistically when the user is
  on trader.degiro.nl rather than on a fixed schedule.
- **Product delistings and mergers** break the price series. Handle a missing vwdId by
  freezing the last known price and flagging the day as estimated rather than dropping
  to zero.
- **Corporate actions (splits)** may or may not be adjusted in the vwd series.
  Cross-check one known split against the reconstructed value before trusting the chart.

Sanity check before declaring done: the reconstructed value for today must match the
portfolio total DEGIRO shows, to the cent. If it does not, the historical chart is
wrong too.

## 7. Phases

Each phase ends with something runnable. Do not start the next before the previous is
verified.

1. Skeleton + session. Extension loads, detects the DEGIRO session, popup shows the
   current portfolio total from the update endpoint. Proves auth-by-cookie works.
2. Raw sync. Pull transactions, cash movements, product info. Store in IndexedDB.
   Export-to-JSON button. No charts yet.
3. Engine. Pure reconstruction from fixtures, with tests. Assert that the last value
   equals the known current total.
4. Prices. vwd chart fetching, chunking, throttling, forward-fill, caching.
5. Chart 1. Value including cash, range selector, tooltip. This is the main deliverable.
6. Chart 2. Period P/L bars with cashflow correction, plus cashflow markers.
7. Polish. Daily alarm sync, error states, resync button, exclude-cash toggle.

Stop after 7. No multi-account support, no benchmarks, no tax reporting, no export to
Portfolio Performance unless asked.

> **Amended, 0.26.0.** "No multi-account" is superseded for the *multi-broker* case: money at
> more than one broker, combined and filterable, is now the product direction — see US-22 to
> US-24 in `docs/BACKLOG.md`. Two accounts at the *same* broker remains out of scope, because
> that one needs a second session and would put the "we only read the cookie your browser
> already has" promise back on the table. The rest of §7 stands.

## 8. Bootstrap prompt for Claude Code

Put this file in the repo root as `SPEC.md`, put the HAR captures in `fixtures/`, then:

> Read SPEC.md and every file in fixtures/. Do not write code yet. First, produce a
> short report: for each endpoint in SPEC.md §2, state whether the fixtures confirm the
> path, the parameters and the response shape, and list every place the spec is wrong.
> Then propose the concrete field mapping from the fixture JSON to the engine's input
> types. Then write CLAUDE.md capturing the conventions in §1 and §3, so later sessions
> do not redesign the architecture. Wait for my go before phase 1.

Forcing the fixture reconciliation before any code is written is the point. The spec is
a starting hypothesis; the HAR is the evidence.

## 9. Alternative worth knowing about

Portfolio Performance (open source, desktop) already imports DEGIRO CSV exports and
draws exactly these charts, today, with corporate actions and FX handled. If the goal is
only to see the chart, that is a weekend of setup instead of a project. This spec is
worth building if the goal is a browser-native, always-current view without manual CSV
exports.

---

## Addendum: charts beyond the two in the brief

Requested after the original spec, built in the same pass:

- **Build-up of the portfolio** — stacked daily value per holding plus cash, so you can
  see how much of the total is which position and how much is uninvested.
- **Money paid in vs what it is worth** — cumulative net deposits against portfolio
  value on one euro axis. The gap between the lines is growth.
- **Deposits and withdrawals per month** — net external cashflow as diverging bars.
- **Dividend per month** — net cash received with withholding tax stacked below zero.
- **Holdings table** — the same series as numbers.

One deviation from the reference screenshots: the period-results chart there overlays a
cumulative line on a second y-axis. Two y-scales on one plot invent a correlation that
is not in the data, so the cumulative series gets its own chart beside it instead. Same
information, no arbitrary scale alignment.
