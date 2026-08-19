# Wat er nieuw is — 0.49.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** Er verandert niets aan wat wordt opgehaald of
> opgeslagen. Kwam je van een versie vóór 0.48.0, dan geldt de ene synchronisatie uit die release
> nog steeds — druk dan één keer op **Nu synchroniseren**.

---

## De datums onder de cash-grafiek zijn weer leesbaar

De grafiek **Niet-belegd geld door de tijd** schreef zijn datums als ruwe `2026-08-19`-labels,
terwijl elke andere grafiek ze netjes opmaakt. Dat was de enige grafiek die het verkeerd deed;
hij doet het nu zoals de rest.

## En onder de motorkap

De berekening groepeert je transacties nu één keer per synchronisatie in plaats van de hele lijst
opnieuw door te lopen voor elk instrument. **Geen enkel cijfer verandert erdoor** — dezelfde rijen
worden bekeken, ze worden alleen sneller gevonden. Merkbaar wordt dit pas op rekeningen met veel
instrumenten en veel transacties tegelijk.
