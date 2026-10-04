// ── Question cards — answers the app works out itself ──────────────────────
//
// Stage 2 of the Budget AI analysis (2026-09-21): the questions a person would
// ask, as buttons, with no language model anywhere. Each function here returns
// a FINISHED answer — never a pile of rows for something else to add up — and
// carries what the answer stands on, so the card can say how far to trust it.
//
// Rules every answer keeps (the analysis, section 7):
//   · No forecasts beyond plain arithmetic the user can check, and never a
//     verdict on what someone can afford. "When do I reach my goal" is the
//     saved amount divided by the monthly amount, said as exactly that.
//   · Too little history is refused, not hedged: a comparison needs months on
//     both sides, and the result says how many it had.
//   · Unsorted money is never quietly dropped. It is either counted where the
//     cautious answer needs it, or reported beside the answer.
//
// Pure: storage is read by the card, which hands in plain months.

import type { ActualEntry, BudgetCategory, MonthData, SavingsGoal } from './types';
import {
  actualContribution, INCOME_ACTUAL_ID, TRANSFER_ACTUAL_ID, UNSORTED_ACTUAL_ID,
} from './actuals';
import { categoryTotal, PENSION_CATEGORY_ID } from './metrics';
import { normalise } from './categorise';
import { FIXED_COST_CATEGORIES } from './spending';
import { addMonths, type YearMonth } from './debts';

/** One budget month's stored entries; none stored is an empty list. */
export interface MonthEntries extends YearMonth {
  entries: ActualEntry[];
}

/** What an answer stands on. */
export interface Basis {
  /** Months the question is about. */
  asked: number;
  /** Of those, the months with any entries at all. A month without any is
   *  unknown, not a month where nothing was spent. */
  covered: number;
  /** Money that left the account and is still unsorted, in covered months. */
  unsorted: { amount: number; count: number };
}

/** Savings and pension are money put aside, not spent. */
const PUT_ASIDE = new Set(['sparande', PENSION_CATEGORY_ID]);

const isCovered = (m: MonthEntries) => m.entries.length > 0;
const isMovement = (e: ActualEntry) =>
  e.categoryId === INCOME_ACTUAL_ID || e.categoryId === TRANSFER_ACTUAL_ID;

function unsortedOut(entries: ActualEntry[]): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const e of entries) {
    if (e.categoryId !== UNSORTED_ACTUAL_ID) continue;
    const c = actualContribution(e);
    if (c > 0) { amount += c; count += 1; }
  }
  return { amount, count };
}

export function basisOf(months: MonthEntries[]): Basis {
  const covered = months.filter(isCovered);
  const unsorted = unsortedOut(covered.flatMap(m => m.entries));
  return { asked: months.length, covered: covered.length, unsorted };
}

/** What each category came to, net of refunds, leaving out money moving in,
 *  between own accounts, and the unsorted pile. */
function byCategory(entries: ActualEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (isMovement(e) || e.categoryId === UNSORTED_ACTUAL_ID) continue;
    out.set(e.categoryId, (out.get(e.categoryId) ?? 0) + actualContribution(e));
  }
  return out;
}

// ── "What have I spent on food this year?" ─────────────────────────────────

export interface CategoryOverMonths {
  /** Each month asked about; null where nothing is imported. */
  perMonth: Array<YearMonth & { amount: number | null }>;
  total: number;
  /** Per covered month; null when no month is covered. */
  average: number | null;
  basis: Basis;
}

export function categoryOverMonths(months: MonthEntries[], categoryId: string): CategoryOverMonths {
  const perMonth = months.map(m => ({
    year: m.year, month: m.month,
    amount: isCovered(m) ? (byCategory(m.entries).get(categoryId) ?? 0) : null,
  }));
  let total = 0;
  for (const m of perMonth) total += m.amount ?? 0;
  const basis = basisOf(months);
  return { perMonth, total, average: basis.covered > 0 ? total / basis.covered : null, basis };
}

// ── "Which subscriptions do I pay?" ────────────────────────────────────────

/** How many months a payment must turn up in to count as recurring. */
export const RECURRING_MIN_MONTHS = 3;
/** How far a month's charge may stray from the usual one: a price rise of a
 *  few percent is the same subscription, a grocery bill is not. */
const RECURRING_SPREAD = 0.15;
/** Rent, loans and savings recur too, but nobody means them by "subscriptions",
 *  and they have their own places in the app. */
const NOT_SUBSCRIPTIONS = new Set(['boende', 'lan', ...PUT_ASIDE]);

export interface Recurring {
  /** The bank's wording, from the latest charge. */
  text: string;
  categoryId: string;
  /** What it costs now: the latest month's charge. After a price rise that
   *  is the new price — which is what it will cost next month. */
  typical: number;
  /** Months it turned up in. */
  months: number;
}

export type RecurringAnswer =
  | { status: 'too-little'; basis: Basis }
  | { status: 'ok'; items: Recurring[]; perMonth: number; basis: Basis };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function recurringPayments(months: MonthEntries[]): RecurringAnswer {
  const basis = basisOf(months);
  if (basis.covered < RECURRING_MIN_MONTHS) return { status: 'too-little', basis };

  const covered = months.filter(isCovered);
  // Still being charged: seen in one of the two latest months with data. A
  // subscription cancelled in the spring is not one you pay.
  const recent = new Set(covered.slice(-2).map(m => `${m.year}_${m.month}`));

  type Group = { text: string; categoryId: string; byMonth: Map<string, { sum: number; count: number }> };
  const groups = new Map<string, Group>();
  for (const m of covered) {
    const monthKey = `${m.year}_${m.month}`;
    for (const e of m.entries) {
      if (isMovement(e) || NOT_SUBSCRIPTIONS.has(e.categoryId)) continue;
      const c = actualContribution(e);
      if (c <= 0) continue;
      const key = normalise(e.text);
      if (!key) continue;
      const g = groups.get(key) ?? { text: e.text.trim(), categoryId: e.categoryId, byMonth: new Map() };
      // Months are walked oldest first, so the last one seen is the latest.
      g.text = e.text.trim();
      g.categoryId = e.categoryId;
      const slot = g.byMonth.get(monthKey) ?? { sum: 0, count: 0 };
      slot.sum += c;
      slot.count += 1;
      g.byMonth.set(monthKey, slot);
      groups.set(key, g);
    }
  }

  const items: Recurring[] = [];
  for (const g of groups.values()) {
    const slots = [...g.byMonth.values()];
    if (slots.length < RECURRING_MIN_MONTHS) continue;
    // Once a month: a café visited every week is a habit, not a subscription.
    if (slots.some(s => s.count > 1)) continue;
    if (![...g.byMonth.keys()].some(k => recent.has(k))) continue;
    const sums = slots.map(s => s.sum);
    if (Math.max(...sums) - Math.min(...sums) > median(sums) * RECURRING_SPREAD) continue;
    // Map order is insertion order, and months were walked oldest first.
    items.push({ text: g.text, categoryId: g.categoryId, typical: sums[sums.length - 1], months: slots.length });
  }
  items.sort((a, b) => b.typical - a.typical || a.text.localeCompare(b.text));
  let perMonth = 0;
  for (const i of items) perMonth += i.typical;
  return { status: 'ok', items, perMonth, basis };
}

// ── "What has gone up the most lately?" ────────────────────────────────────

/** Months each side of the comparison needs before it is made at all. */
export const COMPARE_MIN_MONTHS = 2;
/** How many risers to name. */
const RISERS = 3;

export interface Change {
  id: string;
  /** Per covered month, in each window. */
  before: number;
  after: number;
}

export type ChangeAnswer =
  | { status: 'too-little'; earlier: Basis; recent: Basis }
  | { status: 'ok'; risers: Change[]; earlier: Basis; recent: Basis };

/** `earlier` and `recent` are windows of whole months, oldest first. */
export function biggestRises(earlier: MonthEntries[], recent: MonthEntries[]): ChangeAnswer {
  const eb = basisOf(earlier);
  const rb = basisOf(recent);
  if (eb.covered < COMPARE_MIN_MONTHS || rb.covered < COMPARE_MIN_MONTHS) {
    return { status: 'too-little', earlier: eb, recent: rb };
  }
  const avg = (months: MonthEntries[], covered: number) => {
    const sums = byCategory(months.filter(isCovered).flatMap(m => m.entries));
    return new Map([...sums].map(([id, sum]) => [id, sum / covered]));
  };
  const before = avg(earlier, eb.covered);
  const after = avg(recent, rb.covered);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const risers = [...ids]
    .filter(id => !PUT_ASIDE.has(id))
    .map(id => ({ id, before: before.get(id) ?? 0, after: after.get(id) ?? 0 }))
    // A whole unit at least: a rounding crumb is not "went up".
    .filter(c => c.after - c.before >= 1)
    .sort((a, b) => (b.after - b.before) - (a.after - a.before))
    .slice(0, RISERS);
  return { status: 'ok', risers, earlier: eb, recent: rb };
}

// ── "How much can I spend per day for the rest of the month?" ──────────────

/** Spending the user decides day to day: not the fixed costs, not savings. */
const isEveryday = (id: string) => !FIXED_COST_CATEGORIES.has(id) && !PUT_ASIDE.has(id);

export interface PerDayAnswer {
  /** Budgeted for everyday spending this month. */
  planned: number;
  /** Spent on it so far — including everything unsorted, which may be
   *  everyday spending; counting it keeps the answer on the cautious side. */
  spent: number;
  left: number;
  daysLeft: number;
  /** null when nothing is left. */
  perDay: number | null;
  unsorted: { amount: number; count: number };
  /** The newest entry's date: what "so far" means. null = nothing imported. */
  through: string | null;
}

export function perDayLeft(budget: MonthData, entries: ActualEntry[], daysLeft: number): PerDayAnswer {
  let planned = 0;
  for (const c of budget.expenses) if (isEveryday(c.id)) planned += categoryTotal(c);
  let spent = 0;
  for (const [id, sum] of byCategory(entries)) if (isEveryday(id)) spent += sum;
  const unsorted = unsortedOut(entries);
  spent += unsorted.amount;
  const left = planned - spent;
  const days = Math.max(1, daysLeft);
  let through: string | null = null;
  for (const e of entries) if (through === null || e.date > through) through = e.date;
  return {
    planned, spent, left, daysLeft: days,
    perDay: left > 0 ? left / days : null,
    unsorted, through,
  };
}

// ── "Did I keep to the budget last month?" ─────────────────────────────────

export interface BudgetLine {
  id: string;
  planned: number;
  actual: number;
}

export interface KeptAnswer {
  /** Biggest overrun first. */
  lines: BudgetLine[];
  plannedTotal: number;
  /** Includes the unsorted money: it left the account, wherever it belongs. */
  actualTotal: number;
  unsorted: { amount: number; count: number };
}

export function budgetKept(budget: MonthData, entries: ActualEntry[]): KeptAnswer {
  const actual = byCategory(entries);
  const seen = new Set<string>();
  const lines: BudgetLine[] = [];
  const add = (c: BudgetCategory) => {
    seen.add(c.id);
    if (PUT_ASIDE.has(c.id)) return;
    lines.push({ id: c.id, planned: categoryTotal(c), actual: actual.get(c.id) ?? 0 });
  };
  budget.expenses.forEach(add);
  // Filed under a category this month's budget does not have: still spent.
  for (const [id, sum] of actual) {
    if (!seen.has(id) && !PUT_ASIDE.has(id)) lines.push({ id, planned: 0, actual: sum });
  }
  const shown = lines.filter(l => l.planned !== 0 || l.actual !== 0)
    .sort((a, b) => (b.actual - b.planned) - (a.actual - a.planned));
  const unsorted = unsortedOut(entries);
  let plannedTotal = 0;
  let actualTotal = unsorted.amount;
  for (const l of shown) { plannedTotal += l.planned; actualTotal += l.actual; }
  return { lines: shown, plannedTotal, actualTotal, unsorted };
}

// ── "When do I reach my savings goal?" ─────────────────────────────────────

export type GoalForecast =
  | { goal: SavingsGoal; kind: 'reached' }
  /** No amount for it in this month's budget, so there is nothing to divide by. */
  | { goal: SavingsGoal; kind: 'no-monthly' }
  | {
    goal: SavingsGoal; kind: 'on-its-way';
    monthly: number; at: YearMonth;
    /** Months past the deadline; 0 = in time; null = no deadline set. */
    late: number | null;
  };

/** `budget` is the month `now`: its savings rows are what goes to each goal. */
export function goalForecasts(goals: SavingsGoal[], budget: MonthData, now: YearMonth): GoalForecast[] {
  const rows = budget.expenses.find(c => c.id === 'sparande')?.rows ?? [];
  return goals.map((goal): GoalForecast => {
    const remaining = goal.targetAmount - goal.currentAmount;
    if (goal.targetAmount > 0 && remaining <= 0) return { goal, kind: 'reached' };
    const row = goal.budgetRowId ? rows.find(r => r.id === goal.budgetRowId) : undefined;
    const monthly = row && (!row.period || row.period === 'month') ? row.amount : 0;
    if (!(monthly > 0) || !(goal.targetAmount > 0)) return { goal, kind: 'no-monthly' };
    // This month's amount is counted as still to come.
    const at = addMonths(now, Math.ceil(remaining / monthly) - 1);
    let late: number | null = null;
    const m = /^(\d{4})-(\d{2})$/.exec(goal.deadline ?? '');
    if (m) {
      const deadline = Number(m[1]) * 12 + Number(m[2]) - 1;
      late = Math.max(0, at.year * 12 + at.month - deadline);
    }
    return { goal, kind: 'on-its-way', monthly, at, late };
  });
}
