#!/usr/bin/env node
/**
 * Minimal static server for the demo, so the whole UI can be exercised in a
 * normal browser tab without installing the extension or logging into DEGIRO.
 *
 *   npm run demo      ->  http://localhost:5173/src/ui/app.html?demo=1
 *
 * No dependencies on purpose: this is a dev tool, not part of the extension.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 5173);
const ENTRY = '/src/ui/app.html?demo=1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') {
    res.writeHead(302, { Location: ENTRY });
    return res.end();
  }

  // Contain every request inside the repo root.
  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`Not found: ${pathname}`);
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  DEGIRO Portfolio History — demo\n`);
  console.log(`  http://localhost:${PORT}${ENTRY}\n`);
  console.log(`  This serves generated fixtures through the real engine.`);
  console.log(`  Ctrl-C to stop.\n`);
});
