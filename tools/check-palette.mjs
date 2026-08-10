#!/usr/bin/env node
import { readFileSync } from 'node:fs';
/**
 * Measure a categorical palette instead of trusting it.
 *
 *   node tools/check-palette.mjs
 *
 * CLAUDE.md calls the current palette "the validated reference instance" and
 * records that slots 3–5 sit below 3:1 on the light surface, with the holdings
 * table as the relief. That claim was made once, by hand. This is the check as
 * a command, so a replacement palette can be held to the same standard rather
 * than to whether it looks nice in a mockup.
 *
 * Two questions, both answerable arithmetically:
 *
 *  1. **Contrast against the surface it is drawn on.** WCAG relative luminance.
 *     3:1 is the threshold for a graphical object; below it a band or a line
 *     is hard to separate from the background.
 *  2. **Do two slots collapse into each other for a colour-blind reader?**
 *     Simulated with the Brettel/Viénot matrices for protanopia, deuteranopia
 *     and tritanopia, then compared by CIE76 ΔE in Lab. Two categorical colours
 *     that a reader cannot tell apart are the same colour, whatever the hex
 *     says — and this project draws up to eight bands at once.
 *
 * It prints and exits non-zero on a collision, because a collision is a defect
 * rather than a preference. Contrast below 3:1 is reported and does not fail:
 * this project accepts it deliberately, with the table as the relief.
 */

/** ΔE below this and two simulated colours are the same colour to that reader. */
const COLLISION_DE = 11;
/** WCAG's contrast floor for a graphical object. */
const MIN_CONTRAST = 3;

const hex = (h) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h.trim());
  if (!m) throw new Error(`not a hex colour: ${h}`);
  return [1, 2, 3].map((i) => Number.parseInt(m[i], 16) / 255);
};

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

// --- colour-vision simulation ----------------------------------------------
// Viénot, Brettel & Mollon (1999), applied in linear RGB.
const CVD = {
  protanopia: [0.1121, 0.8853, -0.0005, 0.1127, 0.8897, -0.0001, 0.0045, 0.0085, 1.0000],
  deuteranopia: [0.2920, 0.7054, -0.0003, 0.2934, 0.7089, 0.0000, -0.0209, 0.0257, 0.9959],
  tritanopia: [1.0000, 0.1591, -0.1934, 0.0000, 0.8827, 0.1158, 0.0000, 0.5609, 0.4391],
};
const simulate = (rgb, m) => {
  const [r, g, b] = rgb.map(toLinear);
  const out = [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
  return out.map((c) => toSrgb(Math.min(1, Math.max(0, c))));
};

// --- CIE76 -----------------------------------------------------------------
const toLab = (rgb) => {
  const [r, g, b] = rgb.map(toLinear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const deltaE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

/**
 * @param {string} name
 * @param {Record<string,string>} slots  label -> hex, the categorical set
 * @param {string} surface  hex the set is drawn on
 * @param {Record<string,string>} pairs  label -> hex, checked for contrast only
 */
export function checkPalette(name, slots, surface, pairs = {}) {
  const lines = [];
  let collisions = 0;
  const surfaceRgb = hex(surface);
  lines.push(`\n=== ${name} — on ${surface} ===`);

  lines.push('\n  contrast against the surface (3:1 is the floor for a graphical object)');
  for (const [label, h] of Object.entries({ ...slots, ...pairs })) {
    const c = contrast(hex(h), surfaceRgb);
    lines.push(`    ${label.padEnd(12)} ${h}  ${c.toFixed(2)}:1  ${c >= MIN_CONTRAST ? 'ok' : 'BELOW 3:1'}`);
  }

  const entries = Object.entries(slots);
  for (const [kind, m] of Object.entries(CVD)) {
    const bad = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = deltaE(simulate(hex(entries[i][1]), m), simulate(hex(entries[j][1]), m));
        if (d < COLLISION_DE) bad.push(`${entries[i][0]}~${entries[j][0]} ΔE ${d.toFixed(1)}`);
      }
    }
    collisions += bad.length;
    lines.push(`\n  ${kind.padEnd(13)} ${bad.length ? 'COLLIDES: ' + bad.join(', ') : 'all slots distinguishable'}`);
  }
  return { lines, collisions };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-palette.mjs');
if (invokedDirectly) {
  // Read out of styles.css rather than restated here, so the check cannot pass
  // against a palette the page does not actually use.
  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  const blocks = css.split(':root');
  const tok = (block, name) => {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block);
    if (!m) throw new Error(`--${name} not found`);
    return m[1];
  };
  const setFrom = (block) => ({
    c1: tok(block, 'series-1'), c2: tok(block, 'series-2'), c3: tok(block, 'series-3'),
    c4: tok(block, 'series-4'), c5: tok(block, 'series-5'), c6: tok(block, 'series-6'),
    c7: tok(block, 'series-7'), cash: tok(block, 'series-cash'),
  });
  const light = blocks[1];
  const dark = blocks[blocks.length - 1];

  let total = 0;
  for (const [label, slots, surface, pairs] of [
    ['shipped palette (light)', setFrom(light), tok(light, 'surface-1'), { gain: tok(light, 'pos'), loss: tok(light, 'neg') }],
    ['shipped palette (dark)', setFrom(dark), tok(dark, 'surface-1'), { gain: tok(dark, 'pos'), loss: tok(dark, 'neg') }],
  ]) {
    const { lines, collisions } = checkPalette(label, slots, surface, pairs);
    console.log(lines.join('\n'));
    total += collisions;
  }
  console.log(`\n${total === 0 ? 'no categorical collisions' : `${total} collision(s) — two visible series a reader cannot separate`}`);
  process.exit(total === 0 ? 0 : 1);
}

// The palette was solved and repaired with two functions that lived here for
// the length of one afternoon: a farthest-point search, whose output was
// measurably perfect and visually unusable, and a minimal-move repair that
// produced the hexes now in styles.css. Both were run once, interactively, and
// then had no caller.
//
// They are deleted rather than kept. Rule 8: an abstraction with no caller is a
// branch no test covers, and this is the file that enforces that rule. The
// history has them if a palette ever needs solving again, and `git log` is a
// cheaper place to keep them than this file.
