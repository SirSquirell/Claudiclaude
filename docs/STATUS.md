# Status — one page

`docs/BACKLOG.md` is 1 100 lines of reasoning and evidence, which is the right place for *why*
but a bad place to find out *where things stand*. This is the index. It says what is done, what
is decided but unbuilt, and what is waiting on whom.

Last updated at 0.15.0.

## Shipped and signed off

Tested by users and accepted, which is the release gate in [BACKLOG §5](BACKLOG.md).

| Story | What it did | Release |
|---|---|---|
| US-02 | Options valued with their contract size; reconciliation to the cent | 0.10.0 |
| US-04 | Exchange rates from DEGIRO's own conversions; GBX ↔ GBP | 0.10.0 |
| US-05 | Dissolved into US-03 — kept as tests, not a separate story | 0.10.0 |
| US-06 | "Results per" applies to every chart | 0.10.0 |
| US-08 | Compare specific months by clicking a cell | 0.10.0 |
| US-09 | A closed round trip no longer leaves shares behind | 0.10.0 |
| T-1 | Export allowlist, leak guard, `audit` refuses paths inside the repo | 0.11.0 |
| B11 | Contract size measured near an observed rate, not through a guessed one | 0.11.0 |
| — | Holdings as a table or a share ring | 0.11.0 |
| US-12 | Drag across the value chart to zoom | 0.12.0 |
| US-13 | Candles on the cumulative result at Week and Month | 0.12.0 |
| S14 | Unrecognised API fields kept instead of dropped | 0.12.0 |

## Shipped, not yet tested

**On `main`, and nobody has run them against a real account.** This is the gate that is open.

| Story | What it did | Release |
|---|---|---|
| US-14 | A result per holding, in the holdings table | 0.13.0 |
| US-15 | The composition ranks inside the selected window | 0.13.0 |
| S18 | The candle toggle acts instead of refusing | 0.13.0 |
| S19 | A drag shows what it is selecting | 0.13.0 |
| US-11 | **Copy bug report** — every notice as pasteable JSON | 0.14.0 |
| B8 | The KPI tiles follow the selected range | 0.15.0 |
| — | Trade markers on the value chart | 0.15.0 |
| — | A base URL from the config endpoint is checked before it is trusted | 0.14.0 |
| — | Rule 8 (YAGNI) and the audit applying it | 0.14.0 |

## Refined, not built

| Story | State | Waiting on |
|---|---|---|
| **The spike** | Instrument built (`npm run inspect`), questions written, findings section empty | **One fresh export.** Nothing else |
| US-03 (2nd half) | Refined — expiry, strike, call/put from data rather than from a name string | The spike |
| US-07 | Refined — and if margin is not in the response, the margin half is dropped rather than deferred | The spike |
| US-16 | **Mockup delivered and assessed.** Staged plan written: tokens → notifications → tabs → new charts | Nothing. A decision to start |
| US-18 | Notifications get a place of their own, and nothing is dismissible | Nothing. Needs no engine work |
| US-19 | Five tabs instead of one 3 788 px scroll | Nothing |
| US-20 | Six new KPIs. Five are reads; annualised return needs a money-weighted solver and a naming decision | Nothing |
| US-21 | Five new visualisations. Most are reads; drawdown and cumulative fees need small engine additions | Nothing |
| US-17 | Refined — notice when a field DEGIRO renamed stops arriving | Nothing. A decision to start |
| US-10 | Refined — Trade Republic | Its own one-day spike: can an extension reach the session the way it can at DEGIRO? |
| US-11b | **Parked.** A prefilled GitHub issue. Superseded by the clipboard report in 0.14.0 | Only if pasting becomes the bottleneck |

## Not a story

**US-01** — the codebase-review story. It produces no user-visible change, so it can never
satisfy "users tested it". It became the standing rules in CLAUDE.md instead, which get checked
on every story rather than once.

## Blockers

| # | State |
|---|---|
| B1 | **Open.** Does `products/info` return `contractSize`? The spike answers it. Does not block anything today — the measured route is the more robust one anyway |
| ~~B8~~ | **Built in 0.15.0.** The tiles follow the selected range, with the period in the label |
| B10 | **Open, blocks nothing.** Does DEGIRO book a split as a transaction pair? US-09 shipped without needing the answer, because closure must hold whichever way it falls |
| ~~B7~~ | **Answered by 0.10.0** — rates unobserved for more than a quarter are flagged. The bigger fix, a real daily FX series, was not needed |
| ~~B9~~ | **Answered by 0.10.0** — the aggregate columns are dropped when specific months are picked, and both comparison modes were kept |
| ~~B2 B3 B4 B5 B6~~ | Answered during the 0.10.0 refinement |

## What is actually next

Two things, and neither is code.

1. **A test round on 0.14.0.** Two releases are on `main` unverified, and everything built on
   top of them inherits that.
2. **One export.** Update, **Wipe & resync**, export, `npm run inspect <path>`, paste the
   output. It is safe to paste — that is what the tool is built for. It closes the spike and
   unblocks US-03's second half, US-07 and B1 in one go.

Everything else on this page is genuinely optional right now, and all of it gets better after
those two.
