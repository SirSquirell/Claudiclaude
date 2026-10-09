#!/usr/bin/env node
/**
 * US-162, US-165, US-166 — the browser check. Chromium, on the demo, at the
 * widths and in the states that broke. It was `check-mobile.mjs` until it
 * learned to assert something that is not about a phone.
 *
 *   npm run demo &            # http://localhost:5173
 *   node tools/check-ui.mjs [--base http://localhost:5173]
 *
 * Five questions, each of which has been answered wrongly by a shipped build:
 *
 *  1. Is the first chart on the first screen? On 375×667 the canvas must start
 *     above 480px and end above the fold; 0.71.0 shipped it at y = 1573.
 *  2. Does anything overflow sideways? `document.scrollWidth` must equal the
 *     viewport on every section at 320, 375, 414 and 768.
 *  3. Is the More menu inside the viewport, in the default and the Plus state,
 *     at the seven widths US-161 measured? It shipped off-screen twice.
 *  4. Does the dividend table open on columns that show something? At 375 and
 *     414 every visible header must sit inside the scroller, which is the
 *     US-165 defect: the third lock started beyond the edge.
 *  5. Does the eye leave the real figures in the page? After pressing it, none
 *     of the amounts the tiles showed may remain in their text or on a
 *     select-all-and-copy, at 0, 300 ms, 1 s and 5 s. 0.47.0 to 0.74.0 left all
 *     six there (US-164). The amounts are read from the page before the press,
 *     so nothing is written into this file.
 *
 * Not part of `npm test`: it needs a browser, and the suite deliberately has no
 * dependencies. `playwright` is resolved from the repo when installed
 * (`npm i --no-save playwright`) and from the global npm root otherwise, so a
 * machine with Playwright already on it needs nothing more. CI runs it as its
 * own job (ci.yml, `ui`).
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

// 4. The dividend table: nothing visible at rest may start beyond the scroller.
for (const w of [375, 414]) {
  const { page, ctx } = await open(w, 900, '#/dividends');
  const r = await page.evaluate(() => {
    const t = document.querySelector('#dividend-holdings');
    const s = t.closest('.table-scroll');
    const edge = s.getBoundingClientRect();
    const heads = [...t.querySelectorAll('thead th')]
      .filter((h) => h.getClientRects().length && h.offsetWidth > 0 && h.closest('table') === t)
      .map((h) => ({ name: h.textContent.trim(), left: h.getBoundingClientRect().left, right: h.getBoundingClientRect().right }));
    return { over: s.scrollWidth - s.clientWidth, heads, edge: { left: edge.left, right: edge.right } };
  });
  note(r.heads.length >= 3, `${w}px dividends: ${r.heads.length} columns visible, the three locks must be`);
  note(r.over <= 1, `${w}px dividends: the table scrolls sideways by ${r.over}px at rest`);
  for (const h of r.heads) {
    note(h.right <= r.edge.right + 1 && h.left >= r.edge.left - 1, `${w}px dividends: "${h.name}" spans ${Math.round(h.left)}–${Math.round(h.right)}, scroller is ${Math.round(r.edge.left)}–${Math.round(r.edge.right)}`);
  }
  console.log(`${w}px dividends: ${r.heads.map((h) => h.name).join(', ')}`);
  await ctx.close();
}

// 5. The eye leaves no real amount in the page (US-164), at 1440 and on a phone.
for (const [w, h] of [[1440, 900], [375, 667]]) {
  const { page, ctx } = await open(w, h);
  // The amounts are whatever euro figures the demo's tiles show right now (a percentage is not masked).
  const amounts = await page.$$eval('#tiles .value', (els) => [...new Set(els.map((e) => e.textContent.trim()).filter((t) => t.includes('€') && /\d/.test(t)))]);
  note(amounts.length >= 3, `${w}px eye: only ${amounts.length} amounts to look for, the check would prove nothing`);
  await page.click('#btn-anon');
  const seen = [];
  let waited = 0;
  for (const at of [0, 300, 1000, 5000]) {
    await page.waitForTimeout(at - waited);
    waited = at;
    const { text, copied } = await page.evaluate(() => {
      const box = document.querySelector('#tiles');
      const sel = getSelection();
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.addRange(range);
      const copied = sel.toString();
      sel.removeAllRanges();
      return { text: box.textContent, copied };
    });
    for (const a of amounts) {
      note(!text.includes(a), `${w}px eye +${at}ms: "${a}" is still in the tiles' text`);
      note(!copied.includes(a), `${w}px eye +${at}ms: "${a}" is on a select-all-and-copy`);
    }
    seen.push(at);
  }
  console.log(`${w}px eye: ${amounts.length} amounts gone from text and copy at ${seen.join(', ')} ms`);
  await ctx.close();
}

await browser.close();
if (problems.length) {
  for (const p of problems) console.error(`check-ui: ${p}`);
  process.exit(1);
}
console.log('check-ui: first chart above the fold, no sideways overflow, the menu on screen in both states, the dividend table opens on visible columns, the eye leaves no amount behind.');
