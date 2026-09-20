// ── storage — the one door to persistent storage ───────────────────────────
//
// Everything the app keeps goes through here. Today it is the browser's
// localStorage and nothing else, so this file changes no behaviour at all.
// The point is that there is now ONE place to change.
//
// Why that matters: inside a native app's web view, iOS may EVICT localStorage
// when the device runs short of space. For an app whose only copy of your
// budget lives there, with no server to restore from, that is data loss rather
// than inconvenience. A native build wants something the system does not clear,
// such as Capacitor Preferences, and this door is the one place that has to know.
//
// Be honest about what that swap costs. Capacitor Preferences is ASYNC, so it
// cannot simply be dropped in behind these synchronous methods — that would be a
// rewrite, not a rename. What a native build needs is a layer that reads every
// key ONCE at startup, answers reads from that in-memory copy, and pushes writes
// onto an explicit queue. Then the ~60 call sites keep working unchanged, but the
// app has to wait for the first load and has to handle a native write that fails
// or is refused. Plan that work; do not budget an afternoon for it.
//
// Deliberately the SAME SHAPE as localStorage: synchronous getItem/setItem/
// removeItem plus length/key(i). That shape is what makes such a cache possible
// at all — no component turns async, and no useState initialiser has to await:
//
//     const [data] = useState(() => loadMonthData(year, month, lang));
//
// The backing object is read on every call rather than captured once, so a test
// that swaps globalThis.localStorage still works exactly as it did before.

/** The slice of the Storage API the app actually uses. */
export interface StorageLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * The app's persistent storage. Use this instead of localStorage directly.
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
export const appStorage: StorageLike = {
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
