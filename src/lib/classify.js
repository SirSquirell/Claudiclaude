/**
 * Cash-movement classification.
 *
 * The account-overview endpoint is the messiest part of the whole project: the
 * meaning of a row lives in a free-text `description` that is localised (NL/EN)
 * and changes wording over the years. `type` is a coarse hint at best.
 *
 * SPEC §1.4 is the reason this matters:
 *   - only DEPOSIT / WITHDRAWAL are *external* cashflow, and only those get
 *     subtracted from the period P/L;
 *   - DIVIDEND, FEE, INTEREST are *internal* and belong in P/L;
 *   - FX legs and flatex cash sweeps are bookkeeping and must not be counted
 *     as either.
 *
 * Getting this wrong silently turns a deposit into a "gain", which is exactly
 * the bug the spec was written to avoid. So: an explicit, ordered rule table,
 * every unmatched row is counted and surfaced in the UI rather than dropped.
 *
 * Pure module: no I/O, no Chrome APIs.
 */

/** Category -> how the engine should treat it. */
export const CATEGORY = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  DIVIDEND: 'DIVIDEND',
  DIVIDEND_TAX: 'DIVIDEND_TAX',
  INTEREST: 'INTEREST',
  COMPENSATION: 'COMPENSATION',
  FEE: 'FEE',
  TRADE: 'TRADE',
  FX: 'FX',
  CASH_SWEEP: 'CASH_SWEEP',
  RESERVATION: 'RESERVATION',
  SECURITIES_LENDING: 'SECURITIES_LENDING',
  CORPORATE_ACTION: 'CORPORATE_ACTION',
  UNKNOWN: 'UNKNOWN',
};

/**
 * `external`  -> counts towards netExternalCashflow (deposits/withdrawals).
 * `inCash`    -> the row's `change` moves the cash balance we track.
 *
 * Cash sweeps default to inCash:false. A sweep moves money between the DEGIRO
 * cash account and the flatex bank account; DEGIRO books both legs, so counting
 * them would double the balance. If your reconciliation comes out exactly wrong
 * by the sweep total, flip this one flag.
 */
const CATEGORY_META = {
  [CATEGORY.DEPOSIT]: { external: true, inCash: true },
  [CATEGORY.WITHDRAWAL]: { external: true, inCash: true },
  [CATEGORY.DIVIDEND]: { external: false, inCash: true },
  [CATEGORY.DIVIDEND_TAX]: { external: false, inCash: true },
  [CATEGORY.INTEREST]: { external: false, inCash: true },
  [CATEGORY.FEE]: { external: false, inCash: true },
  [CATEGORY.TRADE]: { external: false, inCash: true },
  [CATEGORY.FX]: { external: false, inCash: true },
  /**
   * DEGIRO's cash-fund compensation: it promised cash held in the money-market
   * funds (and later at flatex) would not lose value, and pays the losses back
   * as one credit. US-84's capture decided both flags: the credit sat inside
   * DEGIRO's cash balance (`inCash: true` — leaving it out is exactly the five
   * cents that account was red by), and DEGIRO's own `totalDepositWithdrawal`
   * excluded it while its lifetime W/V included it (`external: false` — it is
   * income, not a deposit; rule 3 says a wrong guess here fabricates profit).
   */
  [CATEGORY.COMPENSATION]: { external: false, inCash: true },
  [CATEGORY.CASH_SWEEP]: { external: false, inCash: false },
  /**
   * "Reservation iDEAL": DEGIRO fronts you the money so you can trade while an
   * iDEAL transfer clears, then reverses it when the real deposit lands. Seen
   * 224 times in one account, 112 positive and 112 negative, summing to exactly
   * zero, each negative paired next-day with a real DEPOSIT of the same amount.
   *
   * external:false — the paired DEPOSIT already counts the money; counting this
   * too would double every deposit.
   * inCash:false  — the advance is a receivable, not net worth. Counting it
   * would put a phantom gain on the day it appears and an equal phantom loss on
   * the day it reverses.
   */
  [CATEGORY.RESERVATION]: { external: false, inCash: false },
  /** Income from lending out your shares. Internal, like interest. */
  [CATEGORY.SECURITIES_LENDING]: { external: false, inCash: true },
  [CATEGORY.CORPORATE_ACTION]: { external: false, inCash: true },
  [CATEGORY.UNKNOWN]: { external: false, inCash: true },
};

/** Lowercase, strip diacritics, collapse whitespace. */
function normalise(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ordered rules. First match wins, so the specific patterns come before the
 * general ones ("dividendbelasting" must beat "dividend").
 */
const RULES = [
  // --- taxes on dividend, before plain dividend ---
  { re: /dividendbelasting|withholding tax|dividend tax|belasting op dividend/, cat: CATEGORY.DIVIDEND_TAX },

  // --- dividend & coupons ---
  { re: /\bdividend\b|coupon|uitkering/, cat: CATEGORY.DIVIDEND },

  // --- fees ---
  {
    re: /transactiekosten|transaction (and\/or )?(third party )?fee|aansluitingskosten|exchange connection fee|connectivity fee|servicekosten|service fee|bewaarloon|custody fee|kosten van derden|reservation fee|degiro courtage|courtage/,
    cat: CATEGORY.FEE,
  },

  // --- interest ---
  { re: /\brente\b|interest|negatieve rente|debetrente/, cat: CATEGORY.INTEREST },

  // --- income from lending shares out; before the generic patterns ---
  { re: /securities lending|effectenuitleen|inkomsten uit securities/, cat: CATEGORY.SECURITIES_LENDING },

  // --- an advance against an incoming transfer, reversed when it clears ---
  // Must beat the DEPOSIT rule below: "Reservation iDEAL" contains "ideal".
  { re: /^reservation |reservering|reservation ideal/, cat: CATEGORY.RESERVATION },

  // --- DEGIRO paying back what the cash funds lost ---
  // Must beat the CASH_SWEEP rule below: "DEGIRO Geldmarktfondsen Compensatie"
  // contains "geldmarktfonds", and a real account's compensation spent years
  // classified as a sweep — held out of the cash balance, which was the larger
  // half of a reconciliation stuck at −0,05 (US-84). The English wording is
  // unconfirmed by a capture; the Dutch is verbatim from one.
  { re: /geldmarktfonds(en)? compensatie|(money market|cash) fund compensation/, cat: CATEGORY.COMPENSATION },

  // --- internal transfer between DEGIRO cash and the flatex bank account ---
  {
    re: /cash sweep|geldmarktfonds|money market fund|flatex (deposit|withdrawal)|degiro cash sweep transfer|terugstorting flatex/,
    cat: CATEGORY.CASH_SWEEP,
  },

  // --- external money out ---
  // Before DEPOSIT: "terugstorting" contains "storting", and a withdrawal
  // booked as a deposit would show up as a phantom loss on the P/L chart.
  { re: /withdrawal|terugstorting|opname|uitbetaling|payout/, cat: CATEGORY.WITHDRAWAL },

  // --- external money in ---
  { re: /ideal ?deposit|sofort ?deposit|\bstorting\b|bijstorting|deposit|inleg/, cat: CATEGORY.DEPOSIT },

  // --- currency conversion legs ---
  { re: /valuta ?(debitering|creditering|verhandeling)|currency (debit|credit|exchange)|fx /, cat: CATEGORY.FX },

  // --- the cash leg of a trade ---
  { re: /\bkoop\b|\bverkoop\b|\bbuy\b|\bsell\b|aankoop|purchase/, cat: CATEGORY.TRADE },

  // --- splits, mergers, spin-offs ---
  { re: /split|merger|fusie|spin-?off|corporate action|naamswijziging|isin change/, cat: CATEGORY.CORPORATE_ACTION },
];

/** `type` field fallbacks, used only when the description matched nothing. */
const TYPE_FALLBACK = {
  transaction: CATEGORY.TRADE,
  cash_transaction: CATEGORY.UNKNOWN,
  cash_fund_transaction: CATEGORY.CASH_SWEEP,
  flatex_cash_sweep: CATEGORY.CASH_SWEEP,
  payment: CATEGORY.DEPOSIT,
};

/**
 * Classify one raw account-overview row.
 * @param {{description?: string, type?: string, change?: number, productId?: any}} row
 * @returns {string} a CATEGORY value
 */
export function classifyCashRow(row) {
  const desc = normalise(row?.description);
  for (const rule of RULES) {
    if (rule.re.test(desc)) return rule.cat;
  }

  // A row bound to a product with no matching description is almost always the
  // cash leg of a trade.
  const type = normalise(row?.type).replace(/[ -]/g, '_');
  if (TYPE_FALLBACK[type] && TYPE_FALLBACK[type] !== CATEGORY.UNKNOWN) return TYPE_FALLBACK[type];
  if (row?.productId != null && row.productId !== '') return CATEGORY.TRADE;

  return CATEGORY.UNKNOWN;
}

export function isExternal(category) {
  return CATEGORY_META[category]?.external === true;
}

export function affectsCash(category) {
  return CATEGORY_META[category]?.inCash !== false;
}
