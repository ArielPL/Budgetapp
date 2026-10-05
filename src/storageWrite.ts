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
 * How a several-key change ended:
 *   · 'stored'    — every change is stored;
 *   · 'unchanged' — it was refused, and every key is VERIFIED to hold what it
 *                   held before;
 *   · 'partial'   — it was refused and some key could not be put back. What
 *                   the user saw before is then kept as unsaved (storage.ts),
 *                   so the banner says so and Try again can restore it.
 * Only 'unchanged' may be told to the user as "nothing was changed".
 */
export type ChangeOutcome = 'stored' | 'unchanged' | 'partial';

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
  return applyStorageChangesOutcome(storage, changes) === 'stored';
}

/** applyStorageChanges, saying whether a refusal left everything as it was. */
export function applyStorageChangesOutcome(
  storage: TransactionalStorage,
  changes: StorageChange[],
): ChangeOutcome {
  // A native store takes the whole set as one database transaction, which is
  // stronger than the snapshot-and-rollback below. Its refusal cannot come back
  // here — the write is queued — and arrives through onStorageWriteFailed.
  const batch = (storage as { tryApplyBatch?: (c: StorageChange[]) => boolean }).tryApplyBatch;
  if (typeof batch === 'function' && batch.call(storage, changes)) return 'stored';

  // What the store already counted as unsaved for these keys (storage.ts). A
  // change rolled back here is the CALLER's to report, so any refusal the
  // attempt or its rollback records is undone afterwards — except for a key
  // the rollback could not restore, which really is not as the user left it.
  const tracker = storage as {
    refusalsOf?(keys: string[]): Map<string, string | null | undefined>;
    setRefusals?(refusals: Map<string, string | null | undefined>): void;
  };
  const priorRefusals = tracker.refusalsOf?.(changes.map(c => c.key));
  const before = new Map<string, string | null>();
  try {
    for (const { key } of changes) {
      if (!before.has(key)) before.set(key, storage.getItem(key));
    }
    for (const { key, value } of changes) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    return 'stored';
  } catch {
    // Put back in the order that FREES room before it needs room: keys going
    // back to nothing or to something smaller first. In the order written, a
    // full browser could refuse to restore a key because another key of the
    // same change still held the space it needed (Codex, 2026-09-29).
    const size = (v: string | null) => (v === null ? 0 : v.length);
    const growth = ([key, value]: [string, string | null]) => size(value) - size(storage.getItem(key));
    const order = [...before].sort((a, b) => growth(a) - growth(b));
    for (const [key, value] of order) {
      try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      } catch {
        // Checked below, key by key: the caller is only told "unchanged" if
        // it is.
      }
    }
    const unrestored = [...before].filter(([key, value]) => storage.getItem(key) !== value);
    if (priorRefusals) {
      const refusals = new Map(priorRefusals);
      for (const [key, value] of unrestored) refusals.set(key, value);
      tracker.setRefusals?.(refusals);
    }
    return unrestored.length === 0 ? 'unchanged' : 'partial';
  }
}

/**
 * applyStorageChanges, for a caller that must not report success early.
 *
 * On the web it is the same thing — localStorage has answered by the time
 * applyStorageChanges returns. In the apps, applyStorageChanges only QUEUES
 * the transaction, so its `true` means "on its way", not "stored"; this waits
 * for the database's answer instead (deep review 2026-09-27, P1). A refusal
 * changes nothing: the database keeps what it had and the app's copy is put
 * back to match.
 *
 * Anything that tells the user "done", records a step back, or reloads the
 * page on the strength of a write belongs here.
 */
export async function commitStorageChanges(
  storage: TransactionalStorage,
  changes: StorageChange[],
): Promise<boolean> {
  return await commitStorageChangesOutcome(storage, changes) === 'stored';
}

/** commitStorageChanges, saying whether a refusal left everything as it was —
 *  for the caller that tells the user "nothing was changed". In the apps a
 *  refused transaction is always 'unchanged': SQLite rolls it back whole. */
export async function commitStorageChangesOutcome(
  storage: TransactionalStorage,
  changes: StorageChange[],
): Promise<ChangeOutcome> {
  const commit = (storage as { tryCommitBatch?: (c: StorageChange[]) => Promise<boolean> | null }).tryCommitBatch;
  const pending = typeof commit === 'function' ? commit.call(storage, changes) : null;
  if (pending) return (await pending) ? 'stored' : 'unchanged';
  return applyStorageChangesOutcome(storage, changes);
}
