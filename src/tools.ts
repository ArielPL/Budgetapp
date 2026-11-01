// ── Tools — sums the user can try out before changing anything ─────────────
//
// The next step after the question cards (questions.ts): instead of asking
// about what IS, the user tries what WOULD be — a rent rise, a savings target,
// a search through what was bought. Each function returns a finished answer
// worked out by plain arithmetic the user can check; nothing here is stored,
// and nothing is a verdict on what someone can afford.
//
// These are also the tools a language model would call later on (Budget AI,
// stage 3): the model would only ever pick one and fill in its fields. Every
// figure on screen comes from here, never from a model.
//
// Pure: storage is read by the components, which hand in plain values.

import type { MonthData } from './types';
import type { MonthEntries } from './questions';
import { actualContribution, INCOME_ACTUAL_ID, TRANSFER_ACTUAL_ID } from './actuals';
import { calculateBudgetMetrics, categoryTotal, splitRemaining } from './metrics';
import { normalise } from './categorise';
import type { YearMonth } from './debts';

// ── "What if my rent goes up by 1 500 kr?" ─────────────────────────────────

/** What a change applies to: the month's income, or one expense category. */
export type WhatIfTarget = { kind: 'income' } | { kind: 'category'; id: string };

export interface WhatIfSide {
  /** Income − budgeted expenses, as the summary card's "Remaining". */
  remaining: number;
  /** "Left to live on" per day, as the budget tab works it out. */
  perDay: number;
  /** The savings category's total. */
  savings: number;
}

export interface WhatIfAnswer {
  before: WhatIfSide;
  after: WhatIfSide;
}

const SAVINGS_ID = 'sparande';

function sideOf(remaining: number, savings: number, days: number): WhatIfSide {
  return { remaining, perDay: splitRemaining(remaining, days).perDay, savings };
}

/**
 * The month's figures as they are, and as they would be with `delta` added to
 * `target` every month. A rise in an expense lowers what is left; a rise in
 * income raises it. `days` is the budget month's length, the same divisor the
 * "Left to live on" tile uses.
 */
export function whatIf(budget: MonthData, target: WhatIfTarget, delta: number, days: number): WhatIfAnswer {
  const { remaining } = calculateBudgetMetrics(budget);
  const savingsCat = budget.expenses.find(c => c.id === SAVINGS_ID);
  const savings = savingsCat ? categoryTotal(savingsCat) : 0;
  const change = Number.isFinite(delta) ? delta : 0;
  const afterRemaining = target.kind === 'income' ? remaining + change : remaining - change;
  const afterSavings = target.kind === 'category' && target.id === SAVINGS_ID ? savings + change : savings;
  return {
    before: sideOf(remaining, savings, days),
    after: sideOf(afterRemaining, afterSavings, days),
  };
}

// ── "What do I need to save to have 30 000 kr by June?" ────────────────────

export type NeedToSaveAnswer =
  /** Already there: nothing more to put aside. */
  | { kind: 'reached' }
  /** The month asked for is already over. */
  | { kind: 'past' }
  | {
    kind: 'ok';
    /** Still to put aside. */
    left: number;
    /** Months to do it in, this month included — the same counting as
     *  "When do I reach my savings goal?" (goalForecasts). */
    months: number;
    /** Each month, rounded UP to a whole unit so the goal is not missed by
     *  a few öre. */
    perMonth: number;
  };

const monthIndex = (at: YearMonth) => at.year * 12 + at.month;

export function needToSave(target: number, saved: number, now: YearMonth, by: YearMonth): NeedToSaveAnswer {
  const left = target - Math.max(0, saved);
  if (!(target > 0) || left <= 0) return { kind: 'reached' };
  const months = monthIndex(by) - monthIndex(now) + 1;
  if (months < 1) return { kind: 'past' };
  return { kind: 'ok', left, months, perMonth: Math.ceil(left / months) };
}

// ── "How much have I spent at the café?" ───────────────────────────────────

export interface SearchMonth extends YearMonth {
  amount: number;
  count: number;
}

export interface SearchAnswer {
  /** Newest month first; only months with a match. */
  months: SearchMonth[];
  total: number;
  count: number;
  /** The category most of the matches are filed under, or null. */
  mostlyIn: string | null;
}

/** Shorter than this and nearly everything matches. */
export const SEARCH_MIN_LENGTH = 2;

/**
 * Entries whose text contains `query`, ignoring case, accents and the
 * punctuation banks put in (the same normalising the categoriser uses). Money
 * coming in and transfers between own accounts are left out: the question is
 * what was spent. A refund at the same place counts against it, as it does
 * everywhere else in the app.
 */
export function searchEntries(months: MonthEntries[], query: string): SearchAnswer | null {
  const q = normalise(query);
  if (q.length < SEARCH_MIN_LENGTH) return null;
  const found: SearchMonth[] = [];
  const byCategory = new Map<string, number>();
  let total = 0;
  let count = 0;
  for (const m of months) {
    let amount = 0;
    let n = 0;
    for (const e of m.entries) {
      if (e.categoryId === INCOME_ACTUAL_ID || e.categoryId === TRANSFER_ACTUAL_ID) continue;
      if (!normalise(e.text).includes(q)) continue;
      amount += actualContribution(e);
      n += 1;
      byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + 1);
    }
    if (n > 0) {
      // Whole cents: sums of decimals leave dust like 1e-13.
      found.push({ year: m.year, month: m.month, amount: Math.round(amount * 100) / 100, count: n });
      total += amount;
      count += n;
    }
  }
  found.sort((a, b) => monthIndex(b) - monthIndex(a));
  let mostlyIn: string | null = null;
  let best = 0;
  for (const [id, n] of byCategory) if (n > best) { best = n; mostlyIn = id; }
  return { months: found, total: Math.round(total * 100) / 100, count, mostlyIn };
}
