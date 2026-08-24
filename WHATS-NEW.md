# Wat er nieuw is — 0.65.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — er verandert niets aan je opgeslagen
> geschiedenis of aan enig bedrag. Wat verandert is *hoe vaak* de extensie uit zichzelf gegevens
> ophaalt. Zie [CHANGELOG.md](CHANGELOG.md) voor oudere resync-vragen.

---

## De extensie synct nog hooguit één keer per etmaal vanzelf

Dit is een foutmelding van een lezer, met screenshot: zijn eigen DEGIRO-scherm bleef hangen op een
laadrondje terwijl de Asteria-strip bovenin "Bezig met syncen…" zei. De oorzaak is niet subtiel.
De extensie begon een sync **elke keer dat er een DEGIRO-tabblad laadde**, en een sync is
tientallen verzoeken van 1,1 seconde uit elkaar — over dezelfde sessie die je handelsscherm op dat
moment zelf gebruikt. Twee keer DEGIRO openen op een middag waren dus twee volledige syncs.

Vanaf nu stelt de extensie zichzelf een andere vraag: niet "heeft iemand net gesynct?" maar **"is
wat ik heb ouder dan een etmaal?"**. Deze extensie reconstrueert dagkoersen, dus twee keer syncen
op één dag kan geen dag opleveren die de eerste keer miste.

**Zelf op Sync drukken werkt precies als altijd** — in de popup, op de strip op de DEGIRO-pagina,
of in de analyse zelf. Een druk op de knop wordt nooit geweigerd. Wil je tussendoor de meest
actuele stand: druk op Sync.

Wat je hiervan merkt:

- Je DEGIRO-scherm heeft de extensie niet meer als concurrent tijdens het laden, op de ene keer
  per dag na.
- De strip zegt minder vaak "Bezig met syncen…", omdat er minder vaak iets te doen is.
- Je cijfers lopen hooguit een dag achter zonder dat je iets doet. Ouder dan drie dagen en de
  strip biedt je zelf een Sync-knop aan, net als voorheen.

## En: een mislukte sync begint niet meer telkens opnieuw

Aan de bovenstaande regel zat een gat dat het probleem juist kon verergeren. De extensie noteert
alleen een *geslaagde* sync, dus een account waarvan de sync steeds strandde zou nooit "bij" zijn
— en dus bij elke paginalading de hele geschiedenis opnieuw gaan ophalen, het zwaarste wat deze
extensie doet.

Een sync die daadwerkelijk aan het ophalen is begonnen en niet afmaakt, wordt nu een half uur met
rust gelaten voordat er vanzelf een nieuwe poging komt. Pogingen die stranden *voordat* er iets
naar DEGIRO ging — je bent niet ingelogd, of je sessie is verlopen — tellen niet mee: die kosten
niets, en de volgende keer dat je DEGIRO opent is juist het moment waarop het wél kan lukken.
Inloggen en meteen syncen blijft dus gewoon werken.

## Klein: het foutrapport zegt nu ook wanneer het geprobeerd is

In de verbindingscontrole en in de export staat naast "laatst gesynct" nu ook "laatst geprobeerd".
Met een dagregel lijken "hij synct niet" en "hij heeft vanochtend gesynct" anders precies op
elkaar in een bugreport. Allebei tijdstippen over je installatie, niet over jou.
