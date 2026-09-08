# Architectuurreview — ga ik de juiste kant op?

Geschreven 2026-09-08 op verzoek van de eigenaar, als frisse blik van buiten op de repo zoals hij
op `main` staat (0.74.1). Geen module-voor-module-rapport (dat is US-115 en staat in
`COPILOT-ARCHITECTURE-BRIEF.md`); dit beantwoordt één vraag: **is de richting goed, en zo niet,
waar precies niet.** Nederlands omdat de besluitdocumenten (`PRODUCT-BRIEF.md`, `TIERS.md`) dat
ook zijn. Elke claim is *gemeten*, *afgeleid* of *onbekend*; waar het niet gemeten is staat dat.

## Oordeel in drie zinnen

De kern is goed en dat is geen compliment maar een meting: de engine is puur, de lagen zijn schoon,
de reconciliatie is de acceptatietest, alles wat de machine verlaat is default-deny, en de negen
regels worden door tools afgedwongen in plaats van beloofd. De *richting* — open kern, betaalde
statische bundel, geen accounts, regel 9 als product — is coherent en eerlijk opgeschreven.
**Wat niet klopt is de volgorde**: het commerciële spoor bouwt verrijking op een scrape die
morgen dicht kan, terwijl de ene maatregel die dat risico halveert (SPEC §1.3 noemt hem letterlijk)
nog steeds "pas als het breekt" is en de energie ondertussen naar een tweede broker gaat wiens
poort niet in eigen hand is.

## Wat staat, gemeten

| Wat | Meting | Waarom het telt |
|---|---|---|
| Engine puur | `engine.js` 3 062 regels, 0 treffers op `fetch(`, `chrome.`, `indexedDB`, `Date.now`, `localStorage`; importeert alleen `dates.js` en `classify.js` | Regel 1 is waar, niet alleen opgeschreven |
| Lagen | Geen `src/lib`-module importeert uit `src/ui`; `sync.js` is de enige die net én disk raakt; `brokers/index.js` is de enige grens die een broker noemt | De architectuur uit SPEC §3 is intact na 74 releases |
| Egress | `EXPORTABLE_META` allowlist, `report.js` allowlist, `check-leaks.mjs` faalt gesloten | Regel 7 heeft een incident (0.10.0) achter zich en een tool ervoor |
| Tests | 702, geen dependencies, 2,3 s; suite fakt de klok | Vijf jaar herrekenen is milliseconden — gemeten |
| Afhankelijkheden | nul; Chart.js gevendord | Geen supply chain om te reviewen |

Ik heb naar de zwakke plek in de *kern* gezocht en zie hem niet. De zwakke plekken zitten eromheen.

## Het ene sterke bezwaar: de hedge staat in de spec en is nooit gebouwd

`SPEC.md` §1.3, dag één: *"Keep the internal model transaction-shaped so a CSV importer stays a
small addition if DEGIRO ever breaks the endpoint."* `PRODUCT-BRIEF.md` §1 zegt hetzelfde risico
hardop — DEGIRO kan de interface morgen veranderen — en trekt de juiste conclusie voor de
*belofte* (verkoop de bundel, niet de scrape) maar de verkeerde voor de *bouwvolgorde*: feature 9
(import van DEGIRO's eigen rekeningoverzicht-CSV) staat als "pas als de scrape breekt".

Dat is het verkeerde moment, om drie redenen:

1. **Elke Plus-feature is verrijking van de scrape.** Benchmark (US-98), bronbelasting (US-129),
   Box 3 (US-130), backup (US-137), jaaroverzicht (US-139): allemaal getallen die uit de
   gereconstrueerde historie komen. Breekt het account-endpoint, dan is de bundel nog steeds
   correct en Plus nog steeds nul waard. De refund-clausule uit de brief dekt de klant, niet het
   product.
2. **Als het breekt, zijn betalende klanten al donker.** Een importer die dan nog gebouwd moet
   worden kost weken; een importer die er al is kost de klant één export per maand.
3. **Het is goedkoper dan een tweede broker.** Zelfde broker, zelfde vocabulaire in `classify.js`,
   zelfde instrumenten en valuta's, zelfde `parse.js`-doeltypes. Wat een CSV niet geeft is R4
   (dagkoersen) en R5 (het eigen totaal) — maar R4 komt vandaag ook al van een *ander* endpoint
   (vwd), en R5 wordt dan eerlijk "niet gecontroleerd", precies zoals de deelkaart dat al zegt.

*Afgeleid, niet gemeten:* of DEGIRO's CSV de settled bedragen in EUR per transactie bevat (R2's
harde eis, waar FX en contractgrootte uit gemeten worden). Portfolio Performance importeert het
(SPEC §9), wat suggereert van wel; één export van een echt account beantwoordt het. **Dat is de
spike die vóór de tweede broker hoort, niet erna.** Stopconditie: geen settled bedrag in de CSV
→ de hedge dekt alleen shares/ETF's in EUR, en dat is dan de eerlijke grens, geen reden om niet
te bouwen.

Dit botst met SPEC §1.3 ("no manual entry") en met de positionering "nooit een CSV". Het is een
amendement, hetzelfde soort als "no benchmarks" (US-98) en "no Chrome Web Store" (US-157). Het
tast de positionering niet aan: de scrape blijft het primaire pad en het enige dat "altijd
actueel" is; de CSV is het reddingsvlot, en een product dat een reddingsvlot heeft verkoopt beter
dan een dat er geen heeft.

## Drie kleinere bezwaren, in aflopende grootte

**1. De defecten vallen waar de tests niet kijken.** De laatste drie echte defecten (US-161 menu
buiten beeld, US-162 grafiek 2,5 scherm naar beneden, US-164 verborgen bedragen in de DOM) zijn
alle drie UI-gedrag, alle drie gevonden door een browser, geen van drie door `npm test`. De
UI-tests zijn grotendeels regex op de *broncode* (`test/motion.test.js` en vier andere lezen
`src/ui/*.js` als tekst): een struikeldraad, geen test. De engine is over-getest ten opzichte van
waar de fouten vallen; de UI onder. Het patroon dat wél werkt bestaat al: `tools/check-mobile.mjs`
draait in CI als eigen job in Chromium. Voorstel, klein en zonder nieuw mechanisme: die job
uitbreiden met de DOM-asserties die de brief al eist (§9: "hidden amounts leave no amount in the
DOM — assert it in a test, not by eye") en per gevonden UI-defect één meting toevoegen. Geen
JSDOM, geen testframework: de browser die er al staat.

**2. Drie sporen open, twee wachten op de eigenaar.** STATUS telt 23 stories *refined, not built*;
de backlog 35 *(new)* tegen 37 *(built)*. Multi-broker staat sinds 2026-08-25 stil op een capture
van een gevuld Trading 212-account die niemand in de repo kan maken; Plus staat stil op sleutel,
branch protection, MoR en KVK — allemaal handelingen van één persoon. De refineermachine loopt
harder dan de beslisser, en dat is het tegendeel van regel 8: elke gerefineerde story die niet
gebouwd wordt is documentatie die veroudert (US-12/13 is daar het kleine voorbeeld van). Voorstel:
één spoor tegelijk, met een datum. Trading 212: gevuld account vóór een datum, anders parkeren
zoals Trade Republic — de architectuur (`combine.js`, `brokers/index.js`) blijft, de story gaat op
pauze. Dat is geen verlies; het is wat MULTI-BROKER.md §6 al voorschrijft.

**3. `app.js` is 6 443 regels, 153 functies, één bestand.** Verdedigbaar (MV3, geen buildstap,
regel 8 tegen refactors zonder story) en niet urgent. Maar het is precies waar de drie UI-defecten
woonden, en de naad is er al: `section()` en `renderTiles()` splitsen het per sectie. Niet nu
refactoren; wel de regel afspreken dat de eerstvolgende story die een sectie raakt die sectie
in een eigen module zet. Het bestand krimpt dan mee met het werk in plaats van in één keer.

## Wat de multi-broker-brief vroeg en wat ik ervan zie

`COPILOT-ARCHITECTURE-BRIEF.md` §6 vroeg naar lekken van de broker boven de adaptergrens.
Gemeten vandaag (treffers op `degiro`, hoofdletterongevoelig): `app.js` 50, `engine.js` 42,
`sync.js` 20, `parse.js` 20, `config.js` 17, `session.js` 10. Van de 42 in `engine.js` staan er
8 in code en alle 8 in *tekst van notices* ("does not match what DEGIRO reports") — een label, geen
codepad. Dat is het onderscheid dat de brief zelf maakte, en het antwoord is: de grens is schoon
in de arithmetiek en lek in de *woorden*. Een tweede broker zou notices krijgen die DEGIRO noemen.
Klein, en pas relevant als er een tweede broker is (regel 8) — maar dan wel als eerste.

## Wat ik zou doen, in volgorde

1. **Spike: de DEGIRO-CSV als tweede bron** — één echte export, drie vragen (settled bedrag per
   transactie? cash-omschrijvingen gelijk aan die van het endpoint? datums en valuta's?), één
   pagina resultaat in `docs/`. Stopconditie vooraf: geen settled bedrag → hedge is EUR-only en
   dat wordt zo opgeschreven. Kost een middag met een account erbij; blokkeert niets.
2. **SPEC-amendement §1.3** in dezelfde commit als de eerste regel importcode, zoals US-98 dat voor
   §7 voorschrijft.
3. **`check-mobile.mjs` → `check-ui.mjs`**: de DOM-assertie voor verborgen bedragen erbij, en
   vanaf nu per UI-defect één meting. Geen nieuw framework.
4. **Eén beslissing over Trading 212** met een datum. Niet de code, de story.
5. **Plus in de volgorde van de brief** (Web Store eerst, want zonder listing is de rest theorie),
   en pas bouwen aan bundelclient/webhook als branch protection er is — TIERS §4 zegt zelf waarom.

Wat ik *niet* zou doen: een tweede broker vóór 1; een refactor van `app.js` zonder story; een
vierde spoor.

## Niet geverifieerd

- De inhoud van DEGIRO's CSV-export (zie boven). Niemand in de repo heeft er een.
- Of de vwd-koersendienst en het account-endpoint onafhankelijk van elkaar kunnen wegvallen;
  aangenomen dat de een zonder de ander kan breken omdat het aparte hosts zijn (`config.js`).
- Of Trading 212's publieke dagkoersen (MULTI-BROKER §8b, geen account nodig) als R4-fallback voor
  DEGIRO-instrumenten kunnen dienen via ISIN uit hun instrumentmaster (§8g). Als dat zo is, is de
  waardevolste opbrengst van die spike een *koersbron*, niet een broker. Onbekend; een uur meten.

## De vraag om mee te nemen

Als DEGIRO volgende maand het account-endpoint achter een device-token zet — wat wil je dat een
betalende klant dan op zijn scherm ziet, en hoeveel van dat scherm werkt vandaag zonder de scrape?
