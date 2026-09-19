import { describe, it, expect, beforeEach } from 'vitest';
import { hasRestorableUserData } from './userData';

// ── Review 2026-09-18, F1 ──────────────────────────────────────────────────
//
// The old check looked for a budget month with a POSITIVE TOTAL. A user could
// therefore import months of bank statements, or work entirely in Custom, and
// the app would decide there was nothing to lose — and never ask them to back
// up the only copy that exists. These tests hold the new definition to both
// edges: everything the user made counts, nothing they merely chose does.

class FakeStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

let s: FakeStorage;
beforeEach(() => { s = new FakeStorage(); });
const put = (k: string, v: unknown) => s.setItem(k, JSON.stringify(v));

describe('nothing to protect', () => {
  it('an empty install', () => {
    expect(hasRestorableUserData(s)).toBe(false);
  });

  it('settings are not data', () => {
    // Nagging someone to back up their choice of dark mode would teach them to
    // ignore the banner that matters.
    s.setItem('budget_lang', 'sv');
    s.setItem('budget_currency', 'SEK');
    s.setItem('budget_theme_mode', 'dark');
    s.setItem('budget_period_start_day', '25');
    s.setItem('budget_backup_dismissed', new Date().toISOString());
    s.setItem('budget_welcome_seen', '1');
    expect(hasRestorableUserData(s)).toBe(false);
  });

  it('an untouched month skeleton', () => {
    put('budget_2026_8', { income: [], expenses: [], savings: [] });
    expect(hasRestorableUserData(s)).toBe(false);
  });

  it('unreadable values do not count as data', () => {
    s.setItem('budget_2026_8', '{not json');
    s.setItem('budget_actuals_2026_8', 'nonsense');
    expect(hasRestorableUserData(s)).toBe(false);
  });
});

describe('worth protecting', () => {
  it('imported actuals alone — the case that was missed', () => {
    put('budget_actuals_2026_8', [
      { id: 'a1', date: '2026-08-05', text: 'ICA', amount: 312, categoryId: 'mat' },
    ]);
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('Custom amounts alone', () => {
    put('budget_custom_v3_values_2026_8', { r1: 4200 });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('the Custom structure snapshot alone', () => {
    // Losing it makes stored amounts unreadable even though the money is still
    // on disk — data loss in every way that matters.
    put('budget_custom_v3_meta_2026_8', { v: 1, tags: { r1: 'expense' } });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('a budget the user built but left at zero', () => {
    // Structure counts, not amounts: the row names and the order are the part
    // that took the effort and cannot be retyped from a bank statement.
    put('budget_2026_8', {
      income: [], savings: [],
      expenses: [{ id: 'mat', name: 'Mat', rows: [{ id: 'r1', label: 'ICA', amount: 0 }] }],
    });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('a month whose only content is negative or netted to zero', () => {
    // A positive total was the old signal, and it was the wrong one.
    put('budget_2026_8', {
      income: [{ id: 'i1', label: 'Lön', amount: 1000 }],
      expenses: [{ id: 'mat', name: 'Mat', rows: [{ id: 'r1', label: 'ICA', amount: -1000 }] }],
      savings: [],
    });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('a recorded savings balance', () => {
    put('budget_2026_8', {
      income: [], expenses: [], savings: [], savingsSnapshotRecorded: true,
    });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('a savings goal with no money in it yet', () => {
    put('budget_plan', { goals: [{ id: 'g1', name: 'Resa', targetAmount: 0, currentAmount: 0 }], notes: '' });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('plan notes the user wrote', () => {
    put('budget_plan', { goals: [], notes: 'Spara till bil' });
    expect(hasRestorableUserData(s)).toBe(true);
  });

  it('an empty plan does not count', () => {
    put('budget_plan', { goals: [], notes: '   ' });
    expect(hasRestorableUserData(s)).toBe(false);
  });
});
