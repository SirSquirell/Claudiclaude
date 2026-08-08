/**
 * Full-page UI. SPEC §3.2: "the toolbar click or a button opens a full
 * extension page with the real chart. Range selector, hover tooltip with date +
 * value + delta, toggle for including/excluding cash, and a marker on days with
 * an external cashflow."
 */

import { aggregatePnl, buildComposition, rangeStartIndex } from '../lib/engine.js';
import { monthKey } from '../lib/dates.js';
import {
  compositionChart,
  cumulativeChart,
  depositChart,
  dividendChart,
  investedVsValueChart,
  pnlChart,
  valueChart,
} from './charts.js';
import { fmtEurCents, fmtPct, fmtSigned, onThemeChange, tokens } from './theme.js';
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
};

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

init().catch(showFatal);

async function init() {
  buildControls();
  wireActions();
  onThemeChange(() => render());
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
}

function wireActions() {
  const demo = wantsDemo();

  $('#btn-sync').addEventListener('click', async (e) => {
    if (demo || !inExtension) {
      banner('info', 'Demo mode has nothing to sync. Load the extension in Chrome and open it from the toolbar to sync your real account.');
      return;
    }
    e.target.disabled = true;
    e.target.textContent = 'Syncing…';
    try {
      const res = await send({ type: 'sync', force: true });
      if (!res.ok) banner('error', res.message ?? 'Sync failed.');
      await refresh();
    } catch (err) {
      banner('error', String(err.message ?? err));
    } finally {
      e.target.disabled = false;
      e.target.textContent = 'Sync now';
    }
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
    await send({ type: 'wipe' });
    await send({ type: 'sync', force: true });
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
  const to = r.days.length - 1;
  const slice = (arr) => arr.slice(from, to + 1);

  const gran = state.granularity === 'auto' ? autoGranularity(to - from + 1) : state.granularity;
  markAutoGranularity(gran);

  destroyCharts();

  state.charts.value = valueChart(
    $('#c-value'),
    {
      days: slice(r.days),
      value: slice(r.value),
      positionsValue: slice(r.positionsValue),
      netExternal: slice(r.netExternal),
      includeCash: state.includeCash,
    },
    t,
  );

  const agg = aggregatePnl(r.days, r.pnl, gran, from, to);
  state.charts.pnl = pnlChart($('#c-pnl'), agg, t);
  state.charts.cum = cumulativeChart($('#c-cum'), agg, t);

  // One composition, used twice: once for the stacked chart and once to colour
  // the holdings table. Both must agree on which colour is which holding.
  const composition = buildComposition(r, 6, from, to);
  state.charts.comp = compositionChart($('#c-comp'), composition, t);

  state.charts.invested = investedVsValueChart(
    $('#c-invested'),
    { days: slice(r.days), value: slice(r.value), cumulativeDeposited: slice(r.cumulativeDeposited) },
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

  renderHoldings(r, composition, t);
  renderFooter(r, data);
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

  for (const w of r.warnings) {
    if (w.code === 'no-data') continue;
    banner(w.level === 'error' ? 'error' : 'warn', w.message);
  }
}

/**
 * Map every holding to the colour the stacked chart actually painted it. The
 * chart colours layer i with categorical slot i, so the mapping is read off the
 * layers rather than recomputed — otherwise the table and the chart drift apart
 * and the swatches become lies.
 */
function colourByProduct(composition, t) {
  const map = new Map();
  composition.layers.forEach((layer, i) => {
    const colour = layer.key === '__cash__' ? t.cash : t.series[i % t.series.length];
    if (layer.productId) map.set(layer.productId, colour);
    for (const id of layer.members ?? []) map.set(id, colour);
  });
  return map;
}

function renderHoldings(r, composition, t) {
  const total = r.totals.value || 1;
  const colours = colourByProduct(composition, t);
  const otherLabel = composition.layers.find((l) => l.key === '__other__')?.label;
  const rows = [...r.byProduct]
    .filter((p) => Math.abs(p.current) > 0.005)
    .sort((a, b) => b.current - a.current);

  const body = rows
    .map((p) => {
      const colour = colours.get(p.productId) ?? t.muted;
      const grouped = otherLabel && !composition.layers.some((l) => l.productId === p.productId);
      const qty = p.qty.at(-1);
      return `<tr>
        <td><span class="swatch" style="background:${colour}"></span>${esc(p.name)}${p.symbol && p.symbol !== p.name ? ` <span class="muted">${esc(p.symbol)}</span>` : ''}${grouped ? ` <span class="muted">· in “${esc(otherLabel)}”</span>` : ''}</td>
        <td>${qty.toLocaleString('nl-NL', { maximumFractionDigits: 4 })}</td>
        <td>${esc(fmtEurCents(p.current))}</td>
        <td>${((p.current / total) * 100).toFixed(1)}%</td>
        <td>${esc(p.currency)}</td>
      </tr>`;
    })
    .join('');

  const cashRow = `<tr>
      <td><span class="swatch" style="background:${t.cash}"></span>Cash</td>
      <td class="muted">—</td>
      <td>${esc(fmtEurCents(r.totals.cash))}</td>
      <td>${((r.totals.cash / total) * 100).toFixed(1)}%</td>
      <td>${esc(r.baseCurrency)}</td>
    </tr>`;

  $('#holdings tbody').innerHTML = body + cashRow;
}

function renderFooter(r, data) {
  const bits = [
    `${r.stats.transactions} transactions`,
    `${r.stats.cashRows} cash movements`,
    `${r.byProduct.length} instruments ever held`,
  ];
  if (r.totals.estimatedDays) bits.push(`${r.totals.estimatedDays} days valued on an estimated price`);
  if (data.mode === 'demo') bits.push('demo fixtures');
  $('#footer-note').textContent = `${bits.join(' · ')}. Personal use only; this is an unofficial API and not sanctioned by DEGIRO.`;
}

function banner(kind, message, link) {
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
  $('#banners').append(el);
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

/** Zero is neither a gain nor a loss, so it stays in the default ink. */
function signClass(n) {
  if (Math.abs(n) < 0.005) return '';
  return n > 0 ? 'up' : 'down';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
