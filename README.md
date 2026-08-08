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
| **Dividend per month** | Net cash received, with withholding tax below the line. |
| **Holdings** | The same series as plain numbers. |

Range selector (1M / 3M / 6M / YTD / 1Y / ALL), hover crosshair, and an
include/exclude-cash toggle.

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

Everything in [SPEC.md](SPEC.md) is built, and the engine is covered by 75 tests
including "a deposit must not register as profit" and the reconciliation check above.

Two things you should know before relying on it:

- **It has not yet been run against a real DEGIRO account.** The fixtures it was built
  and tested against are generated, not captured, so they prove the code matches the
  spec — not that the spec matches DEGIRO. Which endpoint fields are assumed rather
  than verified is written out per endpoint in
  [docs/ENDPOINT-REPORT.md](docs/ENDPOINT-REPORT.md). The red banner exists precisely
  because of this.
- **No currency conversion.** Non-EUR positions are counted at 1:1 and the page says so
  in red rather than quietly drawing a wrong total.

If you hit either, [docs/CAPTURE.md](docs/CAPTURE.md) explains how to capture a HAR from
your own session; `tools/har-to-fixtures.mjs` extracts and redacts it, and that replaces
the guesswork with evidence.

## For developers

```bash
npm test          # 75 tests, no dependencies to install
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
