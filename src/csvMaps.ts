// ── csvMaps — remembering how one bank's export is laid out ────────────────
//
// The app never learns which BANK a file came from, and does not need to. It
// remembers the file's own header wording instead, so the second export from
// the same bank skips the mapping step entirely — and a bank nobody thought of
// is remembered just as well as a familiar one.

import type { StorageLike } from './storage';
import { safeSetItem } from './storageWrite';
import type { ColumnRole } from './csvImport';

export const CSV_MAPS_KEY = 'budget_csv_maps';

const ROLES: ColumnRole[] = ['date', 'text', 'amount', 'in', 'out', 'skip'];

/** DEFENSIVE — this reads storage, which may hold anything an older build left
 *  behind. A map that no longer makes sense is dropped rather than trusted. */
export function loadCsvMaps(storage: StorageLike): Record<string, ColumnRole[]> {
  try {
    const raw = storage.getItem(CSV_MAPS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, ColumnRole[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every(r => typeof r === 'string' && (ROLES as string[]).includes(r))) {
        out[k] = v as ColumnRole[];
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns whether it was written — a refused write is reported like every
 *  other save, though forgetting a mapping only costs three clicks next time. */
export function rememberCsvMap(
  storage: StorageLike,
  fingerprint: string,
  roles: ColumnRole[],
): boolean {
  const maps = loadCsvMaps(storage);
  maps[fingerprint] = roles;
  return safeSetItem(storage, CSV_MAPS_KEY, JSON.stringify(maps));
}

/**
 * Forget one layout, so the app asks about the columns again.
 *
 * The counterpart `rememberCsvMap` needed from the start and did not have.
 * Remembering is only safe if it can be undone: a mapping confirmed once is
 * reused for that header for ever, so a single wrong confirmation — the balance
 * column taken for the amount, a reference taken for the description — became
 * permanent, silent, and unreachable from inside the app.
 *
 * Returns whether it was written. A fingerprint that was not stored is not an
 * error: the caller wants it gone, and it is gone.
 */
export function forgetCsvMap(storage: StorageLike, fingerprint: string): boolean {
  const maps = loadCsvMaps(storage);
  if (!(fingerprint in maps)) return true;
  delete maps[fingerprint];
  return safeSetItem(storage, CSV_MAPS_KEY, JSON.stringify(maps));
}
