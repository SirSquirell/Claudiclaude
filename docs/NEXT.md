# Planning 0.11 — research, not commitments

Written while 0.10.0 is still being tested. Nothing here is agreed and nothing is built.

Two questions were asked: what would US-07 (options and margin) actually take, and what is the
architectural idea behind US-11. They turn out to have the same answer underneath, which is why
they are in one document.

---

## 1. Why we cannot answer a single margin question

Not because the data is missing. Because we throw it away.

`parseUpdate` (`src/lib/parse.js`) reads `totalPortfolio` into `totals` — fully flattened, every
name/value pair DEGIRO sends — and then returns exactly two of them:

```js
const totalValue = pick(totals, ['reportNetliq', 'totalvalue', 'total', 'netliq']);
const totalCash  = pick(totals, ['totalCash', 'reportCashBal', 'cash']);
return { positions, totalValue, totalCash, cash };
```

Everything else in that object is discarded three lines after it arrives. `parseProducts` does
the same: it names ten fields and drops the rest, which is why a 50 MB export could not answer
whether DEGIRO returns `contractSize`.

**So margin data has most likely been flowing through this code on every sync since the first
release, and we have never seen it.** The same is true of an option's strike, expiry and whether
it is a call or a put.

This is CLAUDE.md rule 2 — *only raw API responses are persisted truth* — being violated by the
parse layer rather than the storage layer. The rule was written about what the database holds;
the leak is upstream of the database.

### What to look for once we keep it

Unconfirmed. These are candidate field names to *check for*, not findings — every one of them
has to be seen in a real response before anything is built on it. Recording them so the first
look is quick:

| Where | Candidates | For |
|---|---|---|
| `totalPortfolio` | `reportMargin`, `reportOverallMargin`, `freeSpaceNew`, `reportDeficit`, `marginCallStatus`, `marginCallDate`, `reportTotalLongVal` | US-07's margin half |
| `products/info` | `contractSize`, `strike`, `expirationDate`, `optionRights` (C/P), `underlyingProductId` | US-03's second half, and blocker B1 |

If `contractSize` is there, it becomes a cross-check against the measured value rather than a
replacement for it — the measurement is verified against DEGIRO's own position values, a field
is only trusted. Where they disagree, that disagreement is itself worth a warning.

### The one thing 0.11 has to do first

**Stop discarding unrecognised fields.** Keep the raw response alongside the parsed shape, or
carry the unparsed remainder on the parsed object. Everything below is blocked on it, and it is
also the cheapest change in the whole plan.

It unblocks, in one move: US-07's margin panel, US-03's expiry and assignment handling, real
call/put identity instead of parsing a name string, and blocker B1.

---

## 2. What US-07 actually needs, in order

1. **Keep the raw responses** (above). Until then every requirement below is speculation.
2. **Look, and write down what is there.** One sync, one export, one afternoon. This is a spike
   with a written outcome, not a story.
3. **Option identity from data, not from the name.** `AH P32.00 18DEC26` is currently a string.
   Parsing it works until a broker changes its format or a corporate action rewrites it —
   `RND P38.81 15DEC28` already has a strike no format guide predicts. If the product data
   carries strike, expiry and rights, use those and keep name-parsing as the fallback that
   announces itself.
4. **Expiry in the history.** Established from the 0.10.0 refinement: expiring options *do*
   produce closing transactions, so the position ledger is already correct and no modelling is
   needed for quantities. What remains is the **price** between the last trade and expiry for
   the 82 option products with no series — those sit flat at their last traded price, which for
   an option approaching worthlessness is the one shape it certainly does not have.
5. **Then** the dashboard. Not before, because the UI has to sit on the final model.

### The gap nobody has closed

**Calls have never been tested.** The account this was all verified against holds 27 written
puts — every contract in it is a `P`. The arithmetic makes no distinction: a position is a
signed quantity times a price times a contract size, and a call is the same sum. So it *should*
work. It has never been run.

That is one `npm run audit` away from being a measurement instead of an expectation, and it
needs an export from an account that holds or has held calls. Until then the README should not
claim call support, and currently it does not.

---

## 3. US-11, and the architectural idea under it

The requirements were listed in the backlog. This is the reasoning, since it is what was asked
for and it is more durable than the list.

### The tension worth naming

This project now has two rules that pull against each other.

- **Rule 2: keep the raw response.** Only what DEGIRO actually said is truth; everything else is
  a rebuildable cache. Section 1 above is an argument for keeping *more* — including fields
  nobody has looked at yet.
- **Rule 7: default-deny on anything that leaves the machine.** After the export shipped a name,
  an account number and a token, anything crossing outward has to declare what it may carry.

Keep more, emit less. Those are only contradictory if you think the boundary is the disk.

### The boundary is egress, not storage

Storing an unrecognised field costs nothing and risks nothing: the data is on the user's own
machine, in their own browser, describing their own account, and it is deletable and rebuildable
at any time. Keeping it is how a question gets answered in one query instead of an inference
chain — which is exactly what §1 is about.

Emitting it is a different act entirely, and there is exactly one place in this project where it
happens: `exportEverything`, plus the diagnostics. That is the boundary, and it is the only one.

**The 0.10.0 leak was a boundary confusion, not an oversight.** `exportEverything` was written as
"dump every store" — it inherited storage's permissiveness and applied it at an egress point.
That is why it leaked `displayName` without anyone deciding it should: nobody decided anything,
the function just forwarded whatever storage happened to hold. Adding the four keys to a denylist
fixed the instance and left the shape intact, so the next field added to the meta store will do
it again.

So the rule is not "be careful with data". It is:

> **Permissive inward, declarative outward.** Anything may be kept. Nothing leaves unless it was
> named. The two rules stop fighting the moment the boundary is drawn at egress instead of at
> disk — and §1's "keep everything" becomes safe *because* of rule 7 rather than despite it.

### Why the guards are a separate thing, and not architecture

Two of the three leaks were not design failures. They were a value on screen that got pasted into
a test, and two first names typed into a document. No boundary stops that. What stops it is
either a check that runs before the commit lands, or removing the temptation — a generator that
makes synthetic account data cheaper to use than the real values sitting open in the next window.

Worth being blunt about, because it is the trap this story could fall into: **an architecture
story that stops at principles solves the half that did not go wrong.** The philosophy above
would not have prevented incident 2 or 3. The dumb pattern check would have caught all three.

### The consequence for how the project is set up

Three things follow, and they are what "how we build it" means here:

1. **One egress point, and it is small enough to read in a sitting.** If a second way to get data
   out appears, it goes through the same declaration. There should never be two.
2. **A test that fails when something new is unclassified** — not a test that checks the four
   known keys are redacted, which is a test of the past. The failure has to be triggered by the
   *addition*, or the rule is a comment.
3. **The default for a bug report should not be the full file.** US-11's diagnostics export is
   the product-shaped half of this: every defect found in 0.10.0 came from ratios and counts, so
   the full portfolio was never actually needed. Making the safe path the easy path does more
   than any rule, because nobody is being careful at 23:00 while chasing a bug.

### What this does not solve

An export useful for reconstructing a portfolio contains that portfolio. Amounts are the point of
the file. The honest end state is a diagnostics share that covers most bug reports, and a full
export that stays something you send to someone you trust — said plainly in the README rather
than implied.

---

## 4. Shape of 0.11, if it were decided today

| | | Why here |
|---|---|---|
| 1 | Keep unrecognised fields from the API | Blocks everything else; cheapest item in the list |
| 2 | Spike: look at what margin and option data actually arrives | Written outcome, half a day, no code |
| 3 | T-1 guards + allowlist inversion | Closes a hole that is open right now |
| 4 | US-11 diagnostics share | Makes the safe path the easy path |
| 5 | US-03 second half: option identity and expiry pricing | Needs 1 and 2 |
| 6 | US-07 options and margin dashboard | Needs 5; the UI sits on the model, not the reverse |

Still unscheduled: US-10 (Trade Republic), and verifying calls against a real account.
