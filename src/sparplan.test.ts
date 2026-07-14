import { describe, it, expect } from 'vitest';
import { monthlyRate, projectPlan, monthsBetween, toYM, earliestSavingsYM, type SavingsPlan } from './sparplan';

const plan = (over: Partial<SavingsPlan> = {}): SavingsPlan => ({
  monthlyAmount: 1000,
  annualReturnPct: 7,
  startAmount: 0,
  startYM: '2026-01',
  ...over,
});

describe('monthlyRate', () => {
  it('is the compounding equivalent of the yearly rate', () => {
    // Twelve months of the monthly rate must land exactly on the yearly rate.
    expect(Math.pow(1 + monthlyRate(7), 12)).toBeCloseTo(1.07, 10);
    expect(monthlyRate(0)).toBe(0);
  });
});

describe('projectPlan', () => {
  it('with 0% growth is just the sum of deposits', () => {
    const series = projectPlan(plan({ annualReturnPct: 0 }), 12);
    expect(series[0]).toBe(0);
    expect(series[6]).toBe(6000);
    expect(series[12]).toBe(12000);
  });

  it('with growth ends above the deposit sum, and the start amount compounds', () => {
    const series = projectPlan(plan(), 60);
    expect(series[60]).toBeGreaterThan(60000);
    const withStart = projectPlan(plan({ startAmount: 10000 }), 12);
    // 10 000 alone after a year at 7% ≈ 10 700 — plus the deposits on top.
    expect(withStart[12]).toBeCloseTo(10000 * 1.07 + projectPlan(plan(), 12)[12], 6);
  });

  it('returns months + 1 points (index 0 = now)', () => {
    expect(projectPlan(plan(), 60)).toHaveLength(61);
  });
});

describe('monthsBetween / toYM', () => {
  it('counts whole months across years', () => {
    expect(monthsBetween('2026-01', '2026-07')).toBe(6);
    expect(monthsBetween('2026-07', '2026-07')).toBe(0);
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
  });

  it('toYM builds zero-padded keys from a 0-based month index', () => {
    expect(toYM(2026, 0)).toBe('2026-01');
    expect(toYM(2026, 11)).toBe('2026-12');
  });
});

describe('earliestSavingsYM (auto-default plan start)', () => {
  it('returns the earliest month that actually has savings', () => {
    expect(earliestSavingsYM([
      { ym: '2026-07', saved: 5000 },
      { ym: '2026-03', saved: 2000 },
      { ym: '2026-05', saved: 0 },
    ])).toBe('2026-03');
  });

  it('ignores months with no savings', () => {
    expect(earliestSavingsYM([{ ym: '2026-01', saved: 0 }, { ym: '2026-04', saved: 100 }])).toBe('2026-04');
  });

  it('sorts correctly across years', () => {
    expect(earliestSavingsYM([{ ym: '2026-02', saved: 1 }, { ym: '2025-12', saved: 1 }])).toBe('2025-12');
  });

  it('returns null when nothing is saved', () => {
    expect(earliestSavingsYM([{ ym: '2026-01', saved: 0 }])).toBe(null);
    expect(earliestSavingsYM([])).toBe(null);
  });
});
