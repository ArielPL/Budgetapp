// ── storageCache — synchronous reads over an asynchronous store ────────────
//
// THIS IS NOT WIRED UP YET. It is the half of the native storage move that can
// be built and tested in a browser, written now so that the half which cannot
// be — the Capacitor driver — is small when the time comes.
//
// The problem it solves:
//
// Sixty-three call sites read and write through `appStorage`, synchronously,
// because that is what React lets you do in a `useState` initialiser:
//
//     const [data] = useState(() => loadMonthData(year, month, lang));
//
// Native storage is asynchronous. Every serious option is — Capacitor
// Preferences, the Filesystem API, SQLite. So the choice is either to make
// sixty-three call sites async, which means making most of the component tree
// async, or to keep a copy of everything in memory and answer reads from that.
//
// This is the second. It is NOT a performance cache: localStorage is already
// fast, and if the backend were synchronous this file would be pure risk. It
// exists because a synchronous READ over an asynchronous STORE is otherwise
// impossible, and that is the only reason it should ever exist.
//
// Three things it has to get right, in order of how quietly they break:
//
//   1. WRITES MUST LAND IN ORDER. Two writes to the same month, queued, must
//      arrive in the order they were made, or the older one wins and the user
//      silently loses the newer edit. One serial queue for all keys.
//
//   2. ANOTHER TAB'S WRITES MUST BE VISIBLE. The app detects a second tab by
//      reading storage and comparing against a baseline (FollowUpTab) and by
//      adopting the month another tab wrote (crossTab.ts). A cache that never
//      hears about outside writes answers with its own stale copy and both
//      mechanisms stop working — without any error. `adoptExternal` is how the
//      `storage` event gets in.
//
//   3. A FAILED WRITE MUST STILL BE REPORTED. Today `safeSetItem` catches the
//      throw from localStorage and the app tells the user the edit is only on
//      screen. Once writes are queued there is nothing to throw at the caller,
//      so the failure arrives later, through `onWriteFailed` — which the app
//      already has somewhere to put: `setSaveFailed`.

import type { StorageLike } from './storage';

/** What a native driver has to provide. Every method is async on purpose:
 *  this is the shape Capacitor Preferences and the Filesystem API both have. */
export interface AsyncBackend {
  /** Everything stored, read once before the app renders. */
  loadAll(): Promise<Record<string, string>>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface CachedStorage extends StorageLike {
  /** Fill the cache from the backend. MUST resolve before the app renders —
   *  reads before this answer as though the device were empty, which would
   *  look to the app exactly like a new install. */
  hydrate(): Promise<void>;
  /** True once hydrate has completed. The app should not render before it. */
  readonly ready: boolean;
  /** Apply a change made outside this instance — another tab, another window.
   *  `null` means the key was removed. Does not queue a write back. */
  adoptExternal(key: string, value: string | null): void;
  /** Called with the key of every write the backend refused. Replaces the
   *  throw that a synchronous store gives the caller. */
  onWriteFailed(listener: (key: string) => void): () => void;
  /** Resolves when the queue has drained. For tests, and for anywhere the app
   *  wants to know its edits are safely down — before a backup, say. */
  flush(): Promise<void>;
  /** How many writes are still waiting. */
  readonly pending: number;
}

export function createCachedStorage(backend: AsyncBackend): CachedStorage {
  /** The readable copy. Insertion order is the iteration order for key(i),
   *  which is stable in a way localStorage's own order is not promised to be. */
  let cache = new Map<string, string>();
  let ready = false;

  // Keys REMOVED before hydrate finished. The cache alone cannot express this:
  // a removal deletes the key, so hydrate's merge of "what is in the cache"
  // over "what came off disk" had nothing to merge and quietly reinstated the
  // stored value. The queued backend.remove still ran, so memory and disk then
  // disagreed — a read answered with a key the user had deleted, and it
  // vanished at the next launch (finding 21).
  const removedBeforeHydrate = new Set<string>();

  const listeners = new Set<(key: string) => void>();
  const fail = (key: string) => {
    for (const l of listeners) l(key);
  };

  // One promise chain for every key, so writes land in the order they were
  // made. Per-key queues would be faster and would also let a write to month A
  // overtake an earlier write to month B, which is a race nobody would ever
  // find from a bug report.
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;

  const enqueue = (key: string, job: () => Promise<void>) => {
    pending += 1;
    queue = queue
      .then(job)
      .catch(() => { fail(key); })
      .finally(() => { pending -= 1; });
  };

  return {
    get ready() { return ready; },
    get pending() { return pending; },
    get length() { return cache.size; },

    key(i: number) {
      if (i < 0 || i >= cache.size) return null;
      // Materialised per call rather than kept as an array: the app collects
      // keys by index before deleting them (CustomV3's clear), and a cached
      // array would go stale between the collecting and the deleting.
      return [...cache.keys()][i] ?? null;
    },

    getItem(k: string) {
      return cache.has(k) ? cache.get(k)! : null;
    },

    setItem(k: string, v: string) {
      // The cache is updated FIRST and synchronously, so the very next read
      // sees the new value whether or not the backend has caught up. The app
      // reads its own writes constantly — the save effect, the undo capture,
      // the baseline check — and none of them can wait for a promise.
      cache.set(k, v);
      // Written again after being removed: no longer a removal.
      if (!ready) removedBeforeHydrate.delete(k);
      enqueue(k, () => backend.write(k, v));
    },

    removeItem(k: string) {
      cache.delete(k);
      if (!ready) removedBeforeHydrate.add(k);
      enqueue(k, () => backend.remove(k));
    },

    async hydrate() {
      const all = await backend.loadAll();
      // Anything written before hydrate finished wins over what came off disk:
      // it is newer, and it is already queued to be stored. Removals win the
      // same way, and have to be applied explicitly — see the note above.
      const written = cache;
      cache = new Map(Object.entries(all));
      for (const k of removedBeforeHydrate) cache.delete(k);
      for (const [k, v] of written) cache.set(k, v);
      removedBeforeHydrate.clear();
      ready = true;
    },

    adoptExternal(key: string, value: string | null) {
      if (value === null) cache.delete(key);
      else cache.set(key, value);
    },

    onWriteFailed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async flush() {
      // Awaited twice: a job that enqueues another job (a rollback, say) would
      // otherwise slip past the first await.
      await queue;
      await queue;
    },
  };
}

/**
 * An AsyncBackend over a synchronous StorageLike.
 *
 * Not for production — it is how the cache is tested without a device, and how
 * the native driver's behaviour can be compared against localStorage's.
 */
export function backendFromSync(store: StorageLike): AsyncBackend {
  return {
    async loadAll() {
      const out: Record<string, string> = {};
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k !== null) out[k] = store.getItem(k) ?? '';
      }
      return out;
    },
    async write(key, value) { store.setItem(key, value); },
    async remove(key) { store.removeItem(key); },
  };
}
