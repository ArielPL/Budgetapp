// ── storageWrite — one place where a failed write is noticed ────────────────
//
// Review 2026-09-05, F4. Every save went straight to localStorage.setItem with
// nothing around it. A full quota (or a browser refusing to store at all) threw
// out of the save effect, and the app carried on showing the edit as though it
// had been kept. The number on screen and the number on disk disagreed, and
// nothing said so.
//
// This does NOT try to rescue the write. It reports honestly whether the bytes
// landed, so a caller can tell the user the truth and offer to try again.

/** The sliver of Storage a write needs — so tests can pass a fake that fails. */
export interface WritableStorage {
  setItem(key: string, value: string): void;
}

/** The sliver a removal needs. */
export interface RemovableStorage {
  removeItem(key: string): void;
}

export interface TransactionalStorage extends WritableStorage, RemovableStorage {
  getItem(key: string): string | null;
}

export interface StorageChange {
  key: string;
  /** null removes the key. */
  value: string | null;
}

/**
 * Write, and say whether it worked.
 *
 * Returns false on ANY throw, not just QuotaExceededError: Safari in private
 * mode has historically thrown a plain quota error at zero bytes, and a browser
 * with site data blocked throws SecurityError. From the user's point of view
 * these are the same event — the change was not stored — and a save path that
 * only understood one of them would still lie about the others.
 */
export function safeSetItem(storage: WritableStorage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove, and say whether it worked.
 *
 * The mirror of safeSetItem, and needed for the same reason: a browser with
 * site data blocked throws SecurityError on removal too, and several settings
 * are stored as "the key is absent" rather than as a value. A removal that
 * throws out of an effect takes the whole app down with it.
 */
export function safeRemoveItem(storage: RemovableStorage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply several storage changes as one best-effort transaction.
 *
 * localStorage has no native transaction. Snapshotting each touched key first
 * lets us restore the exact previous values when any write or removal fails,
 * which prevents a multi-month import from becoming a half-import.
 */
export function applyStorageChanges(
  storage: TransactionalStorage,
  changes: StorageChange[],
): boolean {
  const before = new Map<string, string | null>();
  try {
    for (const { key } of changes) {
      if (!before.has(key)) before.set(key, storage.getItem(key));
    }
    for (const { key, value } of changes) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    return true;
  } catch {
    for (const [key, value] of before) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        // The caller still receives false and surfaces the storage failure.
      }
    }
    return false;
  }
}
