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

// ---------------------------------------------------------------------------
// solving, rather than choosing between two sets that both fail
// ---------------------------------------------------------------------------

const fromLab = (L, a, bb) => {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - bb / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const [x, y, z] = [inv(fx) * 0.95047, inv(fy), inv(fz) * 1.08883];
  const lin = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
  return lin.map((c) => toSrgb(Math.min(1, Math.max(0, c))));
};
const toHex = (rgb) =>
  '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
const inGamut = (L, a, bb) => {
  const lin = fromLab(L, a, bb);
  return deltaE(hex(toHex(lin)), lin) < 2;
};

/** Smallest separation this colour has from any already-chosen one, worst case over CVD. */
const worstSeparation = (candidate, chosen) => {
  let worst = Infinity;
  for (const other of chosen) {
    for (const m of Object.values(CVD)) {
      worst = Math.min(worst, deltaE(simulate(candidate, m), simulate(other, m)));
    }
    // and in ordinary vision, so two slots are not merely CVD-safe but identical
    worst = Math.min(worst, deltaE(candidate, other));
  }
  return worst;
};

/**
 * Build a categorical set that survives the check, rather than picking the less
 * bad of two that do not.
 *
 * Greedy farthest-point selection over a Lab grid: repeatedly take the
 * candidate whose worst-case separation from everything already chosen is
 * largest, having first dropped anything that cannot clear 3:1 on the surface.
 * Deterministic — the grid is fixed and there is no randomness, so the same
 * palette comes out every run and can be committed as data.
 */
export function solvePalette(surface, { count = 8, minContrast = MIN_CONTRAST, seed = [] } = {}) {
  const surfaceRgb = hex(surface);
  const candidates = [];
  for (let L = 30; L <= 80; L += 2.5) {
    for (let C = 20; C <= 90; C += 5) {
      for (let h = 0; h < 360; h += 6) {
        const a = C * Math.cos((h * Math.PI) / 180);
        const bb = C * Math.sin((h * Math.PI) / 180);
        if (!inGamut(L, a, bb)) continue;
        const rgb = fromLab(L, a, bb);
        if (contrast(rgb, surfaceRgb) < minContrast) continue;
        candidates.push(rgb);
      }
    }
  }
  const chosen = seed.map(hex);
  while (chosen.length < count) {
    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
      const score = chosen.length ? worstSeparation(c, chosen) : contrast(c, surfaceRgb);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    chosen.push(best);
  }
  return { hexes: chosen.map(toHex), candidates: candidates.length };
}

/**
 * Repair a designed palette instead of replacing it.
 *
 * The solver above maximises separation and produces an acid-green, saturated
 * set with a purple for cash — measurably perfect and visually incoherent. That
 * is the honest limit of optimising one number: separation is a constraint the
 * palette must satisfy, not the thing it is for.
 *
 * So this keeps the designer's colour and moves it the smallest distance that
 * clears the collision — bounded to a neighbourhood in lightness and chroma,
 * hue held within a few degrees so a blue stays a blue. `fixed` slots are never
 * moved: cash is a neutral by rule, and the diverging pair is the one thing the
 * whole project is built around.
 */
export function repairPalette(slots, surface, { fixed = [], minContrast = MIN_CONTRAST } = {}) {
  const surfaceRgb = hex(surface);
  const labOf = (h) => toLab(hex(h));
  const out = { ...slots };
  const order = Object.keys(slots).filter((k) => !fixed.includes(k));

  const collidesWith = (candidate, exclude) => {
    for (const [k, h] of Object.entries(out)) {
      if (k === exclude) continue;
      for (const m of Object.values(CVD)) {
        if (deltaE(simulate(candidate, m), simulate(hex(h), m)) < COLLISION_DE) return true;
      }
      if (deltaE(candidate, hex(h)) < COLLISION_DE) return true;
    }
    return false;
  };

  for (const key of order) {
    if (!collidesWith(hex(out[key]), key)) continue;
    const [L0, a0, b0] = labOf(out[key]);
    const C0 = Math.hypot(a0, b0);
    const h0 = (Math.atan2(b0, a0) * 180) / Math.PI;
    let best = null;
    let bestMove = Infinity;
    for (let dL = -26; dL <= 26; dL += 2) {
      for (let dC = -20; dC <= 30; dC += 2) {
        for (let dh = -14; dh <= 14; dh += 2) {
          const L = L0 + dL;
          const C = Math.max(12, C0 + dC);
          const hh = ((h0 + dh) * Math.PI) / 180;
          if (!inGamut(L, C * Math.cos(hh), C * Math.sin(hh))) continue;
          const rgb = fromLab(L, C * Math.cos(hh), C * Math.sin(hh));
          if (contrast(rgb, surfaceRgb) < minContrast) continue;
          if (collidesWith(rgb, key)) continue;
          const move = Math.hypot(dL, dC, dh * 1.5);
          if (move < bestMove) {
            bestMove = move;
            best = rgb;
          }
        }
      }
    }
    if (best) out[key] = toHex(best);
  }
  return out;
}
