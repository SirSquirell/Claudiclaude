import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeIndexedDb } from './fake-indexeddb.js';

/**
 * The service worker's message router, driven through a fake `chrome`.
 *
 * `sw.js` is the one module that decides *who* may ask for *what*, and until
 * now nothing executed it: its rules were asserted by regexes over its own
 * source. Forty lines of fake `chrome` — an id, `getURL`, a listener capture
 * and three tab stubs — are enough to send it real messages and read the
 * answers, so the rules are tested the way they run.
 */

installFakeIndexedDb();

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXT_URL = `chrome-extension://${EXT_ID}/`;
const APP_URL = `${EXT_URL}src/ui/app.html`;

const calls = { tabsQuery: [], tabsCreate: [], tabsUpdate: [], windowsUpdate: [], alarmsCreate: [], alarmsClear: [] };
let openTabs = [];
let onMessage = null;

globalThis.self = new EventTarget();
globalThis.chrome = {
  runtime: {
    id: EXT_ID,
    getURL: (p) => EXT_URL + p,
    onMessage: { addListener: (fn) => { onMessage = fn; } },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
  },
  alarms: {
    create: (name, opts) => { calls.alarmsCreate.push([name, opts]); },
    clear: async (name) => { calls.alarmsClear.push(name); return true; },
    onAlarm: { addListener() {} },
  },
  storage: { session: { setAccessLevel: async () => {} } },
  cookies: { get: async () => null }, // never logged in: a forced sync stops at the session probe
  tabs: {
    query: async (q) => { calls.tabsQuery.push(q); return openTabs; },
    create: async (opts) => { calls.tabsCreate.push(opts); return { id: 99 }; },
    update: async (id, opts) => { calls.tabsUpdate.push([id, opts]); return { id }; },
  },
  windows: { update: async (id, opts) => { calls.windowsUpdate.push([id, opts]); } },
};

const { SYNC } = await import('../src/lib/config.js');
await import('../src/sw.js');
assert.equal(typeof onMessage, 'function', 'sw.js registered its onMessage listener');

const reset = () => { for (const k of Object.keys(calls)) calls[k].length = 0; openTabs = []; };

/**
 * Send one message the way Chrome would, and resolve with the reply — or with
 * `undefined` when the router declined to answer, which is what a content
 * script on an unexpected page sees.
 */
function send(msg, sender) {
  return new Promise((resolve) => {
    let answered = false;
    const kept = onMessage(msg, sender, (res) => { answered = true; resolve(res); });
    if (kept !== true && !answered) resolve(undefined);
  });
}

const popup = { id: EXT_ID, url: `${EXT_URL}src/ui/popup.html` };
const appTab = { id: EXT_ID, url: APP_URL, tab: { id: 7 } };
const degiroTab = { id: EXT_ID, url: 'https://trader.degiro.nl/#/portfolio', tab: { id: 3 } };
const asteriaTab = { id: EXT_ID, url: 'https://asteria.prulwerk.nl/', tab: { id: 4 } };

test('a message from another extension is ignored, whatever it asks', async () => {
  const foreign = { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: `${EXT_URL}src/ui/popup.html` };
  assert.equal(await send({ type: 'status' }, foreign), undefined);
  assert.equal(await send({ type: 'open-demo' }, { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: 'https://asteria.prulwerk.nl/', tab: { id: 1 } }), undefined);
  assert.equal(await send({ type: 'status' }, { url: `${EXT_URL}src/ui/popup.html` }), undefined, 'no sender id at all');
});

test('the extension’s own pages may ask anything — popup and the app page in a tab alike', async () => {
  const fromPopup = await send({ type: 'status' }, popup);
  assert.equal(fromPopup.ok, true);
  assert.ok('live' in fromPopup.data && 'syncLog' in fromPopup.data, 'the full status, for the UI');

  const fromApp = await send({ type: 'export' }, appTab);
  assert.equal(fromApp.ok, true, 'a tab is not what makes a sender untrusted; its origin is');
});

test('a trader.degiro.nl tab gets the four cases its content scripts send, and nothing destructive', async () => {
  for (const type of ['wipe', 'export', 'diagnose', 'disconnect', 'status', 'recompute', 'open-demo']) {
    assert.equal(await send({ type }, degiroTab), undefined, `${type} refused`);
  }
  const res = await send({ type: 'banner-status' }, degiroTab);
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(res.data).sort(), ['disconnected', 'hasError', 'lastSyncAt', 'syncing']);
  assert.equal(typeof res.data.hasError, 'boolean', 'whether there was an error, never its text');

  reset();
  const opened = await send({ type: 'openApp' }, degiroTab);
  assert.equal(opened.ok, true);
  assert.deepEqual(calls.tabsCreate, [{ url: APP_URL }]);
});

test('an asteria.prulwerk.nl tab may only open the demo', async () => {
  for (const type of ['status', 'banner-status', 'sync', 'openApp', 'wipe', 'export', 'diagnose', 'disconnect']) {
    assert.equal(await send({ type }, asteriaTab), undefined, `${type} refused`);
  }
  reset();
  const res = await send({ type: 'open-demo', from: 'site' }, asteriaTab);
  assert.equal(res.ok, true);
  assert.deepEqual(calls.tabsCreate, [{ url: `${APP_URL}?demo=1` }]);
});

test('open-demo never navigates a tab that shows the real account', async () => {
  reset();
  openTabs = [{ id: 11, windowId: 1, url: APP_URL }, { id: 12, windowId: 1, url: `${APP_URL}#holdings` }];
  await send({ type: 'open-demo' }, asteriaTab);
  assert.deepEqual(calls.tabsUpdate, [], 'neither real-account tab was touched');
  assert.deepEqual(calls.tabsCreate, [{ url: `${APP_URL}?demo=1` }], 'a new tab instead');

  reset();
  openTabs = [{ id: 11, windowId: 1, url: APP_URL }, { id: 13, windowId: 2, url: `${APP_URL}?demo=1` }];
  await send({ type: 'open-demo' }, asteriaTab);
  assert.deepEqual(calls.tabsCreate, [], 'a demo tab is already open');
  assert.deepEqual(calls.tabsUpdate, [[13, { active: true }]], 'focused, not navigated: no url in the update');
  assert.deepEqual(calls.windowsUpdate, [[2, { focused: true }]]);
});

test('US-79 — disconnect clears the alarm, a pressed Sync re-arms it, and a page-driven sync stays scheduled', async () => {
  reset();
  const off = await send({ type: 'disconnect' }, popup);
  assert.equal(off.ok, true);
  assert.equal(off.data.disconnected, true);
  assert.deepEqual(calls.alarmsClear, [SYNC.alarmName], 'the worker owns the alarm, so the worker clears it');

  // `tab-ready` is the page saying it is quiet, not a person pressing Sync: it
  // reaches runSync as `scheduled`, which a disconnected account refuses.
  const ready = await send({ type: 'tab-ready' }, degiroTab);
  assert.equal(ready.ok, true);
  assert.equal(ready.data.skipped, 'disconnected');
  assert.deepEqual(calls.alarmsCreate, [], 'and it does not re-arm what the disconnect cleared');

  // A pressed Sync is the way back: it re-arms the alarm before it even runs.
  await send({ type: 'sync', force: true }, degiroTab);
  assert.equal(calls.alarmsCreate.length, 1);
  assert.equal(calls.alarmsCreate[0][0], SYNC.alarmName);
});

test('an unknown message type is answered with an error, not silence', async () => {
  const res = await send({ type: 'nonsense' }, popup);
  assert.equal(res.ok, false);
  assert.match(res.error, /Unknown message type/);
});
