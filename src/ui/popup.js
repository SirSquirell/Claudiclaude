/**
 * Popup. SPEC §3.2: "Popup shows the numbers (value, day, week, month) and a
 * sparkline; the toolbar click or a button opens a full extension page."
 *
 * It reads the cached derived result rather than recomputing, so it paints
 * immediately even when the service worker is asleep.
 */

import { sparkline } from './charts.js';
import { fmtEurCents, fmtSigned, tokens } from './theme.js';
import { inExtension, loadDemo, send, wantsDemo } from './datasource.js';

const $ = (s) => document.querySelector(s);

main().catch((err) => {
  $('#status').textContent = String(err?.message ?? err);
});

async function main() {
  $('#btn-open').addEventListener('click', () => {
    if (inExtension) send({ type: 'openApp' }).then(() => window.close());
    else window.open('app.html?demo=1', '_blank');
  });

  $('#btn-sync').addEventListener('click', async (e) => {
    if (!inExtension) return;
    e.target.disabled = true;

    // Show the worker's own checkpoint while it runs, so a slow step is
    // distinguishable from a stuck one.
    const poll = setInterval(async () => {
      try {
        const st = await send({ type: 'status' });
        if (st.syncState) $('#status').textContent = st.syncState.message;
      } catch {
        /* worker restarting */
      }
    }, 400);

    try {
      const res = await send({ type: 'sync', force: true });
      if (!res.ok) {
        // The full message, not a generic one: this is often the only place
        // the user sees why it failed.
        $('#status').textContent = res.message ?? 'Sync failed.';
        $('#status').classList.add('down');
        return;
      }
      $('#status').classList.remove('down');
      const status = await send({ type: 'status', includeDerived: true });
      if (status.derived) await paint(status.derived, { lastSyncAt: Date.now() });
    } catch (err) {
      $('#status').textContent = String(err.message ?? err);
      $('#status').classList.add('down');
    } finally {
      clearInterval(poll);
      e.target.disabled = false;
      e.target.textContent = 'Sync';
    }
  });

  if (!inExtension || wantsDemo()) {
    const { result } = await loadDemo();
    return paint(result, { demo: true });
  }

  const status = await send({ type: 'status', includeDerived: true });
  if (status.syncing) {
    $('#status').textContent = `Syncing: ${status.syncState?.message ?? '…'}`;
  } else if (status.lastError) {
    $('#status').textContent = status.lastError.message ?? 'Last sync failed. Open DEGIRO and log in.';
    $('#status').classList.add('down');
  }
  if (!status.derived) {
    if (!status.lastError && !status.syncing) {
      $('#status').textContent = 'No data yet — press Sync while logged in to DEGIRO.';
    }
    // "Open full chart" leads to the page with the connection check on it.
    return;
  }
  await paint(status.derived, status);
}

async function paint(r, status = {}) {
  const t = tokens();
  const last = r.days.length - 1;
  const day = r.pnl[last];
  const week = r.pnl.slice(Math.max(0, last - 6)).reduce((a, b) => a + b, 0);
  const month = r.pnl.slice(Math.max(0, last - 29)).reduce((a, b) => a + b, 0);

  $('#status').textContent = status.demo
    ? 'Demo data'
    : status.lastSyncAt
      ? `Synced ${new Date(status.lastSyncAt).toLocaleTimeString('nl-NL')}`
      : 'Not synced yet';

  const tiles = [
    { label: 'Value', value: fmtEurCents(r.totals.value) },
    { label: 'Today', value: fmtSigned(day), cls: day >= 0 ? 'up' : 'down' },
    { label: 'Week', value: fmtSigned(week), cls: week >= 0 ? 'up' : 'down' },
    { label: 'Month', value: fmtSigned(month), cls: month >= 0 ? 'up' : 'down' },
  ];
  $('#tiles').innerHTML = tiles
    .map((x) => `<div class="tile"><div class="label">${x.label}</div><div class="value ${x.cls ?? ''}">${x.value}</div></div>`)
    .join('');

  // Last 90 days of value, enough to read the shape in 64px.
  sparkline($('#spark'), r.value.slice(Math.max(0, last - 89)), t);
}
