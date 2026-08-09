#!/usr/bin/env node
/**
 * Refuse to let account data into the repository.
 *
 * CLAUDE.md rule 7. This exists because three things leaked in one sprint — an
 * export shipping a name and an account number, a real account number pasted
 * into a test, and two testers named in a document beside their holdings — and
 * all three were found by someone happening to look. None was prevented.
 *
 * It is deliberately dumb. Every one of those three would have been caught by a
 * pattern check, and a clever check nobody runs is worth less than a blunt one
 * wired into `npm test`.
 *
 *   node tools/check-leaks.mjs            # everything git tracks
 *   node tools/check-leaks.mjs --staged   # only what is staged, for a pre-commit hook
 *
 * Exits non-zero on a finding. False positive? Put `leak-check: ok` in a comment
 * on that line and say why — the exemption is visible in review, which a silent
 * skip list is not.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const staged = process.argv.includes('--staged');
const list = staged
  ? 'git diff --cached --name-only --diff-filter=ACM'
  : 'git ls-files';

const files = execSync(list, { encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => existsSync(f))
  .filter((f) => !f.startsWith('vendor/'))
  .filter((f) => f !== 'tools/check-leaks.mjs');

/**
 * Words that identify a person — tester names, mostly. Read from a gitignored
 * file, never from this source: a list of names committed to guard against
 * names in commits is the thing it is guarding against.
 */
const wordFile = '.leakwords';
const words = existsSync(wordFile)
  ? readFileSync(wordFile, 'utf8').split('\n').map((w) => w.trim()).filter((w) => w.length > 2 && !w.startsWith('#'))
  : [];

const IDENTIFYING_KEYS = ['displayName', 'intAccount', 'userToken', 'clientId'];

/**
 * A value that is obviously not real. Repeated digits, or something that says
 * so in words. Anything else has to be justified in place.
 */
function isPlaceholder(v) {
  const s = String(v);
  if (/^(\d)\1*$/.test(s)) return true;
  if (/^(0|1234|9999)/.test(s)) return true;
  // A real account number or token is six digits or more; anything shorter is
  // somebody typing a number into a test.
  if (/^\d+$/.test(s) && s.length < 6) return true;
  // A long run of zeros is a filler, not a value someone had.
  if (/0{6,}/.test(s)) return true;
  return /demo|example|test|sample|redacted|fixture|jane|placeholder|\bfake\b/i.test(s);
}

const findings = [];
const report = (file, line, what, detail) => findings.push({ file, line, what, detail });

for (const file of files) {
  // An export, by name or by shape. Nothing in this repository should ever have
  // a transactions array next to a cashflows array.
  if (/degiro-portfolio-.*\.json$/.test(file)) {
    report(file, 1, 'account export', 'a file named like an export');
    continue;
  }

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // binary
  }

  if (file.endsWith('.json') && /"transactions"\s*:\s*\[/.test(text) && /"cashflows"\s*:\s*\[/.test(text)) {
    report(file, 1, 'account export', 'transactions and cashflows side by side');
    continue;
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('leak-check: ok')) continue;

    // An identifying meta key next to a *literal*. Code that merely handles the
    // key — `intAccount: pick(f, ...)`, `userToken: null` — is not a leak, and
    // flagging it is how a guard gets switched off.
    for (const key of IDENTIFYING_KEYS) {
      const m = new RegExp(`['"\`]?${key}['"\`]?\\s*[:=]\\s*(?:'([^']*)'|"([^"]*)"|(\\d+))`).exec(line);
      const value = m && (m[1] ?? m[2] ?? m[3]);
      if (value != null && !isPlaceholder(value)) {
        report(file, i + 1, `${key} set to a literal`, String(value).slice(0, 24));
      }
    }

    // A long digit run near a word that makes it an identifier rather than a
    // quantity. A blanket rule on six digits fires on issue ids, prices and
    // split factors — all legitimate, all non-identifying — and a guard that
    // cries wolf thirty times is a guard that gets commented out.
    if (/^(test|docs|tools)\//.test(file)) {
      const context = lines.slice(Math.max(0, i - 2), i + 1).join(' ');
      if (/account|token|client ?id|iban|intAccount|userToken/i.test(context)) {
        // Not the tail of a decimal: 17,362971728699264 is a share count.
        for (const m of line.matchAll(/(^|[^\d.,])(\d{6,})(?![\d.,])/g)) {
          if (!isPlaceholder(m[2])) report(file, i + 1, 'account-like number', m[2]);
        }
      }
    }

    for (const word of words) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(line)) {
        report(file, i + 1, 'name from .leakwords', word);
      }
    }
  }
}

if (!findings.length) {
  console.log(`no account data in ${files.length} tracked file(s)${words.length ? '' : ' — note: no .leakwords file, so names are not checked'}`);
  process.exit(0);
}

console.error(`\n${findings.length} possible leak(s):\n`);
for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.what} — ${f.detail}`);
console.error(`\nIf one of these is genuinely fine, put "leak-check: ok" in a comment on that line.\n`);
process.exit(1);
