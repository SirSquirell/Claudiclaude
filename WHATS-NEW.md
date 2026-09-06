# Wat er nieuw is — 0.70.4

**Geen resync nodig.** Er verandert geen enkel bedrag: deze release raakt alleen wat de extensie
toelaat en wat het bugrapport meeneemt. Alleen deze release; de volledige geschiedenis staat in
[CHANGELOG.md](CHANGELOG.md), installeren doe je met [INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** Zie [CHANGELOG.md](CHANGELOG.md) voor oudere
> resync-vragen.

---

## Een script op de DEGIRO-pagina kan de knoppen in de strip niet meer voor je indrukken

De strip bovenaan trader.degiro.nl heeft twee knoppen, Sync en Open. Een script op die pagina kon
ze programmatisch indrukken, en de Sync-knop mocht tot nu toe de dagelijkse begrenzing overslaan.
Dat kon dus een sync afdwingen op een moment dat jij niet koos. Nu tellen alleen echte klikken, en
alleen de extensie zelf (de popup en de app-pagina) mag een sync afdwingen. Druk je zelf op Sync in
de strip, dan merk je niets: is je geschiedenis vandaag al bijgewerkt, dan zegt de strip dat; is hij
dat niet, dan synct hij.

## De extensie is vanaf de DEGIRO-pagina niet meer te herkennen

Een pagina kon proberen één bestand van de extensie te laden en zo zien dat je Asteria hebt. Dat
adres wisselt nu per sessie, dus die vraag krijgt geen antwoord meer.

## Het bugrapport neemt minder mee

De diagnose stuurde de volledige browserstring mee en de vrije tekst van de laatste fout. Nu staat er
alleen nog het Chrome-versienummer in, en van de laatste fout de reden, de melding en het tijdstip.
Kopieer een bugrapport uit het menu Meer en lees het na: alles wat erin staat mag je zo doorsturen.

## Waar dit uit komt

Er is een red-team-review gedaan op de extensie en op het plan voor een betaalde laag; het verslag
staat in [docs/RED-TEAM.md](docs/RED-TEAM.md). Van de vijftien punten zijn de vier die vandaag konden
in deze release gefixt. Belangrijkste conclusie: er is geen weg gevonden waarlangs je gegevens de
machine verlaten, wel één waarlangs een pagina de extensie iets kon laten doen, en die is nu dicht.
