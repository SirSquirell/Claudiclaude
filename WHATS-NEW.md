# Wat er nieuw is — 0.69.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — geen resync nodig. Er verandert niets aan je
> opgeslagen geschiedenis of aan enig bedrag. Deze versie gaat over wát de extensie naar buiten
> laat en wíe haar iets mag vragen. Zie [CHANGELOG.md](CHANGELOG.md) voor oudere resync-vragen.

---

## De extensie heet nu Asteria

Het kaartje op `chrome://extensions` heette nog "DEGIRO Portfolio History", terwijl elke pagina, de
handleiding en de site het al Asteria noemden. Dat is gelijkgetrokken. Er verandert verder niets
aan de installatie: het is dezelfde extensie, met een andere naam op het kaartje.

## Strenger over wie de extensie iets mag vragen

Asteria draait twee kleine scripts op andermans pagina's: de strip op trader.degiro.nl en de
demoknop op asteria.prulwerk.nl. Tot nu toe beantwoordde de achtergrondworker élk verzoek dat
hem bereikte, ook vanaf zo'n pagina. Vanaf nu:

- Een tabblad op trader.degiro.nl mag precies vier dingen vragen: de status voor de strip, een
  sync, het "de pagina is klaar"-signaal en "open Asteria". Wissen, exporteren, loskoppelen en de
  verbindingscheck kunnen alleen nog vanuit de eigen pagina's van de extensie.
- Een tabblad op asteria.prulwerk.nl mag alleen de demo openen.
- De strip krijgt niet langer je volledige status (met je posities) toegestuurd, maar alleen de
  vier gegevens waaruit zijn regel wordt bepaald: wanneer de laatste sync was, óf er een fout was,
  of hij bezig is, en of het account is losgekoppeld.

Je merkt hier niets van, en dat is de bedoeling.

## De demoknop pakt nooit je eigen cijfers van het scherm

Klikte je op de site op "Bekijk de demo" terwijl Asteria al openstond met je echte account, dan
werd dát tabblad naar de demo genavigeerd. Nu wordt alleen een tabblad hergebruikt dat al de demo
toont; anders komt er een nieuw tabblad bij.

## De verbindingscheck noemt geen omschrijvingen meer

De check die je in een bugmelding plakt, gaf tot nu toe de letterlijke omschrijving van
cashregels die de extensie niet herkende. Zo'n omschrijving noemt een fonds ("Dividend ASML").
Vanaf nu staat er alleen nog *hoeveel* regels niet herkend zijn; de tekst zelf staat in de
volledige export, die je alleen deelt met iemand die je vertrouwt.
