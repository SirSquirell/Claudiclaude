# Wat er nieuw is — 0.60.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — alleen weergave; er verandert niets aan wat er
> wordt opgeslagen of opgehaald. Kom je van 0.58.0 of eerder en handel je in opties, dan zit de
> grote totaalcorrectie in 0.59.0 — ook zonder resync, gewoon de pagina openen. Kom je van vóór
> 0.51.0, dan geldt die correctie nog wél: één keer **Wipe & resync**. Zie
> [CHANGELOG.md](CHANGELOG.md).

---

## De kolomkoppen van de Posities-tabel leggen zichzelf uit

Waarom is "% of bought" +18,98 % terwijl dezelfde rij bij "paid in vs grown" 28 % gegroeid zegt?
Dat was een echte vraag, en het antwoord stond nergens op het scherm. Nu wel: ga met de muis op
een kolomkop staan (of geef hem toetsenbordfocus) en er verschijnt een toelichting die zegt wat
het getal is, waardoor het gedeeld wordt en over welke periode het gaat — hele historie of de
gekozen periode, want dát verschil was de verwarring.

Klikken sorteert nog steeds en slepen herordent nog steeds. Op een touchscreen is tikken al bezet
(dat sorteert), dus daar vind je dezelfde teksten in de **Kolommen**-kiezer — die toont nu ook de
vier vaste kolommen, aangevinkt en niet uitzetbaar, zodat juist hún uitleg niet alleen voor
muisgebruikers is.

Twee dingen die de teksten rechtzetten omdat ze makkelijk verkeerd te raden zijn: **Result is
alleen koersresultaat** (dividend heeft zijn eigen kolom en telt via de cash-regel mee in het
rekeningresultaat), en **Dividend is netto** — bruto min de ingehouden bronbelasting.

## Gesloten posities: wat kwam eruit tegenover wat erin ging

De kolom *Paid in vs grown* was bij gesloten posities altijd een streepje — terecht, want een
gesloten positie is niets meer waard, dus er valt niets te verdelen. Maar de zinvolle vraag is bij
een gesloten positie een andere, en die wordt nu beantwoord: **kreeg je meer terug dan je erin
stopte?** Elke gesloten rij toont een balk met de zin *"kreeg 92 % terug van wat erin ging"* (of
161 %) — gekocht tegenover verkocht plus dividend, over de hele looptijd van de positie.

De deelkaart van zo'n positie tekent dezelfde balk uit hetzelfde model, dus rij en kaart kunnen
elkaar niet tegenspreken. Open posities zijn tot op het cijfer onveranderd, en een positie waar
nooit geld in ging — een uitgeschreven optie die waardeloos afliep — houdt het streepje: een
percentage van nul is geen percentage.

## Sluiten zit nu rechtsboven

*"why is the close not on the right top"* — terechte vraag. Het deelvenster en de verbindingscheck
sluiten nu met een **✕ rechtsboven**, zoals de strip en de toast op de DEGIRO-pagina dat al deden.
De knoppenrij onderin houdt alleen nog acties over: *Kopieer afbeelding* en *Downloaden* in het
deelvenster, *Kopieer rapport* in de check. Escape en klikken naast het venster werken zoals
altijd — de ✕ is dezelfde uitgang op de plek waar je hem zoekt, ook met het toetsenbord, in beide
talen.
