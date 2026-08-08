# DEGIRO Portfolio History

A Chrome extension that shows what your DEGIRO account has been worth, every day since
you opened it — the chart DEGIRO's own interface does not give you.

It reconstructs the history from your trades, cash movements and daily closing prices,
using the session your browser already holds. No password is asked for, nothing is
stored anywhere but your own machine, and nothing is sent to anyone but DEGIRO.

![The charts](docs/screenshot.png)

## Install it

**[→ Step-by-step guide, in Dutch (INSTALL.md)](INSTALL.md)** — no terminal, no Node,
about two minutes.

The short version: **Code → Download ZIP**, unzip somewhere permanent, then
`chrome://extensions` → **Developer mode** on → **Load unpacked** → pick the unzipped
folder.

Then click the extension icon → **Open full chart** → **Open the demo** to see the
charts with sample data before pointing it at your own account. When you're ready: log
in at [trader.degiro.nl](https://trader.degiro.nl), click the icon, press **Sync**.

The first sync takes a few minutes — one request per second, deliberately. DEGIRO's API
is undocumented and hammering it is an account-safety risk, not a matter of politeness.

## What you get

| Chart | What it answers |
|---|---|
| **Portfolio value including cash** | What was it worth on any given day. Triangles on the baseline mark days money went in or out, so a deposit is never mistaken for a gain. |
| **Result per period** | Day, week or month performance with deposits and withdrawals stripped out. |
| **Cumulative result** | The same numbers added up over the range you picked. |
| **What the portfolio is made of** | Stacked daily value per holding — how much is which position, and how much is sitting in cash. |
| **Money paid in vs what it is worth** | Your net deposits against the market value. The gap between the lines is growth. |
| **Deposits and withdrawals per month** | Net external cashflow. None of it counts as profit. |
| **Month by month** | Every month of every year as a grid. Read across a row for one year, or down a column to compare the same month across years. |
| **Compare months** | Pick up to three months — November and June, say — and see them side by side per year, with totals, averages and how often each was positive. |
| **Dividend per month** | Net cash received, with withholding tax below the line. |
| **Holdings** | The same series as plain numbers. |

Range selector (1M / 3M / 6M / YTD / 1Y / ALL), hover crosshair, and an
include/exclude-cash toggle.

The month views have a **Euro / Return %** switch, and it is not cosmetic. €500 on a
small portfolio is a very different month from €500 on a large one, so euros are not
comparable across years. The percentage is a daily-chained return with deposits removed,
so a month you paid money into is not flattered by it.

## The one thing to pay attention to

The page compares its own reconstructed total against the total DEGIRO itself reports.
**If those disagree by even a cent, it says so in red** — and you should not trust the
history either, because the same inputs produced both numbers.

That check is the whole quality bar. A portfolio chart that is quietly wrong is worse
than no chart, so the extension would rather tell you it failed.

Same principle for the yellow warnings: a cash movement whose description it does not
recognise is reported rather than guessed at, because guessing "deposit" would silently
turn your own money into profit.

## Status, honestly

**Version 0.9.0.** Everything in [SPEC.md](SPEC.md) is built, and the engine is covered
by 134 tests — including "a deposit must not register as profit", "a split-adjusted
series must not inflate the position", and the reconciliation check above.

It has now been run against two real DEGIRO accounts, and most of what that turned up is
fixed. The findings are worth reading if you care whether the numbers are right, because
several of them were the difference between a plausible chart and a true one:

- **A portfolio charted at €429 million** against €116k ever paid in. The price series
  are adjusted for share splits; your transaction history is not. Multiplying one by the
  other is wrong by the cumulative split factor. Every quote is now audited against the
  price you actually paid on that same day, and the share count converted into the
  series' units.
- **Foreign currencies counted 1:1.** One Hong Kong dollar is not one euro. Rates are now
  derived from your own trades — each foreign transaction states the price in its
  currency and the euro amount that left your account, so the rate is simply one divided
  by the other. It returns exactly 1.0000 on euro trades, which is a decent proof it
  works.
- **46 cash movements silently lost.** DEGIRO reports `id: 0` on many rows and they
  overwrote each other in storage.
- **A portfolio charted as cash-only**, because pressing "Wipe & resync" mid-sync wiped
  what the sync had already written and it carried on regardless.
- **59 holdings with no price history**, because their identifier is a `vwdkey` rather
  than a number and were being requested as the wrong type.

What is still open:

- **`fixtures/` is generated, not captured.** No HAR was ever available, so the demo data
  reproduces the response *shapes* the spec describes. Real accounts have since confirmed
  many of them. What is evidence and what is still an assumption is written out per
  endpoint in [docs/ENDPOINT-REPORT.md](docs/ENDPOINT-REPORT.md).
- **Some instruments have no price history at all** — usually a delisting. Those
  positions are valued at the last price they traded at, so their movement between trades
  is not real. The page says which ones.
- **A currency you have never traded in has no derived rate**, so it stays at 1:1 and
  says so in red.

If something looks wrong, press **Check connection**: it walks all seven steps of the
sync and reports which one broke, with HTTP statuses and row counts but no session id,
account number or amounts — so the report is safe to paste into an issue.
[docs/CAPTURE.md](docs/CAPTURE.md) explains how to capture a HAR from your own session
if you want to close the remaining gaps.

## For developers

```bash
npm test          # 134 tests, no dependencies to install
npm run demo      # the whole UI on generated fixtures at localhost:5173
npm run fixtures  # regenerate the sample data
```

Chart.js is vendored (MV3 forbids remote scripts), so there is no `npm install` step.

```
manifest.json     MV3 manifest
src/sw.js         service worker: hourly alarm, opportunistic sync, message router
src/lib/          config, dates, classify, parse, engine, store, degiro, session, sync
src/ui/           full page, popup, chart builders, design tokens
vendor/           Chart.js 4.4.7
fixtures/         generated sample data — see the status note above
test/             node --test
tools/            fixture generator, HAR→fixtures converter, dev server, icons
docs/             endpoint report, HAR capture guide
```

How it works:

```
transactions     ──►  position ledger: quantity per instrument per day  ─┐
cash movements   ──►  cash balance per day, net external cashflow       ─┼─►  value[t]
vwd daily closes ──►  forward-filled price per instrument per day       ─┘

pnl[t] = (value[t] − value[t−1]) − netExternalCashflow[t]
```

Only the raw API responses are stored. Every chart number is derived on the fly and
thrown away, so fixing a bug is a recompute rather than a migration.
`src/lib/engine.js` does all of it and touches nothing else — no network, no database,
no Chrome APIs — which is what makes it testable.

Conventions, and the decisions not worth relitigating, are in [CLAUDE.md](CLAUDE.md).

## Terms

Personal use. This talks to an unofficial, reverse-engineered API: read-only, to your
own data, from your own logged-in browser — the mildest form of it, but not sanctioned
by DEGIRO and liable to break without notice. Don't publish it to the Chrome Web Store.

Everyone who installs it uses their own DEGIRO login; there is no shared data and
nobody can see anyone else's portfolio.

Chart.js is MIT licensed — see `vendor/chart.js-LICENSE.md`.
