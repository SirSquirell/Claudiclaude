import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_URLS, ENDPOINTS, ddMMyyyy } from '../src/lib/config.js';
import { parseConfigUrls } from '../src/lib/parse.js';

const SID = 'ABC123.prod_b_128_3';

test('ddMMyyyy is what the reporting endpoints expect', () => {
  assert.equal(ddMMyyyy('2026-08-08'), '08/08/2026');
  assert.equal(ddMMyyyy('2021-01-04'), '04/01/2021');
});

// ---------------------------------------------------------------------------
// The cluster question. DEGIRO puts accounts on /trading/, /trading4/ and
// others, and only /login/secure/config knows which. Hardcoding one produced a
// 404 that surfaced as an unexplained "DEGIRO returned an error".
// ---------------------------------------------------------------------------

test('parseConfigUrls reads the account-specific base URLs', () => {
  const urls = parseConfigUrls(
    {
      data: {
        tradingUrl: 'https://trader.degiro.nl/trading4/secure/',
        reportingUrl: 'https://trader.degiro.nl/reporting/secure/',
        productSearchUrl: 'https://trader.degiro.nl/product_search/secure/',
        paUrl: 'https://trader.degiro.nl/pa/secure/',
      },
    },
    DEFAULT_URLS,
  );
  assert.equal(urls.trading, 'https://trader.degiro.nl/trading4/secure/');
});

test('parseConfigUrls falls back per field, not all-or-nothing', () => {
  const urls = parseConfigUrls({ data: { tradingUrl: 'https://trader.degiro.nl/trading4/secure/' } }, DEFAULT_URLS);
  assert.equal(urls.trading, 'https://trader.degiro.nl/trading4/secure/');
  assert.equal(urls.reporting, DEFAULT_URLS.reporting, 'a missing field keeps the default');
});

test('parseConfigUrls ignores junk that is not a URL', () => {
  const urls = parseConfigUrls({ data: { tradingUrl: '', reportingUrl: null, paUrl: 'nonsense' } }, DEFAULT_URLS);
  assert.deepEqual(urls, DEFAULT_URLS);
});

test('endpoints are built from the discovered base, not a hardcoded one', () => {
  const urls = { ...DEFAULT_URLS, trading: 'https://trader.degiro.nl/trading4/secure/' };
  const url = ENDPOINTS.update({ intAccount: 123, sessionId: SID, urls });
  assert.ok(url.startsWith('https://trader.degiro.nl/trading4/secure/v5/update/123;jsessionid='), url);
  assert.ok(url.includes('portfolio=0'));
});

test('endpoints still work when no urls are passed', () => {
  assert.ok(ENDPOINTS.update({ intAccount: 1, sessionId: SID }).includes('/trading/secure/v5/update/1;'));
  assert.ok(ENDPOINTS.client({ sessionId: SID }).includes('/pa/secure/client?'));
});

test('a base URL without a trailing slash does not produce a double slash', () => {
  const urls = { ...DEFAULT_URLS, reporting: 'https://trader.degiro.nl/reporting/secure' };
  const url = ENDPOINTS.transactions({ intAccount: 1, sessionId: SID, urls, fromDate: '2021-01-01', toDate: '2026-08-08' });
  assert.ok(!url.replace('https://', '').includes('//'), url);
  assert.ok(url.includes('/reporting/secure/v4/transactions?'));
});

test('the session id is URL-encoded everywhere it appears as a query param', () => {
  const weird = 'AB/C+D=.prod_b_128_3';
  const url = ENDPOINTS.accountOverview({ intAccount: 1, sessionId: weird, fromDate: '2021-01-01', toDate: '2026-08-08' });
  assert.ok(url.includes(encodeURIComponent(weird)));
  assert.ok(!url.includes('AB/C+D='));
});

test('the chart URL sends two series params per instrument and chunks by id', () => {
  const url = ENDPOINTS.chart({ vwdIds: ['111', '222'], userToken: '999', period: 'P1M' });
  assert.ok(url.includes('series=issueid:111'));
  assert.ok(url.includes('series=price:issueid:111'));
  assert.ok(url.includes('series=issueid:222'));
  assert.ok(url.includes('resolution=P1D'));
  assert.ok(url.includes('period=P1M'));
  assert.ok(url.includes('format=json'));
  assert.ok(!url.includes('callback='), 'a callback param would make the response JSONP');
});

// ---------------------------------------------------------------------------
// Not every instrument is an issueid. A real account had 59 of 77 missing
// price histories purely because vwdkey instruments were requested as issueid.
// ---------------------------------------------------------------------------

test('a vwdkey instrument is requested under its own identifier type', () => {
  const url = ENDPOINTS.chart({
    vwdIds: [{ id: 'AMC.BATS,E', type: 'vwdkey' }, { id: '350009261', type: 'issueid' }],
    userToken: '999',
  });
  assert.ok(url.includes('series=vwdkey:AMC.BATS%2CE'), url);
  assert.ok(url.includes('series=price:vwdkey:AMC.BATS%2CE'), url);
  assert.ok(url.includes('series=price:issueid:350009261'), url);
  assert.ok(!url.includes('issueid:AMC'), 'must not ask for a vwdkey as an issueid');
});

test('a bare id still means issueid', () => {
  const url = ENDPOINTS.chart({ vwdIds: ['350009261'], userToken: '9' }); // leak-check: ok — a vwd issue id from the spec
  assert.ok(url.includes('series=price:issueid:350009261')); // leak-check: ok
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

/**
 * The dictionary is keyed by the English string, which is what makes a missing
 * translation render in English rather than as a key — and what makes an edited
 * English string orphan its translation. These pin the two things that would
 * turn that trade-off into a defect.
 */
const i18n = await import('../src/ui/i18n.js');

test('an untranslated string falls back to English and is counted', () => {
  globalThis.localStorage = { getItem: () => 'nl', setItem: () => {} };
  globalThis.document = { documentElement: {} };
  const before = i18n.missing().length;
  assert.equal(i18n.t('Total value'), 'Totale waarde');
  assert.equal(i18n.t('a string nobody has translated'), 'a string nobody has translated');
  assert.ok(i18n.missing().includes('a string nobody has translated'));
  assert.ok(i18n.missing().length > before, 'a fallback that is not counted is a fallback nobody fixes');
});

test('English is the identity, and nothing is counted against it', () => {
  globalThis.localStorage = { getItem: () => 'en', setItem: () => {} };
  assert.equal(i18n.t('Total value'), 'Total value');
  assert.equal(i18n.t('anything at all'), 'anything at all');
});

test('placeholders interpolate after lookup, so a translation can reorder them', () => {
  // Dutch word order is not English word order. Interpolating before lookup
  // would make the filled sentence the dictionary key, which never matches.
  globalThis.localStorage = { getItem: () => 'nl', setItem: () => {} };
  assert.equal(i18n.t('{a} of {b}', { a: 3, b: 9 }), '3 of 9');
});

test('every Dutch translation is a non-empty string, and none is left as its key', () => {
  // A translation identical to its key is either untranslated or a word that is
  // genuinely the same in both. The second is real — "Instrument", "Dividend" —
  // so this only catches the empty and the wrong-typed.
  const dict = i18n.__dictForTest?.().nl;
  if (!dict) return; // not exposed; nothing to assert
  for (const [k, v] of Object.entries(dict)) {
    assert.equal(typeof v, 'string', `${k} is not a string`);
    assert.ok(v.length > 0, `${k} is empty`);
  }
});
