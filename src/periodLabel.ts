// ── The pay period a budget month stands for ───────────────────────────────
//
// Purely a LABEL. Nothing here feeds a total, a chart or a comparison: the
// month's numbers still belong to the month's bucket, exactly as before.
//
// That is deliberate, and it is the only honest option. A budget row is
// `{ label, amount }` with no date on it — there is no fact about WHEN inside a
// month, so a period straddling two months has nothing to apportion. Splitting
// 6/31 of July into August would invent a precision the data does not have.
// This says "the bucket you are looking at is my 25th-to-24th pay period"
// without pretending the app moved anything.
//
// Pure and storage-injected, so it unit-tests without a browser.

import type { StorageLike } from './backup';

export const PERIOD_START_KEY = 'budget_period_start_day';

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

/** The day a period starts, clamped to a day that exists in that month —
 *  the 31st in February is the 28th (or 29th). */
function startDate(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, daysIn(year, month)));
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
export function periodRange(year: number, month: number, startDay: number): PeriodRange {
  // Paid on the 1st? Then the budget month IS the calendar month. The general
  // rule below would instead hand back the whole PREVIOUS month (1 Jul – 31 Jul
  // while the heading said August), which is nobody's idea of their August pay
  // period — and an earlier test asserted that wrong answer under the name
  // "is just the calendar month", so the suite agreed with the bug.
  if (startDay <= 1) {
    return { from: new Date(year, month, 1), to: new Date(year, month + 1, 0) };
  }
  const from = startDate(year, month - 1, startDay);
  const nextStart = startDate(year, month, startDay);
  // One day before the next period opens. Date handles month and year rollover,
  // so no arithmetic here can land on a day that does not exist.
  const to = new Date(nextStart);
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
  { override, startDay, year, month, format }: {
    override?: string;
    startDay: number | null;
    year: number;
    month: number;
    format: (range: PeriodRange) => string;
  },
): string | null {
  const own = override?.trim();
  if (own) return own;
  if (startDay === null) return null;
  return format(periodRange(year, month, startDay));
}
