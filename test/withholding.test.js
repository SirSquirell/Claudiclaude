import test from 'node:test';
import assert from 'node:assert/strict';

import { isinCountry, treatyRateFor, withholdingSplit, TREATY_RATE, US_STATUTORY_RATE } from '../src/lib/withholding.js';

test('isinCountry reads the ISO 6166 prefix, and refuses anything malformed', () => {
  assert.equal(isinCountry('NL0011821202'), 'NL');
  assert.equal(isinCountry('US0378331005'), 'US');
  assert.equal(isinCountry('12ABCD'), null, 'a prefix must be two letters, not two digits');
  assert.equal(isinCountry(''), null);
  assert.equal(isinCountry(null), null);
  assert.equal(isinCountry(undefined), null);
});

test('treatyRateFor: the UK levies nothing, the rest cap at 15%, the unlisted are unknown', () => {
  assert.equal(treatyRateFor('GB'), 0);
  assert.equal(treatyRateFor('NL'), 0.15);
  assert.equal(treatyRateFor('DE'), 0.15);
  assert.equal(treatyRateFor('FR'), 0.15);
  assert.equal(treatyRateFor('BE'), 0.15);
  assert.equal(treatyRateFor('CH'), 0.15);
  assert.equal(treatyRateFor('JP'), null, 'not one of AC1\'s six — cannot be determined, not guessed');
});

test('treatyRateFor: the US toggles on the W-8BEN switch (AC2)', () => {
  assert.equal(treatyRateFor('US', { hasW8BEN: true }), 0.15);
  assert.equal(treatyRateFor('US', { hasW8BEN: false }), US_STATUTORY_RATE);
  assert.equal(treatyRateFor('US'), 0.15, 'defaults to the treaty rate, matching a form most holders have on file');
});

test('withholdingSplit: a broker that withholds above the treaty ceiling leaves a reclaimable gap', () => {
  // A German stock: 26.375% withheld at source, NL treaty caps it at 15%.
  const s = withholdingSplit({ gross: 100, actualWithheld: 26.375, countryCode: 'DE' });
  assert.equal(s.treatyRate, 0.15);
  assert.equal(s.reclaimable, 11.38, 'the gap between what was withheld and the 15% ceiling, rounded to the cent');
  assert.equal(s.practicallyLost, 15, 'exactly the treaty ceiling — nothing more, nothing left unaccounted');
  assert.equal(round2(s.reclaimable + s.practicallyLost), round2(26.375), 'the two halves must sum to what was actually withheld');
});

test('withholdingSplit: a UK stock withholds nothing, so nothing is reclaimable or lost', () => {
  const s = withholdingSplit({ gross: 100, actualWithheld: 0, countryCode: 'GB' });
  assert.equal(s.treatyRate, 0);
  assert.equal(s.reclaimable, 0);
  assert.equal(s.practicallyLost, 0);
});

test('withholdingSplit: withheld at or below the treaty ceiling reclaims nothing, never a negative figure', () => {
  // A broker that already applies relief at source withholds exactly 15%.
  const s = withholdingSplit({ gross: 100, actualWithheld: 15, countryCode: 'NL' });
  assert.equal(s.reclaimable, 0);
  assert.equal(s.practicallyLost, 15);
});

test('withholdingSplit: an unrecognised country refuses the split rather than guessing', () => {
  const s = withholdingSplit({ gross: 100, actualWithheld: 20, countryCode: 'JP' });
  assert.equal(s.reason, 'unknown-country');
  assert.equal(s.treatyRate, null);
  assert.equal(s.reclaimable, null);
  // What was actually withheld is still known and shown — refusing the split
  // is not the same as refusing to report the one real number available.
  assert.equal(s.practicallyLost, 20);
});

test('TREATY_RATE only names the six countries AC1 requires, plus the UK', () => {
  assert.deepEqual(Object.keys(TREATY_RATE).sort(), ['BE', 'CH', 'DE', 'FR', 'GB', 'NL', 'US']);
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
