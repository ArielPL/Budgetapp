// ── undo — one step back from the buttons that destroy ─────────────────────
//
// The app has buttons with no way back. "Reset month" wipes a budget, "Clear
// month" removes every imported entry, restoring a backup replaces everything.
// Each one asks first — and a confirm dialog is not a safety net. It is a
// question put at the exact moment the user is certain, which is the moment
// they are least able to notice they are wrong.
//
// This was not theoretical while v1.12.0 was built: the assistant helping build
// the app destroyed the author's test data three times, once with exactly that
// Reset button. It could rebuild it from the conversation. A user cannot.
//
// What is stored here is NOT a copy of the app. It is the PREVIOUS VALUES of
// the keys an action was about to change — the same map `applyStorageChanges`
// already builds in order to roll back a failed write, kept rather than thrown
// away. A step back therefore costs a few kB, not a copy of everything.
//
// Deliberately not a daily full snapshot. Measured on the author's real data:
// 34 keys, 49 kB, and it grows with every statement imported. Eleven full
// copies would spend a large part of the browser's storage quota to protect
// against slow drift — and that is the same quota the next import needs. Ten
// records cover the misclick, which is what actually happens.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';
import { applyStorageChanges, safeSetItem } from './storageWrite';
import { isBackupOwnedKey } from './backup';

/** Where the stack lives. Excluded from backups — see NEVER_BACKED_UP in
 *  backup.ts, and the guard test that holds the two files together. */
export const UNDO_KEY = 'budget_undo';

/** How many steps back are kept. Ten spans months of ordinary use: a reset, an
 *  import or a restore happens a handful of times a year, not a day. */
export const UNDO_LIMIT = 10;

/** Total size budget for the stack. Generous next to a single month (~3 kB),
 *  small next to what a browser gives the whole origin. */
export const UNDO_BYTES = 300_000;

/** What the user did, so the button can say it in their language rather than
 *  storing a sentence that is wrong after they switch language. */
export type UndoAction =
  | 'resetMonth'
  | 'clearActuals'
  | 'import'
  | 'restoreBackup'
  | 'periodChange'
  /** A budget written over one or more months — including "pull from last
   *  month", which writes over the month on screen. */
  | 'copyBudget'
  | 'deleteCategory'
  /** One income or expense row, or one Custom row. */
  | 'deleteRow'
  /** One recorded entry in the follow-up tab. */
  | 'deleteEntry'
  /** A savings goal, which also sweeps its linked row out of every month. */
  | 'deleteGoal'
  /** A Custom block, whose removal also hides the historic amounts filed
   *  under it — the money stays stored but becomes unreachable. */
  | 'deleteBlock'
  /** Every Custom amount, across every month. */
  | 'clearCustom';

export interface UndoEntry {
  /** ISO timestamp — shown, so "a week ago" is visible rather than implied. */
  at: string;
  action: UndoAction;
  /** The month the action was aimed at, when it had one. Stored as numbers so
   *  the name is rendered in whatever language is current at display time. */
  year?: number;
  month?: number;
  /** How many things were affected — entries cleared, rows imported. */
  count?: number;
  /** The previous values. A null value means the key did not exist, so undoing
   *  removes it again. */
  changes: StorageChange[];
  /** True when `changes` is a complete picture of the user's data, not a few
   *  keys. Undoing one of these also removes owned keys that appeared since. */
  full?: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isChange(v: unknown): v is StorageChange {
  return isObj(v)
    && typeof v.key === 'string'
    && (v.value === null || typeof v.value === 'string');
}

/**
 * Every action, as a record rather than a list.
 *
 * TypeScript then refuses to compile if a member is added to UndoAction and
 * forgotten here — which would make `readUndo` silently drop every entry of the
 * new kind, and the step back would simply never appear. A plain array cannot
 * catch that; an exhaustive record can.
 */
const ACTIONS: Record<UndoAction, true> = {
  resetMonth: true,
  clearActuals: true,
  import: true,
  restoreBackup: true,
  periodChange: true,
  copyBudget: true,
  deleteCategory: true,
  deleteRow: true,
  deleteEntry: true,
  deleteGoal: true,
  deleteBlock: true,
  clearCustom: true,
};

/** Strict on read. A half-written or hand-edited stack is dropped rather than
 *  half-trusted: offering a step back that restores nonsense is worse than
 *  offering none, because the user would take it. */
function isEntry(v: unknown): v is UndoEntry {
  return isObj(v)
    && typeof v.at === 'string'
    && typeof v.action === 'string'
    && ACTIONS[v.action as UndoAction] === true
    && Array.isArray(v.changes)
    && v.changes.every(isChange);
}

export function readUndo(storage: StorageLike): UndoEntry[] {
  const raw = storage.getItem(UNDO_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

/** The step the button offers, or null when there is none. */
export function latestUndo(storage: StorageLike): UndoEntry | null {
  return readUndo(storage)[0] ?? null;
}

/** Read the current value of each key, so it can be put back later. A key that
 *  does not exist records null, which undoing turns back into a removal —
 *  otherwise undoing an action that CREATED a month would leave it behind. */
export function captureKeys(storage: StorageLike, keys: string[]): StorageChange[] {
  const seen = new Set<string>();
  const out: StorageChange[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value: storage.getItem(key) });
  }
  return out;
}

/** Everything the user owns, for the one action that replaces all of it. */
export function captureAll(storage: StorageLike): StorageChange[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isBackupOwnedKey(key)) keys.push(key);
  }
  return captureKeys(storage, keys);
}

/**
 * Remember a step back.
 *
 * Returns false when storage refused it. The CALLER MUST STILL PROCEED: undo is
 * a safety net, never a gate. An app that refused to let you clear a month
 * because it could not afford to remember the clearing would be worse than one
 * without undo at all.
 */
export function pushUndo(storage: StorageLike, entry: UndoEntry): boolean {
  const list = [entry, ...readUndo(storage)].slice(0, UNDO_LIMIT);
  // Drop the oldest until the stack fits. The newest is kept whatever it costs:
  // the biggest entry is a restored backup, which is the action most worth
  // being able to take back.
  while (list.length > 1 && JSON.stringify(list).length > UNDO_BYTES) list.pop();
  return safeSetItem(storage, UNDO_KEY, JSON.stringify(list));
}

/**
 * What undoing this entry actually writes.
 *
 * For a scoped entry that is just the recorded values. For a full one it also
 * removes owned keys that exist now but did not then — restoring a backup that
 * held fewer months would otherwise leave the extra months standing, and the
 * user would be looking at a mixture of two states.
 */
export function undoChanges(storage: StorageLike, entry: UndoEntry): StorageChange[] {
  if (!entry.full) return entry.changes;
  const recorded = new Set(entry.changes.map(c => c.key));
  const extra: StorageChange[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isBackupOwnedKey(key) && !recorded.has(key)) extra.push({ key, value: null });
  }
  return [...entry.changes, ...extra];
}

/**
 * Take the newest step back.
 *
 * Returns the entry that was undone, or null when there was nothing to undo or
 * the write failed. The entry is dropped from the stack only after the write
 * succeeded, so a refused undo can be tried again once space is freed.
 */
export function undoLast(storage: StorageLike): UndoEntry | null {
  const list = readUndo(storage);
  const entry = list[0];
  if (!entry) return null;
  if (!applyStorageChanges(storage, undoChanges(storage, entry))) return null;
  // If the pop itself is refused, the entry has ALREADY been applied but would
  // still be offered — and taking it a second time would write those same old
  // values over anything edited in between. Dropping the whole stack is the
  // honest fallback: nothing is left that could be applied twice, and the step
  // the user asked for did happen (finding 18).
  if (!safeSetItem(storage, UNDO_KEY, JSON.stringify(list.slice(1)))) clearUndo(storage);
  return entry;
}

/** Forget everything. Used when the user asks, and after a restore has replaced
 *  the world the older steps belonged to. */
export function clearUndo(storage: StorageLike): void {
  try {
    storage.removeItem(UNDO_KEY);
  } catch {
    // Nothing to report: an unremovable stack is stale, not dangerous.
  }
}
