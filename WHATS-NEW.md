# Wat er nieuw is — 0.68.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — er verandert niets aan je opgeslagen
> geschiedenis of aan enig bedrag. Wat verandert is *het moment* waarop de extensie uit zichzelf
> gegevens ophaalt. Zie [CHANGELOG.md](CHANGELOG.md) voor oudere resync-vragen.

---

## De sync wacht nu tot je DEGIRO-scherm zelf klaar is

0.65.0 loste al op dat de extensie hooguit één keer per etmaal vanzelf synct. Wat bleef was het
*moment*: die ene sync begon zodra de DEGIRO-pagina haar eigen laadgebeurtenis afvuurde — en dat
is precies het ogenblik vlak vóórdat DEGIRO zelf een stortvloed aan verzoeken afvuurt om je
portefeuilleoverzicht te vullen. De extensie begon dus haar eigen (langzamere, met opzet
afgeremde) verzoeken op het slechtst denkbare moment, over dezelfde sessie.

Vanaf nu wacht de extensie tot je DEGIRO-tabblad zelf **stil** is — gemeten aan hoeveel verzoeken
de pagina nog doet, nooit aan wát ze opvragen — voordat ze zelf begint. Blijft de pagina continu
actief (bijvoorbeeld door live koersen), dan wacht de extensie niet voor altijd: na vijftien
seconden begint de sync alsnog, als vangnet.

Wat je hiervan merkt:

- Je DEGIRO-scherm heeft de extensie minder vaak als concurrent tijdens het laden.
- Er verandert niets aan hoe vaak er gesynct wordt (nog steeds hooguit één keer per etmaal
  vanzelf) — alleen aan het moment waarop die ene keer valt.
- Zelf op Sync drukken werkt zoals altijd, direct en nooit geweigerd.

Dit is een eerste, voorzichtige versie: de precieze getallen (hoe lang "stil" moet zijn, en de
vijftien seconden) zijn nog niet tegen een echt, ingelogd DEGIRO-scherm afgezet. Merk je dat je
scherm alsnog hapert bij het laden, laat het weten.
