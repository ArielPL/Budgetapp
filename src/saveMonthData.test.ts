import { describe, it, expect, beforeEach } from 'vitest';
import { saveMonthData, storageKey } from './defaults';
import type { MonthData } from './types';

// saveMonthData refuses to CREATE a key for a month with nothing in it, so
// browsing through the year doesn't litter localStorage with blank records.
//
// That guard silently ate the pay-period label: on an otherwise untouched month
// the label was the ONLY content, so the write was skipped. It looked like it
// worked — the text sat there in the UI — and it was gone after a reload. The
// unit tests never saw it, because the label logic itself was perfectly
// correct; the fault was where it met an older optimisation. Hence this file.

class FakeStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const empty = (): MonthData => ({ income: [], expenses: [], savings: [] });
const KEY = storageKey(2026, 0);

describe('saveMonthData — what counts as an empty month', () => {
  let store: FakeStorage;
  beforeEach(() => {
    store = new FakeStorage();
    globalThis.localStorage = store as unknown as Storage;
  });

  it('does not create a record for a month with nothing in it', () => {
    saveMonthData(2026, 0, empty());
    expect(store.getItem(KEY)).toBeNull();
  });

  it('creates one for a month carrying only a period label', () => {
    // The label IS the content here. This is the case that used to vanish.
    saveMonthData(2026, 0, { ...empty(), periodLabel: 'Lönevecka 34' });
    expect(JSON.parse(store.getItem(KEY)!).periodLabel).toBe('Lönevecka 34');
  });

  it('creates one as soon as there is a row', () => {
    saveMonthData(2026, 0, {
      ...empty(), income: [{ id: 'i1', label: 'Lön', amount: 30000 }],
    });
    expect(store.getItem(KEY)).not.toBeNull();
  });

  it('still updates a month that already exists, even when emptied', () => {
    // Clearing a month has to persist — otherwise the old contents come back.
    saveMonthData(2026, 0, { ...empty(), periodLabel: 'x' });
    saveMonthData(2026, 0, empty());
    const stored = JSON.parse(store.getItem(KEY)!);
    expect(stored.periodLabel).toBeUndefined();
    expect(stored.income).toEqual([]);
  });

  it('treats a blank label as no label', () => {
    saveMonthData(2026, 0, { ...empty(), periodLabel: '' });
    expect(store.getItem(KEY)).toBeNull();
  });
});
