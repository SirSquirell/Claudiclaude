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

// --- report
const lines = [
  'type scale (from src/ui/styles.css)',
  '',
  ...TRACK.map((n) => `  ${n.padEnd(18)} ${String(tokens.get(n)).padStart(8)}`),
  '',
  ...LEAD.map((n) => `  ${n.padEnd(18)} ${String(tokens.get(n)).padStart(8)}`),
  '',
  `  display-sized rules checked: ${displaysChecked}`,
];
console.log(lines.join('\n'));

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\ntype scale is size-bucketed');
