// ── nativeStorage — the iOS and Android apps keep their data in SQLite ──────
//
// Why not the WebView's localStorage, which the web app uses: the operating
// system may clear it when the device runs short of space (Capacitor's own
// documentation says so), and on a phone this app's data has no other copy.
//
// The shape is deliberately the smallest one that keeps everything else
// unchanged — one key/value table, the same keys and the same JSON values the
// web app stores, so backups move between web and app without conversion:
//
//     kv   (key TEXT PRIMARY KEY, value TEXT)   ← the app's data
//     meta (key TEXT PRIMARY KEY, value TEXT)   ← this file's own bookkeeping
//
// `meta` is kept apart so nothing in it can ever turn up in a backup or look
// like the user's data to the rest of the app.
//
// NOT encrypted with a device key, on purpose. Ariel chose (2026-09-26) to let
// the phone's own backup — iCloud, Google — carry the budget to a new phone. A
// database locked with a key that stays behind on the old phone would restore
// as unreadable. The platforms already encrypt the device and its backups.
//
// Chosen plugin: @capacitor-community/sqlite 8.1.1 (MIT; Capacitor 8; Swift
// Package Manager, so no CocoaPods). Checked for telemetry: none. It CAN fetch a
// database from a URL, but only when asked, and this app never asks.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';
import { createCachedStorage, type AsyncBackend, type CachedStorage } from './storageCache';

/** The part of a SQLite connection this file uses — so tests can pass an
 *  in-memory stand-in with the same transaction rules. */
export interface KvDatabase {
  execute(statements: string): Promise<unknown>;
  query(statement: string, values?: unknown[]): Promise<{ values?: unknown[] }>;
  run(statement: string, values?: unknown[]): Promise<unknown>;
  /** All statements in one transaction: every one applies, or none does. */
  executeSet(set: { statement: string; values?: unknown[] }[], transaction: boolean): Promise<unknown>;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;
const UPSERT = 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;';
const DELETE = 'DELETE FROM kv WHERE key = ?;';
/** Set once the old WebView data has been looked at, copied or not. */
const MIGRATED = 'web_storage_migrated';

const toStatement = ({ key, value }: StorageChange) => (value === null
  ? { statement: DELETE, values: [key] }
  : { statement: UPSERT, values: [key, value] });

async function readAll(db: KvDatabase): Promise<Record<string, string>> {
  const res = await db.query('SELECT key, value FROM kv;');
  const out: Record<string, string> = {};
  for (const row of res.values ?? []) {
    const r = row as { key?: unknown; value?: unknown };
    if (typeof r.key === 'string' && typeof r.value === 'string') out[r.key] = r.value;
  }
  return out;
}

/** The store storageCache writes through. `commit` is one real transaction,
 *  which is what makes a multi-month import all-or-nothing on disk. */
export function sqliteBackend(db: KvDatabase): AsyncBackend {
  return {
    loadAll: () => readAll(db),
    async write(key, value) { await db.run(UPSERT, [key, value]); },
    async remove(key) { await db.run(DELETE, [key]); },
    async commit(changes) { await db.executeSet(changes.map(toStatement), true); },
  };
}

/**
 * Carry data from the WebView's localStorage into the database, once.
 *
 * Who has any: only the early test builds, which ran before this store
 * existed. A phone that installs the app from a store starts empty, and its
 * user brings a web budget over with a backup file instead — an app cannot read
 * a browser's storage.
 *
 * The rules, from the launch plan:
 *   · Copy only the app's own keys (`budget_`), in ONE transaction.
 *   · Read back and compare every key and value BEFORE marking it done; a
 *     mismatch leaves it unmarked, so the next start tries again.
 *   · Never overwrite a database that already holds data — that data is newer.
 *   · Never delete the originals. They are the way back if anything is wrong.
 */
export async function migrateFromWebStorage(
  db: KvDatabase, web: StorageLike,
): Promise<{ copied: number; skipped?: 'done' | 'database-not-empty' | 'nothing-to-copy' }> {
  const done = await db.query('SELECT value FROM meta WHERE key = ?;', [MIGRATED]);
  if ((done.values ?? []).length > 0) return { copied: 0, skipped: 'done' };

  const mark = (how: string) => db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    [MIGRATED, `${how} ${new Date().toISOString()}`],
  );

  const existing = await readAll(db);
  if (Object.keys(existing).length > 0) {
    await mark('kept-database');
    return { copied: 0, skipped: 'database-not-empty' };
  }

  const found: StorageChange[] = [];
  for (let i = 0; i < web.length; i++) {
    const key = web.key(i);
    if (!key || !key.startsWith('budget_')) continue;
    const value = web.getItem(key);
    if (value !== null) found.push({ key, value });
  }
  if (found.length === 0) {
    await mark('nothing');
    return { copied: 0, skipped: 'nothing-to-copy' };
  }

  await db.executeSet(found.map(toStatement), true);
  const back = await readAll(db);
  const intact = Object.keys(back).length === found.length
    && found.every(({ key, value }) => back[key] === value);
  if (!intact) throw new Error('migration: the copy does not match the original');
  await mark(`copied-${found.length}`);
  return { copied: found.length };
}

/**
 * Open the database, carry over any WebView data, and return a store that is
 * hydrated and ready to install. Only called in the iOS and Android apps — the
 * plugin is imported here, dynamically, so the web bundle never carries it.
 */
export async function openNativeStorage(web: StorageLike): Promise<CachedStorage> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const name = 'budget';
  // A connection can survive a WebView reload (undo and restore both reload),
  // so reuse it rather than fail on "connection already exists".
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(name, false)).result;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open().catch(async (e: unknown) => {
    // Already open after a reload is fine; anything else is not.
    if (!(await conn.isDBOpen()).result) throw e;
  });
  const db: KvDatabase = {
    execute: statements => conn.execute(statements, false),
    query: (statement, values) => conn.query(statement, values as unknown[] | undefined),
    run: (statement, values) => conn.run(statement, values as unknown[] | undefined, true),
    executeSet: (set, transaction) => conn.executeSet(set, transaction),
  };
  await db.execute(SCHEMA);
  await migrateFromWebStorage(db, web);
  const store = createCachedStorage(sqliteBackend(db));
  await store.hydrate();
  return store;
}
