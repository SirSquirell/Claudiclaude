# Wat er nieuw is — 0.45.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** Er is geen getal veranderd — alleen hoe twee
> kolommen zijn opgeschreven. Kom je van een véél oudere versie, druk dan één keer op **Wipe &
> resync**: er zaten correcties in eerdere releases die je opgeslagen cijfers wél raakten, en die
> staan per versie in [CHANGELOG.md](CHANGELOG.md).

---

## Een koers in dollars stond er met een euroteken

Gemeld vanuit een echte rekening, naast DEGIRO's eigen regel: een order van **$ 3,105** stond bij
ons als **€ 3,11**, zonder dat er iets zei dat er niet omgerekend was.

**Er is nooit een getal fout geweest.** De omrekening gebeurt in de motor, met de koers die je eigen
transacties noemen, en het eurobedrag in dezelfde regel komt van DEGIRO zelf. Maar een goed getal
met het verkeerde teken erbij is niet te controleren: 900 × € 3,11 is € 2.799, en dat valt niet te
rijmen met de € 2.421,71 ernaast. Dan moet je aannemen dat één van de twee kolommen liegt.

De koers staat er nu in de munt waarin hij ook echt betaald is — `US$`, `£`, `CHF`. Weet de
extensie de munt niet, dan staat er **geen teken** bij in plaats van een gegokt euroteken.

## Twee verschillende orders leken dezelfde

Koersen werden op centen afgerond, dus `$ 3,105` en `$ 3,12` kwamen er allebei uit als `3,11`. Een
koers is geen bedrag: koersen hebben nu vier decimalen, bedragen nog steeds twee.

## De kolom *Bedrag* is de geldstroom

Een aankoop stond positief, terwijl er geld van je rekening ging. Nu staat hij negatief, zoals op je
afschrift van DEGIRO — met de transactiekosten erin, wat het kleine verschil met hun eigen regel
verklaart. Onder de tabel staat nu ook wat elke kolom betekent.
