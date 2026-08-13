#!/usr/bin/env node
/**
 * Generates the synthetic fixture set in fixtures/.
 *
 * WHY THIS EXISTS
 * ---------------
 * SPEC §5 wants fixtures captured from a real HAR, because only the real
 * responses settle the field names. Nobody can log into the account from here,
 * so this generator produces a stand-in that has the *shapes* the spec
 * describes: the same envelopes, the same name/value-pair encoding on
 * /update, the same offset-not-timestamp encoding on the vwd series, mixed
 * NL/EN cash descriptions, weekends missing from the price series.
 *
 * That is enough to build and test the engine against, and enough to demo the
 * UI. It is NOT evidence about DEGIRO's actual field names. When a real HAR
 * lands, drop it in fixtures/ and re-run the tests; parse.js is written to
 * accept both.
 *
 * The generated set is internally consistent on purpose: update.json's total is
 * computed from the same positions and cash the transactions imply, so the
 * SPEC §6 reconciliation check ("must match to the cent") is a real assertion
 * and not a tautology defeated by rounding.
 *
 * Usage: node tools/make-fixtures.mjs [--today=YYYY-MM-DD] [--seed=N]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'fixtures');

// --- args ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const TODAY = args.today ?? new Date().toISOString().slice(0, 10);
const SEED = Number(args.seed ?? 20260808);
const START = '2021-01-04';

// Redacted, fixed dummy identifiers. SPEC §5 step 3.
const INT_ACCOUNT = 9999999;
const SESSION_ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.prod_b_128_3';
const USER_TOKEN = '11111111';

// --- deterministic PRNG ----------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
/** Box-Muller, so the walk has fat-ish tails rather than uniform noise. */
function gauss() {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// --- dates -----------------------------------------------------------------
const MS = 86400000;
const toEpoch = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromEpoch = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => fromEpoch(toEpoch(iso) + n * MS);
const isWeekend = (iso) => [0, 6].includes(new Date(toEpoch(iso)).getUTCDay());

const allDays = [];
for (let t = toEpoch(START); t <= toEpoch(TODAY); t += MS) allDays.push(fromEpoch(t));
const tradingDays = allDays.filter((d) => !isWeekend(d));

// --- instruments -----------------------------------------------------------
// drift/vol are annualised; `phase` shifts the sine so they do not all move
// together and the total does not look like one stock.
const INSTRUMENTS = [
  { id: '331868', vwd: '350009261', sym: 'ASML',  name: 'ASML HOLDING',            isin: 'NL0010273215', p0: 480, drift: 0.26, vol: 0.34, yield: 0.008, from: '2021-01-04' },
  { id: '1153605', vwd: '360015751', sym: 'VWRL', name: 'VANGUARD FTSE AW',        isin: 'IE00B3RBWM25', p0: 88,  drift: 0.12, vol: 0.14, yield: 0.019, from: '2021-01-04' },
  { id: '4587473', vwd: '385018452', sym: 'ADYEN',name: 'ADYEN',                   isin: 'NL0012969182', p0: 1900,drift: 0.10, vol: 0.48, yield: 0.0,   from: '2021-03-15' },
  { id: '1490855', vwd: '330015025', sym: 'IWDA', name: 'ISHARES CORE MSCI WORLD', isin: 'IE00B4L5Y983', p0: 68,  drift: 0.13, vol: 0.13, yield: 0.0,   from: '2021-06-01' },
  { id: '17461000',vwd: '365002435', sym: 'PRX',  name: 'PROSUS',                  isin: 'NL0013654783', p0: 95,  drift: 0.08, vol: 0.36, yield: 0.004, from: '2022-02-14' },
  { id: '331873',  vwd: '350010440', sym: 'INGA', name: 'ING GROEP',               isin: 'NL0011821202', p0: 7.6, drift: 0.19, vol: 0.30, yield: 0.062, from: '2022-09-05' },
  { id: '9057130', vwd: '390000123', sym: 'BESI', name: 'BE SEMICONDUCTOR',        isin: 'NL0012866412', p0: 55,  drift: 0.30, vol: 0.45, yield: 0.021, from: '2023-04-11' },
  { id: '2964828', vwd: '340001211', sym: 'SHELL',name: 'SHELL PLC',               isin: 'GB00BP6MXD84', p0: 17,  drift: 0.14, vol: 0.25, yield: 0.041, from: '2023-10-02' },
  { id: '5462588', vwd: '355001982', sym: 'WKL',  name: 'WOLTERS KLUWER',          isin: 'NL0000395903', p0: 78,  drift: 0.11, vol: 0.20, yield: 0.017, from: '2024-05-21' },
  { id: '8449524', vwd: '375004417', sym: 'ARGX', name: 'ARGENX SE',               isin: 'NL0010832176', p0: 240, drift: 0.28, vol: 0.42, yield: 0.0,   from: '2025-02-10' },
  // US-35's gate. Optimism Mode only unlocks for an account holding PROP, so
  // the demo needs one or the feature cannot be exercised without a real
  // account that happens to hold it. Given a negative drift on purpose: a mode
  // whose whole job is to reframe a loss has nothing to say about a winner.
  { id: '9911001', vwd: '399001001', sym: 'PROP', name: 'PROP TRADING GROUP',     isin: 'NL0011999911', p0: 42,  drift: -0.34, vol: 0.55, yield: 0.0,   from: '2023-01-09' }, // leak-check: ok — a generated vwd id, like the ten above it
];

/**
 * A market-wide factor so drawdowns line up across instruments the way they do
 * in a real portfolio (the 2022 slump, the 2025 dip in the screenshots).
 */
const REGIMES = [
  { until: '2021-12-31', mult: 1.0 },
  { until: '2022-10-15', mult: -0.9 }, // the 2022 bear
  { until: '2023-07-31', mult: 1.4 },
  { until: '2024-12-31', mult: 1.5 },
  { until: '2025-04-15', mult: 1.2 },
  { until: '2025-06-30', mult: -2.2 }, // sharp spring correction
  { until: '2025-11-30', mult: 1.8 },
  { until: '2026-02-28', mult: -0.6 },
  { until: '2099-12-31', mult: 2.0 },
];
const regimeFor = (iso) => REGIMES.find((r) => iso <= r.until).mult;

// --- price series ----------------------------------------------------------
/** vwdId -> Map(isoDay -> close), trading days only. */
const priceByVwd = new Map();
for (const ins of INSTRUMENTS) {
  const series = new Map();
  let price = ins.p0;
  for (const day of tradingDays) {
    if (day < ins.from) continue;
    const dt = 1 / 252;
    const drift = ins.drift * regimeFor(day);
    const shock = ins.vol * Math.sqrt(dt) * gauss();
    price *= Math.exp((drift - (ins.vol * ins.vol) / 2) * dt + shock);
    price = Math.max(price, 0.5);
    series.set(day, Math.round(price * 100) / 100);
  }
  priceByVwd.set(ins.vwd, series);
}

/** Last close at or before `day`. */
function priceOn(vwd, day) {
  const series = priceByVwd.get(vwd);
  let d = day;
  for (let i = 0; i < 14; i++) {
    if (series.has(d)) return series.get(d);
    d = addDays(d, -1);
  }
  return null;
}

// --- deposits --------------------------------------------------------------
// Roughly the shape of the reference screenshot: a small start, steady monthly
// contributions, three lump sums, and one withdrawal in late 2025.
const LUMPS = [
  { date: '2021-01-04', amount: 5000 },
  { date: '2021-03-08', amount: 4000 },
  { date: '2023-04-17', amount: 12000 },
  { date: '2024-01-15', amount: 9000 },
  { date: '2025-01-20', amount: 15000 },
  { date: '2025-10-06', amount: -22000 }, // house deposit; the cliff in the chart
  { date: '2026-03-02', amount: 18000 },
];

const cashRows = [];
const transactions = [];
let cashBalance = 0;
let rowId = 1;

function pushCash(date, description, change, extra = {}) {
  cashBalance += change;
  cashRows.push({
    date: `${date}T${String(9 + (rowId % 8)).padStart(2, '0')}:${String(rowId % 60).padStart(2, '0')}:00+01:00`,
    valueDate: `${date}T00:00:00+01:00`,
    id: `mv-${rowId++}`,
    description,
    currency: 'EUR',
    change: Math.round(change * 100) / 100,
    balance: { unsettledCash: 0, total: Math.round(cashBalance * 100) / 100 },
    ...extra,
  });
}

// Monthly contribution, on the 25th, growing over the years.
function monthlyAmount(iso) {
  const y = Number(iso.slice(0, 4));
  return { 2021: 400, 2022: 500, 2023: 750, 2024: 1000, 2025: 1500, 2026: 2000 }[y] ?? 500;
}

// Sells: occasional rebalancing, plus a big liquidation three days before the
// 2025 withdrawal so there is actually cash to take out.
const SELLS = {
  '2022-06-14': { fraction: 0.35, names: 1 },
  '2023-02-21': { fraction: 0.35, names: 1 },
  '2024-08-13': { fraction: 0.35, names: 1 },
  '2025-10-03': { fraction: 0.6, names: 3 },
  '2026-01-19': { fraction: 0.3, names: 1 },
};

// --- build the ledger day by day -------------------------------------------
const holdings = new Map(); // productId -> qty
const dividendMonths = new Set();

for (const day of allDays) {
  // 1. external cashflow. A withdrawal is clamped to the free cash balance:
  //    DEGIRO will not let you take out money you do not have, and an
  //    overdrawn fixture would just be testing an impossible account.
  for (const lump of LUMPS) {
    if (lump.date === day) {
      const amount = lump.amount >= 0 ? lump.amount : -Math.min(Math.abs(lump.amount), Math.max(cashBalance, 0));
      if (Math.abs(amount) < 0.01) continue;
      pushCash(day, amount >= 0 ? 'iDEAL Deposit' : 'Terugstorting', amount, { type: 'CASH_TRANSACTION' });
    }
  }
  if (day.slice(8) === '25' && !isWeekend(day) && day >= '2021-02-01') {
    pushCash(day, 'iDEAL Deposit', monthlyAmount(day), { type: 'CASH_TRANSACTION' });
  }

  if (isWeekend(day)) continue;

  // 2. dividends, quarterly-ish per instrument, on the 12th
  if (day.slice(8) === '12') {
    const mk = day.slice(0, 7);
    for (const ins of INSTRUMENTS) {
      const qty = holdings.get(ins.id) ?? 0;
      if (qty <= 0 || ins.yield <= 0) continue;
      const month = Number(day.slice(5, 7));
      const payMonths = ins.sym === 'VWRL' ? [3, 6, 9, 12] : ins.sym === 'INGA' ? [4, 8] : [5, 11];
      if (!payMonths.includes(month)) continue;
      const px = priceOn(ins.vwd, day);
      if (px == null) continue;
      const gross = Math.round(qty * px * (ins.yield / payMonths.length) * 100) / 100;
      if (gross < 0.5) continue;
      pushCash(day, `Dividend ${ins.name}`, gross, { productId: ins.id, type: 'CASH_TRANSACTION' });
      const tax = Math.round(gross * 0.15 * 100) / 100;
      if (tax > 0.01) {
        pushCash(day, `Dividendbelasting ${ins.name}`, -tax, { productId: ins.id, type: 'CASH_TRANSACTION' });
      }
      dividendMonths.add(mk);
    }
  }

  // 3. trades. Buy on the first trading day after a cash top-up; occasional
  //    rebalancing sells.
  const buyDay = day.slice(8) === '26' || LUMPS.some((l) => l.date === day && l.amount > 0);
  if (buyDay) {
    const investable = cashBalance * 0.9;
    if (investable > 300) {
      const eligible = INSTRUMENTS.filter((i) => i.from <= day);
      // Concentrate on two names per round so the composition chart has texture.
      const picks = [];
      for (let k = 0; k < 2 && eligible.length; k++) {
        picks.push(eligible[Math.floor(rand() * eligible.length)]);
      }
      const per = investable / picks.length;
      for (const ins of picks) {
        const px = priceOn(ins.vwd, day);
        if (px == null) continue;
        const qty = Math.floor(per / px);
        if (qty < 1) continue;
        const fee = ins.sym === 'VWRL' || ins.sym === 'IWDA' ? 1.0 : 2.0;
        const gross = Math.round(qty * px * 100) / 100;
        transactions.push({
          id: 100000 + transactions.length,
          productId: Number(ins.id),
          date: `${day}T10:${String(10 + (transactions.length % 45)).padStart(2, '0')}:00+01:00`,
          buysell: 'B',
          price: px,
          quantity: qty,
          total: -gross,
          orderTypeId: 0,
          counterParty: 'MK',
          transfered: false,
          fxRate: 0,
          totalInBaseCurrency: -gross,
          feeInBaseCurrency: -fee,
          totalPlusFeeInBaseCurrency: -(gross + fee),
          transactionTypeId: 0,
          tradingVenue: 'XAMS',
        });
        holdings.set(ins.id, (holdings.get(ins.id) ?? 0) + qty);
        pushCash(day, `Koop ${qty} @ ${px.toFixed(2)} EUR`, -gross, { productId: ins.id, type: 'TRANSACTION' });
        pushCash(day, 'DEGIRO Transactiekosten en/of kosten van derden', -fee, {
          productId: ins.id,
          type: 'TRANSACTION',
        });
      }
    }
  }

  const sellPlan = SELLS[day];
  if (sellPlan) {
    const held = INSTRUMENTS.filter((i) => (holdings.get(i.id) ?? 0) > 2)
      .sort((a, b) => (holdings.get(b.id) ?? 0) * priceOn(b.vwd, day) - (holdings.get(a.id) ?? 0) * priceOn(a.vwd, day))
      .slice(0, sellPlan.names);
    for (const ins of held) {
      const px = priceOn(ins.vwd, day);
      const qty = Math.floor((holdings.get(ins.id) ?? 0) * sellPlan.fraction);
      if (px != null && qty >= 1) {
        const gross = Math.round(qty * px * 100) / 100;
        const fee = 2.0;
        transactions.push({
          id: 100000 + transactions.length,
          productId: Number(ins.id),
          date: `${day}T15:20:00+01:00`,
          buysell: 'S',
          price: px,
          quantity: -qty,
          total: gross,
          orderTypeId: 0,
          counterParty: 'MK',
          transfered: false,
          fxRate: 0,
          totalInBaseCurrency: gross,
          feeInBaseCurrency: -fee,
          totalPlusFeeInBaseCurrency: gross - fee,
          transactionTypeId: 0,
          tradingVenue: 'XAMS',
        });
        holdings.set(ins.id, holdings.get(ins.id) - qty);
        pushCash(day, `Verkoop ${qty} @ ${px.toFixed(2)} EUR`, gross, { productId: ins.id, type: 'TRANSACTION' });
        pushCash(day, 'DEGIRO Transactiekosten en/of kosten van derden', -fee, {
          productId: ins.id,
          type: 'TRANSACTION',
        });
      }
    }
  }

  // 4. quarterly exchange connection fee, and credit interest from 2024.
  if (day.slice(5) === '01-04' || day.slice(5) === '04-04' || day.slice(5) === '07-04' || day.slice(5) === '10-04') {
    pushCash(day, `DEGIRO Aansluitingskosten ${day.slice(0, 4)} (Euronext Amsterdam)`, -2.5, { type: 'CASH_TRANSACTION' });
  }
  if (day.slice(8) === '01' && day >= '2024-01-01' && cashBalance > 100) {
    pushCash(day, 'Flatex Interest', Math.round(cashBalance * 0.02 * (1 / 12) * 100) / 100, {
      type: 'CASH_TRANSACTION',
    });
  }
}

// --- current portfolio (update endpoint), consistent with the above ---------
const positions = [];
let positionsValue = 0;
for (const ins of INSTRUMENTS) {
  const qty = holdings.get(ins.id) ?? 0;
  if (qty <= 0) continue;
  const px = priceOn(ins.vwd, TODAY);
  const value = Math.round(qty * px * 100) / 100;
  positionsValue += value;
  positions.push({
    id: ins.id,
    value: [
      { name: 'id', value: ins.id },
      { name: 'positionType', value: 'PRODUCT' },
      { name: 'size', value: qty },
      { name: 'price', value: px },
      { name: 'value', value: value },
      { name: 'accruedInterest', value: null },
      { name: 'plBase', value: { EUR: -value } },
      { name: 'todayPlBase', value: { EUR: -value } },
      { name: 'portfolioValueCorrection', value: 0 },
      { name: 'breakEvenPrice', value: px },
      { name: 'averageFxRate', value: 1 },
      { name: 'realizedProductPl', value: 0 },
      { name: 'realizedFxPl', value: 0 },
      { name: 'todayRealizedProductPl', value: 0 },
      { name: 'todayRealizedFxPl', value: 0 },
    ],
  });
}
const totalCash = Math.round(cashBalance * 100) / 100;
const totalValue = Math.round((positionsValue + totalCash) * 100) / 100;

const update = {
  portfolio: { lastUpdated: 1, name: 'portfolio', value: positions },
  totalPortfolio: {
    lastUpdated: 1,
    name: 'totalPortfolio',
    value: [
      { name: 'degiroCash', value: totalCash },
      { name: 'flatexCash', value: 0 },
      { name: 'totalCash', value: totalCash },
      { name: 'totalDepositWithdrawal', value: LUMPS.reduce((a, l) => a + l.amount, 0) },
      { name: 'freeSpaceNew', value: { EUR: totalCash } },
      { name: 'reportPortfValue', value: Math.round(positionsValue * 100) / 100 },
      { name: 'reportCashBal', value: totalCash },
      { name: 'reportNetliq', value: totalValue },
      { name: 'reportCreationTime', value: `${TODAY} 18:00:00` },
    ],
  },
  cashFunds: {
    lastUpdated: 1,
    name: 'cashFunds',
    value: [
      { id: 1, value: [{ name: 'id', value: 1 }, { name: 'currencyCode', value: 'EUR' }, { name: 'value', value: totalCash }] },
      { id: 2, value: [{ name: 'id', value: 2 }, { name: 'currencyCode', value: 'USD' }, { name: 'value', value: 0 }] },
    ],
  },
};

// --- product info ----------------------------------------------------------
const productsInfo = { data: {} };
for (const ins of INSTRUMENTS) {
  const px = priceOn(ins.vwd, TODAY);
  productsInfo.data[ins.id] = {
    id: ins.id,
    name: ins.name,
    isin: ins.isin,
    symbol: ins.sym,
    contractSize: 1.0,
    productType: 'STOCK',
    productTypeId: 1,
    tradable: true,
    category: 'B',
    currency: 'EUR',
    exchangeId: '710',
    onlyEodPrices: false,
    orderTimeTypes: ['DAY', 'GTC'],
    buyOrderTypes: ['LIMIT', 'MARKET'],
    sellOrderTypes: ['LIMIT', 'MARKET'],
    productBitTypes: [],
    closePrice: px,
    closePriceDate: TODAY,
    feedQuality: 'R',
    orderBookDepth: 0,
    vwdIdentifierType: 'issueid',
    vwdId: ins.vwd,
    qualitySwitchable: false,
    qualitySwitchFree: false,
    vwdModuleId: 21,
  };
}

// --- vwd chart responses ---------------------------------------------------
// One file per instrument, in the offset-from-anchor encoding of SPEC §2.1.
mkdirSync(OUT, { recursive: true });
const chartFiles = [];
for (const ins of INSTRUMENTS) {
  const series = priceByVwd.get(ins.vwd);
  const dates = [...series.keys()].sort();
  const anchor = dates[0];
  const data = dates.map((d) => [Math.round((toEpoch(d) - toEpoch(anchor)) / MS), series.get(d)]);
  const body = {
    requestid: '1',
    start: `${anchor}T00:00:00`,
    end: `${TODAY}T00:00:00`,
    resolution: 'P1D',
    series: [
      {
        times: `${anchor}/P1D`,
        expires: `${TODAY}T18:00:00+02:00`,
        data: {
          issueId: Number(ins.vwd),
          companyId: 1000 + Number(ins.id) % 1000,
          name: ins.name,
          identifier: `issueid:${ins.vwd}`,
          isin: ins.isin,
          alfa: ins.sym,
          market: 'Euronext Amsterdam',
          currency: 'EUR',
          type: 'AAN',
          quality: 'REALTIME',
          lastPrice: data[data.length - 1][1],
          lastTime: `${TODAY}T17:35:00`,
          tradingStartTime: '09:00:00',
          tradingEndTime: '17:40:00',
          timezoneOffsetInSeconds: 7200,
        },
        id: `issueid:${ins.vwd}`,
        type: 'object',
      },
      {
        times: `${anchor}/P1D`,
        expires: `${TODAY}T18:00:00+02:00`,
        data,
        id: `price:issueid:${ins.vwd}`,
        type: 'time',
      },
    ],
  };
  const file = `chart-${ins.vwd}.json`;
  writeFileSync(join(OUT, file), JSON.stringify(body));
  chartFiles.push(file);
}

// --- write the rest --------------------------------------------------------
const write = (name, obj, pretty = false) =>
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, pretty ? 2 : 0));

write('transactions.json', { data: transactions });
write('accountoverview.json', { data: { cashMovements: cashRows } });
write('update.json', update);
write('products-info.json', productsInfo, true);
write('client.json', {
  data: {
    id: Number(USER_TOKEN),
    intAccount: INT_ACCOUNT,
    loggedInPersonId: 1,
    clientRole: 'ACTIVE',
    effectiveClientRole: 'ACTIVE',
    contractType: 'PRIVATE',
    username: 'demo',
    displayName: 'Demo Account',
    email: 'demo@example.invalid',
    firstContact: { firstName: 'Demo', lastName: 'Account', displayName: 'Demo Account', nationality: 'NL' },
    address: { streetAddress: 'Dummy 1', city: 'Amsterdam', zip: '1000 AA', country: 'NL' },
    cellphoneNumber: '+310000000000',
    locale: 'nl_NL',
    language: 'nl',
    culture: 'nl-NL',
    bankAccount: { bankAccountId: 1, iban: 'NL00DUMMY0000000000', bic: 'DUMMYNL2A' },
    memberCode: 'DUMMY',
    isWithdrawalAvailable: true,
    isAllocationAvailable: false,
    isIskClient: false,
    isCollectivePortfolio: false,
    isAmClientActive: false,
    canUpgrade: false,
  },
});
write('config.json', {
  data: {
    tradingUrl: 'https://trader.degiro.nl/trading/secure/',
    paUrl: 'https://trader.degiro.nl/pa/secure/',
    reportingUrl: 'https://trader.degiro.nl/reporting/secure/',
    productSearchUrl: 'https://trader.degiro.nl/product_search/secure/',
    dictionaryUrl: 'https://trader.degiro.nl/product_search/config/dictionary/',
    productTypesUrl: 'https://trader.degiro.nl/product_search/config/productTypes/',
    companiesServiceUrl: 'https://trader.degiro.nl/dgtbxdsservice/',
    i18nUrl: 'https://trader.degiro.nl/i18n/',
    vwdQuotecastServiceUrl: 'https://degiro.quotecast.vwdservices.com/CORS/',
    vwdNewsUrl: 'https://solutions.vwdservices.com/customers/degiro.nl/news-feed/api/',
    vwdGossipsUrl: 'https://solutions.vwdservices.com/customers/degiro.nl/news-feed/api/',
    taskManagerUrl: 'https://trader.degiro.nl/taskmanager/',
    refinitivNewsUrl: 'https://trader.degiro.nl/dgtbxdsservice/newsfeed/v2',
    sessionId: SESSION_ID,
    clientId: INT_ACCOUNT,
  },
});
write('meta.json', {
  generator: 'tools/make-fixtures.mjs',
  synthetic: true,
  note: 'Shapes follow SPEC §2. Values are generated, not captured from DEGIRO.',
  seed: SEED,
  today: TODAY,
  start: START,
  intAccount: INT_ACCOUNT,
  sessionId: SESSION_ID,
  userToken: USER_TOKEN,
  /** SPEC §6 target: the engine must reproduce this to the cent. */
  liveTotal: totalValue,
  liveCash: totalCash,
  livePositionsValue: Math.round(positionsValue * 100) / 100,
  charts: chartFiles,
  vwdIds: INSTRUMENTS.map((i) => i.vwd),
  counts: { transactions: transactions.length, cashMovements: cashRows.length, products: INSTRUMENTS.length },
}, true);

console.log(
  `fixtures written to ${OUT}\n` +
    `  ${transactions.length} transactions, ${cashRows.length} cash movements, ${INSTRUMENTS.length} products\n` +
    `  window ${START} .. ${TODAY}\n` +
    `  live total ${totalValue.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })} ` +
    `(cash ${totalCash.toFixed(2)}, positions ${positionsValue.toFixed(2)})`,
);
