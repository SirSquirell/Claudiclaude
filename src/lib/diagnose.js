/**
 * Step-by-step connection check.
 *
 * "Sync did nothing" is not a debuggable report, and neither is a single error
 * string: the sync touches six endpoints and any of them can be the one that
 * broke. This walks them in order and reports each step's outcome, so the
 * failing step names itself.
 *
 * It is also the endpoint verification docs/ENDPOINT-REPORT.md asks for: every
 * step records *which* candidate field name actually matched, which is the
 * evidence that turns the report's assumptions into facts.
 *
 * PRIVACY: this output is meant to be pasted into a chat or an issue. It must
 * never contain a session id, a cookie value, an account number, an instrument
 * name or a euro amount. Only: HTTP statuses, row counts, key names, booleans.
 * Everything added here has to keep that true.
 */

import { DEFAULT_URLS, ENDPOINTS } from './config.js';
import { SessionExpiredError, fetchUrls, throttledFetch } from './degiro.js';
import { subMonths, todayISO } from './dates.js';
import { parseCashMovements, parseChartResponse, parseProducts, parseTransactions, parseUpdate, unwrapJsonp } from './parse.js';
import { readSessionId } from './session.js';
import { getMeta } from './store.js';

/** Which of the candidate keys a parser would actually have found. */
function whichKey(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return k;
  return null;
}

function topKeys(obj, limit = 14) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).slice(0, limit);
}

/**
 * @returns {Promise<{steps: Array, ok: boolean, summary: string}>}
 */
export async function runDiagnostics() {
  const steps = [];
  const add = (name, ok, detail) => {
    steps.push({ name, ok, ...detail });
    return ok;
  };

  const today = todayISO();
  // A twelve-month window, not the whole history: asking the reporting
  // endpoints for everything is exactly what makes them answer 502, and the
  // point here is to see the response *shape*, not to count every row.
  const from = subMonths(today, 12);

  // --- 1. the cookie ------------------------------------------------------
  let sessionId = null;
  try {
    sessionId = await readSessionId();
  } catch (err) {
    add('cookie', false, { note: `chrome.cookies threw: ${err.message}` });
  }

  if (!sessionId) {
    add('cookie', false, {
      note: 'No JSESSIONID cookie for trader.degiro.nl. Open trader.degiro.nl and log in, then run this again.',
    });
    return finish(steps);
  }
  add('cookie', true, { note: `JSESSIONID present (${sessionId.length} chars)` });

  // --- 2. which cluster is this account on? -------------------------------
  // DEGIRO puts accounts on /trading/, /trading4/ and friends. Assuming one is
  // the single likeliest cause of an opaque error on an otherwise valid session.
  const urls = await fetchUrls();
  const moved = Object.entries(DEFAULT_URLS)
    .filter(([k, v]) => urls[k] && urls[k].replace(/\/+$/, '') !== v.replace(/\/+$/, ''))
    .map(([k]) => `${k}: ${urls[k]}`);
  add('config', urls.discovered !== false, {
    urls: Object.fromEntries(Object.entries(urls).filter(([k]) => k !== 'discovered')),
    note:
      urls.discovered === false
        ? 'Could not read /login/secure/config; falling back to the default base URLs.'
        : moved.length
          ? `This account is NOT on the default cluster — ${moved.join(', ')}`
          : 'Account is on the default cluster.',
  });

  // --- 3. account identifiers --------------------------------------------
  let intAccount = null;
  let userToken = null;
  const client = await tryJson('client', ENDPOINTS.client({ sessionId, urls }));
  if (!client.ok) {
    add('client', false, client);
    return finish(steps);
  }
  {
    const data = client.body?.data ?? client.body ?? {};
    intAccount = data.intAccount ?? data.int_account ?? null;
    userToken = data.id ?? data.userToken ?? null;
    add('client', intAccount != null && userToken != null, {
      status: client.status,
      keys: topKeys(data),
      intAccountKey: whichKey(data, ['intAccount', 'int_account']),
      userTokenKey: whichKey(data, ['id', 'userToken']),
      note:
        intAccount == null || userToken == null
          ? 'Response parsed, but intAccount and/or the chart userToken are missing. SPEC §2 is out of date here.'
          : 'intAccount and userToken resolved.',
    });
    if (intAccount == null || userToken == null) return finish(steps);
  }

  // --- 4. current portfolio, and the field the whole check depends on -----
  const update = await tryJson('update', ENDPOINTS.update({ intAccount, sessionId, urls }));
  if (update.ok) {
    const parsed = parseUpdate(update.body);
    const totals = {};
    for (const pair of update.body?.totalPortfolio?.value ?? []) {
      if (pair?.name) totals[pair.name] = true;
    }
    add('update', parsed.totalValue != null, {
      status: update.status,
      positions: parsed.positions.length,
      totalFieldsSeen: Object.keys(totals).slice(0, 20),
      totalValueKey: whichKey(
        Object.fromEntries(Object.keys(totals).map((k) => [k, 1])),
        ['reportNetliq', 'totalvalue', 'total', 'netliq'],
      ),
      note:
        parsed.totalValue == null
          ? 'No account-total field matched. The reconciliation check cannot run — this is the field to fix first.'
          : `Account total found; ${parsed.positions.length} open positions.`,
    });
  } else {
    add('update', false, update);
  }

  // --- 5. transactions ----------------------------------------------------
  const tx = await tryJson(
    'transactions',
    ENDPOINTS.transactions({ intAccount, sessionId, urls, fromDate: from, toDate: today }),
  );
  let productIds = [];
  if (tx.ok) {
    const parsed = parseTransactions(tx.body);
    const sample = (tx.body?.data ?? [])[0] ?? null;
    productIds = [...new Set(parsed.map((t) => t.productId))];
    add('transactions', true, {
      status: tx.status,
      rawRows: Array.isArray(tx.body?.data) ? tx.body.data.length : 'data is not an array',
      parsedRows: parsed.length,
      distinctProducts: productIds.length,
      rowKeys: topKeys(sample, 20),
      quantityKey: whichKey(sample, ['quantity', 'size', 'amount']),
      window: `${from} .. ${today}`,
      note: parsed.length === 0 ? 'No transactions in the last 12 months, or the row shape changed.' : 'Last 12 months only — the sync fetches the full history a year at a time.',
    });
  } else {
    add('transactions', false, tx);
  }

  // --- 6. cash movements, and the classifier ------------------------------
  const cash = await tryJson(
    'accountoverview',
    ENDPOINTS.accountOverview({ intAccount, sessionId, urls, fromDate: from, toDate: today }),
  );
  if (cash.ok) {
    const parsed = parseCashMovements(cash.body);
    const byCategory = {};
    for (const r of parsed) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    // Descriptions are DEGIRO's own wording, not personal data — and they are
    // exactly what a new classification rule needs.
    const unknownWordings = [...new Set(parsed.filter((r) => r.category === 'UNKNOWN').map((r) => r.description))].slice(0, 25);
    const sample = (cash.body?.data?.cashMovements ?? cash.body?.cashMovements ?? [])[0] ?? null;
    add('accountoverview', true, {
      status: cash.status,
      parsedRows: parsed.length,
      rowKeys: topKeys(sample, 20),
      byCategory,
      unknownWordings,
      note: unknownWordings.length
        ? `${unknownWordings.length} unrecognised description(s) — these need rules in classify.js.`
        : 'Every cash movement was classified.',
    });
  } else {
    add('accountoverview', false, cash);
  }

  // --- 7. product metadata ------------------------------------------------
  let vwdIds = [];
  if (productIds.length) {
    const info = await tryJson('products-info', ENDPOINTS.productsInfo({ intAccount, sessionId, urls }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productIds.slice(0, 20).map(String)),
    });
    if (info.ok) {
      const parsed = parseProducts(info.body);
      const list = Object.values(parsed);
      vwdIds = list.map((p) => p.vwdId).filter(Boolean);
      const sample = Object.values(info.body?.data ?? {})[0] ?? null;
      add('products-info', list.length > 0, {
        status: info.status,
        requested: Math.min(productIds.length, 20),
        returned: list.length,
        withVwdId: vwdIds.length,
        identifierTypes: [...new Set(list.map((p) => p.vwdIdType))],
        currencies: [...new Set(list.map((p) => p.currency))],
        rowKeys: topKeys(sample, 20),
        note: vwdIds.length < list.length ? 'Some products have no vwdId; those cannot be priced.' : '',
      });
    } else {
      add('products-info', false, info);
    }
  } else {
    add('products-info', true, { skipped: 'no products to look up' });
  }

  // --- 8. price history ---------------------------------------------------
  if (vwdIds.length) {
    const url = ENDPOINTS.chart({ vwdIds: vwdIds.slice(0, 5), userToken, period: 'P1M' });
    const chart = await tryText('chart', url);
    if (chart.ok) {
      let series = {};
      let parseNote = '';
      try {
        series = parseChartResponse(unwrapJsonp(chart.text));
      } catch (err) {
        parseNote = `parse failed: ${err.message}`;
      }
      const got = Object.keys(series);
      add('chart', got.length > 0, {
        status: chart.status,
        requested: Math.min(vwdIds.length, 5),
        seriesReturned: got.length,
        pointsInFirst: got.length ? series[got[0]].points.length : 0,
        looksLikeJsonp: !chart.text.trim().startsWith('{'),
        note: parseNote || (got.length === 0 ? 'No price series came back for these ids.' : ''),
      });
    } else {
      add('chart', false, chart);
    }
  } else {
    add('chart', true, { skipped: 'no vwdIds to fetch' });
  }

  return finish(steps);
}

async function tryJson(name, url, init) {
  const res = await tryText(name, url, init);
  if (!res.ok) return res;
  try {
    return { ...res, body: JSON.parse(res.text), text: undefined };
  } catch {
    return {
      ok: false,
      status: res.status,
      note: /<html/i.test(res.text)
        ? 'Got an HTML page instead of JSON — the session is almost certainly expired.'
        : 'Response was not valid JSON.',
    };
  }
}

async function tryText(name, url, init) {
  try {
    const res = await throttledFetch(url, init);
    return { ok: true, status: res.status, text: await res.text() };
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      return { ok: false, status: err.status ?? 401, note: 'Session expired (401/403). Log in to DEGIRO again.' };
    }
    return { ok: false, status: err.status ?? null, note: `${err.name ?? 'Error'}: ${err.message}` };
  }
}

function finish(steps) {
  const failed = steps.find((s) => !s.ok);
  return {
    steps,
    ok: !failed,
    summary: failed ? `Failed at step: ${failed.name} — ${failed.note ?? 'see detail'}` : 'All endpoints reachable and parsed.',
    at: new Date().toISOString(),
  };
}

/** Everything about the local install, for a bug report. No personal data. */
export async function localInfo() {
  const [lastSyncAt, lastError, syncState, lastDataDate] = await Promise.all([
    getMeta('lastSyncAt', 0),
    getMeta('lastError', null),
    getMeta('syncState', null),
    getMeta('lastDataDate', null),
  ]);
  return {
    version: (globalThis.chrome?.runtime?.getManifest?.() ?? {}).version ?? 'unknown',
    userAgent: globalThis.navigator?.userAgent ?? 'unknown',
    today: todayISO(),
    lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    lastDataDate,
    lastError,
    syncState,
  };
}
