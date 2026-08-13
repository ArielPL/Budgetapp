import { describe, it, expect } from 'vitest';
import {
  periodRange, periodLabelFor, isValidStartDay, loadStartDay, PERIOD_START_KEY,
} from './periodLabel';
import type { StorageLike } from './backup';

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

/** "2026-07-25" — compact and unambiguous for assertions. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const range = (y: number, m: number, day: number) => {
  const r = periodRange(y, m, day);
  return `${iso(r.from)} → ${iso(r.to)}`;
};

describe('periodRange', () => {
  it('runs from the start day of the previous month to the day before the next', () => {
    // August 2026 with a 25th pay day.
    expect(range(2026, 7, 25)).toBe('2026-07-25 → 2026-08-24');
  });

  it('is just the calendar month when the period starts on the 1st', () => {
    expect(range(2026, 7, 1)).toBe('2026-07-01 → 2026-07-31');
  });

  it('crosses the year boundary in January', () => {
    expect(range(2026, 0, 25)).toBe('2025-12-25 → 2026-01-24');
  });

  it('crosses it again in December', () => {
    expect(range(2026, 11, 25)).toBe('2026-11-25 → 2026-12-24');
  });

  it('clamps a start day that does not exist in the month', () => {
    // The 31st of February is the 28th in 2026.
    expect(range(2026, 2, 31)).toBe('2026-02-28 → 2026-03-30');
  });

  it('clamps in a leap year to the 29th', () => {
    expect(range(2024, 2, 31)).toBe('2024-02-29 → 2024-03-30');
  });

  it('never produces a range that ends before it starts', () => {
    for (let m = 0; m < 12; m++) {
      for (const day of [1, 15, 25, 28, 29, 30, 31]) {
        const r = periodRange(2026, m, day);
        expect(r.to.getTime()).toBeGreaterThan(r.from.getTime());
      }
    }
  });

  it('leaves no gap between one period and the next', () => {
    // The day after August's period ends must be the day September's begins.
    for (const day of [1, 15, 25, 31]) {
      const aug = periodRange(2026, 7, day);
      const sep = periodRange(2026, 8, day);
      const dayAfter = new Date(aug.to);
      dayAfter.setDate(dayAfter.getDate() + 1);
      expect(iso(dayAfter)).toBe(iso(sep.from));
    }
  });
});

describe('isValidStartDay', () => {
  it('accepts 1 through 31', () => {
    for (const d of [1, 15, 25, 31]) expect(isValidStartDay(d)).toBe(true);
  });
  it('rejects anything outside a real day of the month', () => {
    for (const bad of [0, 32, -1, 1.5, NaN, Infinity, '25', null, undefined]) {
      expect(isValidStartDay(bad)).toBe(false);
    }
  });
});

describe('loadStartDay', () => {
  it('reads a stored day', () => {
    expect(loadStartDay(new FakeStorage({ [PERIOD_START_KEY]: '25' }))).toBe(25);
  });
  it('is null when nothing is set — the feature is off by default', () => {
    expect(loadStartDay(new FakeStorage())).toBeNull();
  });
  it('is null rather than wrong when the stored value is junk', () => {
    for (const bad of ['0', '32', 'tjugofem', '', '2.5']) {
      expect(loadStartDay(new FakeStorage({ [PERIOD_START_KEY]: bad }))).toBeNull();
    }
  });
});

describe('periodLabelFor', () => {
  const format = () => 'GENERERAD';
  const base = { startDay: 25, year: 2026, month: 7, format };

  it('shows nothing at all when the feature is off and nothing was typed', () => {
    expect(periodLabelFor({ ...base, startDay: null })).toBeNull();
  });

  it('generates from the rule when no override exists', () => {
    expect(periodLabelFor(base)).toBe('GENERERAD');
  });

  it('lets the month’s own text win over the rule', () => {
    expect(periodLabelFor({ ...base, override: 'Lönevecka 34' })).toBe('Lönevecka 34');
  });

  it('treats a blank override as no override, falling back to the rule', () => {
    // This is how clearing the field returns a month to automatic.
    expect(periodLabelFor({ ...base, override: '' })).toBe('GENERERAD');
    expect(periodLabelFor({ ...base, override: '   ' })).toBe('GENERERAD');
  });

  it('shows the user’s own text even with no rule set', () => {
    expect(periodLabelFor({ ...base, startDay: null, override: 'Period 8' })).toBe('Period 8');
  });
});
