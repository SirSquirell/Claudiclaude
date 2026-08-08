# Installeren in Chrome

Geen terminal nodig, geen Node, niks installeren. Vijf stappen, ongeveer twee minuten.

## 1. Download de map

Ga naar de repo op GitHub → groene knop **Code** → **Download ZIP**.

Pak het ZIP-bestand uit op een plek waar het mag blijven staan — bijvoorbeeld
`Documenten\degiro-portfolio`. **Niet in Downloads laten staan**: Chrome laadt de
extensie elke keer opnieuw vanaf die map, dus als je hem later opruimt werkt de
extensie niet meer.

Je hebt nu een map met daarin `manifest.json`. Die map heb je zo nodig.

## 2. Zet Chrome in ontwikkelaarsmodus

1. Open Chrome en ga naar `chrome://extensions`
2. Zet rechtsboven **Ontwikkelaarsmodus** aan

## 3. Laad de extensie

1. Klik linksboven op **Uitgepakte extensie laden**
2. Selecteer de map uit stap 1 (de map met `manifest.json` erin)

Er verschijnt nu een kaartje "DEGIRO Portfolio History". Klik op het puzzelstukje in
de werkbalk en zet de extensie vast (het speldje), dan blijft het icoontje zichtbaar.

## 4. Kijk eerst even rond, zonder DEGIRO

Klik op het icoontje → **Open full chart**. Je krijgt "No data yet" met daaronder een
link **Open the demo**. Daar zie je alle grafieken met verzonnen cijfers, zodat je
weet wat je krijgt voordat je hem op je eigen rekening loslaat.

## 5. Je eigen rekening

1. Open <https://trader.degiro.nl> in een tabblad en log in
2. Klik op het extensie-icoontje → **Sync**

De eerste keer haalt hij je hele geschiedenis op met **één verzoek per seconde**. Dat
is expres traag: DEGIRO's API is niet officieel en er snel doorheen rammen is een
risico voor je account. Reken op een paar minuten. Daarna is een dagelijkse sync nog
maar een handvol verzoeken.

Daarna: **Open full chart**.

---

## Als er iets misgaat

**"Je DEGIRO-sessie is verlopen"** — dat klopt dan ook. DEGIRO logt je na ongeveer een
half uur niets doen automatisch uit. Open een DEGIRO-tabblad, log in, sync opnieuw. De
extensie vraagt nooit om je wachtwoord en probeert nooit zelf in te loggen.

**Rode balk bovenaan** — de extensie vergelijkt zijn eigen berekende totaal met het
totaal dat DEGIRO zelf laat zien. Wijken die af, dan zegt hij dat, want dan klopt de
geschiedenis ook niet. Stuur me het bedrag dat erbij staat, daar kan ik uit afleiden
wat er misgaat.

**Niks werkt** — ga naar `chrome://extensions`, klik bij deze extensie op
**service worker**, en kopieer wat er in de console staat.

## Waar je data blijft

Op je eigen computer, in Chrome, en nergens anders. De extensie stuurt niets naar mij
of naar wie dan ook — hij praat alleen met DEGIRO, met de sessie die je browser al
heeft. Er wordt geen wachtwoord opgeslagen, want er wordt nooit om gevraagd.

Wil je alles weggooien: **Wipe & resync** op de hoofdpagina, of verwijder de extensie
in `chrome://extensions`.

## Voor wie het wil delen

Dit praat met een niet-officiële DEGIRO-API: alleen lezen, alleen je eigen gegevens,
vanuit je eigen ingelogde browser. Dat is de mildste vorm ervan, maar het is niet door
DEGIRO goedgekeurd en kan zonder waarschuwing stoppen met werken. Persoonlijk gebruik,
niet in de Chrome Web Store zetten.

Iedereen die hem installeert gebruikt zijn eigen DEGIRO-login — er is geen gedeelde
data en niemand ziet andermans portefeuille.
