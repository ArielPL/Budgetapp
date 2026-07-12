// ── New-goal form validation — pure, so it can be unit-tested ──────────────
// Rules (fix plan 2026-07-12 §9): a goal needs a non-empty name and a target
// amount STRICTLY greater than 0 (a 0-target goal has no meaningful progress).
// "Saved so far" may be 0 and is not validated here.

export type GoalFormError = 'name' | 'target';

export type GoalFormResult =
  | { ok: true; name: string; target: number }
  | { ok: false; error: GoalFormError };

/** Accepts both comma and period as decimal separator ("15000", "1500,50"). */
export function parseAmount(raw: string): number {
  return parseFloat(raw.trim().replace(',', '.'));
}

export function validateNewGoal(rawName: string, rawTarget: string): GoalFormResult {
  const name = rawName.trim();
  if (!name) return { ok: false, error: 'name' };
  const target = parseAmount(rawTarget);
  if (isNaN(target) || target <= 0) return { ok: false, error: 'target' };
  return { ok: true, name, target };
}
