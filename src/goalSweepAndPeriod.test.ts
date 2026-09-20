import { describe, it, expect } from 'vitest';
import { sweepGoalRows } from './defaults';
import { periodDays, periodRange } from './periodLabel';
import type { MonthData } from './types';
import type { StorageLike } from './storage';

// ── The three judgment calls from the 2026-09-19 sweep ─────────────────────
//
// Filed as "report only" because each was working exactly as coded and the
// question was what the app SHOULD do, not whether it did it. Ariel asked for
// all three on 2026-09-20.

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  month(k: string): MonthData { return JSON.parse(this.map.get(k)!) as MonthData; }
  sparandeRows(k: string) {
    return this.month(k).expenses.find(c => c.id === 'sparande')?.rows ?? [];
  }
}

const monthWith = (rows: { id: string; label: string; amount: number }[]) => JSON.stringify({
  income: [],
  expenses: [{ id: 'sparande', name: 'Sparande', icon: '💰', color: '#14b8a6', rows }],
  savings: [],
});

const seeded = () => new FakeStorage({
  budget_2026_6: monthWith([{ id: 'row-resa', label: 'Resa', amount: 0 }]),
  budget_2026_7: monthWith([{ id: 'row-resa', label: 'Resa', amount: 0 }]),
  budget_2026_8: monthWith([{ id: 'row-resa', label: 'Resa', amount: 0 }]),
});

describe('renaming a goal reaches every month, not just the one on screen', () => {
  it('relabels the linked row in all the other months', () => {
    // September was renamed in React state; August and July were left reading
    // "Resa" while the goal itself said "Japan 2027". The link held — only the
    // two names disagreed, for as long as the history lasted.
    const s = seeded();
    const ok = sweepGoalRows(s, new Set(), new Map([['row-resa', 'Japan 2027']]), 'budget_2026_8');
    expect(ok).toBe(true);
    expect(s.sparandeRows('budget_2026_6')[0].label).toBe('Japan 2027');
    expect(s.sparandeRows('budget_2026_7')[0].label).toBe('Japan 2027');
  });

  it('leaves the month on screen alone — React state owns it', () => {
    const s = seeded();
    sweepGoalRows(s, new Set(), new Map([['row-resa', 'Japan 2027']]), 'budget_2026_8');
    expect(s.sparandeRows('budget_2026_8')[0].label).toBe('Resa');
  });

  it('touches nothing when the name did not change', () => {
    const s = seeded();
    const before = new Map(s.map);
    sweepGoalRows(s, new Set(), new Map([['row-resa', 'Resa']]), 'budget_2026_8');
    expect(s.map).toEqual(before);
  });

  it('renames a row that holds real money too — money is not the question', () => {
    const s = new FakeStorage({
      budget_2026_6: monthWith([{ id: 'row-resa', label: 'Resa', amount: 2500 }]),
    });
    sweepGoalRows(s, new Set(), new Map([['row-resa', 'Japan 2027']]));
    expect(s.sparandeRows('budget_2026_6')[0]).toMatchObject({ label: 'Japan 2027', amount: 2500 });
  });
});

describe('deleting a goal still behaves as it did', () => {
  it('sweeps an empty linked row out of every month', () => {
    const s = seeded();
    sweepGoalRows(s, new Set(['row-resa']), new Map(), 'budget_2026_8');
    // The category is dropped once it holds nothing.
    expect(s.month('budget_2026_6').expenses.find(c => c.id === 'sparande')).toBeUndefined();
  });

  it('keeps a row that holds real money', () => {
    const s = new FakeStorage({
      budget_2026_6: monthWith([{ id: 'row-resa', label: 'Resa', amount: 2500 }]),
    });
    sweepGoalRows(s, new Set(['row-resa']), new Map());
    expect(s.sparandeRows('budget_2026_6')[0].amount).toBe(2500);
  });

  it('reports a refused write rather than swallowing it', () => {
    const s = seeded();
    s.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    expect(sweepGoalRows(s, new Set(['row-resa']), new Map())).toBe(false);
  });

  it('skips a malformed month instead of losing it', () => {
    const s = seeded();
    s.setItem('budget_2026_5', '{not json');
    expect(sweepGoalRows(s, new Set(['row-resa']), new Map())).toBe(true);
    expect(s.getItem('budget_2026_5')).toBe('{not json');
  });

  it('does nothing at all when there is nothing to do', () => {
    const s = seeded();
    const before = new Map(s.map);
    expect(sweepGoalRows(s, new Set(), new Map())).toBe(true);
    expect(s.map).toEqual(before);
  });
});

describe('a budget month is as long as its period, not its calendar month', () => {
  it('is the calendar month when no pay period is set', () => {
    expect(periodDays(2026, 1, null)).toBe(28);   // February 2026
    expect(periodDays(2024, 1, null)).toBe(29);   // leap February
    expect(periodDays(2026, 0, null)).toBe(31);   // January
    expect(periodDays(2026, 3, null)).toBe(30);   // April
  });

  it('is the real length of the period when one is', () => {
    // The point of the fix: with a pay period, the budget month is NOT the
    // calendar month, and "Left to live on" divided by the calendar month
    // regardless. February 2026 is 28 days; its pay period is 33, because
    // openingDay walks the 25th back off a weekend at one end and not at the
    // other — pay that falls on a Sunday lands on the Friday before. So the
    // per-day pace was out by a fifth in that month alone.
    expect(periodDays(2026, 1, null)).toBe(28);
    expect(periodDays(2026, 1, 25)).toBe(33);
    // And a period is not always longer, either.
    expect(periodDays(2026, 2, null)).toBe(31);
    expect(periodDays(2026, 2, 25)).toBeLessThan(31);
  });

  it('counts exactly the days of the range it describes, and they tile', () => {
    // The real invariant. Period lengths VARY with the weekend walk-back, so
    // they do not sum to a neat 365 — but each one must end the day before the
    // next begins, or some day is budgeted twice or not at all, and the count
    // must be the length of that range.
    const asDay = (d: Date) => d.toDateString();
    for (const startDay of [5, 15, 25, 28, 31]) {
      for (let m = 0; m < 11; m++) {
        const here = periodRange(2026, m, startDay);
        const next = periodRange(2026, m + 1, startDay);
        const dayAfter = new Date(here.to);
        dayAfter.setDate(dayAfter.getDate() + 1);
        expect(asDay(dayAfter), `start ${startDay}, month ${m}`).toBe(asDay(next.from));

        // Count the days by walking them, so this cannot repeat periodDays'
        // own arithmetic back at itself.
        let walked = 0;
        for (const d = new Date(here.from); d <= here.to; d.setDate(d.getDate() + 1)) walked++;
        expect(periodDays(2026, m, startDay), `start ${startDay}, month ${m}`).toBe(walked);
      }
    }
  });

  it('never returns zero or a fraction', () => {
    for (let m = 0; m < 12; m++) {
      for (const startDay of [1, 13, 25, 31]) {
        const d = periodDays(2026, m, startDay);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThan(0);
      }
    }
  });

  it('honours a hand-pinned period start', () => {
    // lockKey is `${year}_${month}` with a 0-based month — June 2026 is 2026_5.
    const locks = { '2026_5': '2026-04-20' };
    expect(periodDays(2026, 5, 25, locks)).not.toBe(periodDays(2026, 5, 25));
  });
});
