import test from 'node:test';
import assert from 'node:assert/strict';

import { STALE_AFTER_DAYS, bannerModel, bannerText, pickLang } from '../src/lib/bannermodel.js';

// US-91. De strip op de brokerpagina. Wat hier gepind wordt is precies wat op
// andermans pagina fout kan gaan: tonen wanneer het niet mag, "Sync nu"
// aanbieden terwijl de sync al loopt, of een toon die niet bij de toestand
// past. Alle tijden synthetisch — geen waarde uit een echt account (rule 7).

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // vast, geen klok in een test

test('US-91 — losgekoppeld wint van alles: geen strip', () => {
  // Zelfs met een verse fout én verouderde data: US-79 vroeg om rust.
  const m = bannerModel({ disconnected: true, lastError: { message: 'x' }, lastSyncAt: NOW - 30 * DAY, now: NOW, lang: 'nl' });
  assert.equal(m.show, false);
});

test('US-91 — vers gesynct: bijgewerkt, geen knop', () => {
  const m = bannerModel({ lastSyncAt: NOW - 2 * 60 * 60 * 1000, now: NOW, lang: 'nl' });
  assert.deepEqual([m.show, m.tone, m.showSync], [true, 'ok', false]);
  assert.equal(m.line, bannerText('nl').fresh);
});

test('US-91 — verouderd vanaf de drempel: warn, dagen geteld, knop erbij', () => {
  const under = bannerModel({ lastSyncAt: NOW - (STALE_AFTER_DAYS * DAY - 1), now: NOW, lang: 'nl' });
  assert.equal(under.showSync, false, 'net onder de drempel is nog vers');

  const at = bannerModel({ lastSyncAt: NOW - STALE_AFTER_DAYS * DAY, now: NOW, lang: 'nl' });
  assert.deepEqual([at.tone, at.showSync], ['warn', true]);
  assert.equal(at.line, `Laatste sync: ${STALE_AFTER_DAYS} dagen geleden.`);

  const twelve = bannerModel({ lastSyncAt: NOW - 12 * DAY, now: NOW, lang: 'en' });
  assert.equal(twelve.line, 'Last sync: 12 days ago.');
});

test('US-91 — laatste poging mislukt: err en de knop, wat de leeftijd ook is', () => {
  // lastError is na een geslaagde sync altijd null (sync.js), dus niet-null
  // betekent "de laatste poging faalde" — ook als de data zelf nog vers oogt.
  const m = bannerModel({ lastError: { reason: 'login', message: 'gone' }, lastSyncAt: NOW - DAY, now: NOW, lang: 'nl' });
  assert.deepEqual([m.tone, m.showSync], ['err', true]);
  assert.equal(m.line, bannerText('nl').error);
});

test('US-91 — bezig: de bezig-regel en geen knop, ook bovenop een fout', () => {
  // Een lopende sync is het antwoord op elke andere toestand; een tweede
  // "Sync nu" ernaast zou een dubbele run uitlokken.
  const m = bannerModel({ syncing: true, lastError: { message: 'x' }, lastSyncAt: 0, now: NOW, lang: 'en' });
  assert.deepEqual([m.tone, m.showSync, m.line], ['ok', false, bannerText('en').syncing]);
});

test('US-91 — alleen de bezig-toestand is als voortgang gemarkeerd', () => {
  // De strip leest de status eenmaal bij het laden en moet weten welke regel
  // hij later moet intrekken: die van een lopende run, en geen andere. Zonder
  // deze vlag bleef "Bezig met syncen…" staan nadat de sync klaar was — de
  // enige regel hier die over iets gaat wat nog verandert.
  assert.equal(bannerModel({ syncing: true, lastSyncAt: 0, now: NOW, lang: 'nl' }).syncing, true);
  for (const state of [
    { lastSyncAt: 0 },
    { lastSyncAt: NOW - 2 * 60 * 60 * 1000 },
    { lastSyncAt: NOW - 12 * DAY },
    { lastError: { message: 'x' }, lastSyncAt: NOW - DAY },
  ]) {
    assert.ok(!bannerModel({ ...state, now: NOW, lang: 'nl' }).syncing, JSON.stringify(state));
  }
});

test('US-91 — eerste run (nog nooit gesynct): aan het werk, geen knop', () => {
  // De opportunistische sync draait al zodra de tab laadt; de strip hoeft er
  // niet om te vragen.
  const m = bannerModel({ lastSyncAt: 0, now: NOW, lang: 'nl' });
  assert.deepEqual([m.tone, m.showSync], ['ok', false]);
  assert.equal(m.line, bannerText('nl').first);
});

test('US-91 — taal volgt de browser: nl-varianten naar nl, al het andere naar en', () => {
  for (const nl of ['nl', 'nl-NL', 'nl-BE', 'NL']) assert.equal(pickLang(nl), 'nl', nl);
  for (const en of ['en', 'en-GB', 'de-DE', 'fr', '', null, undefined, 'nld']) assert.equal(pickLang(en), 'en', String(en));
  // Een onbekende taalcode valt terug op de Engelse tekstset, nooit op undefined.
  assert.equal(bannerText('xx').open, bannerText('en').open);
});
