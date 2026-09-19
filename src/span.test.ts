import { describe, it, expect } from 'vitest';
import { spanMonths, isSpan, SPANS } from './span';

describe('spanMonths', () => {
  it('is just the month itself for a span of one', () => {
    expect(spanMonths(2026, 8, 1)).toEqual([{ year: 2026, month: 8 }]);
  });

  it('ends at the month on screen, oldest first', () => {
    expect(spanMonths(2026, 8, 3)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it('walks back over the turn of the year', () => {
    expect(spanMonths(2026, 1, 4)).toEqual([
      { year: 2025, month: 10 },
      { year: 2025, month: 11 },
      { year: 2026, month: 0 },
      { year: 2026, month: 1 },
    ]);
  });

  it('handles a full year without repeating a month', () => {
    const months = spanMonths(2026, 5, 12);
    expect(months).toHaveLength(12);
    expect(new Set(months.map(m => `${m.year}-${m.month}`)).size).toBe(12);
    expect(months[11]).toEqual({ year: 2026, month: 5 });
    expect(months[0]).toEqual({ year: 2025, month: 6 });
  });

  it('always ends where it was asked to', () => {
    for (const n of SPANS) {
      const months = spanMonths(2026, 0, n);
      expect(months[months.length - 1]).toEqual({ year: 2026, month: 0 });
      expect(months).toHaveLength(n);
    }
  });
});

describe('isSpan', () => {
  it('knows the offered spans', () => {
    expect(isSpan(1)).toBe(true);
    expect(isSpan(12)).toBe(true);
    expect(isSpan(7)).toBe(false);
    expect(isSpan(0)).toBe(false);
  });
});
