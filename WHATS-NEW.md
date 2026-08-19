# Wat er nieuw is — 0.54.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Eén gewone "Sync now" is genoeg** — geen wipe. Kom je
> van een versie vóór 0.51.0, dan geldt de correctie uit die release nog wél: één keer
> **Wipe & resync**. Zie [CHANGELOG.md](CHANGELOG.md) onder 0.51.0.

---

## De "Today"-tegel loog — hij zei -100% tegen iedereen met open posities

Gemeld door een tester ("mijn dag staat mijlenver ernaast") en op twee echte accounts tot op de
cent nagemeten: het veld waar DEGIRO's dagresultaat uit gelezen werd, is helemaal geen
dagresultaat — het is min-de-waarde-van-je-portefeuille aan het begin van de dag. Het echte
dagcijfer is waarde-nu plús dat veld, en zo wordt het nu gelezen. Na één "Sync now" toont de
tegel weer wat DEGIRO's eigen app toont. Had je geen open posities, dan heb je hier nooit iets
van gezien.

## De deelkaart kan niet meer "-212% op je inleg" zeggen bij een gewoon aandeel

Ook gemeld ("meer dan 100% kwijt van wat erin zit kan niet") en terecht: een kaart over één maand
deelde het maandverlies alleen door wat je díe maand had ingelegd, en vergat wat de positie al
waard was toen de maand begon. Dat telt nu mee als inzet. Dezelfde kaart uit de melding leest nu
**-20,22% "op wat erin zat"** — en de tekst zegt er eerlijk bij waar het percentage van genomen
is. Kaarten over de hele looptijd veranderen niet. Een geschreven optie kan nog steeds meer dan
100% verliezen, want daar is dat echt zo.
