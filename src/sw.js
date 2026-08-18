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
import { disconnectAccount, getStatus, recompute, runSync, wipeAndResync } from './lib/sync.js';
import { exportEverything } from './lib/store.js';
import { recordError } from './lib/errorstore.js';

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
  // `scheduled`: nobody asked for this one, so a disconnected account refuses it
  // rather than quietly re-fetching the identifiers it was told to forget
  // (US-79).
  runSync({ scheduled: true }).catch((err) => recordError('alarm-sync', err));
});

/**
 * Opportunistic sync: when a DEGIRO tab finishes loading the session is fresh,
 * which is the cheapest moment to catch up. The cooldown in runSync keeps this
 * from firing on every navigation.
 */
chrome.tabs?.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://trader.degiro.nl/')) return;
  runSync({ scheduled: true }).catch((err) => recordError('tab-sync', err));
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

    case 'sync': {
      /**
       * A sync somebody pressed is also the way back from a disconnect (US-79):
       * `doSync` clears the flag, `resolveSession` finds no cached identifiers and
       * fetches them exactly as on a first run. The alarm has to be re-armed here
       * because disconnecting cleared it, and re-arming is idempotent — the
       * install and startup handlers above create the same one.
       */
      chrome.alarms.create(SYNC.alarmName, { periodInMinutes: SYNC.alarmPeriodMinutes });
      return runSync({ force: msg.force === true });
    }

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

    case 'disconnect':
      /**
       * Forget the account, keep the figures, and stop syncing by itself.
       *
       * Two halves, and they ship together or the feature is theatre: the
       * identifiers go (`sync.js`, which owns the database), and the periodic
       * alarm goes (here, because the worker owns the alarms). Without the second
       * one the next firing calls `resolveSession` and re-caches everything the
       * first one deleted, so a disconnect would last an hour.
       *
       * DEGIRO's own cookie is untouched. This extension has never held it and
       * removing it would log the reader out of their own trading tab.
       */
      await chrome.alarms.clear(SYNC.alarmName);
      return disconnectAccount();

    case 'openApp':
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/app.html') });
      return { opened: true };

    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}
