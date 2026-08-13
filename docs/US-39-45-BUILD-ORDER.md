# US-39 … US-45 — the build order

**Gate: US-37 PASSED, 2026-08-13.** Trading 212's session is cookie-borne, the service worker gets
the same treatment as the page, and no header beyond `Accept` is required. Rule 9 is satisfied on
the same terms DEGIRO already meets. `docs/TRADING212-R1-RESULT.md` has the four measurements.

This file exists so an **unattended run** can pick up the next piece without a human in the room.
It is the execution order and the stop conditions; the reasoning behind each story is in
`BACKLOG.md`.

---

## The order, and why it is not the brief's

The delivery brief numbers these US-39 → US-43. That is a reading order, not a build order — it
puts the broker-management UI before the adapter it manages, and the adapter before the storage
namespacing every row it writes will need. Built in the brief's order, US-41 becomes a migration of
live Trading 212 data instead of a change to an empty store.

| # | Story | Why here |
|---|---|---|
| 1 | **US-45** Parameterise the session read | Two dozen lines. Everything after it needs a session that is not DEGIRO's by definition |
| 2 | **US-41** Storage namespacing | Must precede any second broker writing a row. After it, this is a data migration |
| 3 | **US-40** The Trading 212 adapter | The twelve functions in `brokers/index.js`'s contract |
| 4 | **US-42** Multi-broker sync and per-broker reconciliation | Needs an adapter to sync |
| 5 | **US-44** Renders through the existing pipeline | Needs something to render. Already refined in `BACKLOG.md` |
| 6 | **US-39** Broker management UI | Last of the features: it manages things that must exist first |
| 7 | **US-43** Release hardening | By definition last |

**One story per run.** A run that finishes early stops rather than starting the next one — the
value of the order is that each step is reviewable on its own, and a night that lands three
half-stories is worse than a night that lands one.

---

## Rules for an unattended run

These are not style preferences. They are the things that cannot be undone by a human reading the
diff in the morning.

1. **Never push to `main`.** Work on `claude/multi-broker-build`, branched from `main`. A human
   merges.
2. **Never widen a permission without the story asking for it.** `live.services.trading212.com` is
   justified by US-40 and by nothing before it.
3. **Never store a credential.** Rule 9 is absolute and there is no adapter shape that needs it —
   `brokers/index.js` has no `login` for this reason.
4. **`engine.js` and `combine.js` are not to be edited** unless a demonstrable generic bug says
   otherwise, and then it is reported as a change to the numbers rather than a refactor.
5. **No test may be deleted or weakened to make a build pass.** A failing test that is genuinely
   wrong gets its premise fixed *and the fix explained in the commit*. A failing test that is right
   is a stop condition.
6. **Stop and write it down** rather than working around it. Every story below has a stop
   condition; the general one is: if the change needs a broker-specific branch above the adapter
   boundary, that is the finding.
7. Run `npm test` before every commit. Green or no commit.

---

## 1 — US-45 · Parameterise the session read

`src/lib/session.js` resolves a DEGIRO session from a cookie by name. The name, the host and the
endpoint are constants in that module.

**Done when** the session resolver takes its host, cookie name and check endpoint as arguments,
`brokers/degiro.js` supplies the DEGIRO ones, and no behaviour changes. The existing session tests
pass unmodified — that is the whole acceptance criterion, because this is a refactor and any
observable difference means it was not one.

**Stop if** the resolver needs to know *which* broker it is resolving for. It must not: that
knowledge belongs to the adapter passing the arguments.

## 2 — US-41 · Storage namespacing

Every store in `store.js` currently holds one broker's rows with no marker. Two brokers in the same
store with the same product id is a silent collision.

**Done when** every persisted raw row carries the broker id it came from, reads can be filtered by
it, and a wipe can target one broker without touching another. `id` in the adapter contract is
already documented as "storage key prefix, stable forever" — use it.

**Watch:** rule 2 says only raw API responses are persisted truth. Namespacing changes *where* raw
rows live, never what is derived from them. If a derived number ends up in a store to make this
work, the design is wrong.

**Stop if** an existing install's data cannot be read after the change. A migration that drops
history is not acceptable; recomputing from raw is milliseconds, but the raw rows must survive.

## 3 — US-40 · The Trading 212 adapter

Implement `src/lib/brokers/trading212.js` against the twelve-function contract in
`brokers/index.js`, and add it to `ADAPTERS`.

Known and measured:
- `live.services.trading212.com`, session on a cookie, `credentials: 'include'`.
- `GET /rest/v1/accounts` — **measured**, 200 JSON from both page and service worker.
- Price history is public and needs no credential (`MULTI-BROKER.md` §8b).
- R2/R3/R5 schemas come from the official OpenAPI spec (§8c).

Not measured, and each is a gate of its own: the transactions endpoint, the dividends endpoint
(58 types, per the Cowork report — not a simple set), and the cash-movement vocabulary.

**`parseCashRows` must return rows already carrying a category**, and an unmatched description
becomes `UNKNOWN`, counted, surfaced. Rule 4. Trading 212's vocabulary is its own; do not reuse
DEGIRO's rule table.

**Every request goes through a throttle.** Rule 5. Do not add a second fetch path — if
`throttledFetch` needs to serve two hosts, give it per-host queues rather than a second copy.

**Stop if** an endpoint needs anything the R1 probe did not send. The probe carried one header,
`Accept`, and that is the measured boundary of what rule 9 permits here.

## 4 — US-42 · Multi-broker sync and per-broker reconciliation

**Done when** a sync iterates connected adapters, one broker's failure does not fail the others, and
**reconciliation is reported per broker**. `combine.js` already carries this; the UI has to show it.

Rule 6 must not be softened by combining. A cent out at one broker cannot be averaged away by
another being exact, and there is no combined verdict — there are two verdicts.

`pnl[t] = (value[t] − value[t−1]) − netExternal[t]` is linear, so `pnl_combined = Σ pnl_broker`.
That is why this needs no new arithmetic, and any new arithmetic here is a smell.

## 5 — US-44 · Renders through the existing pipeline

Already refined in `BACKLOG.md`. AC1–AC5 there are the acceptance criteria.

The one that matters most is **AC4**: with one broker connected, every figure is byte-identical to
before the second adapter existed. That is testable today, against the demo fixtures, and it is the
regression that would otherwise be found by a user.

## 6 — US-39 · Broker management UI

Connect, disconnect, see per-broker status. No login form — rule 9 — so "connect" means "check
whether a session the browser already holds can be read", which is `resolveSession`.

**Stop if** the design needs a field where a user types a secret. There is no such field.

## 7 — US-43 · Release hardening

The export allowlist (`EXPORTABLE_META`), the diagnostics output and the leak guard all predate the
second broker. Each needs re-reading with two brokers in mind: rule 7 says whatever is not declared
is redacted, and a field named `t212AccountId` ships by default under a denylist.

**Done when** the leak guard covers the new stores, the export declares the new fields, and
`diagnose.js` output still carries no session id, account number or amount.

---

## What a run reports

At the end, whether it finished or stopped:

- what was built, and the commit
- what `npm test` said, in numbers
- **what it could not verify** — anything touching `sync.js`, `session.js` or a broker module cannot
  be verified without a logged-in browser, and saying so is part of the deliverable
- the next story in this list, untouched
