# Red-team Asteria 0.70.3

Uitgevoerd 2026-09-06, alleen gelezen. Scope: de code op `main` (05892c3, 0.70.3) plus het ontwerp
van de Plus-laag in `PRODUCT-BRIEF.md` §3 en §4 en `TIERS.md`. Alles hieronder is in de bron
nagelopen; waar iets niet te verifiëren was (branch protection, upstream-hash van Chart.js) staat
dat erbij. Bevindingen die dezelfde dag zijn gefixt staan als zodanig gemarkeerd in §4.

## 1. Wat kan hij

**Een script op trader.degiro.nl** (DEGIRO gecompromitteerd, of een kwaadaardige advertentie of
extensie die daar injecteert). De router in `src/sw.js:82-101` laat vanaf dit origin precies vier
berichten door: `banner-status`, `sync`, `tab-ready`, `openApp`. Wipe, export, disconnect en
diagnose worden stil geweigerd (`test/sw.test.js:90-106`). `banner-status` geeft vier booleans en
timestamps terug, geen posities. Een paginascript kan zelf geen `chrome.runtime.sendMessage` doen
(geen `externally_connectable`), maar hoeft dat ook niet: de strip staat in een **open** shadow
root (`src/content/banner.js:73`) en de knoppen controleerden `event.isTrusted` niet. Zodra
`showSync` waar is (bij een fout of een verouderde sync, `src/lib/bannermodel.js:82,85`) kon
`document.getElementById('asteria-strip').shadowRoot.querySelector('.sync').click()` een
`{type:'sync', force:true}` afvuren, en `sw.js` honoreerde dat `force`, waarmee de daggrens van
US-112 wegviel. Een lus daarvan is een eindeloze reeks syncs in de sessie van de gebruiker, op
1,1 s afstand. Data lekt er niet mee; het is misbruik van het account, geen diefstal. `tab-ready`
blijft `scheduled` en dus daggegated. `readywatch.js:73-75` leest alleen timingvelden, nooit
`.name`. **Gefixt in 0.70.4**: `force` wordt alleen nog gehonoreerd vanaf de eigen extensiepagina's,
en de strip negeert synthetische clicks.

**Een script op asteria.prulwerk.nl** (XSS op de site of een gecompromitteerde Pages-deploy).
`src/content/site.js` kan twee dingen: de versie lezen (r. 29) en `open-demo` relayen (r. 37-45);
de router staat alleen dat toe. Uitkomst: een demotab openen of hergebruiken, nooit een echte
accounttab. Restrisico: zo'n script weet dat en welke Asteria je hebt.

**Een andere extensie in dezelfde browser.** Geen `externally_connectable`, `permitted()` eist
`sender.id === chrome.runtime.id` (`sw.js:90`). IndexedDB en `chrome.storage` zijn per
extensie-origin. Wat wel kon: de extensie-ID fingerprinten via de `web_accessible_resources`
zonder `use_dynamic_url`. **Gefixt in 0.70.4.**

**Malware of een medegebruiker op de machine.** Plaintext in IndexedDB `degiro-portfolio`: alle
transacties, alle cashregels inclusief omschrijving (`src/lib/parse.js:365`), producten,
koersreeksen, en in `meta`: `intAccount`, `userToken`, `displayName` (`src/lib/session.js:77-79`),
`liveSnapshot` met open posities. Niet opgeslagen: `JSESSIONID`, die per request uit de cookiejar
komt (`session.js:24-28`). Chrome versleutelt IndexedDB niet. Wie de profielmap kan lezen heeft
naam, accountnummer, charttoken en de volledige historie. Dat is hetzelfde niveau als elke
website in dat profiel, maar het stond nergens zo hard opgeschreven. Nu wel, hier.

**De gebruiker zelf: export en bugrapport.** `EXPORTABLE_META` (`src/lib/store.js:300-351`) is een
echte allowlist; `redactMeta` zet de rest op `[redacted]`. De export draagt bewust de ruwe stores,
dus cashomschrijvingen en instrumentnamen; de README zegt dat. Het bugrapport (`src/lib/report.js`)
neemt alleen benoemde velden en per waarschuwingscode een samenvatting; de dividendwaarschuwingen
uit 0.69 en 0.70 reizen als code plus aantal. Notices met productnamen blijven in de DOM en het
rapport leest ze niet. Alle 39 `innerHTML`-plekken in `app.js` zijn nagekeken: productnaam,
symbool, dividendlabels en cashcategorieën gaan door `esc()`; banners en notices via `textContent`.
Restpunten: de diagnose stuurde de volledige `userAgent` en `lastError.detail` ongefilterd mee
(`src/lib/diagnose.js:344,352`), en `account.firstDay` in het rapport is een quasi-identifier.
**userAgent en detail gefixt in 0.70.4**; `firstDay` staat open (§4, nr. 15).

**DEGIRO.** Eén queue op 1,1 s (`src/lib/degiro.js:63-79`), 401 en 403 gooien direct
`SessionExpiredError` zonder retry (`degiro.js:93-95`), retries alleen op 429 en 5xx met backoff
2 tot 60 s en maximaal 4. Onbeheerde runs: daggrens plus 30 minuten cooldown na een mislukte
poging; een losgekoppeld account weigert ze. De enige lus was de geforceerde sync via de strip
(hierboven). Een eerste sync is de zwaarste: tot 22 achterwaartse jaarrequests plus koerschunks;
op 1,1 s is dat minuten in dezelfde sessie als de handelspagina. Geen fetch buiten
`throttledFetch` gevonden; `app.js` haalt alleen het eigen manifest op.

**Supply chain.** `vendor/chart.umd.js` draagt alleen een header-comment als herkomst; er is geen
vastgelegde upstream-hash en geen check, en `check-leaks.mjs` slaat `vendor/` over. cdnjs was
vanuit de sandbox niet bereikbaar om te vergelijken, dus dit staat open. `ci.yml` pint acties op
tag, niet op SHA; `permissions: contents: read` is goed. Branch protection staat uit; er hangen 38
`claude/*`-branches plus `poc`. Pages serveert de hele root van `main`, dus `docs/`, `test/` en
`fixtures/` staan live, en de installatieroute is "Download ZIP van main". Wie op `main` kan
pushen levert dus direct aan elke installatie en aan het web. Extra: `.leakwords` staat in
`.gitignore`, dus in CI bestond het niet en de namencheck sloeg stil over met exit 0.
**Fail-closed in CI sinds 0.70.4**; de woordenlijst komt uit een GitHub-secret dat de eigenaar zet.

**De Plus-laag (ontwerp).** Een token `{licentie-id, geldig tot}` met publieke sleutel in de code
is niet gebonden aan installatie of persoon, dus kopiëren is delen; en de check zit in open code,
dus één regel wegcommenten is de paywall voorbij. Dat is een hek, geen muur (`TIERS.md` §1). De
webhook-tekenaar is een orakel als hij niet de MoR-handtekening en het order-id controleert. De
intrekkingslijst in de bundel werkt alleen als de extensie een oudere bundel weigert; zonder
monotone versie speelt een aanvaller de bundel van vorige week terug. Bundelvergiftiging: staat de
tekensleutel in de secrets van een repo zonder branch protection, dan kan iedereen die `main` kan
wijzigen de workflow laten tekenen wat hij wil, en een verkeerd bronbelastingtarief komt met een
geldige handtekening op het scherm. WebCrypto: Ed25519 staat pas sinds Chrome 137 standaard aan,
terwijl `minimum_chrome_version` 116 is; ECDSA P-256 werkt overal maar heeft eigen valkuilen
(signatureformaat P1363 versus DER, tekenen over rauwe bytes, key-id voor rotatie). `TIERS.md` is
hierop aangepast.

**Merk en updatekanaal.** Niet in de Web Store, dus iedereen kan een "Asteria" publiceren met deze
code; er staat geen `LICENSE` in de root, waardoor de repo juridisch niet open source is (alle
rechten voorbehouden), wat wringt met "open kern". Een gebruiker kan zijn build niet verifiëren: de
popup toont een versienummer, geen hash; er zijn geen releases of tags met sha256. Een overname van
het ontwikkelaarsaccount bij Google betekent later een kwaadaardige update voor elke installatie.

**Juridisch.** `README.md:138-141` zegt dat geautomatiseerde toegang kan botsen met DEGIRO's
voorwaarden en "do not publish this to the Chrome Web Store"; de brief plant precies dat. Die
tegenstrijdigheid leest een tegenpartij als bewustzijn. AFM: "Total reclaimable" en "next expected
payment" zijn informatie en dragen "not a tax document"; blijf weg van veilig, koop, verkoop en van
een rangschikking, zeker in een betaalde laag. AVG: de MoR is verkoper en verantwoordelijke voor
kopersdata, maar de webhook ziet het e-mailadres om het token terug te geven, dus wij zijn
verwerker: verwerkersovereenkomst met de MoR, geen payload-logging in de Worker,
privacyverklaring.

## 2. Bevindingen

| # | Ernst | Wat | Bewijs | Mitigatie | Stand |
|---|---|---|---|---|---|
| 1 | hoog | Geen branch protection; push op `main` = live op Pages, in de installatie-ZIP en straks in de bundel-signing | `CNAME`, `README.md:67`, `INSTALL.md:7`, 38 `claude/*`-branches | Protection met verplichte CI; releases vanaf getagde commits met sha256; signing in een environment met required reviewers of aparte repo; stale branches weg | eigenaar |
| 2 | midden | Forced sync en tab openen vanaf een paginascript op DEGIRO via de open shadow root | `banner.js:73,214-221`, `sw.js:148`, `bannermodel.js:82,85` | `force` alleen vanaf eigen pagina's; `isTrusted` op de knoppen | gefixt 0.70.4 |
| 3 | midden | Namencheck van check-leaks stond in CI stil uit | `.gitignore`, `check-leaks.mjs:51-54,152`, `ci.yml` | Falen als `.leakwords` ontbreekt in CI; woordenlijst uit secret `LEAKWORDS` | gefixt 0.70.4, secret is aan de eigenaar |
| 4 | midden | Chart.js zonder vastgelegde hash of check | `vendor/chart.umd.js`, `check-leaks.mjs:43` | `tools/check-vendor.mjs` met de upstream sha256 van 4.4.7 in `npm test`; herkomst-URL in `vendor/README` | open |
| 5 | midden | Alles at rest plaintext, incl. `intAccount`, `userToken`, `displayName`, posities | `session.js:77-79`, `parse.js:365`, `store.js` | Opschrijven in README en privacybeleid; `displayName` niet meer cachen; `userToken` per sync opnieuw ophalen | open |
| 6 | midden | Bundel-tekensleutel zou het vertrouwen van `main` delen | brief §4.1 en §4.3 | Sleutel in environment met reviewers; aparte sleutels voor licentie en bundel; key-id; rotatieplan | in `TIERS.md` |
| 7 | midden | Webhook als tekenorakel, replay, intrekking omzeilbaar | brief §3 en §4.3 | MoR-HMAC controleren, idempotent op order-id, alleen `order_paid`; bundel met monotone versie, extensie weigert ouder dan laatst gezien | in `TIERS.md` |
| 8 | midden | Ed25519 in WebCrypto versus `minimum_chrome_version` 116 | `manifest.json:6` | ECDSA P-256 met vastgelegd signatureformaat; verifiëren over rauwe bytes | in `TIERS.md` |
| 9 | midden | Geen `LICENSE`, geen release-artefacten, build niet verifieerbaar | root, `package.json`, `popup.js:283` | Licentie kiezen; GitHub Releases met ZIP en sha256; commit-hash in `version_name`; 2FA op het dev-account | open |
| 10 | midden | README verbiedt wat de brief plant; DEGIRO-voorwaarden niet gelezen | `README.md:138-141`, brief §1 | Voorwaarden lezen en de conclusie opschrijven; README en brief op één lijn; disclaimer "niet gelieerd aan DEGIRO" | open |
| 11 | laag | Extensie fingerprintbaar vanaf trader.degiro.nl | `manifest.json:33-42` | `use_dynamic_url: true` | gefixt 0.70.4 |
| 12 | laag | Diagnose lekte volledige `userAgent` en `lastError.detail`; `client`-keys zonder cijferregel | `diagnose.js:127,344,352` | Alleen Chrome-major; `detail` weg; `topKeys` via `fieldNames` | userAgent en detail gefixt 0.70.4; `topKeys` open |
| 13 | laag | Actions op tag in plaats van SHA | `ci.yml` | Pin op commit-SHA | open |
| 14 | laag | Sectieguard zet `err.message` in ring en banner | `app.js:2196-2202` | Vandaag veilig; regel: geen eigen throw met een naam erin | geaccepteerd |
| 15 | laag | `account.firstDay` plus valuta's en producttypes is een zwakke identifier in het bugrapport | `report.js:333-343` | Afronden op jaar | open |

## 3. Wat de code al goed doet

- Router gated op origin én `sender.id`, weigering is stilte, destructieve cases alleen voor eigen
  pagina's: `sw.js:82-101`, getest in `test/sw.test.js:78-106`. De strip krijgt vier velden, geen
  posities: `sw.js:130-136`.
- Geen `externally_connectable`, CSP `script-src 'self'`, Chart.js gebundeld: `manifest.json`.
- Sessie-id nooit op schijf; cookie per request gelezen: `session.js:24-28`. `safeUrl` haalt
  `;jsessionid` en accountnummers uit foutmeldingen: `degiro.js:30-33`.
- Een antwoord mag niet bepalen waar het volgende request heen gaat: hostpin op `trader.degiro.nl`
  en https-only in `parse.js:676-688`.
- 401 en 403 nooit herhaald, één globale queue op 1,1 s, backoff met plafond: `degiro.js:63-108`,
  `config.js:89-107`. Daggrens en cooldown voor onbeheerde runs: `sync.js`, `config.js:135-158`.
- Allowlists in plaats van scrubs: `store.js:300-351`, `report.js:67-281`, `snapshot.js` met vaste
  key-set en geen `fetch`, `fieldNames` met de cijferregel, `errlog.js:36-43` scrubt bij opname.
  Diagnose weigert cashbewoording bewust: `diagnose.js:213-218`.
- `displayName` bewust buiten `DIAGNOSTIC_META`: `datasource.js:229-240`.
- Content script leest niets van de pagina; `readywatch.js` alleen timings: `readywatch.js:57-75`.
- Alle `innerHTML`-interpolaties met accountdata gaan door `esc()`; banners via `textContent`.
  Geen `eval`, `new Function`, `insertAdjacentHTML`.
- CI met `contents: read`, geen `pull_request_target`; `check-leaks` draait vóór de tests;
  `.gitignore` weert HAR's en exports.
- De deelbare kaart weigert een "certified"-badge omdat elke handtekening in de bron zelf te
  vervalsen is (`snapshot.js`). Dezelfde nuchterheid hoort bij de licentie.

## 4. Vijf dingen vóór de eerste betalende klant

1. **Branch protection, releases vanaf tags, signing buiten `main`.** Dit is de wortel van
   bevinding 1, 6 en 7; zonder dit is elke handtekening zoveel waard als het zwakste wachtwoord met
   push-recht. Eigenaar, GitHub-UI.
2. **Cryptokeuze en formaat vastleggen**: P-256, token met key-id, bundel met monotone versie en
   anti-rollback, webhook met MoR-HMAC en idempotentie. Staat nu in `TIERS.md`; wordt code in de
   stories daaruit.
3. **Bevinding 2, 11 en 12 fixen.** Gedaan in 0.70.4.
4. **Papierwerk**: licentie in de repo, DEGIRO-voorwaarden gelezen en genoteerd, README en brief
   op één lijn, privacyverklaring, verwerkersovereenkomst met de MoR, disclaimer over
   niet-gelieerdheid.
5. **Hygiëne die je later niet meer inhaalt**: vendor-hashcheck, `.leakwords` fail-closed in CI
   (gedaan; secret zetten is aan de eigenaar), 38 branches opruimen, acties op SHA.

De openstaande nummers zijn samengebracht in US-141 in `BACKLOG.md`.
