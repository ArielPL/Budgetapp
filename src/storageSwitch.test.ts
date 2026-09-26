import { describe, it, expect } from 'vitest';
import {
  appStorage, installStorage, settleStorage, storageMark, onStorageWriteFailed, usesNativeStorage,
} from './storage';
import { createCachedStorage, type AsyncBackend } from './storageCache';
import { applyStorageChanges, safeSetItem } from './storageWrite';

// ── appStorage, once a native store is installed ────────────────────────────
//
// The iOS and Android apps install a SQLite-backed store at startup; every
// caller keeps using appStorage. These check the switch itself, in a module
// of its own because the installed store is process-wide state.

const backend = () => {
  const disk = new Map<string, string>();
  let refuse: string | null = null;
  const b: AsyncBackend & { disk: Map<string, string>; refuse(k: string | null): void } = {
    disk,
    refuse(k) { refuse = k; },
    async loadAll() { return Object.fromEntries(disk); },
    async write(k, v) { if (k === refuse) throw new Error('refused'); disk.set(k, v); },
    async remove(k) { disk.delete(k); },
    async commit(changes) {
      if (changes.some(c => c.key === refuse)) throw new Error('refused');
      for (const c of changes) {
        if (c.value === null) disk.delete(c.key); else disk.set(c.key, c.value);
      }
    },
  };
  return b;
};

// One backend for the whole file: the store installed below stays installed.
const b = backend();

describe('switching appStorage to the native store', () => {
  it('refuses a store that has not been read yet — it would look empty', () => {
    expect(() => installStorage(createCachedStorage(backend()))).toThrow();
    expect(usesNativeStorage()).toBe(false);
  });

  it('routes every read and write through it once installed', async () => {
    b.disk.set('budget_lang', 'es');
    const store = createCachedStorage(b);
    await store.hydrate();
    installStorage(store);

    expect(usesNativeStorage()).toBe(true);
    expect(appStorage.getItem('budget_lang')).toBe('es');
    appStorage.setItem('budget_2026_8', '{}');
    expect(await settleStorage()).toBe(true);
    expect(b.disk.get('budget_2026_8')).toBe('{}');
  });

  it('hands a multi-key change to the store as one batch', async () => {
    expect(applyStorageChanges(appStorage, [
      { key: 'budget_2026_9', value: 'oct' }, { key: 'budget_2026_8', value: null },
    ])).toBe(true);
    await settleStorage();
    expect(appStorage.getItem('budget_2026_9')).toBe('oct');
    expect(appStorage.getItem('budget_2026_8')).toBeNull();
  });

  it('reports a refused write — the one thing a queued write could hide', async () => {
    const heard: string[] = [];
    const stop = onStorageWriteFailed(k => heard.push(k));
    b.refuse('budget_refused');
    const mark = storageMark();
    // safeSetItem cannot know yet: the write is only queued, so it says true…
    expect(safeSetItem(appStorage, 'budget_refused', 'x')).toBe(true);
    // …and settleStorage is where the truth arrives.
    expect(await settleStorage(mark)).toBe(false);
    stop();
    b.refuse(null);
    expect(heard).toEqual(['budget_refused']);
    expect(b.disk.has('budget_refused')).toBe(false);
  });

  it('says all is well again once writes land', async () => {
    const mark = storageMark();
    appStorage.setItem('budget_ok', '1');
    expect(await settleStorage(mark)).toBe(true);
  });
});
