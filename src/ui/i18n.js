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
  // Same contract for the accessible name (US-95): a ✕ drawn by CSS has no
  // text for [data-i18n] to translate, and an aria-label left in English on a
  // Dutch page is untranslated UI a sighted reviewer never sees.
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    if (!el.dataset.enAria) el.dataset.enAria = el.getAttribute('aria-label') ?? '';
    el.setAttribute('aria-label', t(el.dataset.enAria));
  }
  // US-106: a static header's hover explanation. Separate from `data-tip`
  // itself, which the runtime tooltip popover (app.js) reads as live
  // content — a table built dynamically writes translated text straight
  // into `data-tip`, but a header that never changes needs the same
  // cache-the-English-then-translate contract every other pass here uses.
  for (const el of root.querySelectorAll('[data-i18n-tip]')) {
    if (!el.dataset.enTip) el.dataset.enTip = el.getAttribute('data-i18n-tip') ?? '';
    el.setAttribute('data-tip', t(el.dataset.enTip));
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
    'Image copied. Paste it wherever you like.': 'Afbeelding gekopieerd. Plak hem waar je wilt.',
    'Could not reach the clipboard': 'Kon het klembord niet bereiken',
    Resyncing: 'Opnieuw ophalen',
    Theme: 'Thema',
    Auto: 'Auto',
    More: 'Meer',
    'All figures': 'Alle cijfers',
    'whole history': 'hele looptijd',
    'The vertical axis starts at {min}, not at zero — this window does not contain the start of the account, so the line is a close-up rather than the whole level.':
      'De verticale as begint op {min}, niet op nul — dit venster bevat het begin van de rekening niet, dus de lijn is een uitsnede en niet het hele niveau.',
    'The vertical axis does not start at zero — this window does not contain the start of the account, so the line is a close-up rather than the whole level.':
      'De verticale as begint niet op nul — dit venster bevat het begin van de rekening niet, dus de lijn is een uitsnede en niet het hele niveau.',
    // --- the share sheet (US-47, phase 7) ---
    'Share this position': 'Deel deze positie',
    Shape: 'Vorm',
    // US-78: the two chevrons beside the shapes. Navigation, not choice.
    'Earlier shapes': 'Eerdere vormen',
    'Later shapes': 'Latere vormen',
    Amounts: 'Bedragen',
    Light: 'Licht',
    Dark: 'Donker',
    Hidden: 'Verborgen',
    Shown: 'Zichtbaar',
    'Name on the card': 'Naam op de kaart',
    'First name': 'Voornaam',
    'Account name': 'Accountnaam',
    'A name I type': 'Een naam die ik zelf typ',
    'No name': 'Geen naam',
    'Discord name': 'Discord-naam',
    'This is the name DEGIRO has for the account, which may be your full name.':
      'Dit is de naam die DEGIRO bij de rekening heeft staan; dat kan je volledige naam zijn.',
    'This position is not inside the selected period.': 'Deze positie valt niet binnen de gekozen periode.',
    Close: 'Sluiten',
    'Close (Esc)': 'Sluiten (Esc)',
    Download: 'Downloaden',
    'Image saved.': 'Afbeelding opgeslagen.',
    'Could not export the image': 'De afbeelding kon niet worden geëxporteerd',
    // --- US-17: a renamed field ---
    'DEGIRO has stopped sending “{field}”': 'DEGIRO stuurt “{field}” niet meer',
    'Absent on {missed} of {rows} rows, and this extension reads it as zero — so every figure measured from it is wrong rather than missing. This is what a renamed field looks like. Send the bug report: it carries the names that used to work ({names}), which is what somebody needs to find the new one.':
      'Afwezig op {missed} van {rows} regels, en deze extensie leest dat als nul — dus elk getal dat eruit volgt is fout in plaats van afwezig. Zo ziet een hernoemd veld eruit. Stuur het foutrapport: daarin staan de namen die het wél deden ({names}), en dat is wat iemand nodig heeft om de nieuwe te vinden.',
    // --- Optimism Mode, US-35d ---
    'Belief in {prop}, over time': 'Geloof in {prop}, door de tijd',
    'One point for every day you held {prop} while it was under water, weighted by how far under. It has never gone down. Neither should you.':
      'Eén punt voor elke dag dat je {prop} vasthield terwijl het onder water stond, gewogen naar hoe diep. Het is nog nooit gedaald. Jij ook niet.',
    'What {prop} still owes you': 'Wat {prop} je nog schuldig is',
    'How much you make the moment {prop} returns to what you paid. This is the number that grows when things go badly, which is why it is the only chart worth looking at.':
      'Hoeveel je verdient op het moment dat {prop} terug is op wat je betaalde. Dit is het getal dat groeit als het slecht gaat, en daarom de enige grafiek die het bekijken waard is.',
    'Daily total, reconstructed from your trades, cash movements and daily closing prices. Triangles on the baseline mark days money went in (up) or out (down).':
      'Dagtotaal, gereconstrueerd uit je transacties, geldstromen en dagelijkse slotkoersen. Driehoekjes op de basislijn markeren dagen waarop geld in (omhoog) of uit (omlaag) de rekening ging.',
    'The gap between the two lines is growth — everything that is not your own deposits.':
      'Het verschil tussen de twee lijnen is groei — alles wat niet je eigen storting is.',
    'last month': 'laatste maand',
    'last 3 months': 'laatste 3 maanden',
    'last 6 months': 'laatste 6 maanden',
    'this year so far': 'dit jaar tot nu',
    'last year': 'afgelopen jaar',
    'Too short to draw: {n} data point(s) in this window. The source is one value per day, so pick a longer period.':
      'Te kort om te tekenen: {n} meetpunt(en) in dit venster. De bron is één waarde per dag, dus kies een langere periode.',
    Positions: 'Posities',
    'No positions match this filter.': 'Geen posities passen bij dit filter.',
    'Dividend (all time)': 'Dividend (hele looptijd)',
    'Bought (all time)': 'Gekocht (hele looptijd)',
    'Sold (all time)': 'Verkocht (hele looptijd)',
    Columns: 'Kolommen',
    Details: 'Details',
    'dividend, interest, fees and currency': 'dividend, rente, kosten en valuta',
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

    // --- the popup (US-60) -------------------------------------------------
    // It had none of these: every string in it was hardcoded English, so a
    // reader who chose Nederlands got a Dutch app and an English popup, and
    // `missing()` never counted them because they never reached `t()`.
    'Loading…': 'Bezig met laden…',
    'Open full chart': 'Open de volledige grafiek',
    Today: 'Vandaag',
    Week: 'Week',
    Month: 'Maand',
    'Syncing…': 'Bezig met synchroniseren…',
    'Sync failed.': 'Synchroniseren mislukt.',
    'Up to date.': 'Bijgewerkt.',
    'Still syncing — open the full chart to follow it.':
      'Nog bezig met synchroniseren — open de volledige grafiek om het te volgen.',
    'The last sync failed. Open DEGIRO and log in.':
      'De laatste synchronisatie is mislukt. Open DEGIRO en log in.',
    'No data yet — press Sync now while logged in to DEGIRO.':
      'Nog geen gegevens — druk op Nu synchroniseren terwijl je bij DEGIRO ingelogd bent.',
    'Synced at {time}': 'Gesynchroniseerd om {time}',

    // The worker's steps, keyed by phase rather than by its own sentence: two of
    // those interpolate a count, and a string with a number in it has as many
    // keys as the account has transactions. See `PHASES` in popup.js.
    'Checking your session…': 'Je sessie controleren…',
    'Reading your portfolio…': 'Je portefeuille lezen…',
    'Fetching transactions…': 'Transacties ophalen…',
    'Fetching cash movements…': 'Kasmutaties ophalen…',
    'Fetching product details…': 'Productgegevens ophalen…',
    'Fetching prices…': 'Koersen ophalen…',
    'Rebuilding the history…': 'De historie opnieuw opbouwen…',

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

    // --- US-106: withholding tax reclaimable vs. practically lost ------------
    'Withholding tax: reclaimable vs. practically lost': 'Bronbelasting: terugvorderbaar versus praktisch verloren',
    "The Netherlands' tax treaties cap withholding on an ordinary shareholding at 15% (0% for the United Kingdom) — a broker without automatic relief at source withholds the source country's own, usually higher, domestic rate, and the gap above the treaty ceiling is what can in principle be reclaimed. Country is read off the ISIN's own prefix, which is where a security is registered, not who withholds — a fallback, correct it below if it is wrong for a position.":
      'De belastingverdragen van Nederland begrenzen bronbelasting op een gewoon aandelenbelang op 15% (0% voor het Verenigd Koninkrijk) — een broker zonder automatische verdragstoepassing houdt het eigen, doorgaans hogere, binnenlandse tarief van het bronland in, en het verschil boven het verdragsplafond is wat in principe terug te vorderen is. Het land wordt afgelezen van het ISIN-voorvoegsel, waar een effect geregistreerd is, niet wie inhoudt — een aanname, corrigeer hem hieronder als hij fout is voor een positie.',
    'W-8BEN on file': 'W-8BEN aanwezig',
    'No W-8BEN': 'Geen W-8BEN',
    Position: 'Positie',
    Country: 'Land',
    Note: 'Notitie',
    Gross: 'Bruto',
    Withheld: 'Ingehouden',
    'Treaty rate': 'Verdragstarief',
    Reclaimable: 'Terugvorderbaar',
    'Practically lost': 'Praktisch verloren',
    Unknown: 'Onbekend',
    'Guessed from the ISIN prefix — correct it if wrong': 'Gegokt op basis van het ISIN-voorvoegsel — corrigeer indien onjuist',
    'Why this country': 'Waarom dit land',
    "A guess from the ISIN's own prefix — where the security is registered, not who withholds. Correct it if wrong.":
      'Een gok op basis van het ISIN-voorvoegsel — waar het effect geregistreerd is, niet wie inhoudt. Corrigeer indien onjuist.',
    'The dividend before any tax was withheld.': 'Het dividend voordat er belasting werd ingehouden.',
    'Tax actually withheld, as reported by the broker.': 'Daadwerkelijk ingehouden belasting, zoals gerapporteerd door de broker.',
    "The Netherlands' tax-treaty ceiling for this country.": 'Het verdragsplafond van Nederland voor dit land.',
    'What was withheld above the treaty ceiling — the part that could in principle be reclaimed.':
      'Wat er boven het verdragsplafond werd ingehouden — het deel dat in principe terug te vorderen is.',
    'What was withheld at or below the treaty ceiling.': 'Wat er op of onder het verdragsplafond werd ingehouden.',
    'No treaty rate on file for {n} position(s) — excluded from {total}. Not a tax document — this states a treaty ceiling, not a filed reclaim.':
      'Geen verdragstarief bekend voor {n} positie(s) — niet meegeteld in {total}. Geen belastingdocument — dit toont een verdragsplafond, geen ingediende teruggave.',
    'Total reclaimable across every position with a known country: {total}. Not a tax document — this states a treaty ceiling, not a filed reclaim.':
      'Totaal terugvorderbaar over alle posities met een bekend land: {total}. Geen belastingdocument — dit toont een verdragsplafond, geen ingediende teruggave.',

    // --- US-110: the Dividends tab --------------------------------------------
    'Income by position': 'Inkomen per positie',
    'Share of dividend income received, not share of value — the gap between the two is where concentration hides. The seven largest positions by income, the rest folded into "Other".':
      'Aandeel in ontvangen dividendinkomen, niet aandeel in waarde — het verschil tussen de twee is waar concentratie zich verbergt. De zeven grootste posities op inkomen, de rest samengevoegd in "Overig".',
    'Income forecast': 'Inkomstenprognose',
    'Holdings, dividend view': 'Posities, dividendweergave',
    'A dividend-scoped column set, not the general Positions table. Consistency is the same per-year total as a small sparkline — the fastest way to see a year that paid less than the one before it, which a single lifetime total hides.':
      'Een op dividend toegespitste kolomset, niet de algemene Posities-tabel. Consistentie toont hetzelfde totaal per jaar als een klein lijngrafiekje — de snelste manier om een jaar te zien dat minder opleverde dan het jaar ervoor, wat één totaal over de hele looptijd verbergt.',
    'This year': 'Dit jaar',
    'All time': 'Hele looptijd',
    Consistency: 'Consistentie',
    'Dividend safety': 'Dividendveiligheid',
    'Not built. A safety score needs payout ratio, net debt/EBITDA and dividend-cut history per holding — data this account does not have and DEGIRO does not provide. Every free EU fundamentals source checked so far is either paid, too shallow, or (ESAP) not publicly reachable until mid-2027. Shown here only once a real source exists — see docs/prototypes/dividend-safety-buckets.html for what the design looks like against invented numbers.':
      'Niet gebouwd. Een veiligheidsscore heeft de payout ratio, netto schuld/EBITDA en dividendverlagingsgeschiedenis per positie nodig — data die dit account niet heeft en die DEGIRO niet levert. Elke gratis EU-fundamentelebron die tot nu toe is nagetrokken is óf betaald, óf te dun, óf (ESAP) pas medio 2027 publiek bereikbaar. Dit komt pas hier te staan zodra er een echte bron bestaat — zie docs/prototypes/dividend-safety-buckets.html voor hoe het ontwerp eruitziet tegen verzonnen cijfers.',
    'Too little history': 'Te weinig geschiedenis',
    'needs a longer trailing window': 'heeft een langer voortschrijdend venster nodig',
    'trailing 12 months, income ÷ average value': 'voortschrijdende 12 maanden, inkomen ÷ gemiddelde waarde',
    'Needs US-98': 'Vereist US-98',
    'a benchmark price series is not built yet': 'een benchmark-prijsreeks is nog niet gebouwd',
    Other: 'Overig',
    'Needs at least two complete calendar years of dividend history to measure a growth rate — refuses rather than guessing one.':
      'Heeft minstens twee volledige kalenderjaren dividendgeschiedenis nodig om een groeipercentage te meten — weigert liever dan er een te gokken.',
    'The measured year-over-year rate ({rate}%/yr) is too extreme to project — likely one of the two complete years having far too little dividend history of its own, not a real trend. No projection is drawn rather than compounding an artifact.':
      'Het gemeten jaar-op-jaar-percentage ({rate}%/jr) is te extreem om te projecteren — vermoedelijk had een van de twee volledige jaren zelf veel te weinig dividendgeschiedenis, geen echte trend. Er wordt geen prognose getekend in plaats van een artefact te laten doorcomponeren.',
    "Projects this account's own measured {rate}%/yr income growth forward — dashed years are beyond what the account's own history can support.":
      'Projecteert de zelf gemeten inkomstengroei van {rate}%/jr van dit account naar voren — gestippelde jaren gaan verder dan de eigen geschiedenis van het account kan onderbouwen.',
    'Dividend income per year': 'Dividendinkomen per jaar',
    'Then a projection, not history: {v} by {when}.': 'Daarna een projectie, geen geschiedenis: {v} in {when}.',
    Received: 'Ontvangen',
    Projected: 'Geprojecteerd',

    // --- US-121 … US-127: the per-share dividend layer -------------------------
    'A dividend-scoped column set, not the general Positions table. Consistency is the same per-year total as a small sparkline — the fastest way to see a year that paid less than the one before it, which a single lifetime total hides. Open a row for every payment per share.':
      'Een op dividend toegespitste kolomset, niet de algemene Posities-tabel. Consistentie toont hetzelfde totaal per jaar als een klein lijngrafiekje — de snelste manier om een jaar te zien dat minder opleverde dan het jaar ervoor, wat één totaal over de hele looptijd verbergt. Open een rij voor elke uitkering per aandeel.',
    'Yield on cost': 'Rendement op kostprijs',
    'Current yield': 'Huidig rendement',
    Rhythm: 'Ritme',
    'Track record': 'Staat van dienst',
    'Next expected': 'Volgende verwachte uitkering',
    'Gross dividend received in the twelve months to the last day, specials included, divided by what the shares held today cost at the average buy price. In EUR.':
      'Bruto ontvangen dividend in de twaalf maanden tot de laatste dag, inclusief bijzondere uitkeringen, gedeeld door wat de nu gehouden aandelen kostten tegen de gemiddelde aankoopprijs. In EUR.',
    "The same twelve months of gross dividend divided by today's value of the position. In EUR.":
      'Dezelfde twaalf maanden bruto dividend gedeeld door de huidige waarde van de positie. In EUR.',
    'Read from the gaps between regular payments: monthly, quarterly, semi-annual or annual, with the share of gaps that agree. Irregular is an answer, not a guess.':
      'Afgelezen uit de tussenpozen tussen reguliere uitkeringen: maandelijks, per kwartaal, halfjaarlijks of jaarlijks, met het aandeel tussenpozen dat overeenstemt. Onregelmatig is een antwoord, geen gok.',
    "Years paid without a gap, raises and cuts against the payment a year earlier, and the largest cut — within this account's own history only, in EUR per share. Facts, not a score.":
      'Jaren zonder onderbreking uitgekeerd, verhogingen en verlagingen ten opzichte van de uitkering een jaar eerder, en de grootste verlaging — alleen binnen de eigen geschiedenis van dit account, in EUR per aandeel. Feiten, geen score.',
    'Estimate, from the payment rhythm: the last regular payment plus one interval, with a window of ±15 % of the interval either side. Not an announced date.':
      'Schatting uit het betaalritme: de laatste reguliere uitkering plus één interval, met een marge van ±15 % van het interval aan weerszijden. Geen aangekondigde datum.',
    'Per-share figures, yields and changes are in EUR as settled — a foreign payer’s figure moves with the exchange rate even when the declared dividend did not. Yields are gross received in the twelve months to {today}, over cost and over value. The track record is bounded by this account’s own history: it starts when the position was first held, not when the company first paid. The next expected payment is an estimate from the payment rhythm, never an announced date.':
      'Bedragen per aandeel, rendementen en veranderingen zijn in EUR zoals afgewikkeld — het cijfer van een buitenlandse betaler beweegt mee met de wisselkoers, ook als het gedeclareerde dividend niet veranderde. Rendementen zijn bruto ontvangen in de twaalf maanden tot {today}, over kostprijs en over waarde. De staat van dienst is begrensd door de eigen geschiedenis van dit account: zij begint toen de positie voor het eerst werd gehouden, niet toen het bedrijf voor het eerst uitkeerde. De volgende verwachte uitkering is een schatting uit het betaalritme, nooit een aangekondigde datum.',
    // rhythm words and reasons
    monthly: 'maandelijks',
    quarterly: 'per kwartaal',
    'semi-annual': 'halfjaarlijks',
    annual: 'jaarlijks',
    irregular: 'onregelmatig',
    'fewer than three regular payments': 'minder dan drie reguliere uitkeringen',
    'the typical gap fits no rhythm': 'de gebruikelijke tussenpoos past in geen ritme',
    'the gaps disagree': 'de tussenpozen stemmen niet overeen',
    '{pct}% of gaps agree': '{pct}% van de tussenpozen stemt overeen',
    'no rhythm detected: {why}': 'geen ritme gevonden: {why}',
    'no rhythm': 'geen ritme',
    'no regular payments': 'geen reguliere uitkeringen',
    'no per-share figure': 'geen cijfer per aandeel',
    // yields
    'position closed': 'positie gesloten',
    'no payments in the window': 'geen uitkeringen in het venster',
    'no cost basis': 'geen kostprijsbasis',
    'no current value': 'geen huidige waarde',
    'Received, 12 months': 'Ontvangen, 12 maanden',
    'incl. {n} special': 'incl. {n} bijzondere',
    'Cost of shares held': 'Kostprijs gehouden aandelen',
    'Value today': 'Waarde vandaag',
    // track record
    '{years} yr paid': '{years} jr uitgekeerd',
    '{raises} raised · {cuts} cut': '{raises} verhoogd · {cuts} verlaagd',
    'largest cut {pct}': 'grootste verlaging {pct}',
    'Years paid': 'Jaren uitgekeerd',
    'held from {date}': 'gehouden sinds {date}',
    'Growth per year': 'Groei per jaar',
    'fewer than two complete years held': 'minder dan twee volledige jaren gehouden',
    'first complete year paid nothing': 'eerste volledige jaar keerde niets uit',
    'regular payments per share, {from}–{to}, complete years only': 'reguliere uitkeringen per aandeel, {from}–{to}, alleen volledige jaren',
    // next expected
    'not seen yet': 'nog niet gezien',
    'stopped: expected by {by}': 'gestopt: verwacht vóór {by}',
    'estimate, from the payment rhythm: last regular payment {last} plus {days} days, ±{margin}':
      'geschat uit het betaalritme: laatste reguliere uitkering {last} plus {days} dagen, ±{margin}',
    // forward income, per position
    'Expected annual income': 'Verwacht jaarinkomen',
    '{n} × {per} per share · {k} of {m} regular payments since {from}': '{n} × {per} per aandeel · {k} van {m} reguliere uitkeringen sinds {from}',
    '{n} of {m} regular payments since {from}': '{n} van {m} reguliere uitkeringen sinds {from}',
    'stopped: last payment {last}, the next was expected by {by}': 'gestopt: laatste uitkering {last}, de volgende werd verwacht vóór {by}',
    'Kept out of it': 'Buiten gelaten',
    'no special payments in the window': 'geen bijzondere uitkeringen in het venster',
    'special by amount': 'bijzonder op bedrag',
    'special, off-rhythm': 'bijzonder, buiten het ritme',
    'not determined': 'niet vastgesteld',
    // the payment list
    'tax only': 'alleen belasting',
    special: 'bijzonder',
    regular: 'regulier',
    '{dev} from the median of {n} earlier payments': '{dev} ten opzichte van de mediaan van {n} eerdere uitkeringen',
    'inside the cycle': 'binnen de cyclus',
    'by default: fewer than {n} earlier payments to compare': 'standaard: minder dan {n} eerdere uitkeringen om mee te vergelijken',
    'not compared': 'niet vergeleken',
    new: 'nieuw',
    unchanged: 'ongewijzigd',
    'no payment 11–13 months earlier': 'geen uitkering 11–13 maanden eerder',
    'vs {date}': 't.o.v. {date}',
    'Gross / share': 'Bruto / aandeel',
    'Tax / share': 'Belasting / aandeel',
    Label: 'Label',
    'vs a year earlier': 't.o.v. een jaar eerder',
    Shares: 'Aandelen',
    'A trade within {n} days before the pay-date: the share count on the pay-date may not be the count that earned the payment.':
      'Een transactie binnen {n} dagen vóór de betaaldatum: het aantal aandelen op de betaaldatum is misschien niet het aantal dat de uitkering verdiende.',
    'trade within {n} days': 'transactie binnen {n} dagen',
    'No payment of this position could be divided by a share count — see “Not attributable” below.':
      'Geen enkele uitkering van deze positie kon door een aantal aandelen worden gedeeld — zie “Niet toe te rekenen” hieronder.',
    'In EUR per share, from the euro amount that settled over the shares held on the pay-date. Labels are trailing only: a later payment never relabels an earlier one.':
      'In EUR per aandeel, uit het afgewikkelde eurobedrag gedeeld door de aandelen die op de betaaldatum werden gehouden. Labels kijken alleen terug: een latere uitkering herlabelt nooit een eerdere.',
    // not attributable
    'Not attributable: {n} row(s), {total}': 'Niet toe te rekenen: {n} regel(s), {total}',
    'These dividend rows are in every total on this page but could not be turned into a per-share figure, so they are in none of the columns above. Each says why.':
      'Deze dividendregels zitten in elk totaal op deze pagina, maar konden niet in een cijfer per aandeel worden omgezet, dus staan ze in geen van de kolommen hierboven. Elke regel zegt waarom.',
    Kind: 'Soort',
    Why: 'Waarom',
    'no product': 'geen product',
    'withholding tax': 'bronbelasting',
    dividend: 'dividend',
    'no shares held on the pay-date': 'geen aandelen gehouden op de betaaldatum',
    'the row names no product': 'de regel noemt geen product',
    'the amount is not positive (a reversal)': 'het bedrag is niet positief (een terugboeking)',

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
    'DEGIRO’s own result so far today on the positions you hold, taken from the last sync — so it matches the figure in DEGIRO itself. If the market is still open it can still move before the close. When that live figure is not available it falls back to the last day’s reconstructed change, which is zero on a day with no trading.':
      'Het resultaat dat DEGIRO zelf tot nu toe voor vandaag berekent op je posities, van de laatste sync — dus gelijk aan het getal in DEGIRO zelf. Als de markt nog open is, kan het voor de slotkoers nog veranderen. Is dat live-getal er niet, dan valt het terug op de gereconstrueerde verandering van de laatste dag, en die is nul op een dag zonder handel.',
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

    // --- the closed position's flow bar (US-94) --------------------------------
    'got back {pct}% of what went in':
      'kreeg {pct}% terug van wat erin ging',

    // --- the column-header explanations (US-93), same discipline one table on ---
    'Name and symbol, with the colour this position keeps in every chart. The arrow opens the columns hidden at this width.':
      'Naam en symbool, met de kleur die deze positie in elke grafiek houdt. Het pijltje opent de kolommen die op deze breedte verborgen zijn.',
    'Units held today. Options and other contracts count contracts, not the shares they cover.':
      'Aantal stuks vandaag. Opties en andere contracten tellen contracten, niet de aandelen die ze dekken.',
    'What one unit is worth today: the position’s value divided by the units held, in euros.':
      'Wat één stuk vandaag waard is: de waarde van de positie gedeeld door het aantal stuks, in euro’s.',
    'Every euro that ever went into buying this position, fees included — all time, whatever range is selected.':
      'Elke euro die ooit in het kopen van deze positie ging, inclusief kosten — over de hele historie, welke periode je ook kiest.',
    'Every euro selling ever returned, after fees — all time, whatever range is selected.':
      'Elke euro die verkopen ooit opleverde, na kosten — over de hele historie, welke periode je ook kiest.',
    'Bought (all time) divided by the units bought. Not the running cost of what remains after sales — this project deliberately picks no cost-basis convention.':
      'Gekocht (all time) gedeeld door het aantal gekochte stuks. Niet de lopende kostprijs van wat er na verkopen over is — dit project kiest bewust geen kostprijsconventie.',
    'What the position is worth today — units held times the last known price, in euros. It does not follow the selected range.':
      'Wat de positie vandaag waard is — aantal stuks maal de laatst bekende koers, in euro’s. Dit volgt de gekozen periode niet.',
    'Splits what the position is worth today into the part that is money you put in and the part it made. Its “paid in” is net: every sale takes money back out. A different question from “% of bought”, whose denominator is gross and follows the selected range.':
      'Verdeelt wat de positie vandaag waard is in het deel dat jouw inleg is en het deel dat hij verdiende. De “inleg” is hier netto: elke verkoop haalt er geld uit. Een andere vraag dan “% of bought”, waarvan de noemer bruto is en de gekozen periode volgt.',
    'Price result over the selected range: how the value moved, minus what you put in or took out. Dividend is not in here — it has its own column, and reaches the account result through the cash row.':
      'Koersresultaat over de gekozen periode: hoe de waarde bewoog, min wat je erin stopte of eruit haalde. Dividend zit hier niet in — dat heeft zijn eigen kolom en telt via de cash-regel mee in het rekeningresultaat.',
    'Dividend that actually landed from this instrument, net — gross minus the tax withheld at source. All time, whatever range is selected.':
      'Dividend dat daadwerkelijk binnenkwam uit dit instrument, netto — bruto min de ingehouden bronbelasting. Over de hele historie, welke periode je ook kiest.',
    'The Result over the selected range, divided by every euro that went in during that same range — gross, so sales do not shrink the denominator. A different question from “Paid in vs grown”, which splits today’s value and whose “paid in” is net.':
      'Het Resultaat over de gekozen periode, gedeeld door elke euro die er in diezelfde periode in ging — bruto, dus verkopen verkleinen de noemer niet. Een andere vraag dan “Paid in vs grown”, dat de waarde van vandaag verdeelt en waarvan de “inleg” netto is.',
    'This position’s value as a share of today’s whole account — positions plus cash.':
      'De waarde van deze positie als aandeel van de hele rekening vandaag — posities plus cash.',
    'The currency the instrument trades in; foreign values are converted at rates learned from your own conversions and trades. “est.” marks an instrument with no price history, held at the last price it traded at.':
      'De valuta waarin het instrument handelt; vreemde valuta worden omgerekend tegen koersen geleerd uit je eigen wissels en transacties. “est.” markeert een instrument zonder koershistorie, dat blijft staan op de laatst betaalde koers.',

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

    // --- US-99: price return vs. total return ---------------------------------
    'Price return vs. total return': 'Koersrendement versus totaalrendement',
    "How much of this period's result was the price moving, and how much was dividends landing — two answers, shown together, because neither one alone is the whole question.":
      'Hoeveel van het resultaat in deze periode kwam door koersbeweging, en hoeveel door binnengekomen dividend — twee antwoorden, samen getoond, want geen van beide alleen is de hele vraag.',
    'Total return': 'Totaalrendement',
    'Price return': 'Koersrendement',
    'Less than a month selected — a single dividend could swing the split past what the period actually earned. The measured total return is above; pick a longer period for the split.':
      'Minder dan een maand geselecteerd — één dividend kan de opsplitsing verder laten uitslaan dan wat de periode werkelijk opleverde. Het gemeten totaalrendement staat hierboven; kies een langere periode voor de opsplitsing.',
    'Dividend yield: {v}, over {period}.': 'Dividendrendement: {v}, over {period}.',

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
    '{lost}% of what was in it is gone': '{lost}% van wat erin zat is weg',
    'on what was in it': 'op wat erin zat',
    'Put that frown upside down': 'Zet die frons op z\u2019n kop',
    'of what you paid in': 'van je inleg',

    // --- the shareable card (US-47, US-52) ---------------------------------
    // The card follows the reader's language like everything else. It carried
    // English while the page around it was Dutch, which only became visible when
    // US-52 put a translated sentence on it and the card went half-and-half.
    'all gain': 'puur winst',
    'more has come out than went in': 'er kwam meer uit dan erin ging',
    'on the money put in': 'op je inleg',
    "{name}'s position": 'de positie van {name}',
    'shared by {name}': 'gedeeld door {name}',
    'reconciled to the cent': 'sluit tot op de cent',
    'not checked against the broker': 'niet gecontroleerd bij de broker',

    // US-54 — the score card
    'Share this figure': 'Deel dit cijfer',
    'Share a figure from this section': 'Deel een cijfer uit dit blok',
    'Which figure': 'Welk cijfer',
    // US-53's decision, and the transactions hint it sits in
    'Newest first. {n} shown': 'Nieuwste eerst. {n} getoond',
    'Newest first. {n} shown of {total} in range': 'Nieuwste eerst. {n} getoond van {total} in de periode',
    '{n} in the whole history.': '{n} in de hele historie.',
    'Price is in the instrument’s own currency; Amount is what moved in {ccy}, fees included.':
      'Koers staat in de eigen valuta van het instrument; Bedrag is wat er in {ccy} bewoog, kosten inbegrepen.',
    'Paid in vs grown belongs to a position, not to one sale — splitting a single sale into capital and profit needs a cost-basis convention this project does not use. It is on Positions, per instrument.':
      'Ingelegd tegenover gegroeid hoort bij een positie, niet bij één verkoop — één verkoop splitsen in inleg en winst vraagt een kostprijsconventie die dit project niet gebruikt. Je vindt het bij Posities, per instrument.',
    // US-71's table twin
    'Show as a table': 'Toon als tabel',
    'Show as a chart': 'Toon als grafiek',
    Period: 'Periode',
    'Added up': 'Opgeteld',
    Prices: 'Koersen',
    estimated: 'geschat',
    measured: 'gemeten',
    'In and out': 'Erin en eruit',
    Month: 'Maand',

    // --- US-71: what a chart says to someone who cannot see it -------------
    // These are `aria-label` sentences, so they are read aloud rather than
    // looked at. They follow the reader's language for the same reason
    // everything else does — arguably more, since there is nothing on screen
    // beside them to fall back on.
    'Value of the positions': 'Waarde van de posities',
    'Portfolio value including cash': 'Portefeuillewaarde inclusief kas',
    'Result, added up': 'Resultaat, opgeteld',
    'Result per period': 'Resultaat per periode',
    'Result per period, open to close': 'Resultaat per periode, open tot slot',
    'Money in and out': 'Geld erin en eruit',
    'What moved': 'Wat bewoog',
    'Currency exposure': 'Valuta-exposure',
    'Uninvested cash over time': 'Niet-belegde kas door de tijd',
    'Dividend per month': 'Dividend per maand',
    'The same month, year on year': 'Dezelfde maand, jaar op jaar',
    'The last 90 days, ending higher than it started.': 'De laatste 90 dagen, hoger geëindigd dan begonnen.',
    'The last 90 days, ending lower than it started.': 'De laatste 90 dagen, lager geëindigd dan begonnen.',
    'The last 90 days, ending where it started.': 'De laatste 90 dagen, geëindigd waar het begon.',
    'The last 90 days: not enough data to draw a shape.':
      'De laatste 90 dagen: te weinig gegevens om een vorm te tekenen.',
    'Then three scenarios, not history: {bad}, {expected}, {good} at {when}.':
      'Daarna drie scenario\'s, geen historie: {bad}, {expected}, {good} op {when}.',
    'Belief, NOT THE REAL NUMBERS': 'Geloof, NIET DE ECHTE CIJFERS',
    'What it still owes you, NOT THE REAL NUMBERS': 'Wat het je nog schuldig is, NIET DE ECHTE CIJFERS',

    // --- the tile notes (US-60's gap, one surface further in) ---------------
    // Never translated, and `missing()` never counted them because they never
    // reached `t()`. Surfaced when US-54's score card became the first thing to
    // put a note through the dictionary and `as of today` appeared in the count.
    'all time': 'hele looptijd',
    today: 'vandaag',
    'as of {when}': 'per {when}',
    'deposits minus withdrawals, to {when}': 'stortingen min opnames, tot {when}',
    'This week {v}': 'Deze week {v}',
    '{v} withheld · all time': '{v} ingehouden · hele looptijd',
    'transaction and service costs · all time': 'transactie- en servicekosten · hele looptijd',
    'margin and cash interest · all time': 'margin- en kasrente · hele looptijd',
    'fees, withheld tax and interest paid · all time': 'kosten, ingehouden belasting en betaalde rente · hele looptijd',
    'banked, from {n} closed positions': 'gerealiseerd, uit {n} gesloten posities',
    'still riding on prices · all time': 'nog afhankelijk van koersen · hele looptijd',
    '{n} instrument ever held': '{n} instrument ooit gehouden',
    '{n} instruments ever held': '{n} instrumenten ooit gehouden',
    '{a} of {b} days estimated': '{a} van {b} dagen geschat',
    '{name} · of total value': '{name} · van de totale waarde',
    'nothing held': 'niets in bezit',
    '{pct} of the total': '{pct} van het totaal',
    'of the total': 'van het totaal',
    'nothing lost from a peak · {period}': 'niets verloren vanaf een piek · {period}',
    '{up} of {n} months · whole history': '{up} van {n} maanden · hele historie',
    'nothing gained · {period}': 'niets gewonnen · {period}',
    'nothing lost · {period}': 'niets verloren · {period}',
    '{name} · {period}': '{name} · {period}',
    'no full month yet': 'nog geen volledige maand',
    'Delete every stored response and re-download the full history from DEGIRO?':
      'Alle opgeslagen antwoorden verwijderen en de volledige historie opnieuw ophalen bij DEGIRO?',
    "{name}'s portfolio": 'de portefeuille van {name}',
    'There is no figure to share for this period.': 'Er is geen cijfer om te delen voor deze periode.',

    // --- the charts' readouts (US-62, and the same gap US-60 found in the popup)
    // charts.js had no translations at all either: every tooltip line was
    // hardcoded English, so the Dutch page's most-read numbers were labelled in
    // the wrong language. Found while building US-62, fixed with it.
    'No quote that day — held at the last price it traded at.':
      'Die dag geen koers — gewaardeerd tegen de laatste koers waarop het handelde.',
    'Value: {v}': 'Waarde: {v}',
    'Day change: {v}': 'Dagverschil: {v}',
    'Deposit: {v}': 'Storting: {v}',
    'Withdrawal: {v}': 'Opname: {v}',
    '{n} buy': '{n} aankoop',
    '{n} buys': '{n} aankopen',
    '{n} sell': '{n} verkoop',
    '{n} sells': '{n} verkopen',
    ' +{n} more': ' +{n} meer',
    'Traded: {what}': 'Gehandeld: {what}',
    'Gain: {v}': 'Winst: {v}',
    'Loss: {v}': 'Verlies: {v}',
    'Cumulative: {v}': 'Cumulatief: {v}',
    'Total: {v}': 'Totaal: {v}',
    'Growth: {v}': 'Gegroeid: {v}',
    'Portfolio value': 'Portefeuillewaarde',
    'Money paid in (net)': 'Ingelegd (netto)',
    'Paid in: {v}': 'Ingelegd: {v}',
    'Taken out: {v}': 'Opgenomen: {v}',
    'Gross: {v}': 'Bruto: {v}',
    'Received (net)': 'Ontvangen (netto)',
    'Withholding tax': 'Dividendbelasting',
    'Open  {v}': 'Open  {v}',
    'High  {v}': 'Hoog  {v}',
    'Low   {v}': 'Laag  {v}',
    'Close {v}': 'Slot  {v}',
    Range: 'Bereik',
    'Open to close': 'Open tot slot',
    'no money in to compare against': 'geen inleg om mee te vergelijken',
    'Total matches what DEGIRO reports': 'Totaal komt overeen met wat DEGIRO meldt',
    'No projection is drawn, because the growth rate measured from your history is {rate}% a year. That is not what a market does \u2014 it is what an account looks like when deposits and the trades they paid for are recorded a day apart, which distorts the early months. Set the rates yourself above to see a projection anyway.':
      'Er wordt geen prognose getekend, want het groeipercentage gemeten uit jouw historie is {rate}% per jaar. Dat doet een markt niet \u2014 zo ziet een rekening eruit als stortingen en de aankopen die ermee betaald zijn een dag uit elkaar geboekt staan, wat de eerste maanden vertekent. Stel de percentages hierboven zelf in om toch een prognose te zien.',
    'Reconstructed total is exactly {total}. DEGIRO sent no account total this sync, so this is checked against the sum of the position values and the cash balance it did send \u2014 an independent check, but one that cannot catch an error already in DEGIRO\u2019s own position values.':
      'Het gereconstrueerde totaal is precies {total}. DEGIRO gaf bij deze synchronisatie geen rekeningtotaal, dus dit is getoetst aan de som van de positiewaarden en het kassaldo die wél meekwamen \u2014 een onafhankelijke controle, maar \u00e9\u00e9n die een fout die al in DEGIRO\u2019s eigen positiewaarden zit niet kan opmerken.',
    'Reconstructed total is exactly {total}.': 'Het gereconstrueerde totaal is precies {total}.',
    // --- US-79: disconnect and freeze ---
    'Disconnect…': 'Verbinding verbreken…',
    'What disconnect does': 'Wat verbinding verbreken doet',
    'Disconnected': 'Verbinding verbroken',
    'Disconnected · frozen': 'Verbinding verbroken · bevroren',
    'Disconnected · frozen at {time}': 'Verbinding verbroken · bevroren op {time}',
    'an unknown date': 'een onbekende datum',
    'Disconnect this account? The account number DEGIRO gave us is forgotten and syncing stops. Your history stays on this computer and keeps showing the figures from the last sync. You stay logged in at DEGIRO — log out there if you want that too.':
      'Verbinding met deze rekening verbreken? Het rekeningnummer dat DEGIRO ons gaf wordt vergeten en het synchroniseren stopt. Je historie blijft op deze computer staan en blijft de cijfers van de laatste synchronisatie tonen. Je blijft ingelogd bij DEGIRO — log daar uit als je dat ook wilt.',
    'This account is disconnected: the account number is forgotten, nothing is being fetched, and every figure below is frozen as it stood on {date}. Press Sync now to reconnect — you are still logged in at DEGIRO.':
      'De verbinding met deze rekening is verbroken: het rekeningnummer is vergeten, er wordt niets opgehaald en elk cijfer hieronder staat stil zoals het op {date} was. Druk op Nu synchroniseren om opnieuw te verbinden — je bent nog steeds ingelogd bij DEGIRO.',
    'Checked at the last sync, on {date}; nothing has been checked since.':
      'Gecontroleerd bij de laatste synchronisatie, op {date}; sindsdien is er niets gecontroleerd.',
    'How it works. The extension uses the DEGIRO session your own browser already has, and remembers the account number DEGIRO hands back. It never sees a password.':
      'Hoe het werkt. De extensie gebruikt de DEGIRO-sessie die je browser zelf al heeft, en onthoudt het rekeningnummer dat DEGIRO teruggeeft. Ze ziet nooit een wachtwoord.',
    'Disconnect forgets that account number and stops syncing by itself.':
      'Verbinding verbreken vergeet dat rekeningnummer en stopt met zelf synchroniseren.',
    'It does not delete your history — the figures stay, frozen at the last sync — and it does not log you out of DEGIRO.':
      'Het verwijdert je historie niet — de cijfers blijven staan, bevroren op de laatste synchronisatie — en het logt je niet uit bij DEGIRO.',
    'Disconnected. The figures below are frozen at the last sync; press Sync now to reconnect.':
      'Verbinding verbroken. De cijfers hieronder staan stil op de laatste synchronisatie; druk op Nu synchroniseren om opnieuw te verbinden.',
    'Could not disconnect: {msg}': 'Verbinding verbreken lukte niet: {msg}',
    'Total does not match DEGIRO': 'Totaal komt niet overeen met DEGIRO',
    // US-81: a failing check says which anchor it failed against.
    'DEGIRO sent no account total this sync, so this is compared against the sum of the position values and the cash balance it did send. If that cash figure is not the whole balance, the difference is in the comparison rather than in your history — send the bug report, it now says how the cash splits.':
      'DEGIRO stuurde deze sync geen rekeningtotaal, dus dit wordt vergeleken met de som van de positiewaardes en het kassaldo dat wél is meegestuurd. Is dat kassaldo niet het hele saldo, dan zit het verschil in de vergelijking en niet in je historie — stuur het foutrapport, daarin staat nu hoe het kasgeld is verdeeld.',
    'This is DEGIRO’s own stated account total, so the difference is in this extension’s ledger rather than in the comparison. Send the bug report: it now says which cash categories the difference matches.':
      'Dit is het rekeningtotaal dat DEGIRO zelf opgeeft, dus het verschil zit in de administratie van deze extensie en niet in de vergelijking. Stuur het foutrapport: daarin staat nu bij welke kascategorieën het verschil past.',
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
