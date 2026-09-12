// ── storage — the one door to persistent storage ───────────────────────────
//
// Everything the app keeps goes through here. Today it is the browser's
// localStorage and nothing else, so this file changes no behaviour at all.
// The point is that there is now ONE place to change.
//
// Why that matters: inside a native app's web view, iOS may EVICT localStorage
// when the device runs short of space. For an app whose only copy of your
// budget lives there, with no server to restore from, that is data loss rather
// than inconvenience. A native build swaps what sits behind this door — Capacitor
// Preferences, which the system does not clear — and the ~60 call sites that
// read and write never learn that anything happened.
//
// Deliberately the SAME SHAPE as localStorage: synchronous getItem/setItem/
// removeItem plus length/key(i). Keeping the shape is what makes that swap a
// rename rather than a rewrite — no component turns async, and no useState
// initialiser has to await anything:
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

/** The app's persistent storage. Use this instead of localStorage directly. */
export const appStorage: StorageLike = {
  get length() {
    return globalThis.localStorage.length;
  },
  key(i: number) {
    return globalThis.localStorage.key(i);
  },
  getItem(k: string) {
    return globalThis.localStorage.getItem(k);
  },
  setItem(k: string, v: string) {
    globalThis.localStorage.setItem(k, v);
  },
  removeItem(k: string) {
    globalThis.localStorage.removeItem(k);
  },
};
