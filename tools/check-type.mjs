#!/usr/bin/env node
/**
 * US-58 — the type scale, measured rather than asserted.
 *
 * The standing example in this repo is the palette: *"the palette is measured,
 * not asserted… a comment is not a check"* (CLAUDE.md, Charts). That line was
 * written after the dark half turned out to have five collisions while a comment
 * claimed it was validated. Type gets the same treatment for the same reason.
 *
 * The values this checks were already correct and already in `styles.css` before
 * US-58 — scattered across the rules that used them. What was missing was
 * anything that would notice them collapsing back to one global value, which is
 * the exact failure mode: a single `letter-spacing` is wrong somewhere, and on
 * the biggest number on the page it is wrong most visibly.
 *
 *   npm run type
 *
 * Reads `src/ui/styles.css` rather than restating the scale here, so the check
 * cannot pass against a scale the page does not use.
 */

import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

/** A rule's selector and its declaration block, for every top-level rule. */
function rules(text) {
  const out = [];
  // Comments first: a declaration inside one is not a declaration.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  return out;
}

const all = rules(css);

/** The token block, and `var()` aliases resolved one level — which is all there is. */
const tokens = new Map();
for (const r of all) {
  if (!/^:root/.test(r.selector)) continue;
  for (const [, name, value] of r.body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (!tokens.has(name)) tokens.set(name, value.trim());
  }
}

const resolve = (value, depth = 0) => {
  const v = String(value).trim();
  const alias = /^var\((--[\w-]+)\)$/.exec(v);
  if (alias && depth < 4) return resolve(tokens.get(alias[1]) ?? '', depth + 1);
  return v;
};

/** `em`, `rem` and a bare number all reduce to a number for comparison. */
const num = (value) => {
  const v = resolve(value);
  const m = /^(-?[\d.]+)(em|rem)?$/.exec(v);
  return m ? Number(m[1]) : NaN;
};

const problems = [];
const note = (ok, message) => {
  if (!ok) problems.push(message);
  return ok;
};

// --- the buckets exist, and they are a scale rather than four names for one value
const TRACK = ['--track-display', '--track-title', '--track-body', '--track-label'];
const LEAD = ['--lead-display', '--lead-body', '--lead-label'];
for (const name of [...TRACK, ...LEAD]) {
  note(tokens.has(name), `${name} is not defined; the scale has lost a bucket`);
}

const track = Object.fromEntries(TRACK.map((n) => [n, num(tokens.get(n))]));
const lead = Object.fromEntries(LEAD.map((n) => [n, num(tokens.get(n))]));

note(track['--track-display'] < 0, `display tracking is ${track['--track-display']}em, and it has to be negative`);
note(track['--track-label'] > 0, `label tracking is ${track['--track-label']}em; small caps need positive tracking`);
note(Math.abs(track['--track-body']) <= 0.005, `body tracking is ${track['--track-body']}em, which is not near zero`);
note(
  track['--track-display'] < track['--track-title'] && track['--track-title'] <= track['--track-body']
    && track['--track-body'] < track['--track-label'],
  'the tracking buckets are not a monotone scale from display to label',
);
note(lead['--lead-display'] < lead['--lead-body'], 'display leading is not tighter than body leading');

// --- no fixed global letter-spacing
for (const r of all) {
  if (!/^(\*|html|body)$/.test(r.selector)) continue;
  const m = /letter-spacing:\s*([^;]+);/.exec(r.body);
  if (!m) continue;
  note(
    /^var\(--track-/.test(m[1].trim()),
    `\`${r.selector}\` sets a fixed letter-spacing (${m[1].trim()}); tracking is size-specific, not global`,
  );
}

/**
 * Display sizes carry negative tracking.
 *
 * "Display" is any rule sized from the KPI token or set at 1.5rem or more.
 * `--kpi` is raised per context (a hero tile takes it to 3.5rem), so the token
 * is the signal rather than the number at the point of use.
 */
const DISPLAY_REM = 1.5;
const isDisplay = (value) => /--kpi|--hero/.test(value) || (num(value) >= DISPLAY_REM && /rem/.test(resolve(value)));

let displaysChecked = 0;
for (const r of all) {
  const size = /font-size:\s*([^;]+);/.exec(r.body);
  if (!size || !isDisplay(size[1])) continue;
  displaysChecked++;
  const ls = /letter-spacing:\s*([^;]+);/.exec(r.body);
  note(!!ls, `\`${r.selector}\` is display-sized and sets no tracking at all`);
  if (ls) {
    note(num(ls[1]) < 0, `\`${r.selector}\` is display-sized but its tracking is ${resolve(ls[1])}`);
  }
}
note(displaysChecked > 0, 'no display-sized rule was found, so this check has stopped matching the stylesheet');

/**
 * The other direction, which the first version of this check did not ask — and a
 * browser found the defect it would have caught.
 *
 * `--kpi` is re-set in six contexts and the tracking was written once, on the
 * shared rule, at the display value. So a 17px amount was set at -0.025em:
 * display tracking on body-sized text, which is exactly the mistake bucketing
 * exists to prevent. A check that only asks "is display negative" passes that
 * happily.
 *
 * So: every context that sets `--kpi` must also state its bucket, and the size
 * and the bucket have to agree. That pair is statically checkable where the
 * computed value at the point of use is not.
 */
/**
 * Three bands, and the boundaries are the arbitrary part so they are stated here
 * rather than left implicit.
 *
 * `DISPLAY_REM` above is a *floor*: at 1.5rem and up, tracking has to be
 * negative at all. Which negative is a second question, and its boundary is
 * higher — 2.25rem (36px), because the page's own hero clamps to 38–56px and
 * that is the size -0.025em was chosen against. A 28px figure in a 320px panel
 * is a title, not a display: giving it the hero's tracking would be the same
 * one-value-fits-all mistake in the other direction.
 *
 * Both boundaries were moved once, when this check disagreed with the
 * stylesheet, and the *check* was wrong: 1.5rem is where negative starts, not
 * where display starts.
 */
const TITLE_REM = 1.125;
const DISPLAY_TRACK_REM = 2.25;
const bucketOf = (rem) => (rem >= DISPLAY_TRACK_REM ? 'display' : rem >= TITLE_REM ? 'title' : 'body');

/** The largest size a `clamp()`/`min()` can reach, which is the one to bucket by. */
const biggest = (value) => {
  const nums = [...String(resolve(value)).matchAll(/(-?[\d.]+)rem/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : NaN;
};

let pairsChecked = 0;
for (const r of all) {
  const kpi = /--kpi:\s*([^;]+);/.exec(r.body);
  if (!kpi) continue;
  const rem = biggest(kpi[1]);
  if (!Number.isFinite(rem)) continue;
  pairsChecked++;
  const trackDecl = /--kpi-track:\s*var\((--track-[\w-]+)\);/.exec(r.body);
  if (!note(!!trackDecl, `\`${r.selector}\` sets --kpi but not --kpi-track, so it inherits another size's tracking`)) continue;
  const stated = trackDecl[1].replace('--track-', '');
  const wanted = bucketOf(rem);
  note(
    stated === wanted,
    `\`${r.selector}\` is ${rem}rem (${wanted}) but tracked as ${stated}`,
  );
}
note(pairsChecked >= 4, 'the size/tracking pairing check has stopped finding the contexts that set --kpi');

// --- report
const lines = [
  'type scale (from src/ui/styles.css)',
  '',
  ...TRACK.map((n) => `  ${n.padEnd(18)} ${String(tokens.get(n)).padStart(8)}`),
  '',
  ...LEAD.map((n) => `  ${n.padEnd(18)} ${String(tokens.get(n)).padStart(8)}`),
  '',
  `  display-sized rules checked:      ${displaysChecked}`,
  `  size/tracking pairs checked:      ${pairsChecked}`,
];
console.log(lines.join('\n'));

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\ntype scale is size-bucketed');
