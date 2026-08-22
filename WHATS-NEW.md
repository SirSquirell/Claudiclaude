# Wat er nieuw is — 0.61.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — alleen een nieuwe knop op de projectpagina, niets
> aan wat er wordt opgeslagen of opgehaald. Zie [CHANGELOG.md](CHANGELOG.md) voor oudere
> resync-vragen.

---

## De demoknop op asteria.prulwerk.nl werkt nu

De projectpagina had een knop die niets deed, want er was geen kant aan de extensie die
reageerde. Die is er nu: als je Asteria hebt geïnstalleerd, herkent de site dat en opent een klik
op de knop de demo met gegenereerde voorbeeldcijfers, in een nieuw tabblad, zonder je eigen
rekening aan te raken.

**Had je de extensie al vóór deze versie geïnstalleerd? Herlaad hem één keer.** Ga naar
`chrome://extensions`, en klik het herlaad-icoontje op de kaart van Asteria. Chrome kent een
unpacked extensie pas de nieuwe site toe nadat hij herladen is; zonder die stap blijft de knop op
de site zeggen dat hij niets vindt, ook al staat de extensie gewoon aan.

Geen nieuwe permissieprompt hierbij: de extensie is niet in de Chrome Web Store en wordt unpacked
geladen, dus er is geen review en geen prompt.
