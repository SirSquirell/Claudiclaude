# Wat er nieuw is — 0.46.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** Er is geen opgeslagen gegeven veranderd en geen
> berekening aangepast — alles op de pagina wordt uit dezelfde ruwe antwoorden opnieuw gerekend als
> voorheen. Kom je van een véél oudere versie, druk dan één keer op **Wipe & resync**: er zaten
> correcties in eerdere releases die je opgeslagen cijfers wél raakten, en die staan per versie in
> [CHANGELOG.md](CHANGELOG.md).

---

## De hele interface is opnieuw gebouwd

Een balk aan de linkerkant in plaats van tabbladen bovenaan, zodat je altijd ziet waar je bent. Onder
in die balk staan de drie dingen die over je *gegevens* gaan in plaats van over je rendement: wanneer
er voor het laatst gesynchroniseerd is, of het sluit tot op de cent, en hoeveel van de historie
gemeten is. Die stonden eerst tussen de cijfers, waar "Dekking 100,0 %" net zo groot werd getoond als
je totale waarde.

Eén **Synchroniseer**-knop en één **Meer**-menu voor de rest. Elke sectie heeft nu één groot getal,
drie kleinere eronder, en een opklapper **Alle cijfers** met de rest. De uitleg bij een kaart zit
achter een `?` — dezelfde tekst, alleen niet meer altijd in beeld.

Niets is verdwenen. Elk chart, elke tabel en elke knop van de vorige versie is nog aanwezig of staat
met reden opgeschreven in `docs/RETIRED.md`, en er is een test die de bouw laat mislukken als dat niet
zo is.

## De periodekeuze rekent nu echt opnieuw

Dit is de belangrijkste correctie in deze release. **1M, 3M, 6M, YTD, 1J en ALL gaven eerder
dezelfde uitkomst**: de balk sneed een getal over de hele looptijd in stukken in plaats van het over
de gekozen periode uit te rekenen. Elke periode wordt nu doorgerekend, en de regel boven de cijfers
zegt in woorden én in exacte data welke periode je ziet.

Zet je 3M en zie je een ander resultaat dan vorige week bij 3M? Dan was het vorige getal het
verkeerde.

## Een grafiek die niet bij nul begint, zegt dat nu

Kies je 3M, dan begint de verticale as bijvoorbeeld bij € 102.000. Een gewoon kwartaal ziet er dan uit
als een verdubbeling. De grafiek mag inzoomen — anders zie je juist niks — maar er staat nu een regel
onder die zegt waar de as begint.

## Het oogje verbergt nu ook de bedragen langs de as

Met bedragen verborgen stond er in elke grafiek zeven keer `€ •••` langs de zijkant: verborgen, maar
luidruchtig, en het kostte ruimte die de lijn beter kon gebruiken. Die as is nu helemaal weg zolang je
bedragen verbergt. Percentages blijven staan — dat is precies waar de knop voor is.

**Aantallen stukken blijven wél verborgen.** 137 stuks van iets waarvan de koers openbaar is, ís de
waarde van die positie.

## Delen: vier formaten, en de lijn begint bij je aankoop

De knop bij een positie opent nu een venster met een voorbeeld dat je ziet veranderen: **1:1, 4:5,
9:16 of 16:9**, licht of donker, bedragen aan of uit, en een naam die je zelf kiest — geen naam, je
voornaam, de naam die DEGIRO bij de rekening heeft, of een naam die je zelf typt. Naast **kopiëren**
kun je nu ook **downloaden**, want het klembord werkt niet in elke browser en op de telefoon
eigenlijk nooit.

Bedragen staan hier standaard **uit**, ook als ze op de pagina wel zichtbaar zijn: dit plaatje gaat je
computer verlaten.

En de gemelde fout: de lijn begon bij het openen van je rekening in plaats van bij je aankoop, dus
tweederde van de kaart was een vlakke streep. Daaronder zat een ergere: het resultaat werd over de
gekozen periode gemeten en het ingelegde geld over de hele looptijd, dus **stond er een percentage op
de kaart dat bij geen van beide hoorde**. Beide zijn nu hetzelfde stuk tijd, en de datums op de kaart
zeggen welk stuk dat is.

## Optimism Mode tekent nu twee andere grafieken

Het knopje 🙃 zette eerst de waardegrafiek op zijn kop. Dat had een probleem dat er niet uit te
halen was: op de momenten dat je geld stórtte ging de lijn omláág, dus het plaatje klopte met niets.

Nu komen er twee grafieken in de plaats van de echte, die allebei waar zijn als je ze gewoon leest:

- **Geloof in {jouw positie}** — één punt voor elke dag dat je het vasthield terwijl het onder water
  stond, gewogen naar hoe diep. Gemeten in punten, dus onmiskenbaar geen euro's. Hij kan alleen maar
  stijgen, en hij gaat precies verticaal op het moment dat het hardst misgaat.
- **Wat {jouw positie} je nog schuldig is** — hoeveel je verdient zodra het terug is op wat je
  betaalde. Dit is letterlijk je verlies, met het teken omgedraaid door de *formulering* en niet door
  de rekenkunde.

Beide houden de stempel **NOT THE REAL NUMBERS** en de stortingenlijn is er terecht uit: die betekent
op deze twee niets.

## Een veld dat DEGIRO omdoopt geeft nu een rode melding

Dit is er een die je hopelijk nooit ziet. De extensie leest een handvol velden waar álles van afhangt
— aantal, koers, totaalbedrag, slotkoers. Doopt DEGIRO er één om, dan las de extensie dat tot nu toe
als **nul**, zonder iets te zeggen: elke grafiek stond er nog, alleen met verkeerde cijfers erin.

Ontbreekt zo'n veld nu op vrijwel elke regel, dan staat er een rode melding die het veld bij naam
noemt. Op een paar losse regels gebeurt er niks — dat is gewoon een lege regel, en een alarm dat
afgaat bij gezonde rekeningen is er een die niemand leest op de dag dat het wel telt.

Het foutrapport zegt er nu ook bij welke veldnaam het werk deed en op hoeveel procent van de regels.
Dat is geen bijzaak: de extensie kent per waarde meerdere mogelijke namen omdat niemand wist welke
DEGIRO stuurt. Met deze meting weten we het wel, en kunnen de gokken eruit.
