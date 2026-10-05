// ── customMode — which kind of Custom the user chose, and how to undo the choice
//
// Custom can be two different things, and the user picks one before building:
//
//   · linked     — a layout over the REGULAR budget. Its blocks point at the
//                  budget's income and categories; every amount lives in
//                  budget_<year>_<month> and nowhere else. Follow-up, Savings,
//                  Plan and Year all describe the same numbers, so they are shown.
//   · standalone — its own blocks and amounts (budget_custom_v3*), separate from
//                  the regular budget. The shared tabs describe a DIFFERENT
//                  budget, so they are not shown next to it.
//
// "Start over" returns to the choice. It removes only what belongs to the
// chosen mode, and never touches the regular budget — for a linked layout that
// matters most, because the amounts on screen are the regular budget's own.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';

export type CustomMode = 'linked' | 'standalone';

export const CUSTOM_MODE_KEY = 'budget_custom_mode';
/** A linked panel's layout: which budget parts are shown, and how. */
export const CUSTOM_LINKED_KEY = 'budget_custom_linked';
const STANDALONE_STRUCT_KEY = 'budget_custom_v3';

export const isCustomMode = (v: unknown): v is CustomMode => v === 'linked' || v === 'standalone';

/**
 * The mode on this device, or null when the user has not chosen yet.
 *
 * Before modes existed Custom was always standalone. Anyone who built something
 * then keeps it, as standalone, without being asked a question about data they
 * already have.
 */
export function loadCustomMode(storage: StorageLike): CustomMode | null {
  const stored = storage.getItem(CUSTOM_MODE_KEY);
  if (isCustomMode(stored)) return stored;
  if (storage.getItem(STANDALONE_STRUCT_KEY) !== null) return 'standalone';
  return null;
}

/** Everything a Start over in this mode removes. Standalone: its structure,
 *  every month's amounts and filing snapshots. Linked: only the layout. The
 *  mode itself goes too, so the choice is offered again. */
export function customResetKeys(storage: StorageLike, mode: CustomMode): string[] {
  const keys = [CUSTOM_MODE_KEY];
  if (mode === 'linked') return [...keys, CUSTOM_LINKED_KEY];
  keys.push(STANDALONE_STRUCT_KEY);
  // Collected by index first: removing while walking skips entries.
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && (k.startsWith('budget_custom_v3_values_') || k.startsWith('budget_custom_v3_meta_'))) keys.push(k);
  }
  return keys;
}

/** The writes a Start over makes: every key above, removed. */
export function customResetChanges(storage: StorageLike, mode: CustomMode): StorageChange[] {
  return customResetKeys(storage, mode).map(key => ({ key, value: null }));
}
