import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fieldAlarms,
  getFieldStats,
  num,
  parseCashMovements,
  parseChartResponse,
  parseClient,
  parseConfigUrls,
  parseProducts,
  parseTimesAnchor,
  parseTransactions,
  parseUpdate,
  resetFieldStats,
  unwrapJsonp,
} from '../src/lib/parse.js';
import { FIELD_ALARM } from '../src/lib/config.js';
import { fixture } from './helpers.js';

test('num coerces both decimal conventions', () => {
  assert.equal(num(1234.56), 1234.56);
  assert.equal(num('1234.56'), 1234.56);
  assert.equal(num('1.234,56'), 1234.56);
  assert.equal(num('-1.234,56'), -1234.56);
  assert.equal(num('€ 1.234,56'), 1234.56);
  assert.equal(num('1 234.56'), 1234.56);
  assert.equal(num(null), 0);
  assert.equal(num(''), 0);
  assert.equal(num(NaN), 0);
});

// --- SPEC §2.1, the conversion the spec explicitly asks for a test on --------

test('parseTimesAnchor splits the anchor date from the resolution period', () => {
  assert.deepEqual(parseTimesAnchor('2021-01-04/P1D'), { start: '2021-01-04', stepDays: 1 });
  assert.deepEqual(parseTimesAnchor('2021-01-04/P1W'), { start: '2021-01-04', stepDays: 7 });
  assert.deepEqual(parseTimesAnchor('2021-01-04'), { start: '2021-01-04', stepDays: 1 });
});

test('chart series x values are offsets from the anchor, not timestamps', () => {
  const res = {
    series: [
      { id: 'issueid:123', type: 'object', times: '2021-01-04/P1D', data: { name: 'X' } },
      {
        id: 'price:issueid:123',
        type: 'time',
        times: '2021-01-04/P1D',
        // 0 = the anchor day; 4 = four resolution steps later; note the gap
        // where the weekend is.
        data: [[0, 10], [1, 11], [4, 12]],
      },
    ],
  };
  const parsed = parseChartResponse(res);
  assert.deepEqual(Object.keys(parsed), ['123']);
  assert.equal(parsed['123'].start, '2021-01-04');
  assert.equal(parsed['123'].stepDays, 1);
  assert.deepEqual(parsed['123'].points, [
    { offsetDays: 0, close: 10 },
    { offsetDays: 1, close: 11 },
    { offsetDays: 4, close: 12 },
  ]);
});

test('chart parser ignores the metadata series and out-of-order points', () => {
  const res = {
    series: [
      { id: 'price:issueid:9', times: '2020-06-01/P1D', data: [[2, 30], [0, 10], [1, 20]] },
      { id: 'issueid:9', times: '2020-06-01/P1D', data: { lastPrice: 30 } },
    ],
  };
  const parsed = parseChartResponse(res);
  assert.deepEqual(parsed['9'].points.map((p) => p.offsetDays), [0, 1, 2]);
});

test('unwrapJsonp strips a callback wrapper when one sneaks in', () => {
  assert.deepEqual(unwrapJsonp('{"a":1}'), { a: 1 });
  assert.deepEqual(unwrapJsonp('vwd.hchart.callback({"a":1});'), { a: 1 });
  assert.throws(() => unwrapJsonp('<html>error</html>'));
});

// --- transactions -----------------------------------------------------------

test('parseTransactions signs quantity from buysell when the API does not', () => {
  const parsed = parseTransactions({
    data: [
      { id: 1, productId: 5, date: '2024-01-02T10:00:00+01:00', buysell: 'B', quantity: 10, price: 2 },
      { id: 2, productId: 5, date: '2024-01-03T10:00:00+01:00', buysell: 'S', quantity: 4, price: 3 },
      { id: 3, productId: 5, date: '2024-01-04T10:00:00+01:00', buysell: 'S', quantity: -2, price: 3 },
    ],
  });
  assert.deepEqual(parsed.map((t) => t.quantity), [10, -4, -2]);
  assert.equal(parsed[0].productId, '5');
});

test('parseTransactions sorts by date and drops rows without a product', () => {
  const parsed = parseTransactions({
    data: [
      { id: 1, productId: 5, date: '2024-03-02', quantity: 1, price: 1 },
      { id: 2, productId: 5, date: '2024-01-02', quantity: 1, price: 1 },
      { id: 3, date: 'nonsense', quantity: 1, price: 1 },
    ],
  });
  assert.deepEqual(parsed.map((t) => t.date), ['2024-01-02', '2024-03-02']);
});

// --- cash movements ---------------------------------------------------------

test('parseCashMovements finds rows under data.cashMovements and classifies them', () => {
  const parsed = parseCashMovements({
    data: {
      cashMovements: [
        { date: '2024-01-02', description: 'iDEAL Deposit', change: 1000, currency: 'EUR', type: 'CASH_TRANSACTION' },
        { date: '2024-01-03', description: 'Dividend ASML', change: 12.5, currency: 'EUR', productId: 5 },
        { date: '2024-01-03', description: 'Dividendbelasting ASML', change: -1.88, currency: 'EUR', productId: 5 },
      ],
    },
  });
  assert.deepEqual(parsed.map((r) => r.category), ['DEPOSIT', 'DIVIDEND', 'DIVIDEND_TAX']);
  assert.equal(parsed[0].change, 1000);
});

// --- products / update ------------------------------------------------------

test('parseProducts keys by id and keeps vwdId as a string', () => {
  const p = parseProducts({ data: { 331868: { id: '331868', name: 'ASML', vwdId: 350009261, currency: 'EUR' } } });
  assert.equal(p['331868'].name, 'ASML');
  assert.equal(p['331868'].vwdId, '350009261');
});

test('parseUpdate flattens the name/value-pair encoding', () => {
  const parsed = parseUpdate({
    portfolio: {
      value: [
        { id: '1', value: [{ name: 'id', value: '1' }, { name: 'size', value: 10 }, { name: 'price', value: 5 }, { name: 'value', value: 50 }] },
        { id: '2', value: [{ name: 'id', value: '2' }, { name: 'size', value: 0 }, { name: 'value', value: 0 }] },
      ],
    },
    totalPortfolio: { value: [{ name: 'reportNetliq', value: 1234.56 }, { name: 'totalCash', value: 34.56 }] },
    cashFunds: { value: [{ id: 1, value: [{ name: 'currencyCode', value: 'EUR' }, { name: 'value', value: 34.56 }] }] },
  });
  assert.equal(parsed.positions.length, 1, 'closed positions are dropped');
  assert.deepEqual(parsed.positions[0], { productId: '1', size: 10, price: 5, value: 50 });
  assert.equal(parsed.totalValue, 1234.56);
  assert.equal(parsed.totalCash, 34.56);
  assert.deepEqual(parsed.cash, { EUR: 34.56 });
  assert.equal(parsed.todayPl, null, 'no todayPlBase in the response means null, not a fabricated 0');
});

test('parseUpdate sums DEGIRO’s own per-position day P/L into todayPl', () => {
  const parsed = parseUpdate({
    portfolio: {
      value: [
        { value: [{ name: 'id', value: '1' }, { name: 'size', value: 10 }, { name: 'value', value: 500 }, { name: 'todayPlBase', value: { EUR: 12.5 } }] },
        { value: [{ name: 'id', value: '2' }, { name: 'size', value: 4 }, { name: 'value', value: 200 }, { name: 'todayPlBase', value: { EUR: -30 } }] },
        // A closed position (size 0) is dropped and does not contribute.
        { value: [{ name: 'id', value: '3' }, { name: 'size', value: 0 }, { name: 'value', value: 0 }, { name: 'todayPlBase', value: { EUR: 999 } }] },
      ],
    },
  });
  assert.equal(parsed.todayPl, -17.5, 'sum of the open positions’ todayPlBase.EUR, rounded to cents');
});

test('parseUpdate reads a foreign base currency out of the todayPlBase map', () => {
  const parsed = parseUpdate(
    {
      portfolio: {
        value: [{ value: [{ name: 'id', value: '1' }, { name: 'size', value: 1 }, { name: 'todayPlBase', value: { USD: 3.33 } }] }],
      },
    },
    'USD',
  );
  assert.equal(parsed.todayPl, 3.33);
});

test('parseClient extracts intAccount and the chart userToken', () => {
  const c = parseClient({ data: { intAccount: 9999999, id: 11111111, displayName: 'Demo' } });
  assert.equal(c.intAccount, 9999999);
  assert.equal(c.userToken, '11111111');
});

// --- against the generated fixture set --------------------------------------

test('fixtures parse into the shapes the engine expects', () => {
  const meta = fixture('meta.json');
  const tx = parseTransactions(fixture('transactions.json'));
  const cash = parseCashMovements(fixture('accountoverview.json'));
  const products = parseProducts(fixture('products-info.json'));
  const update = parseUpdate(fixture('update.json'));

  assert.equal(tx.length, meta.counts.transactions);
  assert.equal(cash.length, meta.counts.cashMovements);
  assert.equal(Object.keys(products).length, meta.counts.products);
  assert.equal(update.totalValue, meta.liveTotal);

  for (const t of tx) {
    assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(t.quantity) && t.quantity !== 0);
    assert.ok(t.price > 0);
  }
  for (const p of Object.values(products)) {
    assert.ok(p.vwdId, `${p.name} has no vwdId`);
  }
  // Every product traded must have metadata, or valuation silently falls back.
  for (const t of tx) assert.ok(products[t.productId], `no product info for ${t.productId}`);
});

test('no cash movement in the fixture set is left unclassified', () => {
  const cash = parseCashMovements(fixture('accountoverview.json'));
  const unknown = cash.filter((r) => r.category === 'UNKNOWN');
  assert.deepEqual(unknown.map((r) => r.description), []);
});

test('the chart parser keys a vwdkey series by its raw identifier', () => {
  // The identifier is what products store as vwdId, so the two must line up
  // exactly or the series is fetched and then never found again.
  const parsed = parseChartResponse({
    series: [
      { id: 'vwdkey:AMC.BATS,E', times: '2024-01-01/P1D', data: { name: 'AMC' } },
      { id: 'price:vwdkey:AMC.BATS,E', times: '2024-01-01/P1D', data: [[0, 4.2], [1, 4.4]] },
    ],
  });
  assert.deepEqual(Object.keys(parsed), ['AMC.BATS,E']);
  assert.equal(parsed['AMC.BATS,E'].points.length, 2);
});

test('a percent-encoded identifier is decoded back to the stored form', () => {
  const parsed = parseChartResponse({
    series: [{ id: 'price:vwdkey:AMC.BATS%2CE', times: '2024-01-01/P1D', data: [[0, 4.2]] }],
  });
  assert.deepEqual(Object.keys(parsed), ['AMC.BATS,E']);
});

// ---------------------------------------------------------------------------
// Storage keys. A real account lost 46 of 5907 cash movements because DEGIRO
// reports id 0 on many rows and they collapsed onto each other in IndexedDB.
// ---------------------------------------------------------------------------

test('rows sharing a reported id still get distinct keys', () => {
  const parsed = parseCashMovements({
    data: {
      cashMovements: [
        { date: '2024-10-18', id: 0, description: 'Valuta Debitering', change: -10, currency: 'USD' },
        { date: '2024-10-18', id: 0, description: 'Valuta Creditering', change: 11, currency: 'EUR' },
        { date: '2024-10-18', id: 0, description: 'DEGIRO Transactiekosten', change: -0.5, currency: 'EUR' },
      ],
    },
  });
  assert.equal(parsed.length, 3);
  assert.equal(new Set(parsed.map((r) => r.id)).size, 3, 'three rows must occupy three keys');
});

test('rows identical in every field still get distinct keys', () => {
  // 541 rows on the reported account were byte-identical to another row — an FX
  // leg repeated across a basket order. A content hash alone would lose them.
  const one = { date: '2024-10-18', id: 0, description: 'Valuta Debitering', change: -10, currency: 'USD' };
  const parsed = parseCashMovements({ data: { cashMovements: [one, { ...one }, { ...one }] } });
  assert.equal(new Set(parsed.map((r) => r.id)).size, 3);
});

test('the same response parsed twice yields the same keys', () => {
  // Otherwise every re-sync duplicates the overlap window instead of updating it.
  const res = {
    data: {
      cashMovements: [
        { date: '2024-10-18', id: 0, description: 'A', change: -10, currency: 'EUR' },
        { date: '2024-10-18', id: 0, description: 'A', change: -10, currency: 'EUR' },
        { date: '2024-10-19', id: 5, description: 'B', change: 3, currency: 'EUR' },
      ],
    },
  };
  assert.deepEqual(
    parseCashMovements(res).map((r) => r.id),
    parseCashMovements(res).map((r) => r.id),
  );
});

test('transactions get the same protection', () => {
  const parsed = parseTransactions({
    data: [
      { id: 0, productId: 5, date: '2024-01-02', buysell: 'B', quantity: 10, price: 2 },
      { id: 0, productId: 5, date: '2024-01-02', buysell: 'B', quantity: 10, price: 2 },
    ],
  });
  assert.equal(new Set(parsed.map((t) => t.id)).size, 2);
});

test('the reported id is kept for debugging, just not as the key', () => {
  const [row] = parseCashMovements({
    data: { cashMovements: [{ date: '2024-10-18', id: 1000060328, description: 'A', change: 1, currency: 'EUR' }] },
  });
  assert.equal(row.sourceId, 1000060328);
  assert.notEqual(row.id, '1000060328');
});


// ---------------------------------------------------------------------------
// Keeping what we do not recognise (CLAUDE.md rule 2, in the parse layer)
// ---------------------------------------------------------------------------

test('parseUpdate keeps every totalPortfolio field, not just the two it reads', () => {
  // Margin data has been arriving on every sync since the first release and
  // nobody has ever seen it, because two fields were picked out of this object
  // and the rest discarded three lines later.
  const res = {
    totalPortfolio: {
      value: [
        { name: 'reportNetliq', value: 115553.37 },
        { name: 'totalCash', value: -11821.19 },
        { name: 'reportMargin', value: 24000 },
        { name: 'freeSpaceNew', value: 8100.5 },
        { name: 'marginCallStatus', value: 'NO_MARGIN_CALL' },
      ],
    },
  };
  const out = parseUpdate(res);
  assert.equal(out.totalValue, 115553.37);
  assert.equal(out.totalCash, -11821.19);
  assert.equal(out.totals.reportMargin, 24000, 'a field nobody parses is still kept');
  assert.equal(out.totals.freeSpaceNew, 8100.5);
  assert.equal(out.totals.marginCallStatus, 'NO_MARGIN_CALL');
});

test('parseProducts carries the fields it does not name', () => {
  const out = parseProducts({
    data: {
      1: {
        id: '1',
        name: 'ADY P700.00 18DEC26',
        currency: 'EUR',
        productType: 'OPTION',
        contractSize: 100,
        strike: 700,
        expirationDate: '2026-12-18',
        optionRights: 'P',
      },
    },
  });
  assert.equal(out['1'].productType, 'OPTION');
  assert.equal(out['1'].extra.contractSize, 100, 'the answer to a question a 50MB export could not settle');
  assert.equal(out['1'].extra.strike, 700);
  assert.equal(out['1'].extra.optionRights, 'P');
  assert.equal('name' in out['1'].extra, false, 'a field the parser names is not duplicated');
});

test('a product with nothing unrecognised carries no extra at all', () => {
  const out = parseProducts({ data: { 1: { id: '1', name: 'PLAIN', currency: 'EUR' } } });
  assert.equal(out['1'].extra, undefined, 'an empty object on every product is noise');
});

// ---------------------------------------------------------------------------
// parseConfigUrls — the one response that decides where later requests go
// ---------------------------------------------------------------------------

const DEFAULTS = {
  trading: 'https://trader.degiro.nl/trading/secure/',
  reporting: 'https://trader.degiro.nl/reporting/secure/',
  productSearch: 'https://trader.degiro.nl/product_search/secure/',
  pa: 'https://trader.degiro.nl/pa/secure/',
};

test('a discovered cluster URL on the right host is used', () => {
  // The whole reason this endpoint is consulted: an account can sit on
  // /trading4/ and hardcoding /trading/ 404s every request it makes.
  const out = parseConfigUrls({ data: { tradingUrl: 'https://trader.degiro.nl/trading4/secure/' } }, DEFAULTS);
  assert.equal(out.trading, 'https://trader.degiro.nl/trading4/secure/');
});

test('a base URL on another host is refused, not followed', () => {
  // Every request built from this carries the session id in its query string,
  // so following a foreign host puts a live session in someone else's log.
  for (const hostile of [
    'https://trader.degiro.nl.evil.example/trading/secure/',
    'https://evil.example/trading/secure/',
    'https://charting.vwdservices.com/trading/secure/',
  ]) {
    const out = parseConfigUrls({ data: { tradingUrl: hostile } }, DEFAULTS);
    assert.equal(out.trading, DEFAULTS.trading, `refused: ${hostile}`);
  }
});

test('a plaintext base URL is refused', () => {
  // startsWith('http') accepted this, which is a downgrade to a wire anyone on
  // the path can read and rewrite.
  const out = parseConfigUrls({ data: { tradingUrl: 'http://trader.degiro.nl/trading/secure/' } }, DEFAULTS);
  assert.equal(out.trading, DEFAULTS.trading);
});

test('anything that is not a URL falls back rather than throwing', () => {
  for (const junk of [null, 42, '', 'not a url', 'httpsomething', '//trader.degiro.nl/x']) {
    const out = parseConfigUrls({ data: { paUrl: junk } }, DEFAULTS);
    assert.equal(out.pa, DEFAULTS.pa, `fell back for ${JSON.stringify(junk)}`);
  }
});

test('every base URL is checked, not just the first', () => {
  const out = parseConfigUrls({
    data: {
      tradingUrl: 'https://trader.degiro.nl/trading4/secure/',
      reportingUrl: 'https://evil.example/reporting/secure/',
      productSearchUrl: 'http://trader.degiro.nl/product_search/secure/',
      paUrl: 'https://trader.degiro.nl/pa4/secure/',
    },
  }, DEFAULTS);
  assert.equal(out.trading, 'https://trader.degiro.nl/trading4/secure/');
  assert.equal(out.reporting, DEFAULTS.reporting, 'foreign host');
  assert.equal(out.productSearch, DEFAULTS.productSearch, 'plaintext');
  assert.equal(out.pa, 'https://trader.degiro.nl/pa4/secure/');
});

// ---------------------------------------------------------------------------
// What a parser could not read
// ---------------------------------------------------------------------------

/**
 * The quietest way this project can be wrong: DEGIRO renames one field, every
 * row loses its product id, the array comes back empty, and the sync reports
 * success over an account with no history. The candidate field names in
 * `parse.js` exist *because* the shapes are guesses — so a guess that misses is
 * counted rather than swallowed.
 */
test('the transaction parser counts what it dropped, and why', () => {
  const good = { date: '2024-01-02', id: 1, productId: 'P', quantity: 3, price: 10 };
  const out = parseTransactions({ data: [good, { date: '2024-01-03', quantity: 1 }, { id: 9, productId: 'Q' }] });

  assert.equal(out.length, 1);
  assert.equal(out.dropped.count, 2);
  assert.deepEqual(out.dropped.reasons, { 'no-product-id': 1, 'no-date': 1 });
});

test('the reasons always add up to the count', () => {
  // A breakdown that does not sum to its own total invites a reader to
  // distrust both numbers, so anything unaccounted for becomes `other`.
  const out = parseTransactions({ data: [{ date: '2024-01-02', productId: 'P', quantity: 1 }, {}] });
  const summed = Object.values(out.dropped.reasons).reduce((a, b) => a + b, 0);
  assert.equal(summed, out.dropped.count);
});

test('nothing dropped is reported as nothing dropped, not as absent', () => {
  const out = parseTransactions({ data: [{ date: '2024-01-02', productId: 'P', quantity: 1, price: 2 }] });
  assert.deepEqual(out.dropped, { count: 0, reasons: {} });
});

test('a cash row with no date is counted rather than vanishing', () => {
  // A dropped deposit is money that never appears to have arrived, which the
  // reconciliation reports as a shortfall with no explanation.
  const out = parseCashMovements({ cashMovements: [{ date: '2024-01-01', change: 5 }, { change: 9 }] });
  assert.equal(out.length, 1);
  assert.deepEqual(out.dropped, { count: 1, reasons: { 'no-date': 1 } });
});

test('the drop report does not change what the parser returns', () => {
  // A non-enumerable property on an array: every caller that maps, filters or
  // spreads it is untouched.
  const out = parseTransactions({ data: [{ date: '2024-01-02', productId: 'P', quantity: 1, price: 2 }] });
  assert.ok(Array.isArray(out));
  assert.deepEqual(Object.keys(out), ['0']);
  assert.equal(JSON.parse(JSON.stringify(out)).length, 1);
});


// ===========================================================================
// US-17 — notice when a field DEGIRO renamed stops arriving
// ===========================================================================

/** A run of transaction rows, with one field's name swapped on all of them. */
const txRows = (n, rename = null) => ({
  data: Array.from({ length: n }, (_, i) => {
    const row = { date: '2024-01-02', productId: 'P', quantity: 3, price: 2, total: 6 };
    if (rename) {
      row[rename[1]] = row[rename[0]];
      delete row[rename[0]];
    }
    return row;
  }),
});

test('the tally records which candidate name actually carried each value', () => {
  /**
   * The half of US-17 that pays for itself outside of any failure: the parsers
   * accept several candidate names per value and nobody knows which one DEGIRO
   * really sends. This measures it, so rule 8's "delete the fallbacks once a real
   * capture confirms the shape" becomes a thing somebody can act on rather than a
   * promise in a comment.
   */
  resetFieldStats();
  parseTransactions(txRows(30));
  const stats = getFieldStats();

  assert.equal(stats.quantity.rows, 30);
  assert.equal(stats.quantity.missed, 0);
  assert.deepEqual(stats.quantity.matched, { quantity: 30 });

  // `totalBase` resolves through the fourth candidate on this fixture, and that
  // is exactly the finding the story is about — the first three are unproven.
  assert.equal(stats.totalPlusFeeInBaseCurrency.matched.total, 30);
  assert.equal(stats.totalPlusFeeInBaseCurrency.matched.totalPlusFeeInBaseCurrency, undefined);
});

test('a load-bearing field renamed on every row raises, and names itself', () => {
  // Written as a rename rather than as a hand-built tally, because that is the
  // only way to know the alarm can actually fire through the real parser.
  resetFieldStats();
  parseTransactions(txRows(40, ['quantity', 'aantal']));
  const alarms = fieldAlarms(getFieldStats());

  assert.equal(alarms.length, 1, 'exactly the renamed field');
  assert.equal(alarms[0].field, 'quantity');
  assert.equal(alarms[0].missed, 40);
  assert.equal(alarms[0].rows, 40);
  // The names that used to work travel with it: that is the search term for
  // whoever goes looking at DEGIRO's response.
  assert.deepEqual(alarms[0].everMatched, []);
});

test('a field absent on a handful of rows raises nothing', () => {
  /**
   * The reason the signal is a rate and not a count. A renamed field does not go
   * missing on three rows out of 1 457 — it goes missing on all of them. A raw
   * count cannot tell those apart and would cry wolf on ordinary sparse data,
   * which is worse than silence: an alarm that fires on healthy accounts is one
   * nobody reads on the day it matters.
   */
  resetFieldStats();
  const rows = txRows(100).data;
  for (let i = 0; i < 3; i++) delete rows[i].quantity;
  parseTransactions({ data: rows });
  assert.deepEqual(fieldAlarms(getFieldStats()), []);

  // And too few rows for a rate to mean anything raises nothing either — a
  // three-row account genuinely cannot tell the two cases apart.
  resetFieldStats();
  parseTransactions(txRows(3, ['quantity', 'aantal']));
  assert.deepEqual(fieldAlarms(getFieldStats()), []);
});

test('the threshold is a reviewed constant, not derived from the rows it polices', () => {
  // SPEC §3. A rate computed from the same rows it is judging moves with them and
  // never fires.
  assert.equal(typeof FIELD_ALARM.missingShare, 'number');
  assert.ok(FIELD_ALARM.missingShare > 0.5 && FIELD_ALARM.missingShare <= 1);
  assert.equal(FIELD_ALARM.loadBearing.length, 6);

  // Every load-bearing name must be a key `pick()` can actually produce — it
  // tallies under the *first* candidate, so a name taken from the middle of a
  // list would police a field that never reports.
  resetFieldStats();
  parseTransactions(txRows(30));
  parseProducts({ data: { P: { id: 'P', name: 'X', closePrice: 1 } } });
  // With an `id`, or the row is skipped before `size` is ever picked — which is
  // correct, and was the first version of this line getting it wrong.
  parseUpdate({ portfolio: { value: [{ value: [{ name: 'id', value: 'P' }, { name: 'size', value: 1 }] }] } });
  parseCashMovements({ cashMovements: [{ date: '2024-01-01', change: 5 }] });
  const seen = Object.keys(getFieldStats());
  for (const f of FIELD_ALARM.loadBearing) {
    assert.ok(seen.includes(f), `${f} is not a key any pick() reports under`);
  }
});

test('the tally is beside the computation, never inside it', () => {
  /**
   * The guarantee that makes a module-global counter safe in a file the layout
   * calls pure: **no parse output depends on it.** Parsed once with the tally
   * empty and once with it already full of a different run, byte for byte the
   * same.
   */
  resetFieldStats();
  const clean = JSON.stringify(parseTransactions(txRows(12)));

  resetFieldStats();
  parseTransactions(txRows(500, ['quantity', 'aantal']));
  parseCashMovements({ cashMovements: [{ date: '2024-01-01', change: 5 }] });
  const dirty = JSON.stringify(parseTransactions(txRows(12)));

  assert.equal(dirty, clean);
});
