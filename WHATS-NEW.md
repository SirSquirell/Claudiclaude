# Wat er nieuw is — 0.51.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? JA — één keer "Wipe & resync".** Beide correcties
> hieronder werken op het moment dat de regels van DEGIRO worden ingelezen, en al opgeslagen
> regels houden hun oude betekenis tot je ze opnieuw ophaalt. Een gewone synchronisatie is niet
> genoeg.

---

## Het totaal klopt nu ook als je geld ooit in het geldmarktfonds zat

Twee fouten, die samen op een echt account precies **€ -0,05 verschil met DEGIRO** maakten —
de rode balk die er drie releases stond:

- **DEGIRO's geldmarktfonds-compensatie telde niet mee.** De regel *"DEGIRO Geldmarktfondsen
  Compensatie"* — DEGIRO dat terugbetaalt wat het fonds en de negatieve rente je kostten — werd
  aangezien voor een interne overboeking en dus genegeerd. Hij telt nu mee als opbrengst: geen
  storting (DEGIRO's eigen stortingsteller slaat hem ook over), wel geld op je rekening.
- **Het waardeverlies van het geldmarktfonds zelf was onzichtbaar.** Vóór de overstap naar flatex
  wás je cash fondsdeelnemingen, en die zakten langzaam in waarde. De conversieregels dragen geen
  bedrag — alleen aantallen en een koers ín de omschrijving. Die worden nu gelezen, en je saldo
  volgt de koers die het fonds zelf opgeeft. Blijven er deelnemingen "achter" die nooit verkocht
  zijn, dan zegt een melding dat, in plaats van er stil omheen te rekenen.

Op het account dat dit meldde: rente -0,05, compensatie +0,07, fondsverlies -0,02 — samen
**€ 0,00, tot op de cent gelijk aan DEGIRO**, nagerekend op de echte export. Het resultaatcijfer
sluit daarmee ook aan op DEGIRO's eigen stortingsteller.

Had jouw account vóór ~2022 cash bij DEGIRO, dan stond je geschiedenis tot nu toe een fractie te
hoog — meestal centen. Na de resync klopt hij, of de balk vertelt je precies in welke categorie
het resterende verschil zit: het foutenrapport zegt sinds deze versie per categorie ook hoeveel
regels helemaal geen bedrag droegen.
