// ── spendingPrefs — what the user told the spending card ───────────────────
//
// Two small choices made on the card itself: places it should not count (a
// train ticket that was a one-off, say) and where "small" ends. Both are the
// user's own decisions, so both are kept in storage and travel in a backup.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';
import { defaultSmallLimit } from './spending';

export const SPENDING_HIDDEN_KEY = 'budget_spending_hidden';
export const SMALL_LIMIT_KEY = 'budget_small_purchase_limit';

/** Places the card leaves out: matching key → the bank's text, for showing. */
export type HiddenPlaces = Record<string, string>;

export function loadHiddenPlaces(storage: StorageLike): HiddenPlaces {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SPENDING_HIDDEN_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as HiddenPlaces;
  } catch {
    return {};
  }
}

/** The write that stores `next`; an empty list removes the key. */
export function hiddenPlacesChange(next: HiddenPlaces): StorageChange {
  return {
    key: SPENDING_HIDDEN_KEY,
    value: Object.keys(next).length > 0 ? JSON.stringify(next) : null,
  };
}

/** The stored limit, or the currency's default. A stored value that is not a
 *  positive number is ignored rather than trusted. */
export function loadSmallLimit(storage: StorageLike, currency: string): number {
  let raw: string | null = null;
  try { raw = storage.getItem(SMALL_LIMIT_KEY); } catch { /* unreadable: the default */ }
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : defaultSmallLimit(currency);
}
