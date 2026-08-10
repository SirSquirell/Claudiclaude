/**
 * Full-page UI. SPEC §3.2: "the toolbar click or a button opens a full
 * extension page with the real chart. Range selector, hover tooltip with date +
 * value + delta, toggle for including/excluding cash, and a marker on days with
 * an external cashflow."
 */

import { aggregatePnl, buildComposition, candleSeries, monthlyTable, rangeEndIndex, rangeStartIndex } from '../lib/engine.js';
import { monthKey, weekKey } from '../lib/dates.js';
import {
  candleChart,
  compositionChart,
  cumulativeChart,
  depositChart,
  dividendChart,
  investedVsValueChart,
  holdingsPieChart,
  monthCompareChart,
  pnlChart,
  valueChart,
} from './charts.js';
import { alpha, fmtEurCents, fmtPct, fmtSigned, onThemeChange, tokens } from './theme.js';
import { inExtension, load, send, wantsDemo } from './datasource.js';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'];
const GRANS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const state = {
  data: null,
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
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Three is the readable limit for grouped bars, and for telling hues apart. */
const MAX_COMPARE = 3;

/** Specific months are one bar each, so a fourth still reads cleanly. */
const MAX_COMPARE_CELLS = 4;

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

init().catch(showFatal);

async function init() {
  buildControls();
  wireActions();
  onThemeChange(() => render());

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
  $('#subtitle').textContent = 'Loading…';
  try {
    state.data = await load();
  } catch (err) {
    return showFatal(err);
  }
  render();
}

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------

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

  $('#btn-clear-months').addEventListener('click', () => {
    state.selectedMonths = [];
    state.selectedCells = [];
    render();
  });
}

function wireActions() {
  const demo = wantsDemo();

  $('#btn-sync').addEventListener('click', async (e) => {
    if (demo || !inExtension) {
      notice('info', 'Demo mode has nothing to sync. Open this page from the extension toolbar to sync your real account.');
      return;
    }
    const btn = e.target;
    clearNotices();
    btn.disabled = true;

    // Poll the checkpoint the worker writes on every step. The sync runs in the
    // service worker, which may outlive or predecease this page, so progress is
    // read from storage rather than pushed down the message channel.
    const progress = notice('info', 'Starting…');
    const poll = setInterval(async () => {
      try {
        const st = await send({ type: 'status' });
        const s = st.syncState;
        if (!s) return;
        const step = state.steps.indexOf(s.phase);
        const n = step >= 0 ? `Step ${step + 1} of ${state.steps.length} · ` : '';
        btn.textContent = s.pct != null ? `Syncing ${s.pct}%` : 'Syncing…';
        setNoticeText(progress, `${n}${s.message}`);
      } catch {
        /* the worker may be restarting; the next tick will catch up */
      }
    }, 400);

    try {
      const res = await send({ type: 'sync', force: true });
      clearInterval(poll);
      clearNotices();
      if (!res.ok) {
        notice('error', `Sync failed: ${res.message ?? 'unknown error'}`);
        notice('info', 'Press “Check connection” to see which step broke.');
      } else {
        const c = res.counts ?? {};
        notice(
          'ok',
          `Synced in ${((res.tookMs ?? 0) / 1000).toFixed(1)}s — ${c.transactions ?? 0} transactions, ` +
            `${c.cashRows ?? 0} cash movements, ${c.instruments ?? 0} instruments, ${c.days ?? 0} days.`,
        );
      }
      await refresh();
    } catch (err) {
      clearInterval(poll);
      clearNotices();
      notice('error', `Sync failed: ${err.message ?? err}`);
      notice('info', 'Press “Check connection” to see which step broke.');
    } finally {
      clearInterval(poll);
      btn.disabled = false;
      btn.textContent = 'Sync now';
    }
  });

  $('#btn-diagnose').addEventListener('click', async (e) => {
    if (!inExtension) {
      notice('info', 'The connection check only works inside the extension.');
      return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Checking…';
    clearNotices();
    try {
      state.diagnostics = await send({ type: 'diagnose' });
      renderDiagnostics(state.diagnostics);
    } catch (err) {
      notice('error', `Could not run the check: ${err.message ?? err}`);
    } finally {
      e.target.disabled = false;
      e.target.textContent = 'Check connection';
    }
  });

  $('#btn-copy-diag').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(state.diagnostics, null, 2));
    notice('ok', 'Report copied to the clipboard.');
  });

  $('#btn-hide-diag').addEventListener('click', () => {
    $('#diagnostics').hidden = true;
  });

  $('#btn-export').addEventListener('click', async () => {
    const payload = demo || !inExtension ? state.data : await send({ type: 'export' });
    downloadJson(payload, `degiro-portfolio-${new Date().toISOString().slice(0, 10)}.json`);
  });

  $('#btn-wipe').addEventListener('click', async () => {
    if (demo || !inExtension) {
      banner('info', 'Nothing stored in demo mode.');
      return;
    }
    if (!confirm('Delete every stored response and re-download the full history from DEGIRO?')) return;
    clearNotices();
    notice('info', 'Wiping and re-downloading. Leave this tab open until it finishes.');
    // One message: the worker waits for any running sync, wipes, then starts a
    // fresh one. Splitting it lets a wipe land in the middle of a sync.
    const res = await send({ type: 'wipe' });
    clearNotices();
    if (res && res.ok === false) notice('error', `Resync failed: ${res.message ?? 'unknown error'}`);
    await refresh();
  });

  if (demo || !inExtension) {
    for (const id of ['#btn-wipe']) $(id).disabled = true;
  }
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

function render() {
  const { data } = state;
  if (!data) return;

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
  $('#subtitle').textContent = `${r.start} → ${r.end} · ${r.days.length} days · ${modeNote}`;

  renderBanners(data, r);
  renderTiles(r);

  // --- range window -----------------------------------------------------
  const from = rangeStartIndex(r.days, state.range);
  const to = rangeEndIndex(r.days, state.range);
  const slice = (arr) => arr.slice(from, to + 1);

  const gran = state.granularity === 'auto' ? autoGranularity(to - from + 1) : state.granularity;
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

  state.charts.value = valueChart(
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
      includeCash: state.includeCash,
    },
    t,
  );

  const agg = aggregatePnl(r.days, r.pnl, gran, from, to);
  state.charts.pnl = pnlChart($('#c-pnl'), agg, t);
  renderCumulative(r, gran, from, to, agg, t);

  // One composition and one set of colours, used three times: the stacked chart,
  // the holdings table's swatches and the share ring. All three must agree on
  // which colour is which holding, so the resolution happens once, here.
  const composition = buildComposition(r, 6, from, to);
  const compColours = compositionColours(composition, t);
  state.charts.comp = compositionChart($('#c-comp'), downsampleComposition(composition, ends, from), t, compColours);

  state.charts.invested = investedVsValueChart(
    $('#c-invested'),
    { days: atEnds(r.days), value: atEnds(r.value), cumulativeDeposited: atEnds(r.cumulativeDeposited) },
    t,
  );

  state.charts.deposits = depositChart($('#c-deposits'), monthlyFlows(r, from, to), t);

  // Dividends are shown for the whole history rather than the selected range —
  // a month of dividends is too sparse to be worth a range filter.
  const dividendCard = $('#c-dividends').closest('.card');
  dividendCard.hidden = r.dividendsByMonth.length === 0;
  if (!dividendCard.hidden) {
    state.charts.dividends = dividendChart($('#c-dividends'), r.dividendsByMonth, t);
  }

  const months = monthlyTable(r);
  renderMonthMatrix(months, t);
  renderMonthCompare(months, t);

  renderHoldings(r, composition, compColours, t, from, to);
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

  let anchor = null;
  let pending = false;

  const indexAt = (event) => {
    const chart = state.charts.value;
    if (!chart) return null;
    const area = chart.chartArea;
    const x = event.offsetX;
    if (x < area.left || x > area.right) return null;
    const labels = chart.data.labels ?? [];
    if (!labels.length) return null;
    const frac = (x - area.left) / Math.max(1, area.right - area.left);
    return Math.min(labels.length - 1, Math.max(0, Math.round(frac * (labels.length - 1))));
  };

  /**
   * Show the selection while the pointer is down.
   *
   * There was no `pointermove` here at all: the drag recorded an anchor, applied
   * a range on release, and drew nothing in between — so both ends of the
   * selection had to be guessed at. Reported, fairly, as not being able to see
   * what you are selecting.
   *
   * Pointer events fire more often than the screen updates, so the paint is
   * collapsed onto the next animation frame. `chart.render()` repaints from a
   * layout that already exists, which is what makes this cheap enough to do on
   * a two-thousand-point series.
   */
  const paint = (a, b) => {
    const chart = state.charts.value;
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

  /**
   * The hover tooltip is noise during a drag: it lands on top of the readout
   * that says what is being selected, which is the one thing being read. Off
   * while the pointer is down, back on release — twice per gesture, so the
   * `update` it costs is not on the hot path.
   */
  const tooltip = (on) => {
    const chart = state.charts.value;
    const cfg = chart?.options?.plugins?.tooltip;
    if (!cfg || cfg.enabled === on) return;
    cfg.enabled = on;
    chart.update('none');
  };

  const clear = () => {
    anchor = null;
    paint(null, null);
    tooltip(true);
  };

  canvas.addEventListener('pointerdown', (e) => {
    anchor = indexAt(e);
    if (anchor != null) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (anchor == null) return;
    const here = indexAt(e);
    if (here == null) return;
    // Only once the pointer has actually left the anchor, so a plain click that
    // wobbles by a pixel does not flash the tooltip off and on.
    if (here !== anchor) tooltip(false);
    paint(anchor, here);
  });
  canvas.addEventListener('pointercancel', clear);
  canvas.addEventListener('pointerup', (e) => {
    const labels = state.charts.value?.data?.labels ?? [];
    const start = labels[anchor];
    const end = labels[indexAt(e)];
    clear();
    if (!start || !end) return;
    // A click is not a drag. Below this it is someone reading the tooltip.
    if (Math.abs(new Date(end) - new Date(start)) < 2 * 86400000) return;
    const [from, to] = start <= end ? [start, end] : [end, start];
    zoomTo(`${from}..${to}`);
  });
}

function zoomTo(range) {
  state.zoomFrom = state.range;
  state.range = range;
  for (const b of $('#range-group').querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
  render();
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
function renderCumulative(r, gran, from, to, agg, t) {
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

  state.charts.cum = cumulativeChart($('#c-cum'), agg, t);
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

function renderTiles(r) {
  const last = r.days.length - 1;
  const dayPnl = r.pnl[last];
  const weekPnl = r.pnl.slice(Math.max(0, last - 6)).reduce((a, b) => a + b, 0);

  const tiles = [
    { label: 'Total value', value: fmtEurCents(r.totals.value), note: `${fmtEurCents(r.totals.cash)} of it is cash` },
    {
      label: 'Money paid in',
      value: fmtEurCents(r.totals.invested),
      note: 'deposits minus withdrawals',
    },
    {
      label: 'Total result',
      value: fmtSigned(r.totals.totalPnl),
      note: fmtPct(r.totals.totalReturnPct),
      cls: signClass(r.totals.totalPnl),
    },
    { label: 'Today', value: fmtSigned(dayPnl), note: `This week ${fmtSigned(weekPnl)}`, cls: signClass(dayPnl) },
    {
      label: 'Dividend received',
      value: fmtEurCents(r.income.dividendGross + r.income.dividendTax),
      note: `${fmtEurCents(Math.abs(r.income.dividendTax))} withheld`,
    },
    { label: 'Fees paid', value: fmtEurCents(Math.abs(r.income.fees)), note: 'transaction and service costs' },
  ];

  $('#tiles').innerHTML = tiles
    .map(
      (t) => `
      <div class="tile">
        <div class="label">${esc(t.label)}</div>
        <div class="value ${t.cls ?? ''}">${esc(t.value)}</div>
        <div class="note">${esc(t.note)}</div>
      </div>`,
    )
    .join('');
}

function renderBanners(data, r) {
  if (data.mode === 'demo') {
    banner(
      'info',
      'Demo mode. These charts are built from generated fixtures with the same code path that runs against your real account — good for checking the UI, useless as financial information.',
    );
  }

  if (r.reconciliation) {
    if (r.reconciliation.ok) {
      banner('ok', `Reconstructed total matches DEGIRO exactly (${fmtEurCents(r.reconciliation.live)}).`);
    } else {
      banner(
        'error',
        `Reconstructed total is ${fmtEurCents(r.reconciliation.reconstructed)} but DEGIRO reports ` +
          `${fmtEurCents(r.reconciliation.live)} — off by ${fmtSigned(r.reconciliation.diff)}. ` +
          `If today is wrong, the history is wrong too. Do not trust these charts until this is zero.`,
      );
    }
  }

  // Warnings arrive one per instrument, so a portfolio missing 79 price series
  // would otherwise bury the page in 79 identical banners. One per kind, with a
  // count, and the detail stays in the exported JSON.
  const seen = new Map();
  for (const w of r.warnings) {
    if (w.code === 'no-data') continue;
    const group = seen.get(w.code) ?? { ...w, count: 0 };
    group.count++;
    seen.set(w.code, group);
  }
  for (const w of seen.values()) {
    // The engine aggregates its own repeats now; this only catches anything
    // that still slips through, and says how many rather than naming one.
    const suffix = w.count > 1 ? ` (${w.count}×)` : '';
    const kind = w.level === 'error' ? 'error' : w.level === 'info' ? 'info' : 'warn';
    banner(kind, w.message + suffix);
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

function renderMonthMatrix(months, t) {
  const table = $('#months');
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
          const cls = `cell${extremeKeys.has(c.month) ? ' extreme' : ''}${pick >= 0 ? ' picked' : ''}`;
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

/** Sum a per-day series across the selected window, inclusive at both ends. */
const sumWindow = (arr, from, to) => {
  let s = 0;
  for (let i = Math.max(0, from); i <= to && i < arr.length; i++) s += arr[i];
  return s;
};

function renderHoldings(r, composition, compColours, t, from, to) {
  const total = r.totals.value || 1;
  const colours = colourByProduct(composition, compColours, t);
  const otherLabel = composition.layers.find((l) => l.key === '__other__')?.label;
  const rows = [...r.byProduct]
    .filter((p) => Math.abs(p.current) > 0.005)
    .sort((a, b) => b.current - a.current);

  // Everything the account made in this window, and the part of it that came
  // from a position moving. The difference is not an error: cash earns
  // dividends and interest, pays fees, and — in an account holding foreign
  // currency — gains and loses on the rate with no position involved at all.
  // Putting the difference on the cash row is what makes the column add up, and
  // it is a true statement rather than a plug.
  const accountResult = sumWindow(r.pnl, from, to);
  const positionResult = r.byProduct.reduce((a, p) => a + sumWindow(p.pnl, from, to), 0);

  const resultCell = (v) =>
    `<td class="${v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : 'muted'}">${esc(fmtSigned(v))}</td>`;

  const body = rows
    .map((p) => {
      const colour = colours.get(p.productId) ?? t.muted;
      const grouped = otherLabel && !composition.layers.some((l) => l.productId === p.productId);
      const qty = p.qty.at(-1);
      // A result is only as good as the prices behind it. An instrument with no
      // series sits flat at its last traded price, so its movement between
      // trades is invented — diluted in a total, but the whole of this number.
      //
      // Read off the product, not out of a warning. The first version of this
      // searched `w.products` on the warnings array, a field that does not
      // exist, so the marker could never appear at all; and the warning that
      // does carry instruments truncates them at 40.
      const estimated = p.hasSeries === false;
      return `<tr>
        <td><span class="swatch" style="background:${colour}"></span>${esc(p.name)}${p.symbol && p.symbol !== p.name ? ` <span class="muted">${esc(p.symbol)}</span>` : ''}${grouped ? ` <span class="muted">· in “${esc(otherLabel)}”</span>` : ''}</td>
        <td>${qty.toLocaleString('nl-NL', { maximumFractionDigits: 4 })}</td>
        <td>${esc(fmtEurCents(p.current))}</td>
        ${resultCell(sumWindow(p.pnl, from, to))}
        <td>${((p.current / total) * 100).toFixed(1)}%</td>
        <td>${esc(p.currency)}${estimated ? ' <span class="muted" title="No price history for this instrument, so it is held at the last price it traded at — its result is an estimate.">·&nbsp;est.</span>' : ''}</td>
      </tr>`;
    })
    .join('');

  const cashRow = `<tr>
      <td><span class="swatch" style="background:${t.cash}"></span>Cash <span class="muted">· dividend, interest, fees and currency</span></td>
      <td class="muted">—</td>
      <td>${esc(fmtEurCents(r.totals.cash))}</td>
      ${resultCell(accountResult - positionResult)}
      <td>${((r.totals.cash / total) * 100).toFixed(1)}%</td>
      <td>${esc(r.baseCurrency)}</td>
    </tr>`;

  $('#holdings tbody').innerHTML = body + cashRow;

  renderHoldingsShare(composition, rows, compColours, t, r);
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

function renderFooter(r, data) {
  const bits = [
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
function notice(kind, message, link) {
  const el = makeBanner(kind, message, link);
  $('#notices').append(el);
  return el;
}

function setNoticeText(el, message) {
  if (el?.lastElementChild) el.lastElementChild.textContent = message;
}

function clearNotices() {
  $('#notices').innerHTML = '';
}

function renderDiagnostics(report) {
  const box = $('#diagnostics');
  box.hidden = false;
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

function downloadJson(obj, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
