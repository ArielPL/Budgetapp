// ── storage — the one door to persistent storage ───────────────────────────
//
// Everything the app keeps goes through here: the browser's localStorage on
// the web, and a SQLite database in the iOS and Android apps.
//
// Why the apps need their own store: inside a native app's web view, the
// system may EVICT localStorage when the device runs short of space. For an
// app whose only copy of your budget lives there, with no server to restore
// from, that is data loss rather than inconvenience.
//
// SQLite is asynchronous, so it sits behind storageCache.ts: every key is read
// ONCE at startup, reads are answered from that in-memory copy, and writes go
// onto one ordered queue. The ~60 call sites keep working unchanged; what the
// apps gain is a startup wait (main.tsx) and a write that can fail LATER, which
// arrives through onStorageWriteFailed below.
//
// Deliberately the SAME SHAPE as localStorage: synchronous getItem/setItem/
// removeItem plus length/key(i). That shape is what makes such a cache possible
// at all — no component turns async, and no useState initialiser has to await:
//
//     const [data] = useState(() => loadMonthData(year, month, lang));
//
// The backing object is read on every call rather than captured once, so a test
// that swaps globalThis.localStorage still works exactly as it did before.

import type { CachedStorage } from './storageCache';
import type { StorageChange } from './storageWrite';

/** The slice of the Storage API the app actually uses. */
export interface StorageLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * The browser's localStorage: the web app's store, and in the native apps the
 * place old test-build data is migrated FROM. Everything else goes through
 * `appStorage` below, never through this directly.
 *
 * READS NEVER THROW; WRITES STILL DO. That split is deliberate.
 *
 * A browser with site data blocked (Safari's "block all cookies", Firefox's
 * strictest mode) throws SecurityError on the very act of touching
 * localStorage — not only on writing to it. Reads happen in useState
 * initialisers, so a throw there is a throw out of React's render and the app
 * mounts NOTHING: a blank white page with no menu to fix it from. Answering
 * "there is nothing stored" is not a lie in that situation, it is the truth,
 * and it degrades to the one thing the app can still honestly be — empty.
 *
 * Writes keep throwing because they have somewhere to report to. safeSetItem
 * turns the throw into a false, and the caller shows the "could not save"
 * banner. Swallowing it here would cost the app the only signal it has that
 * the user's edit did not land.
 */
export const browserStorage: StorageLike = {
  get length() {
    try {
      return globalThis.localStorage.length;
    } catch {
      return 0;
    }
  },
  key(i: number) {
    try {
      return globalThis.localStorage.key(i);
    } catch {
      return null;
    }
  },
  getItem(k: string) {
    try {
      return globalThis.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem(k: string, v: string) {
    globalThis.localStorage.setItem(k, v);
  },
  removeItem(k: string) {
    globalThis.localStorage.removeItem(k);
  },
};

// ── Where appStorage points ────────────────────────────────────────────────
//
// On the web: localStorage, above. In the iOS and Android apps: a cached SQLite
// store, installed by main.tsx BEFORE anything reads (see nativeStorage.ts) —
// the WebView's own localStorage can be cleared by the operating system, and
// on a phone this app's data has no other copy.
//
// Every caller keeps using `appStorage` as before. It is a thin forwarder, so
// the switch happens in one place and the sixty-odd call sites never learn
// which store is underneath.

let active: StorageLike = browserStorage;
let native: CachedStorage | null = null;
/** How many native writes have been refused since startup. */
let refused = 0;

/** Route appStorage through a native store. Called once, at startup, after
 *  the store has been hydrated — never while the app is running. */
export function installStorage(store: CachedStorage): void {
  if (!store.ready) throw new Error('installStorage: hydrate the store first');
  active = store;
  native = store;
  store.onWriteFailed(() => { refused += 1; });
}

/** True in the iOS and Android apps, once their store is installed. */
export const usesNativeStorage = (): boolean => native !== null;

export const appStorage: StorageLike & {
  /** Hand several changes to the native store as one transaction. Returns
   *  false when there is no such store (the web), so the caller falls back to
   *  its own snapshot-and-rollback. See applyStorageChanges. */
  tryApplyBatch(changes: StorageChange[]): boolean;
} = {
  get length() { return active.length; },
  key(i: number) { return active.key(i); },
  getItem(k: string) { return active.getItem(k); },
  setItem(k: string, v: string) { active.setItem(k, v); },
  removeItem(k: string) { active.removeItem(k); },
  tryApplyBatch(changes: StorageChange[]) {
    if (!native) return false;
    native.applyBatch(changes);
    return true;
  },
};

/**
 * Wait until every write has reached the native store. On the web there is
 * nothing to wait for: localStorage writes are done when setItem returns.
 *
 * MUST be awaited before the page reloads (undo, restoring a backup) and
 * before a backup is taken — a reload drops whatever is still queued, and a
 * backup taken early would miss the last edit.
 *
 * Resolves true when no write was refused since `since` (see storageMark), so
 * an action can tell the user it did NOT reach the disk instead of reloading
 * as though it had.
 */
export async function settleStorage(since: number = refused): Promise<boolean> {
  if (native) await native.flush();
  return refused === since;
}

/** A point to measure refusals from: pass it to settleStorage after an action
 *  to learn whether any write made since then was refused. */
export const storageMark = (): number => refused;

/**
 * Hear about writes the native store refused. On the web a refusal throws at
 * the caller, who reports it (safeSetItem); a native write is queued, so its
 * failure arrives later, and this is where it arrives. Returns an unsubscribe.
 */
export function onStorageWriteFailed(listener: (key: string) => void): () => void {
  return native ? native.onWriteFailed(listener) : () => {};
}
