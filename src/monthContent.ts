// ── Does a month hold anything a copy would destroy? ───────────────────────
//
// Every copy button used to write straight over its target. The forward ones
// never looked at the destination at all, and "pull from last month" only asked
// when the CURRENT month's totals were above zero.
//
// Both readings were too narrow. A month worth 0 kr can still be a month the
// user built: their own row names, their own categories, the order they put
// them in, a row marked "per year". Amounts are the easiest part to retype —
// structure is the part that took the effort.
//
// Pure so the decision can be tested without a browser, and so every copy path
// asks the same question.

import type { MonthData } from './types';

/**
 * True when the month holds anything the user put there.
 *
 * Deliberately NOT amount-based. An income row, an expense category or a single
 * expense row counts, whatever it is worth. Savings is excluded: it is a
 * recorded balance that no budget copy touches, so it is not at risk and must
 * not force a warning that would train people to click through.
 */
export function hasBudgetContent(month: MonthData | null | undefined): boolean {
  if (!month) return false;
  return (month.income ?? []).length > 0 || (month.expenses ?? []).length > 0;
}

/** The months among `targets` that already hold something. */
export function monthsWithContent<T>(
  targets: T[],
  read: (t: T) => MonthData | null,
): T[] {
  return targets.filter(t => hasBudgetContent(read(t)));
}
