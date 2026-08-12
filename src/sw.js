/**
 * MV3 service worker.
 *
 * SPEC §6: "MV3 service workers are ephemeral. Use chrome.alarms, never
 * setInterval." and "Sync opportunistically when the user is on
 * trader.degiro.nl rather than on a fixed schedule."
 *
 * The worker owns no state. Everything it knows is in IndexedDB, so it can be
 * torn down between two messages without losing anything.
 */

import { SYNC } from './lib/config.js';
import { localInfo, runDiagnostics } from './lib/diagnose.js';
import { getStatus, recompute, runSync, wipeAndResync } from './lib/sync.js';
import { exportEverything } from './lib/store.js';
import { recordError } from './lib/errorstore.js';
// US-37 R1, temporary. Delete this import, the 't212r1' case below, and the
// live.services.trading212.com host permission in manifest.json together.
import { probeFromWorker } from '../tools/trading212-r1/probe.js';

/**
 * The worker's own failures, written down before the worker is torn down.
 *
 * Chrome kills this context after thirty seconds of quiet, so anything thrown
 * in the background — an alarm-driven sync at four in the morning, a listener
 * that throws before it reaches a `catch` — used to leave no trace whatsoever.
 * `recordError` folds it into IndexedDB, scrubbed, and the bug report
 * carries it.
 */
self.addEventListener('error', (e) => {
  if (!e.error && !e.message) return;
  recordError('worker-error', e.error ?? { message: e.message });
});
self.addEventListener('unhandledrejection', (e) => {
  recordError('worker-unhandled-rejection', e.reason);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC.alarmName, { periodInMinutes: SYNC.alarmPeriodMinutes });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SYNC.alarmName, { periodInMinutes: SYNC.alarmPeriodMinutes });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SYNC.alarmName) return;
  // Most of the time this fails because the session is gone, which is normal
  // and which `runSync` already reports into meta for the popup to show. What
  // it does *not* cover is the throw that gets past `runSync` itself — and
  // that was being discarded here, in the one place nobody is watching.
  runSync().catch((err) => recordError('alarm-sync', err));
});

/**
 * Opportunistic sync: when a DEGIRO tab finishes loading the session is fresh,
 * which is the cheapest moment to catch up. The cooldown in runSync keeps this
 * from firing on every navigation.
 */
chrome.tabs?.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://trader.degiro.nl/')) return;
  runSync().catch((err) => recordError('tab-sync', err));
});

/** Message API used by the popup and the full page. */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => {
      // Answer first, record second. The reply is what unsticks the button;
      // the record is what makes the failure diagnosable next week. Neither
      // waits on the other, and the recorder cannot throw.
      sendResponse({ ok: false, error: String(err?.message ?? err), reason: err?.reason ?? null });
      recordError(`message:${msg?.type ?? 'unknown'}`, err);
    });
  return true; // keep the channel open for the async reply
});

async function handle(msg) {
  switch (msg?.type) {
    case 'status':
      return getStatus({ includeDerived: msg.includeDerived === true });

    case 'sync':
      return runSync({ force: msg.force === true });

    case 'diagnose':
      return { ...(await runDiagnostics()), local: await localInfo() };

    case 'recompute':
      return recompute();

    case 'export':
      return exportEverything();

    case 'wipe':
      // Deliberately wipe *and* resync in one message: the two must not be
      // separate round-trips, or a sync can start between them and be wiped
      // halfway through.
      return wipeAndResync();

    // US-37 R1, temporary. One request, only when a human sends this message.
    // Goes with the import at the top and the manifest host permission.
    case 't212r1':
      return probeFromWorker();

    case 'openApp':
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/app.html') });
      return { opened: true };

    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}
