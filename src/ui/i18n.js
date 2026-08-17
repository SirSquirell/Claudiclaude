/**
 * Dutch, with English as the source language.
 *
 * The dictionary is keyed by **the English string itself**, not by an
 * identifier. That is deliberate and it is the whole design:
 *
 *  - a string with no translation renders in English rather than as
 *    `tiles.totalValue.label`, so a half-finished translation is readable
 *    rather than broken;
 *  - the English text stays visible in the code that uses it, so nobody has to
 *    open two files to find out what a screen says;
 *  - and there is no key to get wrong, because the key is the text.
 *
 * The cost is that editing an English string orphans its translation. That is
 * why `missing()` exists: **an untranslated string is counted, never hidden.**
 * A page that silently falls back looks finished and is not, and this project
 * has a rule about numbers that look more confident than they are — the same
 * argument applies to a translation.
 *
 * Numbers and dates are *not* translated. They are already `nl-NL` throughout,
 * because that is a locale for money rather than a language for prose: a Dutch
 * reader and an English reader looking at the same DEGIRO account should see
 * the same €&nbsp;1.234,56.
 */

const LANG_KEY = 'degiro-portfolio.lang';
export const LANGS = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },
];

/** Strings seen this session with no translation in the active language. */
const missingStrings = new Set();

export function getLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return LANGS.some((l) => l.code === v) ? v : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(code) {
  const value = LANGS.some((l) => l.code === code) ? code : 'en';
  try {
    localStorage.setItem(LANG_KEY, value);
  } catch {
    /* the in-memory choice still applies for this page */
  }
  missingStrings.clear();
  document.documentElement.lang = value;
  return value;
}

/** Which English strings had no translation. Reported, never swallowed. */
export const missing = () => [...missingStrings];

/**
 * Translate one string.
 *
 * `vars` interpolates `{name}` placeholders *after* lookup, so a translated
 * sentence can move them around — Dutch word order is not English word order,
 * and a translation that cannot reorder is a translation that reads like one.
 */
export function t(text, vars) {
  const lang = getLang();
  let out = text;
  if (lang !== 'en') {
    const table = DICT[lang];
    if (table && Object.hasOwn(table, text)) out = table[text];
    else missingStrings.add(text);
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

/**
 * Translate the static page: every element carrying `data-i18n` keeps its
 * English text as the key, so the HTML stays readable on its own and there is
 * no separate file to keep in step with it.
 */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (!el.dataset.en) el.dataset.en = el.textContent.trim().replace(/\s+/g, ' ');
    el.textContent = t(el.dataset.en);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    if (!el.dataset.enTitle) el.dataset.enTitle = el.getAttribute('title') ?? '';
    el.setAttribute('title', t(el.dataset.enTitle));
  }
}

// ---------------------------------------------------------------------------
// nl
// ---------------------------------------------------------------------------

/**
 * Deliberately not machine-ordered or alphabetised: grouped the way the screen
 * is, so a reviewer can check a section against the page instead of hunting.
 */
/** Exposed for the test that walks every entry. Nothing else reads it. */
export const __dictForTest = () => DICT;

const DICT = {
  nl: {
    // --- chrome ------------------------------------------------------------
    'Portfolio history': 'Portefeuillehistorie',
    'Sync now': 'Nu synchroniseren',
    Syncing: 'Bezig',
    'Check connection': 'Verbinding controleren',
    'Checking…': 'Bezig met controleren…',
    'Copy bug report': 'Foutrapport kopiëren',
    'Export JSON': 'JSON exporteren',
    'Wipe & resync': 'Wissen & opnieuw ophalen',
    // US-46 / US-47
    Anonymize: 'Anonimiseer',
    'Show amounts': 'Toon bedragen',
    'Copy image': 'Kopieer afbeelding',
    'Copy a shareable image of this position': 'Kopieer een deelbare afbeelding van deze positie',
    'Image copied. Paste it wherever you like.': 'Afbeelding gekopieerd. Plak hem waar je wilt.',
    'Could not reach the clipboard': 'Kon het klembord niet bereiken',
    Resyncing: 'Opnieuw ophalen',
    Theme: 'Thema',
    Auto: 'Auto',
    More: 'Meer',
    'All figures': 'Alle cijfers',
    'whole history': 'hele looptijd',
    'last month': 'laatste maand',
    'last 3 months': 'laatste 3 maanden',
    'last 6 months': 'laatste 6 maanden',
    'this year so far': 'dit jaar tot nu',
    'last year': 'afgelopen jaar',
    'Too short to draw: {n} data point(s) in this window. The source is one value per day, so pick a longer period.':
      'Te kort om te tekenen: {n} meetpunt(en) in dit venster. De bron is één waarde per dag, dus kies een langere periode.',
    Positions: 'Posities',
    'No positions match this filter.': 'Geen posities passen bij dit filter.',
    'Largest first': 'Grootste eerst',
    'Dividend (all time)': 'Dividend (hele looptijd)',
    'What this means': 'Wat dit betekent',
    'Hide amounts': 'Bedragen verbergen',
    'per {unit}': 'per {unit}',
    'Reconciles to the cent': 'Sluit tot op de cent',
    'DOES NOT reconcile': 'SLUIT NIET',
    '{pct}% measured': '{pct}% gemeten',
    'Not synced yet': 'Nog niet gesynchroniseerd',
    'Connection check · {broker}': 'Verbinding met {broker} controleren',
    'Check connection · {broker}': 'Verbinding met {broker} controleren',
    'Wipe & resync…': 'Wissen & opnieuw synchroniseren…',

    Light: 'Licht',
    Dark: 'Donker',
    Language: 'Taal',
    Range: 'Periode',
    'Results per': 'Resultaat per',
    Day: 'Dag',
    Week: 'Week',
    Month: 'Maand',
    'Include cash in the value chart': 'Cash meetellen in de waardegrafiek',
    Line: 'Lijn',
    Candles: 'Candles',
    Table: 'Tabel',
    Share: 'Aandeel',
    Show: 'Toon',
    Euro: 'Euro',
    'Return %': 'Rendement %',
    'Clear selection': 'Selectie wissen',
    'Copy report': 'Rapport kopiëren',
    Hide: 'Verbergen',

    // --- sections ----------------------------------------------------------
    Overview: 'Overzicht',
    Performance: 'Rendement',
    Composition: 'Samenstelling',
    'Income & cost': 'Inkomsten & kosten',
    Holdings: 'Posities',
    Notices: 'Meldingen',

    // --- tiles -------------------------------------------------------------
    'Total value': 'Totale waarde',
    'Money paid in': 'Ingelegd',
    Result: 'Resultaat',
    Today: 'Vandaag',
    'Dividend received': 'Ontvangen dividend',
    'Fees paid': 'Betaalde kosten',
    Interest: 'Rente',
    'Total cost': 'Totale kosten',
    Realised: 'Gerealiseerd',
    Unrealised: 'Ongerealiseerd',
    'Deepest fall': 'Diepste daling',
    'Months in profit': 'Maanden in de plus',
    'Best month': 'Beste maand',
    'Worst month': 'Slechtste maand',
    'Biggest winner': 'Grootste winnaar',
    'Biggest loser': 'Grootste verliezer',
    'Positions held': 'Posities',
    'Largest position': 'Grootste positie',
    Cash: 'Cash',
    'Data coverage': 'Datadekking',

    // --- card titles -------------------------------------------------------
    'Portfolio value including cash': 'Portefeuillewaarde inclusief cash',
    'Result per period': 'Resultaat per periode',
    'Cumulative result': 'Cumulatief resultaat',
    'What the portfolio is made of': 'Waaruit de portefeuille bestaat',
    'Money paid in vs what it is worth': 'Ingelegd tegenover wat het waard is',
    'Deposits and withdrawals per month': 'Stortingen en opnames per maand',
    'Month by month': 'Maand voor maand',
    'Compare months': 'Maanden vergelijken',
    'Dividend per month': 'Dividend per maand',
    'What moved, in this range': 'Wat er bewoog in deze periode',
    'Currency exposure': 'Valuta-exposure',
    'Uninvested cash over time': 'Niet-belegde cash door de tijd',
    'Profit and loss per product': 'Winst en verlies per product',
    Transactions: 'Transacties',
    'Connection check': 'Verbindingscontrole',

    // --- table headers -----------------------------------------------------
    Instrument: 'Instrument',
    Quantity: 'Aantal',
    Price: 'Koers',
    'Average paid': 'Gemiddeld betaald',
    Value: 'Waarde',
    'Paid in vs grown': 'Ingelegd vs gegroeid',
    Currency: 'Valuta',
    Product: 'Product',
    Type: 'Type',
    Status: 'Status',
    Bought: 'Gekocht',
    Sold: 'Verkocht',
    Dividend: 'Dividend',
    'Value now': 'Huidige waarde',
    '% of bought': '% van gekocht',
    Date: 'Datum',
    Amount: 'Bedrag',
    Buy: 'Koop',
    Sell: 'Verkoop',
    Open: 'Open',
    Closed: 'Gesloten',
    All: 'Alle',
    'Best first': 'Beste eerst',
    'Worst first': 'Slechtste eerst',
    'This range': 'Deze periode',
    Everything: 'Alles',
    Step: 'Stap',
    Detail: 'Detail',
    Years: 'Jaren',
    Total: 'Totaal',
    Average: 'Gemiddeld',
    Best: 'Beste',
    Worst: 'Slechtste',
    Positive: 'Positief',


    // --- the tile explanations, which are the honest half of every figure ---
    'Your positions at their closing prices plus cash, on the last day of the range. It is what the account was worth, not what you would receive: no selling costs and no tax are taken off.':
      'Je posities tegen hun slotkoers plus cash, op de laatste dag van de periode. Het is wat de rekening waard was, niet wat je zou ontvangen: er gaan geen verkoopkosten en geen belasting af.',
    'Deposits minus withdrawals — only money that crossed the boundary between you and the broker. Dividends, fees and interest are internal to the account and are not in here; they are part of the result instead.':
      'Stortingen min opnames — alleen geld dat de grens tussen jou en de broker overging. Dividend, kosten en rente zijn intern en zitten hier niet in; die horen bij het resultaat.',
    'What the account made, with deposits and withdrawals taken out, so paying money in never looks like a gain. The percentage chains the daily returns rather than dividing by the opening value, so a deposit landing mid-range does not flatter it.':
      'Wat de rekening opleverde, met stortingen en opnames eruit, zodat geld inleggen er nooit uitziet als winst. Het percentage schakelt de dagrendementen aaneen in plaats van te delen door de beginwaarde, zodat een storting midden in de periode het niet mooier maakt.',
    'The last day’s change, again with any deposit or withdrawal that day removed. On a weekend or a holiday there is no new closing price, so this is zero rather than missing.':
      'De verandering van de laatste dag, opnieuw zonder een storting of opname van die dag. In het weekend of op een feestdag is er geen nieuwe slotkoers, dus staat hier nul en niet niets.',
    'Cash that actually landed, net of the tax withheld at source. The withheld amount is stated separately because you may be able to reclaim part of it.':
      'Cash die daadwerkelijk binnenkwam, na inhouding van bronbelasting. Het ingehouden bedrag staat er apart bij, omdat je daar een deel van kunt terugvragen.',
    'The worst peak-to-trough fall in the range, measured on the curve with deposits and withdrawals removed. That matters: on portfolio value, the day you withdrew money would be reported as the worst market event of your life.':
      'De diepste val van top naar dal in deze periode, gemeten op de curve zonder stortingen en opnames. Dat is belangrijk: op portefeuillewaarde zou de dag dat je geld opnam gelden als de grootste crash van je leven.',
    'How many days were valued from a real closing price rather than from the last one known. An instrument DEGIRO has no chart for is held flat at the price it last traded at, so its movement in between is not real — this says how much of the history that affects.':
      'Hoeveel dagen zijn gewaardeerd op een echte slotkoers in plaats van op de laatst bekende. Een instrument waar DEGIRO geen grafiek van heeft blijft staan op de koers waarop het voor het laatst handelde, dus de beweging ertussenin is niet echt — dit zegt hoeveel van de historie dat raakt.',
    'The whole result of every position you no longer hold. Banked: it cannot change any more.':
      'Het volledige resultaat van elke positie die je niet meer hebt. Binnen: dit kan niet meer veranderen.',
    'What the positions you still hold have made so far. It moves with prices every day and is not yours until you sell.':
      'Wat de posities die je nog hebt tot nu toe hebben opgeleverd. Dit beweegt elke dag mee met de koersen en is pas van jou als je verkoopt.',
    'How many calendar months ended up, out of every full month in the history. Not the selected range.':
      'Hoeveel kalendermaanden in de plus eindigden, van alle volledige maanden in de historie. Niet de gekozen periode.',
    'As a percentage rather than in euros, because €500 on a small portfolio and €500 on a large one are not the same month. Whole history.':
      'Als percentage en niet in euro\'s, want € 500 op een kleine portefeuille en € 500 op een grote zijn niet dezelfde maand. Hele historie.',
    'The instrument that made the most over the selected range — per instrument, not per trade. A single sale has no result of its own: what it “made” depends on which purchase you match it against, and this project deliberately never picks between FIFO and average cost.':
      'Het instrument dat in deze periode het meeste opleverde — per instrument, niet per transactie. Eén verkoop heeft geen eigen resultaat: wat die \u201copleverde\u201d hangt af van tegen welke aankoop je hem wegstreept, en dit project kiest bewust niet tussen FIFO en gemiddelde kostprijs.',
    'The instrument that lost the most over the selected range — per instrument, not per trade, for the same reason as the winner: a sale’s profit depends on which purchase you match it against.':
      'Het instrument dat in deze periode het meeste verloor — per instrument, niet per transactie, om dezelfde reden als bij de winnaar: de winst op een verkoop hangt af van tegen welke aankoop je hem wegstreept.',
    'Instruments with a non-zero quantity today, against how many you have ever held. Options and other contracts count as one position each.':
      'Instrumenten met vandaag een aantal ongelijk aan nul, tegenover hoeveel je er ooit had. Opties en andere contracten tellen elk als één positie.',
    'The biggest single holding as a share of the total. Concentration, said plainly: a portfolio where one name is 60 % of the value behaves like that name, whatever the other rows suggest.':
      'De grootste losse positie als aandeel van het totaal. Concentratie, ronduit gezegd: een portefeuille waarin één naam 60 % van de waarde is, gedraagt zich als die naam, wat de andere regels ook suggereren.',
    'Uninvested cash, and how much of the total it is. It is in the value chart unless you switch it off with the checkbox.':
      'Niet-belegde cash, en hoeveel van het totaal dat is. Het zit in de waardegrafiek tenzij je het met het vinkje uitzet.',
    'Transaction and service costs only: courtage, connectivity, custody and third-party charges. It does not include what a margin balance costs you — that is Interest, and on a leveraged account it is usually the larger of the two.':
      'Alleen transactie- en servicekosten: courtage, aansluitingskosten, bewaarloon en kosten van derden. Wat een marginsaldo je kost zit er niet in — dat is Rente, en op een hefboomrekening is dat meestal de grootste van de twee.',
    'Credit and debit interest, including the financing cost of a margin (debit) balance. Negative means you paid it. Kept apart from Fees because a financing cost is not a fee.':
      'Credit- en debetrente, inclusief de financieringskosten van een marginsaldo. Negatief betekent dat jij betaalde. Staat los van Kosten, omdat financieringskosten geen kosten voor een dienst zijn.',
    'Fees, withheld dividend tax and interest paid, added together — what holding this account has cost you. Each is easy to ignore alone, which is the argument for the sum.':
      'Kosten, ingehouden dividendbelasting en betaalde rente bij elkaar — wat het aanhouden van deze rekening je heeft gekost. Elk is los makkelijk te negeren, en dat is juist het argument voor de som.',

    // --- annualised return ---------------------------------------------------
    'Annualised return': 'Rendement per jaar',
    'My money': 'Mijn geld',
    'The portfolio': 'De portefeuille',
    'What your money earned per year, given when you paid it in — an internal rate of return over your actual deposits and withdrawals.':
      'Wat jouw geld per jaar opleverde, gegeven wanneer je het inlegde — een intern rendement over je werkelijke stortingen en opnames.',
    'How the portfolio performed per year regardless of when you paid in — the daily-chained return, annualised. This is what a fund reports.':
      'Hoe de portefeuille per jaar presteerde, los van wanneer je inlegde — het dagelijks aaneengeschakelde rendement, omgerekend naar een jaar. Dit is wat een fonds rapporteert.',
    'Less than a year selected. Annualising three months of {pct} would report {year} a year, which is not a number anyone should act on — the period result is above.':
      'Minder dan een jaar geselecteerd. Drie maanden {pct} omrekenen naar een jaar geeft {year}, en daar moet niemand naar handelen — het resultaat over de periode staat hierboven.',
    'Your deposits and withdrawals cross zero more than once, so this rate has several mathematically valid answers and no way to choose between them. The portfolio figure beside it has only one.':
      'Je stortingen en opnames wisselen meer dan één keer van teken, dus dit percentage heeft meerdere wiskundig geldige antwoorden en geen manier om te kiezen. Het cijfer voor de portefeuille ernaast heeft er maar één.',
    'Over {years} years{name}.': 'Over {years} jaar{name}.',
    ', money-weighted': ', gewogen naar jouw geld',
    ', time-weighted': ', gewogen naar tijd',

    // --- year by year --------------------------------------------------------
    'Year by year': 'Jaar voor jaar',
    Year: 'Jaar',
    Opening: 'Beginwaarde',
    Closing: 'Eindwaarde',
    'Paid in': 'Ingelegd',
    'Taken out': 'Opgenomen',
    Return: 'Rendement',
    Costs: 'Kosten',
    Trades: 'Transacties',
    'from {date}': 'vanaf {date}',
    'Whole history, never the selected range. A year\u2019s return chains the daily returns, so a deposit inside it does not flatter the number.':
      'Hele historie, nooit de gekozen periode. Het rendement van een jaar schakelt de dagrendementen aaneen, zodat een storting binnen dat jaar het getal niet mooier maakt.',
    'Not a tax document. \u201cDividend\u201d is what was received after the tax DEGIRO withheld at source \u2014 not what you can reclaim \u2014 and this project holds no cost basis at all, deliberately, so the capital-gains figure a tax return asks for cannot be derived from anything here.':
      'Geen belastingdocument. \u201cDividend\u201d is wat er binnenkwam ná de belasting die DEGIRO aan de bron inhield \u2014 niet wat je kunt terugvragen \u2014 en dit project houdt bewust nergens een kostprijsbasis bij, dus het vermogenswinstcijfer dat een aangifte vraagt is hier nergens uit af te leiden.',

    // --- outlook -------------------------------------------------------------
    Outlook: 'Vooruitblik',
    'What this is, before the numbers': 'Wat dit is, vóór de getallen',
    Horizon: 'Horizon',
    'Monthly deposit': 'Maandelijkse inleg',
    Rates: 'Percentages',
    'Dividends put back to work': 'Dividend weer aan het werk',
    'Growth % a year': 'Groei % per jaar',
    'Dividend yield % a year': 'Dividendrendement % per jaar',
    '1 year': '1 jaar',
    '3 years': '3 jaar',
    '5 years': '5 jaar',
    'From your history': 'Uit jouw historie',
    'I set them': 'Zelf instellen',
    'What actually happened': 'Wat er werkelijk gebeurde',
    'Good market': 'Goede markt',
    'Expected market': 'Verwachte markt',
    'Bad market': 'Slechte markt',
    'Every other number in this extension is reconstructed from what actually happened and checked against DEGIRO\u2019s own total. This one is not: it is what would happen if the future resembled the past, which it does not have to. The three lines are scenarios, not a forecast, and none of them is a promise.':
      'Elk ander getal in deze extensie is gereconstrueerd uit wat er werkelijk gebeurde en getoetst aan DEGIRO\u2019s eigen totaal. Dit getal niet: dit is wat er zou gebeuren als de toekomst op het verleden lijkt, en dat hoeft niet. De drie lijnen zijn scenario\u2019s, geen voorspelling, en geen ervan is een belofte.',
    'Built from the {n} separate {years}-year stretches your own history actually contains \u2014 worst, middle and best of them. Overlapping stretches, so treat {n} as fewer independent observations than it looks.':
      'Gebouwd uit de {n} losse periodes van {years} jaar die jouw eigen historie werkelijk bevat \u2014 de slechtste, de middelste en de beste ervan. Die periodes overlappen, dus zie {n} als minder onafhankelijke waarnemingen dan het lijkt.',
    'Your history is too short to contain even three {years}-year stretches, so these are an example rather than a scenario drawn from your own past. Treat them as arithmetic on an assumed rate, not as something measured.':
      'Jouw historie is te kort om zelfs drie periodes van {years} jaar te bevatten, dus dit is een voorbeeld en geen scenario uit je eigen verleden. Zie het als rekenwerk op een aangenomen percentage, niet als iets gemetens.',
    'No dividends received yet, so nothing turns on whether they were put back to work.':
      'Nog geen dividend ontvangen, dus het maakt hier niets uit of het herbelegd werd.',
    'You hold {cash} in cash against {div} of dividend received, so at most {share}% of it can still be sitting uninvested \u2014 the rest demonstrably went somewhere. A ceiling rather than a measurement, so it only sets the default of the switch above.':
      'Je hebt {cash} aan cash tegenover {div} ontvangen dividend, dus hooguit {share}% daarvan kan nog stilstaan \u2014 de rest is aantoonbaar ergens heen gegaan. Een bovengrens en geen meting, dus het zet alleen de stand van de schakelaar hierboven.',

    // --- unreadable rows -------------------------------------------------------
    'DEGIRO sent rows this extension could not read': 'DEGIRO stuurde regels die deze extensie niet kon lezen',
    '{n} row(s) arrived in a shape the parser did not recognise and were left out: {reasons}. Everything above is missing them, so treat it as incomplete rather than wrong \u2014 and send the bug report, because this is what a renamed field looks like.':
      '{n} regel(s) kwamen binnen in een vorm die de parser niet herkende en zijn weggelaten: {reasons}. Alles hierboven mist ze, dus zie het als onvolledig in plaats van fout \u2014 en stuur het foutrapport, want dit is hoe een hernoemd veld eruitziet.',

    /**
     * Notice titles.
     *
     * Translated where they are displayed rather than where they are written,
     * because most of them come out of `NOTE_TITLES` in `app.js` keyed by an
     * engine warning code — and the engine is pure and stays that way, so it
     * cannot reach a dictionary. Display-time lookup means a title with no
     * entry renders in English and is counted, same as everything else.
     */
    'Demo data': 'Demodata',
    'These charts are built from generated fixtures with the same code path that runs against your real account — good for checking the UI, useless as financial information.':
      'Deze grafieken zijn gebouwd op gegenereerde testdata via exact dezelfde code die op je echte rekening draait — prima om de interface te bekijken, waardeloos als financiële informatie.',
    'Total matches DEGIRO': 'Totaal komt overeen met DEGIRO',
    'all gain \u2014 more came out than went in': 'puur winst \u2014 er kwam meer uit dan erin ging',
    '{paid}% paid in \u00b7 {grown}% grown': '{paid}% ingelegd \u00b7 {grown}% gegroeid',
    '{lost}% of what you paid in is gone': '{lost}% van je inleg is weg',
    'Put that frown upside down': 'Zet die frons op z\u2019n kop',
    'of what you paid in': 'van je inleg',
    'no base to compare against': 'geen basis om mee te vergelijken',
    'Total matches what DEGIRO reports': 'Totaal komt overeen met wat DEGIRO meldt',
    'No projection is drawn, because the growth rate measured from your history is {rate}% a year. That is not what a market does \u2014 it is what an account looks like when deposits and the trades they paid for are recorded a day apart, which distorts the early months. Set the rates yourself above to see a projection anyway.':
      'Er wordt geen prognose getekend, want het groeipercentage gemeten uit jouw historie is {rate}% per jaar. Dat doet een markt niet \u2014 zo ziet een rekening eruit als stortingen en de aankopen die ermee betaald zijn een dag uit elkaar geboekt staan, wat de eerste maanden vertekent. Stel de percentages hierboven zelf in om toch een prognose te zien.',
    'Reconstructed total is exactly {total}. DEGIRO sent no account total this sync, so this is checked against the sum of the position values and the cash balance it did send \u2014 an independent check, but one that cannot catch an error already in DEGIRO\u2019s own position values.':
      'Het gereconstrueerde totaal is precies {total}. DEGIRO gaf bij deze synchronisatie geen rekeningtotaal, dus dit is getoetst aan de som van de positiewaarden en het kassaldo die wél meekwamen \u2014 een onafhankelijke controle, maar \u00e9\u00e9n die een fout die al in DEGIRO\u2019s eigen positiewaarden zit niet kan opmerken.',
    'Reconstructed total is exactly {total}.': 'Het gereconstrueerde totaal is precies {total}.',
    'Total does not match DEGIRO': 'Totaal komt niet overeen met DEGIRO',
    'Reconstructed total is {ours} but DEGIRO reports {theirs} — off by {diff}. If today is wrong, the history is wrong too. Do not trust these charts until this is zero.':
      'Het gereconstrueerde totaal is {ours} maar DEGIRO meldt {theirs} — een verschil van {diff}. Als vandaag niet klopt, klopt de historie ook niet. Vertrouw deze grafieken niet tot dit nul is.',
    'Nothing to reconcile against': 'Niets om tegen af te stemmen',
    'DEGIRO did not report a current total this sync, so the one check that would confirm these numbers could not run. Press Sync now while logged in to DEGIRO.':
      'DEGIRO gaf bij deze synchronisatie geen actueel totaal, dus de enige controle die deze cijfers zou bevestigen kon niet draaien. Druk op Nu synchroniseren terwijl je bij DEGIRO ingelogd bent.',
    'It did send {n} other field(s) for the account total ({names}), so the total is probably there under a name this extension does not know yet — please send the bug report.':
      'Er kwamen wel {n} andere veld(en) mee voor het rekeningtotaal ({names}), dus het totaal zit er waarschijnlijk onder een naam die deze extensie nog niet kent — stuur alsjeblieft het foutrapport.',
    'A position disagrees with DEGIRO': 'Een positie wijkt af van DEGIRO',
    'Price history does not fit the trades': 'Koershistorie past niet bij de transacties',
    'Prices rescaled': 'Koersen herschaald',
    'Instruments with no price history': 'Instrumenten zonder koershistorie',
    'Possible share split': 'Mogelijke aandelensplitsing',
    'The reconstructed history looks wrong': 'De gereconstrueerde historie ziet er onjuist uit',
    'Cash movements nobody has classified': 'Kasmutaties die niemand heeft geclassificeerd',
    'Contract size could not be measured': 'Contractgrootte kon niet worden gemeten',
    'Contract size estimated, not measured': 'Contractgrootte geschat, niet gemeten',
    'Exchange rates derived from your own trades': 'Wisselkoersen afgeleid uit je eigen transacties',
    'An exchange rate is out of date': 'Een wisselkoers is verouderd',
    'A currency has no rate at all': 'Een valuta heeft helemaal geen koers',
    'Nothing to reconstruct yet': 'Nog niets om te reconstrueren',

    // --- windows DEGIRO would not serve --------------------------------------
    'Part of your history could not be fetched': 'Een deel van je historie kon niet worden opgehaald',
    'DEGIRO refused {n} date window(s) even one month at a time: {windows}. Those rows are missing from everything on this page. Press Sync now to try them again — this is usually temporary.':
      'DEGIRO weigerde {n} periode(s), zelfs per maand: {windows}. Die regels ontbreken in alles op deze pagina. Druk op Nu synchroniseren om het opnieuw te proberen — dit is meestal tijdelijk.',

    // --- failures nobody was watching ---------------------------------------
    'Something failed in the background': 'Er ging iets mis op de achtergrond',
    '{times} failure(s) happened while nothing was on screen, most often: {message} ({where}). The chart is built from whatever the last successful sync fetched, so it may be out of date rather than wrong. The bug report carries all of them.':
      '{times} fout(en) gebeurden terwijl er niets op het scherm stond, meestal: {message} ({where}). De grafiek is gebouwd op wat de laatste geslaagde synchronisatie ophaalde, dus hij kan verouderd zijn in plaats van fout. Het foutrapport bevat ze allemaal.',
    unknown: 'onbekend',

    // --- severities --------------------------------------------------------
    Error: 'Fout',
    Warning: 'Waarschuwing',
    Note: 'Melding',
    OK: 'OK',
    'Nothing to report.': 'Niets te melden.',
  },
};
