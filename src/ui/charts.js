/**
 * Chart builders. Chart.js is loaded as a UMD global from vendor/ (SPEC §3:
 * "bundled locally, MV3 CSP forbids remote scripts").
 *
 * Design rules applied throughout:
 *  - one y-axis per chart, always. Where a period figure and a running total
 *    both matter they get two charts, never two scales on one plot.
 *  - hairline grid, no dashes, no point markers on dense series.
 *  - a legend whenever there are two or more series; single-series charts are
 *    named by their title instead.
 *  - gains and losses use the blue/red diverging pair, and the zero baseline
 *    already carries the sign, so colour is never the only channel.
 */

import { alpha, fmtEur, fmtEurCents, fmtSigned } from './theme.js';
import { daysBetween, formatDay } from '../lib/dates.js';

const { Chart } = globalThis;

/**
 * Axis labels for a daily series. The labels themselves stay ISO so tooltips
 * and lookups are unambiguous; only the *tick* is abbreviated, and how far it
 * abbreviates depends on how much time is on screen. Without this, a five-year
 * range renders "17 sep 2021" nine times and they collide.
 */
function dayTickFormatter(days) {
  const span = days.length > 1 ? daysBetween(days[0], days.at(-1)) : 1;
  const style = span > 400 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
  const fmt = new Intl.DateTimeFormat('nl-NL', { ...style, timeZone: 'UTC' });
  return (_value, index) => {
    const iso = days[index];
    return iso ? fmt.format(new Date(`${iso}T00:00:00Z`)) : '';
  };
}

/** Shared axis/tooltip chrome. */
function baseOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 4, right: 4 } },
    plugins: {
      legend: {
        display: false,
        position: 'bottom',
        align: 'start',
        labels: {
          color: t.textSecondary,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'rectRounded',
          padding: 14,
          font: { family: 'system-ui, -apple-system, sans-serif', size: 12 },
        },
      },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.text,
        bodyColor: t.textSecondary,
        borderColor: t.axis,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: t.axis },
        ticks: {
          color: t.muted,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7,
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: t.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: t.muted,
          padding: 8,
          font: { size: 11 },
          callback: (v) => fmtEur(v),
        },
      },
    },
  };
}

/**
 * Vertical crosshair on hover. Chart.js draws a tooltip but no rule; on a
 * five-year daily series the rule is what lets you line a date up with the axis.
 */
const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(chart, _args, opts) {
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = opts.color ?? '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Little ticks along the baseline on days money moved in or out of the account.
 * SPEC §3.2: "a marker on days with an external cashflow" — without them the
 * value chart's jumps look like performance.
 */
const cashflowMarkers = {
  id: 'cashflowMarkers',
  afterDatasetsDraw(chart, _args, opts) {
    const marks = opts?.marks;
    if (!marks?.length) return;
    const xScale = chart.scales.x;
    const { bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    for (const m of marks) {
      const x = xScale.getPixelForValue(m.index);
      if (!Number.isFinite(x) || x < chart.chartArea.left || x > chart.chartArea.right) continue;
      ctx.fillStyle = m.amount >= 0 ? opts.inColor : opts.outColor;
      ctx.beginPath();
      // Up triangle for money in, down triangle for money out.
      if (m.amount >= 0) {
        ctx.moveTo(x, bottom - 7);
        ctx.lineTo(x - 3.5, bottom - 1);
        ctx.lineTo(x + 3.5, bottom - 1);
      } else {
        ctx.moveTo(x, bottom - 1);
        ctx.lineTo(x - 3.5, bottom - 7);
        ctx.lineTo(x + 3.5, bottom - 7);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
};

Chart.register(crosshair, cashflowMarkers);

/**
 * Stride-sample a set of parallel arrays down to at most `max` points, always
 * keeping the first and last. Only used on the stacked chart, where seven
 * series × two thousand days is a lot of geometry for no extra information.
 */
export function downsample(labels, seriesList, max = 500) {
  const n = labels.length;
  if (n <= max) return { labels, seriesList };
  const stride = Math.ceil(n / max);
  const keep = [];
  for (let i = 0; i < n; i += stride) keep.push(i);
  if (keep.at(-1) !== n - 1) keep.push(n - 1);
  return {
    labels: keep.map((i) => labels[i]),
    seriesList: seriesList.map((s) => keep.map((i) => s[i])),
  };
}

// ---------------------------------------------------------------------------
// 1. Portfolio value including cash
// ---------------------------------------------------------------------------

export function valueChart(ctx, { days, value, positionsValue, netExternal, includeCash }, t) {
  const series = includeCash ? value : positionsValue;
  const marks = [];
  for (let i = 0; i < days.length; i++) {
    if (Math.abs(netExternal[i]) > 0.005) marks.push({ index: i, amount: netExternal[i] });
  }

  const opts = baseOptions(t);
  opts.plugins.crosshair = { color: t.axis };
  opts.plugins.cashflowMarkers = { marks, inColor: t.pos, outColor: t.neg };
  opts.plugins.tooltip.callbacks = {
    title: (items) => formatDay(days[items[0].dataIndex]),
    label: (item) => `Value: ${fmtEurCents(item.parsed.y)}`,
    afterBody: (items) => {
      const i = items[0].dataIndex;
      const lines = [];
      if (i > 0) lines.push(`Day change: ${fmtSigned(series[i] - series[i - 1])}`);
      if (Math.abs(netExternal[i]) > 0.005) {
        lines.push(`${netExternal[i] > 0 ? 'Deposit' : 'Withdrawal'}: ${fmtSigned(netExternal[i])}`);
      }
      return lines;
    },
  };

  opts.scales.x.ticks.callback = dayTickFormatter(days);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          data: series,
          borderColor: t.series[0],
          backgroundColor: alpha(t.series[0], 0.12),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderColor: t.surface,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: t.series[0],
          fill: 'origin',
          tension: 0,
        },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// 2. Result per period (diverging bars)
// ---------------------------------------------------------------------------

export function pnlChart(ctx, { labels, pnl, starts }, t) {
  const opts = baseOptions(t);
  opts.interaction = { mode: 'index', intersect: false };
  opts.plugins.tooltip.callbacks = {
    title: (items) => starts[items[0].dataIndex] ?? labels[items[0].dataIndex],
    label: (item) => `${item.parsed.y >= 0 ? 'Gain' : 'Loss'}: ${fmtSigned(item.parsed.y)}`,
  };
  opts.scales.y.grid.color = (c) => (c.tick.value === 0 ? t.axis : t.grid);

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data: pnl,
          backgroundColor: pnl.map((v) => (v >= 0 ? alpha(t.pos, 0.85) : alpha(t.neg, 0.85))),
          borderRadius: 4,
          borderSkipped: 'middle',
          // A 2px surface gap between neighbouring bars instead of a stroke.
          borderColor: t.surface,
          borderWidth: { top: 0, bottom: 0, left: 1, right: 1 },
          maxBarThickness: 42,
        },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// 3. Cumulative result — its own chart, so nothing needs a second y-axis
// ---------------------------------------------------------------------------

export function cumulativeChart(ctx, { labels, cumulative, starts }, t) {
  const opts = baseOptions(t);
  opts.plugins.crosshair = { color: t.axis };
  opts.plugins.tooltip.callbacks = {
    title: (items) => starts[items[0].dataIndex] ?? labels[items[0].dataIndex],
    label: (item) => `Cumulative: ${fmtSigned(item.parsed.y)}`,
  };
  opts.scales.y.grid.color = (c) => (c.tick.value === 0 ? t.axis : t.grid);

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: cumulative,
          borderColor: t.series[0],
          backgroundColor: alpha(t.series[0], 0.1),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: 'origin',
        },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// 4. Build-up of the portfolio: stacked value per holding, plus cash
// ---------------------------------------------------------------------------

export function compositionChart(ctx, composition, t) {
  // `sampledDays` are the ISO days that survived downsampling; the tooltip
  // titles come from these, not from an index arithmetic guess.
  const { labels: sampledDays, seriesList } = downsample(
    composition.days,
    composition.layers.map((l) => l.values),
    500,
  );

  const colorFor = (layer, i) => {
    if (layer.key === '__cash__') return t.cash;
    return t.series[i % t.series.length];
  };

  const datasets = composition.layers.map((layer, i) => ({
    label: layer.label,
    data: seriesList[i],
    backgroundColor: alpha(colorFor(layer, i), 0.85),
    borderColor: t.surface,
    // A 2px surface gap between stacked bands, rather than an outline.
    borderWidth: 1,
    pointRadius: 0,
    pointHoverRadius: 0,
    fill: true,
    tension: 0,
  }));

  const opts = baseOptions(t);
  opts.plugins.legend.display = true;
  opts.plugins.crosshair = { color: t.axis };
  opts.scales.y.stacked = true;
  opts.scales.x.stacked = true;
  opts.scales.x.ticks.callback = dayTickFormatter(sampledDays);
  opts.plugins.tooltip.callbacks = {
    title: (items) => formatDay(sampledDays[items[0].dataIndex]),
    label: (item) => `${item.dataset.label}: ${fmtEurCents(item.parsed.y)}`,
    footer: (items) => `Total: ${fmtEurCents(items.reduce((a, i) => a + i.parsed.y, 0))}`,
  };
  opts.plugins.tooltip.itemSort = (a, b) => b.parsed.y - a.parsed.y;

  return new Chart(ctx, { type: 'line', data: { labels: sampledDays, datasets }, options: opts });
}

// ---------------------------------------------------------------------------
// 5. Money paid in vs what it is worth — two series, one euro axis
// ---------------------------------------------------------------------------

export function investedVsValueChart(ctx, { days, value, cumulativeDeposited }, t) {
  const opts = baseOptions(t);
  opts.plugins.legend.display = true;
  opts.plugins.crosshair = { color: t.axis };
  opts.scales.x.ticks.callback = dayTickFormatter(days);
  opts.plugins.tooltip.callbacks = {
    title: (items) => formatDay(days[items[0].dataIndex]),
    label: (item) => `${item.dataset.label}: ${fmtEurCents(item.parsed.y)}`,
    footer: (items) => {
      const i = items[0].dataIndex;
      const gap = value[i] - cumulativeDeposited[i];
      return `Growth: ${fmtSigned(gap)}`;
    },
  };

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Portfolio value',
          data: value,
          borderColor: t.series[0],
          backgroundColor: alpha(t.series[0], 0.1),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: '+1', // shade the gap between value and money paid in
        },
        {
          label: 'Money paid in (net)',
          data: cumulativeDeposited,
          borderColor: t.series[1],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
        },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// 6. Deposits and withdrawals per month
// ---------------------------------------------------------------------------

export function depositChart(ctx, { labels, amounts }, t) {
  const opts = baseOptions(t);
  opts.plugins.tooltip.callbacks = {
    label: (item) => `${item.parsed.y >= 0 ? 'Paid in' : 'Taken out'}: ${fmtSigned(item.parsed.y)}`,
  };
  opts.scales.y.grid.color = (c) => (c.tick.value === 0 ? t.axis : t.grid);

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data: amounts,
          backgroundColor: amounts.map((v) => (v >= 0 ? alpha(t.pos, 0.85) : alpha(t.neg, 0.85))),
          borderRadius: 4,
          borderSkipped: 'middle',
          borderColor: t.surface,
          borderWidth: { top: 0, bottom: 0, left: 1, right: 1 },
          maxBarThickness: 28,
        },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// 7. Dividend per month — net received, with withholding tax stacked below
// ---------------------------------------------------------------------------

export function dividendChart(ctx, rows, t) {
  const opts = baseOptions(t);
  opts.plugins.legend.display = true;
  opts.scales.y.stacked = true;
  opts.scales.x.stacked = true;
  opts.plugins.tooltip.callbacks = {
    label: (item) => `${item.dataset.label}: ${fmtEurCents(Math.abs(item.parsed.y))}`,
    footer: (items) => {
      const row = rows[items[0].dataIndex];
      return `Gross: ${fmtEurCents(row.gross)}`;
    },
  };

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.month),
      datasets: [
        {
          label: 'Received (net)',
          data: rows.map((r) => r.net),
          backgroundColor: alpha(t.series[0], 0.85),
          borderRadius: 4,
          borderSkipped: 'middle',
          borderColor: t.surface,
          borderWidth: { left: 1, right: 1 },
          maxBarThickness: 30,
        },
        {
          label: 'Withholding tax',
          data: rows.map((r) => r.tax),
          backgroundColor: alpha(t.series[1], 0.85),
          borderRadius: 4,
          borderSkipped: 'middle',
          borderColor: t.surface,
          borderWidth: { left: 1, right: 1 },
          maxBarThickness: 30,
        },
      ],
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// 8. Compare specific months across years — grouped bars, one group per year
// ---------------------------------------------------------------------------

/**
 * @param {{years: string[], series: Array<{label: string, month: number, values: (number|null)[]}>}} data
 * @param {'pnl'|'returnPct'} metric
 */
export function monthCompareChart(ctx, data, metric, t) {
  const money = metric === 'pnl';
  const opts = baseOptions(t);
  opts.plugins.legend.display = true;
  opts.scales.y.grid.color = (c) => (c.tick.value === 0 ? t.axis : t.grid);
  opts.scales.y.ticks.callback = (v) => (money ? fmtEur(v) : `${v}%`);
  opts.plugins.tooltip.callbacks = {
    title: (items) => `${items[0].dataset.label} ${items[0].label}`,
    label: (item) =>
      item.parsed.y == null
        ? 'no data'
        : money
          ? fmtSigned(item.parsed.y)
          : `${item.parsed.y > 0 ? '+' : ''}${item.parsed.y.toFixed(2)}%`,
  };

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.years,
      datasets: data.series.map((s, i) => ({
        label: s.label,
        data: s.values,
        // The caller resolves the hue per month and guarantees no two selected
        // months collide; deselecting June must not repaint November.
        backgroundColor: alpha(s.colour, 0.85),
        borderRadius: 4,
        borderSkipped: 'middle',
        borderColor: t.surface,
        borderWidth: { left: 1, right: 1 },
        maxBarThickness: 46,
      })),
    },
    options: opts,
  });
}

// ---------------------------------------------------------------------------
// popup sparkline
// ---------------------------------------------------------------------------

export function sparkline(ctx, values, t) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [
        {
          data: values,
          borderColor: t.series[0],
          backgroundColor: alpha(t.series[0], 0.15),
          borderWidth: 1.5,
          pointRadius: 0,
          fill: 'origin',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { tension: 0 } },
    },
  });
}

/**
 * Current holdings as a share of the whole.
 *
 * A part-to-whole read at a glance, and nothing more: it is the wrong shape for
 * comparing two close values, which is why the table it toggles with is one
 * click away and carries the same colours. Segments are already grouped into
 * the composition's top layers plus "Other", so the slice count stays readable.
 *
 * Negative positions are not here, and cannot be. A written option is a
 * liability — a share of a whole cannot be below zero, and folding one in by its
 * absolute value would draw a debt as if it were an asset. The caller says so in
 * words instead.
 */
export function holdingsPieChart(ctx, { labels, values, colours }, t) {
  const opts = baseOptions(t);
  delete opts.scales;
  opts.plugins.legend.display = true;
  opts.plugins.legend.position = 'right';
  opts.plugins.tooltip.callbacks = {
    label: (item) => {
      const total = item.dataset.data.reduce((a, b) => a + b, 0) || 1;
      return `${item.label} — ${fmtEur(item.parsed)} (${((item.parsed / total) * 100).toFixed(1)}%)`;
    },
  };

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colours.map((c) => alpha(c, 0.85)),
          // A 2px surface gap between segments, the same spacer the stacked
          // chart uses, rather than an outline.
          borderColor: t.surface,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: opts,
  });
}
