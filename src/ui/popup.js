/**
 * Popup. SPEC §3.2: "Popup shows the numbers (value, day, week, month) and a
 * sparkline; the toolbar click or a button opens a full extension page."
 *
 * It reads the cached derived result rather than recomputing, so it paints
 * immediately even when the service worker is asleep.
 *
 * US-60: every string here goes through `t()`. Nothing is written to the DOM in
 * English by this file — an untranslated string has to be *counted* by
 * `missing()`, and a hardcoded one never reaches it. That is the whole reason
 * the popup being English-only went unnoticed through a full redesign.
 */

import { lockupSvg } from './brand.js';
import { wirePressFeedback } from './motion.js';
import { sparkline } from './charts.js';
import { applyStatic, getLang, t } from './i18n.js';
import { applyTheme, fmtEurCents, fmtSigned, tokens } from './theme.js';
import { inExtension, loadDemo, send, wantsDemo } from './datasource.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The worker's progress, in the reader's language.
 *
 * By phase rather than by message, and that is the design rather than a
 * shortcut. `sync.js` writes English sentences and two of them interpolate a
 * count — `Fetched 412 transactions.` — so they cannot be dictionary keys: the
 * dictionary is keyed by the English string itself, and a string with a number
 * baked into it has as many keys as the account has transactions.
 *
 * The checkpoint also carries `phase`, which is a closed set of seven. At 320 px
 * that is the right amount of detail anyway; the full page is where a run is
 * followed step by step, and it still shows the worker's own words.
 */
const PHASES = {
  session: 'Checking your session…',
  portfolio: 'Reading your portfolio…',
  transactions: 'Fetching transactions…',
  cashflows: 'Fetching cash movements…',
  products: 'Fetching product details…',
  prices: 'Fetching prices…',
  derive: 'Rebuilding the history…',
  done: 'Up to date.',
};

/**
 * `phase` is what `sync.js` names its step; an unknown one falls back to the
 * generic word rather than to the English sentence, because a sentence that
 * appears in one language inside a Dutch panel reads as a bug and *is* one.
 */
const phaseText = (state) => t(PHASES[state?.phase] ?? 'Syncing…');

/**
 * The popup had no error capture at all, so a defect in `paint` — which runs
 * after `main` resolves, on every sync — showed a blank panel and reported
 * nothing at all.
 *
 * It writes to the *persisted* ring rather than an in-memory one, because the
 * popup closes when you click away from it, and that is usually the same
 * gesture as giving up on it. An in-memory record here would never be read.
 * Demo mode has no IndexedDB and no worker, so it only shows the message.
 */
const note = (kind, err) => {
  if (!inExtension) return;
  import('../lib/errorstore.js')
    .then((m) => m.recordError(kind, err))
    .catch(() => {});
};

if (inExtension) {
  window.addEventListener('error', (e) => {
    if (!e.error && !e.message) return;
    note('popup-error', e.error ?? { message: e.message });
  });
  window.addEventListener('unhandledrejection', (e) => note('popup-unhandled-rejection', e.reason));
}

main().catch((err) => {
  // Both, not either: the text is for whoever is looking at it now, the record
  // is for the report. A message shown and not written down is how the two
  // worst defects in this project arrived as a screenshot and a sentence.
  note('popup-main', err);
  fail(String(err?.message ?? err));
});

/** One place that puts the status line into its bad state, so it cannot drift. */
function fail(text) {
  $('#status').textContent = text;
  $('#status').classList.add('down');
}

function ok(text) {
  $('#status').textContent = text;
  $('#status').classList.remove('down');
}

async function main() {
  // The popup has no controls of its own for either of these, but it must not
  // disagree with the page: a reader who chose Light and Nederlands gets a light
  // Dutch popup too. Both are read from the same preference the app writes.
  applyTheme();
  document.documentElement.lang = getLang();
  applyStatic();

  // 24 is `MIN_LOCKUP_HEIGHT`. Below it `lockupSvg` returns the mark alone,
  // which is the guard working — at 22 the popup was silently wordmark-less.
  $('#lockup').replaceChildren(lockupSvg({ height: 24 }));
  // The popup's two buttons get the same press behaviour as the page's, from
  // the same listener rather than from a copy of it.
  wirePressFeedback();

  $('#btn-open').addEventListener('click', () => {
    if (inExtension) send({ type: 'openApp' }).then(() => window.close());
    else window.open('app.html?demo=1', '_blank');
  });

  $('#btn-sync').addEventListener('click', async (e) => {
    if (!inExtension) return;
    /**
     * `currentTarget`, not `target`. The button is plain text today so both
     * resolve to the same node — but the connection-check button had exactly
     * this shape, gained a broker mark, and then a click on the mark made
     * `target` the `<svg>`: `disabled` did nothing and the busy label was
     * written *inside the icon*, where it stayed. That was a real reported
     * defect, and this is the line that stops it being reported twice.
     */
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = t('Syncing…');

    // Show the worker's own checkpoint while it runs, so a slow step is
    // distinguishable from a stuck one.
    const poll = setInterval(async () => {
      try {
        const st = await send({ type: 'status' });
        if (st.syncState) ok(phaseText(st.syncState));
      } catch {
        /* worker restarting */
      }
    }, 400);

    try {
      // Long, because a first backfill is minutes of throttled requests and a
      // deadline that fires while the sync is healthy would report a failure
      // that did not happen. The catch below checks before claiming one.
      const res = await send({ type: 'sync', force: true }, { timeoutMs: 300000 });
      if (!res.ok) {
        // The broker's own reason, not a generic line: this is often the only
        // place the user sees why it failed. It is not translated — it comes
        // from `sync.js` and naming a failure in the language it was raised in
        // is what makes it findable in a bug report.
        fail(res.message ?? t('Sync failed.'));
        return;
      }
      const status = await send({ type: 'status', includeDerived: true });
      if (status.derived) await paint(status.derived, { lastSyncAt: Date.now() });
      else ok(t('Up to date.'));
    } catch (err) {
      // Losing the reply is not the same as the sync failing. Chrome can kill
      // the worker mid-message without ever failing the call, and the work often
      // carries on in the next one — so ask the checkpoint before calling it a
      // failure in red. The full page is where a run can actually be followed.
      const still = await send({ type: 'status' }).catch(() => null);
      if (still?.syncing || still?.syncState?.done === false) ok(t('Still syncing — open the full chart to follow it.'));
      else fail(String(err.message ?? err));
    } finally {
      clearInterval(poll);
      btn.disabled = false;
      btn.textContent = t('Sync now');
    }
  });

  if (!inExtension || wantsDemo()) {
    const { result } = await loadDemo();
    return paint(result, { demo: true });
  }

  const status = await send({ type: 'status', includeDerived: true });
  if (status.syncing) {
    ok(phaseText(status.syncState));
  } else if (status.lastError) {
    fail(status.lastError.message ?? t('The last sync failed. Open DEGIRO and log in.'));
  }
  if (!status.derived) {
    if (!status.lastError && !status.syncing) {
      ok(t('No data yet — press Sync now while logged in to DEGIRO.'));
    }
    // "Open full chart" leads to the page with the connection check on it.
    return;
  }
  await paint(status.derived, status);
}

/**
 * One hero and three facts, which is the app's hierarchy rather than the app's
 * layout: at 320 px the same reasoning gives a different arrangement, and what
 * carries over is that the value you opened this for is not the same size as the
 * three figures supporting it.
 *
 * `--len` is copied from the app's tile builder for the same reason it exists
 * there — a seven-figure total sliced by `overflow: hidden` is a wrong number
 * shown silently, and this panel is 320 px wide.
 */
const cell = (kind, label, value, cls = '') => `
  <div class="tile ${kind}">
    <div class="label">${esc(t(label))}</div>
    <div class="value ${cls}" style="--len:${[...value].length}">${esc(value)}</div>
  </div>`;

async function paint(r, status = {}) {
  const tk = tokens();
  const last = r.days.length - 1;
  const day = r.pnl[last];
  const week = r.pnl.slice(Math.max(0, last - 6)).reduce((a, b) => a + b, 0);
  const month = r.pnl.slice(Math.max(0, last - 29)).reduce((a, b) => a + b, 0);

  ok(status.demo
    ? t('Demo data')
    : status.lastSyncAt
      // The time is nl-NL throughout, deliberately: that is a locale for a clock
      // rather than a language for prose. See the note at the top of i18n.js.
      ? t('Synced at {time}', { time: new Date(status.lastSyncAt).toLocaleTimeString('nl-NL') })
      : t('Not synced yet'));

  const sign = (n) => (n >= 0 ? 'up' : 'down');
  $('#tiles').innerHTML = `
    <div class="hero-row">
      ${cell('is-hero', 'Total value', fmtEurCents(r.totals.value))}
      <div class="facts">
        ${cell('is-fact', 'Today', fmtSigned(day), sign(day))}
        ${cell('is-fact', 'Week', fmtSigned(week), sign(week))}
        ${cell('is-fact', 'Month', fmtSigned(month), sign(month))}
      </div>
    </div>`;

  // Which build this is. The popup is where a tester looks first, and a bug
  // report about an unnamed version costs a round trip to establish.
  const el = $('#version');
  if (el && inExtension) el.textContent = `v${chrome.runtime.getManifest().version}`;

  // Last 90 days of value, enough to read the shape in 64px.
  sparkline($('#spark'), r.value.slice(Math.max(0, last - 89)), tk);
}
