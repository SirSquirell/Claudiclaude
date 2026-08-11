/**
 * The broker boundary.
 *
 * Everything broker-specific lives behind one of these. Nothing above it —
 * `engine.js`, `combine.js`, the UI — may name a broker, and the moment
 * something does, the boundary has stopped being one.
 *
 * `docs/MULTI-BROKER.md` §C lists what an adapter has to supply and why none of
 * it can be shared. The short version of the risk: the temptation is to reach
 * past this for one broker-specific special case, and the first one makes the
 * second inevitable.
 *
 * ## Deliberately not an interface with one implementation "for later"
 *
 * Rule 8 (YAGNI) would normally kill an abstraction with a single caller. This
 * one earns its place on a different argument: `docs/MULTI-BROKER.md` recommends
 * doing the structural work **while there is still only one broker to get it
 * wrong with**, and an interface introduced after the second broker exists is
 * the same refactor done with two things to break instead of one.
 *
 * What is *not* here is anything speculative. There is no `fetchOptions`, no
 * capability flags, no plugin loader — only the five things `sync.js` already
 * calls today, named.
 *
 * ## The shape
 *
 * ```
 * {
 *   id:      'degiro',            // storage key prefix, stable forever
 *   label:   'DEGIRO',            // what the UI shows
 *   host:    'trader.degiro.nl',  // for the manifest and the throttle queue
 *
 *   resolveSession({refresh}) -> {ok, ...session} | {ok:false, reason}
 *   checkSession(session)     -> {ok, update} | {ok:false, reason}
 *
 *   fetchTransactions({session, fromDate, toDate}) -> raw
 *   fetchCashRows({session, fromDate, toDate})     -> raw
 *   fetchProducts({session, ids})                  -> raw
 *   fetchPrices({session, instruments, period})    -> raw
 *
 *   parseTransactions(raw) -> normalised[]
 *   parseCashRows(raw)     -> normalised[]   // each row carries its category
 *   parseProducts(raw)     -> {id: product}
 *   parsePrices(raw)       -> {vwdId: series}
 *   parseLiveTotal(update) -> {totalValue, positions, ...}
 *
 *   explain(reason, error) -> a sentence someone can act on
 * }
 * ```
 *
 * Two things about that list are load-bearing rather than incidental:
 *
 * - **`parseCashRows` returns rows that already carry a `category`.** The engine
 *   reads `row.category` and classifies nothing itself, so the rule table is a
 *   *parse-time, per-broker* concern. That is not an accident of the current
 *   code — it is what makes rule 4 enforceable per broker: an unmatched
 *   description is `UNKNOWN`, counted against the broker whose vocabulary it is,
 *   and never quietly folded into another broker's clean sheet.
 * - **There is no `login`.** Rule 9. An adapter reads a session the browser
 *   already holds or it does not exist.
 */

import * as degiro from './degiro.js';

/**
 * Every adapter that exists. Order is display order.
 *
 * A registry rather than a lookup table with one entry, because `sync.js` and
 * the UI both need to iterate: "sync all connected brokers" and "one tab per
 * broker" are the two things US-23 and US-24 are made of.
 */
export const ADAPTERS = [degiro];

export const byId = (id) => ADAPTERS.find((a) => a.id === id) ?? null;

/**
 * The adapters a given install actually has data for.
 *
 * Deliberately not "the ones the user enabled": there is no setting yet and
 * inventing one would be rule 8. A broker is connected when it has rows.
 */
export function connected(rowCountsByBroker) {
  return ADAPTERS.filter((a) => (rowCountsByBroker?.[a.id] ?? 0) > 0);
}

/**
 * Check an object really implements the boundary.
 *
 * Exported so the conformance test can run it over every registered adapter
 * rather than over the one somebody remembered to add. When Trade Republic
 * arrives, the first thing it has to pass is this — and the failure is a list
 * of missing names rather than a `TypeError` three layers into a sync.
 */
export const REQUIRED = [
  'id',
  'label',
  'host',
  'resolveSession',
  'checkSession',
  'fetchTransactions',
  'fetchCashRows',
  'fetchProducts',
  'fetchPrices',
  'parseTransactions',
  'parseCashRows',
  'parseProducts',
  'parsePrices',
  'parseLiveTotal',
  'explain',
];

export function missingMembers(adapter) {
  return REQUIRED.filter((k) => adapter?.[k] == null);
}
