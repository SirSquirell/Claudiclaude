/**
 * Date helpers. Everything in this project is an ISO 'YYYY-MM-DD' day string.
 *
 * Rule: never construct a Date from a local-time string and never read local
 * getters. All arithmetic goes through UTC so the series does not shift by a day
 * for anyone east or west of Amsterdam.
 */

const MS_PER_DAY = 86400000;

/** 'YYYY-MM-DD' -> epoch millis at UTC midnight. */
export function toEpoch(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** epoch millis -> 'YYYY-MM-DD' (UTC). */
export function fromEpoch(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Add (possibly negative) whole days to an ISO day. */
export function addDays(iso, n) {
  return fromEpoch(toEpoch(iso) + n * MS_PER_DAY);
}

/** Whole days between two ISO days, b - a. */
export function daysBetween(a, b) {
  return Math.round((toEpoch(b) - toEpoch(a)) / MS_PER_DAY);
}

/** Inclusive list of every calendar day from `start` to `end`. */
export function dayRange(start, end) {
  const out = [];
  const last = toEpoch(end);
  for (let t = toEpoch(start); t <= last; t += MS_PER_DAY) out.push(fromEpoch(t));
  return out;
}

/** 0 = Sunday .. 6 = Saturday, in UTC. */
export function weekday(iso) {
  return new Date(toEpoch(iso)).getUTCDay();
}

/** 'YYYY-MM'. */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

/** ISO week key, 'YYYY-Www'. Monday-based, per ISO-8601. */
export function weekKey(iso) {
  const d = new Date(toEpoch(iso));
  // Shift to the Thursday of this week; the year of that Thursday is the ISO year.
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = Date.UTC(isoYear, 0, 4);
  const firstDay = (new Date(firstThursday).getUTCDay() + 6) % 7;
  const week = 1 + Math.round((d.getTime() - firstThursday + firstDay * MS_PER_DAY) / (7 * MS_PER_DAY));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Monday of the ISO week containing `iso`. */
export function startOfWeek(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

export function startOfMonth(iso) {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * Same day-of-month, `n` months earlier. Clamps to the last day of the target
 * month, so 31 March minus one month is 28/29 February rather than 2/3 March.
 */
export function subMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) - n;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromEpoch(Date.UTC(ty, tm, Math.min(d, lastDay)));
}

/** Today, in the Europe/Amsterdam calendar, as an ISO day. */
export function todayISO(now = new Date()) {
  // en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * DEGIRO reporting rows carry ISO-ish datetimes, e.g. '2024-03-05T14:22:11+01:00'
 * or '2024-03-05'. We only ever want the calendar day.
 */
export function isoDayOf(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // dd-MM-yyyy or dd/MM/yyyy, which the older reporting endpoints sometimes use.
    const eu = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Cut an inclusive date window into consecutive, non-overlapping slices of at
 * most `months` each.
 *
 * The reporting endpoints answer a wide date range with a 502: the query times
 * out on DEGIRO's side, and asking again changes nothing. Splitting the window
 * is the fix. Slices must not overlap, or a row on a boundary date is counted
 * twice.
 */
export function splitWindows(from, to, months = 12) {
  if (from > to) return [];
  const out = [];
  let start = from;
  while (start <= to) {
    const [y, m, d] = start.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const lastDay = new Date(Date.UTC(Math.floor(total / 12), (total % 12) + 1, 0)).getUTCDate();
    let end = addDays(fromEpoch(Date.UTC(Math.floor(total / 12), total % 12, Math.min(d, lastDay))), -1);
    if (end > to) end = to;
    out.push({ from: start, to: end });
    start = addDays(end, 1);
  }
  return out;
}

/** Human label for an axis tick: '5 Mar 2024'. */
export function formatDay(iso, locale = 'nl-NL') {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(toEpoch(iso)));
}
