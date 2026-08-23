/**
 * Effective dividend withholding-tax rate, per position (US-106).
 *
 * Rule 4's discipline, restated for a tax rate instead of a cash-row category:
 * never guess a country, silently assume a rate, or net two different figures
 * into one — an unrecognised input is `null` and says so.
 *
 * **GLEIF is the real source for issuer country (US-103) and is not used
 * here.** This session's network policy blocks `api.gleif.org` (a 403 at the
 * proxy, checked directly rather than assumed), so the shape of GLEIF's
 * ISIN-to-LEI response could not be spiked — and SPEC §8e's own rule is to
 * confirm a real response shape before writing a parser, not after. Until
 * that spike happens, `isinCountry` below is the fallback AC1 already names:
 * the ISIN's own prefix, which is where the security is *registered*, not
 * who withholds — good enough to unblock this story, but every caller must
 * mark it uncertain, never present it as the measured GLEIF figure.
 *
 * Pure module: no I/O, no Chrome APIs.
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * ISO 6166: an ISIN's first two characters are the ISO 3166-1 alpha-2 code of
 * the country its registration agency belongs to — a stable, documented
 * standard, unlike the response shape of any one API. Fallback-only (see
 * module note): a security can be registered in one country and issued by a
 * company incorporated in another, which is exactly the distinction GLEIF's
 * issuer-jurisdiction data exists to make correctly.
 */
export function isinCountry(isin) {
  return typeof isin === 'string' && /^[A-Z]{2}/.test(isin) ? isin.slice(0, 2) : null;
}

/**
 * The Netherlands' tax-treaty ceiling on *portfolio* dividends (a holding
 * below the "substantial interest" threshold, which is what this project's
 * accounts are), by the issuer's country. 15% is the OECD Model Convention's
 * standard portfolio-dividend rate and the one the Netherlands' treaties with
 * every country here actually use, except the United Kingdom, which levies no
 * withholding tax on ordinary share dividends at all.
 *
 * **This is the treaty ceiling, not necessarily what was actually withheld.**
 * A broker without automatic relief-at-source withholds the source country's
 * own domestic rate, which for most of these is higher than 15% — the gap is
 * what `withholdingSplit` below calls reclaimable, and it is read off the
 * account's own real figures, never estimated from this table.
 *
 * Covers AC1's stated minimum (NL, US, DE, FR, BE, CH, GB). Anything else is
 * `null` — "cannot be determined," never a guessed default.
 */
export const TREATY_RATE = {
  NL: 0.15,
  US: 0.15,
  DE: 0.15,
  FR: 0.15,
  BE: 0.15,
  CH: 0.15,
  GB: 0,
};

/** The US's own statutory rate, which applies without a valid W-8BEN on file (AC2). */
export const US_STATUTORY_RATE = 0.3;

/**
 * @param {string|null} countryCode
 * @param {{hasW8BEN?: boolean}} opts
 * @returns {number|null} the treaty rate, or `null` if the country is not covered
 */
export function treatyRateFor(countryCode, { hasW8BEN = true } = {}) {
  if (countryCode === 'US') return hasW8BEN ? TREATY_RATE.US : US_STATUTORY_RATE;
  return TREATY_RATE[countryCode] ?? null;
}

/**
 * Gross dividend and what was actually withheld (both real, measured
 * per-product figures — US-102), split into what the treaty ceiling already
 * accounts for and what sits above it: practically lost versus reclaimable
 * from the source country's tax authority (AC3). Never netted into one "tax
 * paid" number — a reader deciding whether reclaiming is worth the paperwork
 * needs both figures, not their difference.
 *
 * @param {{gross: number, actualWithheld: number, countryCode: string|null, hasW8BEN?: boolean, manualRate?: number|null}} args
 *   `actualWithheld` is positive — the amount of tax that left, not the
 *   negative `change` the engine stores it as. `manualRate` (0–1) is a
 *   reader-entered rate for a country this module has none for — it never
 *   overrides a rate this module already knows, only fills the gap where
 *   `treatyRateFor` would otherwise return `null`.
 * @returns {{treatyRate: number|null, reclaimable: number|null, practicallyLost: number, reason: string|null}}
 */
export function withholdingSplit({ gross, actualWithheld, countryCode, hasW8BEN = true, manualRate = null }) {
  const rate = treatyRateFor(countryCode, { hasW8BEN }) ?? manualRate;
  if (rate == null || !(gross > 0)) {
    return { treatyRate: null, reclaimable: null, practicallyLost: round2(actualWithheld), reason: 'unknown-country' };
  }
  const ceiling = gross * rate;
  const reclaimable = Math.max(0, round2(actualWithheld - ceiling));
  return {
    treatyRate: rate,
    reclaimable,
    practicallyLost: round2(actualWithheld - reclaimable),
    reason: null,
  };
}
