/**
 * The bug report: everything that went wrong, in a form you can paste.
 *
 * The loop this replaces was screenshots. A tester sees a red banner, crops a
 * picture of it, and the half of the story that would have identified the
 * defect — the ratio behind the banner, how many instruments hit it, what the
 * sync log said two steps earlier — was never on screen to photograph. The UI
 * renders `warning.message` and nothing else; every `warning.detail` in this
 * codebase has always gone straight to the floor.
 *
 * Two rules shape what is in here, and they pull in opposite directions.
 *
 * **It has to be enough to diagnose from.** Look at what the four defects in
 * 0.10.0 actually needed: a contract size is a ratio, an exchange rate is a
 * ratio, a fabricated position is a count against a count, a mis-scaled series
 * is a quoted price over a paid price. Not one of them needed to know how much
 * money anyone has.
 *
 * **And it is going to be pasted into a chat window.** So it is built the way
 * CLAUDE.md rule 7 says anything leaving the machine is built: assembled from
 * named fields only. Nothing is copied wholesale and scrubbed afterwards,
 * because a scrub is a denylist wearing a different hat — it ships the field
 * somebody adds next month.
 *
 * The consequence, stated plainly rather than discovered later: **this file
 * cannot diagnose a defect that only shows up in a specific instrument's
 * name or a specific amount.** When that happens the full export is still the
 * answer, and it is still something you send to someone you trust.
 *
 * Pure. No I/O, no Chrome APIs — the caller gathers, this shapes.
 */

/** How many sync-log lines are worth carrying. The tail is where it broke. */
const SYNC_LOG_LINES = 25;

/**
 * A number that is a ratio rather than an amount, rounded to something a human
 * can read. `1.34` says the total is 34% out, which is the finding; the euros
 * behind it are not.
 */
const ratio = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Number((a / b).toFixed(6));
};

const round = (v, dp = 6) => (Number.isFinite(v) ? Number(v.toFixed(dp)) : null);

/**
 * Per warning code, what may be carried out of its `detail`.
 *
 * Anything without an entry here contributes its code and its count and nothing
 * else. That is the default on purpose: a warning added next month appears in
 * the report as a name and a number, which is useful, and it cannot leak,
 * which is the point. Widening it is then a decision somebody makes.
 */
const DETAIL_SUMMARY = {
  // Factor and spread are the finding. The instrument's name is not, and its
  // `sample` carries the prices actually paid.
  'price-scale-adjusted': (d) => ({
    instruments: (d.instruments ?? []).length,
    factors: (d.instruments ?? []).slice(0, 20).map((i) => ({
      factor: round(i.factor),
      spread: round(i.spread, 3),
    })),
  }),

  // How many, and of what kind. 82 options with no series is a different
  // problem from 3 stocks, and neither needs a name.
  'no-price-series': (d) => ({
    instruments: (d.instruments ?? []).length,
  }),

  // This one is almost entirely safe already, and it is the single most
  // valuable block in the file: CHF deriving to 107 instead of 1.07 was
  // visible in exactly these fields.
  'fx-derived': (d) => ({
    currencies: (d.currencies ?? []).map((c) => ({
      currency: c.currency,
      source: c.source,
      observations: c.observations,
      dropped: c.dropped,
      median: round(c.median),
      low: round(c.low),
      high: round(c.high),
      widestGapDays: c.widestGapDays,
      stale: c.stale,
    })),
  }),

  /**
   * The most severe warning the engine raises, and until now the report carried
   * its code and nothing else.
   *
   * A tester's 0.36.0 report listed `price-series-mismatch` at error level and
   * `unclassifiedWarningCodes: ["price-series-mismatch", …]` three lines below
   * it — which is the gap doing its job, and the gap being real. Same fields as
   * the rescale summary above, for the same reasons: the factor and the spread
   * are the finding, the instrument's name is not, and `sample` carries the
   * prices actually paid.
   */
  'price-series-mismatch': (d) => ({
    instruments: (d.instruments ?? []).length,
    factors: (d.instruments ?? []).slice(0, 20).map((i) => ({
      factor: round(i.factor),
      spread: round(i.spread, 3),
    })),
  }),

  /**
   * A count, and deliberately nothing else.
   *
   * What would actually fix the classifier is the *wording* DEGIRO used, and
   * that is the one thing which cannot travel: a description reads
   * "Dividend ASML" or "Koop 12 NVDA", so it names a holding. Even the first
   * word is unsafe, because some of them begin with the instrument.
   *
   * So the count travels and the wording does not, and the honest consequence
   * is stated rather than discovered: **this warning can say a row was missed
   * but not which rule to add.** The full export is the route for that, and it
   * is the one you send only to someone you trust. One unrecognised row out of
   * 655 is still a different problem from two hundred, which is why the count
   * is worth carrying at all.
   */
  'unclassified-cash-rows': (d) => ({ count: Number(d.count) || 0 }),

  // Rates and day counts, no amounts. The same shape `fx-derived` already
  // carries, and it was unclassified for no better reason than nobody adding it.
  'fx-stale': (d) => ({
    currencies: (d.currencies ?? []).map((c) => ({
      currency: c.currency,
      observations: c.observations,
      widestGapDays: c.widestGapDays,
      median: round(c.median),
    })),
  }),

  // `reconstructed`, `live` and `diff` are amounts. Their ratio is the defect:
  // 1.34 is a contract multiplier missing, 1.0003 is rounding.
  'reconciliation-failed': (d) => ({
    ratio: ratio(d.reconstructed, d.live),
    positionsAgree: d.positionsAgree === true,
    instrumentsDisagreeing: (d.attribution ?? []).length,
    /**
     * Where the residual is, as ratios rather than amounts.
     *
     * Two testers' accounts arrived with the same signature — off by half a
     * percent, every share count agreeing, zero instruments disagreeing — and
     * the report could not say where the difference was, only that there was
     * one. `positionsAgree: true` with `instrumentsDisagreeing: 0` already
     * rules the holdings out; these say whether what is left is a plausible
     * fraction of the cash balance, which is the next question and was
     * unanswerable.
     *
     * `cashShare` is cash over the reconstructed total. `residualOverCash` is
     * the gap over the cash balance — so 0.006 reads as "the cash is out by
     * about six tenths of a percent", which on an account holding a foreign
     * currency with a stale rate is a diagnosis rather than a mystery.
     */
    cashShare: ratio(d.cash, d.reconstructed),
    residualOverCash: ratio(d.reconstructed - d.live, d.cash),
  }),
};

/** Strip anything that could carry a query string, a host or a path. */
const errorMessage = (msg) => {
  if (typeof msg !== 'string') return null;
  // Every typed error in degiro.js already splits the query off a URL before
  // it reaches a message. This is the belt for the ones that do not, and for
  // whatever a browser puts in a bare TypeError.
  return msg.replace(/https?:\/\/\S+/g, '<url>').slice(0, 300);
};

/**
 * @param {object} input
 * @param {object|null} input.result      what `computePortfolio` returned
 * @param {object}      input.meta        the meta store, as a plain object
 * @param {object}      input.counts      row counts per store
 * @param {string}      input.version     manifest version
 * @param {string}      input.generatedAt ISO timestamp, passed in so this stays pure
 * @param {object}      input.ui          what the page itself observed: uncaught
 *   errors, environment, translation coverage. Optional — the worker builds a
 *   report too and has no page.
 * @returns {object} safe to paste
 */
export function buildBugReport({ result, meta = {}, counts = {}, version = null, generatedAt = null, ui = null }) {
  const r = result ?? null;

  const warnings = (r?.warnings ?? []).map((w) => {
    const summarise = DETAIL_SUMMARY[w.code];
    return {
      level: w.level,
      code: w.code,
      // The message is written by us and reviewed, but the reconciliation one
      // states two totals, so it is described rather than quoted.
      ...(summarise ? { detail: summarise(w.detail ?? {}) } : {}),
    };
  });

  const byLevel = {};
  for (const w of warnings) byLevel[w.level] = (byLevel[w.level] ?? 0) + 1;

  const rec = r?.reconciliation ?? null;
  const held = (r?.byProduct ?? []).filter((p) => Math.abs(p.current) > 0.005);

  return {
    kind: 'degiro-portfolio-bug-report',
    version,
    generatedAt,

    // Enough to know what kind of account produced this, and no more. A shape,
    // not an identity.
    account: {
      days: r?.days?.length ?? 0,
      firstDay: r?.days?.[0] ?? null,
      lastDay: r?.days?.at?.(-1) ?? null,
      transactions: counts.transactions ?? 0,
      cashRows: counts.cashflows ?? 0,
      products: counts.products ?? 0,
      priceSeries: counts.prices ?? 0,
      productTypes: countBy(r?.byProduct ?? [], (p) => p.productType ?? 'UNKNOWN'),
      currencies: [...new Set((r?.byProduct ?? []).map((p) => p.currency))].sort(),
      heldPositions: held.length,
      heldWithoutPrices: held.filter((p) => p.hasSeries === false).length,
      contractSizes: countBy(r?.byProduct ?? [], (p) => String(p.contractSize ?? 1)),
    },

    warnings,
    warningsByLevel: byLevel,

    reconciliation: rec
      ? {
          ok: rec.ok === true,
          positionsAgree: rec.positionsAgree === true,
          // 'reported' or 'derived' — a derived anchor cannot catch an error
          // DEGIRO's own position values share, so a report that does not say
          // which overstates its own check.
          source: rec.source === 'derived' ? 'derived' : rec.source === 'reported' ? 'reported' : null,
          ratio: ratio(rec.reconstructed, rec.live),
          instrumentsDisagreeing: (rec.attribution ?? []).length,
        }
      : null,

    // The half of the story a screenshot of a banner never contains: what the
    // sync was doing before it went wrong.
    sync: {
      lastSyncAt: meta.lastSyncAt ?? null,
      lastDataDate: meta.lastDataDate ?? null,
      lastError: meta.lastError
        ? {
            reason: meta.lastError.reason ?? null,
            message: errorMessage(meta.lastError.message),
            at: meta.lastError.at ?? null,
          }
        : null,
      log: (meta.syncLog ?? []).slice(-SYNC_LOG_LINES).map((e) => ({
        phase: e.phase ?? null,
        at: e.at ?? null,
        error: e.error === true,
        message: errorMessage(e.message),
      })),
      missingPriceSeries: (meta.missingPriceSeries ?? []).length,
      /**
       * Present only when DEGIRO's current total could not be read, and then it
       * is the list of field names that *were* in the response.
       *
       * Named explicitly here rather than spread in, per rule 7: this file is
       * an allowlist, and a field that is not written down does not travel.
       * `sync.js` has already dropped anything that is not shaped like an
       * identifier — this is the second of the two gates, not the only one.
       */
      liveTotalFields: Array.isArray(meta.liveTotalFields) ? meta.liveTotalFields.slice(0, 60) : null,
      /**
       * Rows the parsers could not read, per source, with reasons and no rows.
       * The quietest failure this project has: a renamed field empties an array,
       * the sync reports success, and the chart is short of a year with nothing
       * said. Counts make it loud.
       */
      /** Windows DEGIRO refused even at one month. Dates and statuses only. */
      missingWindows: Array.isArray(meta.missingWindows)
        ? meta.missingWindows.slice(0, 40).map((g) => ({ from: g.from, to: g.to, status: Number(g.status) || null, source: g.source ?? null }))
        : null,
      /**
       * What the *worker* threw, which no screenshot can ever contain.
       *
       * The page's errors are in `ui.errors` below, and they only exist while
       * somebody is looking at the page. A background sync fails with nobody
       * watching and the worker is torn down thirty seconds later, so this is
       * the only record there is of it. Already scrubbed at the point of
       * recording; named here anyway, because this file is an allowlist.
       */
      persistedErrors: Array.isArray(meta.persistedErrors)
        ? meta.persistedErrors.slice(0, 12).map((e) => ({
            kind: typeof e.kind === 'string' ? e.kind.slice(0, 40) : null,
            message: errorMessage(e.message),
            where: typeof e.where === 'string' ? e.where.slice(0, 60) : null,
            count: Number(e.count) || 1,
            at: e.at ?? null,
            lastAt: e.lastAt ?? null,
          }))
        : null,
      unreadableRows: meta.unreadableRows
        ? {
            transactions: Number(meta.unreadableRows.transactions?.count) || 0,
            cashRows: Number(meta.unreadableRows.cashRows?.count) || 0,
            reasons: {
              transactions: meta.unreadableRows.transactions?.reasons ?? {},
              cashRows: meta.unreadableRows.cashRows?.reasons ?? {},
            },
          }
        : null,
    },

    /**
     * What went wrong *in the page*, which until now went unreported entirely.
     *
     * A defect that breaks a render produces a red banner for whoever is
     * looking at it and nothing at all in the report — so the two worst
     * defects this project has shipped, both of which took the whole page
     * down, arrived as a screenshot and a sentence. Named here rather than
     * spread in, per rule 7: this file is an allowlist.
     */
    ui: ui
      ? {
          errors: (ui.errors ?? []).slice(0, 12).map((e) => ({
            kind: e.kind ?? null,
            message: errorMessage(e.message),
            where: typeof e.where === 'string' ? e.where.slice(0, 60) : null,
            count: Number(e.count) || 1,
          })),
          errorsDropped: Number(ui.dropped) || 0,
          /** Environment, because half of "it does not work" is which browser. */
          mode: ui.mode === 'demo' ? 'demo' : 'extension',
          chrome: typeof ui.chrome === 'string' ? ui.chrome.slice(0, 20) : null,
          language: ui.language === 'nl' ? 'nl' : 'en',
          theme: ['auto', 'light', 'dark'].includes(ui.theme) ? ui.theme : null,
          viewport: typeof ui.viewport === 'string' ? ui.viewport.slice(0, 12) : null,
          /** Strings with no translation. Counted, never hidden — see i18n.js. */
          untranslated: Number(ui.untranslated) || 0,
          /**
           * Warning codes the engine raised that this file has no summary for.
           * They already travel as code and level only; this says how many, so a
           * code added tomorrow is visible as a gap rather than as silence.
           */
          unclassifiedWarningCodes: (r?.warnings ?? [])
            .map((w) => w.code)
            .filter((c, i, all) => all.indexOf(c) === i && !DETAIL_SUMMARY[c]),
        }
      : null,
  };
}

function countBy(rows, keyOf) {
  const out = {};
  for (const row of rows) {
    const k = keyOf(row);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
