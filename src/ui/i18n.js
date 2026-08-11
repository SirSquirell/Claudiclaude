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
    Resyncing: 'Opnieuw ophalen',
    Theme: 'Thema',
    Auto: 'Auto',
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

    // --- severities --------------------------------------------------------
    Error: 'Fout',
    Warning: 'Waarschuwing',
    Note: 'Melding',
    OK: 'OK',
    'Nothing to report.': 'Niets te melden.',
  },
};
