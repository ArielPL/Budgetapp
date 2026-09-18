import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNDO_KEY, UNDO_LIMIT, UNDO_BYTES,
  captureKeys, captureAll, pushUndo, readUndo, latestUndo, undoLast, undoChanges, clearUndo,
  type UndoEntry,
} from './undo';
import { isBackupOwnedKey, collectBackupData } from './backup';

// ── What this protects ─────────────────────────────────────────────────────
//
// "Reset month", "Clear month" and restoring a backup all destroy data the user
// cannot retype: a month's imported record has to be fetched from the bank
// again. A confirm dialog does not help — it is asked at the moment the user is
// certain. These tests hold the step back to the only standard that matters:
// after undo, storage is byte for byte what it was before.

class FakeStorage {
  private map = new Map<string, string>();
  failOnKey: string | null = null;
  error: unknown = new DOMException('QuotaExceededError');

  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k === this.failOnKey) throw this.error;
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  snapshot() { return Object.fromEntries(this.map); }
}

let storage: FakeStorage;
beforeEach(() => { storage = new FakeStorage(); });

const entry = (over: Partial<UndoEntry> = {}): UndoEntry => ({
  at: '2026-09-17T10:00:00.000Z',
  action: 'resetMonth',
  changes: [{ key: 'budget_2026_8', value: '{"income":[]}' }],
  ...over,
});

describe('capture', () => {
  it('records the current value of each key', () => {
    storage.setItem('budget_2026_8', 'a');
    storage.setItem('budget_actuals_2026_8', 'b');
    expect(captureKeys(storage, ['budget_2026_8', 'budget_actuals_2026_8'])).toEqual([
      { key: 'budget_2026_8', value: 'a' },
      { key: 'budget_actuals_2026_8', value: 'b' },
    ]);
  });

  it('records a MISSING key as null, so undo removes it again', () => {
    // An import that created September must not leave September behind when it
    // is undone. null is the difference between "put it back" and "it was never
    // there" — and applyStorageChanges turns null into a removal.
    expect(captureKeys(storage, ['budget_2026_9'])).toEqual([
      { key: 'budget_2026_9', value: null },
    ]);
  });

  it('does not record the same key twice', () => {
    storage.setItem('budget_2026_8', 'a');
    const captured = captureKeys(storage, ['budget_2026_8', 'budget_2026_8']);
    expect(captured).toHaveLength(1);
  });

  it('captureAll takes the user data and leaves auth alone', () => {
    storage.setItem('budget_2026_8', 'a');
    storage.setItem('budget_auth_token', 'secret');
    storage.setItem('unrelated', 'x');
    expect(captureAll(storage).map(c => c.key)).toEqual(['budget_2026_8']);
  });
});

describe('the stack', () => {
  it('puts the newest step first', () => {
    pushUndo(storage, entry({ action: 'resetMonth' }));
    pushUndo(storage, entry({ action: 'clearActuals' }));
    expect(readUndo(storage).map(e => e.action)).toEqual(['clearActuals', 'resetMonth']);
    expect(latestUndo(storage)?.action).toBe('clearActuals');
  });

  it('keeps at most UNDO_LIMIT steps', () => {
    for (let i = 0; i < UNDO_LIMIT + 5; i++) pushUndo(storage, entry({ count: i }));
    expect(readUndo(storage)).toHaveLength(UNDO_LIMIT);
    expect(latestUndo(storage)?.count).toBe(UNDO_LIMIT + 4);
  });

  it('drops the oldest steps when the stack outgrows its budget', () => {
    const big = (n: number) => entry({
      count: n,
      changes: [{ key: `budget_2026_${n}`, value: 'x'.repeat(UNDO_BYTES / 3) }],
    });
    pushUndo(storage, big(1));
    pushUndo(storage, big(2));
    pushUndo(storage, big(3));
    pushUndo(storage, big(4));
    const kept = readUndo(storage);
    expect(kept.length).toBeLessThan(4);
    expect(kept[0].count).toBe(4);
    expect(storage.getItem(UNDO_KEY)!.length).toBeLessThanOrEqual(UNDO_BYTES);
  });

  it('keeps the newest step even when it alone is over the budget', () => {
    // The biggest entry there is, is a restored backup — the action most worth
    // being able to take back. Refusing to remember it would be exactly wrong.
    pushUndo(storage, entry({
      action: 'restoreBackup',
      changes: [{ key: 'budget_2026_8', value: 'x'.repeat(UNDO_BYTES * 2) }],
    }));
    expect(readUndo(storage)).toHaveLength(1);
  });

  it('reports a refused write instead of throwing', () => {
    storage.failOnKey = UNDO_KEY;
    expect(pushUndo(storage, entry())).toBe(false);
  });

  it('drops a corrupt stack rather than half-trusting it', () => {
    storage.setItem(UNDO_KEY, '{not json');
    expect(readUndo(storage)).toEqual([]);
    storage.setItem(UNDO_KEY, JSON.stringify([{ at: 'x' }, entry()]));
    expect(readUndo(storage)).toHaveLength(1);
    storage.setItem(UNDO_KEY, JSON.stringify([entry({ action: 'nonsense' as never })]));
    expect(readUndo(storage)).toEqual([]);
  });
});

describe('undoing', () => {
  it('puts a wiped month back exactly as it was', () => {
    storage.setItem('budget_2026_8', '{"income":[{"amount":35716}]}');
    const before = storage.snapshot();

    pushUndo(storage, entry({ changes: captureKeys(storage, ['budget_2026_8']) }));
    storage.setItem('budget_2026_8', '{"income":[]}');   // the reset

    expect(undoLast(storage)?.action).toBe('resetMonth');
    expect(storage.getItem('budget_2026_8')).toBe(before['budget_2026_8']);
  });

  it('removes a month the undone action had created', () => {
    pushUndo(storage, entry({
      action: 'import',
      changes: captureKeys(storage, ['budget_actuals_2026_9']),
    }));
    storage.setItem('budget_actuals_2026_9', '[{"amount":100}]');   // the import

    undoLast(storage);
    expect(storage.getItem('budget_actuals_2026_9')).toBeNull();
  });

  it('takes one step at a time, newest first', () => {
    storage.setItem('k', '1');
    pushUndo(storage, entry({ changes: [{ key: 'k', value: '1' }] }));
    storage.setItem('k', '2');
    pushUndo(storage, entry({ changes: [{ key: 'k', value: '2' }] }));
    storage.setItem('k', '3');

    undoLast(storage);
    expect(storage.getItem('k')).toBe('2');
    undoLast(storage);
    expect(storage.getItem('k')).toBe('1');
    expect(undoLast(storage)).toBeNull();
  });

  it('a full entry also removes what appeared after it', () => {
    // Restoring a backup that held fewer months must not leave the extra months
    // standing: the user would be reading a mixture of two different states.
    storage.setItem('budget_2026_8', 'august');
    const full = entry({ action: 'restoreBackup', full: true, changes: captureAll(storage) });
    pushUndo(storage, full);
    storage.setItem('budget_2026_9', 'september-from-the-backup');

    expect(undoChanges(storage, full).find(c => c.key === 'budget_2026_9')?.value).toBeNull();
    undoLast(storage);
    expect(storage.getItem('budget_2026_9')).toBeNull();
    expect(storage.getItem('budget_2026_8')).toBe('august');
  });

  it('does nothing when there is nothing to undo', () => {
    expect(undoLast(storage)).toBeNull();
  });

  it('keeps the step when the undo write is refused, so it can be retried', () => {
    storage.setItem('budget_2026_8', 'before');
    pushUndo(storage, entry({ changes: captureKeys(storage, ['budget_2026_8']) }));
    storage.setItem('budget_2026_8', 'after');

    storage.failOnKey = 'budget_2026_8';
    expect(undoLast(storage)).toBeNull();
    expect(readUndo(storage)).toHaveLength(1);

    storage.failOnKey = null;
    expect(undoLast(storage)?.action).toBe('resetMonth');
    expect(storage.getItem('budget_2026_8')).toBe('before');
  });

  it('clearUndo empties the stack', () => {
    pushUndo(storage, entry());
    clearUndo(storage);
    expect(readUndo(storage)).toEqual([]);
  });
});

describe('the stack stays out of backups', () => {
  it('backup.ts excludes exactly the key undo.ts writes', () => {
    // Held in two files on purpose: importing one from the other would make
    // them circular. This test is the joint.
    expect(isBackupOwnedKey(UNDO_KEY)).toBe(false);
    expect(isBackupOwnedKey('budget_2026_8')).toBe(true);
  });

  it('an export does not carry a second copy of the data', () => {
    storage.setItem('budget_2026_8', 'the month');
    pushUndo(storage, entry({ changes: [{ key: 'budget_2026_8', value: 'an older month' }] }));
    expect(Object.keys(collectBackupData(storage))).toEqual(['budget_2026_8']);
  });
});
