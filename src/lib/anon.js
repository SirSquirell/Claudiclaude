/**
 * Anonymize — the pure half.
 *
 * US-46. What a hidden number looks like, and nothing about when to hide it.
 *
 * The mechanism is **replacement, not blur**. A CSS blur leaves the real string
 * in the DOM: select it, copy it, open devtools, or hand the DOM to the snapshot
 * renderer in US-47, and the number is back. So the value never reaches the page
 * at all, and any blur is cosmetics over a mask that is already empty.
 *
 * Fixed width, deliberately. A mask that preserves digit count leaks the
 * magnitude, and the magnitude is most of what a screenshot gives away. That is
 * a decision rather than an accident, and reversing it is this file.
 */

/** The mask itself. Three dots read as "hidden" rather than as "broken". */
export const MASK = '•••';

/**
 * A masked amount, in whatever currency it was going to be shown in.
 *
 * The symbol stays visible on purpose (US-51 AC6): a ticker's trading currency
 * is public and discloses nothing about the account. What it prevents is a
 * dollar price masked as `€ •••`, which would hide the figure and keep the wrong
 * label — the exact defect US-51 is about, surviving inside the privacy feature.
 *
 * No symbol at all when the currency is unknown, for the same reason the visible
 * path shows none: a guessed sign is worse than a missing one.
 */
export const maskMoney = (symbol) => (symbol ? `${symbol} ${MASK}` : MASK);

/** A masked amount in the base currency. No figure, no width, no magnitude. */
export const maskEur = () => maskMoney('€');

/**
 * A masked amount that keeps its sign.
 *
 * The sign stays because hiding it would be theatre: every signed figure on the
 * page also carries a `pos`/`neg` class that colours it, so the direction is
 * already visible. Removing it from the text and leaving the colour would hide
 * nothing and look broken.
 */
export const maskSigned = (n) => `€ ${n > 0 ? '+' : n < 0 ? '-' : ''}${MASK}`;

/**
 * A masked quantity.
 *
 * Quantities are amounts in disguise: 137 shares of something with a price
 * anyone can look up is the value of the position. Masking the euros and
 * leaving the count is a feature that looks like it works and does not.
 */
export const maskQty = () => MASK;

/** Used by the tests: the AC3 assertion is over `textContent`, and this is it. */
export const hasDigits = (s) => /\d/.test(String(s));
