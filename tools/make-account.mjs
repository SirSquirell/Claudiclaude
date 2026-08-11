#!/usr/bin/env node
/**
 * Generate a synthetic account export, in the shape the extension's own
 * "Export JSON" button produces.
 *
 * This exists so the engine can be checked against every case the field has
 * thrown at it without anyone's money being involved. Three real accounts found
 * four defects between them, and every one was a *shape* — a contract size, a
 * ratio, a position that did not close — rather than an amount. Shapes can be
 * built. So they are built here, deliberately, and the numbers underneath are
 * invented.
 *
 *   node tools/make-account.mjs --out /tmp/synthetic.json
 *   npm run audit:synthetic       # generate, then run every invariant over it
 *
 * What it deliberately contains, because each one broke something once:
 *
 *  - **Calls and puts, long and short.** The arithmetic is a signed quantity
 *    times a price times a contract size, so a call is the same sum as a put —
 *    but that had never been run against anything, because the only real
 *    options account held 27 written puts and not one call.
 *  - **Contract sizes 1, 10, 100 and 103.** The 103 is a contract adjusted for
 *    a corporate action; it is the reason contract sizes are measured rather
 *    than looked up in a table.
 *  - **A currency traded only through options**, which is what put CHF at 107
 *    instead of 1.07 when rates were derived from trades.
 *  - **Currency conversions booked as paired cash rows**, the authoritative
 *    rate source, with consecutive sourceIds and a shared productId.
 *  - **GBX holdings against a GBP cash balance** — pence and pounds, the same
 *    currency, which used to be counted at 1:1.
 *  - **A split-adjusted series with a closed round trip**, the case that left
 *    17.36 shares of a bankrupt company on the books of an account that had
 *    sold every one of them.
 *  - **A delisted instrument with no price series**, valued at its last trade.
 *  - Deposits, withdrawals, dividends, tax, fees and a live snapshot to
 *    reconcile against.
 */
import { writeFileSync } from 'node:fs';

// Accepts both --out=path and --out path.
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const [k, v] = a.slice(2).split('=');
  args[k] = v ?? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true);
}
const OUT = args.out ?? '/tmp/synthetic-account.json';
const TODAY = args.today ?? '2026-08-09';
const START = '2023-01-02';

// Deterministic: a fixture that changes under you is not a fixture.
let seed = Number(args.seed ?? 20260809);
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const MS = 86400000;
const toEpoch = (iso) => Date.parse(`${iso}T00:00:00Z`);
const fromEpoch = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => fromEpoch(toEpoch(iso) + n * MS);
const isWeekend = (iso) => [0, 6].includes(new Date(toEpoch(iso)).getUTCDay());

const days = [];
for (let d = START; d <= TODAY; d = addDays(d, 1)) days.push(d);
const trading = days.filter((d) => !isWeekend(d));
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

// --- exchange rates -------------------------------------------------------
// One true rate per currency, drifting slowly. Every conversion and every trade
// is settled at whatever this says on the day, so the engine has one right
// answer to find and the test can assert it found it.
const FX = { EUR: 1, USD: 0.92, CHF: 1.07, GBX: 0.0117, GBP: 1.17, SEK: 0.088, NOK: 0.086 };
const fxOn = (ccy, day) => {
  if (ccy === 'EUR') return 1;
  const t = days.indexOf(day) / Math.max(1, days.length - 1);
  return FX[ccy] * (1 + 0.06 * Math.sin(t * 5.2));
};

// --- instruments ----------------------------------------------------------
// `size` is the contract size the generator settles trades at. The engine is
// never told it — measuring it back out is the point.
const INSTRUMENTS = [
  { id: '1001', name: 'Northwind Industries', symbol: 'NWI', ccy: 'EUR', type: 'STOCK', size: 1, px: 42, vwd: '9001' },
  { id: '1002', name: 'Contoso Corp', symbol: 'CTS', ccy: 'USD', type: 'STOCK', size: 1, px: 118, vwd: '9002' },
  { id: '1003', name: 'Fabrikam AB', symbol: 'FBK', ccy: 'SEK', type: 'STOCK', size: 1, px: 260, vwd: '9003' },
  { id: '1004', name: 'Tailspin plc', symbol: 'TSP', ccy: 'GBX', type: 'STOCK', size: 1, px: 940, vwd: '9004' },
  // Delisted: no price series at all, valued at its last trade.
  { id: '1005', name: 'Litware Holdings', symbol: 'LTW', ccy: 'EUR', type: 'STOCK', size: 1, px: 8.4, vwd: null },
  // Reverse-split: the series quotes in units ~1000x the booked shares, and the
  // position is opened and fully closed. It must leave nothing behind.
  { id: '1006', name: 'Adventure Works', symbol: 'AVW', ccy: 'EUR', type: 'STOCK', size: 1, px: 3.2, vwd: '9006', splitFactor: 1000 },

  { id: '2001', name: 'NWI C50.00 18DEC26', symbol: 'NWI', ccy: 'EUR', type: 'OPTION', size: 100, px: 3.1, vwd: '9101' },
  { id: '2002', name: 'NWI P36.00 18DEC26', symbol: 'NWI', ccy: 'EUR', type: 'OPTION', size: 100, px: 2.4, vwd: '9102' },
  { id: '2003', name: 'CTS C130.00 19JUN26', symbol: 'CTS', ccy: 'USD', type: 'OPTION', size: 100, px: 4.8, vwd: '9103' },
  // Contract size 10, as high-priced Euronext options carry.
  { id: '2004', name: 'BIGCO P900.00 17DEC27', symbol: 'BGC', ccy: 'EUR', type: 'OPTION', size: 10, px: 61, vwd: '9104' },
  // Contract size 103: adjusted for a corporate action. No table has this.
  { id: '2005', name: 'ADJ P38.81 15DEC28', symbol: 'ADJ', ccy: 'EUR', type: 'OPTION', size: 103, px: 7.7, vwd: '9105' },
  // A currency reached ONLY through options: rates must not come from these.
  { id: '2006', name: 'ALP C220.00 18DEC26', symbol: 'ALP', ccy: 'CHF', type: 'OPTION', size: 100, px: 5.5, vwd: '9106' },
  // B11, restored. An option in a currency this account converts twice in five
  // years, with both conversions hundreds of days from the trade — so its rate
  // on the trade date is a straight line drawn between two distant points, and
  // the contract size is measured through that line.
  //
  // This case used to exist and was lost: the conversion cadence below was made
  // "realistic" from an account that books 915 USD conversions, which put every
  // trade within a fortnight of a stated rate and quietly repaired B11 in the
  // fixture while leaving it in the wild. A real account reports contract sizes
  // of 101, 104 and 218 today.
  { id: '2007', name: 'SPRS P75.00 20MAR27', symbol: 'SPRS', ccy: 'NOK', type: 'OPTION', size: 100, px: 9.4, vwd: '9107' },
];
const byId = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

// --- price series ---------------------------------------------------------
const priceOn = new Map();
for (const inst of INSTRUMENTS) {
  const walk = [];
  let p = inst.px;
  for (const d of days) {
    p = Math.max(0.02, p * (1 + (rand() - 0.5) * 0.03));
    walk.push([d, round(p, 4)]);
  }
  priceOn.set(inst.id, new Map(walk));
}
const px = (id, day) => priceOn.get(id).get(day) ?? byId[id].px;

const prices = INSTRUMENTS.filter((i) => i.vwd).map((inst) => ({
  vwdId: inst.vwd,
  start: START,
  stepDays: 1,
  // The series is what the charting host serves. For the split case that is in
  // adjusted units, which is exactly the mismatch the engine has to reconcile.
  points: trading.map((d) => ({
    offsetDays: Math.round((toEpoch(d) - toEpoch(START)) / MS),
    close: round(px(inst.id, d) * (inst.splitFactor ?? 1), 4),
  })),
  updatedAt: `${TODAY}T12:00:00.000Z`,
}));

// --- ledger ---------------------------------------------------------------
const transactions = [];
const cashflows = [];
let src = 5000000;
const nextSrc = () => ++src;

const cash = (date, productId, description, currency, change, category) =>
  cashflows.push({
    id: `${date}|${nextSrc()}|${productId ?? ''}|${currency}|${change}`,
    sourceId: src,
    date,
    productId: productId ?? null,
    description,
    currency,
    change: round(change),
    type: category === 'TRANSACTION' ? 'TRANSACTION' : 'CASH_TRANSACTION',
    category,
  });

/** A trade, settled at the true rate and the true contract size. */
function trade(date, id, quantity, feeEur = -0.5) {
  const inst = byId[id];
  const price = round(px(id, date), 4);
  const rate = fxOn(inst.ccy, date);
  const gross = price * quantity * inst.size;
  const totalBase = -(gross * rate) + feeEur;
  transactions.push({
    id: `${date}|${nextSrc()}|${id}|${quantity}|${price}`,
    sourceId: src,
    date,
    productId: id,
    quantity,
    price,
    currency: inst.ccy,
    fee: feeEur,
    totalBase: round(totalBase, 8),
  });
  cash(date, id, `${quantity > 0 ? 'Koop' : 'Verkoop'} ${Math.abs(quantity)} @ ${price} ${inst.ccy}`, inst.ccy, -gross, 'TRADE');
  cash(date, id, 'Transactiekosten', 'EUR', feeEur, 'FEE');
}

/** A currency conversion: two legs, consecutive sourceIds, one productId. */
function convert(date, ccy, amountCcy) {
  const rate = fxOn(ccy, date);
  const pid = `X${Math.floor(rand() * 100000)}`;
  cash(date, pid, 'Valuta Debitering', ccy, -amountCcy, 'FX');
  cash(date, pid, 'Valuta Creditering', 'EUR', amountCcy * rate, 'FX');
}

const d = (n) => addDays(START, n);

cash(d(0), null, 'iDEAL Deposit', 'EUR', 60000, 'DEPOSIT');
cash(d(200), null, 'iDEAL Deposit', 'EUR', 25000, 'DEPOSIT');
cash(d(500), null, 'Terugstorting', 'EUR', -8000, 'WITHDRAWAL');
cash(d(700), null, 'iDEAL Deposit', 'EUR', 15000, 'DEPOSIT');

// Conversions come first so every currency has an authoritative rate, including
// CHF, which is only ever traded through an option.
for (const [n, ccy, amt] of [
  [4, 'USD', 20000], [190, 'USD', 12000], [640, 'USD', 9000], [900, 'USD', 7000],
  [8, 'SEK', 120000], [420, 'SEK', 60000],
  [12, 'GBP', 6000], [560, 'GBP', 4000],
  [30, 'CHF', 8000], [610, 'CHF', 5000],
  // NOK: twice, and deliberately nowhere near the option trade on day 470.
  [15, 'NOK', 90000], [1150, 'NOK', 40000],
]) convert(d(n), ccy, amt);

// A realistic cadence. A real account converts often — one of them books 915
// USD conversions — so nearly every trade sits close to a stated rate, which is
// what makes a contract size measurable. Roughly monthly here, plus one on the
// last trading day so no rate is extrapolated to today.
// NOK is deliberately absent from this list: it is the sparse case.
for (const ccy of ['USD', 'SEK', 'GBP', 'CHF']) {
  for (let n = 40; n < days.length - 3; n += 31) convert(d(n), ccy, 800 + (n % 7) * 50);
  convert(trading.at(-1), ccy, 1000);
}

// Stocks, held to today.
trade(d(6), '1001', 300);
trade(d(210), '1001', 120);
trade(d(10), '1002', 90);
trade(d(650), '1002', 40);
trade(d(14), '1003', 400);
trade(d(16), '1004', 500);
trade(d(20), '1005', 250); // delisted later; never sold

// The round trip on a split-adjusted series: two fills on one volatile day and
// a full exit. Must close to exactly zero.
trade(d(120), '1006', 26);
trade(d(120), '1006', 17);
trade(d(126), '1006', -43);

// Options: long call, short put, long put, short call, and the odd sizes.
trade(d(300), '2001', 5);    // long call
trade(d(320), '2002', -8);   // short put
trade(d(340), '2003', 3);    // long call, USD
trade(d(360), '2004', -2);   // short put, contract size 10
trade(d(380), '2005', -1);   // short put, contract size 103
trade(d(400), '2006', -4);   // short call, CHF — the options-only currency
trade(d(470), '2007', -6);   // short put, NOK — 455 days from the nearest stated rate
trade(d(520), '2001', -2);   // partially closed
trade(d(560), '2003', -3);   // fully closed: a call round trip

// Income.
for (let n = 60; n < days.length - 5; n += 91) {
  cash(d(n), '1001', 'Dividend', 'EUR', 210, 'DIVIDEND');
  cash(d(n), '1001', 'Dividendbelasting', 'EUR', -31.5, 'DIVIDEND_TAX');
}
for (let n = 30; n < days.length - 5; n += 30) cash(d(n), null, 'DEGIRO Aansluitingskosten', 'EUR', -2.5, 'FEE');

// --- what DEGIRO would report right now -----------------------------------
const held = new Map();
for (const t of transactions) held.set(t.productId, (held.get(t.productId) ?? 0) + t.quantity);

// The last day the market was open. A quote on a Sunday is Friday's close, for
// DEGIRO as much as for us, and pricing the snapshot off a weekend walk would
// make the two disagree for a reason that has nothing to do with the engine.
const LAST_TRADING = trading.at(-1);

const positions = [];
for (const [id, size] of held) {
  if (Math.abs(size) < 1e-9) continue;
  const inst = byId[id];
  const price = round(px(id, LAST_TRADING), 4);
  positions.push({ productId: id, size, price, value: round(size * price * inst.size * fxOn(inst.ccy, LAST_TRADING)) });
}

// Cash, per currency, straight off the ledger.
const cashByCcy = {};
for (const c of cashflows) {
  if (c.category === 'CASH_SWEEP' || c.category === 'RESERVATION') continue;
  cashByCcy[c.currency] = (cashByCcy[c.currency] ?? 0) + c.change;
}
let cashEur = 0;
for (const [ccy, amt] of Object.entries(cashByCcy)) cashEur += amt * fxOn(ccy, LAST_TRADING);
positions.push({ productId: 'EUR', size: round(cashEur), price: 1, value: round(cashEur) });

const liveTotal = round(positions.reduce((a, p) => a + p.value, 0));

const products = INSTRUMENTS.map((i) => ({
  id: i.id,
  name: i.name,
  symbol: i.symbol,
  isin: `NL${i.id}000000`.slice(0, 12),
  currency: i.ccy,
  vwdId: i.vwd,
  vwdIdType: 'issueid',
  productType: i.type,
  closePrice: round(px(i.id, LAST_TRADING), 4),
  closePriceDate: LAST_TRADING,
}));

const out = {
  exportedAt: `${TODAY}T12:00:00.000Z`,
  version: 2,
  synthetic: true,
  transactions,
  cashflows,
  products,
  prices,
  derived: [],
  meta: [
    { key: 'lastDataDate', value: TODAY },
    { key: 'lastError', value: null },
    { key: 'lastSyncAt', value: toEpoch(TODAY) },
    { key: 'liveSnapshot', value: { at: `${TODAY}T12:00:00.000Z`, positions } },
    { key: 'liveTotal', value: liveTotal },
    { key: 'missingPriceSeries', value: [] },
    { key: 'syncState', value: { phase: 'done', message: 'Synthetic', pct: 100, done: true, failed: false } },
    { key: 'urls', value: { trading: 'https://example.invalid/trading/secure/' } },
  ],
  exportedMetaKeys: ['lastDataDate', 'lastError', 'lastSyncAt', 'liveSnapshot', 'liveTotal', 'missingPriceSeries', 'syncState', 'urls'],
};

writeFileSync(OUT, JSON.stringify(out));
const opts = INSTRUMENTS.filter((i) => i.type === 'OPTION');
console.log(
  `wrote ${OUT} — ${transactions.length} transactions, ${cashflows.length} cash movements, ` +
    `${products.length} products (${opts.length} options: ${opts.filter((o) => / C\d/.test(o.name)).length} calls, ` +
    `${opts.filter((o) => / P\d/.test(o.name)).length} puts), contract sizes ` +
    `${[...new Set(INSTRUMENTS.map((i) => i.size))].sort((a, b) => a - b).join('/')}, ` +
    `currencies ${[...new Set(INSTRUMENTS.map((i) => i.ccy))].join(' ')}, live total ${liveTotal}`,
);
