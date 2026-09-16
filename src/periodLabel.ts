// ── The pay period a budget month stands for ───────────────────────────────
//
// For the BUDGET, purely a label. Nothing here feeds a planned total, a chart or
// a comparison: the month's planned numbers still belong to the month's bucket,
// exactly as before.
//
// That is deliberate, and it is the only honest option for a plan. A budget row
// is `{ label, amount }` with no date on it — there is no fact about WHEN inside
// a month, so a period straddling two months has nothing to apportion.
// Splitting 6/31 of July into August would invent a precision the data does not
// have. The label says "the bucket you are looking at is my 25th-to-24th pay
// period" without pretending the app moved anything.
//
// For the RECORD it is different, and `budgetMonthOf` below is where the
// difference lives. An ActualEntry carries a real date from the bank, so asking
// which period it falls in invents nothing — it reads a fact that is already
// there. The reason the period had to stay cosmetic simply does not apply to
// data that knows when it happened.
//
// Measured on one real statement before this existed: with a pay period
// starting on the 25th, 74.5% of a month's spending was filed under the wrong
// budget month, because rent, transfers and every standing charge land on the
// 25th — the very day the period turns over.
//
// Pure and storage-injected, so it unit-tests without a browser.

import type { StorageLike } from './backup';

export const PERIOD_START_KEY = 'budget_period_start_day';
export const PERIOD_LOCKS_KEY = 'budget_period_locks';

/**
 * Periods the user has pinned by hand, keyed "<year>_<month>" by the BUDGET
 * month they open, holding the date they open on as "YYYY-MM-DD".
 *
 * The escape hatch for what no rule can know: an employer who pays three days
 * early before Christmas, a month the money came in two parts, a bank holiday
 * the weekend rule has never heard of. The rule handles the four weekends a
 * year; this handles the rest, one month at a time, and only when asked.
 */
export type PeriodLocks = Record<string, string>;

export const lockKey = (year: number, month: number): string => `${year}_${month}`;

/** A stored "YYYY-MM-DD" as a LOCAL date, or null. Local, not UTC: a date built
 *  through Date.parse lands at midnight UTC, which is the previous evening in
 *  Stockholm and shifts every boundary by a day. */
function parseLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isPeriodLocks(v: unknown): v is PeriodLocks {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    && Object.values(v).every(x => typeof x === 'string' && parseLocal(x) !== null);
}

export function loadPeriodLocks(storage: StorageLike): PeriodLocks {
  const raw = storage.getItem(PERIOD_LOCKS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPeriodLocks(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Ceiling for a hand-written label. It renders in the page header, so an
 *  unbounded string would shove the month navigation off screen. Shared by the
 *  input and the backup validator so neither can accept what the other refuses. */
export const PERIOD_LABEL_MAX = 60;

/** Which day of the month a pay period begins. 1 means the period IS the
 *  calendar month. */
export function isValidStartDay(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;
}

export function loadStartDay(storage: StorageLike): number | null {
  const raw = storage.getItem(PERIOD_START_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return isValidStartDay(n) ? n : null;
}

function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * The day of the month a period actually opens.
 *
 * Two adjustments, both of which happen to real people every year:
 *
 *   • Clamped to a day that exists — a period starting on the 31st opens on the
 *     28th in February.
 *   • Moved OFF A WEEKEND, backwards. Swedish employers pay on the last banking
 *     day before payday, so when the 25th is a Saturday the money arrives on
 *     Friday the 24th. In 2026 that is four months of twelve: January, April,
 *     July and October. A fixed day number can never match a year; this is why.
 *
 * Never walks out of the month: a start day of 2 on a Sunday stops at the 1st
 * rather than reaching back into the month before, which would make a period
 * that opens twice.
 */
function openingDay(year: number, month: number, day: number): number {
  let d = Math.min(day, daysIn(year, month));
  while (d > 1) {
    const weekday = new Date(year, month, d).getDay();
    if (weekday !== 0 && weekday !== 6) break;
    d--;
  }
  return d;
}

/** The date a period starts — see openingDay for the two adjustments. */
function startDate(year: number, month: number, day: number): Date {
  return new Date(year, month, openingDay(year, month, day));
}

export interface PeriodRange {
  from: Date;
  to: Date;
}

/**
 * The range that budget month `month` (0-11) of `year` stands for.
 *
 * It begins on `startDay` of the PREVIOUS month and ends the day before the
 * next period begins — so August with a start day of 25 reads 25 Jul – 24 Aug.
 * With a start day of 1 it is simply the calendar month.
 */
/** The day one budget month's period opens: a hand-pinned date if there is one,
 *  otherwise the rule. The single place both ends of a range come from, so a
 *  lock can never move one end without moving its neighbour's. */
function periodOpen(
  year: number, month: number, startDay: number, locks: PeriodLocks,
): Date {
  const pinned = locks[lockKey(year, month)];
  const parsed = pinned ? parseLocal(pinned) : null;
  if (parsed) return parsed;
  // Paid on the 1st? Then the budget month IS the calendar month. The general
  // rule below would instead hand back the whole PREVIOUS month (1 Jul – 31 Jul
  // while the heading said August), which is nobody's idea of their August pay
  // period — and an earlier test asserted that wrong answer under the name
  // "is just the calendar month", so the suite agreed with the bug.
  if (startDay <= 1) return new Date(year, month, 1);
  return startDate(year, month - 1, startDay);
}

export function periodRange(
  year: number, month: number, startDay: number, locks: PeriodLocks = {},
): PeriodRange {
  const from = periodOpen(year, month, startDay, locks);
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  // One day before the next period opens. Date handles month and year rollover,
  // so no arithmetic here can land on a day that does not exist.
  const to = new Date(periodOpen(nextYear, nextMonth, startDay, locks));
  to.setDate(to.getDate() - 1);
  return { from, to };
}

/**
 * The label for a month: the user's own text if they wrote one, otherwise the
 * generated range, otherwise nothing at all.
 *
 * `format` turns a range into a string — the caller owns that, because month
 * names are per-language and this module stays free of i18n.
 */
export function periodLabelFor(
  { override, startDay, year, month, format, locks = {} }: {
    override?: string;
    startDay: number | null;
    year: number;
    month: number;
    format: (range: PeriodRange) => string;
    locks?: PeriodLocks;
  },
): string | null {
  const own = override?.trim();
  if (own) return own;
  // A pinned month has a period even with no start day set — pinning one IS
  // saying where it begins. Without this the header kept printing the rule's
  // range while the follow-up tab printed the pinned one: two answers to the
  // same question, on the same screen.
  if (startDay === null && locks[lockKey(year, month)] === undefined) return null;
  return format(periodRange(year, month, startDay ?? 1, locks));
}

/**
 * The budget month a real date belongs to, given the pay period.
 *
 * `month` is the 0-based index the rest of the app uses. Returns null for a
 * string that is not a date, so a caller can tell "unreadable" from "January".
 *
 * Exactly consistent with `periodRange` — a property the test suite checks
 * date by date rather than trusting the arithmetic here to agree with the
 * arithmetic there.
 */
export function budgetMonthOf(
  dateISO: string,
  startDay: number | null,
  locks: PeriodLocks = {},
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > daysIn(year, month)) return null;

  // No period and nothing pinned: the budget month IS the calendar month.
  if (startDay === null && Object.keys(locks).length === 0) return { year, month };
  const effectiveStart = startDay ?? 1;

  // ASKS periodRange rather than re-deriving its rule. The two used to compute
  // the same thing in different shapes, which worked only as long as both were
  // edited together — and a hand-pinned date has no closed form to re-derive
  // anyway. A period is about a month long, so the answer is always the
  // calendar month or one of its neighbours.
  const time = new Date(year, month, day).getTime();
  for (const delta of [0, 1, -1]) {
    const c = new Date(year, month + delta, 1);
    const r = periodRange(c.getFullYear(), c.getMonth(), effectiveStart, locks);
    if (time >= r.from.getTime() && time <= r.to.getTime()) {
      return { year: c.getFullYear(), month: c.getMonth() };
    }
  }
  // Unreachable while periods tile the calendar, which the suite checks. A
  // pinned date that overlaps its neighbour could open a gap; the calendar
  // month is the least surprising place for an entry that falls in one.
  return { year, month };
}
