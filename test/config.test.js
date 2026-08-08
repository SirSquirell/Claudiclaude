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
