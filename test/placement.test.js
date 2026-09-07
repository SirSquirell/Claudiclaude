import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { menuAnchor } from '../src/lib/placement.js';

/**
 * US-161. The two states the scan measured, as numbers: a 207px menu, a 59px
 * trigger at the left end of its own row (default state, Upgrade visible) and
 * at the right end of a shared row (body.plus). The old CSS got exactly one of
 * them right at a time; this has to get both.
 */
const MENU = 207;

test('default state below the rail breakpoint: trigger at the left end, menu grows right', () => {
  for (const w of [320, 375, 380, 414, 600, 750, 900]) {
    assert.equal(menuAnchor({ triggerLeft: 12, triggerRight: 71, menuWidth: MENU, viewportWidth: w }), 'left', `${w}px`);
  }
});

test('body.plus below the breakpoint: trigger at the right end, menu grows left', () => {
  for (const w of [320, 375, 380, 414, 600, 750, 900]) {
    // The trigger hugs the right edge: 12px inset, 59px wide.
    assert.equal(menuAnchor({ triggerLeft: w - 71, triggerRight: w - 12, menuWidth: MENU, viewportWidth: w }), 'right', `${w}px`);
  }
});

test('the rail state above the breakpoint: trigger at the foot of a 13.5rem rail, left', () => {
  assert.equal(menuAnchor({ triggerLeft: 12, triggerRight: 203, menuWidth: MENU, viewportWidth: 1440 }), 'left');
});

test('when neither side fits, the side with more room wins and the reader’s edge never loses', () => {
  // A 320px viewport and a 300px menu: left fits nowhere, right fits nowhere.
  assert.equal(menuAnchor({ triggerLeft: 12, triggerRight: 71, menuWidth: 300, viewportWidth: 320 }), 'left');
  assert.equal(menuAnchor({ triggerLeft: 249, triggerRight: 308, menuWidth: 300, viewportWidth: 320 }), 'right');
});

test('the More menu asks placement.js on open, and the stylesheet no longer hard-codes a side below the breakpoint', () => {
  const app = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
  assert.match(app, /menuAnchor\(\{/, 'app.js measures the trigger on open');
  assert.match(css, /\.menu\.anchor-right\s*\{/, 'the right anchor is a class the measurement sets');
  const narrow = css.slice(css.indexOf('@media (max-width: 60em)'));
  const menuRule = /\.menu\s*\{[^}]*\}/.exec(narrow)?.[0] ?? '';
  assert.ok(!/right:\s*0/.test(menuRule), 'the narrow .menu rule must not pin right: 0 again — that is the 0.60.2 fix that US-151 turned into this bug');
});
