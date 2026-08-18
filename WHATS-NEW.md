# Wat er nieuw is — 0.48.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Eén keer, ja.** Druk één keer op **Nu synchroniseren**.
> Niet omdat er iets fout stond in je opgeslagen historie, maar omdat *Vandaag* nu het dagresultaat
> gebruikt dat DEGIRO zelf opgeeft, en dat veld is nooit eerder opgeslagen. Tot die ene synchronisatie
> valt *Vandaag* terug op de oude, gereconstrueerde waarde. Al je andere cijfers zijn ongewijzigd en
> worden zoals altijd opnieuw berekend uit de antwoorden die al op je computer staan.

---

## Verbinding verbreken, zonder je cijfers kwijt te raken

Nieuw in het **Meer**-menu: **Verbinding verbreken…**. Dat vergeet het rekeningnummer dat DEGIRO
teruggeeft, stopt met zelf synchroniseren op de achtergrond — en laat je hele historie staan, bevroren
zoals die er bij de laatste synchronisatie uitzag.

Drie dingen die het uitdrukkelijk *niet* doet:

- **Het verwijdert niets.** Geen transactie, geen geldstroom, geen koers. Elk getal wordt opnieuw
  berekend uit de ruwe antwoorden die al op schijf staan, en daarom kost bevriezen niets.
- **Het logt je niet uit bij DEGIRO**, en dat zou ook niet kunnen: deze extensie heeft je
  DEGIRO-sessie nooit vastgehouden. Ze leest per verzoek het koekje dat je browser zelf al heeft en
  slaat het nergens op. Wil je daar ook uitloggen, doe dat dan bij DEGIRO.
- **Het doet niet alsof de cijfers van vandaag zijn.** Bovenaan elk tabblad, in de zijbalk en in de
  popup staat dat de rekening losgekoppeld is en op welke datum de cijfers stilstaan. Ook het
  aansluitoordeel is nu gedateerd — en houdt zijn kleur: stond het in het rood, dan blijft het rood.
  Verbinding verbreken is geen manier om een niet-kloppend totaal weg te laten gaan.

Opnieuw verbinden is één keer **Nu synchroniseren**. Dat gedraagt zich precies als de eerste keer:
koekje lezen, aan DEGIRO vragen om welke rekening het gaat, verder. Er komt nergens een inlogformulier
bij — deze extensie vraagt nooit om een wachtwoord, pincode of code, en dat blijft zo.

Naast de knop staat een **i** die in drie zinnen uitlegt hoe het werkt, wat er vergeten wordt en wat
er blijft staan.

## De vormkiezer bij het delen liet drie van de vier vormen niet zien

Bij **Deel deze positie** stonden vier vormen in een venster dat er twee breed was, met niets op het
scherm dat verraadde dat de andere twee bestonden. Nu zie je er drie — **1:1 · 16:9 · 4:3** — met een
pijltje aan de kant waar er meer staat. **4:3** is nieuw, voor een dia of een document.

Er zaten vier fouten in tegelijk, en één maakte de knop bijna onbruikbaar:

1. **Op een vorm tikken selecteerde hem niet.** Alleen een *veeg* veranderde de vorm. Nu is tikken
   gewoon tikken.
2. **De gekozen vorm kon buiten beeld staan** als je het venster opendeed.
3. **De strook kon leeg getrokken worden**, en de laatste vorm schoof voorbij het einde.
4. **Een trilling van twee pixels gold als slepen**, waardoor een klik verdween.

Slepen verandert nu ook niets meer aan je kaart: slepen is kijken, klikken is kiezen. Aan de
geëxporteerde afbeelding zelf is niets veranderd — dezelfde tekening, dezelfde maten, één vorm meer.

## De gedeelde kaart en de tabelregel gaven verschillende getallen

Gemeld vanaf een screenshot: de tabelregel las **−€ 99,02 · −1,57 %**, de kaart die je uit die regel
deelde **+€ 175,50 · +2,79 %** — zelfde instrument, zelfde dag. Drie fouten, allemaal op posities die
je hebt verkocht:

- **De lijn van de kaart stopte een dag te vroeg**, precies op de dag van de verkoop. Dat is de dag
  waarop het verschil tussen de laatste slotkoers en de prijs waarvoor je écht verkocht wordt geboekt —
  bij deze positie het hele verschil van € 274,52, en de reden dat het teken omklapte.
- **Het percentage deelde door wat er nog ín zat** in plaats van door wat je erin gestopt hebt.
  Verkocht je de helft, dan liep het percentage op terwijl er niets gebeurde. Dat corrigeert ook de
  kolom **% van inleg**, die het resultaat van je gekozen periode deelde door je inleg over álle jaren.
- **Er werd een "inleg vs. gegroeid"-balk getekend bij posities die niet meer bestaan** — *"100% van
  je inleg is verdwenen"* bij een verkoop met 20 % verlies. Daar staat nu, net als in de tabel, een
  streepje.

**En de lijn op die kaart miste de dagen die er het meest toe deden.** Om een historie in 48 punten te
tekenen werd elke *n*-de dag genomen, dus je hoogste en je diepste dag haalden het alleen bij geluk:
gemeten over de tien posities van de demo verdween **5 % tot 14 %** van het bereik. Onzichtbaar ook,
want de lijn wordt op zijn eigen hoogte geschaald — je zag een net zo overtuigende, vlakkere vorm. De
kaart houdt nu per stukje de laagste en de hoogste dag, in de volgorde waarin ze gebeurden.

Hiervoor is **geen resync** nodig: dit zijn afgeleide cijfers.

## "Vandaag" is nu het dagresultaat van DEGIRO zelf

De tegel rekende de laatste dag zelf uit, uit dagelijkse slotkoersen — en die komen per instrument op
een ander moment binnen. Op zo'n dag telde *Vandaag* de beweging van de fondsen die al bijgewerkt
waren en **nul** voor de rest. Op de rekening van een tester las *Vandaag* **−0,58 %** terwijl DEGIRO
**−2,5 %** liet zien.

*Vandaag* gebruikt nu de som van de dagresultaten die DEGIRO per positie meestuurt, met de oude
berekening als terugval als dat veld er niet is. De uitleg achter de **i** zegt welke van de twee je
ziet. Hiervoor is die ene synchronisatie bovenaan deze pagina nodig.

## Als het totaal niet klopt, zegt de melding nu meer

Klopt je totaal niet met DEGIRO, dan stond er tot nu toe alleen *hoeveel* het verschil was. Er staat
nu ook **waartegen** er vergeleken is: tegen het rekeningtotaal dat DEGIRO zelf opgeeft, of — als
DEGIRO er geen meestuurde — tegen de som van de positiewaardes plus het kassaldo. Dat is niet
hetzelfde probleem: in het eerste geval zit het verschil in de administratie van deze extensie, in het
tweede kan de vergelijking zelf te laag zijn.

Het foutrapport is meegegroeid, en dat is de kern van deze wijziging: op een leeggehaalde rekening is
DEGIRO's totaal €0,00, en daar viel de maat van het verschil altijd weg — precies op de rekening die
klein genoeg is om met de hand na te lopen. Nu wordt het verschil afgezet tegen de omzet van je eigen
kasboek, en verdeeld over de kascategorieën, zodat een verschil dat exact gelijk is aan één categorie
zich meldt in plaats van een raadsel te blijven. **Er is geen enkel getal op je scherm door veranderd:
dit vindt de vijf cent, het lost ze niet op.**

## Kleinere dingen

- **De popup toonde "Canvas is already in use" in plaats van een nieuwe lijn** als je er een
  synchronisatie startte. De cijfers ernaast waren de nieuwe; alleen het plaatje was oud en de
  foutmelding stond in de weg.
- **Onder de transactietabel staat waarom er geen inleg-vs.-gegroeid bij een verkoopregel hoort** — de
  vraag is gesteld, het antwoord staat er nu, in het Nederlands.
- Het deelvenster hield zijn rechterkolom niet binnen zijn eigen breedte, waardoor knoppen aan de
  rand buiten het venster vielen. Op een telefoon was diezelfde vormkiezer daardoor onleesbaar klein.
