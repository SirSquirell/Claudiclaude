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

/**
 * US-91: de strip op de brokerpagina bewaart zijn weggeklikt-tot-browserstart
 * in `chrome.storage.session`, en een content script mag daar pas bij nadat
 * de worker het toegangsniveau heeft verruimd. Op module-niveau, niet in
 * onInstalled: de worker wordt tussen twee berichten afgebroken en dit moet
 * na elke herstart opnieuw gelden.
 */
chrome.storage?.session
  ?.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  ?.catch?.((err) => recordError('session-access-level', err));

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
 * Who may ask for what.
 *
 * Every message reaches this one router, and until now it answered anyone who
 * could send one: the popup, the app page, and both content scripts alike. A
 * content script runs on somebody else's page, so it gets the few cases it
 * needs and no more — `wipe`, `export`, `disconnect` and `diagnose` are not
 * things a tab on a broker's site should be able to trigger, whatever else is
 * running there. The extension's own pages (popup, options page in a tab) are
 * told apart by their `chrome-extension://` URL, not by the absence of a tab:
 * the app page *is* a tab.
 *
 * Refusal is silence, not an error: the reply channel stays closed and the
 * sender's promise resolves with nothing, which is what an unreachable worker
 * already looks like to both content scripts.
 */
const TAB_ALLOWED = {
  // src/content/banner.js and src/content/readywatch.js, on trader.degiro.nl.
  'https://trader.degiro.nl': new Set(['banner-status', 'sync', 'tab-ready', 'openApp']),
  // src/content/site.js — the demo button on the project site (US-97).
  'https://asteria.prulwerk.nl': new Set(['open-demo']),
};

function permitted(msg, sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  if (typeof sender.url !== 'string') return false;
  let origin;
  try {
    origin = new URL(sender.url).origin;
  } catch {
    return false;
  }
  const allowed = TAB_ALLOWED[origin];
  if (allowed) return allowed.has(msg?.type);
  return sender.url.startsWith(chrome.runtime.getURL(''));
}

/** Message API used by the popup, the full page and the two content scripts. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!permitted(msg, sender)) return;
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

    case 'banner-status': {
      /**
       * What the strip on trader.degiro.nl needs, and nothing else. `status`
       * carries the live snapshot — positions — and a content script on the
       * broker's page has no business receiving it; `bannermodel.js` decides
       * its line from these four fields alone.
       */
      const s = await getStatus();
      return {
        lastSyncAt: s.lastSyncAt,
        hasError: s.lastError != null,
        syncing: s.syncing,
        disconnected: s.disconnected,
      };
    }

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

    case 'tab-ready':
      /**
       * US-113 — `src/content/readywatch.js` on trader.degiro.nl, once the
       * page has gone quiet (or hit its ceiling). This is the opportunistic
       * sync US-112 already bounds to once a day; it is a signal from the
       * page, not a person, so it must reach `runSync` as `scheduled` (a
       * disconnected account still refuses it, US-79 AC3) and must not
       * re-arm the alarm the way a pressed Sync button does above.
       */
      return runSync({ scheduled: true });

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

    case 'open-demo': {
      /**
       * US-97: de demoknop op asteria.prulwerk.nl. `src/content/site.js`
       * relayt dit vanaf de site, en `?demo=1` is geen nieuwe schakelaar —
       * `wantsDemo()` in `src/ui/datasource.js` leest die parameter al.
       * Eén weg naar demomodus, niet twee: een tweede vlag zou een tweede
       * waarheid zijn over of de cijfers echt zijn.
       */
      const url = `${chrome.runtime.getURL('src/ui/app.html')}?demo=1`;

      // Hergebruik een al open tab van de options page in plaats van er bij
      // elke klik een nieuwe bij te maken.
      const existing = await chrome.tabs.query({
        url: `${chrome.runtime.getURL('src/ui/app.html')}*`,
      });
      if (existing.length) {
        await chrome.tabs.update(existing[0].id, { url, active: true });
        await chrome.windows.update(existing[0].windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url });
      }
      return { opened: true };
    }

    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}
