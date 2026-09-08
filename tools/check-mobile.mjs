#!/usr/bin/env node
/**
 * US-162 — the phone check. Chromium, on the demo, at the widths that broke.
 *
 *   npm run demo &            # http://localhost:5173
 *   node tools/check-mobile.mjs [--base http://localhost:5173]
 *
 * Three questions, each of which has been answered wrongly by a shipped build:
 *
 *  1. Is the first chart on the first screen? On 375×667 the canvas must start
 *     above 480px and end above the fold; 0.71.0 shipped it at y = 1573.
 *  2. Does anything overflow sideways? `document.scrollWidth` must equal the
 *     viewport on every section at 320, 375, 414 and 768.
 *  3. Is the More menu inside the viewport, in the default and the Plus state,
 *     at the seven widths US-161 measured? It shipped off-screen twice.
 *
 * Not part of `npm test`: it needs a browser, and the suite deliberately has no
 * dependencies. `playwright` is resolved from the repo when installed
 * (`npm i --no-save playwright`) and from the global npm root otherwise, so a
 * machine with Playwright already on it needs nothing more. CI runs it as its
 * own job (ci.yml, `mobile`).
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const base = args.base ?? 'http://localhost:5173';

async function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return import(req.resolve(`${root}/playwright/index.mjs`));
  }
}

const { chromium } = await loadPlaywright();
const launch = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined };
const browser = await chromium.launch(launch).catch(() => chromium.launch());
const problems = [];
const note = (ok, msg) => { if (!ok) problems.push(msg); };

async function open(width, height, hash = '', plus = false) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/src/ui/app.html?demo=1${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  if (plus) await page.evaluate(() => document.body.classList.add('plus'));
  return { page, ctx, errors };
}

// 1. The first chart on the first screen.
for (const [w, h] of [[375, 667], [390, 844]]) {
  const { page, ctx, errors } = await open(w, h);
  const r = await page.evaluate(() => {
    const c = document.querySelector('[data-tab="overview"] .chart-box canvas');
    const b = c.getBoundingClientRect();
    return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY) };
  });
  note(r.top <= 480, `${w}×${h}: first chart starts at y=${r.top}, must be ≤ 480`);
  note(r.bottom <= h, `${w}×${h}: first chart ends at y=${r.bottom}, below the fold (${h})`);
  note(errors.length === 0, `${w}×${h}: page errors: ${errors.join(' | ')}`);
  console.log(`${w}×${h}: chart ${r.top}–${r.bottom}`);
  await ctx.close();
}

// 2. No horizontal overflow, any section, any width.
for (const w of [320, 375, 414, 768]) {
  for (const hash of ['', '#/perf', '#/comp', '#/income', '#/dividends', '#/holdings', '#/outlook', '#/notices', '#/plus']) {
    const { page, ctx } = await open(w, 900, hash);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    note(over <= 0, `${w}px ${hash || '#/overview'}: page is ${over}px wider than the viewport`);
    await ctx.close();
  }
}

// 3. The More menu stays on screen, both states, seven widths.
for (const plus of [false, true]) {
  for (const w of [320, 375, 380, 414, 600, 750, 900]) {
    const { page, ctx } = await open(w, 900, '', plus);
    await page.click('#btn-more');
    await page.waitForTimeout(250);
    const r = await page.$eval('#more-menu', (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; });
    note(r[0] >= 0 && r[1] <= w, `${plus ? 'plus' : 'free'} ${w}px: More menu spans ${r[0]}–${r[1]}, viewport is 0–${w}`);
    await ctx.close();
  }
}

await browser.close();
if (problems.length) {
  for (const p of problems) console.error(`check-mobile: ${p}`);
  process.exit(1);
}
console.log('check-mobile: first chart above the fold, no sideways overflow, the menu on screen in both states.');
