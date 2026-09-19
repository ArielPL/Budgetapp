// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appStorage } from './storage';

// ── The neutral step ───────────────────────────────────────────────────────
//
// appStorage exists so that a native build can change WHAT the app saves into
// without touching the sixty places that save. Right now it must be
// indistinguishable from localStorage — that is the whole point of this step,
// and these tests are what say so.
//
// The one behaviour worth pinning down is that the backing object is read on
// every call rather than captured when the module loads. Several suites swap
// globalThis.localStorage for a fake, and they must keep working untouched.

const real = globalThis.localStorage;
afterEach(() => { globalThis.localStorage = real; });
beforeEach(() => { globalThis.localStorage = real; localStorage.clear(); });

describe('appStorage mirrors localStorage', () => {
  it('reads back what it wrote', () => {
    appStorage.setItem('budget_lang', 'sv');
    expect(appStorage.getItem('budget_lang')).toBe('sv');
    expect(localStorage.getItem('budget_lang')).toBe('sv');
  });

  it('writes where localStorage can see them, and vice versa', () => {
    // The two must not drift apart while both are in use during the migration.
    localStorage.setItem('budget_currency', 'eur');
    expect(appStorage.getItem('budget_currency')).toBe('eur');
  });

  it('returns null for a key that was never set', () => {
    expect(appStorage.getItem('budget_nothing')).toBeNull();
  });

  it('removes', () => {
    appStorage.setItem('budget_lang', 'sv');
    appStorage.removeItem('budget_lang');
    expect(appStorage.getItem('budget_lang')).toBeNull();
  });

  it('supports iteration by index, which the app relies on', () => {
    // App.tsx walks every budget_<year>_<month> key this way, backup collects
    // keys this way, and the Custom snapshot migration does too. A backing
    // store that lacks length/key would break all three silently.
    appStorage.setItem('budget_2026_7', '{}');
    appStorage.setItem('budget_2026_8', '{}');
    const seen: string[] = [];
    for (let i = 0; i < appStorage.length; i++) {
      const k = appStorage.key(i);
      if (k) seen.push(k);
    }
    expect(seen.sort()).toEqual(['budget_2026_7', 'budget_2026_8']);
  });

  it('reports length', () => {
    expect(appStorage.length).toBe(0);
    appStorage.setItem('a', '1');
    expect(appStorage.length).toBe(1);
  });
});

describe('the backing store is read on every call', () => {
  it('follows a swapped globalThis.localStorage', () => {
    // Not a curiosity: saveMonthData, copyGuard, backup and storageWrite tests
    // all swap the global. If appStorage captured it at import time they would
    // read the real browser storage instead of the fake and quietly pass.
    const fake = new Map<string, string>();
    globalThis.localStorage = {
      get length() { return fake.size; },
      key: (i: number) => [...fake.keys()][i] ?? null,
      getItem: (k: string) => fake.get(k) ?? null,
      setItem: (k: string, v: string) => { fake.set(k, v); },
      removeItem: (k: string) => { fake.delete(k); },
      clear: () => fake.clear(),
    } as unknown as Storage;

    appStorage.setItem('budget_lang', 'es');
    expect(fake.get('budget_lang')).toBe('es');
    expect(appStorage.getItem('budget_lang')).toBe('es');
  });
});
