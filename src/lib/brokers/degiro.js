/**
 * DEGIRO, as a broker adapter.
 *
 * This is a **façade, not a rewrite**. Every function below forwards to the
 * module that already did the work — `session.js`, `degiro.js`, `parse.js`. The
 * point is not to move code; it is to give the four scattered modules one name,
 * so that `sync.js` can loop over brokers instead of calling them directly, and
 * so a second broker is a sibling file rather than a set of `if` statements.
 *
 * Nothing here has behaviour of its own. If a line in this file ever does more
 * than forward and rename, that is the boundary leaking and it belongs on one
 * side or the other.
 *
 * `explain` is the one apparent exception, and it is still a forward: the
 * message table lives with the session code that produces the reasons.
 */

import { SESSION_COOKIE_NAME, TRADER_HOST } from '../config.js';
import {
  fetchAccountOverview,
  fetchPriceChunk,
  fetchProductsInfo,
  fetchTransactions as fetchTx,
} from '../degiro.js';
import {
  parseCashMovements,
  parseChartResponse,
  parseProducts as parseProductsRaw,
  parseTransactions as parseTxRaw,
  parseUpdate,
} from '../parse.js';
import { SESSION_MESSAGES, checkSession as check, resolveSession as resolve } from '../session.js';

export const id = 'degiro';
export const label = 'DEGIRO';
export const host = TRADER_HOST;

// --- session ---------------------------------------------------------------

export const resolveSession = (opts) => resolve({ host: TRADER_HOST, cookieName: SESSION_COOKIE_NAME, ...opts });
export const checkSession = (session) => check(session);

// --- fetch -----------------------------------------------------------------

export const fetchTransactions = ({ session, fromDate, toDate }, opts) =>
  fetchTx({ ...session, fromDate, toDate }, opts);

export const fetchCashRows = ({ session, fromDate, toDate }, opts) =>
  fetchAccountOverview({ ...session, fromDate, toDate }, opts);

export const fetchProducts = ({ session, ids }) => fetchProductsInfo({ ...session, productIds: ids });

export const fetchPrices = ({ session, instruments, period }) =>
  fetchPriceChunk({ vwdIds: instruments, userToken: session.userToken, period });

// --- parse -----------------------------------------------------------------

export const parseTransactions = (raw) => parseTxRaw(raw);

/**
 * Cash rows arrive already classified, and that is the interface rather than an
 * implementation detail: the engine reads `row.category` and classifies nothing
 * itself, so each broker's rule table is applied here, in its own adapter,
 * against its own vocabulary. Rule 4 is then enforceable per broker — an
 * unmatched description becomes `UNKNOWN` and is counted against the broker
 * whose wording it is.
 */
export const parseCashRows = (raw) => parseCashMovements(raw);

export const parseProducts = (raw) => parseProductsRaw(raw);
export const parsePrices = (raw) => parseChartResponse(raw);
export const parseLiveTotal = (raw) => parseUpdate(raw);

// --- messages --------------------------------------------------------------

export const explain = (reason, error) => SESSION_MESSAGES[reason] ?? String(error ?? reason);
