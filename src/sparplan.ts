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
//
// ── Start-month rule (product decision, 2026-07-16) ──
// The start month is the BASELINE: it holds the starting pot and expects no
// deposit of its own; the first monthly deposit is expected in the month AFTER
// it. This matches how the plan is anchored in practice — the start month
// defaults to the first month with a recorded balance, and that balance IS the
// starting pot, not a deposit the plan gets to demand twice. Concretely:
// projectPlan()[0] = startAmount ("now"), [1] = one deposit in; and in
// plan-vs-actual, the start month's expected progress is 0.
// A plan whose start month is in the future has no recorded month to compare
// against yet, so no ahead/behind badge is shown until it begins.

import { safeSetItem } from './storageWrite';
import { appStorage } from './storage';

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
  actualTotal: number | null;    // your real pot that month; null = not recorded
  planTotal: number;             // where the plan says the pot should be by then
  actualProgress: number | null; // what you've really added since the plan started
  planProgress: number;          // what the plan expected you to have added
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
 * the start month), or `null` for a month with nothing recorded — which stays
 * null all the way to the chart, so an unfilled month leaves a gap in the line
 * instead of a plunge to zero that never happened. The plan line is drawn from
 * the first RECORDED month, since that's the only baseline we actually know.
 * `planSeries[k]` = the plan's expected deposits+growth after k months (so
 * planSeries[0] is 0).
 */
export function planVsActual(
  balances: Array<number | null>,
  planSeries: number[],
): PlanVsActualPoint[] {
  const baseline = balances.find(b => b !== null) ?? 0;
  return balances.map((b, k) => {
    const planProgress = planSeries[k] ?? 0;
    return {
      actualTotal: b,
      planTotal: baseline + planProgress,
      actualProgress: b === null ? null : b - baseline,
      planProgress,
    };
  });
}

/** The earliest "YYYY-MM" among months with a savings snapshot RECORDED, or null
 *  if none are. YM strings sort lexically = chronologically. Used to auto-default
 *  a new plan's start to the beginning of your real saving history.
 *
 *  Recorded, not non-zero: a month you filled in as 0 is you telling us you
 *  started from nothing, which is an ideal place to anchor a plan. Filtering on
 *  `saved > 0` would silently skip it and start the plan late. */
export function earliestSavingsYM(months: Array<{ ym: string; hasSnapshot: boolean }>): string | null {
  const recorded = months.filter(m => m.hasSnapshot).map(m => m.ym).sort();
  return recorded.length ? recorded[0] : null;
}

// ── validation — ONE set of rules for the form, the save and the load ──────
//
// The form used to check `isNaN` while the loader checked `isFinite`, so a
// typed `1e309` sailed through the UI as Infinity, JSON.stringify turned it
// into null, and the whole plan silently failed validation — and vanished — on
// the next reload. Everything now funnels through validateSavingsPlan.

/** Documented product limits. Generous on purpose: they exist to keep numbers
 *  finite and inside JavaScript's safe range, not to police anyone's budget. */
export const PLAN_LIMITS = {
  maxAmount: 999_999_999_999, // monthly saving and start amount, ~1e12
  maxReturnPct: 100,          // 0–100% per year
  minYear: 1900,
  maxYear: 2200,
} as const;

export type PlanField = 'monthlyAmount' | 'annualReturnPct' | 'startAmount' | 'startYM';

/** A real calendar month within the product's year range — "2026-13" and
 *  "2026-00" both match the loose \d{4}-\d{2} pattern that used to pass. */
export function isValidYM(ym: string): boolean {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= PLAN_LIMITS.minYear && year <= PLAN_LIMITS.maxYear;
}

/** The fields that are invalid — empty array means the plan is good.
 *  Number.isFinite is the load-bearing check: NaN and ±Infinity both fail it. */
export function validateSavingsPlan(p: SavingsPlan): PlanField[] {
  const bad: PlanField[] = [];
  const amountOk = (v: number) => Number.isFinite(v) && v >= 0 && v <= PLAN_LIMITS.maxAmount;
  if (!amountOk(p.monthlyAmount)) bad.push('monthlyAmount');
  if (!(Number.isFinite(p.annualReturnPct) && p.annualReturnPct >= 0 && p.annualReturnPct <= PLAN_LIMITS.maxReturnPct)) {
    bad.push('annualReturnPct');
  }
  if (!amountOk(p.startAmount)) bad.push('startAmount');
  if (typeof p.startYM !== 'string' || !isValidYM(p.startYM)) bad.push('startYM');
  return bad;
}

function isValidPlan(p: unknown): p is SavingsPlan {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  const shapeOk =
    typeof o.monthlyAmount === 'number' &&
    typeof o.annualReturnPct === 'number' &&
    typeof o.startAmount === 'number' &&
    typeof o.startYM === 'string';
  return shapeOk && validateSavingsPlan(o as unknown as SavingsPlan).length === 0;
}

export function loadSavingsPlan(): SavingsPlan | null {
  try {
    const raw = appStorage.getItem(SPARPLAN_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidPlan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the plan — refuses invalid ones so storage can never hold a plan
 *  the loader would throw away. Returns whether it saved. */
export function saveSavingsPlan(plan: SavingsPlan): boolean {
  if (validateSavingsPlan(plan).length > 0) return false;
  // False now covers both "invalid" and "storage refused it". Both mean the
  // plan is not saved, which is what the caller has to act on either way (F4).
  return safeSetItem(appStorage, SPARPLAN_KEY, JSON.stringify(plan));
}

/** Remove the plan. Month data and savings goals live under other keys and are
 *  untouched — deleting the plan only clears the projection settings. */
export function deleteSavingsPlan(): void {
  appStorage.removeItem(SPARPLAN_KEY);
}
