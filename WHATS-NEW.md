# Wat er nieuw is — 0.52.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Voor 0.52.0 zelf niet** — maar kom je van een versie
> vóór 0.51.0, dan geldt de correctie uit die release nog steeds en is één keer **Wipe & resync**
> nodig: de geldmarktfonds-compensatie en het fondsverlies worden pas meegeteld nadat de regels
> opnieuw zijn ingelezen. Zie [CHANGELOG.md](CHANGELOG.md) onder 0.51.0.

---

## De export past nu door elk chatkanaal

De volledige export (knop **Export**) wordt voortaan **gecomprimeerd** gedownload en heet nu
duidelijk wat hij is:

```
degiro-portfolio-export-v0.52.0-2026-08-19.json.gz
```

- **15× kleiner**, gemeten op een echt account (1,8 MB → 116 kB). Ook een groot account met
  duizenden regels en honderd koersreeksen past daarmee onder de bijlagelimiet van Discord en
  vergelijkbare kanalen.
- **Er is niets uit weggelaten.** Elke rij, elk veld, elke koers zit erin — uitpakken (`gunzip`,
  of gewoon dubbelklikken) geeft byte-voor-byte het oude bestand. Diagnose heeft alles nodig, dus
  alles reist mee.
- **De naam zegt wat het is en welke versie hem maakte** — de export en het foutenrapport heetten
  tot nu toe hetzelfde, en dat heeft een dag debuggen aan het verkeerde bestand gekost.

Blijft gelden: dit bestand ís je volledige beleggingsgeschiedenis, met bedragen en namen van
fondsen. Stuur het alleen naar iemand die je vertrouwt, en liever niet onbeveiligd in een openbaar
kanaal.
