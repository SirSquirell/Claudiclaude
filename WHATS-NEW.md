# Wat er nieuw is — 0.47.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** Er is geen opgeslagen gegeven veranderd en geen
> berekening aangepast — de rekenkern is in deze release niet aangeraakt. Wat er anders is, is hoe je
> de cijfers ziet, hoort en bereikt. Kom je van een véél oudere versie, druk dan één keer op
> **Wissen & opnieuw synchroniseren**: in eerdere releases zaten correcties die je opgeslagen cijfers
> wél raakten, en die staan per versie in [CHANGELOG.md](CHANGELOG.md).

---

## De extensie spreekt nu overal Nederlands

Dit is de grootste correctie van deze release, en hij zat op drie plekken tegelijk.

**De popup had geen enkele vertaling.** Koos je Nederlands, dan kreeg je een Nederlandse pagina en
een Engelse popup. Ook de voortgang tijdens het synchroniseren staat er nu in het Nederlands —
"Transacties ophalen…", "Koersen ophalen…".

**De grafieken ook niet.** Wijs een punt in een grafiek aan en er stond *Value*, *Day change*,
*Cumulative*, *Withholding tax*. Tweeëntwintig plekken, allemaal om.

**En de regel onder elk cijfer evenmin.** "as of today", "banked, from 3 closed positions", "still
riding on prices · all time" — Engels onder elk getal op een Nederlandse pagina.

De bevestiging bij **Wissen & opnieuw synchroniseren** vroeg ook in het Engels of je alles mocht
weggooien. Dat is de enige onomkeerbare knop in de extensie, dus die vraag hoor je te kunnen lezen.

## Elke grafiek vertelt nu wat hij laat zien

Dertien grafieken hadden geen naam, geen omschrijving en geen tabel. Wie een schermlezer gebruikt
kreeg **niets** — geen waarde, niet eens "een grafiek". Elke grafiek beschrijft zichzelf nu uit
dezelfde reeks die hij tekent: waar het begon, waar het eindigde, welke kant dat op is, en het hoogste
of laagste punt onderweg.

Bij de vier grafieken met bedragen staat er nu ook **Toon als tabel**: dezelfde cijfers als rijen. Een
tooltip vraagt om een muis en om hoveren, en dat heeft niet iedereen — en op een schermafbeelding
werkt hij helemaal niet.

Bij het resultaat per periode zegt de tabel er per regel bij of de koersen **gemeten** of **geschat**
waren.

## Grijp de grafiek

Slepen over de waardegrafiek volgt nu je vinger één op één, en wat er daarna gebeurt is nieuw. Laat je
los terwijl je nog beweegt, dan **gooit** de flick het venster verder dan waar je losliet. Sleep je
voorbij het begin of het eind van je historie, dan **veert** het tegen in plaats van dood te blokkeren.
Pak je de rand terug terwijl hij nog uitloopt, dan gaat hij verder vanaf waar hij op dat moment stáát.

Daar zat ook een echte fout in. De extensie besliste "was dat een klik of een sleep?" in **dagen** —
twee dagen. Op vijf jaar historie is dat minder dan een pixel, dus een trilling van je hand zoomde de
pagina in. Op een venster van drie weken is het bijna een centimeter, dus een bewuste sleep deed
niets. Dat is nu een afstand in pixels, zoals het hoort.

En op een touchscreen scrollde de pagina onder je vinger weg tijdens het slepen, waardoor je de helft
van je selectie kwijt was.

## De grafiek zegt wanneer een koers geschat is

Wijs een dag aan en je ziet de datum en het bedrag — dat was er al, en het is altijd een dag die
echt in de reeks zit, nooit een getal ertussenin. Wat er niet bij stond: of die dag **geen koers**
had en gewaardeerd is tegen de laatste koers waarop het instrument handelde. De positietabel zei dat
al met `est.`; de grafiek, waar je het getal daadwerkelijk leest, zei niets.

En het eind van de lijn heeft nu een stip met het bedrag erbij, dus daar hoef je niet meer voor te
hoveren.

## Delen: een kaart per cijfer, en leesbare kleine letters

Elk blok met cijfers heeft nu een **deelknop**. Je kiest daarna welk cijfer je deelt, en krijgt een
kaart zonder grafiek: het getal, waar het over gaat, en de herkomst eronder.

Op de positiekaart staat er nu ook **ingelegd tegenover gegroeid** bij — dezelfde balk als in de
tabel. Die bevat geen bedrag, alleen percentages, dus hij blijft staan als je bedragen verbergt.

En de gemelde fout: **de kleine letters op de kaart waren onleesbaar.** De kaart wordt getekend op
900 tot 1280 pixels breed en een chat toont hem op ongeveer 500 — dus de regel die zegt of de cijfers
kloppen kwam aan op zes pixels. Daaronder zat er nog een: die regel liep buiten de kaart en werd
afgekapt, precies op het woord dat er het meest toe deed. Bij een rekening die *niet* sluit stond er
`DOES NOT rec…`.

De kaart volgt nu ook je taal, in plaats van altijd Engels te zijn.

## De popup ziet eruit als de rest

Het merk bovenaan, één groot getal, drie kleinere eronder, de vorm van je laatste negentig dagen, en
één duidelijke knop. Het waren vier even grote tegels en twee even grote knoppen. En als een
synchronisatie een cijfer verandert, zie je dat nu — het wisselde eerst zonder iets te zeggen.

## Het scherm reageert

- **Een knop die je indrukt en waar je vanaf sleept** ziet er niet langer ingedrukt uit. Je klik was
  al afgebroken; alleen het knopje bleef aanstaan.
- **Menu's, de kolomkiezer en de vensters** komen nu uit de knop waarop je drukte, en gaan langs
  dezelfde weg weer weg.
- **Een melding duwt de pagina niet meer opzij.** Tijdens een synchronisatie sprong alles onder de
  melding twee keer weg, terwijl je naar je cijfers zat te kijken.
- **De themawissel is geen lichtknop meer**, maar een overgang van ruim een vijfde seconde.
- **Als je data binnenkomt**, verschijnt die per kaart in plaats van het hele scherm in één klap.
  Eén keer per synchronisatie — niet elke keer dat je op 3M drukt.
- **Een deelknop op een rij** stond op een telefoon voor altijd half doorzichtig, alsof hij uitstond.

## Als je "verminderde beweging" aan hebt staan

Die instelling deed hier te veel: hij zette *alle* overgangen uit, inclusief de kleurverandering die
je vertelt dát je knop reageerde. Nu stopt precies wat beweegt en blijft staan wat antwoordt.

De extensie luistert ook naar **verminderde transparantie** en **meer contrast**, wat hij daarvoor
helemaal niet deed.

## Kleinere correcties die je zou kunnen merken

- Een bedrag van 17 pixels stond gezet met de letterafstand van een kop, op elk scherm en in de hele
  popup.
- De grafiek met het opgetelde resultaat gaf een foutmelding op het tabblad Rendement en werd niet
  getekend.
- Bij een positie die vier keer haar inleg verloor liep de balk vier keer over de rand — je zag het
  niet, omdat de tabel hem afknipte.
