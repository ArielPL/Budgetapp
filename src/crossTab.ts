// ── crossTab — what a tab should do when ANOTHER tab writes the same month ──
//
// Review 2026-09-05, F1. Every tab kept its own copy of the month and wrote the
// whole object back on each edit, and nothing told a tab that the month had
// changed underneath it. Two tabs on the same month therefore did this:
//
//   A: salary 30 000,50 → 31 000   (written)
//   B: still holding the old copy, rent 10 000 → 11 000   (written)
//   → stored: rent 11 000, salary back to 30 000,50. A's edit gone, no warning.
//
// The fix is to stop a tab from holding a stale copy in the first place: when
// another tab writes the month on screen, adopt it. Different fields then both
// survive, because B is editing the version that already contains A's change.
//
// This module is the decision, kept pure so the RULE can be tested rather than
// the existence of an event listener.

import { isMonthData } from './backup';
import type { MonthData } from './types';

export interface AdoptedMonth {
  /** The month to show, already shape-checked. */
  data: MonthData;
  /** Its canonical JSON, to record as the tab's new baseline. Storing this is
   *  what stops the adopted value being written straight back out again — an
   *  echo that would bounce between tabs forever. */
  raw: string;
}

export interface StorageEventLike {
  key: string | null;
  newValue: string | null;
}

/**
 * Decide what to do with one `storage` event.
 *
 * Returns the month to adopt, or `null` to ignore the event and keep what is
 * on screen. Ignoring is the safe direction: the worst case is the tab staying
 * as it was, which is exactly where it was before this existed.
 */
export function adoptExternalMonth(
  event: StorageEventLike,
  currentKey: string,
  lastSeenRaw: string | null,
): AdoptedMonth | null {
  // A different key entirely — another month, the plan, a theme setting. Never
  // let one month's data be adopted into another month's view.
  if (event.key !== currentKey) return null;

  // Removed elsewhere (an import clearing the slate). There is no month to
  // adopt, and silently blanking what the user is looking at would be worse
  // than leaving it; the next reload picks up the truth.
  if (event.newValue === null) return null;

  // Our own write, echoing back. Adopting it would be harmless but pointless,
  // and re-rendering on every keystroke saved in another tab is not free.
  if (event.newValue === lastSeenRaw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.newValue);
  } catch {
    return null; // not JSON: some other writer. Keep what we have.
  }

  // Same validator the backup importer uses. A write from another tab is no
  // more trustworthy than a file someone hands us.
  if (!isMonthData(parsed)) return null;

  const data = parsed as MonthData;
  // Re-stringify rather than reusing event.newValue: the baseline must be
  // byte-identical to what this tab would itself produce from `data`, or the
  // save effect will think the month changed and write it out again.
  return { data, raw: JSON.stringify(data) };
}
