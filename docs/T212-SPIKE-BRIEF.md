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

# Phase 0 — read the published documentation. No account, no browser

**The docs are public; only the API *key* needs an account.** This was missed on the first pass —
R2, R3 and R5 were filed under "needs a logged-in session" when Trading 212 publishes the response
schemas outright at <https://docs.trading212.com/api> (mirror:
<https://t212public-api-docs.redoc.ly/>). Reading them costs nothing and settles most of what
phase 2 was for.

Both hosts are blocked from the machine this project is developed on, so somebody with an ordinary
browser has to do it.

## The prompt

> Read Trading 212's public API documentation at <https://docs.trading212.com/api> (or the mirror
> at <https://t212public-api-docs.redoc.ly/>). No account or API key is needed to read it. Report:
>
> 1. **Every endpoint**, as method + path, grouped by section.
> 2. For the **transaction / order history** endpoint: the full response schema — every field name
>    and its type. I specifically need to know whether a row carries an instrument identifier (and
>    in what format), a quantity, a price, the price's currency, **an exchange rate**, and **the
>    total that settled in the account's base currency**.
> 3. For the **dividends** endpoint and any **cash movement / transactions** endpoint: the same,
>    plus **the exact set of allowed values for any type/action/category field** — the enum, listed
>    verbatim. Those labels matter more to me than the rest of the schema.
> 4. For the **account summary / portfolio** endpoints: the schema, and which field is the total
>    account value.
> 5. For the **CSV export** endpoint: what columns the report contains, if stated, and what date
>    range it accepts.
> 6. **Is there any market-data, price, chart or candle endpoint?** Say plainly if there is none —
>    an absence is a finding here, not a gap in the reading.
> 7. The **authentication scheme** in detail, any **rate limits**, and any stated limit on how far
>    back history can be requested.
> 8. Anything the docs say about **beta status, deprecation or breaking changes**.
>
> Quote schemas and enum values verbatim — this is public documentation, so nothing here is
> account data and precision is what makes it useful.

## Why it does not settle everything

The official API has **no price endpoint** (§8a), so phase 0 cannot answer R4 whatever it says.
And the documented API is not the same surface as the web app: the extension would talk to the web
app's endpoints over a cookie, not to `/api/v0` over a key. So phase 0 tells us **what data
Trading 212 holds and in what shape** — which is most of the value — while phases 1 and 2 tell us
**whether we can reach it the way rule 9 requires**.

---

# Phase 1 — the price chart, logged out. No account, no risk

Trading 212 publishes instrument pages to logged-out visitors, e.g.
`https://www.trading212.com/trading-instruments/invest/AAPL.US`, and they carry a price chart.
If that chart is served by the same `/charting/…` endpoint the logged-in app uses, this answers
**R4** — the only question that can kill the story outright — at a cost of about two minutes and
nothing else.

## The prompt

> I need the **shape** of Trading 212's public price-chart API — never its values. No account, no
> login, no sign-up: everything below is on pages open to anyone.
>
> **Report field names, types, counts, dates and HTTP status codes. Never quote a price value.**
> Candle *dates* are wanted and are the point.
>
> 1. Open a public Trading 212 instrument page in a normal logged-out browser — try
>    `https://www.trading212.com/trading-instruments/invest/AAPL.US`, and find the equivalent for
>    one or two other liquid stocks if that URL has changed shape. Confirm a price chart is
>    actually drawn without logging in.
>
> 2. With DevTools → Network open, reload and set the chart's range selector to its **longest**
>    option. Find the request that fetches the chart data and report:
>    - the full URL and HTTP method
>    - the request body or query **field names**, plus the values of `period`, `size`/`limit` and
>      any `includeFake`-style flag — those are settings, not data
>    - how many data points came back
>    - the **first and last timestamp**, and the gap between two consecutive ones (daily? hourly?)
>    - the field names inside one data point — is there a single `close`, or separate `bid` and
>      `ask` objects?
>    - whether any point carries a `fake`-style flag set true, and how many
>    - the **names** of the request headers, and whether a `Cookie` header was sent at all
>
> 3. **The decisive test.** Replay that same request with a much larger `size`/`limit` — try a few
>    thousand — and with `period` set to daily. Report whether it returns more points, silently
>    caps at some maximum, or errors. Say what the maximum appears to be. Five years of trading
>    days is about 1 300 points.
>
>    Easiest way: right-click the request in Network → *Copy as fetch*, paste into the Console,
>    edit the number, run it. If the site's CSP blocks that, say so — that is itself a finding.
>
> 4. If the request works **with no cookie and no authentication at all**, say so explicitly and
>    show which headers were required to make it work. That would be a significant result.
>
> Report grouped by question. Where something cannot be determined, write "unknown" rather than
> guessing — a guess costs more than a gap here, because it will be built on.

## What phase 1 can and cannot settle

| | |
|---|---|
| **Settles** | Whether a charting endpoint still exists on the shape §8 describes; the candle's field names; whether daily granularity is offered; roughly how far back a public request reaches; whether authentication is needed at all |
| **Does not settle** | Whether the *logged-in* app's endpoint behaves the same. A public marketing page may be served a cut-down series. A short answer here is **not** proof the real one is short — a long answer is much stronger evidence than a short one is |

---

# Phase 2 — needs a Trading 212 account, and is much smaller than it was

Phases 0 and 1 take R2, R3, R5 and R4 off this list. **What is genuinely left is R1**: whether an
extension's fetch carries the web session's cookie. That needs somebody logged in, and there is no
way around it — it is a property of a live session, not of documentation.

**Nobody on this project has an account and the user does not want to open one.** That is a
legitimate stopping point rather than an obstacle to route around: opening a brokerage account,
with identity verification, to answer a compatibility question is a real cost against a
speculative feature. And it is worth much less *now* — if phase 1 says the price history is too
short, R1 never needs asking.

So the order matters: **phase 0, then phase 1, and only then decide whether R1 is worth anyone's
account.**

Two ways it could unblock, in order of how little they ask:

1. **Somebody who already uses Trading 212 reads their cookie attributes.** DevTools → Application
   → Cookies, and report `SameSite` per cookie. No values, no export, no capture — about thirty
   seconds of someone who already has the tab open. Worth asking a tester before anything heavier.
2. **Somebody who already uses Trading 212 runs the phase-2 questions**, or captures one HAR and
   runs it through `tools/har-shapes.mjs` themselves — which prints names, types and counts and
   never a value, so the HAR never leaves their machine.

## The phase 2 prompt, for whoever does have an account

> Log in to Trading 212, open DevTools → Network, and report the **shape** of what the web app
> fetches. **Field names, types, counts and HTTP statuses only — never an amount, a holding, a
> share count, a cookie value, a token, an account number or a name.**
>
> **A. The session cookies.** DevTools → Application → Storage → Cookies. Per cookie: **name,
> `SameSite`, `Secure`, `HttpOnly`, `Domain`, `Path`, and session-or-expiry**. Never the value, not
> even truncated.
>
> **B. Transaction history.** Open the history/activity page. Report the request path, the **field
> names** in one row, how many rows returned, and whether pagination is by cursor, page number or
> date range. Specifically: does a row carry an instrument identifier (and in what format — ISIN? a
> ticker like `TSLA_US_EQ`?), a quantity, a price, the price's currency, **an exchange rate**, and
> **the total settled in the account's base currency**? Name which exist — not what they hold.
>
> **C. Cash movements.** Where deposits, withdrawals, dividends, fees and interest appear. The
> path, the field names, and **the exact set of distinct type/action values** that occur (e.g.
> `Market buy`, `Dividend`, `Deposit`). Those are category labels, not data, and I need them
> verbatim.
>
> **D. The account total.** The request behind "portfolio value" or "account summary": its path and
> **field names**. Which field is the total account value — the name, not the number.
>
> **E. The CSV export.** Request one and report **only the header row**, in order. Do not open,
> quote or summarise any data row. Note how far back the range selector allows.
>
> **F. The chart, while logged in.** Same as phase 1 question 2, so the logged-in endpoint can be
> compared against the public one.

---

## What each answer decides

| Q | Phase | Decides | If the answer is bad |
|---|---|---|---|
| 1–3 | 1 | **R4**, the only question that kills the story outright | Caps at a few hundred days ⇒ the history is too short to be this chart. `MULTI-BROKER.md` §6, first bullet |
| 4 | 1 | Whether prices need a session at all | No effect if authenticated — that is the expected case |
| A | 2 | **R1**. `SameSite=Strict`/`Lax` may mean an extension's fetch does not carry the session | Route B closes; route A cannot reach prices; the story closes |
| B | 0 · 2 | **R2**. The settled base-currency amount is what FX is measured from | Missing ⇒ every foreign valuation is a guess |
| C | 0 · 2 | **R3**. Typed actions are why `classify.js` gets simpler here | Free text ⇒ a rule table like DEGIRO's, unmatched rows `UNKNOWN` and counted |
| D | 0 · 2 | **R5**, the reconciliation anchor | Missing ⇒ shippable with the check stated in red, as US-10 already requires |
| E | 0 · 2 | Confirms §8b against reality rather than importers | Columns differ ⇒ §8b was secondary sourcing, and gets rewritten |

## After the answers come back

1. **§8 gets rewritten**, each row moving from reported to measured. §8e's caveat — that the
   strongest evidence is a February 2021 example on a path that has since versioned — either clears
   or becomes the finding.
2. **The bid/ask decision gets made and written down** before a parser makes it by accident. See
   US-34 in `docs/BACKLOG.md`.
