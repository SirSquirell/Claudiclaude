# DEGIRO Portfolio History

A personal-use Chrome extension (MV3) that reconstructs your DEGIRO portfolio value
over time — the chart DEGIRO's own UI does not give you — from your trades, cash
movements and daily closing prices.

Nothing is snapshotted and nothing is uploaded. The extension reuses the session your
own browser already holds, reads only your own data, and derives every number locally.

![charts](docs/screenshot.png)

## Try it in your browser right now

No extension install, no DEGIRO login, no account touched:

```bash
git clone <this repo> && cd Claudiclaude
npm run demo
```

Then open <http://localhost:5173/src/ui/app.html?demo=1>.

That runs the **real engine and the real UI** against generated fixtures. Every chart,
range button, tooltip and toggle works; only the numbers are made up. It is the fastest
way to see whether the thing does what you want before pointing it at your account.

Requires Node 20+. There are no dependencies to install — Chart.js is vendored.

## Run it against your real account

1. `git clone` this repo somewhere permanent.
2. Chrome → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** →
   pick the repo folder.
3. Open <https://trader.degiro.nl> and log in.
4. Click the extension icon → **Sync**.

The first sync downloads your whole history and is deliberately slow — one request per
second, with the price backfill chunked (SPEC §6: hammering DEGIRO's endpoints is an
account-safety risk). Expect a couple of minutes. Daily syncs after that are a handful
of requests.

Then **Open full chart** for the page above.

### If it says the session expired

It means exactly that: DEGIRO sessions idle out after roughly half an hour. Open a
DEGIRO tab, log in, sync again. The extension never asks for, stores, or transmits a
credential, and it will not attempt a login.

### Read the red banner

The page compares its reconstructed total against the total DEGIRO itself reports. If
those disagree by even a cent, it says so in red — and you should not trust the history
either, because the same inputs produced both. See
[docs/ENDPOINT-REPORT.md](docs/ENDPOINT-REPORT.md) for what usually causes it.

## The charts

| Chart | What it answers |
|---|---|
| Portfolio value including cash | What was it worth, any day since the account opened. Triangles mark days money went in or out, so a deposit is never mistaken for a gain. |
| Result per period | Day/week/month performance with deposits and withdrawals removed. |
| Cumulative result | The same numbers added up over the selected range. |
| What the portfolio is made of | Stacked daily value per holding plus cash — how much is stock, how much is sitting uninvested. |
| Money paid in vs what it is worth | Net deposits against portfolio value. The gap between the lines is growth. |
| Deposits and withdrawals per month | Net external cashflow. None of it counts as profit. |
| Dividend per month | Net cash received, with withholding tax below the line. |
| Holdings | The same series as numbers. |

Range selector, hover crosshair, and an include/exclude-cash toggle apply to the
time-series charts.

## How it works

```
transactions   ──►  position ledger: quantity per instrument per day  ─┐
cash movements ──►  cash balance per day, net external cashflow       ─┼─►  value[t]
vwd daily closes ─► forward-filled price per instrument per day       ─┘

pnl[t] = (value[t] − value[t−1]) − netExternalCashflow[t]
```

The only thing stored is the raw API responses. Every chart number is derived on the
fly and thrown away, so fixing a bug is a recompute rather than a migration.

`src/lib/engine.js` does all of that and touches nothing else — no network, no
database, no Chrome APIs — which is why it can be tested properly:

```bash
npm test        # 70 tests, including "a deposit must not register as profit"
                # and "the reconstructed total matches to the cent"
```

## Status

Phases 1–7 of [SPEC.md](SPEC.md) are implemented. Two caveats worth knowing:

- **`fixtures/` is synthetic.** No HAR was available, so the fixtures reproduce the
  response *shapes* the spec describes, not DEGIRO's verified field names. The parsers
  accept several candidate names per field to survive that. What is assumed versus
  defended is written out per endpoint in
  [docs/ENDPOINT-REPORT.md](docs/ENDPOINT-REPORT.md); capturing a real HAR
  ([docs/CAPTURE.md](docs/CAPTURE.md)) replaces the guesses with evidence and is the
  single highest-value thing you can do next.
- **No FX.** Non-EUR positions are counted at 1:1 and the page says so in red rather
  than quietly drawing a wrong total (SPEC §2.2).

## Layout

```
manifest.json        MV3 manifest
src/sw.js            service worker: hourly alarm, opportunistic sync, message router
src/lib/             config, dates, classify, parse, engine, store, degiro, session, sync
src/ui/              full page, popup, chart builders, design tokens
vendor/              Chart.js 4.4.7, bundled (MV3 forbids remote scripts)
fixtures/            generated sample data — see the status note above
test/                node --test
tools/               fixture generator, HAR→fixtures converter, dev server, icons
docs/                endpoint report, HAR capture guide
```

Conventions and the things not to redesign are in [CLAUDE.md](CLAUDE.md).

## Licence and terms

Personal use. This talks to an unofficial, reverse-engineered API: read-only, to your
own data, from your own logged-in browser — the mildest form of it, but not sanctioned
by DEGIRO and liable to break without notice. Do not publish it to the Chrome Web
Store.

Chart.js is MIT licensed; see `vendor/chart.js-LICENSE.md`.
