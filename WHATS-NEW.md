# Wat er nieuw is — 0.59.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** De opgeslagen gegevens waren altijd al goed; de
> pagina rekent bij het openen opnieuw en de correctie staat er dan meteen. Kom je van een versie
> vóór 0.51.0, dan geldt de correctie uit die release nog wél: één keer **Wipe & resync**. Zie
> [CHANGELOG.md](CHANGELOG.md) onder 0.51.0. Kom je van vóór 0.54.0, dan is één gewone "Sync now"
> nodig voor de Today-tegel.

---

## Handel je in opties? Dan klopte je totaal niet — nu wel

Een optiecontract gaat over 100 aandelen (soms 10, soms een ander aantal). Bij een optie die in
euro's noteert wisselt er dus per contract 100× de premie van eigenaar, en precies die factor werd
door de extensie op twee plekken tegelijk toegepast: één keer als contractgrootte — terecht — en
één keer als "wisselkoers", omdat dezelfde verhouding tussen gehandeld en afgerekend bedrag er
voor de koersencontrole uitzag als een vreemde valuta.

Het gevolg, op het eerste account met veel euro-opties waarop dit zichtbaar werd: geschreven puts
telden 10× tot 100× te zwaar mee (en die staan negatief), het totaal lag ruim **€ 170.000 onder**
wat DEGIRO zelf rapporteerde, de grafiek dook diep in de min, en er stond een rode melding over
honderden "verkeerd afgerekende" transacties waar geen valuta aan te pas kwam.

Vanaf deze versie wordt de contractgrootte eerst uit de verhouding weggedeeld; alleen wat er dán
nog overblijft kan een wisselkoers zijn. Op dat account viel het verschil met DEGIRO daarmee terug
van −€ 171.601,63 naar −€ 239,83 — het restant is koersruis (een verouderde SEK-koers en opties
waarvoor DEGIRO geen koershistorie levert), en het totaalresultaat komt nu vrijwel exact uit op
DEGIRO's eigen "Totaal W/V". De onterechte rode melding is weg; de controle blijft gewoon werken
voor instrumenten die écht in de verkeerde valuta geboekt staan.

**Wat moet je doen?** Niets — de pagina openen is genoeg. Zie je daarna nog steeds een verschil
met DEGIRO in het rood, dan is dat een echt verschil: stuur het bugrapport in.
