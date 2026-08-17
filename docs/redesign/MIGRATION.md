# Migration — how to let Claude adopt this design without losing the app

Hand this file, `DESIGN-BRIEF.md` and `portfolio-redesign.html` to a fresh Claude Code session in
the repo. This file is the process; the brief is the target; the HTML is the reference.

The failure mode to prevent is not "it looks wrong". It is **silent loss**: a redesign that ships a
prettier Overzicht and quietly drops "compare months", the currency chart, the connection check and
Optimism Mode, and nobody notices for two months. The reference concept in
`portfolio-redesign.html` fell into exactly that trap on its first pass — §3 is the antidote.

---

## 1. The instruction to paste

> Read `DESIGN-BRIEF.md` and open `portfolio-redesign.html` in a browser. That HTML is a **reference
> concept**, not code to copy: it has its own hand-rolled SVG charts and generated demo data. The
> real implementation keeps Chart.js, keeps `src/lib/*` untouched, and keeps every existing test
> passing.
>
> Work in the phases in §2 of `MIGRATION.md`, in order. Do not start a phase before the previous
> one's gate is green. Before you delete or rename anything in `src/ui/app.html` or `src/ui/app.js`,
> check it against the parity table in §3 and either give it its new home or add it to
> `docs/RETIRED.md` with a reason. **An element that appears in neither is a bug, not a decision.**
>
> Do not touch: `src/lib/**`, `src/sw.js`, `manifest.json`, `tools/check-palette.mjs`,
> `tools/check-leaks.mjs`, the palette values, or anything in §4.
>
> After every phase run `npm test` and `npm run palette`, then `npm run demo` and click through all
> seven sections at 1440px and at 380px. Report what you changed and what you verified. If the brief
> and an existing behaviour disagree, stop and ask rather than choosing.

## 2. Phases, each with a gate

| # | Phase | Gate before moving on |
|---|---|---|
| 1 | **Tokens and type only.** Add the new tokens (`--brand-ink`, `--brand-accent`, surfaces, one radius scale). Strip uppercase above 11px. Flatten card-in-card to one panel depth. No markup moves, no logic. | `npm test` green, `npm run palette` zero collisions, every section still renders identically in structure |
| 2 | **Chrome.** Left rail replaces the tab row; sync state, reconciliation and coverage move into the rail foot; one Sync button plus one "Meer" menu; Wipe & resync behind a rule in red. Tabs become routes. | All seven sections reachable; every button from §3 still invocable |
| 3 | **Hierarchy.** Per section: one hero figure, three supporting facts, and an `Alle cijfers` disclosure that contains every remaining tile. Hint paragraphs become `?` disclosures. | Every tile in §3 accounted for; text of every hint preserved verbatim somewhere |
| 4 | **The window.** Make the range control real per §4 of the brief: anchor, recompute, label, adapt, refuse. Hide it on Vooruitblik and Meldingen. | New `test/window.test.js`: for each range, result equals the sum of monthly results in the window, and TWR chains rather than divides |
| 5 | **Charts.** Real heights, measured width, non-zero baseline plus disclosure for bounded windows, no symmetric axis on single-signed data, x labels clear of downward bars. | Visual pass at 1440 / 1024 / 380px; no clipped bar, no clipped axis label |
| 6 | **Hidden amounts.** Eye toggle in the top bar; replacement not blur; percentages, shares and counts survive; chart y-labels drop. | `test/mask.test.js` asserts no amount string is present in the DOM while masked |
| 7 | **Sharing.** Share affordance per figure; the sheet; four formats; account-derived name with off/first/full; download plus clipboard. | `test/anon-brand-snapshot.test.js` extended: card field set equals `SNAPSHOT_FIELDS`, and `SNAPSHOT_FIELDS` now contains `name` |
| 8 | **Parity sweep.** Walk §3 top to bottom in the running app. | Every row is *built* or in `docs/RETIRED.md` |

Phases 1–3 are cosmetic and reversible. 4 onwards changes what numbers mean, so each of those needs
a test, not a screenshot.

## 3. Parity table

Extracted mechanically from `src/ui/app.html` and `src/ui/app.js`, not from memory. **Status** is
what the reference concept does, so you can see where it is thin.

### Charts (13 canvases)

| id | what it is | new home | in concept |
|---|---|---|---|
| `c-value` | portfolio value incl. cash | Overzicht → *Waarde over tijd* | built |
| `c-invested` | paid in vs worth | Overzicht → *Ingelegd tegenover waarde* | built |
| `c-pnl` | result per period | Rendement → *Resultaat per maand* | built |
| `c-cum` | cumulative result (+ candles toggle) | Rendement → *Cumulatief* | built, candles toggle visual only |
| `c-movers` | result per instrument, ranked | Rendement → *Wat bewoog* | built as value change; see note |
| `c-compare` | selected months compared | Rendement → *Maanden vergelijken* | built |
| `c-comp` | stacked composition over time | Posities → *Samenstelling over tijd* | built |
| `c-holdings-pie` | holdings as shares | Posities → *Posities*, "Verdeling" toggle | **toggle is a stub** |
| `c-currency` | currency exposure | Posities → *Valuta* | built as a strip + table |
| `c-cash` | uninvested cash over time | Posities → *Contanten over tijd* | built |
| `c-deposits` | deposits/withdrawals per month | Inkomsten → *Stortingen en opnames* | built |
| `c-dividends` | dividend per month, withholding below the line | Inkomsten → *Dividend per maand* | built; **withholding-below-line not drawn** |
| `c-outlook` | projection scenarios | Vooruitblik | built |

Note on `c-movers`: the original draws *result* per instrument over the range. The concept draws
*value change*, because per-holding cashflow per day is not in the demo data. In the real app the
engine has it — use result, keep the original wording, and keep the "deposits are already out of it"
sentence.

### Tables (7)

| id | new home | in concept |
|---|---|---|
| `years` | Rendement → *Per jaar*, filtered to years intersecting the window | built |
| `months` | Rendement → *Maand tegen maand*, out-of-window months greyed, cells pickable | built |
| `compare-summary` | folded into *Maanden vergelijken* as a figure grid | built |
| `holdings` | Posities → *Posities*, columns adapt to whether the window has an anchor | built |
| `products` | Posities → *Winst en verlies per product* | built; **sort/filter controls visual only** |
| `transactions` | Posities → *Transacties*, filtered to the window | built |
| `diag-table` | connection check | **not built** — see below |

### Controls (14 groups, 5 inputs)

| id | new home | in concept |
|---|---|---|
| `range-group` | top bar, hidden where it does not apply | built, and now actually recomputes |
| `gran-group` ("Results per": day/week/month) | top bar, beside the range | **not built.** Decide: either bring it back next to the range and grey out granularities the window cannot support, or retire it and state that the section is always at the source's own resolution. Do not just drop it. |
| `theme-group`, `lang-group` | "Meer" menu | built |
| `cum-view` (line/candles) | panel head of *Cumulatief* | visual only |
| `ann-view` (my money / the portfolio) | Rendement → `Alle cijfers`, both values shown side by side instead of a toggle | partially: only money-weighted is shown. Show both. |
| `metric-group` (euro / return %) | panel head of *Maand tegen maand* | visual only |
| `holdings-view` (table/share) | panel head of *Posities* | visual only |
| `products-sort`, `products-filter` | panel head of *Winst en verlies per product* | visual only |
| `tx-scope` (this range / everything) | panel head of *Transacties* | **not built** — the concept always uses the window |
| `outlook-horizon`, `outlook-rates`, `outlook-manual`, `outlook-monthly`, `outlook-growth`, `outlook-yield`, `outlook-reinvest` | Vooruitblik panel head | horizon and monthly built; **rates / manual / reinvest not wired** |
| `toggle-cash` | panel head of *Waarde over tijd* | built |

### Buttons and modes (10)

| id | new home | in concept |
|---|---|---|
| `btn-sync` | rail foot, primary | built |
| `btn-wipe` | "Meer" menu, below a rule, red, with an ellipsis and a confirm | built (no confirm dialog) |
| `btn-export`, `btn-bugreport`, `btn-diagnose` | "Meer" menu | built as menu items |
| `btn-anon` | replaced by the eye toggle in the top bar | built, semantics changed — see brief §5 |
| `btn-copy-diag`, `btn-hide-diag`, `diag-table` | **Connection check has no home yet.** Put it in a modal opened from the "Meer" menu, same shell as the share sheet: a step/result/detail table, a copy button, and the "safe to share" line kept verbatim. | **not built** |
| `btn-clear-months` | *Maanden vergelijken* panel head | built |
| `zoom-state` (drag-to-zoom on the value chart) | Overzicht → chip above *Waarde over tijd* | built: pointer drag sets a custom window, chip resets it |
| `frown-toggle` (Optimism Mode 🙃 + `NOT THE REAL NUMBERS` stamp) | **no home yet.** It is deliberate, it has a stamp so a still frame gives it away, and it must not silently vanish. Suggestion: keep the toggle at the right end of the top bar, Overzicht only, and keep the stamp over the hero and the facts. | **not built** |

### Content that is not an element

- **27 `class="hint"` paragraphs.** Every one becomes a `?` tooltip, a one-line panel subtitle, or a
  panel footer. Preserve the wording. If a hint is longer than ~200 characters it is a footer, not a
  tooltip.
- **184 i18n keys.** Any new string needs both NL and EN. Any retired string gets deleted from
  `i18n.js` in the same commit, not later.
- **Notices**, pinned-when-untrustworthy behaviour, and the bug-report scrubbing: unchanged.

## 4. Do not change

- `src/lib/**` and `src/sw.js`. This is a UI change; if you need a number the engine does not
  expose, say so instead of computing it in the view.
- The palette values and `tools/check-palette.mjs`. Blue-for-positive is a colour-vision decision
  with a test behind it.
- `--brand-accent` ≠ `--accent`. White on `#D9531E` is 4.03:1; the UI accent is 4.87:1 and it is a
  filled button background.
- `[hidden] { display: none !important }`.
- The card stays **drawn**, never a DOM capture. No `fetch` in either half of the snapshot feature.
- No badge, no signature, no "certified". The provenance line must still be able to say
  "SLUIT NIET op DEGIRO".
- Anonymize stays replacement, never blur.
- The name on the card comes from the account, never from a text field. The username option is
  allowed but stays non-default and keeps its warning; see brief §6.

## 5. Make the checklist executable

The table above rots the moment someone renames an id. Turn it into a test:

```js
// test/parity.test.js — sketch
// docs/RETIRED.md contains lines like:  - `c-cash` → Posities · Contanten over tijd
// or:                                   - `frown-toggle` → RETIRED: superseded by …
const html = read('src/ui/app.html');
const manifest = parse(read('docs/RETIRED.md'));
for (const id of LEGACY_IDS) {           // the list frozen from today's app.html
  assert(html.includes(`id="${id}"`) || manifest.has(id),
    `${id} disappeared without a decision — add it to docs/RETIRED.md or put it back`);
}
```

`LEGACY_IDS` is the union of the four lists in §3, frozen once at the start of the migration. That
single test is worth more than the rest of this document: it makes "we forgot the currency chart"
fail in CI instead of surfacing in a bug report two months later.

## 6. Where the reference concept is knowingly not the product

So nobody mistakes it for a spec of behaviour:

- Charts are hand-rolled SVG. The real app keeps Chart.js — the concept only proves the *sizing*,
  the axis rules and the measured-width point.
- Per-holding history, monthly dividend and the account name are **generated** demo values, seeded so
  they sum to the real fixture totals. Never copy those numbers.
- Toggles marked "visual only" above change `aria-pressed` and nothing else.
- Language is NL only in the concept; the real app is bilingual.
- The concept uses `localStorage`; the extension should use its existing store.
