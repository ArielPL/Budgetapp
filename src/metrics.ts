// ── metrics — the single source of truth for the app's money math ──────────
//
// Pure, framework-free functions: no React, no localStorage, no formatting — so
// every view computes the same numbers the same way, and the formulas can be
// unit-tested in isolation (see metrics.test.ts).
//
// Canonical definitions (UX review §6 — "define savings, savings-rate, remaining"):
//   • Budgeted expenses = every category in the Budget tab's expenses, INCLUDING
//     the in-budget "sparande" category. It's money you've already assigned.
//   • Remaining (after budget) = income − budgeted expenses.
//   • Actual saved (this month) = the Savings-tab categories, EXCLUDING pension.
//     Pension is a separate long-term bucket, reported on its own line and never
//     folded into "saved" anywhere (Savings, Plan and Year now all agree).
//   • Savings rate = actual saved ÷ income. NOT (income − expenses) ÷ income —
//     that is money left over, not money actually moved into savings.
//   • Leftover rate = remaining ÷ income = the share of income not yet budgeted.

import type { MonthData, BudgetCategory, BudgetRow } from './types';

/** The savings category treated as a separate long-term bucket. Excluded from
 *  every "saved" total so Savings, Plan and Year never disagree. */
export const PENSION_CATEGORY_ID = 'pension';

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

export interface SavingsMetrics {
  saved: number;        // savings categories EXCLUDING pension
  pension: number;      // pension bucket total (shown separately)
  savingsRate: number;  // actual saved ÷ income
}

export function calculateSavingsMetrics(month: MonthData): SavingsMetrics {
  const income = sumRows(month.income ?? []);
  const savings = month.savings ?? [];
  const saved = sumCategories(savings, PENSION_CATEGORY_ID);
  const pension = savings
    .filter(c => c.id === PENSION_CATEGORY_ID)
    .reduce((s, c) => s + categoryTotal(c), 0);
  return { saved, pension, savingsRate: ratePct(saved, income) };
}
