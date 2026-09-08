# Wat er nieuw is — 0.74.1

**Geen resync nodig.** Er verandert geen enkel bedrag; één lek in *Bedragen verbergen* is dicht.
De volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md).

> **Hoef je te resyncen voor deze versie? Nee.**

---

## Verborgen bedragen stonden nog in de pagina

Als je op het oog drukte, werd elk bedrag netjes vervangen door `€ •••` — op het scherm. Maar het
echte bedrag bleef onzichtbaar in de pagina staan, als de "vertrekkende" tekst van de wisselanimatie,
tot de pagina opnieuw tekende. Wie alles selecteerde en kopieerde, of de pagina in devtools opende,
had de zes bedragen terug. Dat is nu weg: drukken op het oog vervangt de cijfers zonder
wisselanimatie, en er blijft niets achter. Gemeten in de browser, op een breed en een smal scherm.

De deelkaart was hier nooit door geraakt: die wordt getekend uit een vaste lijst velden, niet uit
de pagina.
