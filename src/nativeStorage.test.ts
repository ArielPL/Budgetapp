import { describe, it, expect } from 'vitest';
import { sqliteBackend, migrateFromWebStorage, type KvDatabase } from './nativeStorage';
import { createCachedStorage } from './storageCache';
import { applyStorageChanges } from './storageWrite';
import type { StorageLike } from './storage';

// ── The iOS and Android store (P0 in the 2026-09-26 iOS/Android review) ──────
//
// SQLite itself cannot run in a unit test, so these run against an in-memory
// database that keeps SQLite's promises: a transaction applies every statement
// or none, and a refused write changes nothing. It is told to fail on a chosen
// key, which is how the failure paths are exercised for real.

class FakeDb implements KvDatabase {
  kv = new Map<string, string>();
  meta = new Map<string, string>();
  /** Refuse any statement touching this key. */
  failOn: string | null = null;
  /** Make read-back after a migration return something different. */
  corruptReadBack = false;

  async execute() { return {}; }

  async query(statement: string, values: unknown[] = []) {
    if (statement.startsWith('SELECT key, value FROM kv')) {
      const rows = [...this.kv].map(([key, value]) => ({ key, value }));
      if (this.corruptReadBack && rows.length) rows[0].value += '!';
      return { values: rows };
    }
    if (statement.startsWith('SELECT value FROM meta')) {
      const v = this.meta.get(String(values[0]));
      return { values: v === undefined ? [] : [{ value: v }] };
    }
    throw new Error(`unexpected query: ${statement}`);
  }

  private apply(target: Map<string, string>, meta: Map<string, string>, statement: string, values: unknown[] = []) {
    const key = String(values[0]);
    if (key === this.failOn) throw new Error('disk full');
    if (statement.startsWith('INSERT INTO kv')) target.set(key, String(values[1]));
    else if (statement.startsWith('DELETE FROM kv')) target.delete(key);
    else if (statement.startsWith('INSERT INTO meta')) meta.set(key, String(values[1]));
    else throw new Error(`unexpected statement: ${statement}`);
  }

  async run(statement: string, values?: unknown[]) {
    this.apply(this.kv, this.meta, statement, values);
    return {};
  }

  async executeSet(set: { statement: string; values?: unknown[] }[], transaction: boolean) {
    expect(transaction).toBe(true);
    // Work on copies and swap only when every statement succeeded.
    const kv = new Map(this.kv);
    const meta = new Map(this.meta);
    for (const { statement, values } of set) this.apply(kv, meta, statement, values);
    this.kv = kv;
    this.meta = meta;
    return {};
  }
}

const web = (seed: Record<string, string>): StorageLike & { map: Map<string, string> } => {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: k => { map.delete(k); },
  };
};

describe('the SQLite backend', () => {
  it('keeps what was written across a restart', async () => {
    const db = new FakeDb();
    const first = createCachedStorage(sqliteBackend(db));
    await first.hydrate();
    first.setItem('budget_2026_8', '{"income":[]}');
    first.setItem('budget_lang', 'sv');
    first.removeItem('budget_lang');
    await first.flush();

    // A new start reads the same database.
    const second = createCachedStorage(sqliteBackend(db));
    await second.hydrate();
    expect(second.getItem('budget_2026_8')).toBe('{"income":[]}');
    expect(second.getItem('budget_lang')).toBeNull();
  });

  it('writes a multi-month change as one transaction — all of it or none', async () => {
    const db = new FakeDb();
    db.kv.set('budget_2026_7', 'old-aug');
    const store = createCachedStorage(sqliteBackend(db));
    await store.hydrate();
    const failed: string[] = [];
    store.onWriteFailed(k => failed.push(k));

    db.failOn = 'budget_2026_9';
    store.applyBatch([
      { key: 'budget_2026_7', value: 'new-aug' },
      { key: 'budget_2026_8', value: 'new-sep' },
      { key: 'budget_2026_9', value: 'new-oct' },
    ]);
    await store.flush();

    // Nothing reached the disk: August is still what it was, September absent.
    expect(db.kv.get('budget_2026_7')).toBe('old-aug');
    expect(db.kv.has('budget_2026_8')).toBe(false);
    // And the refusal was reported, not swallowed.
    expect(failed).toEqual(['budget_2026_7']);
  });

  it('keeps writes in the order they were made, batches included', async () => {
    const db = new FakeDb();
    const store = createCachedStorage(sqliteBackend(db));
    await store.hydrate();
    store.setItem('budget_2026_8', 'one');
    store.applyBatch([{ key: 'budget_2026_8', value: 'two' }]);
    store.setItem('budget_2026_8', 'three');
    await store.flush();
    expect(db.kv.get('budget_2026_8')).toBe('three');
  });

  it('is what applyStorageChanges uses when it is there', async () => {
    const db = new FakeDb();
    const store = createCachedStorage(sqliteBackend(db));
    await store.hydrate();
    let batches = 0;
    const withBatch = Object.assign(store, {
      tryApplyBatch(changes: { key: string; value: string | null }[]) {
        batches += 1;
        store.applyBatch(changes);
        return true;
      },
    });
    expect(applyStorageChanges(withBatch, [
      { key: 'a', value: '1' }, { key: 'b', value: null },
    ])).toBe(true);
    await store.flush();
    expect(batches).toBe(1);
    expect(db.kv.get('a')).toBe('1');
  });
});

describe('carrying the WebView’s data over, once', () => {
  it('copies the app’s own keys, and only those', async () => {
    const db = new FakeDb();
    const old = web({ budget_2026_8: 'sep', budget_lang: 'sv', other_app: 'x' });
    expect(await migrateFromWebStorage(db, old)).toEqual({ copied: 2 });
    expect([...db.kv.keys()].sort()).toEqual(['budget_2026_8', 'budget_lang']);
  });

  it('never deletes the originals', async () => {
    const db = new FakeDb();
    const old = web({ budget_2026_8: 'sep' });
    await migrateFromWebStorage(db, old);
    expect(old.map.get('budget_2026_8')).toBe('sep');
  });

  it('runs once — a second start copies nothing, even if the WebView changed', async () => {
    const db = new FakeDb();
    const old = web({ budget_2026_8: 'sep' });
    await migrateFromWebStorage(db, old);
    old.setItem('budget_2026_9', 'oct');
    expect(await migrateFromWebStorage(db, old)).toEqual({ copied: 0, skipped: 'done' });
    expect(db.kv.has('budget_2026_9')).toBe(false);
  });

  it('never overwrites a database that already holds data', async () => {
    const db = new FakeDb();
    db.kv.set('budget_2026_8', 'newer');
    const result = await migrateFromWebStorage(db, web({ budget_2026_8: 'older' }));
    expect(result.skipped).toBe('database-not-empty');
    expect(db.kv.get('budget_2026_8')).toBe('newer');
  });

  it('does not mark itself done when the copy does not read back identical', async () => {
    const db = new FakeDb();
    db.corruptReadBack = true;
    await expect(migrateFromWebStorage(db, web({ budget_2026_8: 'sep' }))).rejects.toThrow();
    expect(db.meta.size).toBe(0);
  });

  it('copies nothing if a write is refused — one transaction', async () => {
    const db = new FakeDb();
    db.failOn = 'budget_2026_9';
    await expect(migrateFromWebStorage(db, web({ budget_2026_8: 'sep', budget_2026_9: 'oct' }))).rejects.toThrow();
    expect(db.kv.size).toBe(0);
    expect(db.meta.size).toBe(0);
  });

  it('marks an empty WebView as done without copying anything', async () => {
    const db = new FakeDb();
    expect(await migrateFromWebStorage(db, web({}))).toEqual({ copied: 0, skipped: 'nothing-to-copy' });
    expect(db.meta.size).toBe(1);
  });
});
