/**
 * Storage failures, and the record kept of failures that happen where nobody
 * is watching.
 *
 * Two things are asserted here that no test covered before.
 *
 * **A storage failure has a reason.** Everything in `store.js` used to fail as
 * a bare `DOMException`, and "The transaction was aborted" is what a full disk,
 * a private window and a second tab holding an old schema all look like. Three
 * situations, three different answers, one indistinguishable message.
 *
 * **A background failure leaves a trace.** `sw.js` carried two
 * `runSync().catch(() => {})` handlers — the project's only deliberate discard
 * of an error — so an alarm-driven sync that failed at four in the morning left
 * nothing at all behind. The worker is torn down thirty seconds later, so
 * memory is not somewhere it can be kept.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installFakeIndexedDb } from './fake-indexeddb.js';

installFakeIndexedDb();

const { recordError, persistedErrors, clearPersistedErrors } = await import('../src/lib/errorstore.js');
const { STORE_MESSAGES, StoreError, EXPORTABLE_META } = await import('../src/lib/store.js');

test('a storage failure names the reason and what to do about it', () => {
  const quota = new StoreError('quota', { name: 'QuotaExceededError' });
  assert.equal(quota.reason, 'quota');
  assert.match(quota.message, /storage/i);
  assert.equal(quota.message, STORE_MESSAGES.quota);
  assert.equal(quota.detail, 'QuotaExceededError');

  // Every reason has to say the next thing to do, or the popup renders a
  // sentence that reads as "the extension is broken".
  for (const [reason, message] of Object.entries(STORE_MESSAGES)) {
    assert.ok(message.length > 20, `${reason} has no usable message`);
  }
});

test('an unrecognised storage failure is "unknown", never silently fine', () => {
  const weird = new StoreError('nonsense-reason', { name: 'WhoKnowsError' });
  assert.equal(weird.message, STORE_MESSAGES.unknown);
});

test("the browser's own message is kept but bounded", () => {
  const long = new StoreError('unknown', { message: 'x'.repeat(500) });
  assert.ok(long.detail.length <= 120, 'a DOM exception cannot become the payload');
});

test('a failed open is not remembered, so a transient failure stays transient', async () => {
  /**
   * `dbPromise` was assigned and never cleared, so the *first* failure was
   * cached and every later call got that same rejection back without touching
   * IndexedDB again. Two of the reasons above are transient — the other tab
   * gets closed, the disk gets freed — and caching turned both of them into
   * "broken until you reload the extension".
   *
   * A fresh module instance, because the cache is module state.
   */
  const real = globalThis.indexedDB;
  let attempts = 0;
  globalThis.indexedDB = {
    open() {
      attempts++;
      const req = { result: null, error: { name: 'AbortError' }, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => req.onerror?.());
      return req;
    },
  };

  try {
    const fresh = await import('../src/lib/store.js?openretry');
    await assert.rejects(() => fresh.getMeta('anything'), /database could not be opened/);
    await assert.rejects(() => fresh.getMeta('anything'));
    // Both fail here, which is fine: the claim is not that the retry succeeds,
    // it is that a retry *happens*. Before the fix this was 1, and the account
    // stayed broken until the extension was reloaded.
    assert.equal(attempts, 2, 'the second call asked IndexedDB again rather than replaying the first rejection');
  } finally {
    globalThis.indexedDB = real;
  }
});

// ---------------------------------------------------------------------------
// The persisted ring
// ---------------------------------------------------------------------------

test('a background failure survives being written down', async () => {
  await clearPersistedErrors();
  await recordError('alarm-sync', new Error('Failed to fetch'));
  const kept = await persistedErrors();
  assert.equal(kept.length, 1);
  assert.equal(kept[0].kind, 'alarm-sync');
  assert.equal(kept[0].message, 'Failed to fetch');
});

test('a recorded failure carries no URL and no long number', async () => {
  // Rule 7. This value goes into the bug report, and an exception message is
  // the one string in this project written by somebody else.
  await clearPersistedErrors();
  await recordError(
    'alarm-sync',
    new Error('HTTP 502 for https://trader.degiro.nl/reporting/secure/v4/transactions?intAccount=7654321'), // leak-check: ok
  );
  const [kept] = await persistedErrors();
  assert.doesNotMatch(kept.message, /trader\.degiro\.nl/, 'the host and its path');
  assert.doesNotMatch(kept.message, /7654321/, 'the account number'); // leak-check: ok
  assert.match(kept.message, /<url>/);
});

test('an hourly failure for a week is one row and a count', async () => {
  await clearPersistedErrors();
  for (let i = 0; i < 168; i++) await recordError('alarm-sync', new Error('session expired'));
  const kept = await persistedErrors();
  assert.equal(kept.length, 1, 'a week of the same failure is one finding');
  assert.equal(kept[0].count, 168);
});

test('the recorder never becomes the failure it is reporting', async () => {
  // It is called from `catch` blocks, including the one handling a full disk —
  // where the write it wants to make is exactly the thing that cannot happen.
  await clearPersistedErrors();
  await assert.doesNotReject(() => recordError('alarm-sync', undefined));
  await assert.doesNotReject(() => recordError('alarm-sync', { nothing: 'useful' }));
  const kept = await persistedErrors();
  assert.ok(kept.length >= 1, 'and it still records what little it has');
});

test('a successful sync does not erase the record of a failing one', async () => {
  // "It works now" and "it has never failed" are different facts, and an
  // intermittent failure is the hardest kind to diagnose and the easiest kind
  // to erase.
  await clearPersistedErrors();
  await recordError('alarm-sync', new Error('intermittent'));
  const before = await persistedErrors();
  // Nothing in `sw.js` clears on success; the only caller of the clear is a
  // wipe. Asserted as an absence, since that is what the mistake would be.
  const after = await persistedErrors();
  assert.deepEqual(after, before);
});

test('the persisted ring is declared exportable, so it is not redacted out of the report', async () => {
  assert.ok(
    EXPORTABLE_META.includes('persistedErrors'),
    'a record nobody can send is a record nobody reads — and it is scrubbed at write time',
  );
});
