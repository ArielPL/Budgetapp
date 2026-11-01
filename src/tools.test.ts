import { describe, it, expect } from 'vitest';
import { whatIf, needToSave, searchEntries } from './tools';
import type { MonthData, ActualEntry } from './types';

// Synthetic values only.

const budget = {
  income: [{ id: 'lon', label: 'Lön', amount: 36000 }],
  expenses: [
    { id: 'boende', name: 'Boende', icon: '•', color: '#888', rows: [{ id: 'hyra', label: 'Hyra', amount: 11038 }] },
    { id: 'mat', name: 'Mat', icon: '•', color: '#888', rows: [{ id: 'm', label: 'Mat', amount: 6400 }] },
    { id: 'sparande', name: 'Sparande', icon: '•', color: '#888', rows: [{ id: 's', label: 'Buffert', amount: 5000 }] },
  ],
  savings: [],
} as unknown as MonthData;
// Remaining: 36 000 − (11 038 + 6 400 + 5 000) = 13 562.

describe('whatIf', () => {
  it('a rise in an expense lowers what is left, and the pace per day with it', () => {
    const a = whatIf(budget, { kind: 'category', id: 'boende' }, 1500, 31);
    expect(a.before.remaining).toBe(13562);
    expect(a.after.remaining).toBe(12062);
    expect(a.before.perDay).toBe(437); // 13 562 / 31 = 437.48, truncated as the tile does
    expect(a.after.perDay).toBe(389);
    expect(a.after.savings).toBe(5000);
  });

  it('a rise in income raises what is left; a cut is a negative change', () => {
    expect(whatIf(budget, { kind: 'income' }, 2000, 30).after.remaining).toBe(15562);
    expect(whatIf(budget, { kind: 'category', id: 'mat' }, -500, 30).after.remaining).toBe(14062);
  });

  it('a change to savings moves the savings figure too', () => {
    const a = whatIf(budget, { kind: 'category', id: 'sparande' }, 1000, 30);
    expect(a.after.savings).toBe(6000);
    expect(a.after.remaining).toBe(12562);
  });

  it('an amount that is not a number changes nothing', () => {
    const a = whatIf(budget, { kind: 'income' }, Number.NaN, 30);
    expect(a.after).toEqual(a.before);
  });
});

describe('needToSave', () => {
  const oct = { year: 2026, month: 9 };
  it('divides what is left over the months up to and including the target month', () => {
    // October 2026 – June 2027 is nine months, this one included.
    expect(needToSave(30000, 9000, oct, { year: 2027, month: 5 }))
      .toEqual({ kind: 'ok', left: 21000, months: 9, perMonth: 2334 });
  });
  it('a goal already met needs nothing more', () => {
    expect(needToSave(5000, 5000, oct, { year: 2027, month: 5 })).toEqual({ kind: 'reached' });
  });
  it('a target month already over says so', () => {
    expect(needToSave(5000, 0, oct, { year: 2026, month: 8 })).toEqual({ kind: 'past' });
  });
  it('this month only is one month', () => {
    expect(needToSave(1000, 0, oct, oct)).toEqual({ kind: 'ok', left: 1000, months: 1, perMonth: 1000 });
  });
});

describe('searchEntries', () => {
  const e = (id: string, text: string, amount: number, categoryId: string, direction: 'in' | 'out' = 'out'): ActualEntry =>
    ({ id, date: '2026-09-02', text, amount, categoryId, direction }) as ActualEntry;
  const months = [
    { year: 2026, month: 8, entries: [
      e('a', 'KAFÉET SÖDER', 49, 'mat'),
      e('b', 'Kaféet', 45.5, 'mat'),
      e('c', 'Lön Kaféet AB', 20000, '__income__', 'in'),
      e('d', 'Stormarknaden', 678, 'mat'),
    ] },
    { year: 2026, month: 9, entries: [e('f', 'kafeet', 50, 'fika'), e('g', 'Kaféet retur', 10, 'mat', 'in')] },
    { year: 2026, month: 7, entries: [] },
  ];

  it('finds the text regardless of case and accents, newest month first', () => {
    const a = searchEntries(months, 'kafé')!;
    expect(a.months.map(m => [m.month, m.amount, m.count])).toEqual([[9, 40, 2], [8, 94.5, 2]]);
    expect(a.total).toBe(134.5);
    expect(a.count).toBe(4);
  });

  it('leaves out money coming in, but a refund counts against what was spent', () => {
    const a = searchEntries(months, 'kaféet')!;
    expect(a.months.find(m => m.month === 8)!.count).toBe(2); // the salary is not a purchase
    expect(a.months.find(m => m.month === 9)!.amount).toBe(40); // 50 − 10
  });

  it('says which category most matches are filed under', () => {
    expect(searchEntries(months, 'kafe')!.mostlyIn).toBe('mat');
  });

  it('a query too short to mean anything is not searched', () => {
    expect(searchEntries(months, 'k')).toBeNull();
    expect(searchEntries(months, '  ')).toBeNull();
  });

  it('nothing found is an empty answer, not an error', () => {
    expect(searchEntries(months, 'gym')).toEqual({ months: [], total: 0, count: 0, mostlyIn: null });
  });
});
