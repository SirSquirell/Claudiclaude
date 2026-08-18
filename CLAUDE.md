# CLAUDE.md — conventions for this repo

Read `SPEC.md` first. This file exists so a later session does not redesign the
architecture that §1 and §3 of the spec already settled.

## The rules that are not up for renegotiation

1. **`src/lib/engine.js` is pure.** No `fetch`, no `chrome.*`, no `indexedDB`, no
   `Date.now()` in the computation path (a `today` is passed in). It takes plain
   arrays and returns plain arrays. Every bug worth catching lives here, and this is
   what makes it testable. If you need I/O to compute something, the computation is in
   the wrong module.

2. **Only raw API responses are persisted truth.** Everything else is a cache that can
   be deleted and rebuilt. Never write a derived number into a store and then read it
   back as an input. Recomputing five years of daily values is milliseconds — measured,
   not assumed.

3. **A deposit is not a gain.** `pnl[t] = (value[t] − value[t−1]) − netExternal[t]`.
   Only `DEPOSIT` and `WITHDRAWAL` are external. Dividends, fees and interest are
   internal and belong in P/L. If you add a cash category, decide `external` and
   `inCash` explicitly in `src/lib/classify.js` — the default for an unrecognised row
   is deliberately *not* "deposit", because a wrong guess there silently fabricates
   profit.

4. **Never guess a cash row's meaning.** An unmatched description becomes `UNKNOWN`,
   is counted, and is surfaced in the UI. Silent classification is how this project
   would produce a plausible, wrong chart.

5. **Rate limits are an account-safety issue, not a politeness one.** Every outbound
   request goes through `throttledFetch` in `src/lib/degiro.js`, which holds a single
   module-global queue at ≥1.1 s between requests. Do not add a second fetch path. Do
   not retry 401/403 — that means the cookie is gone, and retrying looks like a login
   attempt.

6. **The reconciliation check is the acceptance test.** `computePortfolio` compares its
   last value against DEGIRO's own total. If it is off by a cent, the history is wrong
   too and the UI says so in red. Do not soften this into a tolerance.

7. **Anything that leaves the machine is default-deny.** The export, the diagnostics and
   anything else a user can hand to someone else declares what it *may* carry; whatever is
   not declared is redacted. A denylist encodes its own next failure — the field added
   tomorrow ships by default and keeps shipping until somebody remembers. This is not
   hypothetical: the 0.10.0 export leaked `displayName`, `intAccount` and `userToken`
   because nobody had listed them.

   Two corollaries, both from real incidents in this project rather than from principle:
   **no value copied out of a real account may enter `test/`** — build it synthetically, or
   the value on screen will get pasted — and **findings name accounts, never people**. "The
   first account" is as useful as a name and cannot identify anyone.

8. **YAGNI. Build the thing that was asked for, and nothing next to it.** No parameter with
   one caller, no abstraction with one implementation, no option nobody set, no branch for a
   case that has never occurred. If it is not reachable from a story or a defect, it does not
   go in — and if it is already in and nothing reaches it, it comes out.

   The reason here is sharper than "less code is nicer". Every speculative path is a path the
   tests do not cover and the audit does not check, and this project's whole claim is that its
   numbers are verified. A fallback that has never fired is not a safety net; it is an
   untested branch that will run for the first time on somebody's real account. The parser's
   candidate field names are the standing example — they earn their place only until a real
   capture confirms the shape, and then they are deleted rather than kept "just in case".

   Deleting is cheap: the history has it, and `git revert` is one command. Guessing what will
   be needed is what is expensive.

9. **The extension never authenticates.** It reads a session the browser already holds, and that
   is the whole of it. It does not collect a password, a PIN, a phone number or a 2FA code; it
   does not store a credential; it does not sign a request with a device key it created; it does
   not attempt a login by any other name. `resolveSession` reads a cookie per request and writes
   it nowhere — that is the pattern, and any future broker adapter matches it or is not built.

   This is a product promise, not a scoping preference, and it is already in the README's first
   paragraph about data. So it decides questions rather than being weighed against them: a broker
   whose data cannot be reached from an already-logged-in tab is **out of scope**, however
   valuable it would be, and the correct outcome of that spike is dropping the story. There is no
   version of "just a small login form".

   The safety argument is the strong one. Nothing that does not exist can be phished, leaked in
   an export, or stolen from IndexedDB — and a wrong authentication attempt is the one action a
   broker answers by locking the account rather than by returning an error (see rule 5).

## Branches: `main`, `poc`, and nothing else

Decided by the owner on 2026-08-18, after an audit found **23 live `claude/*` branches**. Twenty-two
of them turned out to be merged, duplicated or stranded — and because each parallel session numbered
its story against the `main` it could see, three different stories claimed US-66 and three claimed
US-76, while a real fix (Today's live day result) sat unmerged on a branch for a day and drifted 27
commits behind. A branch nobody can see is where work goes to be done twice.

- **Work lands on `main`.** Stories, fixes, refinements: commit there, push there, same day.
- **A POC lives on the one `poc` branch** until it is promoted into `main` (as code, or as a file
  under `docs/prototypes/`) or dropped. It is a scratchpad, never a backlog: nothing is *finished*
  on `poc`.
- **Do not create task or session branches.** If a session is forced onto one by its tooling, treat
  it as transport: land the work on `main` the same day and consider the branch disposable.
- **A story number is claimed by landing in `docs/BACKLOG.md` on `main`** — the next free number is
  stated at the end of that file. A number used anywhere else is not claimed.

## Two changelogs, both updated in the release commit

`CHANGELOG.md` is written for whoever is deciding whether to resync: what was wrong and what it
did to the numbers, every release, kept forever. It is the history.

`WHATS-NEW.md` is written for whoever is *using* this — Dutch, and **only the release that just
shipped**. It is rewritten rather than appended to: the previous release's text goes out when the
new one goes in, because a reader opening it wants to know what changed since the version they were
running, not to scroll a feature tour of a product they already use. The history is not lost — it
is in `CHANGELOG.md` and in the git log, and this file links there.

This replaced an accumulating, grouped-by-what-you-get document at 0.45.0, at the owner's
instruction. Do not grow it back: if it starts collecting sections from four releases, it has
turned into a second `CHANGELOG.md` with worse ordering.

**Both are updated in the same commit as the change they describe.** Not every entry goes in both:
a refactor is a `CHANGELOG.md` line and nothing else. But anything a reader would notice —
a feature, a correction to a figure, a new failure they might see — belongs in both, and
`WHATS-NEW.md` states up front whether this release needs a resync, because that is the one
question it exists to answer.

The test for whether something belongs in `WHATS-NEW.md`: **would it change what someone does?**
A correction they must resync from, a screen they did not know existed, a number that does not
mean what they assumed. If it would not change what they do, it is a `CHANGELOG.md` entry.

## Layout

```
manifest.json           MV3
src/sw.js               service worker: alarms, message router. Owns no state.
src/lib/config.js       every URL, version number and tuning constant. Pure data.
src/lib/dates.js        ISO 'YYYY-MM-DD' helpers, all UTC. Never local-time getters.
src/lib/classify.js     cash-movement rule table. Pure.
src/lib/parse.js        raw JSON -> normalised types. Pure, defensive.
src/lib/engine.js       the reconstruction. Pure.
src/lib/store.js        IndexedDB
src/lib/degiro.js       fetch wrappers, throttling, backoff. No logic.
src/lib/session.js      cookie -> sessionId, intAccount, userToken
src/lib/sync.js         orchestration; the only module touching both net and disk
src/lib/errlog.js       scrub + ring + fold for recorded exceptions. Pure.
src/lib/errorstore.js   the persisted ring, for contexts that do not survive being
                        asked: the service worker and the popup.
src/lib/diagnose.js     step-by-step connection check. Output must stay free of
                        session ids, account numbers and amounts — it is meant to be
                        pasted into a bug report.
src/ui/                 app page, popup, chart builders, tokens
vendor/chart.umd.js     Chart.js 4.4.7, bundled (MV3 CSP forbids remote scripts)
fixtures/               synthetic, generated by tools/make-fixtures.mjs
test/                   node --test
tools/                  fixture generator, HAR converter, dev server, icon generator
```

Note: the spec sketches `src/engine.js` and `src/engine.test.js`. The code is under
`src/lib/` and `test/` instead — same modules, same boundaries, just grouped.

## Dates

Every date in this codebase is the string `'YYYY-MM-DD'`. Not a `Date`, not an epoch.
All arithmetic goes through `src/lib/dates.js`, which works in UTC, because
`new Date('2025-03-30')` plus one day in Europe/Amsterdam local time is a DST bug
waiting to shift the whole series by a day.

## Fixtures

`fixtures/` is currently **synthetic** — generated by `tools/make-fixtures.mjs`. It
reproduces the response *shapes* SPEC §2 describes, not DEGIRO's actual field names.
See `docs/ENDPOINT-REPORT.md` for exactly what is and is not evidence.

When a real HAR arrives:

```bash
node tools/har-to-fixtures.mjs ~/Downloads/trader.degiro.nl.har   # writes fixtures/real/
# read the files, grep for your own name/IBAN/account number
mv fixtures/real/*.json fixtures/
npm test
```

The parsers in `parse.js` accept several candidate field names per value on purpose.
Once a real capture confirms the shapes, **tighten them** and delete the fallbacks —
loose parsing that silently returns `0` is worse than a loud failure.

## Charts

`src/ui/charts.js` follows a few rules that are easy to break by accident:

- **One y-axis per chart.** Never two scales on one plot; the alignment between them is
  arbitrary and invents a correlation. Period P/L and cumulative P/L are two charts.
- **Colour follows the instrument, not its rank.** Composition layers are ranked on the
  whole history, not the selected range, so changing the range never repaints a series.
  The holdings table reads its swatch colours off the same layer list.
- **Seven categorical slots, then "Other".** An eighth holding never gets a generated
  hue. Cash uses a neutral, deliberately outside the categorical set.
- **No two visible series share a colour.** Twelve months do not fit seven slots, so the
  month comparison keeps a stable preferred slot per month and shifts on a clash within
  the current selection.
- **The palette is measured, not asserted.** `npm run palette` reads the tokens out of
  `styles.css`, checks each slot's contrast against the surface it is drawn on, and simulates
  the three dichromacies to find two slots a reader could not separate. Zero collisions in both
  themes, and `npm test` enforces it. This line used to say the palette was "the validated
  reference instance" — it was, in light. Measured, the dark half had five collisions, two of
  them at ΔE 2.2, which is not *similar*, it is the same colour. A comment is not a check.

## Testing

```bash
npm test          # node --test over test/
npm run demo      # http://localhost:5173 — the whole UI on generated fixtures
npm run fixtures  # regenerate fixtures/
```

`npm run demo` runs the real engine through the real UI with no Chrome APIs and no
DEGIRO login. Use it for any UI change.

**`sync.js`, `session.js` and `degiro.js` are tested too, and that line used to say they
could not be.** `test/fake-indexeddb.js` is sixty lines of key-value store, and a stand-in
`fetch` plus a stand-in cookie jar is all the rest of it takes; `test/sync-e2e.test.js` runs a
whole seven-step sync against a broker that is not there. What still needs a human with a
logged-in browser is the one thing a fake cannot answer: whether DEGIRO's endpoints still
behave the way we think and whether the field names still match. Everything downstream of
"the API behaves" is covered here.

## Scope

SPEC §7 stops at phase 7. No multi-account, no benchmarks, no tax reporting, no Chrome
Web Store.

FX *is* implemented, against SPEC §2.2's expectation that it would need its own price
series. It does not: every foreign transaction states the price in its own currency and
the euro amount that settled, so the rate is one divided by the other. A currency that
has never been traded still has no rate, stays at 1:1, and says so as an error.
