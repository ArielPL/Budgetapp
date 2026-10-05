import { describe, it, expect } from 'vitest';
import { createCachedStorage, type AsyncBackend } from './storageCache';
import { commitStorageChanges, type StorageChange } from './storageWrite';
import { checkBackup, applyBackup, BACKUP_VERSION } from './backup';
import { pushUndo, readUndo, undoLast, captureKeys, UNDO_KEY } from './undo';
import { repairFiling } from './filingRepair';
import { actualsKey } from './actuals';
import { PERIOD_START_KEY } from './periodLabel';

// ── A refused write in the apps (deep review 2026-09-27, P0 and P1) ─────────
//
// The cache answers reads before the database has stored anything. These pin
// what has to be true once the database says no:
//   · the cache shows what is STORED again, not the refused value;
//   · the refused change is kept for "Try again", and only until something
//     stores that key;
//   · a caller that waits (commitBatch) hears the answer, and a refusal it
//     hears is not ALSO left behind as something to retry;
//   · a backup reads the database, so a refused value cannot end up in one.

const backend = () => {
  const disk = new Map<string, string>();
  const refuse = new Set<string>();
  let reads = 0;
  let readFails = false;
  const b: AsyncBackend & {
    disk: Map<string, string>; refuse: Set<string>;
    reads(): number; failReads(v: boolean): void;
  } = {
    disk,
    refuse,
    reads: () => reads,
    failReads(v) { readFails = v; },
    async loadAll() {
      reads += 1;
      if (readFails) throw new Error('unreadable');
      return Object.fromEntries(disk);
    },
    async write(k, v) { if (refuse.has(k)) throw new Error('refused'); disk.set(k, v); },
    async remove(k) { if (refuse.has(k)) throw new Error('refused'); disk.delete(k); },
    async commit(changes) {
      if (changes.some(c => refuse.has(c.key))) throw new Error('refused');
      for (const c of changes) {
        if (c.value === null) disk.delete(c.key); else disk.set(c.key, c.value);
      }
    },
  };
  return b;
};

const open = async (seed: Record<string, string> = {}) => {
  const b = backend();
  for (const [k, v] of Object.entries(seed)) b.disk.set(k, v);
  const store = createCachedStorage(b);
  await store.hydrate();
  return { b, store };
};

describe('a refused write does not stay in memory as if it were stored', () => {
  it('puts the cache back to what the database holds', async () => {
    const { b, store } = await open({ budget_2026_8: 'old' });
    b.refuse.add('budget_2026_8');
    store.setItem('budget_2026_8', 'new');
    // Until the database answers, the screen's value is what reads see…
    expect(store.getItem('budget_2026_8')).toBe('new');
    await store.flush();
    // …and once it has said no, reads see what is really stored.
    expect(store.getItem('budget_2026_8')).toBe('old');
    expect(b.disk.get('budget_2026_8')).toBe('old');
  });

  it('puts back a refused removal too', async () => {
    const { b, store } = await open({ budget_lang: 'sv' });
    b.refuse.add('budget_lang');
    store.removeItem('budget_lang');
    await store.flush();
    expect(store.getItem('budget_lang')).toBe('sv');
  });

  it('does not undo a later write to the same key that is still on its way', async () => {
    const { b, store } = await open({ budget_2026_8: 'old' });
    b.refuse.add('budget_2026_8');
    store.setItem('budget_2026_8', 'refused');
    b.refuse.delete('budget_2026_8'); // the NEXT write will be accepted
    store.setItem('budget_2026_8', 'newest');
    await store.flush();
    expect(store.getItem('budget_2026_8')).toBe('newest');
    expect(b.disk.get('budget_2026_8')).toBe('newest');
    // And the refusal is superseded: nothing is left to retry.
    expect(store.hasUnsaved).toBe(false);
  });

  it('keeps the refused change for Try again, and forgets it once stored', async () => {
    const { b, store } = await open({ budget_2026_8: 'old' });
    b.refuse.add('budget_2026_8');
    store.setItem('budget_2026_8', 'new');
    await store.flush();
    expect(store.hasUnsaved).toBe(true);
    expect(store.unsaved()).toEqual([{ key: 'budget_2026_8', value: 'new' }]);

    // Still refused: Try again says so and keeps it.
    expect(await store.retryUnsaved()).toBe(false);
    expect(store.hasUnsaved).toBe(true);
    expect(store.getItem('budget_2026_8')).toBe('old');

    // Space freed: Try again stores exactly what was refused.
    b.refuse.clear();
    expect(await store.retryUnsaved()).toBe(true);
    expect(b.disk.get('budget_2026_8')).toBe('new');
    expect(store.getItem('budget_2026_8')).toBe('new');
    expect(store.hasUnsaved).toBe(false);
  });

  it('does not let a successful write to ANOTHER key clear the refusal', async () => {
    // Review: "the error row must not disappear just because other keys saved".
    const { b, store } = await open();
    b.refuse.add('budget_actuals_2026_8');
    store.setItem('budget_actuals_2026_8', '[1]');
    store.setItem('budget_2026_8', '{}');
    store.setItem('budget_plan', '{}');
    await store.flush();
    expect(store.unsaved().map(c => c.key)).toEqual(['budget_actuals_2026_8']);
  });

  it('says so when the database cannot even be read back', async () => {
    const { b, store } = await open({ budget_2026_8: 'old' });
    b.refuse.add('budget_2026_8');
    b.failReads(true);
    store.setItem('budget_2026_8', 'new');
    await store.flush();
    expect(store.hasUnsaved).toBe(true);
    // Reads work again and the write is accepted: all is well, and the cache
    // matches the database.
    b.failReads(false);
    b.refuse.clear();
    expect(await store.retryUnsaved()).toBe(true);
    expect(store.getItem('budget_2026_8')).toBe(b.disk.get('budget_2026_8'));
  });
});

describe('an action that waits for the database', () => {
  it('hears true only once the transaction is committed', async () => {
    const { b, store } = await open();
    const done = store.commitBatch([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]);
    expect(b.disk.size).toBe(0); // not yet
    expect(await done).toBe(true);
    expect(Object.fromEntries(b.disk)).toEqual({ a: '1', b: '2' });
  });

  it('hears false on a refusal, and nothing has changed anywhere', async () => {
    const { b, store } = await open({ a: 'old-a', b: 'old-b' });
    const heard: string[] = [];
    store.onWriteFailed(k => heard.push(k));
    b.refuse.add('b');
    expect(await store.commitBatch([
      { key: 'a', value: 'new-a' }, { key: 'b', value: null }, { key: 'c', value: 'new-c' },
    ])).toBe(false);
    expect(Object.fromEntries(b.disk)).toEqual({ a: 'old-a', b: 'old-b' });
    expect(store.getItem('a')).toBe('old-a');
    expect(store.getItem('b')).toBe('old-b');
    expect(store.getItem('c')).toBeNull();
    // The caller reports it; it is not also a banner, nor something to retry.
    expect(heard).toEqual([]);
    expect(store.hasUnsaved).toBe(false);
  });

  it('is what commitStorageChanges waits for in the apps', async () => {
    const { b, store } = await open();
    b.refuse.add('x');
    const withCommit = Object.assign(store, {
      tryCommitBatch: (c: { key: string; value: string | null }[]) => store.commitBatch(c),
    });
    expect(await commitStorageChanges(withCommit, [{ key: 'x', value: '1' }])).toBe(false);
    b.refuse.clear();
    expect(await commitStorageChanges(withCommit, [{ key: 'x', value: '1' }])).toBe(true);
    expect(b.disk.get('x')).toBe('1');
  });
});

describe('a backup reads the database, not the cache', () => {
  it('leaves out a value the database refused, even before it answered', async () => {
    const { b, store } = await open({ budget_2026_8: 'stored' });
    b.refuse.add('budget_2026_8');
    store.setItem('budget_2026_8', 'refused');
    // Asked while the refused write is still queued: the snapshot waits for it.
    const snap = await store.snapshot();
    expect(snap.budget_2026_8).toBe('stored');
  });

  it('includes every write that landed before it', async () => {
    const { store } = await open();
    store.setItem('budget_2026_8', 'saved');
    expect((await store.snapshot()).budget_2026_8).toBe('saved');
  });
});

// ── The flows that say "done" (deep review 2026-09-27, P0 and P1) ───────────
//
// Each runs against the store the apps use, with the database refusing at a
// chosen point. `appLike` gives it what appStorage has in the apps: a way to
// wait for the database (tryCommitBatch).

const appLike = <T extends ReturnType<typeof createCachedStorage>>(store: T) =>
  Object.assign(store, { tryCommitBatch: (c: StorageChange[]) => store.commitBatch(c) });

const month = (amount: number) => JSON.stringify({
  income: [{ id: 'i1', label: 'Lön', amount: 30000 }],
  expenses: [{ id: 'mat', name: 'Mat', icon: '', color: '', rows: [{ id: 'r1', label: 'ICA', amount }] }],
  savings: [],
});
const backupOf = (data: Record<string, string>) => {
  const check = checkBackup(JSON.stringify({
    app: 'budget', version: BACKUP_VERSION, exportedAt: '2026-09-27T08:00:00.000Z', data,
  }));
  if (!check.ok) throw new Error('fixture is not a valid backup');
  return check.payload;
};

describe('restoring a backup in the apps is one transaction', () => {
  const existing = { budget_2026_6: month(100), budget_2026_7: month(200), budget_lang: 'sv' };
  const file = { budget_2026_5: month(999), budget_2026_7: month(777), budget_lang: 'en' };

  // First, middle and last key of the file refused in turn: whichever part
  // fails, the database and the app's copy are exactly what they were.
  it.each(['budget_2026_5', 'budget_2026_7', 'budget_lang', 'budget_2026_6'])(
    'changes nothing anywhere when %s is refused',
    async refused => {
      const { b, store } = await open(existing);
      b.refuse.add(refused);
      const result = await applyBackup(appLike(store), backupOf(file));
      expect(result).toMatchObject({ ok: false, reason: 'write-failed' });
      expect(Object.fromEntries(b.disk)).toEqual(existing);
      for (const [k, v] of Object.entries(existing)) expect(store.getItem(k)).toBe(v);
      expect(store.getItem('budget_2026_5')).toBeNull();
      // Nothing is left to "try again" either: a refused restore is over.
      expect(store.hasUnsaved).toBe(false);
    },
  );

  it('answers only once the database holds exactly the file', async () => {
    const { b, store } = await open(existing);
    const pending = applyBackup(appLike(store), backupOf(file));
    expect(Object.fromEntries(b.disk)).toEqual(existing); // not before
    expect(await pending).toEqual({ ok: true });
    expect(Object.fromEntries(b.disk)).toEqual(file);
    // A month the file does not have is gone — the restore REPLACES.
    expect(store.getItem('budget_2026_6')).toBeNull();
  });
});

describe('a step back in the apps', () => {
  it('stays on offer, and changes nothing, when the database refuses it', async () => {
    const { b, store } = await open({ budget_2026_8: 'before' });
    pushUndo(store, {
      at: '2026-09-27T08:00:00.000Z', action: 'resetMonth', year: 2026, month: 8,
      changes: captureKeys(store, ['budget_2026_8']),
    });
    store.setItem('budget_2026_8', 'after');
    await store.flush();
    const stackBefore = b.disk.get(UNDO_KEY);

    b.refuse.add('budget_2026_8');
    expect(await undoLast(appLike(store))).toBeNull();
    expect(b.disk.get('budget_2026_8')).toBe('after');
    expect(b.disk.get(UNDO_KEY)).toBe(stackBefore);
    expect(readUndo(store)).toHaveLength(1);

    b.refuse.clear();
    expect((await undoLast(appLike(store)))?.action).toBe('resetMonth');
    expect(b.disk.get('budget_2026_8')).toBe('before');
    expect(JSON.parse(b.disk.get(UNDO_KEY)!)).toEqual([]);
  });
});

describe('the startup refiling in the apps', () => {
  const misfiled = () => ({
    [PERIOD_START_KEY]: '25',
    [actualsKey(2026, 7)]: JSON.stringify([
      { id: 'a1', date: '2026-08-10', text: 'SYNTETISK a1', amount: 100, direction: 'out', categoryId: 'mat' },
      { id: 'a2', date: '2026-08-26', text: 'SYNTETISK a2', amount: 100, direction: 'out', categoryId: 'mat' },
    ]),
  });

  it('reports nothing and changes nothing when the move is refused', async () => {
    const seed = misfiled();
    const { b, store } = await open(seed);
    b.refuse.add(actualsKey(2026, 8));
    expect(await repairFiling(appLike(store))).toBeNull();
    expect(Object.fromEntries(b.disk)).toEqual(seed);
    expect(store.getItem(actualsKey(2026, 8))).toBeNull();
  });

  it('reports the move once it is stored', async () => {
    const { b, store } = await open(misfiled());
    const step = await repairFiling(appLike(store));
    expect(step?.count).toBe(1);
    expect(JSON.parse(b.disk.get(actualsKey(2026, 8))!).map((e: { id: string }) => e.id)).toEqual(['a2']);
  });
});

// ── Try again must never put back an OLDER change (foundation review
// 2026-09-29, P0) ───────────────────────────────────────────────────────────
//
// The sequence the review reproduced: a write is refused, the user changes the
// same thing again (that write still on its way), then presses Try again
// before it lands. Try again had captured the refused, OLDER value and queued
// it behind the newer one — so both the cache and the database ended on the
// older value, and it reported that all was saved.

/** A backend whose writes to one key wait until released. */
const gatedBackend = () => {
  const b = backend();
  let release: () => void = () => {};
  let gate: Promise<void> | null = null;
  const hold = () => { gate = new Promise<void>(r => { release = r; }); };
  const inner = b.write.bind(b);
  const innerCommit = b.commit!.bind(b);
  const g = Object.assign(b, {
    hold,
    release: () => { const r = release; gate = null; r(); },
    async write(k: string, v: string) { if (gate) await gate; return inner(k, v); },
    async commit(c: StorageChange[]) { if (gate) await gate; return innerCommit(c); },
  });
  return g;
};

describe('Try again after a newer change to the same key', () => {
  const KEY = 'budget_actuals_2026_8';

  it('keeps the newer change — in the cache, on disk, and after a restart', async () => {
    const b = gatedBackend();
    b.disk.set(KEY, 'stored');
    const store = createCachedStorage(b);
    await store.hydrate();

    // 1. The first write is refused — and has REALLY been refused before
    //    anything else happens.
    b.refuse.add(KEY);
    store.setItem(KEY, 'older');
    await store.flush();
    expect(store.unsaved()).toEqual([{ key: KEY, value: 'older' }]);

    // 2. A newer change to the same key, held on its way to the database.
    b.refuse.clear();
    b.hold();
    store.setItem(KEY, 'newer');

    // 3. Try again, pressed before the newer write has landed.
    const retried = store.retryUnsaved();

    // 4. The newer write lands.
    b.release();
    expect(await retried).toBe(true);
    await store.flush();

    expect(store.getItem(KEY)).toBe('newer');
    expect(b.disk.get(KEY)).toBe('newer');
    expect(store.hasUnsaved).toBe(false);
    const again = createCachedStorage(b);
    await again.hydrate();
    expect(again.getItem(KEY)).toBe('newer');
  });

  it('keeps the newer change for the next try when IT is refused too', async () => {
    const b = gatedBackend();
    b.disk.set(KEY, 'stored');
    const store = createCachedStorage(b);
    await store.hydrate();
    b.refuse.add(KEY);
    store.setItem(KEY, 'older');
    await store.flush();

    b.hold();
    store.setItem(KEY, 'newer');          // will be refused as well
    const retried = store.retryUnsaved();
    b.release();
    expect(await retried).toBe(false);
    await store.flush();
    // What is kept to try again is the NEWER change, and nothing older landed.
    expect(store.unsaved()).toEqual([{ key: KEY, value: 'newer' }]);
    expect(b.disk.get(KEY)).toBe('stored');

    b.refuse.clear();
    expect(await store.retryUnsaved()).toBe(true);
    expect(b.disk.get(KEY)).toBe('newer');
  });

  it('two Try agains at once write the refused change once, and agree', async () => {
    const b = gatedBackend();
    const store = createCachedStorage(b);
    await store.hydrate();
    b.refuse.add(KEY);
    store.setItem(KEY, 'v1');
    await store.flush();
    b.refuse.clear();
    const [a, c] = await Promise.all([store.retryUnsaved(), store.retryUnsaved()]);
    expect([a, c]).toEqual([true, true]);
    expect(b.disk.get(KEY)).toBe('v1');
    expect(store.hasUnsaved).toBe(false);
  });
});
