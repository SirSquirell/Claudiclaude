# Wat er nieuw is — 0.46.1

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Ja, één keer.** Druk na het updaten één keer op
> **Synchroniseer**. Het getal dat DEGIRO zelf voor "vandaag" berekent werd nooit opgeslagen, dus het
> verschijnt pas na die ene sync. Er verandert niets aan je opgeslagen historie en geen ander cijfer
> beweegt. Doe je het niet, dan blijft **Vandaag** het oude (verkeerde) getal tonen tot je synct.

---

## "Vandaag" klopte niet als niet alle koersen van vandaag al binnen waren

Dit is de gemelde fout. De tegel **Vandaag** liet de verandering van de laatste dag zien, gerekend
uit de historie: de waarde van vandaag min die van gisteren. Die historie is opgebouwd uit de
dagslotkoersen van vwd, en die komen **per aandeel op een ander moment binnen**. De ene koersfeed had
vandaag al een maandagkoers, de andere stond nog op de vrijdagkoers.

Op zo'n dag telde "Vandaag" dus wél de beweging mee van de paar aandelen die al bijgewerkt waren, en
**nul** voor de rest. Dat is geen dag van vandaag en ook geen nul — het is een half getal. Bij een
tester met 4 van de 12 Amerikaanse posities vers en 8 nog op de vrijdagkoers stond er **−0,58 %**
terwijl DEGIRO **−2,5 %** liet zien. (De rode balk die zegt dat het totaal niet tot op de cent sluit
zag ditzelfde verschil van € 845 al; de tegel niet.)

**Vandaag** gebruikt nu **het getal dat DEGIRO zelf berekent** — de dagwinst per positie die DEGIRO
in `/update` meestuurt, opgeteld. DEGIRO rekent dat tegen de live koers van élke positie, dus dat gat
zit er niet in. Het is precies wat je in DEGIRO zelf ziet. Het percentage is die dagwinst gedeeld door
de stand van gisteren.

Bij het cijfer staat vanaf wanneer het is (de laatste sync), en het `?` zegt erbij dat het nog kan
veranderen zolang de markt open is. Is dat live-getal er een keer niet, dan valt de tegel terug op de
oude berekening, en die staat op nul op een dag zonder handel.
