# Wat je DEGIRO-rekening elke dag waard was

De grafiek die DEGIRO zelf niet geeft, gereconstrueerd uit je transacties, kasmutaties en
dagkoersen. Hieronder staat wat de extensie kan, en — belangrijker — welke correcties je
cijfers hebben veranderd sinds de eerste versie.

Dit is de leesbare versie, bijgewerkt bij elke release. De volledige, technische release notes
staan in [CHANGELOG.md](CHANGELOG.md); installeren doe je met [INSTALL.md](INSTALL.md).

> **Kom je van een oudere versie? Druk één keer op Wipe & resync.**
>
> Elk getal wordt dan opnieuw berekend uit de ruwe antwoorden van DEGIRO. Opgeslagen getallen
> kunnen van vóór een correctie hieronder zijn, en dan klopt je grafiek nog steeds niet. De
> eerste synchronisatie duurt een paar minuten: één verzoek per 1,1 seconde, met opzet.

---

## Wat je ziet

Zeven secties, elk met de cijfers die erbij horen boven de grafieken. Bij elk cijfer staat een
**i** die uitlegt wat het betekent en vooral wat het *niet* betekent.

### De waardegrafiek

- **Elke dag sinds je de rekening opende.** Een storting is nooit winst. Het resultaat van een
  dag is de verandering in waarde minus wat je die dag zelf hebt in- of uitgelegd; dividend,
  kosten en rente horen wél bij het resultaat.
- **Sleep over de grafiek om in te zoomen** — de zes periodeknoppen bereikten zes vensters en
  verder niets. `0.13.0`
- **Markeringen op de dagen dat je handelde.** `0.15.0`
- **Candles op het cumulatieve resultaat**, per week of maand. `0.13.0`
- **De tegels volgen de periode die je kiest**, en zeggen welke. `0.15.0`

### Rendement

- **Jaar voor jaar**, met het eerste jaar apart: dat begint niet op 1 januari maar op de dag dat
  de rekening openging, en de regel zegt dat erbij. Een jaarrendement is ook niet
  (eind − begin) ÷ begin — dat telt je stortingen als rendement mee. `0.34.0`
- **Gemiddeld rendement per jaar, twee soorten, achter een schakelaar.** *Mijn geld* rekent mee
  wanneer je hoeveel had staan; *De portefeuille* negeert dat en meet alleen de keuzes. Ze
  verschillen als je gestort hebt, en dat verschil is het punt. `0.33.0`
- **Maandraster**, en twee specifieke maanden naast elkaar. `0.10.0`
- **Wat er bewoog in deze periode** — resultaat per instrument. `0.29.0`
- **Diepste daling**, gemeten op de curve zonder stortingen. `0.25.0`
- **Grootste winnaar en verliezer**, beste en slechtste maand, maanden in winst. `0.23.0` `0.22.0`

### Per belegging

- **Winst en verlies per product, inclusief wat je niet meer hebt.** Een positie die je vorig
  jaar met verlies sloot telt nergens anders mee, en is precies wat je wilt terugzien. `0.31.0`
- **Transacties** — de regels achter elk cijfer op de pagina. `0.31.0`
- **Koers en gemiddeld betaald** als kolommen in de tabel. `0.31.0`
- **Hoeveel van een positie je eigen geld is**, en hoeveel het opleverde. `0.22.0`
- **Tabel of ring**, zelfde groepering en zelfde kleuren. `0.11.0`

### Samenstelling, inkomsten en kosten

- **Valuta-exposure** — op welke munten je waarde meelift. `0.29.0`
- **Niet-belegde cash over tijd**, in een eigen grafiek. Bewust geen band op de waardegrafiek:
  twee schalen op één plot verzinnen een verband. `0.29.0`
- **Rente staat op het scherm.** Het werd al berekend en nergens getoond. `0.23.0`
- **Totale kosten** — transactiekosten, ingehouden dividendbelasting en betaalde rente. Let op:
  hier zit *niet* in wat een marginpositie je kost. Dat staat ook bij de **i**. `0.25.0`

### De pagina zelf

- **Nederlands of Engels**, met een vlaggetje in de kop. `0.32.0`
- **Licht, donker of automatisch.** `0.26.0`
- **Meldingen** — alles waar de reconstructie onzeker over is staat op één plek; wat een getal
  onbetrouwbaar maakt blijft bovenaan vastgezet en kun je niet wegklikken. `0.25.0`
- **Het kleurenpalet is gemeten, niet gekozen**: elke serie is gecontroleerd op contrast en op de
  drie vormen van kleurenblindheid. `0.16.0`
- **Werkt op smalle vensters**, en volgt de tekstgrootte die je in je browser hebt
  ingesteld. `0.17.0` `0.19.0`

---

## Vooruitblik

Waar dit heen gaat over één, drie of vijf jaar, met een maandelijkse inleg als je die doet.
**Het enige scherm in de extensie met een getal dat niemand kan controleren** — en daarom een
aparte sectie, met het voorbehoud bóven de cijfers in plaats van eronder. Niets hiervan komt in
een tegel, de export of het foutrapport terecht; dat zijn metingen. `0.35.0`

- **Goede, verwachte en slechte markt komen uit je eigen historie**, niet uit een aangenomen
  verdeling. Het zijn de beste, middelste en slechtste periodes die je rekening echt heeft
  meegemaakt — dezelfde methode die de Europese standaard voorschrijft, en om dezelfde reden: een
  normaalverdeling maakt de staart te dun op precies de plek waar je het scenario gebruikt.
- **Het slechte geval is het gemiddelde van het slechtste tiende deel**, niet het tiende
  percentiel. Een percentiel zegt "het was minstens zo erg"; het gemiddelde van de staart zegt
  "als het slecht ging, ging het gemiddeld zó slecht".
- **Het zegt hoeveel bewijs het had, en handelt ernaar.** Vijf jaar historie bevat precies één
  *onafhankelijke* periode van vijf jaar, hoeveel overlappende vensters je er ook uit schuift.
  Onder de drie heet het een voorbeeld en geen scenario uit je eigen verleden. En komt het gemeten
  percentage uit op iets wat geen markt beschrijft, dan wordt er helemaal niets getekend — een lijn
  uit één waarneming mag er niet uitzien als een lijn uit vijftig, en een lijn uit een boekhoudkundig
  artefact hoort er niet te zijn.
- **Groei en dividendrendement staan apart**, en zijn zo afgeleid dat ze elkaar niet dubbeltellen.
- **Dividend groeit alleen mee als het echt herbelegd is**, en de kaart begrenst of dat bij jou
  zo was.
- **Vijf jaar is een plafond, geen standaard.** De band wordt breder met de wortel van de tijd
  terwijl het bewijs juist dunner wordt.

---

## Correcties in je cijfers

Dit is de sectie die er echt toe doet. Elk van deze fouten liet een grafiek zien die er
overtuigend uitzag en niet klopte. **Draai je een versie van vóór een regel hieronder, dan klopt
jouw grafiek ook niet — en helpt alleen Wipe & resync.**

| | Wat er misging | |
|---|---|---|
| **Waardering** | **Opties werden geteld alsof één contract één aandeel was.** Een optiecontract dekt honderd aandelen, of tien, of na een corporate action honderddrie — en dat getal stond nergens in de code. De contractgrootte wordt nu per instrument gemeten aan wat er werkelijk betaald is. | `0.10.0` |
| **Wisselkoersen** | **Koersen werden afgeleid uit transacties, inclusief opties.** Bij een aandeel is de verhouding tussen betaalde euro's en koers × aantal de wisselkoers; bij een optie is het die koers maal de contractgrootte. Waar élke transactie in een munt een optie was, kwam **CHF uit op 107,1 in plaats van 1,07**. Koersen komen nu uit de valutaconversies die DEGIRO zelf boekt, die de koers gewoon opschrijven. | `0.10.0` |
| **Posities** | **Een gesloten positie kon aandelen achterlaten.** Twee deelorders op één volatiele dag vielen in verschillende regimes en hieven elkaar niet meer op. Dat verzon posities in een failliet, van de beurs gehaald bedrijf — uit een grootboek dat op precies nul uitkomt. Posities worden nu ook getoetst aan de aantallen die DEGIRO zelf rapporteert. | `0.10.0` |
| **Valuta** | **Een saldo in Britse ponden werd op 1:1 geteld.** Pence en ponden zijn dezelfde munt, dus handelen in GBX levert nu ook de GBP-koers op, en omgekeerd. | `0.10.0` |
| **Weergave** | **De holdings-tabel toonde een omgerekend getal, geen aantal aandelen.** Met vier decimalen in Nederlandse opmaak stond `17,363` recht onder `2.000` en las het als zeventienduizend. | `0.10.0` |
| **Wisselkoersen** | **Een bedrag in centen werd als wisselkoers gebruikt.** Gevonden via een foutrapport van een tester, en precies waarvoor dat rapport bestaat. | `0.28.0` |
| **Eerlijkheid** | **Een contractgrootte via een geïnterpoleerde koers claimt niet langer "gemeten".** Hij heet nu *geschat*, wat hij was. Een getal mag er niet zekerder uitzien dan het is. | `0.29.0` |
| **Rekenwerk** | **De verstreken tijd was één dag te lang.** Bij het omrekenen naar jaarrendement werd een *aantal* dagen gebruikt waar de *afstand* ertussen nodig was. | `0.33.0` |
| **Valuta** | **Een buitenlands instrument wordt nu omgerekend met de koers die z’n eigen transacties noemen.** 0.38.0 signaleerde alleen dat er iets niet klopte; nu wordt het opgelost — zonder te gokken wélke munt het is, want de verhouding tussen wat er afgerekend en wat er verhandeld is, í́s de koers. | `0.39.0` |
| **Rendement** | **"+207% all time" naast +€ 16.621 op € 16.676 inleg.** Het percentage onder een euroresultaat lees je als "zoveel van wat ik erin stopte" — die twee tegels staan naast elkaar. Het was een tijdgewogen keten, die een andere vraag beantwoordt. Nu zegt het wat het lijkt te zeggen. | `0.39.0` |
| **Versie** | **Het versienummer staat in de kop.** Een tester meldde een bug op **v0.21.0** zonder het door te hebben, omdat het nummer in kleine grijze letters onderaan een lange pagina stond. | `0.39.0` |
| **Prognose** | **Acht overlappende periodes zijn geen acht waarnemingen.** De prognose schuift een venster van vijf jaar één maand per keer over je historie, dus vijfenhalf jaar data levert acht vensters die 59 van hun 60 maanden delen. Dat is er ongeveer één. Het bijschrift zei het zelf al — *"treat 8 as fewer independent observations than it looks"* — terwijl de code ze als acht telde en het resultaat **historie** noemde. Op één rekening leidde dat tot een voorspelling van **€ 89 miljoen** op een portefeuille van drieëndertigduizend. Bij de meeste rekeningen wordt de Vooruitblik nu een *voorbeeld* in plaats van een scenario uit je eigen verleden — wat het altijd al was. | `0.38.0` |
| **Prognose** | **Het percentage dat je zelf invulde werd genegeerd.** *Groei % per jaar* deed niets bij elke rekening met genoeg vensters: alle drie de lijnen kwamen uit de historische verdeling. De knop was decoratie. Jouw getal is nu de middelste lijn, en de spreiding die je eigen rekening liet zien blijft eromheen staan. | `0.38.0` |
| **Prognose** | **Geen grafiek bij een percentage dat geen markt beschrijft.** Komt de gemeten groei uit op honderden procenten per jaar, dan valt er niets eerlijks te tekenen: de historie is echt, maar wat hij meet is geen groei — het zijn stortingen en de aankopen die ermee betaald zijn, een dag uit elkaar geboekt. Het vak zegt dat nu en blijft leeg. Je kunt de percentages nog steeds zelf invullen. | `0.38.0` |
| **Weergave** | **Een verliesgevende positie meldde dat hij niets verloren had.** De balk las *"100% paid in · 0% lost"* naast een resultaat van −€ 766. Sta je onder water, dan is je inleg *meer* dan wat het waard is — de balk wordt nu op je inleg geschaald en zegt **"23% van je inleg is weg"**. | `0.38.0` |
| **Rendement** | **Een percentage waar niets was om het op te verdienen.** Eén rekening toonde **+291.949,64%** als resultaat over de hele periode en **−60.006,26%** als slechtste maand, naast een doodgewone +19,64% beste maand. De berekening sloeg alleen dagen over die met *niets* begonnen, dus een dag die met twee cent begon en vijf euro bewoog vermenigvuldigde het lopende cijfer met 250. Dat zijn de openingsdagen van een rekening, waar een storting en de aankoop die ermee betaald is een dag uit elkaar vallen. Een dagresultaat moet nu passen binnen wat er aan het begin van die dag in zat. | `0.37.0` |
| **Controle** | **De controle die alle cijfers bevestigt ontbrak op twee van de drie rekeningen.** DEGIRO stuurde bij die twee geen rekeningtotaal — alleen kasvelden — dus de enige toets die bewijst dat de historie klopt kon helemaal niet draaien. Hij draait nu tegen de som van de positiewaarden en het kassaldo die DEGIRO wél stuurt, en de pagina zegt erbij dat dat een iets zwakkere controle is. | `0.37.0` |
| **Privacy** | **Een geldig sessie-id kon in het geëxporteerde bestand belanden.** Foutmeldingen knipten de query-string van een URL af, maar niet overal. Sindsdien declareert de export wát er mee mag in plaats van wat eruit moet — zie hieronder. | `0.20.0` |

---

## Als er iets misgaat

Nieuw in `0.36.0`. Er verandert niets aan hoe de pagina eruitziet; wat verandert is dat elke stap
die iets inlaadt of verwerkt nu een fout kan opleveren die je kunt doorsturen, in plaats van een
rode balk en een schouderophalen.

- **Een synchronisatie die op de achtergrond faalt, faalt niet meer stil.** De achtergrondtaak
  wordt door Chrome dertig seconden na een fout opgeruimd, dus een sync die om vier uur 's nachts
  misging liet *niets* achter. Nu zegt de pagina het: hoe vaak, en wat het was. *Draai je al weken
  en gaat er stil iets mis, dan is dit de versie waarin je dat ontdekt.*
- **Eén onbedienbare maand kost niet meer de hele synchronisatie.** DEGIRO weigert soms een
  periode, zelfs per maand. Dat gooide alles weg wat al opgehaald was; nu blijven de andere elf
  maanden staan en wordt het gat in rood benoemd, met datum en foutcode.
- **Opslagfouten zeggen welke fout het is.** Een volle schijf, een incognitovenster en een tweede
  tabblad zagen er allemaal identiek uit. Elk noemt nu de volgende stap.
- **De syncknop blijft niet meer hangen** `0.24.0`, en het foutrapport bevat nu ook wat de pagina
  en de achtergrondtaak zelf omvergooiden.
- **Rekeningen op een ander DEGIRO-cluster kregen bij elke sync een 502** `0.30.1` — een gecachet
  adres, dat nu elke keer opnieuw wordt opgehaald.

---

## Zet die frons op z’n kop

Een knop op het Overzicht die elk verliesgevend getal omdraait, er een vleiendere omschrijving bij
zet, de tegels op hun kop kantelt en er confetti overheen gooit. `0.39.0`

Er staat **NOT THE REAL NUMBERS** dwars overheen gestempeld, en dat is geen bijgeplakte
disclaimer — het is de reden dat de grap mag bestaan. Geloofwaardigheid is het gevaar, niet
onzin: een net omgedraaide grafiek is er één die iemand screenshot en naar z’n boekhouder stuurt.
Dit kan met niets verward worden. Hij verdwijnt zodra je naar een ander tabblad gaat, staat uit na
herladen, en niets erachter kan hem zien — niet de export, niet het foutrapport, geen enkel
opgeslagen getal.

## Wat het met je gegevens doet

- **Er is geen wachtwoord en geen API-sleutel.** De extensie leest de cookie die je eigen login al
  in de browser heeft gezet, per verzoek, en schrijft die nergens op — niet in de database, niet
  in de export. Geen cookie of een geweigerde sessie betekent "log in bij DEGIRO", en verder
  niets: opnieuw proberen na een geweigerde sessie lijkt op een inlogpoging, en die doet dit nooit.
- **Eén verzoek per 1,1 seconde**, met opzet, met één wachtrij. Daarom duurt de eerste
  synchronisatie een paar minuten.
- **De export declareert wat er mee mag**, niet wat eruit moet. Een lijst van wat je eruit moet
  halen vergeet altijd het veld dat je morgen toevoegt — en dat is hier één keer echt gebeurd.
- **Het foutrapport is veilig om overal te plakken**: codes, aantallen en verhoudingen, geen
  bedragen, geen namen van beleggingen, geen rekeningnummer. Foutteksten worden geschrobd waar ze
  worden opgeslagen, niet pas bij het versturen.
- **De volledige export is dat níet.** Je naam, rekeningnummer en token zijn eruit, maar er staat
  wel elke positie en elk bedrag in — dat is waar het bestand voor is. Stuur die alleen naar
  iemand die je vertrouwt.

---

## Wat het bewust niet doet

- **Inloggen. Nooit.** Geen wachtwoord, geen pincode, geen 2FA-code, geen opgeslagen
  inloggegevens. Wat niet bestaat kan niet gephisht of gelekt worden — en een verkeerde
  inlogpoging is precies het soort actie waar een broker een rekening op blokkeert in plaats van
  een foutmelding op teruggeeft.
- **Meerdere brokers.** De techniek eronder is er en wordt live gebruikt met één broker; Trade
  Republic staat geparkeerd.
- **Belastingaangifte.** "Dividend" hier is niet "dividend" op je aangifte, en dat staat onder de
  tabel in plaats van in een voetnoot.
- **Benchmarks** tegen een index.
- **De Chrome Web Store.** Persoonlijk gebruik, zelf installeren.

---

Wat de extensie *niet* kan en waar hij bekend onjuist is, staat in
[docs/LIMITATIONS.md](docs/LIMITATIONS.md) — de moeite waard vóór je een getal op het scherm
gelooft.
