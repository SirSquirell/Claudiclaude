import test from 'node:test';
import assert from 'node:assert/strict';

import {
  num,
  parseCashMovements,
  parseChartResponse,
  parseClient,
  parseProducts,
  parseTimesAnchor,
  parseTransactions,
  parseUpdate,
  unwrapJsonp,
} from '../src/lib/parse.js';
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
