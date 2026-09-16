import { describe, it, expect } from 'vitest';
import {
  periodRange, periodLabelFor, isValidStartDay, loadStartDay, PERIOD_START_KEY,
  budgetMonthOf, loadPeriodLocks, type PeriodLocks,
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
const range = (y: number, m: number, day: number, locks: PeriodLocks = {}) => {
  const r = periodRange(y, m, day, locks);
  return `${iso(r.from)} → ${iso(r.to)}`;
};

describe('periodRange', () => {
  it('runs from the start day of the previous month to the day before the next', () => {
    // August 2026 with a 25th pay day. Opens on the 24th, not the 25th: 25 July
    // 2026 is a SATURDAY, so the salary arrives on the Friday before. This is
    // not a rounding choice — it is the month the user described when they said
    // "my budget runs 24 July to 24 August" and the app disagreed with them.
    expect(range(2026, 7, 25)).toBe('2026-07-24 → 2026-08-24');
  });

  it('leaves a weekday pay day exactly where it is', () => {
    // 25 August 2026 is a Tuesday, 25 December a Friday. No adjustment.
    expect(range(2026, 8, 25)).toBe('2026-08-25 → 2026-09-24');
    expect(range(2027, 0, 25)).toBe('2026-12-25 → 2027-01-24');
  });

  it('steps back over a Sunday to the Friday, not to the Saturday', () => {
    // 25 January 2026 is a Sunday: two days back, not one.
    expect(range(2026, 1, 25)).toBe('2026-01-23 → 2026-02-24');
  });

  it('is the calendar month itself when the period starts on the 1st', () => {
    // This test used to assert JULY for August, under this very name. Getting
    // paid on the 1st means August's money is August's — the label must not
    // hand back the previous month.
    expect(range(2026, 7, 1)).toBe('2026-08-01 → 2026-08-31');
    expect(range(2026, 11, 1)).toBe('2026-12-01 → 2026-12-31');
    expect(range(2026, 0, 1)).toBe('2026-01-01 → 2026-01-31');
  });

  it('gets February right on the 1st, leap year included', () => {
    expect(range(2026, 1, 1)).toBe('2026-02-01 → 2026-02-28');
    expect(range(2024, 1, 1)).toBe('2024-02-01 → 2024-02-29');
  });

  it('crosses the year boundary in January', () => {
    // Ends on the 22nd because 25 January 2026 is a Sunday, so the NEXT period
    // opens on Friday the 23rd and this one closes the day before.
    expect(range(2026, 0, 25)).toBe('2025-12-25 → 2026-01-22');
  });

  it('crosses it again in December', () => {
    expect(range(2026, 11, 25)).toBe('2026-11-25 → 2026-12-24');
  });

  it('clamps a start day that does not exist in the month', () => {
    // The 31st of February is the 28th in 2026 — which is a SATURDAY, so the
    // period opens on Friday the 27th. Both adjustments, in order.
    expect(range(2026, 2, 31)).toBe('2026-02-27 → 2026-03-30');
  });

  it('clamps in a leap year to the 29th', () => {
    // 29 February 2024 is a Thursday, so the opening needs no nudge. It closes
    // on the 28th because 31 March 2024 is a Sunday and the next period opens
    // on Friday the 29th.
    expect(range(2024, 2, 31)).toBe('2024-02-29 → 2024-03-28');
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

// ── budgetMonthOf ──────────────────────────────────────────────────────────

/** Local date as "YYYY-MM-DD". NOT toISOString(): that converts to UTC, which
 *  moves midnight in Stockholm back a day and silently shifts every period
 *  boundary by one. Stored dates carry no zone, so neither may this. */
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('budgetMonthOf', () => {
  it('is the calendar month when no period is set', () => {
    expect(budgetMonthOf('2026-08-31', null)).toEqual({ year: 2026, month: 7 });
    expect(budgetMonthOf('2026-01-01', null)).toEqual({ year: 2026, month: 0 });
  });

  it('is the calendar month when the period starts on the 1st', () => {
    expect(budgetMonthOf('2026-08-31', 1)).toEqual({ year: 2026, month: 7 });
  });

  it('puts the day before the turnover in the month it falls in', () => {
    // Ariel's own boundary: paid on the 25th, so 24 August closes August.
    expect(budgetMonthOf('2026-08-24', 25)).toEqual({ year: 2026, month: 7 });
  });

  it('puts the turnover day itself in the NEXT budget month', () => {
    // Rent, transfers and every standing charge land here. This one line is
    // 74.5% of a real month's spending.
    expect(budgetMonthOf('2026-08-25', 25)).toEqual({ year: 2026, month: 8 });
    expect(budgetMonthOf('2026-08-31', 25)).toEqual({ year: 2026, month: 8 });
  });

  it('rolls over the year, not just the month', () => {
    expect(budgetMonthOf('2026-12-28', 25)).toEqual({ year: 2027, month: 0 });
    expect(budgetMonthOf('2026-12-24', 25)).toEqual({ year: 2026, month: 11 });
  });

  it('clamps a start day that a month does not have', () => {
    // A period starting on the 31st would open on the 28th in February 2026 —
    // but that is a Saturday, so it opens on Friday the 27th.
    expect(budgetMonthOf('2026-02-26', 31)).toEqual({ year: 2026, month: 1 });
    expect(budgetMonthOf('2026-02-27', 31)).toEqual({ year: 2026, month: 2 });
  });

  it('moves a weekend pay day back, so the salary lands in the month it opens', () => {
    // 25 July 2026 is a Saturday. Money arriving on Friday the 24th is the
    // NEXT period's money — it is what the whole month is going to be spent on.
    expect(budgetMonthOf('2026-07-24', 25)).toEqual({ year: 2026, month: 7 });
    expect(budgetMonthOf('2026-07-23', 25)).toEqual({ year: 2026, month: 6 });
  });

  it('refuses what is not a date', () => {
    expect(budgetMonthOf('', 25)).toBeNull();
    expect(budgetMonthOf('igår', 25)).toBeNull();
    expect(budgetMonthOf('2026-13-01', 25)).toBeNull();
    expect(budgetMonthOf('2026-02-30', 25)).toBeNull();
  });
});

describe('budgetMonthOf agrees with periodRange, date by date', () => {
  // The property that matters: the two do the same arithmetic in different
  // shapes, and a disagreement would file an entry into a month whose own
  // heading says it covers a different range. Checked rather than trusted.
  it.each([1, 2, 15, 25, 28, 29, 30, 31])('holds for a period starting on the %ith', (startDay) => {
    const mismatches: string[] = [];
    // A full 14 months, so year-end and February are both crossed.
    for (const d = new Date(2026, 0, 1); d < new Date(2027, 2, 1); d.setDate(d.getDate() + 1)) {
      const iso = fmt(d);
      const got = budgetMonthOf(iso, startDay);
      if (!got) { mismatches.push(`${iso}: unreadable`); continue; }
      const range = periodRange(got.year, got.month, startDay);
      if (iso < fmt(range.from) || iso > fmt(range.to)) {
        mismatches.push(`${iso} → ${got.year}-${got.month} whose range is ${fmt(range.from)}..${fmt(range.to)}`);
      }
    }
    expect(mismatches, mismatches.slice(0, 5).join('\n')).toHaveLength(0);
  });

  it('leaves no date homeless and gives none two homes', () => {
    // Every day of 2026 must land in exactly one period.
    for (const startDay of [1, 15, 25, 31]) {
      const seen = new Map<string, number>();
      for (const d = new Date(2026, 0, 1); d < new Date(2027, 0, 1); d.setDate(d.getDate() + 1)) {
        const got = budgetMonthOf(fmt(d), startDay);
        expect(got).not.toBeNull();
        const k = `${got!.year}-${got!.month}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
      }
      const total = [...seen.values()].reduce((s, n) => s + n, 0);
      expect(total, `startDay ${startDay}`).toBe(365);
    }
  });
});

// ── Pinned periods ─────────────────────────────────────────────────────────

describe('a hand-pinned period', () => {
  const locks = { '2026_7': '2026-07-20' };   // August opens 20 July

  it('opens where it was pinned, not where the rule says', () => {
    expect(range(2026, 7, 25, locks)).toBe('2026-07-20 → 2026-08-24');
  });

  it('moves its neighbour\'s end with it, leaving no gap and no overlap', () => {
    // July must now CLOSE on the 19th, or the two periods would both claim
    // 20–24 July, and an entry there would belong to two months at once.
    expect(range(2026, 6, 25, locks)).toBe('2026-06-25 → 2026-07-19'); // 25 Jun is a Thursday
  });

  it('files an entry into the pinned month', () => {
    expect(budgetMonthOf('2026-07-20', 25, locks)).toEqual({ year: 2026, month: 7 });
    expect(budgetMonthOf('2026-07-19', 25, locks)).toEqual({ year: 2026, month: 6 });
  });

  it('leaves every other month to the rule', () => {
    expect(range(2026, 9, 25, locks)).toBe(range(2026, 9, 25));
  });

  it('still leaves no date homeless and none with two homes', () => {
    const seen = new Map<string, number>();
    for (const d = new Date(2026, 0, 1); d < new Date(2027, 0, 1); d.setDate(d.getDate() + 1)) {
      const got = budgetMonthOf(iso(d), 25, locks);
      expect(got, iso(d)).not.toBeNull();
      const k = `${got!.year}-${got!.month}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.values()].reduce((s, n) => s + n, 0)).toBe(365);
  });
});

describe('loadPeriodLocks', () => {
  const store = (raw: string | null) => new FakeStorage(raw === null ? {} : { budget_period_locks: raw });

  it('is empty when nothing is pinned', () => {
    expect(loadPeriodLocks(store(null))).toEqual({});
  });

  it('reads what was written', () => {
    expect(loadPeriodLocks(store('{"2026_7":"2026-07-20"}'))).toEqual({ '2026_7': '2026-07-20' });
  });

  it('refuses a value that is not a date, rather than filing entries by it', () => {
    expect(loadPeriodLocks(store('{"2026_7":"nästa fredag"}'))).toEqual({});
    expect(loadPeriodLocks(store('{"2026_7":42}'))).toEqual({});
    expect(loadPeriodLocks(store('{not json'))).toEqual({});
  });
});
