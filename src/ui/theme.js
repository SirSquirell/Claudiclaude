/**
 * Chart.js needs colour values, not CSS variables, so this module reads the
 * tokens back out of styles.css. One source of truth, and a theme change is a
 * re-read plus a chart update rather than a second palette in JS.
 *
 * It also owns the two display preferences — theme and anonymize — because both
 * are read by the formatters that live here and neither is account data.
 */

import { maskEur, maskQty, maskSigned } from '../lib/anon.js';

const read = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function tokens() {
  return {
    surface: read('--surface-1'),
    text: read('--text-primary'),
    textSecondary: read('--text-secondary'),
    muted: read('--text-muted'),
    grid: read('--grid'),
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
  applyTheme(value);
  return value;
}

/** Put the preference on `<html>`, where the stylesheet is waiting for it. */
export function applyTheme(pref = getTheme()) {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = pref;
}
