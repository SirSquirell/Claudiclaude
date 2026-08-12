# Interactive Brokers — spike brief

What to find out before anyone writes an adapter, and in what order, so the cheapest questions are
answered first and the expensive one is only asked if it still matters.

Same frame as `MULTI-BROKER.md` §1: **R1** a session an extension may replay, **R2** a trade ledger
with the settled base-currency amount, **R3** a cash ledger with categories, **R4** daily prices
backwards, **R5** the broker's own total. R1 is the gate — CLAUDE.md rule 9 makes a broker whose
data cannot be reached from an already-logged-in tab **out of scope**, however valuable, and the
correct outcome of that spike is closing the story rather than looking for a way around it.

## Why IBKR is a different shape from the other two

Stated as **suspicion, not fact** — this is exactly what the Trading 212 spike caught me doing, so
it is marked before anyone builds on it.

DEGIRO and Trading 212 are web-first: a browser app talking to an HTTP API, which is why reading a
session works. IBKR is believed to be **gateway-first**: the documented routes are understood to
involve either a locally-run Client Portal Gateway, or a desktop TWS/IB Gateway process, or OAuth.
If that is right, none of them is "a session the browser already holds", and R1 fails on
architecture rather than on a cookie attribute.

But IBKR also runs a web portal that people read their portfolio in, and **a web portal has to get
its data from somewhere.** That is the same reasoning that made the DEGIRO adapter possible, and it
is the first thing to check. Everything above is what the spike is for.

## The rule that outranks the findings

The agent will see real values. It reports **names, types, counts, dates and HTTP statuses — never
values.** Never an amount, a holding, a share count, a cookie value, a token, an account number or
a name. Describe a value's shape ("a two-decimal number", "an ISO date") instead of quoting it.

CLAUDE.md rule 7, applied to a spike.

---

## Phase 0 — the published documentation. No account, no browser

IBKR documents several separate interfaces and the first job is telling them apart, because most
material online conflates them.

> Read Interactive Brokers' official developer documentation. No account needed to read it. I need
> to know **which distinct APIs exist and what each one requires to run**, because that decides
> whether a browser extension can use it at all.
>
> 1. **List every distinct API/interface** IBKR offers for reading an account — Client Portal API,
>    Web API, TWS API, Flex Queries, anything else. For each: its base URL or transport, and
>    **what has to be running** (a locally installed gateway? a desktop application? nothing?).
> 2. For each one, **how authentication works**: OAuth, a session established through a local
>    gateway, an API token, a username and password. Be specific about *where the credential
>    lives* — in the user's browser, in a local process, or stored by the caller.
> 3. Which of them can return, and under what path: **current positions**, **transaction/trade
>    history**, **cash movements** (deposits, withdrawals, fees, interest), **dividends**, an
>    **account total or net liquidation value**, and **historical daily prices** per instrument.
> 4. For the trade history specifically: does a row carry an **instrument identifier**, a
>    **quantity**, a **price**, the **price's currency**, an **exchange rate**, and **the amount
>    that settled in the account's base currency**? Name the fields.
> 5. For cash movements: the **exact set of allowed type/category values**, verbatim.
> 6. **Flex Queries**: what they are, what is required to use one, whether they can be requested
>    programmatically, what formats come back, and how far back they reach.
> 7. Any documented **rate limits**, and anything about **history depth limits**.
> 8. Anything IBKR's terms say about programmatic read-only access to your own account.
>
> Quote schemas and enum values verbatim — this is public documentation, so nothing here is account
> data and precision is what makes it useful. Where something is genuinely not documented, say
> "unknown" rather than inferring it.

**What phase 0 settles:** R2, R3, R5 at the schema level, and — more importantly — *whether R1 is
even possible*. If every documented route needs a local gateway or a stored token, that is the
answer and phase 1 is unnecessary.

---

## Phase 1 — the web portal, logged in. Needs an account

Only worth running if phase 0 leaves any doubt that the portal has its own API.

> Log in to the IBKR web portal in a browser and open DevTools → Network. I want to know whether the
> portal fetches your **portfolio and transaction history** over an ordinary session cookie, the way
> a normal web app does — or whether it goes through something an extension could not replay.
>
> **Field names, paths, header names, counts and HTTP statuses only. Never an amount, a holding, a
> share count, a cookie value, a token or an account number.**
>
> 1. Open the portfolio page and the activity/statements page. For each request that fills them:
>    the full **host and path**, the method, and whether a `Cookie` header was sent.
> 2. The **names** of all request headers — never values. Flag anything that looks like a bearer
>    token, a CSRF token, or a device identifier, and say **where the page got it from** if you can
>    tell (a cookie? a value embedded in the HTML? a prior request?).
> 3. **Cookies**, from Application → Storage → Cookies: per cookie its **name, `SameSite`, `Secure`,
>    `HttpOnly`, `Domain`, `Path`**, and whether it expires. Never a value.
> 4. **The decisive test.** Pick one portfolio request, right-click → *Copy as fetch*, re-run it in
>    the Console with `credentials: 'include'` and again with `credentials: 'omit'`. Report both
>    status codes. That is what says whether an extension's fetch would carry the session.
> 5. **Field names** in one row of the positions response and one row of the transaction history
>    response. Names only, no values.
> 6. Is there a **price history / chart** request, and does it need the same session?
>
> Say "unknown" rather than guessing.

---

## What each answer decides

| Finding | Consequence |
|---|---|
| A cookie-authenticated portal API, `SameSite` permissive | **R1 clears.** Build it the way the DEGIRO adapter is built |
| A cookie plus a CSRF token the page holds in the DOM | Probably still readable. A judgement call, but closer to reading a session than to authenticating |
| A bearer token the page mints, or a required local gateway | Rule 9 territory: signing with a key it created, or storing a credential. **Likely out of scope** |
| Only OAuth or a stored API token | **Close the story.** Rule 9 makes it final, and there is no version of "just a small login form" |
| No daily price history anywhere | R4 fails. No chart, no product — see `MULTI-BROKER.md` §6 |

## After the answers come back

1. A section 9 in `MULTI-BROKER.md`, written the way section 8 now is: every row marked
   **DOCUMENTED**, **MEASURED** or **UNKNOWN**, and any earlier guess of mine that turned out wrong
   named at the top rather than quietly corrected.
2. A go/no-go on R1 before any adapter work, because everything else is wasted if it fails.
