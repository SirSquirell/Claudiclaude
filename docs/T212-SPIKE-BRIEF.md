# Trading 212 spike — brief for a browser agent

What `docs/MULTI-BROKER.md` §8f asks for, written so it can be handed to an agent driving a
browser rather than run by hand. It answers R1 and R4, and confirms R2, R3 and R5 against reality
instead of against third-party importers.

**Run it against the practice account, not a live one.** Trading 212's demo environment
(`demo.trading212.com`) has play money and real instruments, so it produces real transaction rows,
real charts and real cookies with nothing at stake. A live account adds risk and answers nothing
extra at this stage; an *empty* live account answers less, because R2 and R3 need transactions to
look at. Live confirmation is a later step, and a small one.

## The rule that outranks the findings

The agent will see real values. It must report **names, types, counts, dates and HTTP statuses —
never values**. Specifically never: an amount, a holding, a share count, a cookie value, a session
token, an account number, or the account holder's name. This is CLAUDE.md rule 7 applied to a
spike, and `tools/har-shapes.mjs` is the same principle in code — it exists precisely so a capture
can inform a finding without travelling.

Market data is the one exception and only in one direction: **the dates on a price candle are not
account data**, and the first and last of them are the whole point of question 1.

---

## The prompt

> You are helping investigate whether a Chrome extension could reconstruct a Trading 212 portfolio's
> daily history. I need the **shape** of Trading 212's web API — never its values.
>
> **Absolute rule: report field names, types, counts, dates and HTTP status codes. Never report an
> amount, a share count, a holding, a cookie value, a token, an account number or a person's name.**
> If a value is needed to make a point, describe it ("a two-decimal number", "an ISO date") instead
> of quoting it. Market candle *dates* are fine and are explicitly wanted in question 1.
>
> Log in to the Trading 212 **practice/demo** account in a browser, place two or three small
> practice trades so there is history to look at, then open DevTools → Network and answer these in
> order. Question 1 matters most; if you only get one, get that one.
>
> **1. How far back does the price chart go?**
> Open any liquid instrument's chart (Apple, Tesla — anything). Set the range selector to its
> **maximum**, and also try 1 year and 5 years if those exist. For the request that fetches the
> chart data, report:
> - the full request path and HTTP method (e.g. `POST /charting/v2/batch`)
> - the request body's **field names**, and the values of `period`, `size`/`limit` and any
>   `includeFake`-style flag only — these are settings, not data
> - how many candles came back
> - the **first and last timestamp** in the response, and the interval between two consecutive ones
> - whether any candle has a `fake`-style flag set true, and how many
> - the field names inside one candle (is there a single `close`, or separate `bid`/`ask` objects?)
> - whether the request carried a `Cookie` header, and the **names** of the request headers
>   (especially anything like `X-Trader-Client`) — names only, never values
>
> Then try requesting a much larger `size` — a few thousand — and report whether it returns more
> candles, caps silently at some number, or errors. **This single answer decides the project.**
>
> **2. The session cookies.**
> DevTools → Application → Storage → Cookies for the Trading 212 domain. For each cookie, report
> **name, `SameSite`, `Secure`, `HttpOnly`, `Domain`, `Path` and whether it is a session cookie or
> has an expiry**. Never the value, not even truncated.
>
> **3. Transaction history.**
> Open the account's history/activity page. For the request that fetches it, report the path, the
> **field names** in one row of the response, how many rows came back, and whether pagination is by
> cursor, page number or date range. I am specifically looking for whether a row carries: an
> instrument identifier and what format it is in (ISIN? a ticker like `TSLA_US_EQ`?), a quantity, a
> price, the price's currency, **an exchange rate**, and **the total that settled in the account's
> base currency**. Say which of those exist by name — not what they contain.
>
> **4. Cash movements.**
> Find where deposits, withdrawals, dividends, fees and interest appear. Report the path, the field
> names, and — this is the important one — **the exact set of distinct type/action values** that
> appear (e.g. `Market buy`, `Dividend`, `Deposit`). Those are category labels, not data, and I need
> them verbatim.
>
> **5. The account total.**
> Find the request that backs the "portfolio value" or "account summary" figure. Report its path and
> its **field names**. I need to know whether one field represents the total account value —
> tell me the field's name, not its number.
>
> **6. The CSV export.**
> Request an export from the history page. Report **only the header row** — the column names, in
> order. Do not open, paste, quote or summarise any data row. If you can see how far back the export
> range selector allows, say so.
>
> Present it as one report, grouped by question. Where something could not be determined, say
> "unknown" rather than guessing — a guess here costs more than a gap, because it would be built on.

---

## What each answer decides

| Q | Decides | If the answer is bad |
|---|---|---|
| 1 | **R4**, the only real unknown. Daily closes going back years or there is no chart to draw | `size` caps at a few hundred days ⇒ the history is short ⇒ probably no product. §6, first bullet |
| 2 | **R1**. `SameSite=Strict`/`Lax` may mean an extension's fetch does not carry the session | Route B closes, and route A cannot reach prices, so the story closes with it |
| 3 | **R2**. The settled base-currency amount is what FX is measured from | Missing ⇒ every foreign valuation is a guess |
| 4 | **R3**. Typed actions instead of prose is why `classify.js` gets simpler here | Free text ⇒ a rule table like DEGIRO's, and unmatched rows are `UNKNOWN` and counted |
| 5 | **R5**, the reconciliation anchor | Missing ⇒ shippable with the check stated in red, as US-10 already requires |
| 6 | Confirms §8b against reality rather than against third-party importers | Columns differ ⇒ §8b's optimism was secondary sourcing, and gets rewritten |

## After the answers come back

Two things happen before any code:

1. **§8 gets rewritten against the report**, with each row's status changed from reported to
   measured. §8e's caveat — that the evidence is from February 2021 and the API has versioned since
   — either clears or becomes the finding.
2. **The bid/ask decision gets made and written down.** Trading 212 returns both where DEGIRO
   returns one close. Which one values a holding is a domain decision with no obvious answer, and it
   belongs in a doc before it belongs in a parser.
