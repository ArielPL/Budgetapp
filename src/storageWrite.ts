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
