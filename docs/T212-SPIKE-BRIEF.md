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

# What is left: one question, and it needs a logged-in session

**Can positions and transactions be reached without storing a credential?**

Prices are public. Account data is documented only behind an API key and secret, which rule 9
forbids. The remaining possibility is the one DEGIRO uses: a logged-in web session whose own
requests the extension repeats.

If yes, the adapter is buildable exactly like the DEGIRO one. If no, Trading 212 is a price source
with no portfolio, and the correct outcome is closing the story.

## The prompt, for whoever has an account

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

| Answer | Consequence |
|---|---|
| Cookie works, `SameSite` permissive | **Build it.** Nothing else is outstanding |
| Cookie works, `SameSite=Strict`/`Lax` | Needs the same test DEGIRO passed |
| A bearer token the page mints | Closer to "signing with a key it created" than to reading a session — a rule 9 judgement |
| Only the documented API key | **Close the story.** Rule 9 makes that final |
