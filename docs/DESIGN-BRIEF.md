# Design brief — paste this into Lovable, Claude, or hand it to a designer

Everything from `## The prompt` down is meant to be copied verbatim. The notes above it are for
us, not for the tool.

## Notes for us, before you paste it

**Ask for a look, not a codebase.** Lovable will produce React, Vite and Tailwind. This
extension has no build step — no `npm install`, no bundler, Chart.js vendored — which is why a
tester downloads a ZIP, presses "Load unpacked" and is done. Adopting a React toolchain is a
decision to take on its own merits, not one to inherit from a design tool. So the prompt asks
for a **single static mockup page** we read a design system off, and the implementation stays
in the current vanilla stack.

**All sample data in the prompt is invented.** Never paste a screenshot or an export of a real
account into a design tool — CLAUDE.md rule 7. If the tool needs to see the real thing, run
`npm run demo`, which serves the whole interface on generated data with no account anywhere in
it.

**The non-negotiable list is the important half.** Every item on it is either a correctness
rule or validated accessibility work, and a good-looking design pass will break each one,
because the broken version photographs better. Do not trim that section to make the prompt
shorter.

---

## The prompt

I need a visual redesign of a single-page dashboard. I want **one static HTML mockup** with
hardcoded sample data — no backend, no routing, no state management, no component library
install. I am going to read a design system off it (spacing scale, type scale, colour tokens,
component styling) and implement it by hand in vanilla HTML and CSS. Please do not build an
application.

### What the product is

A browser extension that reconstructs what someone's investment account has been worth, every
day since they opened it, from their trade history and daily closing prices. The value it
offers is not "pretty charts" — it is *trustworthy numbers*. It says loudly when a figure
cannot be verified. That honesty is the product, and the design has to carry it rather than
tidy it away.

The audience is one person looking at their own money, on a laptop, occasionally on a narrow
window. Not a trading desk, not a team dashboard.

### What is on the page, top to bottom

1. **A header**: product name, a one-line status ("Last synced 10 minutes ago · 2 043 days of
   history"), and four actions — Sync now, Check connection, Copy bug report, Export JSON.
2. **A warnings area.** Zero to five messages, each one of three severities. This is the part
   most designs get wrong, so it is described in detail below.
3. **Six KPI tiles**: Total value, Money paid in, Total result, Today, Dividend received, Fees
   paid. Each has a label, a large value, and a small note underneath.
4. **A toolbar**: a range selector (1M / 3M / 6M / YTD / 1Y / ALL), a granularity selector
   (Auto / Day / Week / Month), and an include-cash toggle.
5. **Nine chart cards**, each with a title, one or two lines of explanatory hint text, and a
   chart. Some cards have their own small segmented control (Line/Candles, Table/Share).
6. **A holdings table**: colour swatch, instrument, quantity, value, result, share %, currency.
   Around 10–20 rows. Some rows carry a small "est." marker meaning the number is an estimate.
7. **A month × year grid**: years as rows, twelve months as columns, one number per cell,
   tinted by whether it was a gain or a loss. Cells are clickable.

### Sample data to hardcode

All invented. Use these, do not generate more realistic-looking financial data.

```
Total value        € 112 480,00     (€ 8 120,00 of it is cash)
Money paid in      € 64 000,00      (deposits minus withdrawals)
Total result       + € 48 480,00    (+ 75,8 %)
Today              + € 312,40       (this week + € 1 044,10)
Dividend received  € 2 499,00       (€ 441,00 withheld)
Fees paid          € 116,50

Holdings:
  Northwind Industries   NWI    289      € 28 717,93   + € 4 138,76   25,7 %   EUR
  Contoso Corp           CTS     53      € 16 955,23   + € 14 345,41  15,2 %   USD
  Fabrikam AB            FAB    177      € 14 800,74   − € 1 332,00   13,2 %   SEK
  Litware Holdings       LTW    304      € 12 166,08   + € 3 099,85   10,9 %   EUR   est.
  Adventure Works        ADV  1 114      € 10 861,50   − € 3 329,56    9,7 %   EUR
  Tailspin plc           TSP     76       € 8 455,76   + € 996,77      7,6 %   GBX
  Cash                            —       € 8 120,00   + € 512,00      7,2 %   EUR
```

### The three severities, and why they matter more than they look

- **Red — the reconstruction disagrees with the broker.** The numbers on this page cannot be
  trusted. Example text: *"Reconstructed total is € 112 480,00 but the broker reports
  € 108 900,00. Share counts agree, so this is a disagreement about prices."*
- **Yellow — something is estimated.** Example: *"3 instruments have no price history. They are
  held at the last price they traded at, so their movement between trades is not real."*
- **Blue — information.** Example: *"Exchange rates for 2 currencies were derived from your own
  conversions."*

**These may not be softened.** Not collapsed into a bare icon, not tucked behind a "details"
toggle, not shrunk to a badge in the corner. A wrong number presented confidently is the
failure this product exists to prevent, so a warning has to be at least as prominent as the
number it is about. Design them as first-class content, not as chrome.

### Hard constraints — every one of these is a correctness or accessibility rule

1. **One vertical axis per chart. Never two.** Two scales on one plot invent a correlation out
   of an arbitrary alignment. If two quantities both matter, that is two charts.
2. **Gains and losses are blue and red, not green and red.** Green/red is the worst possible
   pair for colour-vision deficiency, and this palette was validated against exactly that. Keep
   a blue/red diverging pair. Propose specific hues, but do not switch to green.
3. **Colour is never the only channel.** A sign, a label or a baseline carries the meaning too.
4. **Seven categorical colours, maximum, plus one neutral for cash.** An eighth series folds
   into "Other" rather than getting a generated hue. Do not propose a generated or interpolated
   palette.
5. **No network requests of any kind.** No web fonts, no icon CDN, no remote images, no
   analytics. System font stack, and any icons inline as SVG. This is enforced by a content
   security policy — a design that needs a hosted font cannot be built.
6. **Light and dark both, as CSS custom properties.** Define the full palette as tokens on
   `:root` and redefine only the tokens for dark.
7. **The holdings table stays.** It is the accessible fallback for the chart colours, so it
   cannot be replaced by a visualisation.

### What I want back

- One `index.html` plus one `styles.css`, self-contained, that I can open in a browser.
- Charts can be static SVG or a plain image placeholder at the right size — I do not need
  working charts, I need to see the card, the title, the hint text, the legend and the spacing.
- A short list of the design tokens you chose: colours, the spacing scale, the type scale, the
  border radius, and the two theme palettes.
- At least these states drawn, because they are where the design usually falls apart: the page
  with three warnings stacked at the top, the page with none, a first-run empty state, and the
  layout at 900 px wide.

### What I do not want

A component library, a build step, routing, authentication, a landing page, marketing copy,
generated placeholder data beyond what is above, or green/red for gains and losses.
