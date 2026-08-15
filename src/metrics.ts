// ── metrics — the single source of truth for the app's money math ──────────
//
// Pure, framework-free functions: no React, no localStorage, no formatting — so
// every view computes the same numbers the same way, and the formulas can be
// unit-tested in isolation (see metrics.test.ts).
//
// Canonical definitions (UX review §6, plus the savings-model fix of 2026-07-14):
//   • Budgeted expenses = every category in the Budget tab's expenses, INCLUDING
//     the in-budget "sparande" category. It's money you've already assigned.
//   • Remaining (after budget) = income − budgeted expenses.
//   • Savings BALANCE = the Savings-tab categories, EXCLUDING pension.
//     ⚠️ The amount recorded on a month is a RUNNING TOTAL (what you have), not
//     that month's deposit. That's what people actually type in, and what the
//     Growth chart plots — a line that only "grows" if it's a balance. Never sum
//     balances across months; that double-counts (the old Year-tab total and the
//     old plan-vs-actual chart both did, and both were wrong).
//     Pension is a separate long-term bucket, never folded into the balance.
//   • ⚠️ A month with NO savings recorded is UNKNOWN, not zero. "I haven't filled
//     August in yet" and "I emptied the account" are different facts, and reading
//     the first as the second told users they'd withdrawn everything (the
//     −10 000 kr bug of 2026-07-16). Absence is never a number: the helpers below
//     take/return SavingsSnapshot and `null`, and the UI shows "–" for unknown.
//     An explicitly recorded 0 IS a real balance and must survive every filter —
//     never resurrect `balance > 0` or `a || b` as a has-data test.
//   • Saved this month = how much the balance MOVED since last month (may be
//     negative if you withdrew). Unknown unless BOTH months have a snapshot: with
//     no previous snapshot the current one is just a baseline, and calling the
//     whole pot "saved this month" would be a lie.
//   • Savings rate = saved this month ÷ income. NOT balance ÷ income — a 50 000
//     balance on a 30 000 income would read 167%. Unknown when the month's saving
//     is unknown (0% is a real result and must not stand in for "no data").
//   • Year's savings = where the balance ended minus what carried in from the
//     previous December (see yearSavingsGrowth) — unknown without that baseline.
//   • Leftover rate = remaining ÷ income = the share of income not yet budgeted.

import type { MonthData, BudgetCategory, BudgetRow, RowPeriod } from './types';

/** The savings category treated as a separate long-term bucket. Excluded from
 *  every "saved" total so Savings, Plan and Year never disagree. */
export const PENSION_CATEGORY_ID = 'pension';

export const ROW_PERIODS = ['month', 'quarter', 'year', 'once'] as const;

/** Shared by the picker and the backup validator, so the UI can never offer a
 *  period an import would reject, or vice versa. */
export function isRowPeriod(v: unknown): v is RowPeriod {
  return typeof v === 'string' && (ROW_PERIODS as readonly string[]).includes(v);
}

/** Rows that do NOT recur next month, so copying a budget forward must leave
 *  them behind. Carrying a yearly subscription into February would add a charge
 *  that never happens; the cost of skipping is that the user re-adds it when it
 *  is genuinely due, which the app cannot know — it has no calendar. */
export function recursNextMonth(row: BudgetRow): boolean {
  return !isRowPeriod(row.period) || row.period === 'month';
}

/** A row contributes exactly what it says. `period` is a timing label, never
 *  a multiplier — see RowPeriod in types.ts for why the division was removed. */
export function sumRows(rows: BudgetRow[]): number {
  return rows.reduce((s, r) => s + (r.amount || 0), 0);
}

export function categoryTotal(cat: BudgetCategory): number {
  return sumRows(cat.rows ?? []);
}

/** Sum a list of categories, optionally skipping one id (used to drop pension). */
export function sumCategories(cats: BudgetCategory[], excludeId?: string): number {
  return cats.reduce(
    (s, c) => (excludeId && c.id === excludeId ? s : s + categoryTotal(c)),
    0,
  );
}

/** value/base as an integer percent, clamped to ≥ 0, and 0 when base ≤ 0 —
 *  avoids divide-by-zero and nonsensical negative rates. */
export function ratePct(value: number, base: number): number {
  if (base <= 0) return 0;
  return Math.max(0, Math.round((value / base) * 100));
}

export interface BudgetMetrics {
  income: number;
  expenses: number;     // all budgeted expense categories (incl. in-budget savings)
  remaining: number;    // income − expenses (may be negative)
  leftoverRate: number; // % of income not consumed by budgeted expenses
}

export function calculateBudgetMetrics(month: MonthData): BudgetMetrics {
  const income = sumRows(month.income ?? []);
  const expenses = sumCategories(month.expenses ?? []);
  const remaining = income - expenses;
  return { income, expenses, remaining, leftoverRate: ratePct(remaining, income) };
}

/** Total days in the given month (year, 0-based month index). */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Days remaining in the date's month, INCLUDING the date's own day —
 *  on July 12 of a 31-day month there are 20 spendable days left. */
export function daysLeftInMonth(d: Date): number {
  return daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1;
}

export interface RemainingSplit {
  perDay: number;
  perWeek: number;
}

/** Split the month's remaining money into a livable per-day / per-week pace.
 *  Truncated toward zero — never promise more than what's actually there. */
export function splitRemaining(remaining: number, daysLeft: number): RemainingSplit {
  if (daysLeft <= 0) return { perDay: 0, perWeek: 0 };
  const perDay = remaining / daysLeft;
  return { perDay: Math.trunc(perDay), perWeek: Math.trunc(perDay * 7) };
}

export interface SavingsSnapshot {
  /** Did the user actually record savings for this month? `false` = no answer.
   *  Inferred from the presence of savings categories, NOT from the amount —
   *  a category sitting at 0 is someone telling us their balance is 0. */
  hasSnapshot: boolean;
  balance: number;  // savings categories EXCLUDING pension — a RUNNING TOTAL
  pension: number;  // pension bucket balance (shown separately)
}

/** The savings snapshot recorded on a month. Never sum balances across months.
 *  A month the user never touched comes back `hasSnapshot: false` — callers must
 *  branch on that rather than reading `balance` (which is 0 for "unknown" only
 *  because there's nothing to add up).
 *
 *  `hasSnapshot` is the stored `savingsSnapshotRecorded` flag when present:
 *  inferring it from `savings.length > 0` broke the moment the savings template
 *  landed — "Use savings template" created four 0 kr categories and the app
 *  instantly reported the previous balance as withdrawn (main review §5).
 *  Structure is not a statement about money; only an amount edit is.
 *
 *  Old months predate the flag and fall back to the length inference, which is
 *  correct FOR THEM: before templates could create empty categories, categories
 *  only existed alongside recorded numbers — and treating old history as
 *  recorded keeps it (a false "unknown" would erase real balances from charts). */
export function calculateSavingsMetrics(month: MonthData): SavingsSnapshot {
  const savings = month.savings ?? [];
  // Balances, NOT flows — so they go through the raw sum. Routing them through
  // sumRows would let a stray `period` on a savings row divide a recorded
  // balance by twelve, turning 60 000 kr into 5 000 kr on every chart that
  // reads it. The UI never offers a period here, but a hand-edited or imported
  // file could carry one, and "the UI wouldn't do that" is not a safeguard.
  const balance = sumCategories(savings, PENSION_CATEGORY_ID);
  const pension = savings
    .filter(c => c.id === PENSION_CATEGORY_ID)
    .reduce((s, c) => s + categoryTotal(c), 0);
  const hasSnapshot = typeof month.savingsSnapshotRecorded === 'boolean'
    ? month.savingsSnapshotRecorded
    : savings.length > 0;
  return { hasSnapshot, balance, pension };
}

/** What you actually put away this month = how far the balance moved.
 *  Negative when you withdrew more than you added.
 *
 *  `null` when either month is unknown, and the two reasons are both real:
 *  without THIS month we'd report the whole previous balance as a withdrawal,
 *  and without the PREVIOUS one this month is merely a baseline — the pot might
 *  be a lifetime of saving rather than this month's work. */
export function savedThisMonth(
  current: SavingsSnapshot,
  previous: SavingsSnapshot,
): number | null {
  if (!current.hasSnapshot || !previous.hasSnapshot) return null;
  return current.balance - previous.balance;
}

/** How much you actually saved across a year: where the balance ENDED minus what
 *  carried in from the previous December. `monthly` is Jan..Dec.
 *
 *  The year ends at the last month with a snapshot — which may be an explicit 0
 *  (you emptied the account), so this walks `hasSnapshot`, never `balance > 0`.
 *  `null` when nothing was recorded all year, or when the carry-in is unknown:
 *  without December's baseline we can't tell a 50 000 pot you built this year
 *  from one you already had. Summing twelve balances is meaningless. */
export function yearSavingsGrowth(
  monthly: SavingsSnapshot[],
  carryIn: SavingsSnapshot | null,
): number | null {
  let last = -1;
  for (let i = monthly.length - 1; i >= 0; i--) {
    if (monthly[i].hasSnapshot) { last = i; break; }
  }
  if (last === -1) return null;
  if (!carryIn?.hasSnapshot) return null;
  return monthly[last].balance - carryIn.balance;
}
