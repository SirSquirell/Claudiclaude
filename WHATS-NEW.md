# Wat er nieuw is — 0.57.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — dit is een geheugensteun, geen datawijziging.
> Kom je van een versie vóór 0.51.0, dan geldt de correctie uit die release nog wél: één keer
> **Wipe & resync**. Zie [CHANGELOG.md](CHANGELOG.md) onder 0.51.0. Kom je van vóór 0.54.0, dan is
> één gewone "Sync now" nodig voor de Today-tegel.

---

## Asteria staat nu op de DEGIRO-pagina zelf

Zodat je niet vergeet dat hij bestaat: bovenaan trader.degiro.nl staat voortaan een smalle donkere
strip met het Asteria-merkteken, één regel status, en **Open je analyse**. De strip duwt de pagina
een klein stukje omlaag en hangt dus nergens overheen — geen enkele DEGIRO-knop raakt bedekt.

De statusregel zegt gewoon hoe het ervoor staat: *"Je portefeuillegeschiedenis is bij"* als alles
klopt, het aantal dagen als de laatste sync ouder is dan drie dagen, en een foutmelding als de
laatste poging mislukte. Alleen in die laatste twee gevallen staat er ook een **Sync nu**-knop —
de rest van de tijd synct de extensie zichzelf al (elk uur, en zodra je een DEGIRO-tab opent), dus
dan is er niets om op te drukken.

Met het kruisje rechts is hij weg tot je de browser opnieuw start. De taal volgt je browser
(Nederlands of Engels). Heb je je account losgekoppeld, dan verschijnt er helemaal niets — dat was
de afspraak van het loskoppelen.

De strip leest niets van de DEGIRO-pagina; alles wat erop staat komt uit de extensie zelf, en er
verlaat niets je browser.

**Eén ding om even te melden als het misgaat:** dit is headless getest op een nagebouwde pagina,
nog niet op DEGIRO's echte ingelogde scherm. Zit DEGIRO's eigen menubalk vast bovenaan, dan kan de
strip erover(heen) vallen — zeg het als je dat ziet, dan passen we het aan op dat bewijs.
