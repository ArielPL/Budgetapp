import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCachedStorage, backendFromSync, type AsyncBackend } from './storageCache';

// ── What this has to survive when the backend goes async ───────────────────
//
// The app reads storage synchronously in sixty-three places because React's
// useState initialisers cannot await. Native storage is asynchronous. These
// tests pin the three things that would otherwise break quietly:
// ordering, another tab's writes, and a refused write.

class FakeStore {
  map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

/** A FakeStore that already holds something, as a device would. */
function seeded(entries: Record<string, string>): FakeStore {
  const store = new FakeStore();
  for (const [k, v] of Object.entries(entries)) store.setItem(k, v);
  return store;
}

/** A backend that resolves only when told to, so ordering can be observed. */
function controllable() {
  const landed: string[] = [];
  const gates: (() => void)[] = [];
  const backend: AsyncBackend = {
    async loadAll() { return {}; },
    write(key, value) {
      return new Promise<void>(resolve => {
        gates.push(() => { landed.push(`${key}=${value}`); resolve(); });
      });
    },
    remove(key) {
      return new Promise<void>(resolve => {
        gates.push(() => { landed.push(`-${key}`); resolve(); });
      });
    },
  };
  // The queue starts a job on a microtask, so a gate does not exist the
  // instant setItem returns. Waiting for one is the difference between
  // observing the order and hanging forever.
  const releaseNext = async () => {
    for (let i = 0; i < 50 && gates.length === 0; i++) await Promise.resolve();
    gates.shift()?.();
  };
  return { backend, landed, releaseNext };
}

let store: FakeStore;
beforeEach(() => { store = new FakeStore(); });

describe('reads are synchronous even though the store is not', () => {
  it('answers a read from the value just written, before it has landed', async () => {
    const { backend, landed } = controllable();
    const s = createCachedStorage(backend);
    s.setItem('budget_lang', 'sv');
    // Nothing has reached the backend yet — and the app cannot wait.
    expect(landed).toEqual([]);
    expect(s.getItem('budget_lang')).toBe('sv');
  });

  it('reads what hydrate loaded', async () => {
    store.setItem('budget_2026_8', '{"income":[]}');
    const s = createCachedStorage(backendFromSync(store));
    expect(s.ready).toBe(false);
    await s.hydrate();
    expect(s.ready).toBe(true);
    expect(s.getItem('budget_2026_8')).toBe('{"income":[]}');
  });

  it('before hydrate it looks like an empty device — which is why the app must wait', () => {
    store.setItem('budget_2026_8', '{"income":[]}');
    const s = createCachedStorage(backendFromSync(store));
    // Rendering here would meet a user with months of data and show them the
    // first-run introduction. hydrate() is not optional.
    expect(s.getItem('budget_2026_8')).toBeNull();
  });

  it('keeps writes made during hydrate, because they are newer than the disk', async () => {
    store.setItem('budget_lang', 'en');
    const s = createCachedStorage(backendFromSync(store));
    const loading = s.hydrate();
    s.setItem('budget_lang', 'sv');
    await loading;
    expect(s.getItem('budget_lang')).toBe('sv');
  });

  it('removes, counts and enumerates like a Storage', async () => {
    const s = createCachedStorage(backendFromSync(store));
    s.setItem('a', '1');
    s.setItem('b', '2');
    expect(s.length).toBe(2);
    expect([s.key(0), s.key(1), s.key(2)]).toEqual(['a', 'b', null]);
    s.removeItem('a');
    expect(s.length).toBe(1);
    expect(s.getItem('a')).toBeNull();
  });
});

describe('writes land in the order they were made', () => {
  it('two writes to the same key arrive oldest first', async () => {
    const { backend, landed, releaseNext } = controllable();
    const s = createCachedStorage(backend);
    s.setItem('budget_2026_8', 'first');
    s.setItem('budget_2026_8', 'second');

    await releaseNext();
    await releaseNext();
    await s.flush();

    // If these arrived the other way round the older edit would win on disk
    // and the user would lose the newer one with no error anywhere.
    expect(landed).toEqual(['budget_2026_8=first', 'budget_2026_8=second']);
  });

  it('a write to one month cannot overtake an earlier write to another', async () => {
    const { backend, landed, releaseNext } = controllable();
    const s = createCachedStorage(backend);
    s.setItem('budget_2026_7', 'august');
    s.setItem('budget_2026_8', 'september');

    await releaseNext();
    await releaseNext();
    await s.flush();

    expect(landed).toEqual(['budget_2026_7=august', 'budget_2026_8=september']);
  });

  it('reports how many writes are still waiting', async () => {
    const { backend, releaseNext } = controllable();
    const s = createCachedStorage(backend);
    s.setItem('a', '1');
    s.setItem('b', '2');
    expect(s.pending).toBe(2);
    await releaseNext();
    await releaseNext();
    await s.flush();
    expect(s.pending).toBe(0);
  });
});

describe('another tab is still visible', () => {
  it('adopts an outside write instead of answering with its own copy', async () => {
    // Follow-up detects a second tab by reading storage and comparing against
    // a baseline. A cache that never hears about outside writes answers stale
    // and that detection silently stops working.
    const s = createCachedStorage(backendFromSync(store));
    await s.hydrate();
    s.setItem('budget_2026_8', 'mine');

    s.adoptExternal('budget_2026_8', 'theirs');
    expect(s.getItem('budget_2026_8')).toBe('theirs');
  });

  it('adopts an outside removal', async () => {
    const s = createCachedStorage(backendFromSync(store));
    s.setItem('budget_2026_8', 'mine');
    s.adoptExternal('budget_2026_8', null);
    expect(s.getItem('budget_2026_8')).toBeNull();
  });

  it('does not write an adopted value back out', async () => {
    // An echo would bounce between tabs forever — the same trap crossTab.ts
    // records in its own comments.
    const { backend, landed } = controllable();
    const s = createCachedStorage(backend);
    s.adoptExternal('budget_2026_8', 'theirs');
    expect(landed).toEqual([]);
    expect(s.pending).toBe(0);
  });
});

describe('a refused write is reported, not swallowed', () => {
  it('tells a listener which key failed', async () => {
    const backend: AsyncBackend = {
      async loadAll() { return {}; },
      async write(key) { throw new Error(`quota: ${key}`); },
      async remove() {},
    };
    const s = createCachedStorage(backend);
    const heard: string[] = [];
    s.onWriteFailed(k => heard.push(k));

    s.setItem('budget_2026_8', 'x');
    await s.flush();

    // Synchronous storage throws and safeSetItem catches it. A queue has
    // nobody left to throw at, so this is the only way the app can still tell
    // the user their edit is on screen and not on disk.
    expect(heard).toEqual(['budget_2026_8']);
  });

  it('one failed write does not stop the ones behind it', async () => {
    let n = 0;
    const landed: string[] = [];
    const backend: AsyncBackend = {
      async loadAll() { return {}; },
      async write(key, value) {
        n += 1;
        if (n === 1) throw new Error('quota');
        landed.push(`${key}=${value}`);
      },
      async remove() {},
    };
    const s = createCachedStorage(backend);
    s.setItem('a', '1');
    s.setItem('b', '2');
    await s.flush();
    expect(landed).toEqual(['b=2']);
  });

  it('a listener can be removed', async () => {
    const backend: AsyncBackend = {
      async loadAll() { return {}; },
      async write() { throw new Error('no'); },
      async remove() {},
    };
    const s = createCachedStorage(backend);
    const listener = vi.fn();
    const off = s.onWriteFailed(listener);
    off();
    s.setItem('a', '1');
    await s.flush();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('it behaves like the storage it replaces', () => {
  it('round-trips through a synchronous store unchanged', async () => {
    const s = createCachedStorage(backendFromSync(store));
    await s.hydrate();
    s.setItem('budget_lang', 'sv');
    s.setItem('budget_2026_8', '{"income":[]}');
    s.removeItem('budget_lang');
    await s.flush();

    expect(store.getItem('budget_lang')).toBeNull();
    expect(store.getItem('budget_2026_8')).toBe('{"income":[]}');
  });
});

// ── Buggy sweep 2026-09-19, finding 21 ─────────────────────────────────────

describe('a removal made before hydrate survives it', () => {
  it('does not resurrect a key that was deleted while loading', async () => {
    // The cache cannot express "deleted" by absence alone: hydrate merged what
    // was IN the cache over what came off disk, so a removal had nothing to
    // merge and the stored value came back. The queued remove still ran, so a
    // read answered with a key the user had deleted and it disappeared at the
    // next launch instead.
    const backend = backendFromSync(seeded({ budget_lang: 'sv', budget_currency: 'sek' }));
    const store = createCachedStorage(backend);

    store.removeItem('budget_lang');
    await store.hydrate();

    expect(store.getItem('budget_lang')).toBeNull();
    expect(store.getItem('budget_currency')).toBe('sek');

    await store.flush();
    // And the backend agrees, so a reload shows the same thing.
    expect((await backend.loadAll()).budget_lang).toBeUndefined();
  });

  it('a key removed and then written again before hydrate keeps the new value', async () => {
    const backend = backendFromSync(seeded({ budget_lang: 'sv' }));
    const store = createCachedStorage(backend);

    store.removeItem('budget_lang');
    store.setItem('budget_lang', 'es');
    await store.hydrate();

    expect(store.getItem('budget_lang')).toBe('es');
    await store.flush();
    expect((await backend.loadAll()).budget_lang).toBe('es');
  });

  it('a removal AFTER hydrate still works', async () => {
    const backend = backendFromSync(seeded({ budget_lang: 'sv' }));
    const store = createCachedStorage(backend);
    await store.hydrate();

    store.removeItem('budget_lang');
    expect(store.getItem('budget_lang')).toBeNull();
    await store.flush();
    expect((await backend.loadAll()).budget_lang).toBeUndefined();
  });
});
