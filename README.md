# DEGIRO Portfolio History

A Chrome extension that shows what your DEGIRO account has been worth, every day since you
opened it — the chart DEGIRO's own interface does not give you. It reconstructs the history
from your trades, cash movements and daily closing prices, using the session your browser
already holds.

![The charts](docs/screenshot.png)

The page is six sections — Overview, Performance, Composition, Income & cost, Holdings and
Notices — each with the figures that belong to it above its charts. **Notices** is where
anything the reconstruction is unsure about is written down; anything that would make a number
untrustworthy also stays pinned to the top, where it cannot be navigated away from.

## Install it

**[→ Step-by-step guide, in Dutch (INSTALL.md)](INSTALL.md)** — no terminal, no Node, about
two minutes.

The short version: **Code → Download ZIP**, unzip somewhere permanent, then
`chrome://extensions` → **Developer mode** on → **Load unpacked** → pick the folder that
contains `manifest.json`.

GitHub's ZIP nests a folder inside a folder, so that is usually one level *in* from where you
unzipped. Picking the outer one gives *"Manifest file is missing or unreadable"*.

Then click the extension icon → **Open full chart** → **Open the demo** to see the charts on
sample data before pointing it at your own account. When you are ready: log in at
[trader.degiro.nl](https://trader.degiro.nl), click the icon, press **Sync**.

The first sync takes a few minutes — one request per 1,1 seconds, deliberately. Updating from
an earlier version? Press **Wipe & resync**: every number is recomputed from the raw
responses, and stored ones may predate a fix.

Release notes are in [CHANGELOG.md](CHANGELOG.md). What it cannot do, and where it is known
to be wrong, is in [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — worth reading before you
judge a number on screen.

## Where the data comes from

**There is no password and no API key.** The extension reads the `JSESSIONID` cookie your own
login already put in the browser, per request, and never writes it anywhere — not to the
database, not to the export. The connection check reports its length and never its value. No
cookie, or a 401 back, means "log in at DEGIRO" and a full stop: a retry after a rejected
session looks like a login attempt, and this never attempts one.

DEGIRO has no public API. `trader.degiro.nl` is itself a JavaScript application that has to get
its data from somewhere, and this extension repeats the read-only requests that site already
makes — in the same browser, with the same session, far more slowly. It fetches your trades,
your cash movements, the instruments behind them and their daily closing prices, and nothing
else. **Nothing here can place, change or cancel an order.**

**Where it goes: nowhere.** There is no server behind this and no account to create. Everything
lands in IndexedDB in your own browser. No analytics, no telemetry, no crash reporting — and
that is enforced rather than promised: the manifest grants exactly two hosts, and the content
security policy is `script-src 'self'`, so a remote script cannot load at all. Chrome shows you
that permission list when you install it.

You can watch it happen instead of taking this on faith: `chrome://extensions` → **service
worker** → the **Network** tab, then run a sync.

### Two things to know

**The API is undocumented, so it will break.** DEGIRO can change it without telling anyone.
Every endpoint and version number lives in one file (`src/lib/config.js`) so a break is a
one-line fix, and the parsers are written defensively for the same reason.

**Automated access to your own account may conflict with DEGIRO's terms.** Read-only, your own
data, from your own logged-in browser is the mildest form of it, but slow is not the same as
sanctioned. Check that for yourself before you rely on it. Personal use only; do not publish
this to the Chrome Web Store.

There are two things you can send. **Copy bug report** puts every notice from the run on your
clipboard as JSON — codes, counts and ratios, with no amounts, no instrument names and no
account number. That one is safe to paste anywhere, and it is enough to diagnose most defects.

**Export JSON** is the other one. Your name, account number and user token are redacted, but it
still contains every holding and every amount, because reconstructing a portfolio is what the
file is for. Send that only to someone you trust.

---

Conventions and the decisions not worth relitigating are in [CLAUDE.md](CLAUDE.md);
`npm test` and `npm run demo` need no `npm install`, because Chart.js is vendored (MV3 forbids
remote scripts) and there are no other dependencies. Chart.js is MIT licensed — see
`vendor/chart.js-LICENSE.md`.
