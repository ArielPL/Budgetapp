import { describe, it, expect } from 'vitest';
import type { MonthData } from '../types';
import type { StorageLike } from '../storage';
import { memory } from '../test-fixtures/memoryStorage';
import { CATEGORY_RULES_KEY } from '../categorise';
import { aiChangeOf, planAddRow, planMove, planSetAmount } from './changes';
import { checkCall } from './checks';

// Synthetic values only.

const month = (food: number, extra: Array<{ id: string; label: string; amount: number }> = []): MonthData => ({
  income: [{ id: 'lon', label: 'Lön', amount: 30000 }],
  expenses: [
    { id: 'mat', name: 'Mat & dryck', icon: '•', color: '#888', rows: [{ id: 'matvaror', label: 'Matvaror', amount: food }, ...extra] },
    { id: 'boende', name: 'Boende', icon: '•', color: '#888', rows: [{ id: 'hyra', label: 'Hyra', amount: 9000 }] },
  ],
  savings: [],
});

const OCT = { year: 2026, month: 9 };
const seed = () => memory({
  budget_2026_8: JSON.stringify(month(4000)),
  budget_2026_9: JSON.stringify(month(4000)),
  budget_2026_10: JSON.stringify(month(4000)),
  // December was built by hand: same name, another id.
  budget_2026_11: JSON.stringify({ ...month(0), expenses: [{ ...month(0).expenses[0], rows: [{ id: 'x', label: 'matvaror', amount: 4200 }] }, month(0).expenses[1]] }),
  budget_actuals_2026_8: JSON.stringify([
    { id: 'a', date: '2026-09-02', text: 'SYNT SPOTIFY AB', amount: 119, direction: 'out', categoryId: 'fritid' },
    { id: 'b', date: '2026-09-05', text: 'SYNT ICA', amount: 300, direction: 'out', categoryId: 'mat' },
  ]),
  budget_actuals_2026_9: JSON.stringify([
    { id: 'c', date: '2026-10-02', text: 'SYNT SPOTIFY AB', amount: 119, direction: 'out', categoryId: 'fritid' },
    { id: 'd', date: '2026-10-03', text: 'SYNT Spotify refund', amount: 19, direction: 'in', categoryId: 'fritid' },
    { id: 'e', date: '2026-10-04', text: 'SYNT SPOTIFY transfer', amount: 50, direction: 'out', categoryId: '__transfer__' },
  ]),
});

const food = (s: StorageLike, key: string) =>
  (JSON.parse(s.getItem(key)!) as MonthData).expenses[0].rows.map(r => r.amount);

const apply = (s: StorageLike, changes: { key: string; value: string | null }[]) => {
  for (const c of changes) if (c.value === null) s.removeItem(c.key); else s.setItem(c.key, c.value);
};

describe('planSetAmount', () => {
  it('only this month: one write, nothing else touched', () => {
    const s = seed();
    const plan = planSetAmount(s, OCT, null, 'mat', 'matvaror', 3500, 'month')!;
    expect(plan.months).toEqual([OCT]);
    apply(s, plan.changes);
    expect(food(s, 'budget_2026_9')).toEqual([3500]);
    expect(food(s, 'budget_2026_8')).toEqual([4000]);
    expect(food(s, 'budget_2026_10')).toEqual([4000]);
  });

  it('this month and later: later stored months, by id or else by name, never earlier ones', () => {
    const s = seed();
    const plan = planSetAmount(s, OCT, null, 'mat', 'matvaror', 3500, 'later')!;
    expect(plan.months).toEqual([OCT, { year: 2026, month: 10 }, { year: 2026, month: 11 }]);
    apply(s, plan.changes);
    expect(food(s, 'budget_2026_10')).toEqual([3500]);
    expect(food(s, 'budget_2026_11')).toEqual([3500]);
    expect(food(s, 'budget_2026_8')).toEqual([4000]);
  });

  it('starts from the screen\'s copy, so an unsaved edit there is kept', () => {
    const s = seed();
    const screen = { at: OCT, data: month(4000, [{ id: 'ny', label: 'Kaffe', amount: 150 }]) };
    const plan = planSetAmount(s, OCT, screen, 'mat', 'matvaror', 3500, 'month')!;
    apply(s, plan.changes);
    expect(food(s, 'budget_2026_9')).toEqual([3500, 150]);
  });

  it('nothing to write when the amount is already that', () => {
    expect(planSetAmount(seed(), OCT, null, 'mat', 'matvaror', 4000, 'month')!.changes).toEqual([]);
    expect(planSetAmount(seed(), OCT, null, 'mat', 'saknas', 1, 'month')).toBeNull();
  });
});

describe('planAddRow', () => {
  it('adds the row with one id, in this month or this month and later', () => {
    const s = seed();
    apply(s, planAddRow(s, OCT, null, 'mat', 'Kattmat', 200, 'later', 'kattmat')!.changes);
    for (const key of ['budget_2026_9', 'budget_2026_10', 'budget_2026_11']) {
      expect((JSON.parse(s.getItem(key)!) as MonthData).expenses[0].rows.at(-1)).toEqual(
        { id: 'kattmat', label: 'Kattmat', amount: 200, isCustom: true, userNamed: true });
    }
    expect(food(s, 'budget_2026_8')).toEqual([4000]);
  });

  it('not when this month lacks the category', () => {
    expect(planAddRow(seed(), OCT, null, 'hund', 'Foder', 300, 'month', 'f')).toBeNull();
  });
});

describe('planMove', () => {
  it('moves old purchases, keeps money in and transfers, and teaches the sorting', () => {
    const s = seed();
    const plan = planMove(s, 'spotify', 'prenumerationer')!;
    // Two purchases and a refund; the transfer stays where it is.
    expect(plan.count).toBe(3);
    expect(plan.amount).toBe(119 + 119 - 19);
    apply(s, plan.changes);
    const oct = JSON.parse(s.getItem('budget_actuals_2026_9')!);
    expect(oct.map((e: { categoryId: string }) => e.categoryId)).toEqual(['prenumerationer', 'prenumerationer', '__transfer__']);
    expect(JSON.parse(s.getItem('budget_actuals_2026_8')!)[1].categoryId).toBe('mat');
    expect(Object.values(JSON.parse(s.getItem(CATEGORY_RULES_KEY)!))).toEqual(['prenumerationer', 'prenumerationer']);
  });

  it('finds nothing, and writes nothing, for a place never bought from', () => {
    expect(planMove(seed(), 'Systembolaget', 'mat')).toMatchObject({ count: 0, changes: [] });
    expect(planMove(seed(), 's', 'mat')).toBeNull();
  });
});

describe('aiChangeOf', () => {
  const ctx = { budget: month(4000), goals: [], wallets: [], question: '', now: OCT };
  it('turns a checked proposal into a change, and nothing else', () => {
    expect(aiChangeOf(checkCall({ name: 'propose_set_amount', args: { category: 'mat', row: 'Matvaror', amount: 3500 } }, ctx)))
      .toEqual({ kind: 'setAmount', categoryId: 'mat', rowId: 'matvaror', amount: 3500 });
    expect(aiChangeOf(checkCall({ name: 'propose_add_row', args: { category: 'mat', label: 'Kattmat', amount: 200 } }, ctx)))
      .toEqual({ kind: 'addRow', categoryId: 'mat', label: 'Kattmat', amount: 200 });
    expect(aiChangeOf(checkCall({ name: 'propose_recategorize', args: { place: 'Spotify', category: 'boende' } }, ctx)))
      .toEqual({ kind: 'move', place: 'Spotify', categoryId: 'boende' });
    expect(aiChangeOf(checkCall({ name: 'what_if', args: { target: 'mat', change: 100 } }, ctx))).toBeNull();
    expect(aiChangeOf(checkCall({ name: 'propose_add_row', args: { category: 'rymd', label: 'X', amount: 1 } }, ctx))).toBeNull();
  });
});
