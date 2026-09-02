# Asteria als product: tien features, een verkoopvoorzet en de backend die daarbij hoort

Geschreven 2026-09-02, op verzoek van de eigenaar. Dit is een voorzet om over te beslissen, geen
plan dat al loopt. Nederlands omdat het een intern besluitdocument is; de stories die hieruit
komen gaan in het Engels de backlog in, zoals de rest.

Drie besluiten uit de backlog blijven staan en sturen alles hieronder:

- **Regel 9**: de extensie authenticeert nooit. Ook een betaald product vraagt geen wachtwoord.
- **US-103**: geen commerciële dataleverancier, ooit. Dat ging over inkopen, niet over verkopen.
- **US-102 e.v., laag C**: geen backend met accounts die posities van anderen opslaat. Dit
  document bouwt daar niet aan voorbij; het licentiemechanisme hieronder kent geen gebruikersdata.

## 1. Eerst het ongemakkelijke

Voordat er iets verkocht wordt, drie dingen die je niet weg kunt praten:

1. **DEGIRO's voorwaarden.** De extensie leest een eigen account via een niet-gedocumenteerde
   interface. DEGIRO mag die morgen veranderen of dichtzetten, en een klant die net €29 betaalde
   heeft dan niets. Dat is geen reden om het niet te doen, wel een reden om de belofte klein te
   houden: verkoop de databundel en het gemak, niet de scrape. De scrape blijft gratis en open.
2. **Chrome Web Store.** SPEC §7 zegt "no Chrome Web Store". Zonder store betekent installeren
   ontwikkelaarsmodus plus een waarschuwingsbanner bij elke start. Dat verkoop je niet. Verkopen
   betekent een SPEC-amendement en een storelisting met privacybeleid en permissie-onderbouwing.
   De "niets verlaat de machine"-belofte maakt die onderbouwing juist makkelijk.
3. **Informatie is geen advies.** Een safety score, een herbalanceerhulp en een benchmark zijn
   data. Zodra er "koop" of "verkoop" bij staat, of een rangschikking die zo gelezen wordt, zit je
   bij de AFM. Elke feature hieronder is zo geformuleerd dat hij iets laat zien, nooit iets aanraadt.

## 2. Tien features

Gerangschikt op wat ze opleveren gedeeld door wat ze kosten. A = volledig lokaal, B = heeft de
bundel nodig. Geen van deze tien heeft een server nodig die iets van de gebruiker ziet.

| # | Feature | Laag | Waarom dit, en waarom nu |
|---|---|---|---|
| 1 | **Box 3 en bronbelasting** | A | Waarde per 1 januari (peildatum), ingehouden buitenlandse dividendbelasting per land per jaar, netto/bruto. Elke DEGIRO-klant heeft dit elk voorjaar nodig en zoekt het nu handmatig uit het jaaroverzicht. SPEC zegt "no tax reporting": dit is geen aangifte, dit zijn de twee getallen die je overtypt. Amendement nodig, klein. |
| 2 | **Kostenrapport** | A + B | Transactiekosten, aansluitkosten, valutakosten en TER van ETF's als bedrag en als percentage van het vermogen, per jaar. TER komt uit de KID's die uitgevers gratis publiceren. Niemand weet wat hij DEGIRO en de fondsen samen betaalt. |
| 3 | **Gedragsspiegel** | A | Gemiddelde houdperiode, aantal transacties per jaar, kopen na stijging en verkopen na daling geteld, en het verschil tussen je echte instapmomenten en een maandelijkse DCA op dezelfde bedragen. Alleen dit project heeft de volledige transactiehistorie om dit te berekenen. Uniek, en het raakt niemand behalve de gebruiker zelf. |
| 4 | **Valuta-exposure** | A | Verdeling van het vermogen per valuta en hoeveel van het rendement in een periode uit de wisselkoers kwam. FX is al geïmplementeerd per transactie; dit is presentatie van wat er al is. |
| 5 | **Cash drag** | A | Niet-belegd saldo over de tijd en wat dat gekost heeft tegen het rendement van de eigen portefeuille. Eén grafiek, één getal. |
| 6 | **Herbalanceerhulp** | A | Gebruiker zet doelgewichten per positie of sector; de app laat het verschil zien en wat de volgende inleg zou moeten worden om erheen te bewegen. Rekenkundig, geen oordeel over de doelen. |
| 7 | **Notices op de bundel** | A + B | Ex-datum volgende week, een positie boven X % van het vermogen, een dividendwijziging in de bundel. Bestaand Notices-patroon, geen mail, geen push, alleen bij openen. Staat al in de scopetabel van US-102 als A + B. |
| 8 | **Backup en herstel van de ruwe store** | A | De ruwe API-antwoorden (regel 2) als versleuteld bestand exporteren en terugzetten. Een herinstallatie of nieuwe laptop kost nu vijf jaar aan gethrottelde requests. Dit is de feature die betalende klanten het eerst missen. |
| 9 | **Interop: export naar Portfolio Performance en import van oude jaren** | A | CSV in het formaat dat Portfolio Performance importeert, zodat niemand vastzit. En import van DEGIRO's eigen rekeningoverzicht-CSV voor de jaren vóór HISTORY_START (2019). Vertrouwen verkoopt beter dan lock-in. |
| 10 | **Jaaroverzicht** | A | Eén pagina per kalenderjaar: rendement, inleg, dividend, kosten, beste en slechtste positie, met de bedragen aan of uit, als PDF en als afbeelding. Met bedragen uit is het deelbaar en dus je enige gratis marketingkanaal. |

Niet in de lijst, bewust: multi-account (SPEC), CSV-import als primaire bron (pas als de scrape
breekt), alles wat op een server moet rekenen.

## 2b. Richting Simply Safe Dividends: wat er nog niet in US-102 tot US-109 zit

Toegevoegd 2026-09-02 na de vraag van de eigenaar of de richting SSD is. Ja, dus hier de lijst
die daar wél op mikt. Uitgangspunt: SSD's kern is een safety score uit fundamentals, en US-108
zegt zelf dat die voor Europese namen meestal "niet te bepalen" zal zijn. Wat dit project heeft
en SSD niet: de volledige betaalhistorie van de gebruiker uit DEGIRO. Elke dividenduitkering
gedeeld door het aantal stuks op de ex-datum is een dividend-per-aandeel-reeks per positie,
zonder bundel. Zeven van de negen hieronder komen daaruit en zijn dus laag A.

| # | Feature | Laag | Wat SSD hier doet, en wat wij anders doen |
|---|---|---|---|
| 11 | **Dividend per aandeel uit eigen ontvangsten** | A | De basis voor alles hieronder: per positie de reeks (datum, bruto per stuk, ingehouden per stuk), afgeleid uit cash-regels en het aantal stuks op dat moment. SSD haalt dit uit een datafeed; wij uit wat er echt op de rekening kwam. Eén engine-functie, veel tests, geen nieuwe data. |
| 12 | **Verhogingen en verlagingen gesignaleerd** | A | Vergelijk elke uitkering met dezelfde uitkering een jaar eerder: verhoogd, gelijk, verlaagd, gestopt. Als Notice en als kolom. Dit is SSD's "dividend cut alert", maar dan achteraf uit eigen data in plaats van vooraf uit fundamentals. Eerlijk erbij zetten dat het achteraf is. |
| 13 | **Verwacht jaarinkomen (forward 12 maanden)** | A | Som van de laatste twaalf maanden per aandeel maal het huidige aantal stuks, per positie en totaal. SSD's "projected annual income". Specials (feature 15) uitgesloten, anders klopt het getal niet. |
| 14 | **Betaalritme en volgende verwachte uitkering** | A, later B | Uit het patroon (maandelijks, kwartaal, halfjaar, jaar) de volgende ex- en betaaldatum schatten met een marge. Dat is de Income Calendar zonder bundel, gemarkeerd als schatting. US-104's bundel vervangt de schatting door aangekondigde data zodra die er is. |
| 15 | **Speciale dividenden herkennen** | A | Een uitkering die ver buiten het ritme of het bedrag valt wordt apart gelabeld en telt niet mee in 12, 13 en 14. Zonder dit extrapoleert elke forward-berekening een eenmalige meevaller. |
| 16 | **Yield on cost en huidig rendement per positie** | A | Ontvangen dividend laatste twaalf maanden gedeeld door de kostprijs, en gedeeld door de huidige waarde. Twee kolommen op Holdings, de klassieke SSD-tabel. |
| 17 | **Track record per positie als vervanger van de safety score** | A | Aantal jaren onafgebroken betaald in eigen data, aantal verhogingen, aantal verlagingen, grootste verlaging, groei per jaar over de eigen periode. Geen score, geen cijfer van 0 tot 99: een tabel met feiten. Dit is wat je voor Europese namen eerlijk kunt zeggen; US-108 blijft voor de VS-namen waar EDGAR wel dekt. |
| 18 | **Inkomensdoel op de Outlook-pagina** | A | Doel in euro per maand; de pagina rekent uit waar je staat met het verwachte jaarinkomen (13), en wat maandelijkse inleg plus een aanname voor dividendgroei doen met het aantal jaren tot het doel. Dit is de "LATER, hoort op Outlook (US-33)"-regel uit de scopetabel, nu concreet. Aannames zichtbaar en aanpasbaar, geen advies. |
| 19 | **Terugvorderbare bronbelasting** | A + B | US-106 geeft het effectieve tarief. Hierbij: per land het verdragstarief (meestal 15 %), wat daarvan in de NL-aangifte verrekenbaar is, en wat je alleen bij de bronstaat terugkrijgt (Zwitserland, Frankrijk, Duitsland) of kwijt bent. Verdragstarieven zijn openbaar bij de Belastingdienst, dus vrije bron voor de bundel. SSD doet dit niet, want het is een Europees probleem. Sluit aan op feature 1. |

Wat SSD heeft en hier bewust niet komt, ongewijzigd uit de scopetabel: de fundamentals-score voor
Europa (geen vrije bron), analistenkoersdoelen en fair value (betaald), screener en idea lists
(grenst aan advies), mail en maandrecap (backend).

Volgorde als de richting SSD is: 11 eerst, want alles hangt eraan. Dan 13, 15 en 12 samen, want
die maken het getal betrouwbaar. Dan 16 en 17 als kolommen en een tabel. Dan 14. Dan 18 op
Outlook. 19 pas met de bundel. De PoC van US-109 blijft staan, maar hoeft niet meer als eerste:
met 11 tot 17 heb je een dividendtab die voor Europese portefeuilles meer zegt dan een score die
"niet te bepalen" toont.

## 3. Verkoopvoorzet

### Positionering

"De enige DEGIRO-tracker die nooit je wachtwoord vraagt en zichzelf tot op de cent controleert."
Beide helften zijn aantoonbaar en beide helften heeft geen concurrent.

Concurrenten en waar ze staan: Portfolio Performance (gratis, desktop, handmatig importeren,
sterk maar werk), Getquin en Parqet (koppelen via je inloggegevens bij een derde partij, precies
wat regel 9 verbiedt), Sharesight (betaald, CSV, niet op NL gericht), DEGIRO's eigen rapportage
(mager). Simply Safe Dividends is het voorbeeld voor de dividendlaag maar doet niets met een
Europese broker.

Doelgroep: DIY-beleggers bij DEGIRO in Nederland en België. flatexDEGIRO meldt ruim drie miljoen
klanten in Europa; Nederland is de thuismarkt. Als één op de duizend ooit betaalt, is dat een
paar duizend klanten. Dat is een gezond zijproject, geen bedrijf. Dat is ook de juiste verwachting.

### Model: open kern, betaalde bundel

- **Gratis en open**: de extensie zoals hij nu is. Reconstructie, reconciliatie, grafieken,
  export. Dit is het vertrouwen en de instroom. Dit blijft altijd gratis, ook omdat de scrape het
  fragiele deel is en je daar geen geld voor wilt vragen.
- **Asteria Plus, één prijs per jaar**: de databundel (dividendlaag US-104 t/m US-109,
  benchmarks US-98, TER), plus de gemaksfeatures die alleen betalende gebruikers missen (8, 10, 1).
  Richtprijs €29 per jaar. Anker: Getquin Premium zit rond €60, SSD rond $500. Geen maandprijs;
  een maandprijs vraagt om churn-management dat je niet wilt doen.
- **Geen tussenlaag**: geen "Pro" naast "Plus", geen per-feature. Eén schakelaar in de extensie.

Alternatief dat eerlijk is om te noemen: helemaal gratis met een donatieknop. Dat werkt voor
zichtbaarheid en niet voor het onderhoud van een databundel die elke week moet draaien. Als je
niet wilt verkopen, bouw dan ook geen bundel.

### Hoe het geld binnenkomt zonder dat er iets van de klant bij ons terechtkomt

Merchant of Record (Lemon Squeezy of Paddle). Zij zijn de verkoper, doen de btw per EU-land, de
facturen en de terugbetalingen. Jij krijgt een uitbetaling en een webhook. Kosten rond 5 % plus
een vast bedrag per transactie; dat is minder dan een eigen btw-administratie in 27 landen.

De licentie is een **offline verifieerbaar getekend token** (Ed25519): de webhook tekent
`{licentie-id, geldig tot}` en mailt het via de MoR aan de koper; de extensie controleert de
handtekening met de publieke sleutel die in de code zit. Geen account, geen login, geen
telefoontje naar huis. Intrekking van een terugbetaalde licentie gaat via een lijst van
ingetrokken id's in de bundel, die de extensie toch al ophaalt.

Wat dit betekent voor meten: **er is geen telemetrie en die komt er ook niet.** Je weet hoeveel
installaties de store rapporteert en hoeveel licenties de MoR verkocht. Meer niet. Dat is de prijs
van de belofte en die is het waard.

### Volgorde

1. Web Store-listing van de gratis versie (SPEC-amendement, privacybeleid, screenshots uit de
   demo). Zonder dit is de rest theorie.
2. US-109 PoC werkend met een handgebouwde bundel voor de posities van vijf testers, zoals de
   backlog al zegt.
3. Features 8 en 10 gebouwd, want die verkopen zichzelf en hebben geen bundel nodig.
4. MoR-account, licentiecontrole in de extensie, Plus-schakelaar.
5. Lancering via de kanalen waar de doelgroep al zit: r/DutchFIRE, het DEGIRO-topic op Tweakers,
   de FIRE-podcasts. Het deelbare jaaroverzicht (10) is daarna het enige kanaal dat blijft lopen.

Wat je vóór stap 4 moet regelen: KVK-inschrijving als die er nog niet is (de MoR neemt de btw over,
niet je inkomstenbelasting), een refundbeleid dat rekening houdt met "DEGIRO heeft iets veranderd",
en een zin op de site dat Asteria niets met DEGIRO te maken heeft behalve dat het ermee werkt.

## 4. Backend en dataplatform

Het uitgangspunt staat al in US-101 en US-104 en verandert niet: **de server ziet nooit een
portefeuille.** Alles wat een gebruiker doet gebeurt in de browser. Er zijn precies drie dingen
die legitiem aan de serverkant leven, en het vierde (accounts, sync, posities) blijft laag C:
niet gebouwd.

### 4.1 De bundel: het dataplatform

Eén pipeline die op een rooster draait en een **versieerde, getekende, statische JSON-bundel**
publiceert. Alle installaties halen de hele bundel op, nooit een selectie, want een selectie
verraadt de portefeuille (US-104's argument). Teamkiezeer is het bestaande precedent:
`pipeline/`, `data/`, een GitHub Action met cron, publicatie via Pages. Hetzelfde patroon, geen
nieuwe infrastructuur.

Bronnen, allemaal gratis en herpubliceerbaar, per US-103:

| Wat | Bron | Dekking |
|---|---|---|
| Land van vestiging per ISIN, dus bronbelastingtarief | GLEIF (CC0) | wereldwijd |
| Fundamentals, dividendhistorie | SEC EDGAR (publiek domein) | alleen VS-genoteerd |
| TER, NAV, benchmarkindex van ETF's | KID's en factsheets van de uitgevers (iShares, Vanguard, VanEck publiceren CSV's) | Europese UCITS |
| Wisselkoersen | ECB referentiekoersen | alle majors |
| Europese dividendhistorie en fundamentals | **geen gratis bron met herpublicatierecht**; handmatig gecureerde tabel, alleen voor posities van echte gebruikers, aanvullingen via PR | klein en groeit met de gebruikers |

Die laatste regel is de eerlijke grens van "geen commerciële data": de Europese dividendlaag
wordt een community-tabel of hij wordt er niet. Zeg dat ook zo op de site.

Techniek: Python, één `build.py`, tests op de parsers zoals Teamkiezeer die heeft, uitvoer
`bundle-v1.json.gz` plus `bundle-v1.sig`. Omvang bij vijfduizend ISIN's: circa 10 MB plat, 2 MB
gecomprimeerd, wekelijks opgehaald. De sleutel voor het tekenen staat in GitHub Secrets; de
extensie weigert een bundel zonder geldige handtekening (regel 7, andersom: alleen vertrouwde data
komt binnen). De build faalt hard op een schemafout en opent dan een issue, zoals vandaag voor
Teamkiezeer is ingericht.

Waar hij staat: in deze repo of in `asteria.prulwerk.nl`, geserveerd vanaf Pages, zoals US-104
al besloot. Geen nieuw subdomein zolang GitHub Pages het trekt; Cloudflare R2 is het uitwijkpad
als de bundel groter wordt dan Pages prettig serveert.

### 4.2 De benchmarkcache, maar dan statisch

US-101 schetst een klein backend dat op verzoek een ticker ophaalt en cachet, met een misbruik-
guard op het "nieuwe ticker"-pad. Voorstel: **schrap het on-demand pad helemaal.** Neem een vaste
lijst van vijftig à honderd indexvolgende ETF's, laat de nachtelijke job de dagkoersen ophalen en
publiceer per ticker een statisch JSON-bestand naast de bundel. Dan is er geen endpoint dat een
string aanneemt, dus geen open proxy, geen rate limit en geen AC4 meer om te bewijzen. Wie een
ETF mist, vraagt hem aan via een issue; de lijst groeit per week, niet per request. Bron: de
NAV-bestanden van de uitgevers zelf, dezelfde als voor de TER.

Dit is een aanscherping van US-101, geen nieuwe story. AC1 t/m AC3 blijven staan.

### 4.3 Licenties

Alles wat hierboven onder "hoe het geld binnenkomt" staat. Serverkant: één webhook-ontvanger
(Cloudflare Worker of een GitHub Action via `repository_dispatch`) die het token tekent en aan de
MoR teruggeeft voor de mail. Geen database. De MoR bewaart de klantgegevens, wij bewaren niets.
De intrekkingslijst is een veld in de bundel.

### 4.4 Wat het kost en waar het draait

Tot enkele duizenden gebruikers: nul euro per maand. GitHub Actions is gratis voor een publieke
repo, Pages is gratis, de MoR rekent per verkoop. De Oracle Always Free-machine bestaat al maar
draait De Penalty Trader met een deploy-keten die vandaag als hoog risico is beoordeeld; zet de
bundel daar niet naast. Als de pipeline ooit te zwaar wordt voor Actions, is een aparte gratis
VM op dezelfde tenancy de volgende stap, niet dezelfde machine.

De nachtelijke `security-review`-Routine uit US-101 gaat aan zodra het eerste van deze drie
onderdelen live staat.

### 4.5 Wat we niet bouwen, opnieuw

Accounts. Sync tussen apparaten via ons. Server-side rendering van een portefeuille. Mail of
push. Telemetrie. Een API die per ISIN antwoordt. Dit stond al in de "will not build"-tabel van
US-102 en de verkoop verandert er niets aan; het is juist het verkoopargument.

## 5. Wat dit aan stories oplevert

Als je akkoord bent: tien feature-stories (sectie 2), negen dividendstories (sectie 2b), één story "Web Store en SPEC-amendement",
één story "licentie en Plus-schakelaar", één story "bundelpipeline" (US-104 herzien met de
bronnen uit 4.1), en een aanscherping van US-101 (4.2). Ze claimen nummers pas als ze op `main`
in de backlog landen; daarom staan hier geen nummers.
