# Spike — what actually arrives in `totals` and `extra`

**Status: instrument built, question not yet answered.** Running it needs one export from a
logged-in account on 0.12.0 or later, which is not something this repository can contain.

0.12.0 stopped discarding the fields nobody had named: `parseUpdate` now returns the whole
`totalPortfolio` block, and `parseProducts` carries everything it does not claim in `extra`. Both
reach the export. So the question that blocked US-07, the second half of US-03 and blocker B1 —
*does DEGIRO send margin, a contract size, a strike, an expiry, a call/put flag* — is now one
command away instead of an inference chain.

```bash
npm run inspect ~/Downloads/degiro-portfolio-YYYY-MM-DD.json
```

The export must be **fresh**: taken after updating to 0.12.0 *and* after a **Wipe & resync**. An
older file has neither field, and the tool says so rather than reporting the candidates as absent —
"DEGIRO does not send `contractSize`" concluded from a file that could not have contained it is a
wrong answer to a blocker, which is worse than no answer.

## What the output may contain

Names, coverage and shapes. Not amounts. The tool prints a value only where its shape says it is a
structural constant — a small integer count, a short status word, a date format — and summarises
everything else as a type and a distinct count.

This is CLAUDE.md rule 7 applied to a finding rather than to the product: the output of a spike gets
pasted into a document, and a document gets sent to someone. The first run of its own test proved
the point — the pattern for "a status word" accepted `A Person Name` and an IBAN, both of which are
exactly what has leaked from this project before. It now takes no digits and no spaces, and a
genuine status value carrying a digit will arrive as `string, 1 distinct, 13 chars` and can be
allowed on purpose.

So the report can be pasted here whole. It is safe to.

## The questions, and what each answer decides

Written before the data, so that the answer is read rather than negotiated.

### 1. Does `totals` carry margin? *(US-07's margin half)*

Candidates: `reportMargin`, `reportOverallMargin`, `freeSpaceNew`, `reportDeficit`,
`marginCallStatus`, `marginCallDate`, `reportTotalLongVal`.

- **Present and populated** → US-07's margin panel is a read, not a model. It reports what DEGIRO
  says, and it is a *today* figure with no history behind it — one sync gives one observation, so a
  margin chart over time only starts existing from the day we begin storing it. Worth saying in the
  story rather than discovering in the UI.
- **Absent** → the margin half of US-07 is dropped, not deferred. Margin cannot be reconstructed
  from transactions; it is a broker's own risk calculation over positions we can see but rules we
  cannot. Half a dashboard that guesses a margin requirement is the plausible-wrong-number failure
  this project exists to avoid.
- **Present but zero everywhere** → the account has no margin, which is not the same as DEGIRO not
  sending it. Needs an account that does. Danny's is the candidate.

### 2. Does `extra` carry `contractSize`? *(B1)*

- **Present, on every option** → it becomes a **cross-check against the measured value, not a
  replacement for it.** The measurement is verified against DEGIRO's own position values; a field is
  only trusted. Where the two disagree, the disagreement is the warning — and B11's whole
  class of defect (a size measured through an interpolated FX rate landing on 102 instead of 100)
  becomes detectable rather than silent.
- **Present on some** → the same, for those. The measurement stays the primary source.
- **Absent** → nothing changes. B1 closes as "no", the measured route stands, and 0.11.0's
  improvement to it was the right place to have spent the effort.

### 3. Does `extra` carry strike, expiry and call/put? *(US-03's second half)*

- **Present** → option identity comes from data instead of from parsing `AH P32.00 18DEC26`, and
  name-parsing becomes the fallback that announces itself. This matters more than it looks:
  `RND P38.81 15DEC28` already has a strike no format guide predicts, and a corporate action can
  rewrite a contract name at any time.
- **Expiry present** → the 82 option products with no price series can be held at zero after their
  expiration date instead of flat at their last traded price, which for an option approaching
  worthlessness is the one shape it certainly does not have. This is the single largest known
  inaccuracy in an options account's *history*.
- **Absent** → name-parsing is all there is, and the story says so out loud, with the parse failing
  loudly rather than returning a plausible strike.

### 4. What arrived that nobody predicted?

The section of the report nobody wrote a candidate for. Every field above was guessed from
documentation and from other people's reverse engineering; none of it is evidence. The unpredicted
half is the reason to look at the whole inventory rather than to grep for seven names.

## Findings

*Empty. Fill in from one paste of the command's output, then update `docs/BACKLOG.md` §7 (B1) and
`docs/NEXT.md` §1 — the candidate table there is explicitly "things to check for", and it stays
that way until this section says otherwise.*
