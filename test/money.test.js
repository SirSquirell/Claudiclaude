/**
 * US-51 — a dollar price is not a euro price.
 *
 * The defect was one call site: the transactions table rendered the traded price
 * through `fmtEurCents`, which is hardwired to EUR, so a fill at `$ 3,105` read
 * `€ 3,11`. Nothing was miscalculated — the engine values positions through the
 * product's currency and takes each row's euro figure from DEGIRO's own
 * base-currency total — but a true number wearing the wrong sign cannot be
 * reconciled by the reader, which is the same size of defect here.
 *
 * These tests cover the label, and one of them covers the thing that would
 * silently undo the fix: a currency arriving as a guess rather than as data.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MASK, maskMoney } from '../src/lib/anon.js';
import { parseTransactions } from '../src/lib/parse.js';
import { fmtPrice } from '../src/ui/theme.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// nl-NL uses U+00A0 between symbol and number, and a comma for the decimal.
const norm = (s) => String(s).replace(/ /g, ' ');

test('a price in a foreign currency is not labelled in euros', () => {
  // AC1, and the report that started it: 900 × $ 3,105, printed € 3,11.
  const usd = norm(fmtPrice(3.105, 'USD'));
  // nl-NL writes the dollar as "US$", which is more specific than DEGIRO's own
  // "$" and unambiguous between the dollars — worth keeping rather than trimming.
  assert.ok(usd.includes('US$'), `expected a dollar sign, got "${usd}"`);
  assert.ok(!usd.includes('€'), `a dollar price carries a euro sign: "${usd}"`);
});

test('a price keeps four decimals, so two different fills do not look like one', () => {
  // AC4. At two decimals 3,105 and 3,12 both read 3,11-ish, which is exactly how
  // the two rows in the report looked like the same trade.
  assert.equal(norm(fmtPrice(3.105, 'USD')), 'US$ 3,105');
  assert.equal(norm(fmtPrice(3.12, 'USD')), 'US$ 3,12');
  assert.equal(norm(fmtPrice(0.0125, 'USD')), 'US$ 0,0125');
  // Two is the floor, so an ordinary price does not grow a ragged tail.
  assert.equal(norm(fmtPrice(3, 'USD')), 'US$ 3,00');
});

test('an unknown currency gets no symbol rather than a plausible one', () => {
  // AC3. `Intl` throws on a code it does not know; the fallback is a bare number.
  // A euro sign nobody checked is the defect this story is about, one level down.
  for (const ccy of [null, undefined, '', 'NOTACCY']) {
    const out = norm(fmtPrice(3.105, ccy));
    assert.ok(!out.includes('€'), `"${ccy}" rendered as euros: "${out}"`);
    assert.equal(out, '3,105');
  }
});

test('the base currency still renders as it always did', () => {
  // The 86 existing call sites do not move, and a euro price is still a euro
  // price — the fix must not turn a correct label into a bare number.
  assert.equal(norm(fmtPrice(3.105, 'EUR')), '€ 3,105');
});

test('a masked price keeps its currency and loses its figure', () => {
  // AC6. The symbol is public information about a ticker and discloses nothing
  // about the account; the figure is the thing US-46 hides. Masking a dollar
  // price as "€ •••" would hide the number and keep the wrong label.
  assert.equal(maskMoney('$'), `$ ${MASK}`);
  assert.equal(maskMoney(null), MASK);
  assert.ok(!/\d/.test(maskMoney('$')));
});

test('a transaction without a stated currency is null, not EUR', () => {
  // The parser used to default this to 'EUR', which is rule 4's forbidden move:
  // an unrecognised value acquiring a plausible meaning. Every reader falls
  // through to the product's currency and then to the account's base, so a null
  // costs nothing — and it is what lets the UI decline to label the price.
  const parsed = parseTransactions({
    data: [
      { id: 1, productId: 5, date: '2024-01-02', quantity: 10, price: 2 },
      { id: 2, productId: 5, date: '2024-01-03', quantity: 10, price: 2, currency: 'USD' },
    ],
  });
  assert.equal(parsed[0].currency, null);
  assert.equal(parsed[1].currency, 'USD');
});

test('the transactions table renders the price through fmtPrice, not fmtEurCents', () => {
  /**
   * The regression guard. This is a one-line defect that reads as correct — the
   * number is right and only the sign is wrong — so it is exactly the kind that
   * comes back in a refactor. Asserted over the source because the alternative
   * is a DOM.
   */
  const src = read('../src/ui/app.js');
  const row = src.slice(src.indexOf('function renderTransactions'), src.indexOf('function buildChoice'));
  assert.ok(/fmtPrice\(t\.price/.test(row), 'the price is not formatted with its own currency');
  assert.ok(!/fmtEurCents\(t\.price/.test(row), 'the price is formatted as euros again');
});
