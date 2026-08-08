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
import { getStatus, recompute, runSync } from './lib/sync.js';
import { exportEverything, wipeAll } from './lib/store.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC.alarmName, { periodInMinutes: SYNC.alarmPeriodMinutes });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SYNC.alarmName, { periodInMinutes: SYNC.alarmPeriodMinutes });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SYNC.alarmName) return;
  // A failure here is expected and normal: most of the time the session is
  // gone. runSync reports it into meta and the popup shows it. Nothing retries.
  runSync().catch(() => {});
});

/**
 * Opportunistic sync: when a DEGIRO tab finishes loading the session is fresh,
 * which is the cheapest moment to catch up. The cooldown in runSync keeps this
 * from firing on every navigation.
 */
chrome.tabs?.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url?.startsWith('https://trader.degiro.nl/')) return;
  runSync().catch(() => {});
});

/** Message API used by the popup and the full page. */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true; // keep the channel open for the async reply
});

async function handle(msg) {
  switch (msg?.type) {
    case 'status':
      return getStatus();

    case 'sync':
      return runSync({ force: msg.force === true });

    case 'recompute':
      return recompute();

    case 'export':
      return exportEverything();

    case 'wipe':
      await wipeAll();
      return { wiped: true };

    case 'openApp':
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/app.html') });
      return { opened: true };

    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}
