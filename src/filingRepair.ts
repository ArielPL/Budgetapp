// ── filingRepair — putting entries back where the period rule says ─────────
//
// Imported entries are stored one file per BUDGET month, and which budget month
// an entry belongs to is decided by its own date and the pay-period rule. Until
// 2026-09-16 the rule was the calendar month. That day it became the pay
// period, and nothing moved the entries already stored — so for anyone paid on
// the 25th who imported before then, everything dated from the 25th onward sat
// in the month before the one the rule now puts it in.
//
// That mismatch is what let the Follow-up tab delete entries: see planPersist in
// actuals.ts, which now moves such an entry home instead of dropping it. This
// module removes the mismatch itself, once, before anything is drawn.
//
// It is the same operation as changing the pay period — planRefile and
// applyRefile, lossless because every entry carries its own date — applied to
// the settings the user already chose rather than a new one. It is not asked
// about, because nothing is being decided: the rule is theirs, the entries are
// simply not where it says. It IS recorded as a step back and shown, so
// nothing moves without the user being able to see it and take it back.
//
// Runs on every start rather than once behind a marker. It is a no-op when the
// filing already agrees with the rule, which after this ships should be always —
// and if anything ever puts the two out of step again, the next start heals it.

import type { StorageLike } from './storage';
import { planRefile, applyRefile } from './actuals';
import { captureKeys, pushUndo, type UndoEntry } from './undo';
import { loadStartDay, loadPeriodLocks } from './periodLabel';

/**
 * Move every stored entry to the budget month the current settings give it.
 *
 * Returns the step back that was recorded, or null when nothing needed moving
 * — or when the move could not be written, in which case applyRefile has
 * already restored every touched file and the next start tries again.
 */
export function repairFiling(storage: StorageLike, now = new Date()): UndoEntry | null {
  const plan = planRefile(storage, loadStartDay(storage), loadPeriodLocks(storage));
  if (plan.moving === 0) return null;

  // Every file applyRefile is about to write, captured before it does.
  const before = captureKeys(storage, [...plan.buckets.keys(), ...plan.emptied]);
  if (!applyRefile(storage, plan)) return null;

  const entry: UndoEntry = {
    at: now.toISOString(),
    action: 'refileRepair',
    count: plan.moving,
    changes: before,
  };
  // The move stands even if the step back cannot be stored: the entries are
  // now where they belong, and a full storage will surface on the next write.
  // Only a recorded step is reported, so the bar never names the wrong action.
  return pushUndo(storage, entry) ? entry : null;
}
