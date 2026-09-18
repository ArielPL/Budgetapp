// ── userData — is there anything here worth protecting? ────────────────────
//
// Three separate questions in the app turn out to be the same question:
//
//   · should the backup reminder appear at all?
//   · is this a new user, who should meet the introduction?
//   · is this an existing user, whose "what's new" badge should be pre-seeded?
//
// They were answered by `hasMeaningfulData`, which looked for a budget month
// with a POSITIVE TOTAL, plus a couple of plan fields. Review 2026-09-18, F1,
// found what that misses: a user can import months of bank statements, or work
// entirely in Custom, and the app will decide there is nothing to lose. It then
// never asks them to make a backup — and the app has no server, so the copy on
// that device is the only one there is.
//
// Two rules keep this honest in both directions:
//
//   1. STRUCTURE COUNTS, NOT JUST AMOUNTS. A month worth 0 kr can still hold
//      the user's own categories, row names and order — the part that took the
//      effort, and the part that cannot be retyped from a bank statement. This
//      is the same rule `hasBudgetContent` already applies to copy targets.
//
//   2. SETTINGS ARE NOT DATA. Language, theme, currency, the period start day
//      and a dismissed banner are preferences. Nagging someone to back up their
//      choice of dark mode would teach them to ignore the banner that matters.
//
// Deliberately NOT "any budget_* key exists": a fresh install writes several of
// those before the user has typed anything.

import type { StorageLike } from './storage';
import type { PlanData } from './types';

/** `budget_<year>_<month>` — a classic budget month. */
const MONTH_KEY = /^budget_(\d{4})_(\d+)$/;
/** `budget_actuals_<year>_<month>` — imported or hand-entered records. */
const ACTUALS_KEY = /^budget_actuals_(\d{4})_(\d+)$/;
/** `budget_custom_v3_values_<year>_<month>` — the Custom layout's amounts. */
const CUSTOM_VALUES_KEY = /^budget_custom_v3_values_(\d{4})_(\d+)$/;
/** `budget_custom_v3_meta_<year>_<month>` — which block each row belonged to. */
const CUSTOM_META_KEY = /^budget_custom_v3_meta_(\d{4})_(\d+)$/;

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A classic month holds something the user put there.
 *
 * An income row, an expense category or an expense row counts whatever it is
 * worth — see rule 1 above. Savings is excluded here for the same reason the
 * copy guard excludes it: a fresh month is given savings categories it did not
 * ask for, so their presence says nothing about the user.
 */
function monthHasContent(raw: string | null): boolean {
  const m = parse(raw);
  if (!isObj(m)) return false;
  const income = Array.isArray(m.income) ? m.income : [];
  const expenses = Array.isArray(m.expenses) ? m.expenses : [];
  if (income.length > 0 || expenses.length > 0) return true;
  // A recorded savings BALANCE is a number the user entered by hand and cannot
  // recover from anywhere else, so it counts even with no rows around it.
  if (m.savingsSnapshotRecorded === true) return true;
  const savings = Array.isArray(m.savings) ? m.savings : [];
  return savings.some(c => isObj(c) && Array.isArray(c.rows) && c.rows.some(
    r => isObj(r) && typeof r.amount === 'number' && r.amount !== 0,
  ));
}

/** At least one entry that would survive a reload — imported or typed. */
function actualsHaveContent(raw: string | null): boolean {
  const list = parse(raw);
  return Array.isArray(list) && list.some(
    e => isObj(e) && typeof e.date === 'string' && typeof e.amount === 'number',
  );
}

/** Any Custom amount the user entered, including a deliberate zero. */
function customValuesHaveContent(raw: string | null): boolean {
  const v = parse(raw);
  if (!isObj(v)) return false;
  return Object.values(v).some(x => typeof x === 'number' || typeof x === 'string');
}

/** The Custom structure snapshot: which block each row was filed under. Losing
 *  it makes historic amounts unreadable even though they are still stored. */
function customMetaHasContent(raw: string | null): boolean {
  const v = parse(raw);
  return isObj(v) && isObj(v.tags) && Object.keys(v.tags).length > 0;
}

/** A savings goal the user created, whether or not it has money in it yet. */
function planHasContent(raw: string | null): boolean {
  const p = parse(raw);
  if (!isObj(p)) return false;
  const plan = p as unknown as PlanData;
  if ((plan.goals ?? []).length > 0) return true;
  return typeof plan.notes === 'string' && plan.notes.trim().length > 0;
}

/**
 * Does this device hold anything a backup would be worth restoring?
 *
 * Used for the backup reminder, for deciding new-versus-existing user, and for
 * seeding the changelog badge — one definition, so those three can never
 * disagree about what "your data" means.
 */
export function hasRestorableUserData(storage: StorageLike): boolean {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;

    if (MONTH_KEY.test(key)) {
      if (monthHasContent(storage.getItem(key))) return true;
      continue;
    }
    if (ACTUALS_KEY.test(key)) {
      if (actualsHaveContent(storage.getItem(key))) return true;
      continue;
    }
    if (CUSTOM_VALUES_KEY.test(key)) {
      if (customValuesHaveContent(storage.getItem(key))) return true;
      continue;
    }
    if (CUSTOM_META_KEY.test(key)) {
      if (customMetaHasContent(storage.getItem(key))) return true;
      continue;
    }
    if (key === 'budget_plan' || key === 'budget_savings_plan') {
      if (planHasContent(storage.getItem(key))) return true;
    }
  }
  return false;
}
