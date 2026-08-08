#!/usr/bin/env node
/**
 * Generates the toolbar icons. Run once; the PNGs are committed.
 *
 *   node tools/make-icons.mjs
 *
 * Written by hand rather than pulled from a package: MV3 wants a handful of
 * plain PNGs and a dependency for that is not worth it. zlib is built in, so a
 * PNG is a header, one IDAT chunk of deflated scanlines, and a CRC.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const BG = [42, 120, 214, 255]; // series slot 1
const INK = [255, 255, 255, 255];

/** The little rising line inside the square, as fractions of the icon. */
const SHAPE = [
  [0.16, 0.72],
  [0.3, 0.6],
  [0.42, 0.66],
  [0.56, 0.38],
  [0.7, 0.46],
  [0.84, 0.24],
];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, rgba, a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + rgba[k] * a);
    px[i + 3] = Math.max(px[i + 3], Math.round(rgba[3] * a));
  };

  // Rounded square background.
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (size - r));
      const dy = Math.max(r - y - 0.5, 0, y + 0.5 - (size - r));
      const d = Math.hypot(dx, dy);
      if (d <= r) set(x, y, BG, Math.min(1, r - d + 0.5));
    }
  }

  // The rising line, drawn thick enough to survive 16px.
  const w = Math.max(1, size / 12);
  const pts = SHAPE.map(([fx, fy]) => [fx * size, fy * size]);
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, y0] = pts[s];
    const [x1, y1] = pts[s + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
    for (let i = 0; i <= steps; i++) {
      const cx = x0 + ((x1 - x0) * i) / steps;
      const cy = y0 + ((y1 - y0) * i) / steps;
      for (let oy = -w; oy <= w; oy++) {
        for (let ox = -w; ox <= w; ox++) {
          const d = Math.hypot(ox, oy);
          if (d <= w) set(Math.round(cx + ox), Math.round(cy + oy), INK, Math.min(1, w - d + 0.4));
        }
      }
    }
  }

  return px;
}

for (const size of [16, 32, 48, 128]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${file}`);
}
