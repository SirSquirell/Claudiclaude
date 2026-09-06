# Gratis en Plus: hoe de twee lagen technisch werken

Geschreven 2026-09-06 als uitwerking van sectie 3 en 4 van `PRODUCT-BRIEF.md`. Nederlands omdat het
een intern besluitdocument is; de stories die eruit komen gaan in het Engels de backlog in. Niets
hieronder is gebouwd.

## 1. Het eerlijke uitgangspunt: een hek, geen muur

De code is open. Iedereen kan de regel vinden die zegt "toon dit alleen met een geldige licentie" en
hem weghalen. Dat is geen ontwerpfout maar een gevolg van de keuze die dit project al maakte: open
kern, controleerbaar door mensen die je niet hoeven te geloven. Portfolio Performance, Obsidian en
elke open-core-extensie leven met hetzelfde hek, en het werkt omdat de meeste mensen betalen voor
iets wat eerlijk geprijsd is en waar ze zich niet voor hoeven te schamen.

Wat dat betekent voor het ontwerp:

- De licentiecontrole is één pure functie met één aanroeppunt, geen verstopte checks door de code.
  Verstoppen maakt de code slechter en houdt niemand tegen.
- De databundel is publiek. Versleutelen heeft geen zin als de sleutel in de open code moet staan.
  Wat Plus koopt is dat de extensie hem gebruikt, plus de gemaksfeatures, plus het gevoel eerlijk
  te betalen voor iets dat elke week onderhouden wordt.
- De Web Store-versie is de enige die je aanraadt. Een aangepaste build is toegestaan (open source),
  maar draagt niet de naam Asteria en komt niet bij de bundel-updates via de store. Dat regel je met
  een licentie op de code (zie §7), niet met techniek.

## 2. Wat in welke laag zit

De vuistregel uit de brief: alles wat uit de eigen DEGIRO-data komt is gratis; externe data en pure
gemakswaarde zitten in Plus. Plus verandert nooit een berekend getal; het voegt alleen schermen en
gegevens toe. Dat is regel 6 in productvorm: een betalende en een gratis gebruiker zien dezelfde
portefeuillewaarde tot op de cent.

| Onderdeel | Gratis | Plus |
|---|---|---|
| Reconstructie, reconciliatie, alle grafieken, Holdings, Rendement, Notices | ja | ja |
| Dividend per aandeel, verhogingen, ritme, verwacht jaarinkomen, staat van dienst (US-121 t/m 128) | ja | ja |
| Export, bugrapport, interop (US-138) | ja | ja |
| Databundel: dividendhistorie en fundamentals, TER, benchmark-ETF's | bundel wordt niet opgehaald | wekelijks opgehaald en getoond |
| Terugvorderbare bronbelasting per land (US-129) | nee | ja |
| Benchmark-vergelijking (US-98) | nee | ja |
| Backup en herstel van de ruwe store (US-137) | nee | ja |
| Jaaroverzicht als PDF en deelbare kaart (US-139) | nee | ja |
| Box 3-peildatum en dividendbelasting (US-130) | nee | ja |

Waarom US-98 in Plus: het is de eerste feature met een server-side onderdeel (de statische
benchmarkbestanden), dus de eerste met doorlopende kosten. Waarom US-137 in Plus: het is het ding
dat betalende gebruikers als eerste missen bij een herinstallatie, en het raakt geen enkel getal.

## 3. De licentie

Een licentie is een getekend token, verifieerbaar zonder netwerk.

```
{ "id": "lic_…", "tier": "plus", "validUntil": "2027-09-06", "issued": "2026-09-06" }
+ handtekening over het gecanonicaliseerde JSON
```

- **Algoritme: ECDSA P-256 via WebCrypto**, niet Ed25519. Ed25519 in WebCrypto staat pas sinds
  Chrome 137 standaard aan en `minimum_chrome_version` is 116; P-256 werkt overal. Vastgelegd:
  signatureformaat P1363 (rauwe r||s, wat WebCrypto teruggeeft), handtekening over de rauwe
  UTF-8-bytes van het token en pas daarna `JSON.parse`, en een `kid` (key-id) in het token zodat
  een sleutel geroteerd kan worden zonder alle tokens ongeldig te maken. De publieke sleutels staan
  in `src/lib/config.js`, per `kid`. Wisselen van sleutel is een release.
- **Verificatie is puur**: `src/lib/licence.js` exporteert `verify(token, publicKeyJwk, today)` en
  geeft `{ tier: 'free' | 'plus', reason }` terug. Geen I/O, geen klok (regel 1: `today` komt
  binnen). Getest met een testsleutelpaar dat alleen in `test/` bestaat.
- **Eén aanroeppunt**: `entitlements(state)` in de UI vraagt het één keer per render en geeft een
  plat object terug (`{ plus: true, expiresInDays: 212 }`). Componenten lezen dat object, ze
  verifiëren nooit zelf.
- **Opslag**: het token staat in `chrome.storage.local` onder `licence`, niet in IndexedDB naast de
  portefeuille. Het is een identifier van een aankoop en valt daarmee onder regel 7: het zit
  **niet** in `EXPORTABLE_META`, niet in het bugrapport, niet in de diagnose. De diagnose meldt
  alleen `plus: true/false` en `expiresInDays`.
- **Activeren**: de koper plakt het token uit de mail van de Merchant of Record in Instellingen.
  Verifiëren gebeurt lokaal; er gaat niets naar buiten. Een ongeldig token geeft de reden
  (handtekening klopt niet, verlopen, ingetrokken), nooit een stil "free".
- **Verlopen**: `validUntil` is hard. Veertien dagen ervoor zegt de Instellingen-pagina het en
  toont de vernieuwlink van de MoR. Na de datum valt de extensie terug op gratis; niets wordt
  gewist, de Plus-schermen tonen wat ze zouden tonen met een uitleg ervoor.
- **Intrekken**: een terugbetaalde licentie komt als `sha256(id)` in de intrekkingslijst die deel
  is van de bundel (§4). Zonder bundel geen intrekking; dat is de bewuste prijs van "geen
  telefoontje naar huis". De lijst is klein en bevat geen namen.
- **Delen**: één token werkt op elk toestel van de koper, en dus ook bij een vriend. Geen
  apparaatlimiet, geen activatieteller: dat vraagt een server die installaties kent. Accepteer het
  als hek (§1).

## 4. De bundel

Zoals US-104 al besloot: statisch, getekend, in zijn geheel opgehaald, nooit per ISIN opgevraagd.

- **Bestanden**: `bundle-v1.json.gz` en `bundle-v1.sig` op GitHub Pages van deze repo (of
  `asteria.prulwerk.nl`), naast een `bundle-index.json` met versie, datum en sha256.
- **Anti-rollback**: de bundel draagt een monotone versie en een getekende datum. De extensie
  bewaart de hoogste versie die ze zag en weigert alles wat ouder is, ook met een geldige
  handtekening. Anders is de intrekkingslijst te omzeilen door de bundel van vorige week terug te
  spelen (red team, bevinding 7).
- **Handtekening**: dezelfde P-256-sleutelfamilie als de licentie maar een **andere sleutel**;
  een gelekte bundelsleutel mag geen licenties kunnen tekenen en omgekeerd. Verificatie in een
  pure functie in `src/lib/bundle.js`, getest.
- **Waar de tekensleutel woont**: niet in de secrets van deze repo zolang `main` geen branch
  protection heeft, want dan kan iedereen die kan pushen de workflow laten tekenen wat hij wil
  (red team, bevinding 6). Een GitHub environment met required reviewers, of een aparte repo met
  twee beheerders. Een verkeerd bronbelastingtarief met een geldige handtekening is erger dan
  geen bundel.
- **Schema hard**: een bundel die het schema breekt wordt geweigerd met reden, ook al is de
  handtekening goed. Een getekende fout is nog steeds een fout.
- **Ophalen**: één keer per week via een alarm in de worker, via een aparte fetch-wrapper met
  eigen host (rule 5 gaat over DEGIRO; dit is een andere host en mag `throttledFetch` niet
  vervuilen), alleen als `tier === 'plus'`. Gratis installaties raken de bundel niet aan en
  verschijnen dus ook niet in de logs van Pages.
- **Wat de bundel niet weet**: wie hem ophaalt. GitHub Pages logt een IP en niets van ons.
- **Inhoud versus getallen**: bundeldata komt nooit in `engine.js`. Hij verrijkt schermen
  (withholding-tarief, TER, safety-feiten) en voedt US-98's benchmarkreeks, die als eigen laag
  naast de portefeuille staat en er niets aan verandert.

## 5. De verkoopkant

- **Merchant of Record**: Lemon Squeezy of Paddle. Zij zijn verkoper, doen btw, factuur, refund en
  bewaren de klantgegevens. Wij bewaren niets van de klant; dat is ook het AVG-antwoord (§8 van
  de red-team-analyse).
- **Webhook**: één Cloudflare Worker ontvangt alleen `order_paid`, controleert eerst de
  HMAC-handtekening van de MoR en weigert alles zonder, is idempotent op order-id (hetzelfde order
  levert hetzelfde token, nooit een tweede), tekent met de privésleutel uit een Worker Secret en
  geeft het token terug aan de MoR voor de bevestigingsmail. Geen database, geen ander endpoint,
  geen logging van de payload (daar staat het e-mailadres van de koper in, en dat maakt ons
  verwerker: verwerkersovereenkomst met de MoR). Zonder deze drie controles is de Worker een
  tekenorakel (red team, bevinding 7).
- **Refund**: `order_refunded` zet `sha256(id)` op de intrekkingslijst; de eerstvolgende
  bundelbuild neemt hem mee.
- **Founding-prijs**: een aparte productvariant bij de MoR met `validUntil` ver in de toekomst en
  een vaste vernieuwprijs. Geen aparte code in de extensie.

## 6. Wat er in de code bij komt, en wat niet

Nieuw, allemaal puur en getest:

- `src/lib/licence.js`: verify, entitlements, intrekkingscheck.
- `src/lib/bundle.js`: verify, schema, lezen.
- `src/lib/config.js`: twee publieke sleutels, bundel-URL, wekelijks alarm.
- `src/sw.js`: één extra alarm en één extra case (`bundle-refresh`), alleen bij Plus.
- `src/ui/`: Instellingen krijgt het licentieveld; de Plus-schermen krijgen een uitleg-staat voor
  gratis gebruikers (wat ze zouden zien, en waarom niet).
- `tools/check-leaks.mjs`: kent het tokenformaat en faalt als het ergens in `fixtures/` of
  `test/` staat buiten het testsleutelpaar.

Niet:

- Geen account, geen login, geen apparaatregistratie, geen telemetrie (brief §4.5).
- Geen versleuteling van de bundel (§1).
- Geen tweede fetch-pad naar DEGIRO; de bundel heeft zijn eigen host en wrapper.
- Geen "trial met verlooptijd" op basis van installatiedatum: triviaal te resetten, en het maakt
  de eerste indruk een aftelklok. Gratis is gratis.

## 7. Licentie op de code

Vandaag heeft de repo geen LICENSE-bestand. Voor open kern met een betaald deel is dat een gat:
zonder licentie is de code juridisch "alle rechten voorbehouden", wat het tegendeel is van wat
de veiligheidspagina wil zeggen. Twee opties, één aanbeveling:

- **MIT of Apache-2.0 op alles.** Simpel, maximaal vertrouwen. Iemand mag een kopie in de Web
  Store zetten onder een andere naam; het merk Asteria bescherm je apart (naam en logo niet
  onder de licentie).
- **Aanbevolen: Apache-2.0 op alles, met de naam en het merkteken expliciet uitgesloten** in een
  `TRADEMARK.md`. Apache regelt patenten en attributie, de merkuitsluiting regelt lookalikes in de
  store (§9 van de red-team-analyse).

## 8. Stories die hieruit volgen

Zie ook `RED-TEAM.md` §2 voor de bevindingen 6, 7 en 8 die dit ontwerp hebben aangescherpt.

Nummers pas bij landen op `main`; volgend vrij nummer staat onderaan `BACKLOG.md`.

1. Licentie: `licence.js`, opslag, Instellingen-veld, uitlegstaat, allowlist-tests.
2. Bundel-client: `bundle.js`, alarm, schema, intrekkingslijst.
3. Bundel-pipeline (US-104 herzien met de bronnen uit de brief) plus tekenstap in CI.
4. Webhook-Worker met MoR-handtekeningcontrole en tekenstap.
5. LICENSE en TRADEMARK.md.
6. SPEC §7-amendement: Web Store en Plus.
