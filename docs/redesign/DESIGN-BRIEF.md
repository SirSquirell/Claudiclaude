# Design brief — Asteria / DEGIRO Portfolio History

Paste this into Claude Design, or into a fresh Claude Code session against the repo, as the design
prompt. It assumes the reader can run `npm run demo` and look at the current UI.

---

## 1. What is wrong now

The UI is not badly built. The palette is contrast-tested and colour-vision-tested, the numbers are
tabular, the tile-overflow bug is properly solved, the hairline-in-the-gap trick is right. What is
wrong is **information design**, and it fails in a way that reads as machine-made:

1. **A wall of eight equal buttons in the header.** Language, theme, Anonymize, Sync now, Check
   connection, Copy bug report, Export JSON, Wipe & resync — all pill-shaped, all uppercase, all
   competing, wrapping onto a second row that orphans the destructive one. Six of the eight are
   maintenance actions used once a month at most. Making `#btn-sync` dark and `#btn-wipe` dashed is
   a patch on the symptom; the disease is that eight top-level actions exist at all.

2. **Uppercase and letterspacing on everything.** `h1`, every button, every tile label, every tab,
   every table header. When everything shouts, nothing is emphasised, and uppercase costs
   word-shape legibility. It is also the most recognisable "AI wrote this" tic in the file.

3. **Seven equal-weight stat tiles.** "Total value" and "Data coverage 100.0%" render at the same
   size, in the same box, with the same dot. The user opened the page for one number.

4. **Prose doing the job hierarchy should do.** Every card carries a permanent explanatory
   paragraph, *and* an (i) per figure, *and* a footnote. The copy is good — that is the problem: it
   is compensating for a layout that has not made the meaning obvious.

5. **Boxes inside boxes.** Card → card-head → pill control bar → segmented group → pill button.
   Four levels of rounded container before you reach content.

6. **A range control that lies.** The floating Range / Results-per bar sits above every tab,
   including sections whose own copy says "whole history, not the selected range". Nothing outside
   the two main charts recomputes when you touch it.

7. **Tab count badges.** `OVERVIEW 2 · PERFORMANCE 7` are card counts. They read as unread badges.

8. **Charts too short for their width.** `--chart-h` maxes at ~11.9rem on a 1420px canvas. A
   1400×190 line chart flattens the movement it exists to show.

9. **Colour as decoration on figures.** The whole amount is coloured, not just its sign, so
   `+€ 2.535,90` in blue reads like a hyperlink.

10. **Sharing is invisible and half-built.** US-47 draws a genuinely good card — allowlisted fields,
    provenance line, no network — and it hangs off an unlabelled `⧉` in a header-less table column,
    clipboard only, one aspect ratio, no identity on it. As a growth surface it does not exist.

## 2. What to keep — do not "fix" these

- **Blue = positive, red = negative**, and `tools/check-palette.mjs`. Deliberately not green/red,
  because green/red is the worst possible pair for the most common colour vision deficiency, and it
  is validated by a test rather than asserted in a comment. Keep the tool and the zero-collision
  standard; keep cash as a neutral outside the categorical set.
- **`--brand-accent` separate from `--accent`.** White on `#D9531E` measures 4.03:1, under the
  4.5:1 floor; the UI accent `#B8532F` measures 4.87:1, and it is a filled button background.
  Making the brand colour the app colour is a measured change to a validated palette, not a rename.
- **rem + `clamp()` everywhere, px only for the hairline.**
- **`[hidden] { display: none !important }`** and the reasoning behind it.
- **Outlook separated**, with the caveat above the numbers and no chart when the measured rate is
  not something a market does.
- **The snapshot architecture**: drawn card not DOM capture, an allowlist not a scrub, provenance
  that says "DOES NOT reconcile" when it does not, no `fetch` in either half.
- **Anonymize as replacement, not blur** — see §5.
- The writing. Move it, shorten it, put it behind a disclosure. Do not blandify it.

## 3. Structure

- **Left rail instead of a tab row.** Persistent vertical nav: Overzicht, Rendement, Posities,
  Inkomsten, Vooruitblik, Meldingen. Sync state, last-sync time, reconciliation status and coverage
  live at the foot of the rail — they are data-quality facts, not performance figures, and they do
  not belong in a row of KPI tiles. Drop the count badges.
- **One action in the chrome.** Sync is the only visible button. Check connection, Export JSON,
  Copy bug report, theme and language go into one "Meer" menu; Wipe & resync sits below a rule, in
  red, with an ellipsis.
- **One hero number per section**, 2.4–3.5rem, its delta on the line below, and at most three
  supporting facts beside it as quiet key/value pairs.
- **Everything else goes into "Alle cijfers"** — a collapsible definition grid under the hero, open
  by default. The seven-tile wall loses its equality, not its content. Realised, unrealised, costs,
  trades, months in profit, best/worst month, coverage, cash, position count all live here.

## 4. The window — the part that is currently theatre

**Rule: a section either honours the period control or does not show it.** No third state.

- Range applies on Overzicht, Rendement, Posities and Inkomsten. It is hidden on Vooruitblik (a
  window in the past changes nothing about a line running forward) and on Meldingen.
- **Every window has an anchor**: the last data point at or before the window opens. Measuring from
  the anchor is what makes the first delta in a window real instead of zero. For "everything", the
  anchor is a synthetic zero point before the account existed — it makes the all-time delta correct
  and is **never drawn**, because it is not a measurement.
- **Recompute, do not re-slice.** Inside a window: result (sum of monthly results), time-weighted
  return (monthly returns chained, so a deposit mid-window does not flatter it), net flow in and
  out, dividend, and drawdown measured *within the window*. A shorter window legitimately gives a
  different drawdown, and the label must say which window it belongs to.
- **Say which window every figure belongs to.** Section eyebrow carries "laatste 3 maanden"; the
  crumb carries the exact dates; anything deliberately all-time carries "hele looptijd" on the
  figure itself. There is no such thing as an unlabelled number here.
- **Tables adapt rather than print dashes.** Over "everything" there is no earlier point to compare
  a holding against, so the "waarde toen / verschil" pair is replaced by the all-time pair
  ("gem. betaald / ingelegd vs gegroeid"). The month matrix keeps every year but greys the months
  outside the window, because its whole point is cross-year comparison.
- **The window can also be dragged straight out of the value chart** — that is what the existing
  `#zoom-state` element is for. A drag sets a custom window, a chip names it in full dates and
  resets it to the active preset, and touching a preset clears the drag. Every preset ends today; a
  drag is the only way to look at the crash in the middle, so it is not optional.
- **Refuse to draw rather than mislead.** Fewer than three points in the window: say the source is a
  daily value per month-end and ask for a longer period. A window that does not contain the
  account's own start gets a non-zero baseline, and the panel footer says so — a chart that does
  not start at zero and does not admit it is the oldest trick in the book.

## 5. Hidden amounts

One eye toggle in the top bar, always visible, `aria-pressed`, state in `localStorage`, and a
"bedragen verborgen" marker beside the page title while it is on.

**It masks by replacement, not by blur.** This is a correction to the obvious implementation, and it
matters: a CSS blur leaves the real string in the DOM — select it, copy it, open devtools, or hand
the DOM to the share card, and the number is back. So the figure never reaches the page at all.
Blur is cosmetics over a mask that is already empty.

- Fixed-width `•••`, always. A mask that preserves digit count still leaks whether it is four
  figures or six, and the magnitude is most of what a screenshot gives away.
- Signs stay: every signed figure is already coloured, so hiding the sign hides nothing and looks
  broken.
- **Percentages, shares and counts stay.** They are the safe part and the interesting part.
- Share *quantities* are masked (quantity × public price = value). Position and transaction *counts*
  are not — a count leaks nothing.
- Chart y-axes lose their labels while masked; gridlines stay. The shape survives, the level does
  not, which is the whole point.
- The share sheet's "show amounts" defaults to whatever the page is doing.

## 6. Sharing — the marketing requirement

Shareable PNGs are a hard requirement, so sharing gets designed rather than tolerated.

- **A share affordance next to every shareable figure**: the hero value on each section, each chart
  panel header, and each holdings row. Same icon everywhere.
- **A share sheet, not an instant copy.** Live preview plus: format (1:1, 4:5, 9:16, 16:9), light or
  dark, a name field, and an amounts toggle. Download PNG *and* copy to clipboard — clipboard alone
  fails on mobile and in browsers that refuse the permission.
- **The card stays drawn, never captured.** A DOM capture ships whatever happens to be on screen: an
  open tooltip, the row above, a reconciliation banner. A drawn card ships a declared field list.
  This is precisely what makes it safe to put a marketing button on, so the sheet lists the field
  names on screen — `title sub value pct period spark handle provenance` — and says "meer niet".
- **The name comes from the account, never from a text field.** Three options: none, first name
  (`firstContact.firstName`), or the DEGIRO username. A field anyone can type means anyone can post
  someone else's returns under their own name, which is the one thing this must not enable. Add
  `name` to `SNAPSHOT_FIELDS` so the leak test sees it.
- **None of the three makes the card verifiable, and the UI must not imply otherwise.** Any value
  this extension can print, anyone holding the extension can also patch — the same reason
  `src/lib/snapshot.js` refuses to say "certified".
- **The username option carries a warning and is not the default.** A DEGIRO username is one half of
  a login pair, it is not designed to be public the way a social handle is, and it cannot be rotated;
  publishing it makes targeted phishing and credential stuffing against that one account easier.
  First name is the default. The owner has weighed this and chosen to offer the username anyway;
  keep the warning, keep the default.
- **The provenance line keeps telling the truth.** `DEGIRO · 13 aug 2026 · sluit tot op de cent ·
  v0.44.1`, and "SLUIT NIET op DEGIRO" when reconciliation failed. A card from an account forty
  thousand euro out must not carry a clean line. There is still no badge and no signature: any
  signature this extension can produce, anyone holding the extension can also produce.
- **The spark is a shape, not a reading** — no axis, no scale — which is why it survives with amounts
  hidden and is the reason a hidden-amount card is still worth posting.
- **Vooruitblik is not shareable.** A projection should not circulate as a result.

## 7. Branding

The mark is the four-point star plus the rising spark-with-dots from
`assets/logo/asteria-logo-{light,dark}.svg`.

- **One geometry, two renderers**: inline `<svg>` for the DOM, `Path2D` for the canvas. The ink
  rides `currentColor` and the star takes `--brand-accent`, so there is no second palette and no
  `theme === 'dark' ? a : b` in a render function.
- **Do not load the SVG files into the canvas.** An SVG through `<img>`/`drawImage` does not inherit
  `currentColor` and is unreachable by the page's CSS; it would paint whatever fill is baked in, so
  a file-based watermark has to pick a variant in JavaScript — the thing the brand rule forbids.
- **The wordmark is not rasterised from Inter Tight.** A font that may not be installed is
  cross-machine drift, and a share card must look identical on every machine that draws it. Set
  `ASTERIA` in the UI stack at weight 500 with the brand's tracking. If the lockup must be
  pixel-exact, vendor a subset woff2 of Inter Tight and say so in the brand note — do not leave it
  to whatever the machine happens to have.
- **Below 24px the mark stands alone**, per the existing brand note.
- The lockup goes at the head of the rail and at the head of every share card. Nowhere else — the
  brand does not need to be on every panel.

## 8. Type, colour, density

- Sentence case for headings and buttons. Uppercase survives only on eyebrow labels ≤ 11px with
  `letter-spacing: .07em`.
- Scale: eyebrow 11 / body 15 / panel title 15 semibold / fact value 17 / hero 38–56. Weight and
  size carry hierarchy; borders do not.
- Colour the **sign and the delta**, not the magnitude. `€ 115.940,77` stays ink; `+€ 31.140,77` is
  blue.
- One container depth: flat panel, hairline border, header row, body, optional footer. No shadows on
  nested elements, no pill inside a pill.
- Charts 230–320px tall, rendered SVG at **measured** pixel width — a stretched viewBox distorts the
  axis type, and distorted type is exactly the tell this redesign removes.
- Tables carry their quantities: a bar next to the share percentage, a 7px series square next to the
  name, sticky header, right-aligned numerics.
- Replace every permanent hint paragraph with a `?` beside the label. One short subtitle per panel,
  in the header row. Panel-wide caveats go in the footer at 12px. The Outlook caveat is the one
  exception and stays permanent, left-ruled in the accent colour, above the numbers.

## 9. Acceptance criteria

- Zero uppercase text above 11px; zero shadows on nested elements.
- No section shows a control that does not affect it, and no figure on screen is unlabelled as to
  its period.
- Every number is `font-variant-numeric: tabular-nums`.
- `npm run palette` still reports zero collisions in both themes.
- Nothing the current version explains disappears; it moves behind a `?`, into a footer, or into
  "Alle cijfers".
- Hidden amounts leave no amount in the DOM — assert it in a test, not by eye.
- The share card's field list equals `SNAPSHOT_FIELDS` — assert that too, and add `handle` to it.
- A window with fewer than three points draws no line and says why.
- Keyboard: rail is a list of buttons, menu and share sheet close on Escape and outside click, the
  `?` is focusable, all segmented controls use `aria-pressed`.

---

## Short version, if you want to paste one paragraph

> Redesign the Asteria / DEGIRO Portfolio History UI. Keep the engine, the copy, the CVD-safe
> blue/red palette and its contrast test, the separate brand vs UI accent, and the drawn-not-captured
> share card with its field allowlist and provenance line. Change the information design: replace
> the tab row and the eight-button header with a persistent left rail plus one Sync button and one
> overflow menu; replace the seven equal stat tiles with one hero number, three supporting facts and
> a collapsible "all figures" grid; strip uppercase above 11px; flatten card-in-card to one panel
> depth; move permanent explanatory paragraphs behind a `?` or into panel footers; give charts
> 230–320px and render them at measured width. Make the period control real: every section that
> shows it recomputes result, time-weighted return, flows, dividend and drawdown inside the window
> against an anchor point, labels which window each figure belongs to, adapts its table columns when
> there is no earlier point to compare against, and refuses to draw a line from fewer than three
> points. Add an eye toggle that hides absolute amounts by replacement rather than blur, keeping
> percentages, shares and counts. Make sharing first-class: a share button beside every shareable
> figure opening a sheet with live preview, four social formats, light/dark, a user-typed handle
> that is never derived from the account, an amounts toggle, and both download and clipboard. Put
> the Asteria lockup — mark from the SVG geometry, wordmark in the UI stack — at the head of the rail
> and on every card.
