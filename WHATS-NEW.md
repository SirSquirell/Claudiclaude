# Wat er nieuw is — 0.70.0

**Geen resync nodig.** Er verandert geen enkel bedrag in je geschiedenis: alles wat hieronder
staat wordt bij elke opening opnieuw uitgerekend uit de regels die de extensie al had. Alleen deze
release; de volledige geschiedenis staat in [CHANGELOG.md](CHANGELOG.md), installeren doe je met
[INSTALL.md](INSTALL.md).

> **Hoef je te resyncen voor deze versie? Nee.** Zie [CHANGELOG.md](CHANGELOG.md) voor oudere
> resync-vragen.

---

## Het tabblad Dividenden laat nu zien wat elke positie per aandeel uitkeerde

Tot nu toe stond er per positie alleen hoeveel euro er in totaal binnenkwam. Nu staat er ook wat
dat per aandeel was, en wat je daaruit kunt aflezen:

- **Rendement op kostprijs en huidig rendement**: het bruto dividend van de laatste twaalf maanden
  gedeeld door wat je aandelen kostten, en door wat ze nu waard zijn. Waar dat niet te zeggen is
  (positie gesloten, niets ontvangen, geen kostprijs) staat dát er, geen 0 %.
- **Ritme**: maandelijks, per kwartaal, halfjaarlijks of jaarlijks, afgelezen uit de tussenpozen
  tussen de uitkeringen, met hoeveel van die tussenpozen het ermee eens zijn. "Onregelmatig" is een
  antwoord, geen gok.
- **Staat van dienst**: hoeveel jaar achtereen er is uitgekeerd, hoe vaak verhoogd, hoe vaak
  verlaagd en wat de grootste verlaging was. Alleen binnen wat dít account heeft gezien: de teller
  begint toen jij de positie kocht, niet toen het bedrijf begon uit te keren. Feiten, geen score.
- **Volgende verwachte uitkering**: een schatting uit het betaalritme, met een marge. Het staat er
  ook zo bij; het is geen aangekondigde datum.

**Klik een rij open** en je ziet elke uitkering per aandeel: datum, bruto en belasting per aandeel,
of het een reguliere of een bijzondere uitkering was (en volgens welke regel), de verandering ten
opzichte van een jaar eerder, en het aantal aandelen waardoor is gedeeld. Stond er binnen dertig
dagen vóór de betaaldatum een transactie, dan staat daar een vlag bij: het aantal aandelen op de
betaaldatum is dan misschien niet het aantal dat de uitkering verdiende.

Regels die niet aan een aantal aandelen toe te rekenen zijn (bijvoorbeeld een dividend dat
binnenkwam nadat je de positie al had verkocht) staan onder de tabel onder **Niet toe te rekenen**,
met de reden en geteld. Ze zitten wel in elk totaal, maar niet in de kolommen.

## Een nieuwe tegel: Verwacht jaarinkomen

De reguliere uitkeringen per aandeel van de laatste twaalf maanden, maal de aandelen die je nu hebt.
Bijzondere uitkeringen tellen niet mee. De tegel zegt op hoeveel posities het cijfer rust ("5 van 7
posities"); een positie zonder herkenbaar ritme of met minder dan één volledige cyclus zit er niet
in, en in de opengeklapte rij staat waarom. De bestaande kaart met de groeiprojectie heet nu
**Inkomstenprojectie, uit gemeten groei**, zodat de twee niet voor hetzelfde getal kunnen worden
gehouden: de tegel neemt niets aan, de kaart rekent een gemeten groei door.

## Verhogingen, verlagingen en gestopte uitkeringen onder Meldingen

Per positie: de laatste verhoging of verlaging van de afgelopen twaalf maanden, met het percentage
per aandeel en de uitkering waarmee is vergeleken. Een verlaging is een waarschuwing, een verhoging
een notitie. Een uitkering die volgens haar ritme ruim te laat is, staat er ook als waarschuwing.
Achteraf afgelezen uit je eigen regels, niet aangekondigd.

## Een inkomensdoel op Vooruitblik

Vul een **doel per maand** in en de kaart laat zien waar het verwachte jaarinkomen staat (per maand,
als percentage van het doel, het tekort) en in welke maand het doel gehaald zou worden als de inleg
en het rendement die je op Vooruitblik al instelde doorlopen en de dividenden zelf blijven groeien.
Dat groeipercentage is vooraf ingevuld met wat je eigen account heeft gemeten (en staat er als
"gemeten" bij, met over welke posities en jaren); typ je er iets anders in, dan heet het "jouw
aanname". Elke aanname staat op de kaart. Het is rekenwerk, geen advies en geen voorspelling.

## Alles per aandeel is in EUR zoals het is afgewikkeld

Een cashregel van DEGIRO is het eurobedrag dat op je rekening kwam. Bij een buitenlandse betaler
beweegt het cijfer per aandeel daardoor mee met de wisselkoers, ook als het gedeclareerde dividend
niet veranderde. De extensie rekent niets terug; elke tabel en melding zegt "in EUR".
