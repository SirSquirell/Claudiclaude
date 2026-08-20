/**
 * Full-page UI. SPEC §3.2: "the toolbar click or a button opens a full
 * extension page with the real chart. Range selector, hover tooltip with date +
 * value + delta, toggle for including/excluding cash, and a marker on days with
 * an external cashflow."
 */

import { aggregatePnl, annualisedReturn, buildComposition, projectPortfolio, candleSeries, maxDrawdown, monthlyTable, rangeEndIndex, rangeStartIndex, windowReturnPct } from '../lib/engine.js';
import { formatDay, monthKey, weekKey } from '../lib/dates.js';
import { GESTURE } from '../lib/config.js';
import {
  candleChart,
  compositionChart,
  cumulativeChart,
  cashChart,
  currencyChart,
  depositChart,
  dividendChart,
  moversChart,
  investedVsValueChart,
  holdingsPieChart,
  monthCompareChart,
  pnlChart,
  projectionChart,
  singleSeriesChart,
  valueChart,
} from './charts.js';
import { buildBugReport } from '../lib/report.js';
import { fieldAlarms } from '../lib/parse.js';
import { captured, installErrorCapture } from './errors.js';
import * as frown from './frown.js';

/**
 * The build on screen in demo mode, fetched once from the manifest.
 *
 * Declared up here rather than beside `loadDemoVersion` further down: `init()`
 * runs while the module is still evaluating, so a `let` declared below it is in
 * the temporal dead zone and the first render throws
 * `Cannot access 'demoVersion' before initialization` — which took the whole
 * page down, exactly the class of defect 0.36.0's error capture exists for.
 */
let demoVersion = null;
import { isSameRun } from '../lib/sync.js';
import { ADAPTERS, connected as connectedBrokers } from '../lib/brokers/index.js';
import { LANGS, applyStatic, getLang, missing as missingTranslations, setLang, t as tr } from './i18n.js';
import { THEMES, alpha, applyAnonymize, applyTheme, fmtEurCents, fmtPct, fmtPrice, fmtQty, fmtSigned, getAnonymize, getTheme, onThemeChange, setAnonymize, setTheme, tokens, withAnonymize } from './theme.js';
import { FORMATS, flowModel, moneyInOver, ownerLine, positionSpan, scoreCardModel, snapshotModel, splitModel } from '../lib/snapshot.js';
import { HOLDINGS_COLUMNS, baseHidden, cycleSort, droppableByPriority, optionalColumns, orderedColumns } from './columns.js';
import { brokerMarkSvg, lockupSvg, markSvg } from './brand.js';
import { copySnapshot, downloadSnapshot, drawScoreCard, drawSnapshot, tokensForTheme } from './snapshot.js';
import { Spring, clampShift, prefersReducedMotion, project, rubber, revealOnArrival, shiftToShow, velocityFrom, wirePressFeedback } from './motion.js';
import { inExtension, load, send, wantsDemo } from './datasource.js';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
/** What each preset is called in the crumb — a range button is not a sentence. */
const RANGE_WORDS = {
  '1M': 'last month',
  '3M': 'last 3 months',
  '6M': 'last 6 months',
  YTD: 'this year so far',
  '1Y': 'last year',
};
const GRANS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const state = {
  data: null,
  /** Everything the last render had to say, for the Notices section. */
  notes: [],
  /** Product table: which type chip is active. Sort and column order are
   *  persisted preferences (US-87), not view state, so they live beside the
   *  theme in localStorage rather than here. */
  productType: 'ALL',
  /** Outlook: horizon in months, contribution, and whether rates are derived. */
  outlook: { months: 60, monthly: 0, manual: false, growthPct: null, yieldPct: null, reinvest: null },
  /** 'money' (what my money earned) or 'time' (how the portfolio performed). */
  annualisedView: 'money',
  /** Transaction list: follow the range, or show the lot. */
  txScope: 'range',
  range: 'ALL',
  granularity: 'auto',
  includeCash: true,
  charts: {},
  diagnostics: null,
  steps: [],
  /** 'pnl' (euros) or 'returnPct' (time-weighted return). */
  metric: 'pnl',
  /** Month numbers 1-12 picked for the across-years comparison. */
  selectedMonths: [],
  /** 'YYYY-MM' keys picked for the specific-months comparison. */
  selectedCells: [],
  /** 'table' or 'share' — how the holdings card is drawn. */
  holdingsView: 'table',
  /** 'line' or 'candles' — how the cumulative result is drawn. */
  cumulativeView: 'line',
  /** Which section is on screen. The page was 3 788 pixels of one scroll. */
  tab: 'overview',
  /**
   * The share sheet's settings, and they persist across openings on purpose:
   * whoever posts these posts several, and re-picking 9:16 and a handle for
   * every one is the friction that makes a feature go unused. `productId` is the
   * only part that changes per card.
   *
   * `amounts` starts at `false` — a card leaves the machine, so the private
   * default is the right one even when the page is showing figures.
   */
  /**
   * `kind` decides which card the sheet is showing. `position` is US-47's, keyed
   * by `productId`; `score` is US-54's, keyed by the section and the tile's
   * label. Everything else — shape, theme, amounts, the name — is shared,
   * because those are choices about *posting* rather than about the subject.
   */
  share: {
    kind: 'position',
    productId: null,
    section: null,
    tileLabel: null,
    format: '16:9',
    theme: null,
    amounts: false,
    nameSource: 'first',
    handle: '',
  },
};

/**
 * The sections, in the order they appear.
 *
 * The count beside each label is how many cards it holds, read off the markup
 * rather than written here — two lists of the same thing drift, and the one
 * that drifts is always the one nobody looks at.
 */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'perf', label: 'Performance' },
  { key: 'comp', label: 'Composition' },
  { key: 'income', label: 'Income & cost' },
  { key: 'holdings', label: 'Holdings' },
  { key: 'outlook', label: 'Outlook' },
  { key: 'notices', label: 'Notices' },
];

/**
 * A short name for each thing the engine can complain about.
 *
 * The messages are written to be read on their own, which makes them
 * paragraphs; a list of paragraphs is not a list you can scan. The title is
 * what you read to decide whether to read the rest, and it is deliberately the
 * *subject*, not the severity — "Prices rescaled", not "Warning".
 *
 * An unknown code falls back to the code itself rather than to something
 * reassuring. CLAUDE.md rule 4 in a different costume: a notice nobody has
 * classified must look unclassified.
 */
const NOTE_TITLES = {
  'reconciliation-failed': 'Total does not match DEGIRO',
  'position-mismatch': 'A position disagrees with DEGIRO',
  'price-series-mismatch': 'Price history does not fit the trades',
  'price-scale-adjusted': 'Prices rescaled',
  'no-price-series': 'Instruments with no price history',
  'suspected-split': 'Possible share split',
  'implausible-history': 'The reconstructed history looks wrong',
  'unclassified-cash-rows': 'Cash movements nobody has classified',
  'contract-size-unresolved': 'Contract size could not be measured',
  'contract-size-unanchored': 'Contract size estimated, not measured',
  'fx-derived': 'Exchange rates derived from your own trades',
  'fx-stale': 'An exchange rate is out of date',
  'fx-unknown': 'A currency has no rate at all',
  'cash-fund-outstanding': 'Money-market fund units still held',
  'no-data': 'Nothing to reconstruct yet',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Three is the readable limit for grouped bars, and for telling hues apart. */
const MAX_COMPARE = 3;

/** Specific months are one bar each, so a fourth still reads cleanly. */
const MAX_COMPARE_CELLS = 4;

const $ = (sel) => document.querySelector(sel);

/** Hide the shared tooltip from outside `wireTips` — the header drag needs to
 *  (US-93). Assigned inside `wireTips`; a no-op until then. Declared up here,
 *  above the `init()` call, because `wireTips` runs during boot — declared
 *  beside it, the assignment threw in the temporal dead zone and took the page
 *  down. Third TDZ defect in this file; the `fx-stale` comment records the
 *  first two. */
let hideTip = () => {};

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

init().catch(showFatal);

/**
 * One entry point for the section, so a click, a reload and a pasted link all
 * arrive the same way. Set before `init()` finishes so the first render already
 * knows which section it is drawing.
 */
state.tab = routeFromHash();
window.addEventListener('hashchange', applyRoute);

async function init() {
  buildControls();
  wireActions();
  installErrorCapture();
  applyTheme();
  // The attribute matters beyond styling: it is what a screen reader and the
  // browser's own translation prompt read.
  document.documentElement.lang = getLang();
  applyStatic();
  // After applyStatic, never before: it rewrites the text of every element
  // carrying data-i18n, and the panel titles do — an earlier call appended the
  // ? toggles and had them deleted a line later. Same trap as the broker mark.
  foldHints();
  buildLangControl();
  buildThemeControl();
  applyAnonymize();
  buildAnonControl();
  wireTips();
  // US-56. One delegated listener for the whole page: a control added next year
  // inherits the behaviour because it is a button, not because somebody
  // remembered to wire it.
  wirePressFeedback();
  onThemeChange(() => render());

  // Optimism Mode. Never restored from storage: a joke you turned on in March
  // must not still be on in June when you are trying to read the thing.
  $('#frown-toggle').addEventListener('click', (e) => {
    const now = frown.setFrown(!frown.isOn());
    e.currentTarget.setAttribute('aria-pressed', String(now));
    e.currentTarget.classList.toggle('on', now);
    render();
  });
  // Not awaited: the footer is the last thing anyone reads, and a manifest
  // fetch must not hold up the charts. It re-renders when it lands.
  if (!inExtension || wantsDemo()) loadDemoVersion().then(() => render());

  if (inExtension && !wantsDemo()) {
    // If a sync is already running (the worker starts one when a DEGIRO tab
    // loads), say so instead of showing an empty page.
    try {
      const st = await send({ type: 'status' });
      state.steps = st.steps ?? [];
      if (st.syncing) notice('info', `A sync is already running: ${st.syncState?.message ?? '…'}`);
      else if (st.lastError) {
        notice('error', `Last sync failed: ${st.lastError.message ?? st.lastError.reason}`);
        notice('info', 'Press “Check connection” to see which step broke.');
      }
    } catch {
      notice('error', 'The extension’s background worker did not respond. Try reloading the extension in chrome://extensions.');
    }
  }

  await refresh();
}

async function refresh() {
  $('#subtitle').textContent = tr('Loading…');
  try {
    state.data = await load();
  } catch (err) {
    return showFatal(err);
  }
  render();
  /**
   * US-75. Once, when data has actually arrived — not on a range change, not on
   * a tab switch, not on a theme flip. All three of those call `render()` and
   * none of them is news; a page that flourishes every time you press 3M is a
   * page you stop reading.
   *
   * After the render, so the cards exist to be revealed, and on a frame of its
   * own so the reveal starts from a laid-out page rather than from mid-layout.
   */
  requestAnimationFrame(() => revealOnArrival());
}

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------

/**
 * Light / Dark / Auto.
 *
 * Three buttons rather than one that toggles, because "auto" is a real state
 * and a two-way switch cannot express it: a reader whose machine flips at
 * sunset would have to give that up to state a preference once.
 *
 * Changing it re-renders. Chart.js is handed resolved colours rather than CSS
 * variables, so a chart already on screen keeps the old theme's palette until
 * it is rebuilt — which is the same reason `onThemeChange` exists for the OS.
 */
/**
 * English or Dutch, as a flag and a code.
 *
 * Changing it re-renders rather than reloads: every visible string is produced
 * either by `applyStatic` over the markup or by `tr()` inside a render, so one
 * pass rebuilds the page. The choice is stored the same way the theme is.
 */
function buildLangControl() {
  const group = $('#lang-group');
  if (!group) return;
  group.innerHTML = '';
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'flag';
    b.textContent = `${l.flag} ${l.code.toUpperCase()}`;
    b.title = l.label;
    b.setAttribute('aria-pressed', String(l.code === getLang()));
    b.addEventListener('click', () => {
      setLang(l.code);
      for (const other of group.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      retranslate();
    });
    group.append(b);
  }
}

/**
 * Re-label everything that is built once and then left alone.
 *
 * The static markup is easy — `applyStatic` walks it. The trap is the controls
 * assembled in JavaScript at boot: the tab bar, the theme buttons, the range
 * and granularity groups. They render their own text once and never look at it
 * again, so the first version of this switched to Dutch and left the tabs in
 * English. Anything whose label is written by code has to be told.
 */
function retranslate() {
  applyStatic();
  // After applyStatic, never before: it rewrites the text of every element
  // carrying data-i18n, and the panel titles do — an earlier call appended the
  // ? toggles and had them deleted a line later. Same trap as the broker mark.
  foldHints();
  for (const b of $('#tabs').querySelectorAll('button')) {
    const tab = TABS.find((x) => x.key === b.dataset.tab);
    const count = b.querySelector('.count');
    if (tab) b.firstChild.textContent = tr(tab.label);
    if (count) b.append(count);
  }
  for (const b of $('#theme-group').querySelectorAll('button')) {
    b.textContent = tr(b.dataset.key === 'auto' ? 'Auto' : b.dataset.key === 'light' ? 'Light' : 'Dark');
  }
  paintDiagLabel();
  // Segmented controls cache a signature to avoid rebuilding on every render;
  // the label text just changed underneath them.
  for (const host of document.querySelectorAll('[data-sig]')) delete host.dataset.sig;
  render();
}

function buildThemeControl() {
  const group = $('#theme-group');
  if (!group) return;
  group.innerHTML = `<span class="glabel">${esc(tr('Theme'))}</span>`;
  for (const key of THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = key;
    b.textContent = tr(key === 'auto' ? 'Auto' : key === 'light' ? 'Light' : 'Dark');
    b.setAttribute('aria-pressed', String(key === getTheme()));
    b.addEventListener('click', () => {
      setTheme(key);
      for (const other of group.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      render();
    });
    group.append(b);
  }
}

/**
 * US-46. One button. Everything downstream of it is already handled by the
 * formatters, so this re-renders and does nothing else — it deliberately does
 * not touch the data, the store or the engine. A display preference that
 * reaches the computation path is rule 1's failure, and there would be no way
 * back off it without a resync.
 */
function buildAnonControl() {
  const b = $('#btn-anon');
  if (!b) return;
  const paint = () => {
    const on = getAnonymize();
    b.setAttribute('aria-pressed', String(on));
    /**
     * The words go on the label rather than into the button, because the button
     * is an icon now: the slashed eye states the state, and writing text into it
     * would replace the SVG. The accessible name still says which way the
     * control will go, which is the thing `aria-pressed` alone does not.
     */
    const label = tr(on ? 'Show amounts' : 'Hide amounts');
    b.setAttribute('aria-label', label);
    b.title = label;
  };
  paint();
  b.addEventListener('click', () => {
    setAnonymize(!getAnonymize());
    paint();
    render();
  });
}

/**
 * The window the holdings table was last drawn for, and the result behind it.
 *
 * A click handler cannot re-derive this: `from` and `to` are *indices* into
 * `r.days`, chosen by the range control, and the handler fires long after
 * `render()` returned. Kept as one object so the two can never come from
 * different renders.
 */
let lastWindow = null;

/**
 * The running total of a window's daily P/L — the sparkline's shape.
 *
 * Cumulative rather than per-day: a day-by-day series of a volatile holding is
 * noise, and what a card claims is the journey, not the jitter.
 */
function cumulativeWindow(pnl, from, to) {
  const out = [];
  let acc = 0;
  for (let i = Math.max(0, from); i <= to && i < (pnl?.length ?? 0); i++) {
    acc += pnl[i] ?? 0;
    out.push(acc);
  }
  return out;
}

/**
 * US-47. One delegated listener for the whole table, wired once.
 *
 * Delegated because `renderHoldings` rebuilds its `<tbody>` on every render, and
 * a listener bound to a row that no longer exists is the kind of leak that only
 * shows up after an hour of clicking around.
 */
function wireSnapshots() {
  const table = $('#holdings');
  if (table && !table.dataset.snapWired) {
    table.dataset.snapWired = '1';
    table.addEventListener('click', (e) => {
      const btn = e.target.closest?.('button[data-snap]');
      if (btn) openShareSheet(btn.dataset.snap);
    });
  }

  // US-54's block button, delegated for the same reason: `#tiles` is rebuilt on
  // every render and every tab change.
  const tiles = $('#tiles');
  if (tiles && !tiles.dataset.snapWired) {
    tiles.dataset.snapWired = '1';
    tiles.addEventListener('click', (e) => {
      const btn = e.target.closest?.('button[data-score]');
      if (btn) openScoreSheet(btn.dataset.score);
    });
  }
}

/**
 * The card's model for whatever the sheet is currently set to.
 *
 * One function so the preview, the clipboard and the file can never disagree
 * about what they are showing — the bug this shape prevents is a preview drawn
 * from the sheet's settings and a download drawn from the page's.
 *
 * Returns `null` when the position is not in the last render's window, which is
 * possible: the sheet holds a `productId` across renders and the range control
 * can move underneath it.
 */
function shareModel() {
  const w = lastWindow;
  const r = w?.result;
  const p = r?.byProduct?.find((x) => String(x.productId) === String(state.share.productId));
  if (!p) return null;

  /**
   * US-50. The arrays and the window, and nothing worked out here.
   *
   * The old version of this call computed the result over the selected window
   * and the money-in over all time, then divided one by the other — so a 1Y card
   * on a six-year position reported a percentage measured over two different
   * spans. Handing the arrays to `snapshotModel` moves the clipping into the pure
   * module where it is tested, and leaves this function with no arithmetic left
   * to get wrong.
   */
  if (!positionSpan(p.qty, w.from, w.to)) return null;

  return snapshotModel({
    name: p.name,
    symbol: p.symbol,
    days: r.days,
    qty: p.qty,
    pnl: p.pnl,
    paidIn: p.paidIn,
    // US-94: the all-time flow scalars, so a closed position's card can draw
    // what came out against what went in — same model as the table row.
    bought: p.bought,
    sold: p.sold,
    dividend: p.dividend,
    window: { from: w.from, to: w.to },
    /**
     * The sheet's own switch, not the page's. `getAnonymize()` decides what is on
     * screen; a card is a different audience, and the sheet defaults to hiding
     * the amount whichever way the page is set.
     */
    anonymized: !state.share.amounts,
    owner: ownerLine({
      source: state.share.nameSource,
      fullName: state.data?.accountName ?? '',
      username: state.data?.accountName ?? '',
      handle: state.share.handle,
    }),
    // Tri-state, deliberately. An account with nothing to reconcile against
    // reports `null`, which the card renders as "not checked" and never as
    // a pass. A clean badge on an unverified figure is the failure this
    // whole line exists to prevent.
    reconciled: r.reconciliation ? r.reconciliation.ok === true : null,
    // The freshness of the data, which is the last day the page has — not the
    // last day this position existed. Those differ for a closed position, and
    // "as of" is a claim about the sync, not about the holding.
    asOf: r.days[w.to] ?? null,
    version: inExtension ? chrome.runtime.getManifest().version : demoVersion,
  });
}

/**
 * US-54. The score card's model for whatever the sheet is set to.
 *
 * Three things worth stating, because each is a way this could have gone wrong:
 *
 * **It rebuilds the tiles rather than reading the page.** The sheet's amount
 * toggle is independent of the page's — a card is a different audience, and it
 * defaults to hidden — so the figure has to be obtainable at the *sheet's*
 * setting. `withAnonymize` asks the formatters again with the mask flipped, and
 * the tile's `value` and `note` come back masked or not accordingly. Nothing
 * here formats anything, so US-46 is inherited rather than re-implemented.
 *
 * **It reads `buildTiles`, never the rendered ones.** With Optimism Mode on the
 * page shows joke figures, and a share button that grabbed what is on screen
 * would put "847 days of unwavering belief" on a card that also carries a
 * reconciliation verdict — a gag wearing a trust badge. `buildTiles` has never
 * heard of the cheerful list, so this is structural rather than a promise.
 *
 * **The period is the window's, and it is stated.** A score card can be the
 * account's headline number, so *which* period it is a headline for is not
 * decoration.
 */
function scoreModel() {
  const w = lastWindow;
  const r = w?.result;
  if (!r) return null;

  const tiles = withAnonymize(!state.share.amounts, () => buildTiles(r, w.from, w.to, state.data?.live ?? null));
  const inSection = tiles.filter((t) => t.tabs.includes(state.share.section));
  const tile = inSection.find((t) => t.label === state.share.tileLabel) ?? inSection[0];
  if (!tile) return null;

  return scoreCardModel({
    // The label is translated here and the note is not, and the asymmetry is
    // the truth about where each is built: `buildTiles` composes a note out of
    // figures and phrases and translates it as it goes, while the label is a
    // bare key the page also translates at render. Passing the note through
    // `t()` a second time looked harmless and was not — it fed an already-Dutch
    // string to the dictionary, which counted it as an untranslated one.
    label: tr(tile.label),
    figure: tile.value,
    caption: tile.note || null,
    cls: tile.cls,
    period: { from: r.days[w.from] ?? null, to: r.days[w.to] ?? null },
    owner: ownerLine({
      source: state.share.nameSource,
      fullName: state.data?.accountName ?? '',
      username: state.data?.accountName ?? '',
      handle: state.share.handle,
    }),
    // Tri-state, and it matters more here than on a position card: this can be
    // the account's headline figure, so the verdict is the whole trust claim.
    reconciled: r.reconciliation ? r.reconciliation.ok === true : null,
    asOf: r.days[w.to] ?? null,
    version: inExtension ? chrome.runtime.getManifest().version : demoVersion,
  });
}

/** Which tiles the picker offers: every tile in the section, in the page's order. */
function shareTileChoices() {
  const w = lastWindow;
  if (!w?.result) return [];
  return buildTiles(w.result, w.from, w.to, state.data?.live ?? null)
    .filter((t) => t.tabs.includes(state.share.section))
    .map((t) => ({ key: t.label, label: tr(t.label) }));
}

/** What the sheet's four name options are, and what each one promises. */
const NAME_SOURCES = [
  { key: 'first', label: 'First name' },
  { key: 'username', label: 'Account name' },
  { key: 'handle', label: 'A name I type' },
  { key: 'none', label: 'No name' },
];

/** Redraw the preview from the current settings. Cheap enough to do per click. */
function paintSharePreview() {
  const host = $('#share-preview');
  if (!host) return;
  const score = state.share.kind === 'score';
  const model = score ? scoreModel() : shareModel();
  if (!model) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = tr(score
      ? 'There is no figure to share for this period.'
      : 'This position is not inside the selected period.');
    host.replaceChildren(p);
    return;
  }
  const draw = score ? drawScoreCard : drawSnapshot;
  host.replaceChildren(draw(model, tokensForTheme(state.share.theme), { format: state.share.format }));
}

/** The name row: which sources are offered, and what each one warns about. */
function paintShareName() {
  const sel = $('#share-name');
  const input = $('#share-handle');
  const note = $('#share-name-note');
  if (!sel) return;

  if (sel.dataset.built !== String(getLang())) {
    sel.dataset.built = String(getLang());
    sel.replaceChildren(...NAME_SOURCES.map((s) => {
      const o = document.createElement('option');
      o.value = s.key;
      o.textContent = tr(s.label);
      return o;
    }));
  }
  sel.value = state.share.nameSource;

  input.hidden = state.share.nameSource !== 'handle';
  input.placeholder = tr('Discord name');
  input.value = state.share.handle;

  /**
   * One warning, on one option, and it is the honest one.
   *
   * "Account name" is whatever DEGIRO has on the account, which for a good many
   * people is a real full name rather than a handle — so the option says what it
   * will put on something they are about to post publicly. `first` gets no
   * warning because a first name is what the default already is; `handle` gets
   * none because they typed it themselves.
   */
  const text = state.share.nameSource === 'username'
    ? tr('This is the name DEGIRO has for the account, which may be your full name.')
    : '';
  note.textContent = text;
  note.hidden = !text;
}

/**
 * Open the sheet for one position.
 *
 * Everything about *what* is on the card lives in `shareModel`; this wires the
 * controls once and repaints. `showModal` rather than a fixed overlay: the
 * dialog element already gives a focus trap, Escape and a backdrop, and
 * reimplementing those three badly is how a share sheet ends up unclosable on a
 * phone.
 */
function openShareSheet(productId) {
  state.share.kind = 'position';
  state.share.productId = productId;
  showShareSheet();
}

/**
 * US-54. The same sheet, scoped to a section's figures instead of a position.
 *
 * One button per section rather than one per tile: nineteen figures would be
 * nineteen buttons, and the choice of *which* figure belongs in the sheet beside
 * the preview that shows it, not in the page beside a number.
 */
function openScoreSheet(section) {
  state.share.kind = 'score';
  state.share.section = section;
  // Default to the section's hero, which is the first tile in it — the same
  // ordering the page uses to decide which figure leads the block.
  const first = shareTileChoices()[0];
  if (!state.share.tileLabel || !shareTileChoices().some((c) => c.key === state.share.tileLabel)) {
    state.share.tileLabel = first?.key ?? null;
  }
  // A landscape banner suits a position's sparkline; a single figure reads
  // better square. Only the first time — after that it is whatever was picked.
  if (!state.share.pickedFormat) state.share.format = '1:1';
  showShareSheet();
}

/**
 * US-57 — the sheet as a material.
 *
 * *"Materialize, don't fade."* Blur and scale move together on open, so the
 * sheet reads as a pane of glass arriving rather than a picture becoming
 * opaque; the close runs the same path backwards, which is what makes the two
 * feel like one object rather than two effects.
 *
 * Three things this deliberately does:
 *
 *  - **It reverses from the live state.** Re-opening while it is closing picks
 *    up from where it is on screen — the existing animation is cancelled rather
 *    than queued behind, so nothing jumps and nothing waits.
 *  - **It never leaves the dialog half-shut.** `close()` happens on the
 *    animation's `finished`, and a cancel resolves that promise as a rejection,
 *    which is caught: a cancelled close means somebody re-opened it, and closing
 *    anyway is exactly the wrong answer.
 *  - **It moves nothing on the card.** Content belongs to US-47, US-52 and
 *    US-54; this is the glass, not what is written on it.
 *
 * Under reduced motion it is a short fade with no scale and no blur — the sheet
 * still announces itself, which is comprehension, without the travel. Under
 * reduced transparency the blur drops out and the scale stays, because glass
 * with nothing behind it is only a slow fade.
 *
 * **Every modal, not one.** US-57 gave this to the share sheet and left the
 * diagnostics dialog cutting in, which is the consistency rule broken by the
 * change that was meant to improve things: two surfaces that look identical have
 * to behave identically, or the reader learns nothing from either.
 */
function materialize(dlg, open) {
  if (typeof dlg.animate !== 'function') return Promise.resolve();
  for (const a of dlg.getAnimations()) a.cancel();
  const reduced = prefersReducedMotion();
  const blur = getComputedStyle(dlg).getPropertyValue('--sheet-blur').trim() || '14px';
  const shut = reduced
    ? { opacity: 0 }
    : { opacity: 0, transform: 'scale(0.94)', filter: `blur(${blur})` };
  const shown = reduced
    ? { opacity: 1 }
    : { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' };
  const anim = dlg.animate(open ? [shut, shown] : [shown, shut], {
    duration: reduced ? 120 : 260,
    easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    fill: 'both',
  });
  return anim.finished;
}

/** Open any modal the same way, so two identical-looking surfaces behave alike. */
function openModal(dlg) {
  if (!dlg) return;
  if (!dlg.open) dlg.showModal();
  materialize(dlg, true).catch(() => {});
}

function closeModal(dlg) {
  if (!dlg?.open) return;
  materialize(dlg, false)
    .then(() => dlg.close())
    // Cancelled means somebody re-opened it mid-close. Closing anyway is the
    // one answer that is certainly wrong.
    .catch(() => {});
}

const closeShareSheet = () => closeModal($('#share-sheet'));

function showShareSheet() {
  const dlg = $('#share-sheet');
  if (!dlg) return;
  // Follow the page the first time, then remember what was picked.
  state.share.theme ??= getTheme() === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : getTheme();

  if (!dlg.dataset.wired) {
    dlg.dataset.wired = '1';
    $('#share-handle').addEventListener('input', (e) => {
      state.share.handle = e.target.value;
      paintSharePreview();
    });
    $('#share-name').addEventListener('change', (e) => {
      state.share.nameSource = e.target.value;
      paintShareName();
      paintSharePreview();
    });
    $('#share-tile').addEventListener('change', (e) => {
      state.share.tileLabel = e.target.value;
      paintSharePreview();
    });
    $('#btn-share-close').addEventListener('click', closeShareSheet);
    // Escape and the backdrop both go through the same path, so there is one
    // way out and it looks the same however it was taken.
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeShareSheet();
    });
    $('#btn-share-copy').addEventListener('click', () => runShare(copySnapshot, tr('Image copied. Paste it wherever you like.')));
    $('#btn-share-download').addEventListener('click', () => runShare(downloadSnapshot, tr('Image saved.')));
  }

  $('#share-title').textContent = tr(state.share.kind === 'score' ? 'Share this figure' : 'Share this position');
  /**
   * US-78 AC4: **open first, then paint.** A closed `<dialog>` is
   * `display: none`, so every `offsetLeft`, `offsetWidth` and `clientWidth`
   * inside it is 0 — and the shape strip decides how far to slide from exactly
   * those. Painting first is why the sheet used to open with the chosen shape off
   * screen: the pitch measured 0, so the slide was 0, whatever was chosen.
   */
  openModal(dlg);
  paintShareTile();
  paintShareControls();
  paintShareName();
  paintSharePreview();
}

/**
 * The tile picker. Present only on a score card, because a position card has
 * exactly one subject and a select with one option is a control that lies about
 * having a choice.
 */
function paintShareTile() {
  const field = $('#share-tile-field');
  const sel = $('#share-tile');
  if (!field || !sel) return;
  const score = state.share.kind === 'score';
  field.hidden = !score;
  if (!score) return;

  const choices = shareTileChoices();
  sel.replaceChildren(...choices.map((c) => {
    const o = document.createElement('option');
    o.value = c.key;
    o.textContent = c.label;
    return o;
  }));
  sel.value = state.share.tileLabel ?? choices[0]?.key ?? '';
}

/**
 * US-57, corrected by US-78 — the shapes as a strip you can slide, not five words.
 *
 * Each shape draws itself at its own aspect ratio, so the control shows what it
 * is choosing rather than naming it, and a flick throws it with the same
 * momentum projection the value chart uses. Same vocabulary, one module
 * (`motion.js`), because two springs with different feels on one page read as
 * two products.
 *
 * They stay `<button>`s in a `role="group"`. The drag is an addition on top of a
 * control that is already reachable by Tab and Enter — a shape picker that needs
 * a pointer is a shape picker some readers cannot use, and the gesture is
 * exactly the sort of thing that quietly replaces the accessible path.
 *
 * **What US-78 changed, and why the first version was wrong.** The strip was four
 * items long inside a window two items wide, with nothing on screen saying so: a
 * 15rem column minus its padding is 234 px over a 114 px pitch. Half the control
 * had never been visible, and four separate rules made it worse — the chosen item
 * was slid to the *front*, which for the last item scrolled the track past its
 * own end; the drag had no bounds at all, so the strip could be pulled empty; the
 * first paint measured a `<dialog>` that was still `display: none`, so the pitch
 * came back 0 and the default shape was aligned off screen; and the pointer
 * capture taken on `pointerdown` retargeted the click that followed, so **tapping
 * a shape did not select it** — only a flick did, which is how that one survived
 * a browser pass.
 *
 * Three rules replace them:
 *
 *  1. **Three per window, by construction.** The item width is a third of the
 *     window in CSS, so three shapes are complete at any width the sheet has —
 *     nothing is measured against a hard-coded 6.5rem that stops being a third
 *     when the column changes.
 *  2. **The chosen shape is brought *into* the window, not to its front**, and
 *     the shift is clamped to the track, so there is no position from which the
 *     strip shows a void. A drag past either end rubber-bands through
 *     `motion.js` and settles back.
 *  3. **A drag browses; a click chooses.** They are different questions — "which
 *     shapes are there" and "this one" — and answering both with one gesture is
 *     what made the last shapes unreachable once the shift was clamped. The two
 *     chevrons page the window for the same reason, and carry no `aria-pressed`:
 *     they are navigation, and a reader told there are seven shapes has been
 *     lied to.
 */
const stripX = new Spring(0, { response: 0.4, damping: 0.9, restDistance: 0.4 });

/** The pitch between two items, measured rather than assumed from the CSS. */
const stepOf = (track) => {
  const [a, b] = track.children;
  return b ? b.offsetLeft - a.offsetLeft : 0;
};

/**
 * How far the track may be shifted left before it runs out of items.
 *
 * `scrollWidth` rather than a count times the pitch: the last item has no gap
 * after it, and paying for that gap in the clamp is a strip that stops one gap
 * short of its own end and shows a sliver of nothing.
 */
const shiftRangeOf = (window_, track) => {
  const windowW = window_.clientWidth;
  return { windowW, max: Math.max(0, track.scrollWidth - windowW) };
};

function paintShareFormats() {
  const host = $('#share-format');
  if (!host) return;

  if (host.dataset.built !== 'strip') {
    host.dataset.built = 'strip';
    host.classList.add('fmt-strip');
    host.innerHTML = '';

    const pager = (dir, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fmt-page';
      b.dataset.dir = String(dir);
      b.setAttribute('aria-label', tr(label));
      // The glyph is decoration; the label above it is what is read out.
      b.innerHTML = `<span aria-hidden="true">${dir < 0 ? '‹' : '›'}</span>`;
      return b;
    };

    const window_ = document.createElement('div');
    window_.className = 'fmt-window';
    const track = document.createElement('div');
    track.className = 'fmt-track';
    for (const f of FORMATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fmt';
      b.dataset.fmt = f.id;
      // The proportions of the actual format, drawn at a fixed long edge, so the
      // five are comparable at a glance and a sixth needs no code here.
      const long = 30;
      const w = (f.w >= f.h ? long : (long * f.w) / f.h);
      const h = (f.h >= f.w ? long : (long * f.h) / f.w);
      b.innerHTML = `<span class="fmt-shape" style="width:${w}px;height:${h}px"></span><span>${esc(f.id)}</span>`;
      track.append(b);
    }
    window_.append(track);
    // The chevrons sit outside the window, one before the shapes and one after,
    // so neither of them lands between two shapes in the tab order.
    host.append(pager(-1, 'Earlier shapes'), window_, pager(1, 'Later shapes'));
    stripX.onUpdate = (v) => {
      track.style.transform = `translateX(${v}px)`;
      paintPagers(host, window_, track, v);
    };
    wireFormatStrip(host, window_, track);
  }

  const window_ = host.querySelector('.fmt-window');
  const track = host.querySelector('.fmt-track');
  const items = [...track.children];
  items.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmt === state.share.format)));
  const index = Math.max(0, FORMATS.findIndex((f) => f.id === state.share.format));
  bringIntoView(window_, track, items[index]);
  // Not only from `onUpdate`: a strip that is already where it belongs never
  // ticks, and the chevrons would keep whatever they said last time.
  paintPagers(host, window_, track);
}

/**
 * A chevron is shown only when there is something past that edge.
 *
 * Shown, not present: the two keep their space whatever they say, because the
 * item width is a share of the window, so a chevron that came and went would
 * resize every shape in the strip as you paged it. `disabled` plus `aria-hidden`
 * is what takes them out of the tab order and out of the accessibility tree while
 * they have nothing to do.
 */
function paintPagers(host, window_, track, x = stripX.x) {
  const { max } = shiftRangeOf(window_, track);
  for (const b of host.querySelectorAll('.fmt-page')) {
    const dir = Number(b.dataset.dir);
    const more = dir < 0 ? x < -0.5 : x > -max + 0.5;
    b.disabled = !more;
    b.setAttribute('aria-hidden', String(!more));
  }
}

/**
 * Slide the least that makes `item` completely visible.
 *
 * The least, rather than aligning it to an edge: a control that jumps a whole
 * page when the chosen shape was already on screen has moved for no reason the
 * reader can see. This is also the path that fixes the first open — it is called
 * after the dialog is open, so the measurements are real rather than the zeroes a
 * `display: none` dialog returns.
 */
function bringIntoView(window_, track, item) {
  if (!item) return;
  const { windowW, max } = shiftRangeOf(window_, track);
  const x = shiftToShow(stripX.x, {
    left: item.offsetLeft - track.children[0].offsetLeft,
    width: item.offsetWidth,
    windowW,
    max,
  });
  if (prefersReducedMotion()) stripX.snap(x);
  else stripX.set(x);
}

function wireFormatStrip(host, window_, track) {
  const pick = (id) => {
    state.share.format = id;
    // Once a shape has been chosen it stops being overridden by the per-kind
    // default — a control that resets itself is a control the reader fights.
    state.share.pickedFormat = true;
    paintShareControls();
    paintSharePreview();
  };

  let trail = [];
  let dragging = false;
  let capturedId = null;
  let from = 0;
  let travelPx = 0;

  /** Land on an item boundary, inside the track, at the end of a gesture. */
  const settle = (x) => {
    const { max } = shiftRangeOf(window_, track);
    const step = stepOf(track) || 1;
    const snapped = -Math.round(-clampShift(x, max) / step) * step;
    stripX.set(clampShift(snapped, max));
  };

  host.addEventListener('pointerdown', (e) => {
    // The chevrons are buttons on top of the strip, not a place to start a drag.
    if (e.target.closest('.fmt-page')) return;
    // Interruptible: taking hold stops the spring where it is, so the strip
    // follows from its on-screen position rather than snapping to its target.
    stripX.stop();
    dragging = true;
    from = e.clientX;
    travelPx = 0;
    trail = [{ v: stripX.x, t: performance.now() }];
  });

  host.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // US-78 AC6: how far the pointer *is* from where it went down, not how far
    // it has travelled in total. US-66 settled this for the chart: a wobble back
    // and forth accumulates travel while the hand has not gone anywhere.
    travelPx = Math.abs(e.clientX - from);
    /**
     * Capture only once this is a drag, and this is not a detail.
     *
     * A captured pointer retargets the `click` that follows to the capturing
     * element — so with the capture taken on `pointerdown`, as it was in 0.47.0,
     * the click never reached the shape and **tapping a shape did not select
     * it**. Only a flick did, because the flick picked on release, which is how
     * this survived a browser pass. Taking the capture at the threshold makes a
     * tap an ordinary click on a button, and a drag still keeps following a
     * finger that has left the strip.
     */
    if (travelPx >= GESTURE.dragThresholdPx && capturedId === null) {
      capturedId = e.pointerId;
      host.setPointerCapture(e.pointerId);
    }
    const { windowW, max } = shiftRangeOf(window_, track);
    const raw = stripX.x + e.movementX;
    // Past an edge the strip keeps moving, ever more slowly — the same
    // resistance the value chart uses at the ends of the history.
    if (raw > 0) stripX.snap(rubber(raw, windowW));
    else if (raw < -max) stripX.snap(-max - rubber(-max - raw, windowW));
    else stripX.snap(raw);
    trail.push({ v: stripX.x, t: performance.now() });
    if (trail.length > 8) trail.shift();
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (capturedId !== null) {
      host.releasePointerCapture(capturedId);
      capturedId = null;
    }
    if (travelPx < GESTURE.dragThresholdPx) {
      // A press that never really moved is a click, and the click handler has
      // it. The strip may still be off a boundary if the press interrupted a
      // settle, so it is put back either way.
      settle(stripX.x);
      return;
    }
    trail.push({ v: stripX.x, t: performance.now() });
    settle(stripX.x + (prefersReducedMotion() ? 0 : project(velocityFrom(trail))));
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);

  /**
   * A click chooses; a drag does not.
   *
   * Delegated on the host rather than one listener per shape, so the drag it has
   * to distinguish itself from is in the same closure — and on the host rather
   * than the track, because a click that follows a captured pointer arrives
   * there. A pointer that moved past the threshold is a browse, and the click
   * the browser sends after it is discarded: sliding the strip to see what is
   * there must not re-shape the card.
   */
  host.addEventListener('click', (e) => {
    const item = e.target.closest?.('.fmt');
    if (!item || travelPx >= GESTURE.dragThresholdPx) return;
    pick(item.dataset.fmt);
  });

  for (const b of host.querySelectorAll('.fmt-page')) {
    b.addEventListener('click', () => {
      const { windowW, max } = shiftRangeOf(window_, track);
      settle(clampShift(stripX.x - Number(b.dataset.dir) * windowW, max));
    });
  }

  /**
   * Tabbing to a shape brings it into the window.
   *
   * Without this the strip would be a hole rather than a control for anyone using
   * a keyboard: the shapes past the window are still in the tab order, so focus
   * would land on something invisible. The strip slides rather than the item
   * being selected — arriving somewhere is not the same as choosing it, and Enter
   * is still what picks.
   *
   * A transform cannot be scrolled into view, which is why the browser's own
   * `scrollIntoView` does not cover this: there is no scroll position to move.
   */
  host.addEventListener('focusin', (e) => {
    const item = e.target.closest?.('.fmt');
    if (item) bringIntoView(window_, track, item);
  });
}

/** The three segmented controls, rebuilt whenever one of them changes. */
function paintShareControls() {
  paintShareFormats();
  buildChoice('#share-theme', [{ key: 'light', label: tr('Light') }, { key: 'dark', label: tr('Dark') }],
    () => state.share.theme, (k) => { state.share.theme = k; paintShareControls(); paintSharePreview(); });
  buildChoice('#share-amounts', [{ key: 'off', label: tr('Hidden') }, { key: 'on', label: tr('Shown') }],
    () => (state.share.amounts ? 'on' : 'off'),
    (k) => { state.share.amounts = k === 'on'; paintShareControls(); paintSharePreview(); });
}

/**
 * Run one of the two exports and report what happened.
 *
 * Both can fail for reasons the reader can act on — a clipboard needs a focused
 * document, a download can be blocked — so neither is allowed to fail silently,
 * and the sheet stays open either way so a second attempt costs one click.
 */
async function runShare(fn, okText) {
  const score = state.share.kind === 'score';
  const model = score ? scoreModel() : shareModel();
  if (!model) return;
  // `kind` rather than letting the drawer sniff the model: a card that guesses
  // its layout from which keys are present is one renamed field from drawing
  // the wrong one, and this is the path that reaches the clipboard.
  const out = await fn(model, {
    format: state.share.format,
    theme: state.share.theme,
    kind: score ? 'score' : 'position',
  });
  if (out.ok) notice('ok', okText);
  else notice('error', `${tr('Could not export the image')}: ${out.error}`);
}

/**
 * US-48. The mark behind each card.
 *
 * A DOM child rather than a CSS `background-image`, so it rides `currentColor`
 * and `--brand-accent` like every other placement — one geometry, no data URI
 * with a colour baked into it, and no second copy to keep in step. Charts get
 * theirs from a Chart.js plugin instead, because a CSS layer behind a canvas is
 * absent from any image the canvas produces.
 */
function placeWatermarks() {
  for (const card of document.querySelectorAll('.card')) {
    if (card.querySelector(':scope > .card-watermark')) continue;
    const mark = markSvg({ height: 18 });
    mark.classList.add('card-watermark');
    card.prepend(mark);
  }
}

function buildControls() {
  const rangeGroup = $('#range-group');
  for (const r of RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r;
    b.setAttribute('aria-pressed', String(r === state.range));
    b.addEventListener('click', () => {
      state.range = r;
      for (const other of rangeGroup.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      render();
    });
    rangeGroup.append(b);
  }

  const granGroup = $('#gran-group');
  for (const g of [{ key: 'auto', label: 'Auto' }, ...GRANS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = g.label;
    b.dataset.key = g.key;
    b.setAttribute('aria-pressed', String(g.key === state.granularity));
    b.addEventListener('click', () => {
      state.granularity = g.key;
      // Choosing a granularity by hand retires the note explaining that the
      // candle toggle chose one for you.
      state.granularityForcedByCandles = false;
      for (const other of granGroup.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      render();
    });
    granGroup.append(b);
  }

  $('#toggle-cash').addEventListener('change', (e) => {
    state.includeCash = e.target.checked;
    render();
  });

  // Euros or percent, for the month grid and the comparison.
  const metricGroup = $('#metric-group');
  for (const m of [
    { key: 'pnl', label: 'Euro' },
    { key: 'returnPct', label: 'Return %' },
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.label;
    b.setAttribute('aria-pressed', String(m.key === state.metric));
    b.addEventListener('click', () => {
      state.metric = m.key;
      for (const other of metricGroup.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      render();
    });
    metricGroup.append(b);
  }

  const cumGroup = $('#cum-view');
  for (const v of [
    { key: 'line', label: 'Line' },
    { key: 'candles', label: 'Candles' },
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = v.label;
    b.dataset.key = v.key;
    b.setAttribute('aria-pressed', String(v.key === state.cumulativeView));
    b.addEventListener('click', () => {
      state.cumulativeView = v.key;
      // A day has one number, so a daily candle is a flat dash. This used to be
      // handled by disabling the button — which was reported as "the candles
      // don't work", and fairly: a disabled button catches no hover in most
      // browsers, so it cannot explain itself at the place you clicked. It
      // stays clickable and does the obvious thing instead. Someone pressing
      // Candles wants candles; the granularity is the means, not the request.
      if (v.key === 'candles' && state.lastGranularity === 'day') {
        state.granularity = 'week';
        state.granularityForcedByCandles = true;
        for (const gb of $('#gran-group').querySelectorAll('button')) {
          gb.setAttribute('aria-pressed', String(gb.dataset.key === 'week'));
        }
      }
      render();
    });
    cumGroup.append(b);
  }

  const holdingsGroup = $('#holdings-view');
  for (const v of [
    { key: 'table', label: 'Table' },
    { key: 'share', label: 'Share' },
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = v.label;
    b.setAttribute('aria-pressed', String(v.key === state.holdingsView));
    b.addEventListener('click', () => {
      state.holdingsView = v.key;
      for (const other of holdingsGroup.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      render();
    });
    holdingsGroup.append(b);
  }

  /**
   * The rail.
   *
   * Three changes from the tab row it replaces, each from the brief:
   *
   *  - **No count badges.** They counted cards — `OVERVIEW 2 · PERFORMANCE 7` —
   *    and every reader read them as unread counts.
   *  - **`aria-current` rather than `aria-pressed`.** These navigate, so a
   *    screen reader should hear "current page", not a toggle that is down.
   *  - **The section is in the URL.** A reload, a bookmark or a pasted link
   *    lands where you were instead of on Overview; it also means the browser's
   *    back button does what it looks like it does.
   */
  const railNav = $('#tabs');
  for (const t of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tab = t.key;
    b.textContent = tr(t.label);
    b.addEventListener('click', () => {
      // Writing the hash is the whole of it — `hashchange` does the render, so
      // a click and a pasted URL take exactly one path.
      location.hash = `#/${t.key}`;
    });
    railNav.append(b);
  }
  $('#lockup').replaceChildren(lockupSvg({ height: 26 }));
  /**
   * The connection check names the broker it would check, read off the adapter's
   * own `label`. With one adapter that is one line and no submenu — a submenu of
   * one is depth for nothing — and with two it is two lines without a change
   * here, because nothing about the broker is written in this file.
   */
  paintDiagLabel();
  wireMore();
  wireGran();

  $('#btn-clear-months').addEventListener('click', () => {
    state.selectedMonths = [];
    state.selectedCells = [];
    render();
  });
}

/**
 * A chart that does not start at zero admits it.
 *
 * Brief §4 calls this the oldest trick in the book, and the fix is not to force
 * every axis to zero — over a three-month window on a €116k account, a zero
 * baseline compresses the whole movement into the top two per cent of the panel
 * and shows nothing. So the axis is allowed to zoom, and the panel says it did.
 *
 * The threshold is Chart.js's own resolved scale rather than a guess about the
 * data: measured over the demo fixtures, ALL resolves to 0 → 120 000 and 3M to
 * 102 000 → 118 000, so the note appears on exactly the windows where the
 * baseline is not zero.
 */
function noteBaseline(sel, chart, r, from) {
  const el = $(sel);
  if (!el) return;
  const min = chart?.scales?.y?.min ?? 0;
  const zoomed = min > 0.5;
  el.hidden = !zoomed;
  if (!zoomed) return;
  /**
   * While amounts are hidden the warning stays and the level goes.
   *
   * `fmtEurCents(min)` would render "the axis starts at € •••", which reads as a
   * bug rather than as privacy, and hiding the note altogether would drop the
   * one honest thing on the chart: that the line is a close-up. So the masked
   * variant is the same sentence with the number taken out — its own string
   * rather than a substitution, because a sentence with a hole in it does not
   * translate.
   */
  el.textContent = getAnonymize()
    ? tr('The vertical axis does not start at zero — this window does not contain the start of the account, so the line is a close-up rather than the whole level.')
    : tr(
      'The vertical axis starts at {min}, not at zero — this window does not contain the start of the account, so the line is a close-up rather than the whole level.',
      { min: fmtEurCents(min) },
    );
}

/**
 * Which window the figures belong to, in words and in dates.
 *
 * "There is no such thing as an unlabelled number here" is brief §4's rule, and
 * this is the cheapest honest way to keep it: one line, above everything the
 * control governs, naming the range and the two dates it resolved to. A reader
 * who takes a screenshot of a 3-month result now ships the period with it.
 *
 * It also carries the refusal. Fewer than three points cannot make a line, and
 * the honest response is to say the source's resolution rather than to draw
 * something suggestive through two dots.
 */
function renderWindowCrumb(r, from, to) {
  const el = $('#window-crumb');
  if (!el) return;
  const label = state.range === 'ALL' ? tr('whole history') : tr(RANGE_WORDS[state.range] ?? state.range);
  const points = to - from + 1;
  if (points < 3) {
    el.className = 'window-crumb thin';
    el.textContent = tr(
      'Too short to draw: {n} data point(s) in this window. The source is one value per day, so pick a longer period.',
      { n: points },
    );
    return;
  }
  el.className = 'window-crumb';
  el.textContent = `${label} · ${r.days[from]} → ${r.days[to]}`;
}

/**
 * Every permanent hint paragraph, one click away.
 *
 * The copy is good — that was the problem. Each card carried an explanatory
 * paragraph *and* an (i) per figure *and* a footnote, which is prose doing the
 * job hierarchy should do. So the words are not shortened and not deleted: the
 * paragraph keeps its text verbatim and its id, and a `?` beside the panel title
 * shows it.
 *
 * Runs once, over whatever is in the document — the hints are static markup, so
 * there is nothing to re-run on render.
 */
function foldHints() {
  for (const hint of document.querySelectorAll('.card > p.hint, .card-head p.hint')) {
    const head = hint.closest('.card')?.querySelector('h2');
    /**
     * Empty at load means the code fills it — `products-note` counts rows,
     * `tx-hint` counts transactions. Those are live status lines, not
     * explanations, and folding one gave the positions panel a second `?` that
     * hid its own row count.
     */
    if (!head || hint.dataset.folded || !hint.textContent.trim()) continue;
    hint.dataset.folded = '1';
    hint.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hint-toggle';
    btn.textContent = '?';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', tr('What this means'));
    btn.addEventListener('click', () => {
      const open = hint.hidden;
      hint.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    head.append(btn);
  }
}

/**
 * The connection check's label, which names the broker.
 *
 * A function rather than a line at wire time because it has to be rebuilt when
 * the language changes: `applyStatic()` rewrites the text of everything carrying
 * `data-i18n`, which is why this button does not carry it — the first version
 * did, and the broker mark was replaced by plain text the moment anyone pressed
 * NL.
 */
function paintDiagLabel() {
  const diag = $('#btn-diagnose');
  if (!diag) return;
  diag.textContent = '';
  for (const a of ADAPTERS) {
    const mark = brokerMarkSvg(a.id, { size: 15 });
    if (mark) diag.append(mark);
  }
  diag.append(
    document.createTextNode(
      ADAPTERS.length === 1
        ? tr('Check connection · {broker}', { broker: ADAPTERS[0].label })
        : tr('Check connection'),
    ),
  );
}

/**
 * The section in the URL.
 *
 * A hash rather than a path because this page is opened from a file:// or
 * chrome-extension:// origin with no server to route for us — a real path would
 * 404 on reload. An unknown or absent hash falls back to the first section
 * rather than showing nothing.
 */
function routeFromHash() {
  const key = (location.hash || '').replace(/^#\/?/, '');
  return TABS.some((t) => t.key === key) ? key : TABS[0].key;
}

/** The section the page is currently showing, so a re-render is not a route change. */
let shownTab = null;

function applyRoute() {
  state.tab = routeFromHash();
  if (state.data) render();
}

/**
 * The overflow menu, and the two ways out of it.
 *
 * Escape and a click outside both close it, because a menu that can only be
 * dismissed by hitting its own trigger again is a trap on a touchscreen.
 */
function wireMore() {
  const btn = $('#btn-more');
  const menu = $('#more-menu');
  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  menu.addEventListener('click', (e) => {
    // The language and theme groups live in here and are meant to be used
    // without the menu vanishing under the pointer.
    if (e.target.closest('[role="menuitem"]')) close();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.menu-wrap')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
}

/**
 * Granularity as a label that opens, not a second segmented bar.
 *
 * It is read far more often than it is changed — it states the resolution every
 * figure on screen belongs to — and four equal segments for that is the same
 * mistake as seven equal tiles. The buttons inside still carry `data-key`, so
 * the candle path that forces a week keeps working unchanged.
 */
function wireGran() {
  const host = $('#gran-group');
  host.innerHTML = '';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'gran-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.role = 'menu';
  menu.hidden = true;

  for (const g of [{ key: 'auto', label: 'Auto' }, ...GRANS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'menuitem';
    b.dataset.key = g.key;
    b.textContent = tr(g.label);
    b.setAttribute('aria-pressed', String(g.key === state.granularity));
    b.addEventListener('click', () => {
      state.granularity = g.key;
      // Choosing a granularity by hand retires the note explaining that the
      // candle toggle chose one for you.
      state.granularityForcedByCandles = false;
      for (const other of menu.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      render();
    });
    menu.append(b);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.gran')) {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
  host.append(trigger, menu);
}

/**
 * What the granularity trigger says.
 *
 * The resolution that is actually in use, and — when it was chosen for you —
 * that it was automatic. A control that can say "Auto" without saying what Auto
 * came out as leaves the reader to guess which resolution their figures are at.
 */
function updateGranLabel(resolved) {
  const b = $('#gran-trigger');
  if (!b) return;
  const label = GRANS.find((g) => g.key === resolved)?.label ?? resolved;
  const auto = state.granularity === 'auto' ? ` · ${tr('Auto')}` : '';
  b.innerHTML = `${esc(tr('per {unit}', { unit: tr(label).toLowerCase() }))}${esc(auto)}<span class="caret" aria-hidden="true">⌄</span>`;
}

/**
 * The rail foot: the facts about the data, not about the performance.
 *
 * Reconciliation keeps its verdict here as well as in the banner, and keeps its
 * colour when it disagrees — rule 6 outranks tidiness, and a quiet rail with a
 * red banner above it is still honest. Coverage moves out of the tile row,
 * where it rendered at the same size as the total value.
 */
function renderRailState(data, r) {
  const rows = [];
  const synced =
    data.mode === 'demo'
      ? tr('Demo data')
      : data.lastSyncAt
        ? new Date(data.lastSyncAt).toLocaleString('nl-NL')
        : tr('Not synced yet');
  rows.push(`<div class="row"><span class="dot"></span><span>${esc(synced)}</span></div>`);
  // US-79: the rail is where a reader checks what state this is in, so the frozen
  // state belongs here as well as in the banner — and above the verdict, because
  // it dates it.
  if (data.disconnected) {
    rows.push(`<div class="row"><span class="dot"></span><span>${esc(tr('Disconnected · frozen'))}</span></div>`);
  }

  if (r.reconciliation) {
    const ok = r.reconciliation.ok === true;
    rows.push(
      `<div class="row ${ok ? 'ok' : 'bad'}"><span class="dot"></span><span>${
        esc(ok ? tr('Reconciles to the cent') : tr('DOES NOT reconcile'))
      }</span></div>`,
    );
  }
  const est = r.coverage?.estimated ?? 0;
  const days = Math.max(1, r.coverage?.days ?? 1);
  rows.push(
    `<div class="row"><span class="dot"></span><span>${
      esc(tr('{pct}% measured', { pct: (100 - (est / days) * 100).toFixed(1) }))
    }</span></div>`,
  );
  $('#rail-state').innerHTML = rows.join('');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How often the page re-reads the sync checkpoint. */
const SYNC_POLL_MS = 500;

/**
 * How long the page keeps believing a checkpoint that is not moving.
 *
 * Generous on purpose. A first backfill spends minutes inside the price phase
 * and every outbound request is at least 1.1 s behind the last one (CLAUDE.md
 * rule 5), so a quiet stretch is ordinary. Two minutes of *complete* silence —
 * no checkpoint, no answer from the worker — is not.
 */
const SYNC_STALL_MS = 120000;

/**
 * Follow a running sync to its end by reading the checkpoint, not the reply.
 *
 * `sync.js` writes `meta.syncState` after every step precisely because the MV3
 * worker is ephemeral (SPEC §6). That checkpoint is the authority here, which
 * is what makes this survive the case the old code could not: a worker Chrome
 * kills mid-run, whose pending `sendMessage` callback never fires at all.
 *
 * Four outcomes, and the caller is released in every one of them:
 *
 *  - the checkpoint reaches `done` — finished, success or failure as recorded;
 *  - the worker answers, says nothing is running, and the checkpoint is still
 *    unfinished — the run died with an earlier worker, and nothing will ever
 *    finish it, so there is no point waiting out the stall timer;
 *  - nothing moves at all for `SYNC_STALL_MS`;
 *  - and the ordinary one, where it simply completes.
 *
 * @param {object|null} before the checkpoint as it stood before the run was asked for
 * @param {(step: object, steps: string[]) => void} onStep
 * @returns {Promise<{ok: boolean, message: string}>}
 */
async function watchSync(before, onStep) {
  let lastAt = before?.at ?? null;
  let lastMovement = Date.now();

  for (;;) {
    await sleep(SYNC_POLL_MS);

    let st;
    try {
      st = await send({ type: 'status' }, { timeoutMs: 10000 });
    } catch {
      // The worker is restarting, or did not answer in time. Neither means the
      // sync failed — a restart is normal MV3 behaviour. The stall check is
      // what eventually gives up.
      if (Date.now() - lastMovement > SYNC_STALL_MS) {
        return {
          ok: false,
          message:
            'The extension’s background worker stopped answering. Reload the extension in ' +
            'chrome://extensions and press Sync now — the sync resumes from where it stopped.',
        };
      }
      continue;
    }

    const s = st.syncState;
    if (s && s.at !== lastAt) {
      lastAt = s.at;
      lastMovement = Date.now();
    }
    if (s) onStep(s, st.steps ?? []);

    const ours = isSameRun(s, before);

    if (ours && s.done) {
      return { ok: !s.failed, message: s.message };
    }

    if (ours && !s.done && !st.syncing) {
      return {
        ok: false,
        message: `it stopped at “${s.message}”. Chrome shut the extension’s worker down mid-run. Press Sync now to carry on from there.`,
      };
    }

    if (Date.now() - lastMovement > SYNC_STALL_MS) {
      return {
        ok: false,
        message: `no progress for ${Math.round(SYNC_STALL_MS / 1000)}s${s ? ` — last step was “${s.message}”` : ''}.`,
      };
    }
  }
}

function wireActions() {
  const demo = wantsDemo();

  /**
   * Set while a long run is being followed, so a second click reports where it
   * is instead of starting another one. Shared by Sync and Wipe deliberately:
   * a wipe that lands in the middle of a sync is the failure mode `sync.js`
   * documents at `wipeAndResync`, and it produced a real report of a portfolio
   * with cash and no holdings.
   */
  let following = null;

  /**
   * Ask the worker to do something long, then follow the checkpoint.
   *
   * The message is fire-and-forget on purpose. Its reply is a nice-to-have that
   * MV3 does not promise to deliver, and treating it as the completion signal is
   * exactly what left the button stuck. Everything the success notice needs is
   * in the checkpoint and in the store.
   */
  async function startAndFollow({ message, btn, busyLabel, idleLabel }) {
    if (following) {
      notice('info', `Still running — ${following.step ?? 'starting…'}. A first sync can take a few minutes.`);
      return;
    }
    clearNotices();
    following = { step: null };
    btn.textContent = busyLabel;
    const progress = notice('info', 'Starting…');

    let before = null;
    try {
      before = (await send({ type: 'status' }, { timeoutMs: 10000 })).syncState ?? null;
    } catch {
      // No checkpoint to compare against. `watchSync` then accepts the first
      // one it sees, which is right: there is no stale run to confuse it with.
    }

    send(message, { timeoutMs: SYNC_STALL_MS }).catch(() => {});

    const outcome = await watchSync(before, (s, steps) => {
      const step = steps.indexOf(s.phase);
      const n = step >= 0 ? `Step ${step + 1} of ${steps.length} · ` : '';
      following.step = s.message;
      btn.textContent = s.pct != null ? `${busyLabel} ${s.pct}%` : busyLabel;
      setNoticeText(progress, `${n}${s.message}`);
    });

    following = null;
    btn.textContent = idleLabel;
    clearNotices();
    await refresh();

    if (outcome.ok) {
      const c = state.data?.counts ?? {};
      notice(
        'ok',
        `${outcome.message} ${c.transactions ?? 0} transactions, ${c.cashflows ?? 0} cash movements, ` +
          `${c.products ?? 0} instruments.`,
      );
    } else {
      notice('error', `Sync failed: ${outcome.message}`);
      notice('info', 'Press “Check connection” to see which step broke.');
    }
  }

  $('#btn-sync').addEventListener('click', (e) => {
    if (demo || !inExtension) {
      notice('info', 'Demo mode has nothing to sync. Open this page from the extension toolbar to sync your real account.');
      return;
    }
    // Deliberately never disabled — the same argument the Candles button makes
    // further up. A disabled button cannot be asked anything, and "it is stuck"
    // is precisely the moment you want to ask it. A second click answers.
    return startAndFollow({
      message: { type: 'sync', force: true },
      btn: e.target,
      busyLabel: tr('Syncing'),
      idleLabel: tr('Sync now'),
    });
  });

  $('#btn-diagnose').addEventListener('click', async (e) => {
    if (!inExtension) {
      notice('info', 'The connection check only works inside the extension.');
      return;
    }
    /**
     * `currentTarget`, not `target`, and the label is rebuilt rather than
     * assigned.
     *
     * Both halves are the same reported bug. This button is not plain text — it
     * carries a broker mark, so clicking the mark makes `e.target` the `<svg>`:
     * `disabled` on an SVG does nothing, and writing `textContent` into it put
     * the busy label *inside the icon*, where it stayed after the check
     * finished. The reader saw "Checking connection" every time they reopened
     * the menu.
     *
     * And even on a hit that did land on the button, assigning plain text
     * replaced the mark with a word — which is the failure `paintDiagLabel`
     * exists to prevent, so the reset goes through it.
     */
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = tr('Checking…');
    clearNotices();
    try {
      // Longer than the default: the check makes several real requests, and
      // rule 5 puts at least 1.1 s between any two of them.
      state.diagnostics = await send({ type: 'diagnose' }, { timeoutMs: 120000 });
      renderDiagnostics(state.diagnostics);
    } catch (err) {
      notice('error', `Could not run the check: ${err.message ?? err}`);
    } finally {
      btn.disabled = false;
      paintDiagLabel();
    }
  });

  /**
   * Everything that went wrong, on the clipboard, safe to paste.
   *
   * Distinct from **Export JSON**, and the difference is the whole point: the
   * export reconstructs a portfolio and therefore contains one, so it goes to
   * someone you trust. This carries codes, counts and ratios, so it can go in a
   * chat window. It also carries what the page never shows — every
   * `warning.detail`, and the sync log leading up to the failure — which is the
   * half a screenshot of a red banner has never had.
   */
  // Two buttons, one handler: the header keeps its copy and the Notices panel
  // has one where the notices actually are.
  for (const btn of document.querySelectorAll('[data-act="bugreport"]')) btn.addEventListener('click', async () => {
    const d = state.data ?? {};
    const report = buildBugReport({
      result: d.result ?? null,
      meta: d.meta ?? {},
      counts: d.counts ?? {},
      // `chrome?.` would throw here rather than yield undefined: optional
      // chaining does not protect against an undeclared identifier, and in the
      // demo this page is an ordinary web page with no `chrome` at all.
      version: inExtension ? chrome.runtime.getManifest().version : null,
      generatedAt: new Date().toISOString(),
      ui: {
        ...captured(),
        mode: d.mode,
        // Chrome's own version, which decides whether a CSS or API feature
        // exists at all. Major only: the build number identifies nobody but is
        // also of no diagnostic use.
        chrome: /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? null,
        language: getLang(),
        theme: getTheme(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        untranslated: missingTranslations().length,
      },
    });
    const n = report.warnings.length;
    if (await copy(report)) {
      notice('ok', `Bug report copied — ${n} notice${n === 1 ? '' : 's'}, no amounts or instrument names. Paste it into the chat.`);
    }
  });

  for (const [id, key] of [['#outlook-monthly', 'monthly'], ['#outlook-growth', 'growthPct'], ['#outlook-yield', 'yieldPct']]) {
    $(id).addEventListener('change', (e) => {
      const v = Number(e.target.value);
      state.outlook[key] = Number.isFinite(v) ? v : 0;
      render();
    });
  }
  $('#outlook-reinvest').addEventListener('change', (e) => {
    state.outlook.reinvest = e.target.checked;
    render();
  });

  // Escape leaves by the same path as the button, on this dialog as on the
  // sheet: one way out that looks the same however it was taken.
  $('#diagnostics').addEventListener('cancel', (e) => {
    e.preventDefault();
    closeModal($('#diagnostics'));
  });

  $('#btn-copy-diag').addEventListener('click', async () => {
    if (await copy(state.diagnostics)) notice('ok', 'Report copied to the clipboard.');
  });

  $('#btn-hide-diag').addEventListener('click', () => closeModal($('#diagnostics')));

  $('#btn-export').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      // Reading every store and cloning it across the worker boundary is the
      // slowest message this page sends, so it gets more than the default.
      const payload = demo || !inExtension ? state.data : await send({ type: 'export' }, { timeoutMs: 60000 });
      // "export" and the version in the name, because a day of debugging went
      // into a bug report and an export that shared one filename — and into a
      // report whose "0.50.0" could not say which build actually produced it.
      const build = inExtension ? chrome.runtime.getManifest().version : demoVersion;
      await downloadJsonGz(payload, `degiro-portfolio-export-v${build}-${new Date().toISOString().slice(0, 10)}.json.gz`);
    } catch (err) {
      notice('error', `Could not build the export: ${err.message ?? err}`);
    } finally {
      e.target.disabled = false;
    }
  });

  /**
   * US-79 — disconnect: forget the account, keep the figures.
   *
   * The confirm states all three things, because each is a thing a reader could
   * reasonably fear: what is forgotten, that the numbers stay and stop updating,
   * and that this does not log them out of DEGIRO. It is not `class="danger"` and
   * it does not say "delete", because nothing is deleted — the raw responses stay
   * and every figure is recomputed from them.
   */
  $('#btn-disconnect').addEventListener('click', async (e) => {
    if (demo || !inExtension) {
      banner('info', 'Nothing stored in demo mode.');
      return;
    }
    if (!confirm(tr('Disconnect this account? The account number DEGIRO gave us is forgotten and syncing stops. Your history stays on this computer and keeps showing the figures from the last sync. You stay logged in at DEGIRO — log out there if you want that too.'))) return;
    const btn = e.target;
    btn.disabled = true;
    try {
      await send({ type: 'disconnect' });
      // Reload rather than patch the page: everything below reads `data`, and the
      // frozen state is a property of the data. One path, and it is the same one
      // the first render takes.
      await refresh();
      // `banner()` does not translate on its own — it takes a string and prints
      // it — so these go through `tr()` here, which is also what makes
      // `missing()` count them.
      banner('info', tr('Disconnected. The figures below are frozen at the last sync; press Sync now to reconnect.'));
    } catch (err) {
      banner('error', tr('Could not disconnect: {msg}', { msg: String(err?.message ?? err) }));
    } finally {
      btn.disabled = false;
    }
  });

  /**
   * The three sentences, in the order the question is asked in — US-79 AC8.
   *
   * Prose rather than a spec, and translated like every other tip: if it grows
   * past these three it has turned into documentation and belongs in the README.
   */
  $('#btn-disconnect-tip').dataset.tip = [
    tr('How it works. The extension uses the DEGIRO session your own browser already has, and remembers the account number DEGIRO hands back. It never sees a password.'),
    tr('Disconnect forgets that account number and stops syncing by itself.'),
    tr('It does not delete your history — the figures stay, frozen at the last sync — and it does not log you out of DEGIRO.'),
  ].join(' ');
  $('#btn-disconnect-tip').setAttribute('aria-label', tr('What disconnect does'));

  $('#btn-wipe').addEventListener('click', (e) => {
    if (demo || !inExtension) {
      banner('info', 'Nothing stored in demo mode.');
      return;
    }
    /**
     * The one genuinely destructive, irreversible action on the page, so it is
     * the one place a confirmation earns its place — and it was asking in English
     * on a Dutch page. `confirm()` never reaches `t()` on its own, which is why
     * `missing()` had never counted it.
     */
    if (!confirm(tr('Delete every stored response and re-download the full history from DEGIRO?'))) return;
    // One message: the worker waits for any running sync, wipes, then starts a
    // fresh one. Splitting it lets a wipe land in the middle of a sync. It is
    // followed exactly like a sync, because after the wipe that is what it is.
    return startAndFollow({
      message: { type: 'wipe' },
      btn: e.target,
      busyLabel: tr('Resyncing'),
      idleLabel: tr('Wipe & resync'),
    });
  });

  if (demo || !inExtension) {
    for (const id of ['#btn-wipe', '#btn-disconnect']) $(id).disabled = true;
  }
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

/**
 * Show one section and hide the rest.
 *
 * Returns whether a given canvas is on screen, because Chart.js sizes a canvas
 * from its container and a container inside `display: none` measures zero. A
 * chart built there comes back as a sliver when its tab is opened, so the
 * charts of a hidden section are not built at all — the tab switch re-renders.
 */
function applyTab() {
  // `.grid[data-tab]`, not `[data-tab]`: the tab buttons carry the attribute too,
  // and the first version of this hid four of the five buttons behind the one
  // that was open.
  const changed = shownTab !== state.tab;
  shownTab = state.tab;
  for (const section of document.querySelectorAll('.grid[data-tab]')) {
    const on = section.dataset.tab === state.tab;
    section.hidden = !on;
    if (on && changed) arrive(section);
  }
  for (const b of $('#tabs').querySelectorAll('button')) {
    const on = b.dataset.tab === state.tab;
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
    b.setAttribute('aria-selected', String(on));
    b.classList.toggle('is-on', on);
  }
  /**
   * Brief §4. Range applies on Overzicht, Rendement, Posities and Inkomsten;
   * it is hidden on Vooruitblik — a window in the past changes nothing about a
   * line running forward — and on Meldingen.
   *
   * Posities used to hide it too, which was right while that panel showed only
   * today's holdings and wrong the moment US-49 gave it a windowed Result
   * column: a control that governs a figure has to be reachable from the screen
   * that figure is on.
   */
  const windowed = !['outlook', 'notices'].includes(state.tab);
  $('.controls').hidden = !windowed;
  $('#window-crumb').hidden = !windowed;
}

/**
 * US-64 — a section arrives rather than cutting.
 *
 * A short rise and a fade on the container, and nothing else. Three things it
 * deliberately does not do, each of which is a trap the refinement names:
 *
 *  - **It does not delay the content.** The section is shown and interactive
 *    before this is called; the motion is decoration over an already-usable
 *    page, and nothing is locked out while it runs.
 *  - **Transform and opacity only.** Animating a height would reflow the whole
 *    grid every route change, which is the janky path — and on a page of charts
 *    it is an expensive one.
 *  - **It does not re-animate the charts.** They are built with Chart.js
 *    animation off, and this runs on the container, so a route change cannot
 *    replay every series.
 *
 * Interruptible by cancelling rather than by queueing: flicking through the rail
 * should leave the last section arriving, not five of them arriving in turn.
 * Successive changes land on different elements, so cancelling the one being
 * started is enough — a section returned to mid-flight restarts cleanly.
 *
 * Reduced motion drops the slide and keeps a short fade: something appearing is
 * motion that aids comprehension, and the vestibular part is the travel.
 */
function arrive(section) {
  if (typeof section.animate !== 'function') return;
  for (const a of section.getAnimations?.() ?? []) a.cancel();
  const reduced = prefersReducedMotion();
  section.animate(
    reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    // The curve a critically-damped spring traces, as a bezier: no overshoot,
    // the same shape `motion.js` produces for the chart's edge, so the two
    // surfaces move in one language.
    { duration: reduced ? 120 : 260, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
  );
}

/** Is this canvas in the section currently on screen? */
const onScreen = (sel) => {
  const el = $(sel);
  return !!el && el.closest('.grid[data-tab]')?.dataset.tab === state.tab;
};

function render() {
  const { data } = state;
  if (!data) return;

  applyTab();
  $('#banners').innerHTML = '';

  if (data.empty) {
    $('#subtitle').textContent = 'Nothing stored yet.';
    banner('info', 'No data yet. Log in to trader.degiro.nl, then press “Sync now”.');
    // Someone evaluating the extension before trusting it with their account
    // should be able to see what the charts look like first.
    banner('info', 'Want to see what it looks like first? Open the demo with sample data.', {
      href: 'app.html?demo=1',
      text: 'Open the demo',
    });
    return;
  }

  const r = data.result;
  const t = tokens();

  // --- context line -----------------------------------------------------
  const modeNote =
    data.mode === 'demo'
      ? 'Demo data — generated fixtures, not a real account.'
      : data.lastSyncAt
        ? `Last synced ${new Date(data.lastSyncAt).toLocaleString('nl-NL')}.`
        : 'Not synced yet.';
  /**
   * The build, in the header rather than only in the footer.
   *
   * A tester reported against **v0.21.0** without noticing — the version sat in
   * small grey text at the very bottom of a long page, so an unpacked extension
   * that had gone stale looked identical to a current one. It is the first
   * thing a bug report needs and now the first thing on screen.
   */
  const build = inExtension ? chrome.runtime.getManifest().version : demoVersion;
  $('#subtitle').textContent =
    `${build ? `v${build} · ` : ''}${r.start} → ${r.end} · ${r.days.length} days · ${modeNote}`;

  renderRailState(data, r);
  renderBanners(data, r);

  // --- range window -----------------------------------------------------
  const from = rangeStartIndex(r.days, state.range);
  const to = rangeEndIndex(r.days, state.range);
  renderWindowCrumb(r, from, to);

  // Below the window, not above it. B8's whole defect was that the tiles were
  // rendered before the range existed, so they could only ever be all-time.
  // The switch belongs to the Overview and nowhere else. Leaving it visible on
  // Performance would invite flipping the page somebody is trying to read.
  /**
   * The button only exists for someone holding the thing the joke is about, and
   * only while that holding is inside the range on screen. Filter it out and
   * the button goes with it — a joke about a position you are not looking at is
   * clutter. See `QUALIFYING` in frown.js.
   */
  const onOverview = state.tab === 'overview' && frown.qualifies(r, from, to);
  $('#frown-bar').hidden = !onOverview;
  if (!onOverview && frown.isOn()) {
    frown.setFrown(false);
    $('#frown-toggle').setAttribute('aria-pressed', 'false');
    $('#frown-toggle').classList.remove('on');
  }

  renderTiles(r, from, to, data.live);
  const slice = (arr) => arr.slice(from, to + 1);

  const gran = state.granularity === 'auto' ? autoGranularity(to - from + 1) : state.granularity;
  updateGranLabel(gran);
  markAutoGranularity(gran);

  // "Results per" used to reach only the two result charts, so pressing Month
  // left the largest chart on the page — the one directly beneath the control —
  // unchanged, and pressing Day did nothing at all whenever Auto had already
  // chosen day. It now applies to every time series. A value is a level, so a
  // bucket takes the observation it ended on; a flow is summed, which the
  // aggregators already do.
  renderZoomState(r, from, to);
  wireZoom();

  const ends = bucketEnds(r.days, from, to, gran);
  const atEnds = (arr) => ends.map((i) => arr[i]);

  destroyCharts();

  /**
   * US-35d. Optimism Mode draws two *different* charts, in place of the real two.
   *
   * The previous version reflected the value series about its own midpoint, which
   * produced something shaped like a portfolio value chart while not being one —
   * and on the deposit steps it inverted them, so every moment money went in the
   * line dropped. `frown.js` explains why no rewording of that transform fixes
   * it. These two are true read straight and only happen to climb when things go
   * badly.
   *
   * Replacing rather than adding settles a smaller thing for free: the real
   * charts are simply not rendered while the mode is on, so there is no moment
   * when a joke chart and a real one are on screen together.
   */
  const cheerful = frown.isOn() && state.tab === 'overview';
  renderOptimismCharts(r, ends, atEnds, cheerful, t);

  if (!cheerful && onScreen('#c-value')) state.charts.value = valueChart(
    $('#c-value'),
    {
      days: atEnds(r.days),
      value: atEnds(r.value),
      positionsValue: atEnds(r.positionsValue),
      // A flow is summed over the bucket, or a deposit inside a month would
      // vanish unless it happened to land on the last day of it.
      netExternal: sumInBuckets(r.netExternal, ends, from),
      // Only the drag readout uses this, and it is the reason the readout can
      // report a result rather than a change in value.
      pnl: sumInBuckets(r.pnl, ends, from),
      // Re-indexed onto the buckets the chart actually draws, and merged where
      // a week or a month collapses several trading days into one point.
      trades: tradesInBuckets(r.tradeEvents ?? [], ends, from),
      /**
       * US-62. Aligned to the points actually drawn: at Day that is the day's own
       * flag, and at Week or Month it is true when *any* day folded into that
       * point was estimated. Marking only the bucket's last day would let a month
       * of stale prices pass as measured because its final day happened to quote.
       */
      estimated: sumInBuckets(r.estimated ?? [], ends, from).map((n) => n > 0),
      includeCash: state.includeCash,
    },
    t,
  );
  if (!cheerful) noteBaseline('#value-baseline', state.charts.value, r, from);

  const agg = aggregatePnl(r.days, r.pnl, gran, from, to);
  if (onScreen('#c-pnl')) {
    state.charts.pnl = pnlChart($('#c-pnl'), agg, t);
    chartTwin('c-pnl', {
      columns: [{ label: 'Period' }, { label: 'Result', num: true }],
      rows: agg.starts.map((d, i) => [d, fmtSigned(agg.pnl[i])]),
    });
  }
  if (onScreen('#c-cum')) renderCumulative(r, gran, from, to, agg, t, ends);

  // One composition and one set of colours, used three times: the stacked chart,
  // the holdings table's swatches and the share ring. All three must agree on
  // which colour is which holding, so the resolution happens once, here.
  const composition = buildComposition(r, 6, from, to);
  const compColours = compositionColours(composition, t);
  if (onScreen('#c-comp')) state.charts.comp = compositionChart($('#c-comp'), downsampleComposition(composition, ends, from), t, compColours);

  if (!cheerful && onScreen('#c-invested')) state.charts.invested = investedVsValueChart(
    $('#c-invested'),
    { days: atEnds(r.days), value: atEnds(r.value), cumulativeDeposited: atEnds(r.cumulativeDeposited) },
    t,
  );

  if (onScreen('#c-deposits')) {
    const flows = monthlyFlows(r, from, to);
    state.charts.deposits = depositChart($('#c-deposits'), flows, t);
    chartTwin('c-deposits', {
      columns: [{ label: 'Month' }, { label: 'In and out', num: true }],
      rows: flows.labels.map((m, i) => [m, fmtSigned(flows.amounts[i])]),
    });
  }

  if (onScreen('#c-movers')) state.charts.movers = moversChart($('#c-movers'), moversData(r, from, to), t);
  if (onScreen('#c-cash')) {
    state.charts.cash = cashChart($('#c-cash'), { days: atEnds(r.days), cash: atEnds(r.cash) }, t);
  }
  // A doughnut with one segment states nothing. An all-euro account has no
  // currency exposure to show, and drawing a full ring labelled EUR implies a
  // question was asked and answered when it was not.
  const currency = currencyData(r, t);
  const currencyCard = $('#c-currency').closest('.card');
  currencyCard.hidden = currency.labels.length < 2;
  if (!currencyCard.hidden && onScreen('#c-currency')) {
    state.charts.currency = currencyChart($('#c-currency'), currency, t);
  }

  // Dividends are shown for the whole history rather than the selected range —
  // a month of dividends is too sparse to be worth a range filter.
  const dividendCard = $('#c-dividends').closest('.card');
  dividendCard.hidden = r.dividendsByMonth.length === 0;
  if (!dividendCard.hidden && onScreen('#c-dividends')) {
    state.charts.dividends = dividendChart($('#c-dividends'), r.dividendsByMonth, t);
    chartTwin('c-dividends', {
      columns: [{ label: 'Month' }, { label: 'Received (net)', num: true }, { label: 'Withholding tax', num: true }],
      rows: r.dividendsByMonth.map((x) => [x.month, fmtEurCents(x.net), fmtEurCents(Math.abs(x.tax ?? 0))]),
    });
  }

  const months = monthlyTable(r);
  renderMonthMatrix(months, t, r.days[from], r.days[to]);
  renderMonthCompare(months, t);

  lastWindow = { result: r, from, to };
  renderHoldings(r, composition, compColours, t, from, to);
  wireSnapshots();
  placeWatermarks();
  renderYears(r);
  renderOutlook(r, t);
  renderAnnualised(r, from, to);
  renderTransactions(data, r, from, to);
  renderFooter(r, data);
}

/**
 * The index of the last day in each bucket, over the selected range.
 *
 * A portfolio value is a level, not a flow: a month's worth of it is the value
 * it ended on, never a sum or an average. The final bucket always ends on the
 * last day in range, so the newest point is today rather than the last complete
 * month.
 */
function bucketEnds(days, from, to, gran) {
  if (gran === 'day') {
    const out = [];
    for (let i = from; i <= to; i++) out.push(i);
    return out;
  }
  const key = gran === 'week' ? weekKey : monthKey;
  const out = [];
  for (let i = from; i <= to; i++) {
    if (i === to || key(days[i]) !== key(days[i + 1])) out.push(i);
  }
  return out;
}

/** The composition is a stack of levels, so it samples on the same bucket ends. */
function downsampleComposition(composition, ends, from) {
  const pick = ends.map((i) => i - from);
  return {
    ...composition,
    days: pick.map((i) => composition.days[i]),
    layers: composition.layers.map((l) => ({ ...l, values: pick.map((i) => l.values[i]) })),
  };
}

/** Sum a flow over each bucket, so nothing inside one is lost. */
function sumInBuckets(arr, ends, from) {
  const out = [];
  let start = from;
  for (const end of ends) {
    let total = 0;
    for (let i = start; i <= end; i++) total += arr[i];
    out.push(total);
    start = end + 1;
  }
  return out;
}

/**
 * Trade days, mapped onto the buckets the chart draws.
 *
 * At day granularity this is one-to-one. At week or month several trading days
 * land on one point, so they are merged rather than drawn on top of each other
 * — otherwise a busy month is one thick smudge that says nothing about how busy.
 */
function tradesInBuckets(events, ends, from) {
  const out = new Map();
  let bucket = 0;
  for (const e of events) {
    if (e.index < from) continue;
    while (bucket < ends.length - 1 && ends[bucket] < e.index) bucket++;
    if (e.index > ends[bucket]) continue;
    const cur = out.get(bucket) ?? { index: bucket, buys: 0, sells: 0, names: [], more: 0 };
    cur.buys += e.buys;
    cur.sells += e.sells;
    for (const n of e.names) if (cur.names.length < 3 && !cur.names.includes(n)) cur.names.push(n);
    out.set(bucket, cur);
  }
  return [...out.values()];
}

/**
 * Drag across the value chart to select a stretch of it.
 *
 * The six range buttons reach six windows and nothing between them — there was
 * no way to look at March 2024, or at the fortnight around a crash. A drag sets
 * a custom range in the same state the buttons drive, so every chart on the
 * page follows it, and it also gives the arbitrary start-and-end date that was
 * otherwise missing entirely.
 */
function wireZoom() {
  const canvas = $('#c-value');
  if (!canvas || canvas.dataset.zoomWired) return;
  canvas.dataset.zoomWired = '1';

  /**
   * The gesture's state. `anchor` is the edge that stays put, `moving` the one
   * under the finger, both as **fractional day indices** — the spring settles in
   * the same units the window is expressed in, so nothing has to be converted
   * back and forth and there is no pixel/day rounding to disagree about.
   */
  let anchor = null;
  let grabOffset = 0;
  let trail = [];
  let pending = false;
  /**
   * US-66. How far the pointer has actually travelled, in pixels, since it went
   * down — which is what decides whether this was a click or a drag.
   *
   * The old test was a span of **days** between the two ends, and momentum made
   * it worse rather than better: a three-pixel wobble carries a velocity, the
   * projection turns that into a throw, and the day-span it lands on is
   * comfortably over two. So a twitch could zoom the page *further* than before.
   * Measuring the hand rather than the history is the fix in both directions.
   */
  let travelPx = 0;
  // A twentieth of a day: below what a pixel on this chart can show, and the
  // window rounds to a whole day regardless. See `restDistance`.
  const moving = new Spring(0, { restDistance: 0.05 });

  const chartNow = () => state.charts.value;
  const lastIndex = () => Math.max(0, (chartNow()?.data?.labels?.length ?? 1) - 1);

  /** Pointer x to a fractional day index, unclamped so the caller can resist. */
  const indexAtX = (x) => {
    const chart = chartNow();
    if (!chart) return null;
    const area = chart.chartArea;
    const labels = chart.data.labels ?? [];
    if (!labels.length) return null;
    return ((x - area.left) / Math.max(1, area.right - area.left)) * (labels.length - 1);
  };

  /**
   * Rubber-band past the ends (US-55 AC4, US-63 AC2).
   *
   * Before the first day or after the last, the edge keeps moving but ever more
   * slowly. The point is that the end of the history should read as an *edge* —
   * something you can push against — rather than as the control having frozen,
   * which is what stopping dead looks like.
   */
  const resist = (idx) => {
    const n = lastIndex();
    if (idx < 0) return -rubber(-idx, n);
    if (idx > n) return n + rubber(idx - n, n);
    return idx;
  };

  /**
   * Show the selection while the pointer is down, and while it settles.
   *
   * There was no `pointermove` here at all once: the drag recorded an anchor,
   * applied a range on release, and drew nothing in between — so both ends of
   * the selection had to be guessed at. Reported, fairly, as not being able to
   * see what you are selecting.
   *
   * Pointer events and spring frames both fire faster than the screen updates,
   * so the paint is collapsed onto the next animation frame. `chart.render()`
   * repaints from a layout that already exists, which is what makes this cheap
   * enough to do on a two-thousand-point series.
   */
  const paint = (a, b) => {
    const chart = chartNow();
    if (!chart) return;
    // On the instance rather than in the options: Chart.js caches resolved
    // plugin options, so a value written there between renders never reaches
    // the plugin. See the note in `dragSelection`.
    chart.$dragSelection = a == null || b == null ? null : { a, b };
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (state.charts.value === chart) chart.render();
    });
  };

  moving.onUpdate = (v) => paint(anchor, v);

  /**
   * The hover tooltip is noise during a drag: it lands on top of the readout
   * that says what is being selected, which is the one thing being read. Off
   * while the pointer is down, back on release — twice per gesture, so the
   * `update` it costs is not on the hot path.
   */
  const tooltip = (on) => {
    const chart = chartNow();
    const cfg = chart?.options?.plugins?.tooltip;
    if (!cfg || cfg.enabled === on) return;
    cfg.enabled = on;
    chart.update('none');
  };

  const clear = () => {
    anchor = null;
    trail = [];
    moving.stop();
    paint(null, null);
    tooltip(true);
  };

  /** Turn the two edges into a window, or decide it was a click and do nothing. */
  const apply = () => {
    const labels = chartNow()?.data?.labels ?? [];
    const n = labels.length - 1;
    const at = (v) => labels[Math.min(n, Math.max(0, Math.round(v)))];
    const start = at(anchor);
    const end = at(moving.x);
    clear();
    if (!start || !end) return;
    const [from, to] = start <= end ? [start, end] : [end, start];
    if (from === to) return; // a window of one day is not a window
    zoomTo(`${from}..${to}`);
  };

  /** A press that never really moved. The tooltip is what it was for. */
  const wasClick = () => travelPx < GESTURE.dragThresholdPx;

  canvas.addEventListener('pointerdown', (e) => {
    const here = indexAtX(e.offsetX);
    if (here == null) return;

    /**
     * US-55 AC3 / US-63's interruptibility. A press while the edge is still
     * settling takes it over **from where it is on screen**, not from where it
     * was heading — `moving.x` is the presentation value, and grabbing the
     * target instead is the jump an interruptible animation must never make.
     * The offset is kept so the edge stays glued to the finger rather than
     * teleporting under it.
     */
    if (moving.running && anchor != null) {
      moving.stop();
      grabOffset = moving.x - here;
    } else {
      anchor = here;
      moving.snap(here);
      grabOffset = 0;
    }
    trail = [{ v: moving.x, t: performance.now() }];
    travelPx = 0;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (anchor == null) return;
    travelPx += Math.abs(e.movementX);
    const here = indexAtX(e.offsetX);
    if (here == null) return;
    const at = resist(here + grabOffset);
    // 1:1 with the finger: no easing while dragging, ever. The spring is for
    // what happens *after* the finger leaves.
    moving.snap(at);
    trail.push({ v: at, t: performance.now() });
    if (trail.length > 8) trail.shift();
    // Only once the gesture has committed to being a drag, so a plain click that
    // wobbles by a pixel does not flash the tooltip off and on.
    if (!wasClick()) tooltip(false);
  });

  canvas.addEventListener('pointercancel', clear);

  canvas.addEventListener('pointerup', () => {
    if (anchor == null) return;
    const n = lastIndex();
    const clamp = (v) => Math.min(n, Math.max(0, v));

    /**
     * The release itself is a sample, and leaving it out was a real defect.
     *
     * A hand slows to a stop before letting go, and during that pause no
     * `pointermove` fires — so the newest sample in the trail was from *before*
     * the pause, and the velocity window read the speed the finger had a fifth
     * of a second ago. A deliberate drag that came to rest was thrown as if it
     * had been flicked: released on July 2024, landed on April 2025.
     *
     * Stamping the current position at the release time makes the pause visible
     * to `velocityFrom`, so a gesture that stopped has stopped.
     */
    trail.push({ v: moving.x, t: performance.now() });

    /**
     * Velocity handoff and momentum projection (US-55 AC2, US-63 AC1).
     *
     * A flick lands where the momentum *projects*, snapped to the day there —
     * not under the release point. That is what makes a flick throw the window
     * rather than merely end it, and it is the difference between a control that
     * has physics and one that has an animation.
     *
     * Reduced motion (AC5) keeps the 1:1 tracking above and drops this entirely:
     * the window applies where the finger left it. Gentler feedback, not none.
     */
    /**
     * A click, decided in pixels. It reaches here having drawn nothing and
     * changed nothing, and the tooltip it was for is re-enabled by `clear()`.
     * Checked *before* the momentum, because a twitch has a velocity too.
     */
    if (wasClick()) {
      clear();
      return;
    }

    const velocity = velocityFrom(trail);
    if (prefersReducedMotion()) {
      moving.snap(clamp(Math.round(moving.x)));
      apply();
      return;
    }
    const landing = Math.round(clamp(moving.x + project(velocity)));
    moving.onRest = () => {
      moving.onRest = null;
      apply();
    };
    // The spring continues at the finger's speed, so there is no seam between
    // dragging and settling.
    moving.set(landing, { velocity });
  });
}

function zoomTo(range) {
  state.zoomFrom = state.range;
  state.range = range;
  for (const b of $('#range-group').querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
  render();
}

/**
 * US-35d. The two joke charts, and the copy that goes with them.
 *
 * They take over the Overview's two chart slots one for one, so the section keeps
 * its shape and nothing new has to be laid out. Both titles and both subtitles are
 * swapped here rather than in the markup, because both name the instrument the
 * joke is about — and `frown.qualifies` has already guaranteed the reader holds
 * it, so `{prop}` is never empty and there is no fallback path to keep alive.
 *
 * When the mode is off this restores the real copy and returns. That restore is
 * the load-bearing half: without it, turning the mode off would leave *Belief in
 * ASML* above the portfolio value chart, which is the one outcome worse than not
 * having the feature.
 */
function renderOptimismCharts(r, ends, atEnds, cheerful, t) {
  const prop = frown.subjectOf(r) ?? '';
  const text = (sel, s) => { const el = $(sel); if (el) el.textContent = s; };

  if (!cheerful) {
    text('#value-title', tr('Portfolio value including cash'));
    text('#value-hint', tr('Daily total, reconstructed from your trades, cash movements and daily closing prices. Triangles on the baseline mark days money went in (up) or out (down).'));
    text('#invested-title', tr('Money paid in vs what it is worth'));
    text('#invested-hint', tr('The gap between the two lines is growth — everything that is not your own deposits.'));
    return;
  }

  text('#value-title', tr('Belief in {prop}, over time', { prop }));
  text('#value-hint', tr('One point for every day you held {prop} while it was under water, weighted by how far under. It has never gone down. Neither should you.', { prop }));
  text('#invested-title', tr('What {prop} still owes you', { prop }));
  text('#invested-hint', tr('How much you make the moment {prop} returns to what you paid. This is the number that grows when things go badly, which is why it is the only chart worth looking at.', { prop }));

  const days = atEnds(r.days);
  // Both are cumulative over the whole series, then sampled onto the buckets the
  // chart draws — computing them from the sampled values instead would count a
  // month as one day and flatten the climb.
  if (onScreen('#c-value')) {
    const conviction = frown.convictionIndex(r.value);
    state.charts.value = singleSeriesChart(
      $('#c-value'),
      { days, values: ends.map((i) => conviction[i]) },
      t,
      // The gain colour whatever it contains, which is the joke keeping a
      // straight face: nothing about the drawing admits what it is measuring.
      {
        colour: t.pos,
        format: (v) => `${Math.round(v).toLocaleString('nl-NL')} pts`,
        // The label says what the stamp on the chart says. A screen reader
        // getting the joke figures without the disclaimer would be the one way
        // Optimism Mode could actually mislead somebody.
        title: 'Belief, NOT THE REAL NUMBERS',
      },
    );
    // The baseline note is about a euro axis and this one is in points.
    const note = $('#value-baseline');
    if (note) note.hidden = true;
  }

  if (onScreen('#c-invested')) {
    const upside = frown.upsideRemaining(r.value, r.cumulativeDeposited);
    state.charts.invested = singleSeriesChart(
      $('#c-invested'),
      { days, values: ends.map((i) => upside[i]) },
      t,
      { colour: t.pos, format: (v) => fmtEurCents(v), title: 'What it still owes you, NOT THE REAL NUMBERS' },
    );
  }
}

/**
 * US-71 (second half) — the table twin.
 *
 * dataviz's rule, and the one the Positions card has followed since 0.46.0:
 * **every chart has a table view, and a tooltip is never the only way to read a
 * value.** A tooltip needs a pointer and a hover; a screen reader has neither,
 * and neither does anybody reading a screenshot.
 *
 * One helper rather than a twin per chart, and the toggle is built here rather
 * than in the markup so a chart that gains a twin needs no HTML — the same
 * reason `columns.js` holds the Positions columns as data.
 *
 * The figures come through the page's own formatters, so US-46 masks them and
 * this function needs no rule of its own; the dates do not mask, because US-46
 * hides what you have and not when.
 */
function chartTwin(canvasId, { columns, rows }) {
  const box = $(`#${canvasId}`)?.closest('.chart-box');
  if (!box) return;

  let twin = box.parentElement.querySelector(`[data-twin="${canvasId}"]`);
  let toggle = box.parentElement.querySelector(`[data-twin-toggle="${canvasId}"]`);
  if (!twin) {
    twin = document.createElement('div');
    twin.className = 'table-scroll chart-twin';
    twin.dataset.twin = canvasId;
    twin.hidden = true;
    twin.innerHTML = '<table><thead></thead><tbody></tbody></table>';
    box.after(twin);

    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'twin-toggle';
    toggle.dataset.twinToggle = canvasId;
    toggle.setAttribute('aria-controls', `${canvasId}`);
    toggle.addEventListener('click', () => {
      // One source of truth for which of the two is up, read back after the
      // flip. Deriving the label from a local `showTable` got it inverted: the
      // button offered "show as a table" while the table was already on screen.
      box.hidden = !box.hidden;
      twin.hidden = !box.hidden;
      paintTwinToggle(toggle, !box.hidden);
    });
    twin.after(toggle);
  }
  paintTwinToggle(toggle, !box.hidden);

  const head = twin.querySelector('thead');
  const body = twin.querySelector('tbody');
  head.innerHTML = `<tr>${columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(tr(c.label))}</th>`).join('')}</tr>`;
  body.innerHTML = rows
    .map((r) => `<tr>${r.map((cell, i) => `<td${columns[i]?.num ? ' class="num"' : ''}>${esc(cell)}</td>`).join('')}</tr>`)
    .join('');
}

/** The label states what pressing it does, not what is on screen now. */
function paintTwinToggle(toggle, chartVisible) {
  if (!toggle) return;
  toggle.textContent = chartVisible ? tr('Show as a table') : tr('Show as a chart');
  toggle.setAttribute('aria-expanded', String(!chartVisible));
}

/** Say what is selected, and offer the way back. A zoom you cannot leave is a trap. */
function renderZoomState(r, from, to) {
  const box = $('#zoom-state');
  if (!box) return;
  const dragged = typeof state.range === 'string' && state.range.includes('..');
  box.hidden = !dragged;
  if (!dragged) return;
  box.innerHTML =
    `<span>Zoomed to <strong>${esc(r.days[from])}</strong> — <strong>${esc(r.days[to])}</strong> ` +
    `<span class="muted">(${to - from + 1} days)</span></span> <button type="button" id="btn-unzoom">Back</button>`;
  $('#btn-unzoom').addEventListener('click', () => {
    state.range = state.zoomFrom ?? 'ALL';
    state.zoomFrom = null;
    for (const b of $('#range-group').querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.textContent === state.range));
    }
    render();
  });
}

/**
 * The cumulative result, as a line or as candles.
 *
 * Candles need four numbers and a day has one, so at day granularity every
 * candle would be a flat dash — four times the ink for the same value, and a
 * chart that looks like it is describing volatility while describing nothing.
 * The toggle is therefore tied to "Results per", and says why when it cannot
 * be used rather than drawing dashes.
 */
function renderCumulative(r, gran, from, to, agg, t, ends) {
  // Remembered so the Candles button, which fires before the next render, can
  // tell whether the granularity it is about to be drawn at can carry a candle.
  state.lastGranularity = gran;

  const canCandle = gran === 'week' || gran === 'month';
  const showCandles = canCandle && state.cumulativeView === 'candles';

  for (const b of $('#cum-view').querySelectorAll('button')) {
    // Never disabled. See the click handler: a disabled control that cannot say
    // why reads as a broken one, and did.
    b.setAttribute('aria-pressed', String(b.dataset.key === (showCandles ? 'candles' : 'line')));
  }

  if (showCandles) {
    const data = candleSeries(r.days, r.pnl, gran, from, to);
    state.charts.cum = candleChart($('#c-cum'), data, t);
    const switched = state.granularityForcedByCandles
      ? `“Results per” moved to Week for this: a day has one number, so a daily candle would be a flat dash. `
      : '';
    $('#cum-hint').textContent =
      `${switched}Each candle opens where the last one closed and spans the highest and lowest the result reached ` +
      `inside the ${gran}. Blue closed up, red closed down. Deposits and withdrawals are already out, so a long ` +
      `wick is a swing and not money arriving.`;
    return;
  }

  /**
   * `bucketEnds` and `aggregatePnl` bucket the same range at the same
   * granularity with the same key functions, so the two lists line up one for
   * one — which is what lets the estimated flags be carried across without the
   * engine growing an output for a rendering concern (US-62's stop condition).
   */
  const cumEstimated = sumInBuckets(r.estimated ?? [], ends, from).map((n) => n > 0);
  state.charts.cum = cumulativeChart($('#c-cum'), { ...agg, estimated: cumEstimated }, t);
  chartTwin('c-cum', {
    columns: [{ label: 'Period' }, { label: 'Result', num: true }, { label: 'Added up', num: true }, { label: 'Prices' }],
    rows: agg.starts.map((d, i) => [
      d,
      fmtSigned(agg.pnl[i]),
      fmtSigned(agg.cumulative[i]),
      // AC4. The same honesty the readout carries, in the channel a reader who
      // cannot see the chart is actually using.
      cumEstimated[i] ? tr('estimated') : tr('measured'),
    ]),
  });
  $('#cum-hint').textContent = canCandle
    ? 'The same numbers, added up over the selected range.'
    : 'The same numbers, added up over the selected range. Pressing Candles will switch “Results per” to Week: ' +
      'a candle needs a period with a high and a low, and a single day has one number.';
}

function autoGranularity(nDays) {
  if (nDays <= 45) return 'day';
  if (nDays <= 400) return 'week';
  return 'month';
}

function markAutoGranularity(gran) {
  if (state.granularity !== 'auto') return;
  const btn = document.querySelector('#gran-group button[data-key="auto"]');
  if (btn) btn.textContent = `Auto (${gran})`;
}

/** Net external cashflow, bucketed by month — the "how much did I pay in" chart. */
function monthlyFlows(r, from, to) {
  const buckets = new Map();
  for (let i = from; i <= to; i++) {
    if (Math.abs(r.netExternal[i]) < 0.005) continue;
    const k = monthKey(r.days[i]);
    buckets.set(k, (buckets.get(k) ?? 0) + r.netExternal[i]);
  }
  const keys = [...buckets.keys()].sort();
  return { labels: keys, amounts: keys.map((k) => Math.round(buckets.get(k) * 100) / 100) };
}

function destroyCharts() {
  for (const c of Object.values(state.charts)) c?.destroy?.();
  state.charts = {};
}

// ---------------------------------------------------------------------------
// tiles, banners, table
// ---------------------------------------------------------------------------

/**
 * B8, decided: the tiles follow the selected range, and say which range.
 *
 * They used to be all-time whatever the range said, so pressing 1M left
 * "TOTAL RESULT +€97 842,64" on screen above a chart showing one month. That is
 * the same complaint US-06 fixed for the charts — a control in the global
 * toolbar that half the page ignores reads as a dead button.
 *
 * Two of the six do not follow it, and that is not an oversight. **Total value**
 * and **Money paid in** are positions, not periods: what the account is worth,
 * and what has been put into it, as of the end of the window. A "value over the
 * last month" is not a quantity that exists.
 *
 * The percentage is the daily-chained return `monthlyTable` already uses,
 * Π(1 + pnl[d]/value[d−1]) − 1, rather than result divided by opening value.
 * That is the whole reason it can follow a range at all: a deposit landing
 * inside the window would otherwise inflate the denominator and flatter the
 * return. No new notion of return enters the codebase.
 */
/**
 * The figures themselves, separated from putting them on screen.
 *
 * US-54 split this out. A shared score card is drawn from a tile — its own
 * already-formatted `value` and `note` strings, so anonymize is inherited by
 * construction rather than re-implemented — and the sheet's amount toggle is
 * independent of the page's, so the share path has to be able to ask for the
 * list *again* with the mask set the other way. It cannot read what is on
 * screen.
 *
 * Which is also the structural half of the Optimism Mode quarantine: this
 * function has never heard of the cheerful tiles, so the share path cannot
 * accidentally pick one up. The joke is applied in `renderTiles`, one level
 * down, and only there.
 */
function buildTiles(r, from = 0, to = r.days.length - 1, live = null) {
  const last = Math.min(to, r.days.length - 1);
  const dayPnl = r.pnl[last];
  const weekPnl = r.pnl.slice(Math.max(0, last - 6), last + 1).reduce((a, b) => a + b, 0);

  /**
   * DEGIRO's own result-so-far-today, preferred over the reconstructed
   * day-over-day change whenever we have it and the window ends on the latest day.
   *
   * The reconstruction runs on vwd daily closes, and those arrive at different
   * times per instrument: one feed carries today's close while another is still
   * on yesterday's. On such a day `pnl[last]` counts a move for the holdings that
   * updated and nothing for the rest — a partial figure that is neither today's
   * change nor the zero a real non-trading day would give. It is the exact number
   * a tester saw as "−0,58 %" while DEGIRO showed −2,5 %. DEGIRO computes its day
   * figure against every position's live price, so it has no such hole; when it is
   * present it is both more live and more honest than the reconstructed edge.
   *
   * Only at the tail (`last` is the newest day). A window dragged to end in the
   * past wants that past day's reconstructed change, not today's live one.
   */
  const atTail = last >= r.days.length - 1;
  const liveToday = atTail && typeof live?.todayPl === 'number' ? live.todayPl : null;
  // The percentage is the day result over the total it grew from — the previous
  // close, which is now-total minus today's result. Omitted, never faked, when
  // that base is not a usable positive number.
  const priorTotal =
    liveToday != null && typeof live?.totalValue === 'number' ? live.totalValue - liveToday : null;
  const usingLive = liveToday != null;
  const todayEur = usingLive ? liveToday : dayPnl;
  const todayPct = usingLive
    ? priorTotal > 1 ? (liveToday / priorTotal) * 100 : null
    : windowReturnPct(r, Math.max(0, last - 1), last);
  const updatedAt = live?.at ? new Date(live.at) : null;
  const todayNote = usingLive
    ? `DEGIRO live${
        updatedAt ? ` · ${updatedAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''
      } · this week ${fmtSigned(weekPnl)}`
    : `This week ${fmtSigned(weekPnl)}`;

  const whole = from <= 0 && last >= r.days.length - 1;
  // US-60's gap, one surface further in: the tile *notes* had never reached
  // `t()` at all, so `missing()` never counted them and the Dutch page carried
  // English under every figure. Found because US-54's score card is the first
  // thing that puts a note through the dictionary.
  const period = whole ? tr('all time') : `${formatDay(r.days[from])} — ${formatDay(r.days[last])}`;
  const windowPnl = sumWindow(r.pnl, from, last);
  // 'as of 8 aug 2026' when that is today reads as a stale number. It is only
  // a date when the window genuinely ends in the past.
  const asOf = last >= r.days.length - 1 ? tr('today') : formatDay(r.days[last]);

  const held = r.byProduct.filter((p) => Math.abs(p.qty[last]) >= 1e-9);
  const biggest = held.reduce((a, p) => (a && a.values[last] >= p.values[last] ? a : p), null);

  // Every tile names the sections it belongs to. Nineteen figures in one grid is
  // a wall nobody reads; the same nineteen split across the five sections that
  // already exist are four or five per screen, each answering a question the
  // charts underneath it are also about. `overview` is the headline set and
  // deliberately repeats a few, because that is what an overview is.
  /**
   * The result as a share of the money behind it.
   *
   * All-time uses everything paid in. A window uses what was already at work
   * when it opened plus anything added inside it — the money that could have
   * produced that result, and nothing earlier. Where neither is meaningful the
   * share is omitted rather than invented, which is the case for a window that
   * opens with an empty account.
   */
  const resultShare = (res, fromIdx, lastIdx, pnl) => {
    const paidTotal = res.cumulativeDeposited[lastIdx] ?? 0;
    const base = fromIdx <= 0
      ? paidTotal
      : (res.value[fromIdx - 1] ?? 0) + Math.max(0, paidTotal - (res.cumulativeDeposited[fromIdx - 1] ?? 0));
    /**
     * `base > 1`, not `Math.abs(base) > 1`, and the absolute value was a real
     * defect rather than a cautious guard.
     *
     * On an account that has been emptied, net paid in is **negative** — more has
     * come out than went in, which on a profitable account is simply the profit
     * withdrawn. Taking the absolute value then divided a result by money that had
     * come *out* and printed **+100,60 % of what you paid in**, which reads as
     * "you doubled your money" and means nothing at all: there is no money in to
     * be a share of.
     *
     * `returnOnMoneyIn` in `lib/snapshot.js` has always said this in words for the
     * share card — "more has come out than went in" — and this is the same
     * judgement, applied where the tile makes it.
     */
    if (!(base > 1)) return tr('no money in to compare against');
    return `${fmtPct((pnl / base) * 100)} ${tr('of what you paid in')}`;
  };

  const tiles = [
    // A value is a position, not a period: it is what the account was worth on
    // the last day of the window, and saying "as of" is what stops that reading
    // as today's number when it is not.
    { tabs: ['overview'], label: 'Total value', value: fmtEurCents(r.value[last]), note: tr('as of {when}', { when: asOf }) },
    {
      tabs: ['overview'],
      label: 'Money paid in',
      value: fmtEurCents(r.cumulativeDeposited[last]),
      note: tr('deposits minus withdrawals, to {when}', { when: asOf }),
    },
    /**
     * The percentage under a euro result is read as "that much of what I put
     * in", because the euro figure it sits under and the money-paid-in tile
     * beside it invite exactly that division. It was a **time-weighted chained
     * return** instead, and on one account that read **+207 %** next to
     * +€ 16 621 on € 16 676 paid in — two tiles apart, and a reader dividing
     * them gets 100 %.
     *
     * The chained return is not wrong, it answers a different question, and it
     * breaks down badly on an account that sat at three cents for three years:
     * the years with no money in them dominate a measure designed to ignore
     * when money arrived. It already has a home under **Annualised return →
     * The portfolio**, where it is labelled and explained.
     *
     * So this says what it looks like it says. The denominator is money paid
     * in, which cannot be near zero while there is a result to divide, so it
     * cannot produce the five-digit percentages this project has now shipped
     * twice.
     */
    {
      tabs: ['overview', 'perf'],
      label: 'Result',
      value: fmtSigned(windowPnl),
      note: `${resultShare(r, from, last, windowPnl)} · ${period}`,
      cls: signClass(windowPnl),
    },
    {
      tabs: ['overview'],
      label: 'Today',
      /**
       * The day in euros and in per cent, because neither answers the question
       * alone: +€ 2.535 says nothing about the size of the account it moved, and
       * +4.89% says nothing about how much money that is.
       *
       * When DEGIRO's own live day figure is available it is used for both — so
       * the number matches what the user sees in DEGIRO, and the ragged-edge
       * partial move never reaches the tile. Otherwise it falls back to the
       * engine's windowed return over the last two points, chained the same way
       * every other return on the page is, so it cannot disagree with them.
       */
      value: `${fmtSigned(todayEur)}${todayPct == null ? '' : `  ${fmtPct(todayPct)}`}`,
      note: todayNote,
      cls: signClass(todayEur),
    },
    {
      tabs: ['overview', 'income'],
      label: 'Dividend received',
      value: fmtEurCents(r.income.dividendGross + r.income.dividendTax),
      note: tr('{v} withheld · all time', { v: fmtEurCents(Math.abs(r.income.dividendTax)) }),
    },
    {
      tabs: ['income'],
      label: 'Fees paid',
      value: fmtEurCents(Math.abs(r.income.fees)),
      note: tr('transaction and service costs · all time'),
    },
    {
      // Deliberately its own tile rather than folded into "Fees paid": margin
      // interest is not a fee, `classify.js` has always kept the two apart, and
      // on a leveraged account it is the larger of the two. Signed, because a
      // credit balance earns interest and a debit balance pays it, and rolling
      // them into one absolute number would hide which way it went.
      tabs: ['income'],
      label: 'Interest',
      value: fmtSigned(r.income.interest),
      note: tr('margin and cash interest · all time'),
      cls: signClass(r.income.interest),
    },
    {
      // Fees, withheld dividend tax and interest paid, added up. Each of the
      // three is small and forgettable on its own, which is exactly why the sum
      // is worth stating: it is what holding this account has cost.
      tabs: ['income'],
      label: 'Total cost',
      value: fmtEurCents(costOfHolding(r)),
      note: tr('fees, withheld tax and interest paid · all time'),
    },
    {
      tabs: ['perf'],
      label: 'Realised',
      value: fmtSigned(r.realised),
      note: tr('banked, from {n} closed positions', {
        n: r.byProduct.filter((p) => Math.abs(p.qty.at(-1)) < 1e-9).length,
      }),
      cls: signClass(r.realised),
    },
    {
      tabs: ['perf'],
      label: 'Unrealised',
      value: fmtSigned(r.unrealised),
      note: tr('still riding on prices · all time'),
      cls: signClass(r.unrealised),
    },
    drawdownTile(r, from, last, period),
    positiveMonthsTile(r),
    bestWorst(r, 'best'),
    bestWorst(r, 'worst'),
    bestWorstPosition(r, 'best', from, last, period),
    bestWorstPosition(r, 'worst', from, last, period),
    {
      tabs: ['holdings', 'comp'],
      label: 'Positions held',
      value: String(held.length),
      // Singular and plural as separate keys, not an English `s` appended:
      // Dutch does not build its plural that way.
      note: tr(r.byProduct.length === 1 ? '{n} instrument ever held' : '{n} instruments ever held', {
        n: r.byProduct.length,
      }),
    },
    {
      // Concentration, said plainly. A portfolio where one name is 60 % of the
      // value behaves like that name, whatever the other twelve rows suggest.
      tabs: ['holdings', 'comp'],
      label: 'Largest position',
      value: r.value[last] > 0 && biggest ? pct((biggest.values[last] / r.value[last]) * 100) : '—',
      note: biggest
        ? tr('{name} · of total value', { name: biggest.symbol || biggest.name })
        : tr('nothing held'),
    },
    {
      tabs: ['holdings', 'comp'],
      label: 'Cash',
      value: fmtEurCents(r.cash[last]),
      note: r.value[last] > 0
        ? tr('{pct} of the total', { pct: pct((r.cash[last] / r.value[last]) * 100) })
        : tr('of the total'),
    },
    {
      // The honesty tile. A history reconstructed largely from stale prices is
      // a different object from one reconstructed from quotes, and until now the
      // page only said so in a yellow banner about instruments.
      tabs: ['overview', 'holdings'],
      label: 'Data coverage',
      value: `${(100 - (r.coverage.estimated / Math.max(1, r.coverage.days)) * 100).toFixed(1)}%`,
      note: tr('{a} of {b} days estimated', {
        a: r.coverage.estimated.toLocaleString('nl-NL'),
        b: r.coverage.days.toLocaleString('nl-NL'),
      }),
    },
  ];

  return tiles;
}

/**
 * Put them on screen: one hero, three facts, the rest behind a disclosure — and
 * the Optimism Mode substitution, which happens here and nowhere earlier.
 */
/**
 * The last figure each tile showed, so a change can be told from a repaint.
 *
 * Keyed by the tile's label rather than by position: the sections show
 * overlapping subsets and the order inside one is not stable across tabs, so an
 * index would call a tab switch a change and animate figures that did not move.
 */
const lastTileValue = new Map();

function renderTiles(r, from = 0, to = r.days.length - 1, live = null) {
  const tiles = buildTiles(r, from, to, live);

  /**
   * Optimism Mode, applied at the last possible moment.
   *
   * Deliberately here and nowhere earlier: every number above this line is the
   * real one, so nothing downstream of the engine — the export, the bug report,
   * a chart's own data — can ever see the cheerful version. It is a rendering
   * state and the quarantine is structural rather than promised.
   */
  const cheerful = frown.isOn() && state.tab === 'overview';

  // Replaced outright rather than flipped: a flipped "Deepest fall" is a joke
  // about a tile, and "847 days of unwavering belief" is a joke about the
  // person. Same data, funnier. See `optimismTiles`.
  const shown = cheerful
    ? frown.optimismTiles(r, fmtSigned, frown.subjectOf(r)).map((t) => ({ ...t, tabs: ['overview'], cls: 'up' }))
    : tiles;

  /**
   * One hero, three facts, and everything else behind a disclosure.
   *
   * The seven tiles were equal in size, box and dot, so "Data coverage 100.0%"
   * competed with the total value — and the reader opened the page for one
   * number. Nothing is dropped: the rest moves into *All figures*, open by
   * default, which loses the equality rather than the content.
   *
   * Which figure is the hero is the order of the `tiles` array above, per
   * section, because that order already carries the author's intent — Total
   * value leads Overzicht, Result leads Rendement, Dividend leads Inkomsten.
   * A separate hero list would be a second place to keep in sync.
   */
  const mine = shown.filter((t) => t.tabs.includes(state.tab));

  /**
   * The crawl. Filled here for the same reason the cheerful tiles are: this is
   * the one place in the app that is allowed to know the mode is on, and every
   * figure in it is one the tiles already carry.
   *
   * The items are written twice into the track, which is what makes a CSS
   * marquee loop seamlessly — the animation translates by exactly half the
   * track's width, so the copy is under the cursor the moment the original
   * leaves.
   */
  const run = cheerful
    ? frown.hypeTicker(r, fmtSigned, frown.subjectOf(r)).map((x) => `<span>${esc(x)}</span>`).join('')
    : '';
  for (const track of document.querySelectorAll('.frown-ticker-track')) {
    // Twice, whether or not it is empty: one loop for both crawls, and the
    // emptying is the same statement as the filling.
    track.innerHTML = run + run;
  }

  /**
   * US-65 — the honest number change.
   *
   * When the range changes a hero figure jumps, and the obvious move is a
   * count-up tween. It stays **rejected**: every frame of a count-up shows a
   * value the account never had, which is the one thing this project refuses.
   * The honest form is a *swap* — the old string leaves and the new one arrives,
   * with nothing in between.
   *
   * That is not a softer version of the same idea, it is a different one. A
   * tween interpolates the *number*; this animates the *element*, and the only
   * two pieces of text that exist are the two the formatters produced. There is
   * no code path here that could compute a third.
   *
   * Only on a real change (AC4): transitioning on every render would flicker on
   * a tab switch that changed nothing.
   */
  const cell = (t, kind) => {
      // `signClass` returns 'up' / 'down', not 'pos' / 'neg'. Guessing that
      // wrong made the whole feature a no-op that still looked wired up.
      const down = !cheerful && t.cls === 'down';
      const value = cheerful && down ? frown.cheerUp(t.value) : t.value;
      const note = cheerful && down ? frown.spin(t.label) : t.note;
      const cls = cheerful && down ? 'up flipped' : (t.cls ?? '');
      /**
       * Both strings come from the formatters, so a masked figure transitions as
       * a mask (AC3) with nothing here knowing that it is one. The first sight
       * of a tile is not a change — `previous` is undefined and it simply draws.
       */
      const previous = lastTileValue.get(t.label);
      const changed = previous !== undefined && previous !== value;
      lastTileValue.set(t.label, value);
      return `
      <div class="tile ${kind}${cheerful && down ? ' tile-flipped' : ''}">
        <div class="label">${esc(tr(t.label))}${
          TILE_TIPS[t.label]
            ? `<button type="button" class="info" aria-label="${esc(tr(t.label))}"
                 data-tip="${esc(tr(TILE_TIPS[t.label]))}">i</button>`
            : ''
        }</div>
        <div class="value ${cls}${changed ? ' swap' : ''}" style="--len:${[...value].length}">${
          changed ? `<span class="swap-in">${esc(value)}</span>`
            + `<span class="swap-out" aria-hidden="true">${esc(previous)}</span>` : esc(value)
        }</div>
        <div class="note">${esc(note)}</div>
      </div>`;
  };

  const [hero, ...others] = mine;
  const facts = others.slice(0, 3);
  const rest = others.slice(3);
  /**
   * US-54. One share button on the block, not one per figure. Nineteen figures
   * would be nineteen buttons; which figure is chosen in the sheet, beside the
   * preview that shows it.
   *
   * It stays put while Optimism Mode is on, and the card it opens carries the
   * **real** number — `scoreModel` reads `buildTiles`, which has never heard of
   * the cheerful list. That is deliberate rather than convenient: this card also
   * carries a reconciliation verdict, and a gag figure wearing a trust badge is
   * the one thing this feature must not produce. The picker listing the real
   * labels while the block shows joke ones is the honest mismatch.
   */
  const shareBtn = `<button type="button" class="snap block-share" data-score="${esc(state.tab)}"
      title="${esc(tr('Share a figure from this section'))}"
      aria-label="${esc(tr('Share a figure from this section'))}">⧉</button>`;

  $('#tiles').innerHTML = mine.length
    ? `<div class="hero-row">
        ${hero ? cell(hero, 'is-hero') : ''}
        <div class="facts">${facts.map((t) => cell(t, 'is-fact')).join('')}</div>
        ${shareBtn}
      </div>` +
      (rest.length
        ? `<details class="allfigures" open>
             <summary>${esc(tr('All figures'))}</summary>
             <div class="figures-grid">${rest.map((t) => cell(t, 'is-fig')).join('')}</div>
           </details>`
        : '')
    : '';
}

/**
 * One tooltip element for the whole page, positioned where it is asked for.
 *
 * `position: fixed` and a single shared node, rather than a `::after` on each
 * button, for one concrete reason: `.tiles` sets `overflow: hidden` so its
 * rounded corners clip the cells, and anything a tile tries to draw outside
 * itself is cut off at that edge. A tooltip on the last row would be a sliver.
 * Fixed positioning is measured against the viewport, so it escapes.
 *
 * Hover *and* focus, because a control that only answers a mouse answers nobody
 * on a keyboard or a touchscreen — the same argument the Candles button lost in
 * 0.15.0. Escape closes it.
 */
function wireTips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  const hide = () => {
    tip.hidden = true;
  };
  // US-93: the drag path (US-87) hides the tip the moment a header drag starts
  // and keeps it away until the drop — a tooltip riding a dragged column is
  // noise. The header code calls this; it is the only outside caller.
  hideTip = hide;

  const show = (btn) => {
    if (holdingsDragMoved) return; // mid-drag; the tip stays away until the drop
    tip.textContent = btn.dataset.tip;
    tip.hidden = false;

    // Measure after it has content, then clamp to the viewport so a tile at the
    // right-hand edge does not push it off screen.
    const b = btn.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, b.left + b.width / 2 - t.width / 2), window.innerWidth - t.width - margin);
    // Above by preference; below when there is no room, which is what happens
    // for the first row of tiles on a short window.
    const above = b.top - t.height - margin;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(above >= margin ? above : b.bottom + margin)}px`;
  };

  /**
   * Delegated per root: the tiles are rebuilt on every render, so per-button
   * listeners would have to be re-attached each time and the old ones leak.
   *
   * A decided list of roots, deliberately not one listener on `document`: this
   * is the list of the places that carry an explanation, which is a decision,
   * where a document-wide listener would silently adopt any `[data-tip]`
   * anybody adds anywhere (rule 8's "no abstraction with one implementation"
   * cuts both ways). Four since US-93: the tiles and the More menu (US-79),
   * the Positions header and its column chooser.
   *
   * `tap` is per root, and the header's is off on purpose: a tap on a column
   * head is already taken — it sorts, and the render that follows would leave
   * the tip orphaned over a rebuilt header. Touch reaches the header texts
   * through the chooser instead (US-67: nothing is hover-only).
   */
  const roots = [
    { el: $('#tiles'), tap: true },
    { el: $('#more-menu'), tap: true },
    { el: $('#holdings thead'), tap: false },
    { el: $('#holdings-columns'), tap: true },
  ];
  for (const { el: root, tap } of roots.filter((r) => r.el)) {
    root.addEventListener('pointerover', (e) => {
      const btn = e.target.closest?.('[data-tip]');
      if (btn) show(btn);
    });
    root.addEventListener('pointerout', (e) => {
      if (e.target.closest?.('[data-tip]')) hide();
    });
    root.addEventListener('focusin', (e) => {
      const btn = e.target.closest?.('[data-tip]');
      if (btn) show(btn);
    });
    root.addEventListener('focusout', hide);
    // A tap on a touchscreen is a click, not a hover. Capture phase, because
    // the column chooser's popup stops click propagation to survive the
    // document-level click-away closer — which would silently eat the tap
    // that US-93 routes through it. Capture runs before any bubble handler
    // can stop anything, and the popup's own guard keeps working.
    if (tap) {
      root.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-tip]');
        if (btn) show(btn);
      }, { capture: true });
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  // A tooltip pinned to a coordinate is wrong the moment the page moves.
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide);
}

/**
 * The explanation behind each tile's "i".
 *
 * A number on a dashboard is an assertion, and several of these are assertions
 * a reader would reasonably get wrong: that fees include what margin costs
 * (they do not), that a deposit is a gain (it is not), that "biggest winner" is
 * a trade (it is a position). The caveats existed only in the changelog and in
 * comments, which is to say nowhere the person reading the number will look.
 *
 * Kept as one table rather than inline so the wording is reviewable in one
 * place, and because a tile with no entry here should be conspicuous.
 */
const TILE_TIPS = {
  'Total value': 'Your positions at their closing prices plus cash, on the last day of the range. It is what the account was worth, not what you would receive: no selling costs and no tax are taken off.',
  'Money paid in': 'Deposits minus withdrawals — only money that crossed the boundary between you and the broker. Dividends, fees and interest are internal to the account and are not in here; they are part of the result instead.',
  Result: 'What the account made, with deposits and withdrawals taken out, so paying money in never looks like a gain. The percentage chains the daily returns rather than dividing by the opening value, so a deposit landing mid-range does not flatter it.',
  Today: 'DEGIRO’s own result so far today on the positions you hold, taken from the last sync — so it matches the figure in DEGIRO itself. If the market is still open it can still move before the close. When that live figure is not available it falls back to the last day’s reconstructed change, which is zero on a day with no trading.',
  'Dividend received': 'Cash that actually landed, net of the tax withheld at source. The withheld amount is stated separately because you may be able to reclaim part of it.',
  'Fees paid': 'Transaction and service costs only: courtage, connectivity, custody and third-party charges. It does not include what a margin balance costs you — that is Interest, and on a leveraged account it is usually the larger of the two.',
  Interest: 'Credit and debit interest, including the financing cost of a margin (debit) balance. Negative means you paid it. Kept apart from Fees because a financing cost is not a fee.',
  'Total cost': 'Fees, withheld dividend tax and interest paid, added together — what holding this account has cost you. Each is easy to ignore alone, which is the argument for the sum.',
  Realised: 'The whole result of every position you no longer hold. Banked: it cannot change any more.',
  Unrealised: 'What the positions you still hold have made so far. It moves with prices every day and is not yours until you sell.',
  'Deepest fall': 'The worst peak-to-trough fall in the range, measured on the curve with deposits and withdrawals removed. That matters: on portfolio value, the day you withdrew money would be reported as the worst market event of your life.',
  'Months in profit': 'How many calendar months ended up, out of every full month in the history. Not the selected range.',
  'Best month': 'As a percentage rather than in euros, because €500 on a small portfolio and €500 on a large one are not the same month. Whole history.',
  'Worst month': 'As a percentage rather than in euros, because €500 on a small portfolio and €500 on a large one are not the same month. Whole history.',
  'Biggest winner': 'The instrument that made the most over the selected range — per instrument, not per trade. A single sale has no result of its own: what it “made” depends on which purchase you match it against, and this project deliberately never picks between FIFO and average cost.',
  'Biggest loser': 'The instrument that lost the most over the selected range — per instrument, not per trade, for the same reason as the winner: a sale’s profit depends on which purchase you match it against.',
  'Positions held': 'Instruments with a non-zero quantity today, against how many you have ever held. Options and other contracts count as one position each.',
  'Largest position': 'The biggest single holding as a share of the total. Concentration, said plainly: a portfolio where one name is 60 % of the value behaves like that name, whatever the other rows suggest.',
  Cash: 'Uninvested cash, and how much of the total it is. It is in the value chart unless you switch it off with the checkbox.',
  'Data coverage': 'How many days were valued from a real closing price rather than from the last one known. An instrument DEGIRO has no chart for is held flat at the price it last traded at, so its movement in between is not real — this says how much of the history that affects.',
};

/**
 * A share of something, unsigned. `fmtPct` always writes a sign because it
 * reports a *return*, where the direction is the news; "+58.8 % of months were
 * profitable" reads as a change in that share rather than the share itself.
 */
const pct = (n) => `${n.toFixed(1)}%`;

/** Fees, withheld dividend tax and interest paid — all reported as positive costs. */
function costOfHolding(r) {
  const interestPaid = Math.min(0, r.income.interest);
  return Math.abs(r.income.fees) + Math.abs(r.income.dividendTax) + Math.abs(interestPaid);
}

function drawdownTile(r, from, to, period) {
  const d = maxDrawdown(r, from, to);
  if (!d.amount) return { tabs: ['perf'], label: 'Deepest fall', value: '—', note: tr('nothing lost from a peak · {period}', { period }) };
  return {
    tabs: ['perf', 'overview'],
    label: 'Deepest fall',
    value: fmtSigned(d.amount),
    // Where and how long, because a 20 % fall that took three years to recover
    // is a different experience from one that lasted a fortnight.
    note: `${fmtPct(d.pct)} · ${formatDay(r.days[d.from])} → ${formatDay(r.days[d.to])}`,
    cls: 'down',
  };
}

function positiveMonthsTile(r) {
  const months = monthlyTable(r).years.flatMap((y) => y.months.filter(Boolean));
  if (!months.length) return { tabs: ['perf'], label: 'Months in profit', value: '—', note: tr('no full month yet') };
  const up = months.filter((m) => m.pnl > 0).length;
  return {
    tabs: ['perf'],
    label: 'Months in profit',
    value: pct((up / months.length) * 100),
    note: tr('{up} of {n} months · whole history', { up, n: months.length }),
  };
}

/**
 * Collect everything the page has to say, then put it in two places.
 *
 * The page used to stack every notice at the top, so eight of them pushed the
 * first chart below the fold and the one that mattered looked like the seven
 * that did not. They now live in their own section — but **not all of them**,
 * and the exception is the point rather than an inconsistency:
 *
 * > Anything that makes a number untrustworthy stays pinned to the top of every
 * > section, where it cannot be navigated away from.
 *
 * A reconciliation that is off by a cent means the whole history is wrong
 * (CLAUDE.md rule 6). Filing that behind a tab would be softening it, which is
 * the one thing that rule forbids.
 */
/**
 * The date the figures stand at: the last sync, or the day the data reaches.
 *
 * `lastSyncAt` rather than `disconnectedAt`, because what a reader wants is the
 * age of the numbers, not the age of the decision — disconnecting a month after
 * the last sync does not make the figures a month younger.
 */
function asOfLabel(data) {
  if (data.lastSyncAt) return new Date(data.lastSyncAt).toLocaleString('nl-NL');
  return data.result?.days?.at?.(-1) ?? tr('an unknown date');
}

/**
 * US-79 AC5 — the reconciliation verdict, dated, and otherwise untouched.
 *
 * Rule 6's verdict is a statement about the moment DEGIRO's total was fetched.
 * Frozen it stays true *as of that date* and says so; it is not re-asserted as
 * today's, and it is **not softened** either — a red verdict stays red and keeps
 * its colour, because disconnecting is not a way to make a failed reconciliation
 * go away. Empty while connected, so nothing changes for anybody else.
 */
function asOfClause(data) {
  return data.disconnected ? ` ${tr('Checked at the last sync, on {date}; nothing has been checked since.', { date: asOfLabel(data) })}` : '';
}

function renderBanners(data, r) {
  const notes = [];
  const add = (level, title, body, { pinned = false } = {}) => notes.push({ level, title, body, pinned });

  if (data.mode === 'demo') {
    add(
      'info',
      'Demo data',
      tr(
        'These charts are built from generated fixtures with the same code path that runs against your real account — good for checking the UI, useless as financial information.',
      ),
    );
  }

  /**
   * US-79 AC4 — a frozen account says so, at the top, on every section.
   *
   * Pinned rather than filed under Notices for the same reason the reconciliation
   * verdict is: a figure with no date is a claim about today, and every number on
   * this page is now as old as the last sync. The date is not optional here —
   * *"this is the difference between a record and a lie, and it is the whole
   * reason the story is allowed to keep showing amounts at all."*
   */
  if (data.disconnected) {
    add(
      'info',
      'Disconnected',
      tr(
        'This account is disconnected: the account number is forgotten, nothing is being fetched, and every figure below is frozen as it stood on {date}. Press Sync now to reconnect — you are still logged in at DEGIRO.',
        { date: asOfLabel(data) },
      ),
      { pinned: true },
    );
  }

  if (r.reconciliation) {
    if (r.reconciliation.ok) {
      /**
       * Two checks wearing one badge would be a lie by omission. A `reported`
       * anchor is DEGIRO's own stated total; a `derived` one is the sum of the
       * position values and the cash balance it stated instead, used because
       * two real accounts send no total at all. The derived one cannot catch an
       * error DEGIRO's own position values already contain, and the page says
       * so rather than letting a green tick imply otherwise.
       */
      const derived = r.reconciliation.source === 'derived';
      add(
        'ok',
        derived ? 'Total matches what DEGIRO reports' : 'Total matches DEGIRO',
        (derived
          ? tr(
              'Reconstructed total is exactly {total}. DEGIRO sent no account total this sync, so this is checked against the sum of the position values and the cash balance it did send — an independent check, but one that cannot catch an error already in DEGIRO’s own position values.',
              { total: fmtEurCents(r.reconciliation.live) },
            )
          : tr('Reconstructed total is exactly {total}.', { total: fmtEurCents(r.reconciliation.live) })
        ) + asOfClause(data),
      );
    } else {
      /**
       * US-81 AC1 — a failing check says what it failed against.
       *
       * The banner used to name two amounts and a difference and stop, and those
       * three are the same whichever anchor was used. They are not the same
       * defect: against DEGIRO's own stated total the gap is in this extension's
       * ledger, while against a derived anchor the gap may be in the anchor —
       * `liveCash` is one field picked out of DEGIRO's totals, and if the balance
       * is split across two of them, the comparison is short and the history is
       * fine. One account has read "still open" for two releases with nothing on
       * screen to tell a reader which of the two they were looking at.
       *
       * No number changes here: the sentence is added, and the arithmetic above it
       * is untouched.
       */
      const derived = r.reconciliation.source === 'derived';
      add(
        'error',
        NOTE_TITLES['reconciliation-failed'],
        `${tr(
          'Reconstructed total is {ours} but DEGIRO reports {theirs} — off by {diff}. If today is wrong, the history is wrong too. Do not trust these charts until this is zero.',
          {
            ours: fmtEurCents(r.reconciliation.reconstructed),
            theirs: fmtEurCents(r.reconciliation.live),
            diff: fmtSigned(r.reconciliation.diff),
          },
        )} ${
          derived
            ? tr('DEGIRO sent no account total this sync, so this is compared against the sum of the position values and the cash balance it did send. If that cash figure is not the whole balance, the difference is in the comparison rather than in your history — send the bug report, it now says how the cash splits.')
            : tr('This is DEGIRO’s own stated account total, so the difference is in this extension’s ledger rather than in the comparison. Send the bug report: it now says which cash categories the difference matches.')
        }${asOfClause(data)}`,
      );
    }
  } else if (r.days.length) {
    // No anchor at all is not the same as a passing check, and it used to look
    // identical: no green banner, no red one, nothing. One real account reports
    // exactly this, and its eighteen price rescales have nothing to be verified
    // against.
    const fields = data.meta?.liveTotalFields;
    add(
      'warn',
      'Nothing to reconcile against',
      tr(
        'DEGIRO did not report a current total this sync, so the one check that would confirm these numbers could not run. Press Sync now while logged in to DEGIRO.',
      ) +
        // Which is a different problem from an empty response, and until now
        // the two looked the same. The names travel in the bug report.
        (fields?.length
          ? ' ' +
            tr(
              'It did send {n} other field(s) for the account total ({names}), so the total is probably there under a name this extension does not know yet — please send the bug report.',
              { n: fields.length, names: fields.slice(0, 8).join(', ') + (fields.length > 8 ? ', …' : '') },
            )
          : ''),
    );
  }

  // A window DEGIRO would not serve, even narrowed to a single month. The sync
  // now keeps everything it did fetch instead of throwing the lot away — which
  // is only defensible if the hole is stated as loudly as the failure was.
  const holes = data.meta?.missingWindows;
  if (holes?.length) {
    add(
      'error',
      tr('Part of your history could not be fetched'),
      tr('DEGIRO refused {n} date window(s) even one month at a time: {windows}. Those rows are missing from everything on this page. Press Sync now to try them again — this is usually temporary.',
        { n: holes.length, windows: holes.slice(0, 6).map((g) => `${g.from}…${g.to} (${g.status})`).join(', ') }),
    );
  }

  // The quietest failure there is, said out loud. A parser that silently drops
  // rows produces a successful sync over an incomplete history, and the
  // reconciliation reports the shortfall with no explanation for it.
  const unread = data.meta?.unreadableRows;
  if (unread) {
    const total = (unread.transactions?.count ?? 0) + (unread.cashRows?.count ?? 0);
    const reasons = [
      ...Object.entries(unread.transactions?.reasons ?? {}).map(([k, n]) => `${n}× ${k} (transactions)`),
      ...Object.entries(unread.cashRows?.reasons ?? {}).map(([k, n]) => `${n}× ${k} (cash)`),
    ].join(', ');
    add(
      'error',
      tr('DEGIRO sent rows this extension could not read'),
      tr('{n} row(s) arrived in a shape the parser did not recognise and were left out: {reasons}. Everything above is missing them, so treat it as incomplete rather than wrong — and send the bug report, because this is what a renamed field looks like.',
        { n: total, reasons }),
    );
  }

  /**
   * US-17. A load-bearing field that stopped arriving.
   *
   * Louder than the unreadable-row notice above, and deliberately: that one
   * counts rows the parser rejected outright, which is visible in the total. This
   * is the *silent* case — `pick` fell through to `0`, every row parsed cleanly,
   * and the page draws a plausible chart out of nothing. CLAUDE.md already says
   * loose parsing that silently returns `0` is worse than a loud failure, so a
   * load-bearing field absent on effectively every row is an error banner naming
   * the field, in the same class as the reconciliation check.
   *
   * A rate, never a count: absent on 3 of 1 457 rows is ordinary sparse data and
   * raises nothing. `config.js` holds the threshold, reviewed by a human rather
   * than derived from the rows it polices.
   */
  for (const a of fieldAlarms(data.meta?.fieldStats)) {
    add(
      'error',
      tr('DEGIRO has stopped sending “{field}”', { field: a.field }),
      tr('Absent on {missed} of {rows} rows, and this extension reads it as zero — so every figure measured from it is wrong rather than missing. This is what a renamed field looks like. Send the bug report: it carries the names that used to work ({names}), which is what somebody needs to find the new one.',
        { field: a.field, missed: a.missed, rows: a.rows, names: a.everMatched.join(', ') || '—' }),
    );
  }

  /**
   * Failures from the contexts nobody was looking at.
   *
   * A background sync that has been failing every hour for a week is the single
   * most valuable thing this page can tell someone, and until now it told them
   * nothing: the worker is torn down thirty seconds after it fails, and the
   * only place the failure existed was a `catch` that discarded it. A warning
   * rather than an error, because the page in front of you is working — the
   * data behind it is just older than it looks.
   */
  const background = (data.meta?.persistedErrors ?? []).filter((e) => e?.message);
  if (background.length) {
    const worst = [...background].sort((a, b) => (b.count ?? 1) - (a.count ?? 1))[0];
    const times = background.reduce((n, e) => n + (e.count ?? 1), 0);
    add(
      'warn',
      tr('Something failed in the background'),
      tr('{times} failure(s) happened while nothing was on screen, most often: {message} ({where}). The chart is built from whatever the last successful sync fetched, so it may be out of date rather than wrong. The bug report carries all of them.',
        { times, message: worst.message, where: worst.where ?? tr('unknown') }),
    );
  }

  // Warnings arrive one per instrument, so a portfolio missing 79 price series
  // would otherwise bury the page in 79 identical rows. One per kind, with a
  // count, and the detail stays in the exported JSON.
  const seen = new Map();
  for (const w of r.warnings) {
    const group = seen.get(w.code) ?? { ...w, count: 0 };
    group.count++;
    seen.set(w.code, group);
  }
  for (const w of seen.values()) {
    const level = w.level === 'error' ? 'error' : w.level === 'info' ? 'info' : 'warn';
    const title = NOTE_TITLES[w.code] ?? w.code;
    add(level, w.count > 1 ? `${title} (${w.count}×)` : title, w.message);
  }

  state.notes = notes;

  /**
   * Pinned: errors, and the one note that is not an error but changes what every
   * figure below it means.
   *
   * US-79 added the second case. A disconnected account is not a failure and must
   * not be coloured as one — it is a state somebody chose — but *"every number on
   * this page is as old as the last sync"* is exactly the kind of thing this
   * section exists to keep in front of the reader rather than one click away. So
   * it is pinned at its own level, and the level still carries the colour.
   */
  $('#banners').innerHTML = '';
  for (const n of notes.filter((n) => n.level === 'error' || n.pinned)) {
    $('#banners').append(makeBanner(n.level, `${tr(n.title)} — ${n.body}`));
  }

  renderNotes(notes);
}

const LEVEL_ORDER = { error: 0, warn: 1, info: 2, ok: 3 };
const LEVEL_LABEL = { error: 'Error', warn: 'Warning', info: 'Note', ok: 'OK' };
/** Severity words are translated at the point of display, not in the table. */
const levelWord = (k) => tr(LEVEL_LABEL[k]);

function renderNotes(notes) {
  const counts = { error: 0, warn: 0, info: 0, ok: 0 };
  for (const n of notes) counts[n.level]++;

  $('#note-chips').innerHTML = ['error', 'warn', 'info', 'ok']
    .filter((k) => counts[k])
    .map((k) => `<span class="chip ${k}">${counts[k]} ${esc(levelWord(k))}</span>`)
    .join('');

  const sorted = [...notes].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  $('#notes').innerHTML = sorted.length
    ? sorted
        .map(
          (n) => `
      <div class="note-row ${n.level}">
        <span class="chip ${n.level}">${esc(levelWord(n.level))}</span>
        <div>
          <div class="note-title">${esc(tr(n.title))}</div>
          <div class="note-body">${esc(n.body)}</div>
        </div>
      </div>`,
        )
        .join('')
    : `<p class="hint">${esc(tr('Nothing to report.'))}</p>`;

  // The count is how many rows are in there, so the tab never says 0 over a
  // section with something in it. The *colour* is the severity: grey when
  // nothing is asking for anything, and red or amber when something is. A
  // healthy account reads "Notices 2" in grey, not "2 problems".
  const tab = $('#tabs')?.querySelector('button[data-tab="notices"] .count');
  if (tab) {
    tab.textContent = String(notes.length);
    tab.classList.toggle('bad', counts.error > 0);
    tab.classList.toggle('warn', counts.error === 0 && counts.warn > 0);
  }
}

// ---------------------------------------------------------------------------
// month × year grid, and the month comparison
// ---------------------------------------------------------------------------

const isPct = () => state.metric === 'returnPct';
const fmtMetric = (v) => (isPct() ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : fmtSigned(v));

/**
 * Diverging tint: blue for a gain, red for a loss, nothing at zero.
 *
 * Kept as a light wash rather than a saturated block — the number in the cell
 * is the real content and has to stay readable, so the colour is a second
 * channel on top of it, never the only one. Magnitude is square-rooted so a
 * quiet month is still visibly non-zero next to an outlier.
 */
function divergingTint(value, maxAbs, t) {
  if (!value || !maxAbs) return 'transparent';
  const strength = Math.min(1, Math.sqrt(Math.abs(value) / maxAbs));
  return alpha(value > 0 ? t.pos : t.neg, 0.08 + strength * 0.42);
}

function renderMonthMatrix(months, t, windowFrom = null, windowTo = null) {
  const table = $('#months');
  /**
   * Brief §4: the matrix keeps every year and greys the months outside the
   * window rather than dropping them.
   *
   * Its whole point is comparison across years — filter it to the window and
   * March 2024 has nothing to sit next to. So the rows stay and the cells the
   * period excludes are dimmed: still readable, visibly not part of the figures
   * above them.
   */
  const inWindow = (key) => !windowFrom || (key >= windowFrom.slice(0, 7) && key <= windowTo.slice(0, 7));
  const maxAbs = isPct() ? months.maxAbsPct : months.maxAbsPnl;
  const extremes = isPct() ? months.byPct : months.byPnl;
  const extremeKeys = new Set([extremes?.best?.month, extremes?.worst?.month].filter(Boolean));

  if (!months.years.length) {
    table.innerHTML = '';
    $('#month-note').textContent = 'No completed months yet.';
    $('#month-scale').innerHTML = '';
    return;
  }

  const head =
    `<thead><tr><th class="year">Year</th>` +
    MONTH_NAMES.map(
      (m, i) =>
        `<th><button type="button" class="month-pick" data-month="${i + 1}" aria-pressed="${state.selectedMonths.includes(i + 1)}">${m}</button></th>`,
    ).join('') +
    `<th class="total">Year</th></tr></thead>`;

  const body = months.years
    .map((row) => {
      const cells = row.months
        .map((c) => {
          if (!c) return `<td class="cell empty">·</td>`;
          const v = c[state.metric];
          // A picked cell is ringed in the same hue as its bar in the chart
          // below, so the grid and the comparison read as one thing — and so
          // the ring cannot be confused with the best/worst outline.
          const pick = state.selectedCells.indexOf(c.month);
          const cls = `cell${extremeKeys.has(c.month) ? ' extreme' : ''}${pick >= 0 ? ' picked' : ''}${inWindow(c.month) ? '' : ' out'}`;
          const ring = pick >= 0 ? `;outline-color:${t.series[pick % t.series.length]}` : '';
          return `<td class="${cls}" style="background:${divergingTint(v, maxAbs, t)}${ring}" title="${esc(c.month)}: ${esc(fmtEurCents(c.pnl))} · ${c.returnPct.toFixed(2)}%"><button type="button" class="cell-pick" data-cell="${esc(c.month)}" aria-pressed="${pick >= 0}">${esc(fmtMetric(v))}</button></td>`;
        })
        .join('');
      return `<tr><td class="year">${esc(row.year)}</td>${cells}<td class="total">${esc(fmtMetric(row.total[state.metric]))}</td></tr>`;
    })
    .join('');

  table.innerHTML = `${head}<tbody>${body}</tbody>`;

  for (const btn of table.querySelectorAll('.month-pick')) {
    btn.addEventListener('click', () => toggleMonth(Number(btn.dataset.month)));
  }
  for (const btn of table.querySelectorAll('.cell-pick')) {
    btn.addEventListener('click', () => toggleCell(btn.dataset.cell));
  }

  // A diverging ramp needs its legend, or the tints are decoration.
  const steps = [-1, -0.6, -0.25, 0, 0.25, 0.6, 1];
  $('#month-scale').innerHTML =
    `<span>${esc(fmtMetric(-maxAbs))}</span>` +
    `<span class="ramp">${steps
      .map((s) => `<span style="background:${s === 0 ? 'transparent' : divergingTint(s, 1, t)}"></span>`)
      .join('')}</span>` +
    `<span>${esc(fmtMetric(maxAbs))}</span>` +
    `<span class="muted">· loss ← no change → gain</span>`;

  const note = isPct()
    ? 'Return is chained daily and excludes deposits and withdrawals, so a month you paid money in is not flattered by it.'
    : 'Euro results are not comparable across years on their own — €500 on a small portfolio is a very different month from €500 on a large one. Switch to Return % for that.';
  $('#month-note').textContent = `${note} Best and worst month are outlined.`;
}

/**
 * Compare specific months — September 2025 against November 2020.
 *
 * A different question from the across-years view, and a weaker one: twelve
 * Septembers are a pattern, one September against one November is two numbers.
 * So the aggregate columns are gone. Averaging a single observation, or
 * reporting "1 of 1 positive", would dress two data points up as evidence.
 * What replaces them is where each month sits in the whole history, which is
 * context a single month can actually carry.
 *
 * Colour follows selection order here rather than the month, because two
 * Septembers in different years have nothing to distinguish them by month.
 */
function renderCellCompare(months, t) {
  const all = months.years.flatMap((y) => y.months.filter(Boolean));
  const byKey = new Map(all.map((c) => [c.month, c]));
  const picked = state.selectedCells.filter((k) => byKey.has(k));

  const ranked = all.slice().sort((a, b) => b[state.metric] - a[state.metric]);
  const rankOf = new Map(ranked.map((c, i) => [c.month, i + 1]));

  $('#compare-hint').textContent =
    `Comparing ${picked.map(labelForCell).join(' vs ')}, ranked against all ${all.length} months on record — ` +
    `the best was ${labelForCell(ranked[0].month)} at ${fmtMetric(ranked[0][state.metric])}. Click a month again ` +
    `to remove it, or a month name in the header to compare one month across every year (up to ${MAX_COMPARE_CELLS}).`;

  $('#compare-box').hidden = false;
  $('#compare-summary-wrap').hidden = false;

  const series = picked.map((key, i) => ({
    label: labelForCell(key),
    colour: t.series[i % t.series.length],
    values: [byKey.get(key)[state.metric]],
  }));
  state.charts.compare = monthCompareChart($('#c-compare'), { years: [''], series }, state.metric, t);

  $('#compare-summary thead').innerHTML =
    `<tr><th>Month</th><th>Result</th><th>Return</th><th>Rank</th></tr>`;
  $('#compare-summary tbody').innerHTML = picked
    .map((key, i) => {
      const c = byKey.get(key);
      const swatch = `<span class="swatch" style="background:${t.series[i % t.series.length]}"></span>`;
      return `<tr>
        <td>${swatch}${esc(labelForCell(key))}</td>
        <td class="${signClass(c.pnl)}">${esc(fmtSigned(c.pnl))}</td>
        <td class="${signClass(c.returnPct)}">${esc(fmtPct(c.returnPct))}</td>
        <td>${rankOf.get(key)} of ${all.length}</td>
      </tr>`;
    })
    .join('');
}

/** '2025-09' -> 'Sep 2025'. */
function labelForCell(key) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function toggleMonth(month) {
  const i = state.selectedMonths.indexOf(month);
  if (i >= 0) state.selectedMonths.splice(i, 1);
  else {
    state.selectedMonths.push(month);
    // Oldest choice drops out rather than silently ignoring the new click.
    if (state.selectedMonths.length > MAX_COMPARE) state.selectedMonths.shift();
    // The two comparisons answer different questions and share one chart, so
    // picking a column name puts it in that mode.
    state.selectedCells = [];
  }
  render();
}

/** Pick one specific month — September 2025 against November 2020. */
function toggleCell(key) {
  const i = state.selectedCells.indexOf(key);
  if (i >= 0) state.selectedCells.splice(i, 1);
  else {
    state.selectedCells.push(key);
    if (state.selectedCells.length > MAX_COMPARE_CELLS) state.selectedCells.shift();
    state.selectedMonths = [];
  }
  render();
}

/**
 * Colour for each selected month.
 *
 * Twelve months do not fit seven categorical slots, so a plain `month % 7`
 * silently gives April and November the same hue — and those are exactly the
 * kind of pair someone compares. Each month keeps a preferred slot so the
 * colour is stable across selections, but a collision inside the current
 * selection pushes the later month to the next free slot. Two series on screen
 * are never the same colour.
 */
function monthColours(picked, t) {
  const used = new Set();
  const out = new Map();
  for (const m of picked) {
    let slot = (m - 1) % t.series.length;
    while (used.has(slot)) slot = (slot + 1) % t.series.length;
    used.add(slot);
    out.set(m, t.series[slot]);
  }
  return out;
}

function renderMonthCompare(months, t) {
  const box = $('#compare-box');
  const wrap = $('#compare-summary-wrap');
  const picked = [...state.selectedMonths].sort((a, b) => a - b);

  if (state.selectedCells.length) return renderCellCompare(months, t);

  if (!picked.length) {
    box.hidden = true;
    wrap.hidden = true;
    $('#compare-hint').textContent =
      'Click a single month in the grid to compare specific months — September 2025 against November 2020. ' +
      'Click a month name in the header instead to compare that month across every year.';
    return;
  }

  box.hidden = false;
  wrap.hidden = false;
  $('#compare-hint').textContent = `Comparing ${picked.map((m) => MONTH_NAMES[m - 1]).join(' vs ')} across every year. Click a month name again to remove it (up to ${MAX_COMPARE}).`;

  const years = months.years.map((y) => y.year);
  const colours = monthColours(picked, t);
  const series = picked.map((m) => ({
    label: MONTH_NAMES[m - 1],
    month: m,
    colour: colours.get(m),
    values: months.years.map((y) => y.months[m - 1]?.[state.metric] ?? null),
  }));

  state.charts.compare = monthCompareChart($('#c-compare'), { years, series }, state.metric, t);

  // Cell mode rewrites this header, so put the across-years one back.
  $('#compare-summary thead').innerHTML =
    `<tr><th>Month</th><th>Years</th><th id="th-total">Total</th><th id="th-avg">Average</th>` +
    `<th>Best</th><th>Worst</th><th>Positive</th></tr>`;
  // The two aggregate columns mean different things per metric; say which.
  $('#th-total').textContent = isPct() ? 'Compounded' : 'Total';
  $('#th-avg').textContent = isPct() ? 'Average (geometric)' : 'Average';

  $('#compare-summary tbody').innerHTML = series
    .map((s) => {
      const vals = s.values.filter((v) => v != null);
      if (!vals.length) {
        return `<tr><td>${esc(s.label)}</td><td colspan="6" class="muted">no data</td></tr>`;
      }
      // Percentages compound; euros add. Summing returns would claim that
      // +10% twice is +20%.
      const total = isPct()
        ? (vals.reduce((a, b) => a * (1 + b / 100), 1) - 1) * 100
        : vals.reduce((a, b) => a + b, 0);
      const avg = isPct()
        ? (Math.sign(1 + total / 100) * Math.abs(1 + total / 100) ** (1 / vals.length) - 1) * 100
        : total / vals.length;
      const best = Math.max(...vals);
      const worst = Math.min(...vals);
      const positive = vals.filter((v) => v > 0).length;
      const swatch = `<span class="swatch" style="background:${s.colour}"></span>`;
      return `<tr>
        <td>${swatch}${esc(s.label)}</td>
        <td>${vals.length}</td>
        <td class="${signClass(total)}">${esc(fmtMetric(total))}</td>
        <td class="${signClass(avg)}">${esc(fmtMetric(avg))}</td>
        <td>${esc(fmtMetric(best))}</td>
        <td>${esc(fmtMetric(worst))}</td>
        <td>${positive} of ${vals.length}</td>
      </tr>`;
    })
    .join('');
}

/**
 * Resolve one colour per composition layer, once, for everything that draws
 * them: the stacked chart, the holdings table's swatches and the share ring.
 *
 * Membership now follows the selected window, so the old rule — layer i gets
 * categorical slot i — would repaint every survivor whenever the range changed.
 * Each layer instead carries its all-time `rank`, which the window cannot move.
 *
 * **What this does and does not guarantee**, because the difference was measured
 * rather than assumed and the weaker half is easy to overclaim:
 *
 *  - The account's six largest holdings each own a hue and never move. Their
 *    preferred slots are distinct, and they are seated first.
 *  - No two visible series ever share a hue. Unchanged, and non-negotiable.
 *  - "Other" keeps the last slot in every window, whatever is inside it.
 *  - An instrument *outside* that six has no hue of its own to return to — six
 *    slots cannot reserve one for a tenth holding — so it takes the first free
 *    one, and that can differ between windows. A holding that folds into
 *    "Other" in one range and gets its own layer in another likewise changes
 *    colour, which is the same fact seen from the other side.
 *
 * The old code was perfectly stable and showed the wrong holdings. This is the
 * trade, made deliberately: correct membership, stability where it can be had.
 */
function compositionColours(composition, t) {
  // The last categorical slot belongs to "Other" in every window, so an
  // instrument never borrows it and "Other" never moves.
  const instrumentSlots = Math.max(1, t.series.length - 1);
  const otherColour = t.series[t.series.length - 1];

  // Collisions are resolved in **all-time rank order, not in this window's
  // order**. That distinction is the whole feature and it is easy to get wrong:
  // resolving in window order means the arrival of one newly-large instrument
  // re-seats everything behind it, and two instruments that both have a layer
  // in two ranges swap hues between them. Measured, not assumed — the first
  // version of this shifted four instruments across ALL / 1Y / 6M.
  //
  // Sorting by all-time rank makes an instrument's slot depend only on *which*
  // instruments are on screen, never on how they happen to be ordered. The
  // account's six largest holdings have distinct preferred slots and are seen
  // first, so in practice they never move at all.
  const byRank = composition.layers
    .map((layer, i) => ({ layer, i }))
    .filter((x) => x.layer.rank != null)
    .sort((a, b) => a.layer.rank - b.layer.rank);

  const used = new Set();
  const out = new Array(composition.layers.length);
  for (const { layer, i } of byRank) {
    let slot = layer.rank % instrumentSlots;
    while (used.has(slot)) slot = (slot + 1) % instrumentSlots;
    used.add(slot);
    out[i] = t.series[slot];
  }
  composition.layers.forEach((layer, i) => {
    if (out[i]) return;
    out[i] = layer.key === '__cash__' ? t.cash : otherColour;
  });
  return out;
}

/**
 * Map every holding to the colour its layer was actually painted, so the table
 * and the chart cannot disagree and the swatches cannot become lies.
 */
function colourByProduct(composition, colours, t) {
  const map = new Map();
  composition.layers.forEach((layer, i) => {
    const colour = colours[i] ?? t.muted;
    if (layer.productId) map.set(layer.productId, colour);
    for (const id of layer.members ?? []) map.set(id, colour);
  });
  return map;
}

/**
 * The best or worst month the account ever had, as a percentage.
 *
 * Percent rather than euros, deliberately: €500 on a small portfolio and €500 on
 * a large one are not the same month, which is the argument the month grid's own
 * Euro/Return toggle already makes.
 */
function bestWorst(r, which) {
  const months = monthlyTable(r).years.flatMap((y) =>
    y.months.map((m, i) => (m ? { pct: m.returnPct, label: `${MONTH_NAMES[i]} ${y.year}` } : null)),
  ).filter(Boolean);
  if (!months.length) return { tabs: ['perf'], label: which === 'best' ? 'Best month' : 'Worst month', value: '—', note: tr('no full month yet') };
  months.sort((a, b) => b.pct - a.pct);
  const pick = which === 'best' ? months[0] : months.at(-1);
  return {
    tabs: ['perf'],
    label: which === 'best' ? 'Best month' : 'Worst month',
    value: fmtPct(pick.pct),
    note: pick.label,
    cls: signClass(pick.pct),
  };
}

/**
 * The instrument that made the most, and the one that lost the most, over the
 * selected range.
 *
 * Per instrument, not per trade — and that is a limit worth stating rather than
 * papering over. A single sale has no result of its own: what it "made" depends
 * entirely on which purchase you match it against, and FIFO against average cost
 * are two different answers to a question with no right one. `engine.js` refuses
 * to pick a convention anywhere, which is why per-holding numbers are trustworthy
 * at all. A position's result over a window needs no convention: it is how its
 * value moved less the money put into it, and it is already computed.
 *
 * So a stock bought and sold three times reports one figure, not three. That is
 * the honest version of the question.
 *
 * Euros rather than percent, unlike the month tiles: a position's percentage
 * needs a denominator, and "what was in it" changes every time you add to it.
 */
function bestWorstPosition(r, which, from, to, period) {
  const label = which === 'best' ? 'Biggest winner' : 'Biggest loser';
  const scored = r.byProduct
    .map((p) => ({ name: p.symbol || p.name, pnl: sumWindow(p.pnl, from, to) }))
    .sort((a, b) => b.pnl - a.pnl);
  const pick = which === 'best' ? scored[0] : scored.at(-1);

  // A range in which nothing gained has no winner to name, and showing the
  // least-bad loser under "Biggest winner" would be a lie in green.
  const wrongWay = which === 'best' ? !(pick?.pnl > 0.005) : !(pick?.pnl < -0.005);
  if (wrongWay) {
    return { tabs: ['perf'], label, value: '—', note: tr(which === 'best' ? 'nothing gained · {period}' : 'nothing lost · {period}', { period }) };
  }

  return { tabs: ['perf', 'holdings'], label, value: fmtSigned(pick.pnl), note: tr('{name} · {period}', { name: pick.name, period }), cls: signClass(pick.pnl) };
}

/**
 * Result per instrument over the window, biggest gain first.
 *
 * Capped, and the cap is stated in the label rather than silently applied: an
 * account with ninety instruments would otherwise draw ninety bars two pixels
 * tall and claim to show all of them.
 */
function moversData(r, from, to, limit = 12) {
  const rows = r.byProduct
    .map((p) => ({ name: p.symbol || p.name, pnl: sumWindow(p.pnl, from, to) }))
    .filter((p) => Math.abs(p.pnl) >= 0.005)
    .sort((a, b) => b.pnl - a.pnl);

  // The extremes, from both ends: the middle of this list is the part nobody is
  // asking about, and dropping it keeps both tails legible.
  const shown = rows.length <= limit ? rows : [...rows.slice(0, Math.ceil(limit / 2)), ...rows.slice(-Math.floor(limit / 2))];
  return { labels: shown.map((p) => p.name), values: shown.map((p) => p.pnl) };
}

/**
 * Today's value grouped by the currency each instrument is priced in, with cash
 * split out per currency too.
 *
 * Colour follows the currency's rank here rather than the instrument's, which
 * is a deliberate departure: there is no instrument to be consistent with, and
 * two charts that both show "EUR" should agree with each other.
 */
function currencyData(r, t) {
  const totals = {};
  const last = r.days.length - 1;
  for (const p of r.byProduct) {
    const v = p.values[last] ?? 0;
    if (Math.abs(v) < 0.005) continue;
    totals[p.currency] = (totals[p.currency] ?? 0) + v;
  }
  for (const [ccy, amount] of Object.entries(r.cashByCurrency ?? {})) {
    if (Math.abs(amount) < 0.005) continue;
    totals[ccy] = (totals[ccy] ?? 0) + amount;
  }

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return {
    labels: rows.map(([ccy]) => ccy),
    values: rows.map(([, v]) => v),
    colours: rows.map(([ccy], i) => (ccy === r.baseCurrency ? t.series[0] : t.series[(i % (t.series.length - 1)) + 1])),
  };
}

/** Sum a per-day series across the selected window, inclusive at both ends. */
const sumWindow = (arr, from, to) => {
  let s = 0;
  for (let i = Math.max(0, from); i <= to && i < arr.length; i++) s += arr[i];
  return s;
};

/**
 * The only screen in this project that shows a number nobody can check.
 *
 * Which is why it is a section of its own rather than a card on Overview. The
 * tempting thing is to continue the value line off the right-hand edge of the
 * chart everybody already looks at; that chart is reconciled against DEGIRO's
 * own total, and a forecast sharing its frame inherits credibility it has not
 * earned. Here the caveat is the first thing on the page, the projected lines
 * are dashed and broken at today, and nothing from this section reaches a tile,
 * the export or the bug report.
 */
function renderOutlook(r, t) {
  const o = state.outlook;

  buildChoice('#outlook-horizon',
    [{ key: 12, label: tr('1 year') }, { key: 36, label: tr('3 years') }, { key: 60, label: tr('5 years') }],
    () => o.months, (k) => { o.months = k; render(); });
  buildChoice('#outlook-rates',
    [{ key: false, label: tr('From your history') }, { key: true, label: tr('I set them') }],
    () => o.manual, (k) => { o.manual = k; render(); });

  const p = projectPortfolio(r, {
    months: o.months,
    monthly: o.monthly,
    growthPct: o.manual ? o.growthPct : null,
    yieldPct: o.manual ? o.yieldPct : null,
    reinvest: o.reinvest,
  });

  // First render fills the manual inputs from the derived figures, so switching
  // to "I set them" starts from something measured rather than from a blank.
  const growthInput = $('#outlook-growth');
  const yieldInput = $('#outlook-yield');
  if (o.growthPct == null) {
    o.growthPct = p.rates.derived.growthPct;
    o.yieldPct = p.rates.derived.yieldPct;
    growthInput.value = o.growthPct.toFixed(1);
    yieldInput.value = o.yieldPct.toFixed(2);
  }
  if (o.reinvest == null) {
    o.reinvest = p.rates.reinvest;
    $('#outlook-reinvest').checked = o.reinvest;
  }
  $('#outlook-manual').hidden = !o.manual;

  $('#outlook-caveat').textContent = tr(
    'Every other number in this extension is reconstructed from what actually happened and checked against DEGIRO’s own total. This one is not: it is what would happen if the future resembled the past, which it does not have to. The three lines are scenarios, not a forecast, and none of them is a promise.',
  );

  // Future month-ends, labelled the way the history is.
  const last = r.days.at(-1);
  const future = [];
  for (let m = 1; m <= p.months; m++) {
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + m);
    future.push(d.toISOString().slice(0, 10));
  }

  /**
   * No projection at all, when the measured rate is not a market outcome.
   *
   * Two testers' accounts derived several hundred percent a year, which drew a
   * dashed line to €89 million beside a portfolio worth thirty-three thousand.
   * There is no honest chart for that: the history is real and what it measures
   * is not growth. So the canvas is emptied and the reason takes its place —
   * refusing beats clamping, which would invent a number.
   */
  const unsupported = p.basis === 'unsupported' || !p.scenarios;
  $('#c-outlook').closest('.card, section, div')?.classList.toggle('is-unsupported', unsupported);
  $('#c-outlook').hidden = unsupported;
  if (state.charts.outlook && unsupported) {
    state.charts.outlook.destroy();
    state.charts.outlook = null;
  }

  if (!unsupported && onScreen('#c-outlook')) {
    // Monthly points for the history too, or 2 000 daily values sit beside 60
    // projected ones and the projection is a stub at the end of a wall.
    const step = Math.max(1, Math.round(r.days.length / 120));
    const days = r.days.filter((_, i) => i % step === 0 || i === r.days.length - 1);
    const value = r.value.filter((_, i) => i % step === 0 || i === r.days.length - 1);
    state.charts.outlook = projectionChart($('#c-outlook'), {
      days, value, future,
      bad: p.scenarios.bad.path,
      expected: p.scenarios.expected.path,
      good: p.scenarios.good.path,
      labels: {
        history: tr('What actually happened'),
        good: tr('Good market'),
        expected: tr('Expected market'),
        bad: tr('Bad market'),
      },
    }, t);
  }

  const years = (p.months / 12).toFixed(0);
  $('#outlook-basis').textContent = p.basis === 'unsupported'
    ? tr('No projection is drawn, because the growth rate measured from your history is {rate}% a year. That is not what a market does — it is what an account looks like when deposits and the trades they paid for are recorded a day apart, which distorts the early months. Set the rates yourself above to see a projection anyway.',
        { rate: Math.round(p.rates.expectedAnnual) })
    : p.basis === 'historical'
    ? tr('Built from the {n} separate {years}-year stretches your own history actually contains — worst, middle and best of them. Overlapping stretches, so treat {n} as fewer independent observations than it looks.', { n: p.windows, years })
    : tr('Your history is too short to contain even three {years}-year stretches, so these are an example rather than a scenario drawn from your own past. Treat them as arithmetic on an assumed rate, not as something measured.', { years });

  const d = p.rates.derived;
  $('#outlook-reinvest-note').textContent = d.maxIdleShare == null
    ? tr('No dividends received yet, so nothing turns on whether they were put back to work.')
    : tr('You hold {cash} in cash against {div} of dividend received, so at most {share}% of it can still be sitting uninvested — the rest demonstrably went somewhere. A ceiling rather than a measurement, so it only sets the default of the switch above.',
        { cash: fmtEurCents(d.cashNow), div: fmtEurCents(d.dividendSeen ?? 0), share: d.maxIdleShare });
}

/**
 * A calendar year as a row: what it opened at, what it closed at, what went in
 * and out, and what it made.
 *
 * The month grid holds every number already. What it does not have is a *year*,
 * and a year is the unit people review in.
 *
 * Three things it gets right that a naive version would not:
 *
 *  - **The first year does not open on 1 January.** It opens when the account
 *    did. Showing €0 as its opening value makes its return infinite; showing
 *    1 January makes it wrong by however long the account had been running. The
 *    row says the real date.
 *  - **A year's return is not (close − open) ÷ open.** A deposit in March
 *    inflates that. It is the same daily-chained figure the month grid uses,
 *    from the same function, so there is one definition of return here.
 *  - **Whole history, never the selected range.** A "2024" row that quietly
 *    covered March to November because of a range button would be worse than no
 *    row at all.
 */
function renderYears(r) {
  const years = new Map();
  for (let i = 0; i < r.days.length; i++) {
    const y = r.days[i].slice(0, 4);
    const row = years.get(y) ?? { year: y, first: i, last: i };
    row.last = i;
    years.set(y, row);
  }

  const tradesByYear = {};
  for (const e of r.tradeEvents ?? []) {
    const y = String(e.date).slice(0, 4);
    tradesByYear[y] = (tradesByYear[y] ?? 0) + (e.count ?? 1);
  }

  const rows = [...years.values()].reverse().map((y) => {
    const opening = y.first === 0 ? 0 : r.value[y.first - 1];
    const income = r.incomeByYear?.[y.year] ?? {};
    let paidIn = 0;
    let takenOut = 0;
    for (let i = y.first; i <= y.last; i++) {
      const f = r.netExternal[i] ?? 0;
      if (f > 0) paidIn += f;
      else takenOut += f;
    }
    return {
      ...y,
      partial: y.first === 0,
      startedOn: r.days[y.first],
      opening,
      closing: r.value[y.last],
      paidIn,
      takenOut,
      result: sumWindow(r.pnl, y.first, y.last),
      returnPct: windowReturnPct(r, y.first, y.last),
      dividend: (income.dividendGross ?? 0) + (income.dividendTax ?? 0),
      costs: Math.abs(income.fees ?? 0) + Math.min(0, income.interest ?? 0) * -1,
      trades: tradesByYear[y.year] ?? 0,
    };
  });

  $('#years-hint').textContent = tr('Whole history, never the selected range. A year’s return chains the daily returns, so a deposit inside it does not flatter the number.');

  $('#years tbody').innerHTML = rows
    .map(
      (y) => `<tr>
      <td>${esc(y.year)}${y.partial ? ` <span class="muted">${esc(tr('from {date}', { date: formatDay(y.startedOn) }))}</span>` : ''}</td>
      <td class="num">${y.partial ? '<span class="muted">—</span>' : esc(fmtEurCents(y.opening))}</td>
      <td class="num">${esc(fmtEurCents(y.closing))}</td>
      <td class="num">${y.paidIn > 0.005 ? esc(fmtEurCents(y.paidIn)) : '<span class="muted">—</span>'}</td>
      <td class="num">${y.takenOut < -0.005 ? esc(fmtEurCents(y.takenOut)) : '<span class="muted">—</span>'}</td>
      <td class="num ${signClass(y.result)}">${esc(fmtSigned(y.result))}</td>
      <td class="num ${signClass(y.returnPct)}">${esc(fmtPct(y.returnPct))}</td>
      <td class="num">${Math.abs(y.dividend) > 0.005 ? esc(fmtEurCents(y.dividend)) : '<span class="muted">—</span>'}</td>
      <td class="num">${y.costs > 0.005 ? esc(fmtEurCents(y.costs)) : '<span class="muted">—</span>'}</td>
      <td class="num">${y.trades || '<span class="muted">—</span>'}</td>
    </tr>`,
    )
    .join('');

  // The line that stops somebody filing a tax return with this. It sits under
  // the table rather than in a page footer, because a footnote elsewhere is a
  // footnote nobody read.
  $('#years-note').textContent = tr('Not a tax document. “Dividend” is what was received after the tax DEGIRO withheld at source — not what you can reclaim — and this project holds no cost basis at all, deliberately, so the capital-gains figure a tax return asks for cannot be derived from anything here.');
}

/**
 * One rate per year, and *which* rate, said by the control that chose it.
 *
 * Two questions, one on screen at a time. Showing both at once with neither
 * named is how a page contradicts itself; a toggle is the same answer this page
 * already gives three times over (Euro / Return %, Line / Candles, Table /
 * Share). Money-weighted leads because "what did my money earn" is the question
 * a private investor is asking; time-weighted is the only fair comparison
 * against a fund.
 *
 * Both refusals are shown as refusals rather than as a dash with no reason: an
 * empty number people invent an explanation for.
 */
function renderAnnualised(r, from, to) {
  buildChoice('#ann-view',
    [{ key: 'money', label: tr('My money') }, { key: 'time', label: tr('The portfolio') }],
    () => state.annualisedView, (k) => { state.annualisedView = k; render(); });

  const a = annualisedReturn(r, from, to);
  const money = state.annualisedView === 'money';

  $('#ann-hint').textContent = money
    ? tr('What your money earned per year, given when you paid it in — an internal rate of return over your actual deposits and withdrawals.')
    : tr('How the portfolio performed per year regardless of when you paid in — the daily-chained return, annualised. This is what a fund reports.');

  const value = $('#ann-value');
  const note = $('#ann-note');

  if (a.reason === 'too-short') {
    value.textContent = '—';
    value.className = 'bignum';
    note.textContent = tr('Less than a year selected. Annualising three months of {pct} would report {year} a year, which is not a number anyone should act on — the period result is above.',
      { pct: fmtPct(windowReturnPct(r, from, to)), year: fmtPct(((1 + windowReturnPct(r, from, to) / 100) ** 4 - 1) * 100) });
    return;
  }

  const pct = money ? a.moneyWeighted : a.timeWeighted;
  if (pct == null) {
    value.textContent = '—';
    value.className = 'bignum';
    note.textContent = tr('Your deposits and withdrawals cross zero more than once, so this rate has several mathematically valid answers and no way to choose between them. The portfolio figure beside it has only one.');
    return;
  }

  value.textContent = fmtPct(pct);
  value.className = `bignum ${signClass(pct)}`;
  note.textContent = tr('Over {years} years{name}.', {
    years: a.years.toFixed(1),
    name: money ? tr(', money-weighted') : tr(', time-weighted'),
  });
}


/** DEGIRO's own type strings, in sentence case. Its vocabulary, not ours. */
const titleCase = (s) => String(s).charAt(0) + String(s).slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * The transactions behind every figure on the page.
 *
 * Follows the range control, because the rest of the page does and a list that
 * ignores it is the inconsistency US-06 was about. The count says how many of
 * how many, so a filtered view can never be mistaken for the whole history.
 */
function renderTransactions(data, r, from, to) {
  const all = [...(data.transactions ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const inRange = state.txScope === 'all' ? all : all.filter((t) => t.date >= r.days[from] && t.date <= r.days[to]);
  const names = Object.fromEntries((r.byProduct ?? []).map((p) => [p.productId, p.symbol || p.name]));
  /**
   * US-51. The currency each price is quoted in, and where it comes from.
   *
   * The product's currency first, because that is what the engine values through
   * (`engine.js:583`) and the two must not disagree about the same instrument;
   * then the transaction's own; then nothing, which renders a bare number rather
   * than a euro sign nobody checked.
   */
  const ccys = Object.fromEntries((r.byProduct ?? []).map((p) => [p.productId, p.currency || null]));

  buildChoice('#tx-scope', [{ key: 'range', label: tr('This range') }, { key: 'all', label: tr('Everything') }],
    () => state.txScope, (k) => { state.txScope = k; render(); });

  // A cap with the number said out loud. Several thousand rows is a second of
  // layout and a minute of scrolling, and silently truncating would make a
  // partial list look complete.
  const LIMIT = 500;
  const shown = inRange.slice(0, LIMIT);

  $('#tx-hint').textContent =
    [
      inRange.length > shown.length
        ? tr('Newest first. {n} shown of {total} in range', {
          n: shown.length.toLocaleString('nl-NL'),
          total: inRange.length.toLocaleString('nl-NL'),
        })
        : tr('Newest first. {n} shown', { n: shown.length.toLocaleString('nl-NL') }),
      tr('{n} in the whole history.', { n: all.length.toLocaleString('nl-NL') }),
      // US-51. Both columns say what they are, because both were read as something
      // else: the price is the price that was actually paid, in the currency it was
      // paid in, so for a foreign trade it is not the euro column divided by the
      // quantity. And Amount is the cash flow, fee included — negative when money
      // left the account, which is the direction DEGIRO's own statement uses.
      tr('Price is in the instrument’s own currency; Amount is what moved in {ccy}, fees included.', {
        ccy: r.baseCurrency,
      }),
      /**
       * US-53, decided: **no paid-in-vs-grown column here.**
       *
       * The request was for the split on every sell row. A sale is a *flow*, and
       * splitting one flow into capital and profit needs FIFO or average cost —
       * a convention this project has refused four times on the record, and the
       * refusal is the reason the rest of the page can be trusted.
       *
       * The other option was the *position's* split as of the row's date. It is
       * honest arithmetic and it answers the wrong question: two sells of one
       * instrument a week apart show almost the same bar, because the bar is the
       * position's state and not the trade's. A figure that needs a label to
       * explain it is not what it looks like has already failed — the reader
       * divides this sale's amount by a split that is not about this sale.
       *
       * So the ledger says what moved, and says where the split does live. A
       * reader who came looking for it finds out why it is not here, rather than
       * concluding the app forgot.
       */
      tr('Paid in vs grown belongs to a position, not to one sale — splitting a single sale into capital and profit needs a cost-basis convention this project does not use. It is on Positions, per instrument.'),
    ].join(' · ');

  $('#transactions tbody').innerHTML = shown.length
    ? shown
        .map((t) => {
          const buy = (t.quantity ?? 0) > 0;
          const ccy = ccys[t.productId] ?? t.currency ?? null;
          return `<tr>
        <td>${esc(formatDay(t.date))}</td>
        <td><span class="chip ${buy ? 'info' : 'warn'}">${esc(tr(buy ? 'Buy' : 'Sell'))}</span></td>
        <td>${esc(names[t.productId] ?? t.productId)}</td>
        <td class="num">${esc(fmtQty(t.quantity ?? 0))}</td>
        <td class="num">${esc(fmtPrice(t.price ?? 0, ccy))}</td>
        <td class="num">${esc(fmtSigned(t.totalBase ?? 0))}</td>
      </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="muted">No transactions in this range.</td></tr>';
}

/** A segmented control, built once per render against current state. */
function buildChoice(sel, options, get, onPick) {
  const host = $(sel);
  if (!host) return;
  const signature = options.map((o) => o.key).join('|') + '#' + get();
  if (host.dataset.sig === signature) return;
  host.dataset.sig = signature;
  host.innerHTML = '';
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.setAttribute('aria-pressed', String(o.key === get()));
    b.addEventListener('click', () => onPick(o.key));
    host.append(b);
  }
}

/**
 * What one unit is worth today, in euros.
 *
 * Deliberately *not* labelled as the quoted price. The engine keeps a
 * position's value in the base currency, so this is value ÷ quantity — which
 * for a share is the euro price, and for a contract covering a hundred shares
 * is a hundred times the quoted premium. Calling that "price" without saying so
 * would be the third number on this page that means something other than its
 * column header.
 */
const unitPrice = (p, qty) => (Math.abs(qty) < 1e-9 ? '—' : fmtEurCents(p.current / qty));

/**
 * The average price paid, over every purchase ever made.
 *
 * **Total paid ÷ total quantity bought.** That is a fact and needs no
 * convention. What it deliberately is *not* is the running average cost of what
 * remains after partial sales — that is the average-cost method, FIFO answers
 * it differently, and this project picks neither. No result on this page is
 * derived from this number; the Result column stays the identity figure, so the
 * two cannot disagree.
 */
function averagePaid(p) {
  const q = p.boughtQty ?? 0;
  if (!(q > 0) || !(p.bought > 0)) return '—';
  return fmtEurCents(p.bought / q);
}

function renderHoldings(r, composition, compColours, t, from, to) {
  const total = r.totals.value || 1;
  const colours = colourByProduct(composition, compColours, t);
  const otherLabel = composition.layers.find((l) => l.key === '__other__')?.label;
  /**
   * US-49. One table for a position instead of two.
   *
   * Holdings and Profit-and-loss-per-product read the same array and shared
   * three columns, so answering "how is EQQQ doing" meant matching a row by name
   * across two cards. Everything ever traded is here now, closed included.
   *
   * **Half of these columns follow the range control and half cannot**: result is
   * `sumWindow(p.pnl, from, to)`, while bought, sold, dividend and current are
   * all-time scalars off the engine. Two cards hid that; one row would invent a
   * comparison, so every all-time column says so in its own header.
   */
  const open = (p) => Math.abs(p.current) > 0.005;
  const traded = (p) => (p.bought ?? 0) > 0.005 || (p.sold ?? 0) > 0.005 || open(p);
  const types = [...new Set(r.byProduct.filter(traded).map((p) => p.productType || 'OTHER'))].sort();
  buildChoice('#holdings-status',
    [{ key: 'open', label: tr('Open') }, { key: 'closed', label: tr('Closed') }, { key: 'all', label: tr('All') }],
    () => state.posStatus ?? 'open', (k) => { state.posStatus = k; render(); });
  buildChoice('#products-filter', [{ key: 'ALL', label: tr('All') }, ...types.map((k) => ({ key: k, label: titleCase(k) }))],
    () => state.productType, (k) => { state.productType = k; render(); });
  const status = state.posStatus ?? 'open';

  /**
   * US-87. The sort lives in the header now — click a column, the chips are
   * gone. One value per column key, so the sort and the cell can never
   * disagree about what a column means; the window-following columns sort on
   * the same windowed figure they display.
   */
  const sortValFor = {
    instrument: (p) => p.name.toLowerCase(),
    quantity: (p) => p.qty.at(-1),
    price: (p) => (Math.abs(p.qty.at(-1)) < 1e-9 ? -Infinity : p.current / p.qty.at(-1)),
    bought: (p) => p.bought ?? 0,
    sold: (p) => p.sold ?? 0,
    avgPaid: (p) => ((p.boughtQty ?? 0) > 0 && p.bought > 0 ? p.bought / p.boughtQty : -Infinity),
    value: (p) => p.current,
    // Open rows sort on what the cell shows (value over net paid in); closed
    // rows on their own flow ratio, out over in (US-94) — each row consistent
    // with its cell, the two meanings never silently mixed. A closed row with
    // nothing ever paid in shows a dash and sorts last, like every other dash.
    split: (p) => (open(p)
      ? p.current / Math.max(p.paidIn?.at(-1) ?? 0, 0.01)
      : (p.bought > 0.005 ? ((p.sold ?? 0) + (p.dividend ?? 0)) / p.bought : -Infinity)),
    result: (p) => sumWindow(p.pnl, from, to),
    dividend: (p) => p.dividend ?? 0,
    pctBought: (p) => {
      const inOver = moneyInOver(p.paidIn, from, to);
      return inOver > 0.005 ? (sumWindow(p.pnl, from, to) / inOver) * 100 : -Infinity;
    },
    share: (p) => p.current,
    currency: (p) => p.currency,
  };
  const sortState = readHoldingsSort();
  const rows = [...r.byProduct]
    .filter(traded)
    .filter((p) => (status === 'open' ? open(p) : status === 'closed' ? !open(p) : true))
    .filter((p) => state.productType === 'ALL' || (p.productType || 'OTHER') === state.productType)
    .sort((a, b) => {
      // Name as the tiebreak, so equal results cannot reorder between renders —
      // a table that jitters is a table nobody trusts. Natural order (no header
      // sort) is windowed result descending: what the old default chip showed,
      // so a reader with nothing persisted sees the table they always saw.
      if (!sortState) {
        return (sumWindow(b.pnl, from, to) - sumWindow(a.pnl, from, to)) || a.name.localeCompare(b.name);
      }
      const va = sortValFor[sortState.key](a);
      const vb = sortValFor[sortState.key](b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return (sortState.dir === 'asc' ? cmp : -cmp) || a.name.localeCompare(b.name);
    });

  // Everything the account made in this window, and the part of it that came
  // from a position moving. The difference is not an error: cash earns
  // dividends and interest, pays fees, and — in an account holding foreign
  // currency — gains and loses on the rate with no position involved at all.
  // Putting the difference on the cash row is what makes the column add up, and
  // it is a true statement rather than a plug.
  const accountResult = sumWindow(r.pnl, from, to);
  const positionResult = r.byProduct.reduce((a, p) => a + sumWindow(p.pnl, from, to), 0);

  /**
   * How much of what this holding is worth is money you put in, and how much it
   * made — as a bar and a sentence.
   *
   * US-52 lifted the arithmetic into `splitModel` (`lib/snapshot.js`), which the
   * shareable card also calls. What is left here is the mark: two segments and
   * the words. Do not put a branch back in — the three states, the percentages
   * and the under-water scaling are decided in one place, with the test.
   */
  const barInner = (model) => {
    const words = tr(model.key, model.vars);
    return `<span class="bar" title="${esc(words)}"><i style="width:${model.keptPct}%"></i>`
      + `<em class="${model.state === 'underwater' ? 'down' : 'up'}" style="width:${model.lostPct}%"></em></span>`
      + ` <span class="muted">${esc(words)}</span>`;
  };
  const splitInner = (p) => {
    const paid = p.paidIn?.at(-1) ?? 0;
    return barInner(splitModel(paid, p.current - paid));
  };
  // US-94: a closed position's cell answers the flow question instead — what
  // came back out against what went in, all time, from the same model the
  // share card draws. `null` (nothing ever paid in) keeps the dash.
  const flowInner = (p) => {
    const flow = flowModel(p.bought, p.sold, p.dividend);
    return flow ? barInner(flow) : dash;
  };
  const resultInner = (v) => `<span class="${v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : 'muted'}">${esc(fmtSigned(v))}</span>`;

  /**
   * US-61. One renderer per column key, closing over the window and the colours.
   * The pure list (order, priority, the load-bearing floor) is `columns.js`; this
   * is only *what goes in the cell*. Every cell carries `data-col`, so the width
   * pass and the chooser can hide it by key without knowing what it holds — the
   * same choke-point discipline US-46 uses for masking.
   */
  const dash = '<span class="muted">—</span>';
  const estMark = (p) => (p.hasSeries === false
    ? ' <span class="muted" title="No price history for this instrument, so it is held at the last price it traded at — its result is an estimate.">·&nbsp;est.</span>'
    : '');
  const cellFor = {
    instrument: (p) => {
      const colour = colours.get(p.productId) ?? t.muted;
      const grouped = otherLabel && !composition.layers.some((l) => l.productId === p.productId);
      return `<button type="button" class="expander" aria-expanded="false" title="${esc(tr('Details'))}" aria-label="${esc(tr('Details'))}"></button>`
        + `<span class="swatch" style="background:${colour}"></span>${esc(p.name)}`
        + `${p.symbol && p.symbol !== p.name ? ` <span class="muted">${esc(p.symbol)}</span>` : ''}`
        + `${grouped ? ` <span class="muted">· in “${esc(otherLabel)}”</span>` : ''}`;
    },
    quantity: (p) => (open(p) ? esc(fmtQty(p.qty.at(-1))) : dash),
    // All-time, like their headers say — the engine's scalars, not windowed.
    bought: (p) => (p.bought > 0.005 ? esc(fmtEurCents(p.bought)) : dash),
    sold: (p) => (p.sold > 0.005 ? esc(fmtEurCents(p.sold)) : dash),
    price: (p) => (open(p) ? esc(unitPrice(p, p.qty.at(-1))) : dash),
    avgPaid: (p) => esc(averagePaid(p)),
    value: (p) => (open(p) ? esc(fmtEurCents(p.current)) : dash),
    split: (p) => (open(p) ? splitInner(p) : flowInner(p)),
    result: (p) => resultInner(sumWindow(p.pnl, from, to)),
    dividend: (p) => (Math.abs(p.dividend ?? 0) > 0.005 ? esc(fmtEurCents(p.dividend)) : dash),
    pctBought: (p) => {
      /**
       * Result over money put in, gross. Honest and needing no cost-basis
       * convention — which is why the header names its denominator.
       *
       * Over the *window*, both halves of it. It used to divide the window's
       * result by `p.bought`, which is all-time: select 1Y on a position bought
       * six years ago and this was one year of result over six years of buying.
       * That is US-50's defect, which was fixed on the card and left standing
       * here, and it is why the card and the row printed two percentages. Both
       * now call `moneyInOver` over the same days as their own numerator.
       */
      const inOver = moneyInOver(p.paidIn, from, to);
      const v = inOver > 0.005 ? (sumWindow(p.pnl, from, to) / inOver) * 100 : null;
      return v == null ? dash : `<span class="${signClass(v)}">${esc(fmtPct(v))}</span>`;
    },
    share: (p) => (open(p) ? `${((p.current / total) * 100).toFixed(1)}%` : dash),
    currency: (p) => `${esc(p.currency)}${estMark(p)}`,
    snap: (p) => `<button type="button" class="snap" data-snap="${esc(p.productId)}" title="${esc(tr('Share this position'))}" aria-label="${esc(tr('Share this position'))}">⧉</button>`,
  };
  const tdClass = (c) => `${c.num ? 'num' : ''}${c.action ? ' act' : ''}${c.key === 'split' ? ' split' : ''}`.trim();
  const colTd = (c, p) => `<td data-col="${c.key}" class="${tdClass(c)}"${c.key === 'instrument' ? ` title="${esc(p.name)}"` : ''}>${cellFor[c.key](p)}</td>`;
  // The expand carries exactly the columns a row is *not* showing, so no data
  // becomes unreachable at any width (US-61 AC2). Each `.kv` starts hidden and
  // `applyHoldingsHidden` reveals the ones whose column is dropped.
  const detailRow = (p) => `<tr class="pos-detail" hidden><td class="detail-cell" colspan="${HOLDINGS_COLUMNS.length}">`
    + optionalColumns().map((c) => `<span class="kv" data-col="${c.key}" hidden><b>${esc(tr(c.label))}</b> <span>${cellFor[c.key](p)}</span></span>`).join('')
    + '</td></tr>';
  // US-87. The reader's own column order — header, rows, cash row and the
  // detail expand all map over this one list, so a reorder cannot desync them.
  const cols = orderedColumns(userColOrder());
  const body = rows.map((p) => `<tr class="pos-row">${cols.map((c) => colTd(c, p)).join('')}</tr>${detailRow(p)}`).join('');

  // The cash row carries `accountResult − positionResult` so the Result column
  // sums to the account's result (US-49). Hiding a column must not change that,
  // so it is built from the same column list as every other row.
  const cashCell = {
    instrument: () => `<span class="swatch" style="background:${t.cash}"></span>Cash <span class="muted">· ${esc(tr('dividend, interest, fees and currency'))}</span>`,
    value: () => esc(fmtEurCents(r.totals.cash)),
    result: () => resultInner(accountResult - positionResult),
    share: () => `${((r.totals.cash / total) * 100).toFixed(1)}%`,
    currency: () => esc(r.baseCurrency),
  };
  const cashRow = `<tr class="cash-row">${cols.map((c) =>
    `<td data-col="${c.key}" class="${tdClass(c)}">${cashCell[c.key] ? cashCell[c.key]() : dash}</td>`).join('')}</tr>`;

  // US-87. Every header except the action is a real button: click cycles the
  // sort (the pure half is `cycleSort`), the active column and direction show
  // as an arrow plus `aria-sort`, and re-sorting is a plain re-render —
  // instant, never animated (US-49's floor).
  $('#holdings thead').innerHTML = `<tr>${cols.map((c) => {
    const sorted = sortState?.key === c.key;
    const aria = sorted ? ` aria-sort="${sortState.dir === 'asc' ? 'ascending' : 'descending'}"` : '';
    if (c.action) return `<th data-col="${c.key}" class="${tdClass(c)}"><span class="sr-only">${esc(tr('Copy image'))}</span></th>`;
    // US-93: the header explains itself. `data-tip` rides the existing button —
    // hover and keyboard focus show it via the shared element; a tap stays a
    // sort, so touch reaches the same text through the column chooser instead.
    return `<th data-col="${c.key}" class="${tdClass(c)}"${aria}>`
      + `<button type="button" class="col-head" data-sort-col="${c.key}"${c.tip ? ` data-tip="${esc(tr(c.tip))}"` : ''}>${esc(tr(c.label))}`
      + `<span class="arrow">${sorted && sortState.dir === 'asc' ? '▲' : '▼'}</span></button></th>`;
  }).join('')}</tr>`;

  // An empty filter says so rather than showing a headed table with nothing in
  // it, which reads as a load that failed.
  const empty = `<tr><td colspan="${HOLDINGS_COLUMNS.length}" class="muted">${esc(tr('No positions match this filter.'))}</td></tr>`;
  $('#holdings tbody').innerHTML =
    (rows.length ? body : empty) + (status === 'open' || status === 'all' ? cashRow : '');
  const unattributed = r.unattributedDividends ?? 0;
  $('#products-note').textContent =
    `${rows.length} of ${r.byProduct.filter(traded).length} product(s).` +
    (unattributed
      ? ` ${unattributed} dividend row(s) carry no product, so they are in the account total but not in any row above.`
      : '');

  // US-61. Rebuild the chooser against the persisted set, make sure the width
  // observer is running, and fit to the current container width.
  buildColumnChooser();
  ensureHoldingsObserver();
  ensureHoldingsHeader();
  fitHoldingsColumns();

  renderHoldingsShare(composition, rows, compColours, t, r);
}

// --- US-61: responsive Positions columns --------------------------------------

const HOLDINGS_COLS_KEY = 'degiro-portfolio.holdings-cols';

/** The columns the reader has chosen to hide. A display preference, stored like
 *  the theme; a blocked or empty store just means "hide nothing". */
function userHiddenCols() {
  try {
    return new Set((localStorage.getItem(HOLDINGS_COLS_KEY) || '').split(',').filter(Boolean));
  } catch {
    return new Set();
  }
}
function setUserHiddenCols(set) {
  try {
    localStorage.setItem(HOLDINGS_COLS_KEY, [...set].join(','));
  } catch {
    /* memory only for this page's lifetime */
  }
}

// --- US-87: sort by header, drag to reorder, both persisted -------------------

const HOLDINGS_ORDER_KEY = 'degiro-portfolio.holdings-order';
const HOLDINGS_SORT_KEY = 'degiro-portfolio.holdings-sort';

/** The reader's stored column order, as keys. `orderedColumns` does the
 *  distrusting — unknown keys, duplicates, missing keys, the two anchors. */
function userColOrder() {
  try {
    return (localStorage.getItem(HOLDINGS_ORDER_KEY) || '').split(',').filter(Boolean);
  } catch {
    return [];
  }
}
function setUserColOrder(keys) {
  try {
    localStorage.setItem(HOLDINGS_ORDER_KEY, keys.join(','));
  } catch {
    /* memory only for this page's lifetime */
  }
}

/**
 * The persisted sort, read defensively: an unknown column, an unknown
 * direction or a column the reader has since hidden clears the stored sort
 * rather than ordering the table on something invisible.
 */
function readHoldingsSort() {
  try {
    const raw = localStorage.getItem(HOLDINGS_SORT_KEY) || '';
    if (!raw) return null;
    const [key, dir] = raw.split(':');
    const col = HOLDINGS_COLUMNS.find((c) => c.key === key && !c.action);
    if (!col || (dir !== 'asc' && dir !== 'desc') || userHiddenCols().has(key)) {
      localStorage.removeItem(HOLDINGS_SORT_KEY);
      return null;
    }
    return { key, dir };
  } catch {
    return null;
  }
}
function setHoldingsSort(sort) {
  try {
    if (sort) localStorage.setItem(HOLDINGS_SORT_KEY, `${sort.key}:${sort.dir}`);
    else localStorage.removeItem(HOLDINGS_SORT_KEY);
  } catch {
    /* memory only for this page's lifetime */
  }
}

/**
 * US-87, variant B — the owner's pick. Click a header to sort, drag it to
 * reorder, mechanics from the POC (`docs/prototypes/
 * holdings-table-interactions.html`): five pixels of travel decide
 * drag-vs-click, `elementsFromPoint` over the header row finds the drop
 * target, a 2px accent edge shows where the column will land, and the click
 * that the release produces is swallowed. Instrument never drags and never
 * receives a drop — it is anchored first; the action column has no `.col-head`
 * and is anchored last by `orderedColumns`. Wired once, delegated, because the
 * header is rebuilt on every render.
 */
let holdingsDrag = null;
let holdingsDragMoved = false;
function ensureHoldingsHeader() {
  const table = $('#holdings');
  if (!table || table.dataset.headWired) return;
  table.dataset.headWired = '1';

  table.addEventListener('click', (e) => {
    // Matched from the `th`, not the button: the pointer capture the drag path
    // takes on `pointerdown` retargets the release, so the click this produces
    // lands on the `th` itself — `closest('.col-head')` walks ancestors and
    // would miss the button below it. Measured headless, not theorised.
    const th = e.target.closest('thead th[data-col]');
    if (!th || !th.querySelector('.col-head') || holdingsDragMoved) return;
    const col = HOLDINGS_COLUMNS.find((c) => c.key === th.dataset.col);
    if (!col) return;
    // `split` sorts on its paid-in-vs-grown ratio, so it cycles like a number
    // despite not being a right-aligned numeric cell.
    setHoldingsSort(cycleSort(readHoldingsSort(), col.key, !!col.num || col.key === 'split'));
    // US-93: the render below rebuilds the header, which would leave the tip
    // floating over a button that no longer exists.
    hideTip();
    render();
  });

  table.addEventListener('pointerdown', (e) => {
    const th = e.target.closest('thead th');
    if (!th || !th.querySelector('.col-head')) return;
    if (th.dataset.col === 'instrument') return; // anchored first
    holdingsDrag = { key: th.dataset.col, th, x: e.clientX, over: null };
    holdingsDragMoved = false;
    th.setPointerCapture(e.pointerId);
  });
  table.addEventListener('pointermove', (e) => {
    if (!holdingsDrag) return;
    if (!holdingsDragMoved && Math.abs(e.clientX - holdingsDrag.x) < 5) return; // a click stays a click
    holdingsDragMoved = true;
    hideTip(); // US-93: no tooltip rides a dragged column; `show` stays off until the drop
    holdingsDrag.th.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    table.querySelectorAll('thead th').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    const target = document.elementsFromPoint(e.clientX, e.clientY)
      .find((el) => el.matches?.('#holdings thead th') && el !== holdingsDrag.th);
    if (target && target.dataset.col !== 'instrument' && target.querySelector('.col-head')) {
      const rect = target.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      target.classList.add(before ? 'drop-before' : 'drop-after');
      holdingsDrag.over = { key: target.dataset.col, before };
    } else {
      holdingsDrag.over = null;
    }
  });
  const endDrag = (commit) => {
    if (!holdingsDrag) return;
    document.body.style.cursor = '';
    if (commit && holdingsDragMoved && holdingsDrag.over) {
      const keys = orderedColumns(userColOrder()).map((c) => c.key).filter((k) => k !== holdingsDrag.key);
      const at = keys.indexOf(holdingsDrag.over.key);
      keys.splice(holdingsDrag.over.before ? at : at + 1, 0, holdingsDrag.key);
      setUserColOrder(keys); // orderedColumns re-anchors on the next read
    }
    const moved = holdingsDragMoved;
    holdingsDrag = null;
    if (moved) {
      render();
      // Swallow the click this pointerup produces, then arm the next one.
      setTimeout(() => { holdingsDragMoved = false; }, 0);
    }
  };
  table.addEventListener('pointerup', () => endDrag(true));
  table.addEventListener('pointercancel', () => endDrag(false));
}

/**
 * Hide a set of column keys across the header, the rows, the cash row and the
 * per-row expand — and mirror them into the expand, which shows exactly what the
 * row is not. Lock columns are never in the set, so the load-bearing four and the
 * share action always show. Display only: no number is read or written here.
 */
function applyHoldingsHidden(hidden) {
  const table = $('#holdings');
  if (!table) return;
  let visible = 0;
  table.querySelectorAll('thead [data-col]').forEach((el) => {
    const on = !hidden.has(el.dataset.col);
    el.hidden = !on;
    if (on) visible += 1;
  });
  table.querySelectorAll('tbody .pos-row > [data-col], tbody .cash-row > [data-col]').forEach((el) => {
    el.hidden = hidden.has(el.dataset.col);
  });
  table.querySelectorAll('.pos-detail .kv[data-col]').forEach((el) => {
    el.hidden = !hidden.has(el.dataset.col);
  });
  table.querySelectorAll('.detail-cell').forEach((el) => { el.colSpan = visible; });
  table.toggleAttribute('data-has-hidden', hidden.size > 0);
}

/**
 * Start from the user's chosen-hidden set (plus the open-only columns under
 * Closed), then drop the lowest-priority columns one at a time until the table
 * stops overflowing its own container. The scoped scroll (US-49) is the last
 * resort — for the load-bearing four, not for eleven columns.
 */
function fitHoldingsColumns() {
  const table = $('#holdings');
  const wrap = $('#holdings-table-wrap');
  if (!table || !wrap || wrap.hidden) return;
  const status = state.posStatus ?? 'open';
  const hidden = baseHidden(status, userHiddenCols());
  applyHoldingsHidden(hidden);
  for (const c of droppableByPriority()) {
    if (table.scrollWidth <= wrap.clientWidth + 1) break;
    if (hidden.has(c.key)) continue;
    hidden.add(c.key);
    applyHoldingsHidden(hidden);
  }
}

let holdingsObserver = null;
/** One ResizeObserver on the table's own container — not the window, which is
 *  wider than the panel the table sits in — plus the delegated expand toggle. */
function ensureHoldingsObserver() {
  const wrap = $('#holdings-table-wrap');
  const table = $('#holdings');
  if (!wrap || !table) return;
  if (!holdingsObserver && typeof ResizeObserver !== 'undefined') {
    let queued = false;
    holdingsObserver = new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fitHoldingsColumns(); });
    });
    holdingsObserver.observe(wrap);
  }
  if (!table.dataset.expanderWired) {
    table.dataset.expanderWired = '1';
    table.addEventListener('click', (e) => {
      const btn = e.target.closest('.expander');
      if (!btn) return;
      const detail = btn.closest('.pos-row')?.nextElementSibling;
      if (!detail || !detail.classList.contains('pos-detail')) return;
      const opening = detail.hidden;
      detail.hidden = !opening;
      btn.setAttribute('aria-expanded', String(opening));
    });
  }
}

/**
 * The chooser — the escape hatch (US-61). Load-bearing columns are still not
 * offered to hide — theirs are rendered checked and disabled, which reads as
 * what it is: always on. They are listed at all because of US-93: the chooser
 * is the touch path to every column's explanation (a tap on the header itself
 * is taken — it sorts), and a path that skipped the four most-read columns
 * would leave exactly their texts hover-only (US-67). Toggling re-fits rather
 * than re-rendering, so the panel stays open while you tick through it.
 */
function buildColumnChooser() {
  const host = $('#holdings-columns');
  if (!host) return;
  const hidden = userHiddenCols();
  const items = HOLDINGS_COLUMNS.filter((c) => !c.action)
    .map((c) => (c.lock
      ? `<label${c.tip ? ` data-tip="${esc(tr(c.tip))}"` : ''}><input type="checkbox" checked disabled> ${esc(tr(c.label))}</label>`
      : `<label${c.tip ? ` data-tip="${esc(tr(c.tip))}"` : ''}><input type="checkbox" data-col="${c.key}"${hidden.has(c.key) ? '' : ' checked'}> ${esc(tr(c.label))}</label>`))
    .join('');
  host.innerHTML = `<button type="button" class="cols-btn" id="cols-btn" aria-expanded="false" aria-haspopup="true">${esc(tr('Columns'))}</button>`
    + `<div class="cols-pop" id="cols-pop" hidden role="group" aria-label="${esc(tr('Columns'))}">${items}</div>`;
  const btn = $('#cols-btn');
  const pop = $('#cols-pop');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const show = pop.hidden;
    pop.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
  });
  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-col]');
    if (!cb) return;
    const sortedKey = readHoldingsSort()?.key;
    const set = userHiddenCols();
    if (cb.checked) set.delete(cb.dataset.col); else set.add(cb.dataset.col);
    setUserHiddenCols(set);
    // US-87. Hiding the column the table is sorted on clears the sort — an
    // order driven by something invisible is a mystery order. This one needs a
    // re-render (the rows visibly change order), not just a re-fit.
    if (!cb.checked && cb.dataset.col === sortedKey) {
      setHoldingsSort(null);
      render();
      return;
    }
    fitHoldingsColumns();
  });
  if (!document.body.dataset.colsPopWired) {
    document.body.dataset.colsPopWired = '1';
    document.addEventListener('click', () => {
      const p = $('#cols-pop');
      if (p && !p.hidden) {
        p.hidden = true;
        $('#cols-btn')?.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/**
 * The same holdings as a share of the whole, for people who read a ring faster
 * than a column of numbers.
 *
 * Two things it deliberately does not do. It does not rank close values — that
 * is what the table is for, and it is one click away carrying the same colours.
 * And it does not draw liabilities: a written option has a negative value, a
 * share of a whole cannot be below zero, and folding one in by its absolute size
 * would draw a debt as though it were an asset. They are named underneath
 * instead.
 */
function renderHoldingsShare(composition, rows, compColours, t, r) {
  const share = state.holdingsView === 'share';
  $('#holdings-table-wrap').hidden = share;
  $('#holdings-pie-box').hidden = !share;
  if (!share) {
    $('#holdings-hint').textContent =
      'The same series as the stacked chart, as numbers — so nothing depends on telling two colours apart.';
    return;
  }

  // The composition's layers, not every holding. Drawing one slice per position
  // gives eleven of them, and everything past the seventh categorical slot
  // repeats a hue — two slices in the same colour is worse than no chart. The
  // layers are already ranked and folded into "Other", which is the same
  // grouping the stacked chart uses, so the two agree slice for slice.
  const slices = composition.layers
    .map((layer, i) => ({
      label: layer.label,
      value: layer.values.at(-1) ?? 0,
      colour: compColours[i] ?? t.muted,
    }))
    .filter((s) => s.value > 0);

  const liabilities = rows.filter((p) => p.current < 0);

  state.charts.holdingsPie = holdingsPieChart(
    $('#c-holdings-pie'),
    { labels: slices.map((s) => s.label), values: slices.map((s) => s.value), colours: slices.map((s) => s.colour) },
    t,
  );

  const owed = liabilities.reduce((a, p) => a + p.current, 0);
  const cashNote = r.totals.cash < 0 ? ` Cash is ${fmtEurCents(r.totals.cash)} and is left out for the same reason.` : '';
  $('#holdings-hint').textContent = liabilities.length
    ? `Share of what the account owns. ${liabilities.length} written position(s) worth ${fmtEurCents(owed)} are not ` +
      `shown — a share of a whole cannot be negative, and drawing a liability as a slice would read as an asset.` +
      `${cashNote} Switch to Table for the full picture.`
    : `Share of what the account owns.${cashNote} Switch to Table to compare values that sit close together — a ring ` +
      `is for reading proportions at a glance, not for ranking.`;
}

/**
 * The build on screen, in both modes.
 *
 * The extension reads its manifest. The demo could not, so it said "demo" and
 * nothing else — and the demo is the page that gets screenshotted and shown to
 * people, so those screenshots could not be tied to a build at all. It fetches
 * the same manifest the extension reads, once, and falls back to "demo" if that
 * fails rather than pretending.
 */
async function loadDemoVersion() {
  if (demoVersion !== null) return demoVersion;
  try {
    const res = await fetch(new URL('../../manifest.json', import.meta.url));
    demoVersion = String((await res.json()).version ?? '');
  } catch {
    demoVersion = '';
  }
  return demoVersion;
}

function renderFooter(r, data) {
  const version = inExtension ? chrome.runtime.getManifest().version : demoVersion;
  const bits = [
    // Which build is on screen. Without it a bug report is about a version
    // nobody can name, and this project ships four in an afternoon.
    version ? `v${version}` : 'demo',
    `${r.stats.transactions} transactions`,
    `${r.stats.cashRows} cash movements`,
    `${r.byProduct.length} instruments ever held`,
  ];
  if (r.totals.estimatedDays) bits.push(`${r.totals.estimatedDays} days valued on an estimated price`);
  if (data.mode === 'demo') bits.push('demo fixtures');
  // Which DEGIRO cluster this account is on. Worth showing without having to
  // run the connection check: it is the first thing to look at when a call
  // fails with a 404, and it differs per account.
  const cluster = clusterOf(data.urls);
  if (cluster) bits.push(`DEGIRO cluster: ${cluster}`);
  $('#footer-note').textContent = `${bits.join(' · ')}. Personal use only; this is an unofficial API and not sanctioned by DEGIRO.`;
}

/**
 * Notices live in their own container.
 *
 * Banners are derived from the data and are wiped on every render; notices are
 * the record of something that *happened* — a sync result, an error — and must
 * survive the re-render that follows it. Putting both in one container is how
 * the earlier build managed to print an error and erase it in the same tick.
 */
/**
 * US-73 — a notice opens its own row instead of shoving the page.
 *
 * `#notices` used to be appended to and emptied outright, so during a sync the
 * figures below jumped in one frame, **twice per notice**, while the reader was
 * looking at them. A sync posts one progress banner and clears it, so that is
 * two jumps every time, on the screen you are watching.
 *
 * The row is a grid whose single track goes `0fr → 1fr`. That transitions
 * without measuring anything and without a reflow per frame, which is the whole
 * reason for the extra wrapper: `height: auto` cannot be transitioned, and
 * `max-height` guesses a number that is wrong for a two-line message.
 */
function notice(kind, message, link) {
  const slot = document.createElement('div');
  slot.className = 'banner-slot';
  const clip = document.createElement('div');
  clip.className = 'banner-clip';
  const el = makeBanner(kind, message, link);
  clip.append(el);
  slot.append(clip);
  $('#notices').append(slot);
  // Opened on the next frame, because a class applied in the same frame as the
  // insert is the state the element was born in — there is nothing to transition
  // from.
  requestAnimationFrame(() => slot.classList.add('open'));
  return el;
}

/**
 * Rewriting the text must **not** re-animate: `startAndFollow` rewrites the same
 * banner once per step, and a banner that re-opened seven times per sync would
 * be worse than the jump this story is removing. Only the inner text node is
 * touched, so the row's own state never changes.
 */
function setNoticeText(el, message) {
  if (el?.lastElementChild) el.lastElementChild.textContent = message;
}

function clearNotices() {
  const host = $('#notices');
  if (!host) return;
  for (const slot of [...host.children]) {
    if (!slot.classList?.contains('banner-slot')) {
      slot.remove();
      continue;
    }
    slot.classList.remove('open');
    /**
     * Removed when the row has finished closing, and `transitionend` rather than
     * a timer — one row, one property, so it fires once. The guard is for the
     * case where the transition never runs at all (a reduced-motion setting, a
     * backgrounded tab): `getAnimations` is empty and the node goes immediately
     * rather than lingering as an invisible row.
     */
    const done = () => slot.remove();
    if (!slot.getAnimations?.().length && !getComputedStyle(slot).transitionDuration.startsWith('0s')) {
      slot.addEventListener('transitionend', done, { once: true });
      // A row that never transitions still has to go.
      setTimeout(done, 400);
    } else {
      done();
    }
  }
}

function renderDiagnostics(report) {
  const box = $('#diagnostics');
  /**
   * A modal rather than a card in the page flow.
   *
   * It is a once-a-month action whose output is a step table nobody needs beside
   * their charts, and `<dialog>` brings Escape, the focus trap and the backdrop
   * without a line of JavaScript. Opening it goes through `openModal`, which
   * holds the already-open guard — `showModal()` throws otherwise — and the
   * arrival, so this dialog and the share sheet behave identically.
   */
  openModal(box);
  /**
   * The title names the broker, read off the adapter's own `label` rather than
   * written here. That is what makes a second broker a data change instead of a
   * UI change: `brokers/index.js` documents `label` as "what the UI shows", and
   * every adapter carries its own `checkSession`.
   */
  const brokers = connectedBrokers(report?.rowCounts ?? null);
  const who = (brokers.length ? brokers : ADAPTERS).map((a) => a.label).join(', ');
  $('#diag-title').textContent = tr('Connection check · {broker}', { broker: who });
  $('#diag-summary').textContent = report.summary ?? '';

  const cell = (s) => {
    const bits = [];
    if (s.status != null) bits.push(`HTTP ${s.status}`);
    for (const [k, v] of Object.entries(s)) {
      if (['name', 'ok', 'note', 'status'].includes(k) || v == null) continue;
      bits.push(`${k}: ${Array.isArray(v) ? v.join(', ') || '—' : typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
    return bits.join(' · ');
  };

  $('#diag-table tbody').innerHTML = (report.steps ?? [])
    .map(
      (s) => `<tr>
        <td>${esc(s.name)}</td>
        <td class="${s.ok ? 'up' : 'down'}">${s.ok ? '✓ ok' : '✗ failed'}</td>
        <td style="text-align:left; white-space:normal">${esc(s.note ?? '')}${s.note ? '<br>' : ''}<span class="muted">${esc(cell(s))}</span></td>
      </tr>`,
    )
    .join('');

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function makeBanner(kind, message, link) {
  const icons = { error: '!', warn: '!', info: 'i', ok: '✓' };
  const el = document.createElement('div');
  el.className = `banner ${kind}`;
  el.innerHTML = `<span class="icon">${icons[kind] ?? 'i'}</span><span></span>`;
  el.lastElementChild.textContent = message;
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.text;
    a.style.marginLeft = '6px';
    el.lastElementChild.append(' ', a);
  }
  return el;
}

/** A data-derived banner. Wiped and rebuilt on every render. */
function banner(kind, message, link) {
  $('#banners').append(makeBanner(kind, message, link));
}

function showFatal(err) {
  $('#subtitle').textContent = 'Could not load.';
  banner('error', String(err?.message ?? err));
  console.error(err);
}

/**
 * Put a JSON payload on the clipboard, and say so when that is not allowed.
 *
 * `navigator.clipboard.writeText` rejects when the document is not focused, and
 * both copy buttons awaited it bare: the rejection was swallowed by the async
 * handler, the "copied" notice never appeared, and the page looked like the
 * button did nothing. Reporting the refusal costs three lines.
 *
 * @returns {Promise<boolean>} whether it landed
 */
async function copy(obj) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    return true;
  } catch (err) {
    notice('error', `Could not reach the clipboard: ${err.message ?? err}. Click the page once and try again.`);
    return false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The full export, gzipped in the browser (US-85).
 *
 * The export deliberately carries everything — every store, every price point —
 * because every defect so far needed a field nobody predicted. That makes big
 * accounts big: tens of megabytes, which no chat channel accepts. JSON this
 * repetitive compresses ~15x (measured on a real export: 1,83 MB → 116 kB), and
 * `CompressionStream` is built into every browser this runs in, so the fix is
 * to never hand the user the uncompressed file in the first place. Nothing
 * about the *content* changes: `gunzip` returns byte-for-byte what
 * `downloadJson` used to write.
 */
async function downloadJsonGz(obj, filename) {
  const stream = new Blob([JSON.stringify(obj, null, 2)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  downloadBlob(await new Response(stream).blob(), filename);
}

/** '/trading4/' out of 'https://trader.degiro.nl/trading4/secure/'. */
function clusterOf(urls) {
  if (!urls?.trading) return null;
  try {
    return new URL(urls.trading).pathname.split('/').filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

/** Zero is neither a gain nor a loss, so it stays in the default ink. */
function signClass(n) {
  if (Math.abs(n) < 0.005) return '';
  return n > 0 ? 'up' : 'down';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
