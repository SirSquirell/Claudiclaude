import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = join(ROOT, 'fixtures');

export function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

export function hasFixture(name) {
  return existsSync(join(FIXTURES, name));
}

/** Load every chart-*.json named in meta.json and merge the parsed series. */
export function loadPrices(parseChartResponse, meta) {
  const prices = {};
  for (const file of meta.charts ?? []) {
    Object.assign(prices, parseChartResponse(fixture(file)));
  }
  return prices;
}
