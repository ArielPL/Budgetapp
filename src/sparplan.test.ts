import { describe, it, expect } from 'vitest';
import {
  monthlyRate, projectPlan, monthsBetween, toYM, earliestSavingsYM, planVsActual,
  validateSavingsPlan, isValidYM, PLAN_LIMITS,
  type SavingsPlan,
} from './sparplan';

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

  // The start-month rule: the start month is the baseline and expects no
  // deposit of its own; the first deposit belongs to the month after it.
  it('start month = baseline; the first deposit lands the month after', () => {
    const series = projectPlan(plan({ annualReturnPct: 0, startAmount: 5000 }), 2);
    expect(series[0]).toBe(5000); // July (start): just the pot, no deposit yet
    expect(series[1]).toBe(6000); // August: the first 1 000 arrives
    expect(series[2]).toBe(7000);
  });

  it('a future start month is a comparison with nothing recorded — no verdict', () => {
    // The component hides the ahead/behind badge when every month is null;
    // this pins the pure half: an unrecorded start month stays null, so there
    // is no number for a badge to be computed from.
    const pts = planVsActual([null], [0]);
    expect(pts[0].actualTotal).toBe(null);
    expect(pts[0].actualProgress).toBe(null);
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

describe('planVsActual (totals on the line, progress in the tooltip)', () => {
  // Started May holding 54 149; July balance 61 443 → 7 294 saved under the plan.
  const pts = planVsActual([54149, 57000, 61443], [0, 2016, 4048]);

  it('plots the real pot, and the plan carries the same starting pot forward', () => {
    expect(pts[0].actualTotal).toBe(54149);
    expect(pts[0].planTotal).toBe(54149); // both lines start from what you had
    expect(pts[2].actualTotal).toBe(61443);
    expect(pts[2].planTotal).toBe(58197); // 54 149 + 4 048 expected deposits
  });

  it('does not count the pot you already had as progress', () => {
    expect(pts[0].actualProgress).toBe(0); // the start is the shared zero
    expect(pts[2].actualProgress).toBe(7294);
    expect(pts[2].planProgress).toBe(4048);
    expect(pts[2].actualProgress).not.toBe(61443); // the reported bug
  });

  it('gives the same ahead/behind verdict from totals or progress', () => {
    const fromTotals = pts[2].actualTotal! - pts[2].planTotal;
    const fromProgress = pts[2].actualProgress! - pts[2].planProgress;
    expect(fromTotals).toBe(fromProgress);
    expect(fromTotals).toBe(3246); // a believable "a bit ahead"
  });

  it('goes negative when the balance falls below where it started', () => {
    const dropped = planVsActual([50000, 48000], [0, 2000]);
    expect(dropped[1].actualProgress).toBe(-2000);
    expect(dropped[1].actualTotal).toBe(48000); // the pot itself stays positive
  });

  it('handles an empty history', () => {
    expect(planVsActual([], [])).toEqual([]);
  });

  // A month you never filled in must break the line, not plunge it to the axis.
  it('leaves a gap for an unrecorded month instead of crashing to zero', () => {
    const pts = planVsActual([54149, null, 61443], [0, 2016, 4048]);
    expect(pts[1].actualTotal).toBe(null);
    expect(pts[1].actualProgress).toBe(null);
    expect(pts[1].actualTotal).not.toBe(0); // the reported bug
    // The plan line keeps running through the gap — it's a projection, not data.
    expect(pts[1].planTotal).toBe(56165);
    // And the months either side are untouched.
    expect(pts[0].actualTotal).toBe(54149);
    expect(pts[2].actualProgress).toBe(7294);
  });

  it('anchors on the first RECORDED month when the plan starts early', () => {
    // Plan set to start in a month with nothing recorded: the baseline is the
    // first real balance, so the pot isn't mistaken for plan progress.
    const pts = planVsActual([null, 54149, 61443], [0, 2016, 4048]);
    expect(pts[0].actualTotal).toBe(null);
    expect(pts[1].actualProgress).toBe(0);       // the anchor
    expect(pts[1].planTotal).toBe(56165);        // 54 149 + 2 016
    expect(pts[2].actualProgress).toBe(7294);
  });

  it('treats an explicitly recorded 0 as a real balance, not a gap', () => {
    const pts = planVsActual([0, 2000], [0, 2016]);
    expect(pts[0].actualTotal).toBe(0);
    expect(pts[0].actualProgress).toBe(0);
    expect(pts[1].actualProgress).toBe(2000); // saved from a standing start
  });
});

// One validator for the form, the save and the load — the old split let a typed
// `1e309` through the form, and the plan then vanished on reload.
describe('validateSavingsPlan', () => {
  it('accepts a sensible plan', () => {
    expect(validateSavingsPlan(plan())).toEqual([]);
    expect(validateSavingsPlan(plan({ monthlyAmount: 0, annualReturnPct: 0 }))).toEqual([]);
  });

  it('rejects Infinity, NaN and 1e309 — the silent-data-loss bug', () => {
    expect(validateSavingsPlan(plan({ annualReturnPct: Number('1e309') }))).toContain('annualReturnPct');
    expect(validateSavingsPlan(plan({ annualReturnPct: Infinity }))).toContain('annualReturnPct');
    expect(validateSavingsPlan(plan({ monthlyAmount: NaN }))).toContain('monthlyAmount');
    expect(validateSavingsPlan(plan({ startAmount: -Infinity }))).toContain('startAmount');
  });

  it('rejects negative amounts', () => {
    expect(validateSavingsPlan(plan({ monthlyAmount: -1 }))).toContain('monthlyAmount');
    expect(validateSavingsPlan(plan({ startAmount: -0.01 }))).toContain('startAmount');
  });

  it('rejects a return above the product limit', () => {
    expect(validateSavingsPlan(plan({ annualReturnPct: PLAN_LIMITS.maxReturnPct + 1 }))).toContain('annualReturnPct');
    expect(validateSavingsPlan(plan({ annualReturnPct: PLAN_LIMITS.maxReturnPct }))).toEqual([]);
  });

  it('rejects amounts beyond the safe range', () => {
    expect(validateSavingsPlan(plan({ monthlyAmount: PLAN_LIMITS.maxAmount + 1 }))).toContain('monthlyAmount');
    expect(validateSavingsPlan(plan({ monthlyAmount: PLAN_LIMITS.maxAmount }))).toEqual([]);
  });

  it('rejects impossible months that matched the old two-digit pattern', () => {
    expect(validateSavingsPlan(plan({ startYM: '2026-13' }))).toContain('startYM');
    expect(validateSavingsPlan(plan({ startYM: '2026-00' }))).toContain('startYM');
    expect(validateSavingsPlan(plan({ startYM: 'garbage' }))).toContain('startYM');
    expect(validateSavingsPlan(plan({ startYM: '1899-12' }))).toContain('startYM'); // outside year range
  });

  it('reports every bad field at once, not just the first', () => {
    const bad = validateSavingsPlan(plan({ monthlyAmount: NaN, startYM: '2026-13' }));
    expect(bad).toContain('monthlyAmount');
    expect(bad).toContain('startYM');
  });
});

describe('isValidYM', () => {
  it('accepts real months in range', () => {
    expect(isValidYM('2026-01')).toBe(true);
    expect(isValidYM('2026-12')).toBe(true);
  });
  it('rejects month 00 and 13', () => {
    expect(isValidYM('2026-00')).toBe(false);
    expect(isValidYM('2026-13')).toBe(false);
  });
});

describe('earliestSavingsYM (auto-default plan start)', () => {
  it('returns the earliest month with a snapshot recorded', () => {
    expect(earliestSavingsYM([
      { ym: '2026-07', hasSnapshot: true },
      { ym: '2026-03', hasSnapshot: true },
      { ym: '2026-05', hasSnapshot: false },
    ])).toBe('2026-03');
  });

  it('skips months that were never filled in', () => {
    expect(earliestSavingsYM([
      { ym: '2026-01', hasSnapshot: false },
      { ym: '2026-04', hasSnapshot: true },
    ])).toBe('2026-04');
  });

  it('anchors on a month recorded as 0 — starting from nothing is a real start', () => {
    // The old `saved > 0` filter skipped this and started the plan in April,
    // hiding the three months of saving that got you there.
    expect(earliestSavingsYM([
      { ym: '2026-01', hasSnapshot: true },  // balance 0: "I started with nothing"
      { ym: '2026-04', hasSnapshot: true },
    ])).toBe('2026-01');
  });

  it('sorts correctly across years', () => {
    expect(earliestSavingsYM([
      { ym: '2026-02', hasSnapshot: true },
      { ym: '2025-12', hasSnapshot: true },
    ])).toBe('2025-12');
  });

  it('returns null when nothing is recorded', () => {
    expect(earliestSavingsYM([{ ym: '2026-01', hasSnapshot: false }])).toBe(null);
    expect(earliestSavingsYM([])).toBe(null);
  });
});
