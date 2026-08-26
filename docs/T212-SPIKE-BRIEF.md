# Trading 212 spike — brief for a browser agent

What `docs/MULTI-BROKER.md` §8f asks for, written so it can be handed to an agent driving a
browser.

**Three phases, ordered by what they cost.** Phase 0 is reading public documentation. Phase 1 is a
logged-out browser. Only phase 2 needs an account — and by then it is one question, not six, and
you will know whether it is worth asking.

> **A correction, recorded because it wasted a step.** The first version of this brief said to use
> Trading 212's practice account, on the grounds that play money removes the risk that made the
> Trade Republic spike uncomfortable. That was wrong: practice mode sits behind registration, so
> "just switch on a demo" does not exist — you open a real account or you have nothing. It should
> have been checked before being offered as the safe route.

## The rule that outranks the findings

The agent may see real values. It reports **names, types, counts, dates and HTTP statuses — never
values**. Never an amount, a holding, a share count, a cookie value, a token, an account number or
a person's name. Describe a value's shape ("a two-decimal number", "an ISO date") instead of
quoting it.

CLAUDE.md rule 7 applied to a spike. `tools/har-shapes.mjs` is the same principle in code.

**One deliberate exception:** the dates on a market price candle are not account data, and they are
the entire point of phase 1.

---

# Phases 0 and 1 ran on 2026-08-11 — results in `MULTI-BROKER.md` §8

The spec was read and the charting endpoints were measured from a logged-out browser. **R2, R3, R4
and R5 are answered, and R4 better than hoped: the price history is public, needs no credential at
all, and daily candles reach 2017.** Three desk-research claims turned out wrong; they are named at
the top of §8 rather than quietly corrected.

---

# R1 closed on 2026-08-13 — PASS

**Can positions and transactions be reached without storing a credential?** Yes. `200` with the
session cookie, `401` with `credentials: 'omit'`, `401` logged out, and the service worker got the
same carrying only an `Accept` header. `TRADING212-R1-RESULT.md` has all four steps;
`MULTI-BROKER.md` §8d is the summary. The API key rule 9 forbids is not needed.

The prompt that produced it is kept below because it is the protocol, not because anything is
waiting on it.

## The prompt that closed it

> Log in to Trading 212 in a browser and open DevTools → Network. I need to know whether the web app
> fetches your **positions and transactions** over an ordinary session cookie, or through something
> an extension could not replay.
>
> **Report field names, paths, header names, counts and HTTP statuses. Never an amount, a holding, a
> share count, a cookie value, a token or an account number.**
>
> 1. Open the portfolio and the history pages. For each request that fills them: the full **host and
>    path**, the method, and whether a `Cookie` header was sent.
> 2. The **names** of every request header — never values. Flag anything carrying a bearer token or
>    a device id rather than a cookie.
> 3. **Cookies** from Application → Storage → Cookies: per cookie its **name, `SameSite`, `Secure`,
>    `HttpOnly`, `Domain`, `Path`** and whether it expires. Never a value.
> 4. **The decisive test.** Right-click one of those requests → *Copy as fetch*, re-run it in the
>    Console with `credentials: 'include'` and again with `credentials: 'omit'`. Report both status
>    codes. That is what says whether an extension's fetch would carry the session.
> 5. **Field names** in one row of the positions response and one of the transactions response.
>
> Say "unknown" rather than guessing.

**How that was read** — kept for the next broker, which will need the same table:

| Answer | Consequence |
|---|---|
| Cookie works, `SameSite` permissive | **Build it.** Nothing else is outstanding |
| Cookie works, `SameSite=Strict`/`Lax` | Needs the same test DEGIRO passed |
| A bearer token the page mints | Closer to "signing with a key it created" than to reading a session — a rule 9 judgement |
| Only the documented API key | **Close the story.** Rule 9 makes that final |

---

# What is left: the payload shapes, and they need a *funded* account

**Which path on the web-session route returns a holding, a transaction and a cash movement, and what
are their field names?**

A full Network-tab capture on 2026-08-25 was expected to answer this and did not — `MULTI-BROKER.md`
§8g. The account behind it was unactivated and held nothing, so the web app rendered its empty state
and never requested any of the three. What that capture *did* settle is worth reading first: the
host, the instrument master (`/instrumentarium/v2/instruments/{sinceEpochMs}`, with ISIN and
currency), and two routes rule 9 forbids outright.

So this is phase 3, and its one requirement is an account that actually holds something. Everything
else about it is cheap: no probe, no permission, no code — one page load with the Network tab open.

## The prompt, for whoever has a funded account

> Log in to Trading 212 in a browser and open DevTools → Network, with **Disable cache** ticked
> (two `instrumentarium` endpoints answered `304` last time and their shapes are still unknown).
> Load the **portfolio** page, then the **history / transactions** page at its widest date range,
> then open **one instrument's chart**.
>
> **Report paths, methods, statuses, content types and field names. Never an amount, a holding, a
> share count, a ticker you own, a cookie value, a token, an account number, a date of birth, a
> signup date, a residency or a dealer code.**
>
> The safe way to do all of that at once is not to read the HAR by hand: save it *with content*, then
> run `node tools/har-shapes.mjs <file.har>` and hand over **that output**. It prints field names,
> types, counts and query-parameter names, and never a value.
>
> Then delete the HAR. A Trading 212 HAR is a live-session file even when exported with the
> "sanitized" option — that option strips headers and cookies but **not** response bodies, and
> `POST /rest/v3/webclient/authenticate` returns two session tokens in the clear.

| Answer | Consequence |
|---|---|
| Three paths, with field names | **US-39–US-45 are unblocked.** Nothing else is outstanding |
| Holdings but no transaction history on this route | The ledger cannot be reconstructed from it — a rule 6 problem, and a story-level decision |
| The web app fetches them from `live.trading212.com/api/v0` with a key | Rule 9 closes it. Trading 212 becomes a price source with no portfolio, which is not a product |
