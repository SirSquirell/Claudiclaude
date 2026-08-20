# Wat er nieuw is — 0.58.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — alleen weergave. Kom je van een versie vóór
> 0.51.0, dan geldt de correctie uit die release nog wél: één keer **Wipe & resync**. Zie
> [CHANGELOG.md](CHANGELOG.md) onder 0.51.0. Kom je van vóór 0.54.0, dan is één gewone "Sync now"
> nodig voor de Today-tegel.

---

## Naast de strip nu ook een toast op de DEGIRO-pagina

Sinds 0.57.0 staat er een smalle Asteria-strip bovenaan trader.degiro.nl; daar komt nu een
**toast** bij — een klein donker kaartje dat rechtsonder binnenschuift als de pagina laadt, met
dezelfde statusregel en dezelfde knoppen (**Open je analyse**, en **Sync nu** alleen als dat iets
toevoegt).

De toast ruimt zichzelf na een seconde of twaalf op, zodat er niet blijvend twee meldingen staan.
Ga je er met de muis op staan, dan blijft hij — een kaartje dat verdwijnt terwijl je het leest is
erger dan geen kaartje. Zijn kruisje werkt net als dat van de strip: weg tot de volgende
browserstart, en de twee staan los van elkaar — de toast wegklikken laat de strip staan, en
andersom.

Strip en toast lezen allebei uit dezelfde bron, dus ze kunnen elkaar niet tegenspreken; een sync
gestart vanuit de een werkt de regel in allebei bij. Een losgekoppeld account ziet nog steeds geen
van beide, en er verlaat nog steeds niets je browser.

De kanttekening van 0.57.0 blijft staan: dit is headless getest op een nagebouwde pagina, nog niet
op DEGIRO's echte ingelogde scherm — zie je de strip over DEGIRO's eigen menubalk vallen, meld het.
