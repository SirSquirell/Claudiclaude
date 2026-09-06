# Wat er nieuw is — 0.72.0

**Geen resync nodig.** Er verandert geen enkel berekend bedrag. Twee tegels zeggen meer, één kaart
toont twee cijfers tegelijk, en het fundament voor Plus en voor controleerbare releases zit erin.
Alleen deze release; de volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe
je met [INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.**

---

## Het zegel laat de twee bedragen zien die het vergeleek

Onder "Sluit tot op de cent" in de zijbalk staan nu de laatste waarde zoals Asteria die
reconstrueerde en het totaal dat DEGIRO zelf opgeeft. Ze horen gelijk te zijn; zijn ze dat niet,
dan staat het verschil er in rood bij. Verberg je bedragen, dan worden deze twee ook verborgen.

## Diepste daling zegt nu ook wanneer het weer goed kwam

De tegel eindigt met "hersteld 25 jun 2026, 499 dagen onder water" of met "nog niet hersteld, N
dagen en tellend". Gemeten op dezelfde curve zonder stortingen als de daling zelf, dus een storting
tijdens de daling telt niet als herstel. De daling zelf is exact wat hij was.

## Top 3 betalers, op het tabblad Dividenden

Welk deel van je reguliere brutodividend van de laatste twaalf maanden kwam van de drie grootste
betalers, met hun namen. Een hoog percentage betekent dat één verlaging een groot deel van je
inkomen raakt. Bijzondere uitkeringen tellen niet mee. Deze tegel vervangt de lege "Beta"-tegel.

## Rendement op jaarbasis: allebei tegelijk

"Mijn geld" en "De portefeuille" staan nu naast elkaar in plaats van achter een schakelaar, met het
verschil in punten per jaar en één zin over wat dat betekent: of je timing hielp of tegenwerkte.

## Een licentieveld voor Plus, nog zonder sleutel

Op het tabblad Plus kun je een licentiesleutel plakken. Die wordt in de extensie zelf gecontroleerd,
er gaat niets naar buiten, en de sleutel zit nooit in een export of bugrapport. Deze versie bevat nog
geen publieke sleutel, dus elke ingevoerde sleutel zegt "in voorbereiding". Er is nog niets te koop.

## Licentie op de code, en releases die je kunt controleren

De code staat onder Apache-2.0; de naam Asteria en het merkteken niet (TRADEMARK.md). Vanaf de
eerstvolgende getagde release komt de installatie-ZIP met een sha256 en een herkomstbewijs op de
GitHub Releases-pagina, en zegt de popup welke build je draait. INSTALL.md beschrijft de nieuwe route.
