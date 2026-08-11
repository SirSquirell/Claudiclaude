/**
 * Chart.js needs colour values, not CSS variables, so this module reads the
 * tokens back out of styles.css. One source of truth, and a theme change is a
 * re-read plus a chart update rather than a second palette in JS.
 */

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

export const fmtEur = (n) => eur.format(n ?? 0);
export const fmtEurCents = (n) => eurCents.format(n ?? 0);
export const fmtSigned = (n) => `${n > 0 ? '+' : ''}${eurCents.format(n ?? 0)}`;
export const fmtPct = (n) => `${n > 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%`;

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
