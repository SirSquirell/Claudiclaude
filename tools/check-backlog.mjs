#!/usr/bin/env node
import { readFileSync } from 'node:fs';
/**
 * Guard the backlog's numbering, mechanically.
 *
 *   node tools/check-backlog.mjs
 *
 * CLAUDE.md's *Branches* section records the failure this exists for: parallel
 * sessions each numbered their story against the `main` they could see, and
 * **three different stories ended up as US-66 and three as US-76**. The repair
 * was a rule — a number is claimed by landing in `docs/BACKLOG.md` on `main`,
 * and the next free one is stated at the end of that file. A rule is a comment
 * until something checks it, and a hand-maintained "next free number" line is
 * exactly the kind of thing that is right until the day it matters.
 *
 * Three questions, all answerable by reading one file:
 *
 *  1. **Is any number claimed twice?** That is the defect itself. Two stories
 *     under one number means one of them will be built against the other's
 *     acceptance criteria, and the loser is usually the one that was refined
 *     first and is not on screen.
 *  2. **Does the *Next free number* line still point past the highest number?**
 *     If it points at a number already in use, the next session claims a
 *     collision by following the instructions.
 *  3. **Does every story heading declare a state?** `*(built, 0.47.0)*`,
 *     `*(new, refined)*`, `*(decided)*` — the tag is how a reader can tell an
 *     open story from a shipped one without grepping the code. A heading with
 *     no tag is how a shipped story gets refined a second time.
 *
 * It exits non-zero on any of the three, because each one is a defect rather
 * than a preference. It deliberately does **not** check whether a story marked
 * `built` is actually on `main`: that needs the code, cannot be answered from
 * this file, and a check that guesses is worse than no check.
 */

const path = new URL('../docs/BACKLOG.md', import.meta.url);
const text = readFileSync(path, 'utf8');

/**
 * Story headings at both levels — `## US-52 — …`, `## US-35b — …` and the
 * `### US-14 — …` sub-headings inside the review sections.
 *
 * `###` used to be excluded: the early stories (US-01 … US-15) are sub-headings
 * inside the two review sections, and including them made the first version of
 * this script report thirty-seven missing numbers, all false — which is why
 * *gaps* are not one of the three questions. A gap is normal here: numbers
 * retire into `docs/RETIRED.md`, get dissolved into another story, or are
 * dropped outright, and none of that is a defect. But a `###` story is still a
 * claim on a number (US-102 … US-110 are all `###`), so it is checked for
 * duplicates and counted towards the highest number. The state-tag check
 * exempts the zero-prefixed 0.10.0 review headings (`US-01` … `US-09`): they are
 * history, not a backlog, and tagging them would be inventing a state.
 */
const HEADING = /^###? (US-(\d+)[a-z]?) — (.+?)\s*$/gm;
const NEXT_FREE = /\*\*Next free number: US-(\d+)\.\*\*/;

const stories = [];
for (const m of text.matchAll(HEADING)) {
  stories.push({ id: m[1], num: Number(m[2]), title: m[3] });
}

const problems = [];

if (!stories.length) problems.push('No `## US-…` headings found at all — is this the right file?');

// 1. One number, one story.
const byId = new Map();
for (const s of stories) {
  if (!byId.has(s.id)) byId.set(s.id, []);
  byId.get(s.id).push(s.title);
}
for (const [id, titles] of byId) {
  if (titles.length > 1) {
    problems.push(`${id} is claimed ${titles.length} times:\n` + titles.map((t) => `      · ${t}`).join('\n'));
  }
}

// 2. The line the next session will trust.
const highest = stories.reduce((a, s) => Math.max(a, s.num), 0);
const nextFree = text.match(NEXT_FREE);
if (!nextFree) {
  problems.push('The **Next free number** line is missing. It is how a session that cannot see other '
    + "sessions' branches claims a number without colliding.");
} else if (Number(nextFree[1]) <= highest) {
  problems.push(`**Next free number: US-${nextFree[1]}** is already in use — the highest story is US-${highest}, `
    + `so the line should read US-${highest + 1}.`);
}

// 3. Every heading says what state it is in.
const untagged = stories.filter((s) => !/^US-0/.test(s.id) && !/\*\([^)]+\)\*$/.test(s.title));
for (const s of untagged) {
  problems.push(`${s.id} has no state in its heading: "${s.title}" — add *(new, refined)*, *(built, 0.47.0)* or similar.`);
}

if (problems.length) {
  console.error(`docs/BACKLOG.md — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nSee CLAUDE.md, *Branches*: a number is claimed by landing in docs/BACKLOG.md on `main`.');
  process.exit(1);
}

console.log(`docs/BACKLOG.md: ${stories.length} stories, highest US-${highest}, `
  + `next free US-${nextFree[1]}, every heading states its state.`);
