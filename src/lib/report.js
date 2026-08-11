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

  // `reconstructed`, `live` and `diff` are amounts. Their ratio is the defect:
  // 1.34 is a contract multiplier missing, 1.0003 is rounding.
  'reconciliation-failed': (d) => ({
    ratio: ratio(d.reconstructed, d.live),
    positionsAgree: d.positionsAgree === true,
    instrumentsDisagreeing: (d.attribution ?? []).length,
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
 * @returns {object} safe to paste
 */
export function buildBugReport({ result, meta = {}, counts = {}, version = null, generatedAt = null }) {
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
    },
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
