# Wat er nieuw is — 0.55.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — er is niets veranderd aan wat wordt opgehaald,
> opgeslagen of getoond. Kom je van een versie vóór 0.51.0, dan geldt de correctie uit die release
> nog wél: één keer **Wipe & resync**. Zie [CHANGELOG.md](CHANGELOG.md) onder 0.51.0. Kom je van
> vóór 0.54.0, dan is één gewone "Sync now" nodig voor de Today-tegel.

---

## Een interne verfijning — je merkt er niets van

De rekenstap die straks meerdere brokers samenvoegt, zocht elke dag opnieuw op door een hele
kalender langs te lopen; dat doet hij nu in één keer via een opzoektabel. Geen enkel getal
verandert — de testsuite pint de uitkomsten vast op de cent, vóór en na — en omdat nog geen enkel
account een tweede broker heeft, draaide deze code sowieso nog nergens op echte data. Dit is
onderhoud aan de motor, geen wijziging aan het dashboard.
