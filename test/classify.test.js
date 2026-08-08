import test from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORY, affectsCash, classifyCashRow, isExternal } from '../src/lib/classify.js';

const cases = [
  // description                                        expected category
  ['iDEAL Deposit',                                     CATEGORY.DEPOSIT],
  ['Storting',                                          CATEGORY.DEPOSIT],
  ['Sofort Deposit',                                    CATEGORY.DEPOSIT],
  ['Withdrawal',                                        CATEGORY.WITHDRAWAL],
  ['Terugstorting',                                     CATEGORY.WITHDRAWAL],
  ['Dividend ASML HOLDING',                             CATEGORY.DIVIDEND],
  ['Dividendbelasting ASML HOLDING',                    CATEGORY.DIVIDEND_TAX],
  ['Withholding Tax SHELL PLC',                         CATEGORY.DIVIDEND_TAX],
  ['DEGIRO Transactiekosten en/of kosten van derden',   CATEGORY.FEE],
  ['DEGIRO Aansluitingskosten 2025 (Euronext)',         CATEGORY.FEE],
  ['Exchange Connection Fee 2024',                      CATEGORY.FEE],
  ['Flatex Interest',                                   CATEGORY.INTEREST],
  ['Rente',                                             CATEGORY.INTEREST],
  ['Koop 12 @ 480,50 EUR',                              CATEGORY.TRADE],
  ['Verkoop 3 @ 512,00 EUR',                            CATEGORY.TRADE],
  ['Valuta Debitering',                                 CATEGORY.FX],
  ['Currency Credit',                                   CATEGORY.FX],
  ['DEGIRO Cash Sweep Transfer',                        CATEGORY.CASH_SWEEP],
  ['Conversie geldmarktfonds',                          CATEGORY.CASH_SWEEP],
  ['Aandelensplitsing NVIDIA',                          CATEGORY.CORPORATE_ACTION],
];

for (const [description, expected] of cases) {
  test(`classify: "${description}" -> ${expected}`, () => {
    assert.equal(classifyCashRow({ description }), expected);
  });
}

test('the dividend-tax rule wins over the dividend rule', () => {
  // Ordering bug here would silently book tax as income.
  assert.equal(classifyCashRow({ description: 'Dividendbelasting' }), CATEGORY.DIVIDEND_TAX);
  assert.notEqual(classifyCashRow({ description: 'Dividendbelasting' }), CATEGORY.DIVIDEND);
});

test('only deposits and withdrawals are external', () => {
  assert.ok(isExternal(CATEGORY.DEPOSIT));
  assert.ok(isExternal(CATEGORY.WITHDRAWAL));
  for (const c of [CATEGORY.DIVIDEND, CATEGORY.FEE, CATEGORY.INTEREST, CATEGORY.TRADE, CATEGORY.FX, CATEGORY.UNKNOWN]) {
    assert.equal(isExternal(c), false, `${c} must not count as external cashflow`);
  }
});

test('cash sweeps do not move the tracked balance', () => {
  assert.equal(affectsCash(CATEGORY.CASH_SWEEP), false);
  assert.equal(affectsCash(CATEGORY.TRADE), true);
});

test('an unknown description with a productId falls back to TRADE', () => {
  assert.equal(classifyCashRow({ description: 'Some new wording', productId: 123 }), CATEGORY.TRADE);
});

test('an unknown description with nothing to go on stays UNKNOWN', () => {
  // It must NOT guess DEPOSIT: a wrong guess here turns a gain into a deposit.
  assert.equal(classifyCashRow({ description: 'Zomaar iets nieuws' }), CATEGORY.UNKNOWN);
  assert.equal(classifyCashRow({}), CATEGORY.UNKNOWN);
});

test('classification ignores case and diacritics', () => {
  assert.equal(classifyCashRow({ description: 'IDEAL DEPOSIT' }), CATEGORY.DEPOSIT);
  assert.equal(classifyCashRow({ description: 'RENTE' }), CATEGORY.INTEREST);
});
