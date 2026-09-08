// ── One sentence that says something about the month ───────────────────────
// The app was very good at SHOWING numbers and said nothing about them. This
// picks the single most worth-saying fact and hands back a key plus values —
// never a finished string — so the wording stays in i18n and this stays a pure,
// testable function.
//
// ⚠️ Scope: the budget holds PLANNED figures, not what was actually spent, so an
// insight may only claim things that are true of a plan. The one exception is
// savings, which is a recorded balance and therefore real behaviour. Nothing
// here may imply "you spent" when it only knows "you budgeted".
//
// One insight at a time, by priority. A stack of them would be noise, and noise
// is the problem this is meant to fix.

import { ratePct } from './metrics';

export type Insight =
  /** Planned expenses exceed planned income — nothing else matters more. */
  | { kind: 'deficit'; over: number }
  /** The savings balance actually fell. Real data, and worth saying plainly. */
  | { kind: 'savingsDown'; amount: number }
  /** A goal is within reach. Encouraging AND actionable: it names the gap. */
  | { kind: 'goalClose'; name: string; remaining: number }
  /** The savings balance has grown several months running. Real behaviour. */
  | { kind: 'savingsStreak'; months: number }
  /** Share of income actually set aside this month. Real data. */
  | { kind: 'savedRate'; pct: number }
  /** Biggest planned expense category as a share of planned income. */
  | { kind: 'topCategory'; name: string; pct: number };

/** A goal this close is worth mentioning; below it "almost there" would be a lie. */
const GOAL_CLOSE_PCT = 80;
/** Two months up is a coincidence; three is a habit worth naming. */
const MIN_STREAK = 3;

export interface InsightInput {
  income: number;
  expenses: number;
  /** Expense categories with display names already resolved for the language. */
  categories: { name: string; total: number }[];
  /** How far the savings balance moved this month; null = not recorded. */
  saved: number | null;
  /** Goals with display names already resolved for the language. */
  goals?: { name: string; current: number; target: number }[];
  /** How many consecutive months the savings balance has grown, incl. this one. */
  savingsStreak?: number;
}

/**
 * How many consecutive months the savings balance has grown, counting back from
 * the newest entry. `balances` runs oldest → newest and holds `null` for a month
 * with nothing recorded.
 *
 * A gap ENDS the streak rather than being skipped: claiming "grown 3 months
 * running" across a month we know nothing about would be a guess dressed up as
 * a fact. Capped by however many months the caller chose to look back.
 */
export function savingsStreakFrom(balances: (number | null)[]): number {
  let streak = 0;
  for (let i = balances.length - 1; i > 0; i--) {
    const cur = balances[i], prev = balances[i - 1];
    if (cur === null || prev === null || cur <= prev) break;
    streak++;
  }
  return streak;
}

export function pickInsight(
  { income, expenses, categories, saved, goals = [], savingsStreak = 0 }: InsightInput,
): Insight | null {
  // A falling savings balance is measured, not planned, and it does not depend
  // on income at all — so it is reported even for a month with no income filled
  // in. The income guard below used to swallow it, which meant the app went
  // quiet about real money leaving the account precisely when the month looked
  // empty. It stays first because it is also the fact most worth knowing.
  if (saved !== null && saved < 0) return { kind: 'savingsDown', amount: -saved };

  // Everything past here is a share OF income, or a claim about a plan. Without
  // income a percentage is meaningless and a "deficit" is just an unfilled
  // month. Say nothing rather than something hollow.
  if (income <= 0) return null;

  if (expenses > income) return { kind: 'deficit', over: expenses - income };

  // ── Encouragement, ranked above the routine figures ──
  // Both of these are earned: they describe something the user chose to aim at
  // or actually did, never a compliment invented to fill the space.
  //
  // Note there is no "goal reached!" case. A finished goal stays finished, so
  // celebrating it would republish the same congratulation every month forever
  // and crowd out everything else. "Almost there" resolves itself.
  const closest = goals
    .filter(g => g.target > 0 && g.current < g.target
      && ratePct(g.current, g.target) >= GOAL_CLOSE_PCT)
    .reduce<{ name: string; current: number; target: number } | null>(
      (best, g) => (best === null || g.target - g.current < best.target - best.current ? g : best),
      null);
  if (closest) {
    return { kind: 'goalClose', name: closest.name, remaining: closest.target - closest.current };
  }

  if (savingsStreak >= MIN_STREAK) return { kind: 'savingsStreak', months: savingsStreak };

  if (saved !== null && saved > 0) return { kind: 'savedRate', pct: ratePct(saved, income) };

  const top = categories
    .filter(c => c.total > 0)
    .reduce<{ name: string; total: number } | null>(
      (best, c) => (best === null || c.total > best.total ? c : best), null);
  if (top) return { kind: 'topCategory', name: top.name, pct: ratePct(top.total, income) };

  return null;
}
