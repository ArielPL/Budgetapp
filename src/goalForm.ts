// ── New-goal form validation — pure, so it can be unit-tested ──────────────
// Rules (fix plan 2026-07-12 §9): a goal needs a non-empty name and a target
// amount STRICTLY greater than 0 (a 0-target goal has no meaningful progress).
// "Saved so far" may be 0.
//
// Amounts go through the shared money parser (main review 2026-07-26 §5): the
// old `isNaN(target)` check accepted `1e309` as Infinity, which JSON.stringify
// then stored as `null` — the goal came back at 0 kr after a reload.

import { parseMoneyInput, parseMoneyOrZero } from './money';

/**
 * One reason per actual problem. These used to collapse into a single 'target'
 * error, so typing `1e309` was reported as "the target must be greater than 0"
 * — advice that describes a different mistake entirely and can't be acted on
 * (main review 2026-07-30 §7).
 */
export type GoalFormError =
  | 'name'              // no goal name
  | 'targetRequired'    // target left blank
  | 'targetNonPositive' // 0 or negative — a goal you've already met
  | 'targetInvalid'     // unparseable, or outside the allowed range
  | 'savedInvalid';     // "saved so far" typed but not a usable amount

export type GoalFormResult =
  | { ok: true; name: string; target: number; saved: number }
  | { ok: false; error: GoalFormError };

/** Accepts both comma and period as decimal separator ("15000", "1500,50").
 *  Returns NaN for anything the app refuses to store, so existing callers that
 *  guard with isNaN keep working. Prefer parseMoneyInput in new code. */
export function parseAmount(raw: string): number {
  const result = parseMoneyInput(raw);
  return result.ok ? result.value : NaN;
}

export function validateNewGoal(
  rawName: string,
  rawTarget: string,
  rawSaved = '',
): GoalFormResult {
  const name = rawName.trim();
  if (!name) return { ok: false, error: 'name' };

  // Blank, unparseable and "not a positive number" are three different
  // mistakes and each gets its own answer.
  const target = parseMoneyInput(rawTarget);
  if (!target.ok) {
    return { ok: false, error: target.reason === 'empty' ? 'targetRequired' : 'targetInvalid' };
  }
  if (target.value <= 0) return { ok: false, error: 'targetNonPositive' };

  // "Saved so far" is optional — blank means 0 — but a typed value must still
  // be a real amount, not Infinity.
  const saved = parseMoneyOrZero(rawSaved);
  if (!saved.ok) return { ok: false, error: 'savedInvalid' };

  return { ok: true, name, target: target.value, saved: saved.value };
}
