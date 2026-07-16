// ── Sparplan — the user's savings PLAN: monthly amount + expected yearly % ──
//
// Pure compound-growth math (no React; unit-tested in sparplan.test.ts) plus a
// thin localStorage load/save for the plan itself. The plan drives two views in
// the Plan tab: a forward projection ("what will my saving grow to?") and a
// plan-vs-actual comparison against the amounts really recorded in the
// Savings tab.
//
// Model: deposits land at the START of each month, then the month's growth is
// applied — v = (v + monthly) × (1 + r) — with r the monthly rate equivalent to
// the yearly percentage ((1+annual)^(1/12) − 1), i.e. real compounding, not
// annual/12.

export interface SavingsPlan {
  monthlyAmount: number;   // planned deposit per month
  annualReturnPct: number; // expected growth per year, e.g. 7 (= 7%)
  startAmount: number;     // pot at plan start (may be 0)
  startYM: string;         // "YYYY-MM" — month the plan started
}

export const SPARPLAN_KEY = 'budget_savings_plan';

/** Monthly rate equivalent to a yearly percentage (compounding, not /12). */
export function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/**
 * Projected value at the end of each month. Index 0 = the start amount ("now"),
 * index k = value after k months of deposit-then-growth.
 */
export function projectPlan(plan: SavingsPlan, months: number): number[] {
  const r = monthlyRate(plan.annualReturnPct);
  const out: number[] = [plan.startAmount];
  let v = plan.startAmount;
  for (let m = 1; m <= months; m++) {
    v = (v + plan.monthlyAmount) * (1 + r);
    out.push(v);
  }
  return out;
}

/** Whole months from startYM to endYM ("2026-01" → "2026-07" = 6; same = 0). */
export function monthsBetween(startYM: string, endYM: string): number {
  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm);
}

export function toYM(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export interface PlanVsActualPoint {
  actualTotal: number;    // your real pot that month
  planTotal: number;      // where the plan says the pot should be by then
  actualProgress: number; // what you've really added since the plan started
  planProgress: number;   // what the plan expected you to have added
}

/**
 * Build the plan-vs-actual series, carrying BOTH readings of each month: the
 * real totals (what the chart plots — actual money) and the progress since the
 * plan started (what the tooltip and the ahead/behind badge use).
 *
 * The plan's start month is the shared anchor: the pot you already had when the
 * plan began is not progress, and the plan takes no credit for it either — it
 * simply carries that same baseline forward and adds its deposits on top.
 *
 * `balances[k]` = the savings balance recorded for month k of the plan (k = 0 is
 * the start month). `planSeries[k]` = the plan's expected deposits+growth after
 * k months (so planSeries[0] is 0).
 */
export function planVsActual(balances: number[], planSeries: number[]): PlanVsActualPoint[] {
  const baseline = balances[0] ?? 0;
  return balances.map((b, k) => {
    const planProgress = planSeries[k] ?? 0;
    return {
      actualTotal: b,
      planTotal: baseline + planProgress,
      actualProgress: b - baseline,
      planProgress,
    };
  });
}

/** The earliest "YYYY-MM" among months that actually have savings (saved > 0),
 *  or null if none do. YM strings sort lexically = chronologically. Used to
 *  auto-default a new plan's start to the beginning of your real saving history. */
export function earliestSavingsYM(months: Array<{ ym: string; saved: number }>): string | null {
  const withSavings = months.filter(m => m.saved > 0).map(m => m.ym).sort();
  return withSavings.length ? withSavings[0] : null;
}

function isValidPlan(p: unknown): p is SavingsPlan {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.monthlyAmount === 'number' && isFinite(o.monthlyAmount) && o.monthlyAmount >= 0 &&
    typeof o.annualReturnPct === 'number' && isFinite(o.annualReturnPct) &&
    typeof o.startAmount === 'number' && isFinite(o.startAmount) && o.startAmount >= 0 &&
    typeof o.startYM === 'string' && /^\d{4}-\d{2}$/.test(o.startYM)
  );
}

export function loadSavingsPlan(): SavingsPlan | null {
  try {
    const raw = localStorage.getItem(SPARPLAN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidPlan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSavingsPlan(plan: SavingsPlan): void {
  localStorage.setItem(SPARPLAN_KEY, JSON.stringify(plan));
}
