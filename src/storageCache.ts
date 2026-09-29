// ── storageCache — synchronous reads over an asynchronous store ────────────
//
// Wired up in the iOS and Android apps (2026-09-27): main.tsx hydrates one of
// these over the SQLite backend in nativeStorage.ts before React renders, and
// storage.ts routes `appStorage` through it. The web app still uses
// localStorage directly and never touches this file.
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
//
//   4. A REFUSED WRITE MUST NOT STAY IN MEMORY AS IF IT WERE STORED
//      (deep review 2026-09-27, P0). The cache takes a write before the
//      database does, so a refusal left the two disagreeing: every read, and a
//      backup built from those reads, answered with a value that was never
//      saved. After a refusal the cache is put back to what the database
//      actually holds — the same thing localStorage does on the web, where a
//      refused setItem simply leaves the old value — and the refused change is
//      kept aside (`unsaved`) for "Try again" to write, instead of being lost
//      or pretending to be saved.
//
//   5. AN ACTION THAT SAYS "DONE" MUST BE ABLE TO WAIT FOR THE DATABASE.
//      `commitBatch` resolves true only once the transaction is committed. A
//      restore, an import, a step back: each waits for it before it reports
//      success, records a step back, or reloads.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';

/** What a native driver has to provide. Every method is async on purpose:
 *  this is the shape Capacitor Preferences and the Filesystem API both have. */
export interface AsyncBackend {
  /** Everything stored, read once before the app renders. */
  loadAll(): Promise<Record<string, string>>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Several changes as ONE transaction: all land or none do. Optional — a
   *  backend without it gets the changes one by one, in order. */
  commit?(changes: StorageChange[]): Promise<void>;
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
  /** Several changes at once: the cache takes all of them now, and the
   *  backend gets them as one transaction (see AsyncBackend.commit). A refusal
   *  reaches onWriteFailed with the first key, like any other write. */
  applyBatch(changes: StorageChange[]): void;
  /** Like applyBatch, but the caller hears how it went: true once the backend
   *  has committed every change, false if it refused them. A refusal puts the
   *  cache back to what the backend holds, is NOT reported to onWriteFailed and
   *  is NOT kept for retryUnsaved — the caller asked, so the caller tells the
   *  user, and nothing has changed. */
  commitBatch(changes: StorageChange[]): Promise<boolean>;
  /** Changes the backend refused that nothing has replaced since: what the
   *  user was told is "on screen but not stored". */
  unsaved(): StorageChange[];
  /** True while anything the user did is not stored — a refused change, or a
   *  refusal after which the database could not even be read back. */
  readonly hasUnsaved: boolean;
  /** Write every unsaved change again, as one transaction. Resolves true when
   *  nothing is left unsaved. */
  retryUnsaved(): Promise<boolean>;
  /** Hear when hasUnsaved changes, either way. Returns an unsubscribe. */
  onUnsavedChange(listener: () => void): () => void;
  /** Everything the backend holds, read after every earlier write has landed.
   *  What a backup is built from: the database, not the cache. */
  snapshot(): Promise<Record<string, string>>;
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

  // Every change to the cache gets a number, and each key remembers the number
  // of the last change to it. After a refusal that is how the cache knows which
  // keys to put back: the ones nothing has changed SINCE the refused write.
  // A key changed later has its own write queued behind this one, and that
  // write — not the database's older value — is what the user last did.
  let generation = 0;
  const changedAt = new Map<string, number>();
  const stamp = (keys: string[]): number => {
    generation += 1;
    for (const k of keys) changedAt.set(k, generation);
    return generation;
  };

  /** Refused changes nothing has replaced since, by key — each with the
   *  number of the change that was refused (see `stamp`). */
  const refusedChanges = new Map<string, { value: string | null; at: number }>();
  /** Told whenever hasUnsaved may have changed, so the banner can follow the
   *  real state instead of whichever write answered last. */
  const unsavedListeners = new Set<() => void>();
  let lastUnsaved = false;
  const unsavedChanged = () => {
    const now = refusedChanges.size > 0 || diverged;
    if (now === lastUnsaved) return;
    lastUnsaved = now;
    for (const l of unsavedListeners) l();
  };
  /** A refusal after which the database could not be read back either: the
   *  cache may hold values that are not stored, and nothing here can say which. */
  let diverged = false;

  /** Put every key untouched since change `at` back to what the backend
   *  holds. Runs INSIDE the queue, so every earlier write has landed. */
  const reconcile = async (at: number) => {
    try {
      const disk = await backend.loadAll();
      for (const k of new Set([...cache.keys(), ...Object.keys(disk)])) {
        if ((changedAt.get(k) ?? 0) > at) continue;
        if (Object.prototype.hasOwnProperty.call(disk, k)) cache.set(k, disk[k]);
        else cache.delete(k);
      }
      diverged = false;
    } catch {
      diverged = true;
    }
    unsavedChanged();
  };

  /**
   * Queue `job`, which writes `changes`. Resolves true when it landed.
   *
   * `tracked`: a change nobody is waiting on (an ordinary edit). If refused,
   * it is kept for retryUnsaved and reported through onWriteFailed. An
   * untracked change is one a caller awaits, and reports itself.
   */
  const enqueue = (changes: StorageChange[], at: number, tracked: boolean, job: () => Promise<void>): Promise<boolean> => {
    pending += 1;
    const result = queue.then(job).then(
      () => {
        // Landed: whatever was refused for these keys before is superseded.
        for (const c of changes) refusedChanges.delete(c.key);
        unsavedChanged();
        return true;
      },
      async () => {
        if (tracked) {
          for (const c of changes) refusedChanges.set(c.key, { value: c.value, at });
          fail(changes[0].key);
        }
        await reconcile(at);
        return false;
      },
    ).finally(() => { pending -= 1; });
    queue = result.then(() => undefined);
    return result;
  };

  /** Take `changes` into the cache now; the backend gets them as one job. */
  const batch = (changes: StorageChange[], tracked: boolean): Promise<boolean> => {
    if (changes.length === 0) return Promise.resolve(true);
    for (const { key, value } of changes) {
      if (value === null) {
        cache.delete(key);
        if (!ready) removedBeforeHydrate.add(key);
      } else {
        cache.set(key, value);
        if (!ready) removedBeforeHydrate.delete(key);
      }
    }
    const at = stamp(changes.map(c => c.key));
    // One job, so nothing queued later can land between its parts — and on
    // a backend with transactions, one transaction, so a multi-month import
    // is never half on disk.
    return enqueue(changes, at, tracked, async () => {
      if (backend.commit) {
        await backend.commit(changes);
        return;
      }
      for (const { key, value } of changes) {
        if (value === null) await backend.remove(key);
        else await backend.write(key, value);
      }
    });
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
      void enqueue([{ key: k, value: v }], stamp([k]), true, () => backend.write(k, v));
    },

    removeItem(k: string) {
      cache.delete(k);
      if (!ready) removedBeforeHydrate.add(k);
      void enqueue([{ key: k, value: null }], stamp([k]), true, () => backend.remove(k));
    },

    applyBatch(changes: StorageChange[]) {
      void batch(changes, true);
    },

    commitBatch(changes: StorageChange[]) {
      return batch(changes, false);
    },

    unsaved() {
      return [...refusedChanges].map(([key, r]) => ({ key, value: r.value }));
    },

    get hasUnsaved() { return refusedChanges.size > 0 || diverged; },

    async retryUnsaved() {
      // Only refusals nothing has changed SINCE. A key the user has changed
      // again has a newer write of its own, queued or landed, and that write
      // decides: it clears the refusal when it lands, or replaces it with the
      // newer value when it is refused too. Retrying the older value would
      // queue it BEHIND the newer one and put it back over it (foundation
      // review 2026-09-29, P0). A second Try again pressed meanwhile skips it
      // for the same reason: the first one's write is itself a newer change.
      const changes = [...refusedChanges]
        .filter(([key, r]) => (changedAt.get(key) ?? 0) <= r.at)
        .map(([key, r]) => ({ key, value: r.value }));
      await batch(changes, true);
      // Let every write queued before this answer too — the newer ones
      // above, above all — so what is returned describes the disk.
      await queue;
      if (diverged) {
        // The last read-back failed; try it again, in turn with the writes.
        const at = generation;
        const again = queue.then(() => reconcile(at));
        queue = again;
        await again;
      }
      return refusedChanges.size === 0 && !diverged;
    },

    onUnsavedChange(listener) {
      unsavedListeners.add(listener);
      return () => unsavedListeners.delete(listener);
    },

    snapshot() {
      const read = queue.then(() => backend.loadAll());
      queue = read.then(() => undefined, () => undefined);
      return read;
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
