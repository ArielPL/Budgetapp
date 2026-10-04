import { describe, it, expect } from 'vitest';
import type { ActualEntry, MonthData, SavingsGoal } from './types';
import {
  basisOf, categoryOverMonths, recurringPayments, biggestRises, perDayLeft, budgetKept, goalForecasts,
  type MonthEntries,
} from './questions';

// Synthetic values only.

let n = 0;
const e = (date: string, text: string, amount: number, categoryId: string, direction: 'in' | 'out' = 'out'): ActualEntry =>
  ({ id: `e${n++}`, date, text, amount, categoryId, direction });
const month = (year: number, m: number, entries: ActualEntry[]): MonthEntries => ({ year, month: m, entries });
const day = (m: number, d = 5) => `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const budget = (cats: Array<[string, number]>): MonthData => ({
  income: [{ id: 'lon', label: 'SYNT LÖN', amount: 30000 }],
  expenses: cats.map(([id, amount]) => ({
    id, name: id, icon: '•', color: '#888', rows: [{ id: `${id}-row`, label: id, amount }],
  })),
  savings: [],
}) as unknown as MonthData;

describe('basisOf', () => {
  it('counts months with entries, and only money that left as unsorted', () => {
    const b = basisOf([
      month(2026, 0, [e(day(0), 'SYNT A', 100, '__unsorted__'), e(day(0), 'SYNT SWISH', 50, '__unsorted__', 'in')]),
      month(2026, 1, []),
    ]);
    expect(b).toEqual({ asked: 2, covered: 1, unsorted: { amount: 100, count: 1 } });
  });
});

describe('categoryOverMonths', () => {
  it('sums a category net of refunds, and leaves an empty month unknown rather than 0', () => {
    const a = categoryOverMonths([
      month(2026, 0, [e(day(0), 'SYNT MAT', 1000, 'mat'), e(day(0), 'SYNT MAT RETUR', 100, 'mat', 'in')]),
      month(2026, 1, []),
      month(2026, 2, [e(day(2), 'SYNT MAT', 1200, 'mat'), e(day(2), 'SYNT BIO', 150, 'fritid')]),
    ], 'mat');
    expect(a.perMonth.map(m => m.amount)).toEqual([900, null, 1200]);
    expect(a.total).toBe(2100);
    expect(a.average).toBe(1050);
    expect(a.basis.covered).toBe(2);
  });

  it('has no average when nothing is imported', () => {
    expect(categoryOverMonths([month(2026, 0, [])], 'mat').average).toBeNull();
  });
});

describe('recurringPayments', () => {
  const six = (extra: (m: number) => ActualEntry[]) =>
    [3, 4, 5, 6, 7, 8].map(m => month(2026, m, [e(day(m), 'SYNT MAT', 400 + m * 37, 'mat'), ...extra(m)]));

  it('refuses with fewer than three months of entries', () => {
    const a = recurringPayments([month(2026, 7, [e(day(7), 'SYNT STREAM', 149, 'prenumerationer')]), month(2026, 8, [])]);
    expect(a.status).toBe('too-little');
  });

  it('finds a charge of nearly the same amount each month, under whatever name the bank adds a number to', () => {
    const a = recurringPayments(six(m => [
      e(day(m), `SYNT STREAM ${4000 + m}`, m < 6 ? 139 : 149, 'prenumerationer'),
      e(day(m, 9), 'SYNT GYM', 299, '__unsorted__'),
    ]));
    if (a.status !== 'ok') throw new Error();
    // The stream went up from 139 to 149: what it costs now is 149.
    expect(a.items.map(i => [i.typical, i.months])).toEqual([[299, 6], [149, 6]]);
    expect(a.perMonth).toBe(448);
  });

  it('leaves out groceries, a weekly habit, rent, loans, savings, income and a cancelled one', () => {
    const a = recurringPayments(six(m => [
      e(day(m, 1), 'SYNT KAFE', 45, 'mat'), e(day(m, 8), 'SYNT KAFE', 45, 'mat'),
      e(day(m), 'SYNT HYRA', 9000, 'boende'),
      e(day(m), 'SYNT LÅN', 500, 'lan'),
      e(day(m), 'SYNT SPAR', 1000, 'sparande'),
      e(day(m), 'SYNT LÖN', 30000, '__income__', 'in'),
      ...(m < 7 ? [e(day(m), 'SYNT GAMMAL', 99, 'prenumerationer')] : []),
    ]));
    if (a.status !== 'ok') throw new Error();
    expect(a.items).toEqual([]);
  });
});

describe('biggestRises', () => {
  const win = (ms: number[], mat: number, fritid: number) =>
    ms.map(m => month(2026, m, [e(day(m), 'SYNT MAT', mat, 'mat'), e(day(m), 'SYNT BIO', fritid, 'fritid'), e(day(m), 'SYNT SPAR', 9999, 'sparande')]));

  it('compares the average per month of the two windows, biggest rise first, savings left out', () => {
    const a = biggestRises(win([2, 3, 4], 3000, 500), win([5, 6, 7], 3600, 800));
    if (a.status !== 'ok') throw new Error();
    expect(a.risers).toEqual([
      { id: 'mat', before: 3000, after: 3600 },
      { id: 'fritid', before: 500, after: 800 },
    ]);
  });

  it('averages over the months that have entries, not over months that are unknown', () => {
    const a = biggestRises([...win([2, 3], 3000, 0), month(2026, 4, [])], win([5, 6, 7], 3000, 0));
    if (a.status !== 'ok') throw new Error();
    expect(a.risers).toEqual([]);
  });

  it('refuses when either side has fewer than two months', () => {
    expect(biggestRises(win([4], 3000, 500), win([5, 6, 7], 3600, 800)).status).toBe('too-little');
  });
});

describe('perDayLeft', () => {
  const b = budget([['boende', 9000], ['mat', 4000], ['fritid', 1000], ['prenumerationer', 300], ['sparande', 2000]]);

  it('divides what is left of the everyday budget by the days left', () => {
    const a = perDayLeft(b, [
      e(day(9, 2), 'SYNT MAT', 1500, 'mat'), e(day(9, 3), 'SYNT HYRA', 9000, 'boende'),
      e(day(9, 4), 'SYNT ?', 500, '__unsorted__'),
    ], 10);
    expect(a.planned).toBe(5000);
    expect(a.spent).toBe(2000);
    expect(a.left).toBe(3000);
    expect(a.perDay).toBe(300);
    expect(a.through).toBe(day(9, 4));
    expect(a.unsorted).toEqual({ amount: 500, count: 1 });
  });

  it('has no per-day figure once the everyday budget is used up', () => {
    const a = perDayLeft(b, [e(day(9, 2), 'SYNT MAT', 6000, 'mat')], 5);
    expect(a.left).toBe(-1000);
    expect(a.perDay).toBeNull();
  });

  it('with nothing imported, is the whole budget', () => {
    const a = perDayLeft(b, [], 20);
    expect([a.left, a.perDay, a.through]).toEqual([5000, 250, null]);
  });
});

describe('budgetKept', () => {
  it('compares each category with its budget, biggest overrun first, and counts unsorted money as spent', () => {
    const a = budgetKept(budget([['mat', 4000], ['fritid', 1000], ['sparande', 2000]]), [
      e(day(8), 'SYNT MAT', 4500, 'mat'), e(day(8), 'SYNT BIO', 600, 'fritid'),
      e(day(8), 'SYNT ?', 200, '__unsorted__'), e(day(8), 'SYNT KLÄDER', 300, 'custom-x'),
    ]);
    expect(a.lines).toEqual([
      { id: 'mat', planned: 4000, actual: 4500 },
      { id: 'custom-x', planned: 0, actual: 300 },
      { id: 'fritid', planned: 1000, actual: 600 },
    ]);
    expect([a.plannedTotal, a.actualTotal]).toEqual([5000, 5600]);
  });
});

describe('goalForecasts', () => {
  const g = (over: Partial<SavingsGoal>): SavingsGoal =>
    ({ id: 'g', name: 'SYNT MÅL', targetAmount: 10000, currentAmount: 4000, deadline: '', color: '#888', budgetRowId: 'r', ...over });
  const withRow = (amount: number, period?: string) => ({
    income: [], savings: [],
    expenses: [{ id: 'sparande', name: 'Sparande', icon: '•', color: '#888', rows: [{ id: 'r', label: 'SYNT MÅL', amount, period }] }],
  }) as unknown as MonthData;
  const now = { year: 2026, month: 9 };

  it('counts this month as the first payment', () => {
    const [f] = goalForecasts([g({})], withRow(2000), now);
    expect(f).toMatchObject({ kind: 'on-its-way', monthly: 2000, at: { year: 2026, month: 11 }, late: null });
  });

  it('says how many months past the deadline, or 0 when in time', () => {
    expect(goalForecasts([g({ deadline: '2026-10' })], withRow(2000), now)[0]).toMatchObject({ late: 2 });
    expect(goalForecasts([g({ deadline: '2027-06' })], withRow(2000), now)[0]).toMatchObject({ late: 0 });
  });

  it('a reached goal, and one with nothing to divide by', () => {
    expect(goalForecasts([g({ currentAmount: 10000 })], withRow(2000), now)[0].kind).toBe('reached');
    expect(goalForecasts([g({})], withRow(0), now)[0].kind).toBe('no-monthly');
    expect(goalForecasts([g({})], withRow(2000, 'year'), now)[0].kind).toBe('no-monthly');
    expect(goalForecasts([g({ budgetRowId: undefined })], withRow(2000), now)[0].kind).toBe('no-monthly');
  });
});
