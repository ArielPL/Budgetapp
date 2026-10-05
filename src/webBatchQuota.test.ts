// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { appStorage, hasUnsavedChanges, retryUnsavedChanges } from './storage';
import { applyStorageChanges, commitStorageChangesOutcome } from './storageWrite';
import { applyBackup, checkBackup, importErrorText, BACKUP_VERSION } from './backup';
import { translations } from './i18n';

// ── A several-key change on the web, against a full browser (Codex,
// 2026-09-29) ───────────────────────────────────────────────────────────────
//
// On the web a several-key change is written key by key and rolled back if
// one is refused. With a real storage QUOTA the rollback itself can be
// refused: putting a key back needs room another key of the same change is
// still taking up. It then answered false — "nothing changed" — while keys
// had changed, and nothing counted as unsaved.
//
// These run against a Storage with a hard size limit, installed as the
// browser's localStorage, so they go through the same appStorage door as the
// app.

/** A Storage that refuses any write taking it past `limit` characters of
 *  values, as a full browser throws QuotaExceededError. */
class QuotaStorage {
  map = new Map<string, string>();
  limit: number;
  constructor(limit: number) { this.limit = limit; }
  used() { let n = 0; for (const v of this.map.values()) n += v.length; return n; }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) {
    const after = this.used() - (this.map.get(k)?.length ?? 0) + v.length;
    if (after > this.limit) throw new DOMException('full', 'QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

let store: QuotaStorage;
beforeEach(() => {
  store = new QuotaStorage(100);
  vi.stubGlobal('localStorage', store);
});
afterEach(() => { vi.unstubAllGlobals(); });

const X = 'budget_2026_7';
const Y = 'budget_2026_8';
const Z = 'budget_2026_9';

describe('a refused several-key change on a full browser', () => {
  it('puts every key back, freeing room before it needs room', async () => {
    store.map.set(X, 'x'.repeat(60));
    // Remove X (frees 60), write Y (takes 50), write Z (needs 60: refused).
    // Putting X back needs 60 while Y still holds 50 — refused, unless Y is
    // put back (removed) first.
    const outcome = await commitStorageChangesOutcome(appStorage, [
      { key: X, value: null }, { key: Y, value: 'y'.repeat(50) }, { key: Z, value: 'z'.repeat(60) },
    ]);
    expect(outcome).toBe('unchanged');
    expect(store.getItem(X)).toBe('x'.repeat(60));
    expect(store.getItem(Y)).toBeNull();
    expect(store.getItem(Z)).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('says so — never "unchanged" — when a key cannot be put back, and keeps it for Try again', async () => {
    store.map.set(X, 'x'.repeat(60));
    // Another tab fills the room the moment X has been shrunk, so X can no
    // longer grow back.
    const setItem = store.setItem.bind(store);
    let filled = false;
    vi.spyOn(store, 'setItem').mockImplementation((k: string, v: string) => {
      setItem(k, v);
      if (k === X && !filled) { filled = true; store.map.set('other_tab', 'o'.repeat(85)); }
    });
    const outcome = await commitStorageChangesOutcome(appStorage, [
      { key: X, value: 'x'.repeat(10) }, { key: Z, value: 'z'.repeat(20) },
    ]);
    expect(outcome).toBe('partial');
    expect(store.getItem(X)).toBe('x'.repeat(10));
    // What the screen still shows is the old X: that is what is unsaved.
    expect(hasUnsavedChanges()).toBe(true);
    expect(applyStorageChanges(appStorage, [])).toBe(true);

    // Room again: Try again puts the old X back.
    store.map.delete('other_tab');
    expect(await retryUnsavedChanges()).toBe(true);
    expect(store.getItem(X)).toBe('x'.repeat(60));
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('keeps an earlier, unrelated refusal as it was', async () => {
    // A refused ordinary edit to another key first…
    store.map.set('filler', 'f'.repeat(95));
    expect(() => appStorage.setItem('budget_lang', 'en-long-value')).toThrow();
    expect(hasUnsavedChanges()).toBe(true);
    store.map.delete('filler');
    // …then a several-key change that is refused and fully rolled back.
    store.map.set(X, 'x'.repeat(60));
    expect(await commitStorageChangesOutcome(appStorage, [
      { key: X, value: null }, { key: Y, value: 'y'.repeat(50) }, { key: Z, value: 'z'.repeat(60) },
    ])).toBe('unchanged');
    // The earlier refusal is still there to try again.
    expect(hasUnsavedChanges()).toBe(true);
    expect(await retryUnsavedChanges()).toBe(true);
    expect(store.getItem('budget_lang')).toBe('en-long-value');
  });

  it('a restore that cannot be fully taken back is not called "unchanged"', async () => {
    store.limit = 400;
    const month = (n: number) => JSON.stringify({ income: [{ id: 'i', label: 'L', amount: n }], expenses: [], savings: [] });
    // What is stored now is LARGER than the file's version of it, so putting
    // it back needs room.
    const original = JSON.stringify({ income: [{ id: 'i', label: 'L'.repeat(120), amount: 1 }], expenses: [], savings: [] });
    store.map.set(X, original);
    const setItem = store.setItem.bind(store);
    let filled = false;
    vi.spyOn(store, 'setItem').mockImplementation((k: string, v: string) => {
      setItem(k, v);
      // Another tab fills the room as soon as the restore has written a key.
      if (!filled) { filled = true; store.map.set('other_tab', 'o'.repeat(store.limit - store.used())); }
    });
    const check = checkBackup(JSON.stringify({
      app: 'budget', version: BACKUP_VERSION, exportedAt: '2026-09-29T00:00:00.000Z',
      data: { [X]: month(22), [Y]: month(33) },
    }));
    if (!check.ok) throw new Error('fixture');
    const result = await applyBackup(appStorage, check.payload);
    expect(result).toMatchObject({ ok: false, reason: 'write-partial' });
    const sv = translations.sv;
    expect(importErrorText('write-partial', sv)).toBe(sv.changePartlySaved);
    expect(hasUnsavedChanges()).toBe(true);
    store.map.delete('other_tab');
    expect(await retryUnsavedChanges()).toBe(true);
    expect(store.getItem(X)).toBe(original);
  });
});
