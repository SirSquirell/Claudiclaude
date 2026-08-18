/**
 * Chart.js needs colour values, not CSS variables, so this module reads the
 * tokens back out of styles.css. One source of truth, and a theme change is a
 * re-read plus a chart update rather than a second palette in JS.
 *
 * It also owns the two display preferences — theme and anonymize — because both
 * are read by the formatters that live here and neither is account data.
 */

import { maskEur, maskMoney, maskQty, maskSigned } from '../lib/anon.js';

const read = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function tokens() {
  return {
    surface: read('--surface-1'),
    text: read('--text-primary'),
    textSecondary: read('--text-secondary'),
    muted: read('--text-muted'),
    grid: read('--grid'),
    /** The track a composition bar is drawn on. Same token the table uses. */
    surface3: read('--surface-3'),
    axis: read('--axis'),
    pos: read('--pos'),
    neg: read('--neg'),
    cash: read('--series-cash'),
    /** Asteria. Read like every other token, so the watermark follows the theme
     *  without any code deciding which theme it is. */
    brandInk: read('--brand-ink'),
    brandAccent: read('--brand-accent'),
    /** Categorical slots, in fixed order. Never cycled: a 8th holding folds
     *  into "Other" instead of borrowing a hue that is already taken. */
    series: [1, 2, 3, 4, 5, 6, 7].map((i) => read(`--series-${i}`)),
  };
}

/** rgba() version of a hex token, for area fills. */
export function alpha(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const [r, g, b] = [1, 2, 3].map((i) => Number.parseInt(m[i], 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qtyFmt = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 4 });

/**
 * US-51. A traded price, in the currency it was actually traded in.
 *
 * The transactions table used to render the price through `fmtEurCents`, which
 * is hardwired to EUR — so a fill at `$ 3,105` read `€ 3,11` and nothing said no
 * conversion had happened. The arithmetic was never wrong: the engine values
 * positions through the product's currency and takes each row's euro figure from
 * DEGIRO's own base-currency total. It was a true number wearing the wrong sign,
 * and a reader who multiplied it by the quantity could not reconcile it with the
 * amount beside it.
 *
 * Two things this does that `fmtEurCents` cannot:
 *
 *  - **Four decimals.** `$ 3,105` and `$ 3,12` both round to `3,11`-ish at two,
 *    which made two different fills look like the same one. A price is not an
 *    amount. Minimum two, so ordinary prices do not grow a ragged tail.
 *  - **No currency at all when it is unknown.** `Intl` throws on a code it does
 *    not know, and the fallback is a bare number rather than a plausible euro
 *    sign — CLAUDE.md rule 4 applied to a label.
 *
 * It lives here rather than at the call site because US-46 put every money
 * format inside this module and `test/anon-brand-snapshot.js` enforces it: one
 * inline `Intl.NumberFormat` with a currency and the mask has a hole.
 */
const priceFmts = new Map();

const priceFmt = (ccy) => {
  if (priceFmts.has(ccy)) return priceFmts.get(ccy);
  const digits = { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  let entry;
  try {
    if (!ccy) throw new Error('no currency');
    const f = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: ccy, ...digits });
    const symbol = f.formatToParts(0).find((p) => p.type === 'currency')?.value ?? ccy;
    entry = { format: (n) => f.format(n), symbol };
  } catch {
    const f = new Intl.NumberFormat('nl-NL', digits);
    entry = { format: (n) => f.format(n), symbol: null };
  }
  priceFmts.set(ccy, entry);
  return entry;
};

export const fmtPrice = (n, ccy = null) => {
  const f = priceFmt(ccy);
  return anonymized ? maskMoney(f.symbol) : f.format(n ?? 0);
};

/**
 * The formatters, and the reason US-46 is a small story.
 *
 * Every figure on the page already came through here — 86 call sites across
 * `app.js`, `charts.js` and `popup.js`. Putting the mask *inside* the formatter
 * rather than on the elements means a money field added next year is masked
 * because it had to call `fmtEurCents` to be money at all. That is CLAUDE.md
 * rule 7's allowlist applied to a screen; the alternative is a list of spans to
 * blur, which is a denylist, and a denylist encodes its own next failure.
 *
 * `test/anon.test.js` enforces the other half: no currency formatting anywhere
 * else under `src/ui/`.
 */
export const fmtEur = (n) => (anonymized ? maskEur() : eur.format(n ?? 0));
export const fmtEurCents = (n) => (anonymized ? maskEur() : eurCents.format(n ?? 0));
export const fmtSigned = (n) => (anonymized ? maskSigned(n ?? 0) : `${n > 0 ? '+' : ''}${eurCents.format(n ?? 0)}`);

/**
 * A share count. Not masked because it is money — masked because it *becomes*
 * money the moment it meets a public price.
 */
export const fmtQty = (n) => (anonymized ? maskQty() : qtyFmt.format(n ?? 0));

/**
 * Percentages are never masked. They are the point of the feature: someone can
 * say 340 % without saying on what.
 */
export const fmtPct = (n) => `${n > 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%`;

// --- anonymize -------------------------------------------------------------

/**
 * US-46. A display preference, stored like the theme and next to it.
 *
 * Cached in a module variable rather than read from `localStorage` per call:
 * the formatters run thousands of times per render.
 */
const ANON_KEY = 'degiro-portfolio.anonymize';

let anonymized = (() => {
  try {
    return localStorage.getItem(ANON_KEY) === '1';
  } catch {
    // Storage can be blocked outright. Showing the figures is the right
    // fallback: a privacy toggle that silently turns itself *on* looks like a
    // broken page, and the reader can always turn it on again.
    return false;
  }
})();

export const getAnonymize = () => anonymized;

export function setAnonymize(on) {
  anonymized = on === true;
  try {
    localStorage.setItem(ANON_KEY, anonymized ? '1' : '0');
  } catch {
    /* the attribute below still applies for this page's lifetime */
  }
  applyAnonymize();
  return anonymized;
}

/**
 * Run `fn` with the mask forced on or off, then put it back.
 *
 * US-54's one piece of plumbing. The share sheet has its own amount toggle,
 * defaulting to hidden because a card is a different audience from a screen — so
 * it needs a tile's figure *as the sheet is set*, not as the page happens to be
 * set. The figures are strings the formatters already produced, and the
 * formatters read this module variable, so the only way to ask for the other
 * version is to ask them again with it flipped.
 *
 * Synchronous and restored in a `finally`, which is what makes it safe: nothing
 * can paint between the flip and the restore, exactly as `tokensForTheme` flips
 * the theme attribute to read the other palette. Do not make it async — an
 * `await` inside would leak the flipped state into whatever ran meanwhile, and
 * that state decides whether an amount is shown.
 *
 * It deliberately does not touch storage or the DOM attribute: this is a read of
 * the other version, not a change of preference.
 */
export function withAnonymize(on, fn) {
  const before = anonymized;
  anonymized = on === true;
  try {
    return fn();
  } finally {
    anonymized = before;
  }
}

/** Put the state on `<html>`, so the stylesheet can style a mask without any
 *  element needing to know what it contains. */
export function applyAnonymize() {
  const root = document.documentElement;
  if (anonymized) root.dataset.anon = 'on';
  else delete root.dataset.anon;
}

/** Re-run `fn` whenever the OS theme flips, so charts re-read their tokens. */
export function onThemeChange(fn) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
}

// --- light / dark ----------------------------------------------------------

/**
 * Which theme the reader has asked for: `'auto'`, `'light'` or `'dark'`.
 *
 * `auto` is the default and it is a real third state, not a synonym for one of
 * the other two. styles.css is already written for exactly these three — the
 * dark tokens appear once under `prefers-color-scheme` guarded by
 * `:not([data-theme='light'])`, and again under `[data-theme='dark']` — so a
 * reader whose OS flips at sunset keeps following it unless they say otherwise.
 * Nothing had ever set the attribute, which is why the page followed the OS and
 * only the OS.
 *
 * Stored in localStorage: it is a display preference, not account data, and it
 * has to survive a page the extension opens fresh every time.
 */
const THEME_KEY = 'degiro-portfolio.theme';
export const THEMES = ['auto', 'light', 'dark'];

export function getTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : 'auto';
  } catch {
    // Storage can be blocked outright. Following the OS is the right fallback.
    return 'auto';
  }
}

export function setTheme(pref) {
  const value = THEMES.includes(pref) ? pref : 'auto';
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* the attribute below still applies for this page's lifetime */
  }
  crossFade();
  applyTheme(value);
  return value;
}

/**
 * US-74 — the theme change is the app's one abrupt brightness jump.
 *
 * Near-white to near-black in a single frame, and §14 names that specifically.
 * It is also *rare* — a handful of times ever — which is exactly where a little
 * cost is affordable, and why this is the one transition that deliberately
 * survives `prefers-reduced-motion`: it is colour with no travel, and the thing
 * it protects against is the jump itself.
 *
 * A class rather than a permanent transition on every surface, for AC3: without
 * it the first paint fades in from whatever the stylesheet's default was, so
 * every load would open with the wrong theme dissolving. It is only ever added
 * here, by a deliberate switch.
 *
 * Removed on a timer and this is the one place that is right: nothing waits for
 * it, nothing is stuck if it never fires, and the alternative — `transitionend`
 * — fires once per property per element, which is hundreds of events for one
 * fade.
 */
const FADE_MS = 220;
let fadeTimer = null;

function crossFade() {
  const root = document.documentElement;
  root.dataset.themeFade = 'on';
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => delete root.dataset.themeFade, FADE_MS + 60);
}

/** Put the preference on `<html>`, where the stylesheet is waiting for it. */
export function applyTheme(pref = getTheme()) {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = pref;
}
