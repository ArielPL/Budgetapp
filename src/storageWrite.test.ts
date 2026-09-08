import { describe, it, expect, beforeEach } from 'vitest';
import { safeSetItem } from './storageWrite';
import { saveMonthData, savePlanData, storageKey } from './defaults';
import type { MonthData, PlanData } from './types';

// ── Review 2026-09-05, F4 ──────────────────────────────────────────────────
//
// Every save went straight to localStorage.setItem. A refused write threw out
// of the save effect while the app carried on showing the edit as though it had
// been kept — the screen and the disk disagreed and nothing said so.
//
// A refusal is not exotic: a full quota, Safari in private mode, or a browser
// with site data blocked. What matters is that the save path REPORTS it.

class FakeStorage {
  private map = new Map<string, string>();
  /** Throw on every write of this key, modelling storage that stays refused
   *  until the user frees space — which is when "try again" has to work. */
  failOnKey: string | null = null;
  /** What to throw. Different browsers throw different things for the same
   *  situation, and the save path must not care which. */
  error: unknown = new DOMException('QuotaExceededError');

  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k === this.failOnKey) throw this.error;
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const month = (amount: number): MonthData => ({
  income: [{ id: 'i1', label: 'Lön', amount }],
  expenses: [],
  savings: [],
});
const plan = (): PlanData => ({ goals: [], notes: 'x' });
const KEY = storageKey(2026, 8);

describe('safeSetItem', () => {
  let store: FakeStorage;
  beforeEach(() => { store = new FakeStorage(); });

  it('writes and reports success', () => {
    expect(safeSetItem(store, 'k', 'v')).toBe(true);
    expect(store.getItem('k')).toBe('v');
  });

  it('reports failure instead of throwing', () => {
    store.failOnKey = 'k';
    expect(() => safeSetItem(store, 'k', 'v')).not.toThrow();
    expect(safeSetItem(store, 'k', 'v')).toBe(false);
  });

  it('treats every kind of refusal the same', () => {
    // Only the outcome matters to the user: the change was not stored.
    for (const err of [
      new DOMException('QuotaExceededError'),
      new DOMException('SecurityError'),
      new Error('storage disabled'),
      'a string, because engines are not obliged to throw Errors',
    ]) {
      store.failOnKey = 'k';
      store.error = err;
      expect(safeSetItem(store, 'k', 'v')).toBe(false);
    }
  });

  it('leaves other keys writable', () => {
    store.failOnKey = 'blocked';
    expect(safeSetItem(store, 'blocked', 'v')).toBe(false);
    expect(safeSetItem(store, 'fine', 'v')).toBe(true);
  });
});

describe('the save paths report a refused write', () => {
  let store: FakeStorage;
  beforeEach(() => {
    store = new FakeStorage();
    globalThis.localStorage = store as unknown as Storage;
  });

  it('saveMonthData returns false when storage refuses', () => {
    store.failOnKey = KEY;
    expect(saveMonthData(2026, 8, month(30000))).toBe(false);
  });

  it('saveMonthData returns true when it lands', () => {
    expect(saveMonthData(2026, 8, month(30000))).toBe(true);
    expect(store.getItem(KEY)).not.toBeNull();
  });

  it('reports success for a month it deliberately does not write', () => {
    // An untouched empty month is skipped on purpose. That is not a failure,
    // and reporting it as one would put a "could not save" banner on screen
    // for someone who has simply not typed anything yet.
    expect(saveMonthData(2026, 8, { income: [], expenses: [], savings: [] })).toBe(true);
  });

  it('savePlanData returns false when storage refuses', () => {
    store.failOnKey = 'budget_plan';
    expect(savePlanData(plan())).toBe(false);
  });

  it('succeeds again once storage recovers, so retry works', () => {
    store.failOnKey = KEY;
    expect(saveMonthData(2026, 8, month(30000))).toBe(false);
    store.failOnKey = null;              // the user freed some space
    expect(saveMonthData(2026, 8, month(30000))).toBe(true);
    expect(JSON.parse(store.getItem(KEY)!).income[0].amount).toBe(30000);
  });

  it('does not damage what was already stored when a write fails', () => {
    expect(saveMonthData(2026, 8, month(30000))).toBe(true);
    store.failOnKey = KEY;
    expect(saveMonthData(2026, 8, month(99999))).toBe(false);
    // The previous month record is still intact and readable.
    expect(JSON.parse(store.getItem(KEY)!).income[0].amount).toBe(30000);
  });
});
