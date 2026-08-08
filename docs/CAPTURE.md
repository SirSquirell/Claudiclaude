# Capturing a real HAR

This is SPEC §5, step by step. Doing it once replaces every guess in
`docs/ENDPOINT-REPORT.md` with evidence.

Nothing here sends data anywhere. The HAR stays on your machine, and the redaction step
runs locally.

## 1. Record

1. Open Chrome, log in at <https://trader.degiro.nl>.
2. Open DevTools (F12) → **Network** tab.
3. Tick **Preserve log**. Untick any filter so XHR/fetch are included.
4. Now load each of these, waiting for each to finish:
   - the **Portfolio** page — produces `/update` and `/products/info`
   - the **Account overview / Rekeningoverzicht** page, set to the widest date range
     it offers — produces `/accountoverview`
   - the **Transactions / Transacties** page, widest range — produces `/transactions`
   - click into **one instrument** and open its chart — produces the
     `charting.vwdservices.com` request

## 2. Export

Right-click anywhere in the Network list → **Save all as HAR with content**.
The "with content" part matters; without it the file has URLs but no response bodies.

## 3. Convert and redact

```bash
node tools/har-to-fixtures.mjs ~/Downloads/trader.degiro.nl.har
```

This writes to `fixtures/real/` (git-ignored) and replaces `sessionId`, `JSESSIONID`,
`intAccount`, `userToken`, IBAN, email, name and address with fixed dummy values. It
prints which endpoints it found and which it did not.

## 4. Check the redaction yourself

The redaction is a set of regexes, not a guarantee. Before anything leaves
`fixtures/real/`:

```bash
grep -ril "<your surname>" fixtures/real/
grep -ril "<your account number>" fixtures/real/
grep -ril "NL..<your bank>" fixtures/real/
```

Amounts and productIds are fine to keep — it is a local repo — but the identifiers are
not.

## 5. Adopt

```bash
mv fixtures/real/*.json fixtures/
npm test
```

Expect failures. That is the point: each one is a place where the spec's field names and
DEGIRO's actual field names disagree. Fix `src/lib/parse.js`, and while you are in
there **remove the fallback candidates** that the real capture has now ruled out —
`parse.js` is deliberately loose while there is no evidence, and loose parsing that
returns `0` instead of failing is a liability once there is.

`test/parse.test.js` has a test asserting no cash movement is left `UNKNOWN`. Whatever
it prints is the list of descriptions to add to `src/lib/classify.js`.

## 6. Regenerating the synthetic set

If you want the demo back after overwriting `fixtures/`:

```bash
npm run fixtures
```
