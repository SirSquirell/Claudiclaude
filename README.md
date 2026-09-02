# DEGIRO Portfolio History

A Chrome extension that shows what your DEGIRO account has been worth, every day since you
opened it — the chart DEGIRO's own interface does not give you. It reconstructs the history
from your trades, cash movements and daily closing prices, using the session your browser
already holds.

![The charts](docs/screenshot.png)

The page is seven sections — Overview, Performance, Composition, Income & cost, Holdings, Outlook
and Notices — picked from the rail on the left, which also keeps the three facts about the *data*
rather than the money at its foot: when it last synced, whether it reconciles to the cent, and how
much of the history is measured rather than estimated. Those used to sit among the figures, where
"Data coverage 100,0 %" rendered at the same size as the total value.

Each section leads with **one** figure, three supporting ones beside it, and an **Alle cijfers**
disclosure holding the rest — nineteen numbers in one grid is a wall nobody reads. Every figure
carries an **i** explaining what it means and, more usefully, what it does *not*: that "fees paid"
excludes what a margin balance costs, that a deposit is never a gain, that the biggest winner is a
position rather than a trade.

**The period control recomputes rather than re-slices.** Pick 3M and every figure below it is
measured over those three months — anchored on the value the day *before* the window opens, so the
first day's move is real instead of zero, and chained day by day so a deposit landing inside the
window cannot flatter the return. One line above the figures names the period in words and in exact
dates, because there is no such thing here as a number without a period attached. Where a chart's
axis then does not start at zero, it says so under the plot: a close-up of a quarter that looks like
a doubling is the oldest trick there is.

**The eye in the top bar hides every amount** — by replacement, not by blur, so the figure never
reaches the page at all and cannot be recovered from the DOM or a copy-paste. Percentages survive,
which is the point: you can say +340 % without saying on what. The money axis on each chart goes
away with them rather than repeating the mask down the side.

**Any position can be shared as a card**, drawn rather than screenshotted — five shapes, light or
dark, amounts off by default, and a name you choose from four sources or leave off entirely. It
carries the reconciliation verdict and says *"not checked"* when there is nothing to check against.
There is no badge and no signature: any mark this extension could produce, anyone holding it could
produce too, and a forgeable one is worse than none.

**English or Dutch**, and a light/dark/auto switch, both under **Meer** in the rail. The build number
is in the line under the title, because a bug report against a version nobody noticed had gone stale
is a bug report about the wrong code.

**Notices** is where anything the reconstruction is unsure about is written down; anything that
would make a number untrustworthy also stays pinned to the top, where it cannot be navigated away
from.

**Outlook is the one section that is not a measurement**, and it is separate for exactly that
reason. Everything else here is reconstructed from what actually happened and checked against
DEGIRO's own total; a projection cannot be checked against anything. So it lives on its own page
with the caveat above the numbers, and its scenarios are built from the stretches your own history
actually contains rather than from an assumed distribution.

It also counts those stretches honestly, which is harder than it sounds: five and a half years of
history contains **one** independent five-year stretch, however many overlapping windows you slide
out of it. Below three it says so and calls itself an example. And where the rate measured from your
own history is not something a market does, **no chart is drawn at all** — you are told why, and you
can set the rates yourself. A line drawn from one observation must not look like a line drawn from
fifty, and a line drawn from a bookkeeping artefact should not be drawn.

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

**[→ What changed in the latest release, in Dutch (WHATS-NEW.md)](WHATS-NEW.md)** — written for
whoever is *using* this rather than building it, and covering only the version that just shipped,
starting with the question it exists to answer: do you need to resync? Everything before that
release is in [CHANGELOG.md](CHANGELOG.md).

Full release notes are in [CHANGELOG.md](CHANGELOG.md). What it cannot do, and where it is
known to be wrong, is in [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — worth reading before
you judge a number on screen.

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

**And you can throw the connection away without losing the history.** **Disconnect** under
**Meer** forgets the account number DEGIRO hands back and stops the background sync, while every
figure stays on screen — frozen at the last sync, dated on every screen so nothing reads as
today's. Nothing is deleted, because nothing needs to be: every number is recomputed from the raw
responses already on disk. It cannot log you out of DEGIRO and does not claim to — that session
was never this extension's to end. One press of **Sync** reconnects, exactly like a first run.

**Where it goes: nowhere.** There is no server behind this and no account to create. Everything
lands in IndexedDB in your own browser. No analytics, no telemetry, no crash reporting — and
that is enforced rather than promised: the manifest names three hosts and no others —
`trader.degiro.nl` and `charting.vwdservices.com` as the two it may fetch from, plus
`asteria.prulwerk.nl`, where a content script does nothing but announce the installed version and
relay the demo button (it fetches nothing) — and the content security policy is `script-src
'self'`, so a remote script cannot load at all. Chrome shows you that permission list when you
install it.

You can watch it happen instead of taking this on faith: `chrome://extensions` → **service
worker** → the **Network** tab, then run a sync.

### Two things to know

**The API is undocumented, so it will break.** DEGIRO can change it without telling anyone.
Every endpoint and version number lives in one file (`src/lib/config.js`) so a break is a
one-line fix, and the parsers are written defensively for the same reason.

Defensively used to mean *silently*, which is worse: a renamed field read as `0` leaves every chart
standing with the wrong numbers in it. Six fields are load-bearing enough that this matters, and each
one absent on effectively every row now raises a red banner naming the field. The threshold is a rate
and not a count on purpose — a rename does not go missing on three rows out of 1 457, it goes missing
on all of them, and an alarm that fires on ordinary sparse data is one nobody reads on the day it
counts. The bug report also states which candidate name actually carried each value, which is how the
guessing in `parse.js` gets deleted rather than kept forever.

**Automated access to your own account may conflict with DEGIRO's terms.** Read-only, your own
data, from your own logged-in browser is the mildest form of it, but slow is not the same as
sanctioned. Check that for yourself before you rely on it. Personal use only; do not publish
this to the Chrome Web Store.

There are two things you can send. **Copy bug report** puts every notice from the run on your
clipboard as JSON — codes, counts and ratios, with no amounts, no instrument names and no
account number. That one is safe to paste anywhere, and it is enough to diagnose most defects.

It also carries what actually broke, which is the part a screenshot never contains: exceptions
thrown by the page, exceptions thrown by the background worker while nothing was on screen, date
windows DEGIRO refused, and rows the parsers could not read. All of it is scrubbed where it is
recorded rather than on the way out — URLs go, any run of four or more digits goes, and a stack
keeps its first frame and nothing else — so a message written by a browser cannot smuggle an
amount or an account number into the file.

**Export JSON** is the other one. Your name, account number and user token are redacted, but it
still contains every holding and every amount, because reconstructing a portfolio is what the
file is for. Send that only to someone you trust.

---

Conventions and the decisions not worth relitigating are in [CLAUDE.md](CLAUDE.md);
`npm test` and `npm run demo` need no `npm install`, because Chart.js is vendored (MV3 forbids
remote scripts) and there are no other dependencies. Chart.js is MIT licensed — see
`vendor/chart.js-LICENSE.md`.
