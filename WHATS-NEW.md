# Wat er nieuw is — 0.64.0

Wat er verandert ten opzichte van de vorige versie, in gewone taal. Alleen deze release: de
volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee** — alles wordt berekend uit gegevens die er al
> staan, er wordt niets nieuws opgehaald. Zie [CHANGELOG.md](CHANGELOG.md) voor oudere
> resync-vragen.

---

## Een nieuw tabblad: Dividends

Een eigen tabblad, naast Income & cost, met alles over dividendinkomen dat met de gegevens van dit
account zelf te berekenen is:

- **Inkomen per positie** — een donut op aandeel in dividendinkomen, niet op aandeel in waarde. Dat
  is bewust een ander beeld dan het Composition-tabblad: een positie kan klein zijn qua waarde en
  toch een groot deel van het inkomen leveren, en andersom.
- **Inkomstenprognose** — een projectie van de zelf gemeten jaar-op-jaar groei van het
  dividendinkomen. Weigert een lijn te tekenen bij minder dan twee volledige kalenderjaren
  geschiedenis, en weigert ook als het gemeten percentage onwaarschijnlijk hoog uitvalt — liever
  niets tonen dan een artefact laten doorrekenen naar een absurde grafiek.
- **Posities, dividendweergave** — dit jaar en de hele looptijd per positie, met een klein
  staafje per jaar dat laat zien hoe consistent een positie heeft uitgekeerd. Puur de hoogte,
  nooit een oordeel als "verlaagd" — daar is geen betrouwbare drempel voor te bepalen.
- **Dividend safety** — staat er nog niet. De kaart legt uit waarom: een veiligheidsscore heeft
  gegevens nodig (payout ratio, schuldpositie, verlagingsgeschiedenis) die dit account niet heeft
  en die DEGIRO niet levert. Elke gratis bron die hiervoor is nagetrokken bleek óf betaald, óf te
  beperkt, óf (de aankomende EU-databank ESAP) pas vanaf medio 2027 publiek toegankelijk.

## Extra land bij bronbelasting

Ierland is toegevoegd aan de landenlijst bij de bronbelasting-tabel (15%, rechtstreeks nagetrokken
aan het belastingverdrag) — relevant omdat in Ierland geregistreerde ETF's zoals VWRL veel
voorkomen op DEGIRO.

## Klein: bronbelasting-tabel netter uitgelijnd

De kolomkoppen "Country" en "Note" stonden rechts uitgelijnd terwijl de invoervelden eronder links
beginnen, waardoor de koppen los leken te zweven boven niets. Nu links uitgelijnd, zoals de velden
zelf.
