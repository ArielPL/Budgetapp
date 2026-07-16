import { describe, it, expect } from 'vitest';
import {
  calculateBudgetMetrics,
  calculateSavingsMetrics,
  sumRows,
  ratePct,
  daysInMonth,
  daysLeftInMonth,
  splitRemaining,
  savedThisMonth,
  yearSavingsGrowth,
} from './metrics';
import type { MonthData, BudgetCategory, BudgetRow } from './types';

// ── tiny builders so each test reads as plain numbers ──────────────────
let n = 0;
const row = (amount: number): BudgetRow => ({ id: `r${n++}`, label: 'x', amount });
const cat = (id: string, ...amounts: number[]): BudgetCategory => ({
  id, name: id, icon: '', color: '', rows: amounts.map(row),
});
const month = (m: Partial<MonthData>): MonthData => ({
  income: [], expenses: [], savings: [], ...m,
});

describe('helpers', () => {
  it('sumRows adds amounts and tolerates missing/zero', () => {
    expect(sumRows([row(100), row(0), row(50)])).toBe(150);
    expect(sumRows([])).toBe(0);
  });
  it('ratePct clamps to >= 0 and returns 0 for base <= 0', () => {
    expect(ratePct(25500, 30000)).toBe(85);
    expect(ratePct(-1000, 30000)).toBe(0); // negative clamped
    expect(ratePct(500, 0)).toBe(0);       // divide-by-zero guarded
    expect(ratePct(500, -10)).toBe(0);
  });
});

// Case 1 — income 30 000, expenses 4 500, actual saved 1 000.
describe('case 1: income 30000 / expenses 4500 / saved 1000', () => {
  const m = month({
    income: [row(30000)],
    expenses: [cat('boende', 4500)],
    savings: [cat('sparkonto', 1000)],
  });
  it('remaining is 25 500 and leftover rate is 85%', () => {
    const b = calculateBudgetMetrics(m);
    expect(b.remaining).toBe(25500);
    expect(b.leftoverRate).toBe(85);
  });
  it('the savings balance is read straight off the month', () => {
    expect(calculateSavingsMetrics(m).balance).toBe(1000);
  });
  it('savings rate uses what was saved THIS month, not the balance', () => {
    // Balance moved 800 → 1000, so 200 was actually saved on a 30 000 income.
    const saved = savedThisMonth(calculateSavingsMetrics(m).balance, 800);
    expect(saved).toBe(200);
    expect(ratePct(saved, 30000)).toBe(1);
    // The balance itself would give a nonsense rate — that was the old bug.
    expect(ratePct(1000, 30000)).not.toBe(1);
  });
});

// Case 2 — income 0, expenses 500.
describe('case 2: zero income', () => {
  const m = month({ income: [], expenses: [cat('mat', 500)] });
  it('remaining is negative and rates are 0', () => {
    const b = calculateBudgetMetrics(m);
    expect(b.remaining).toBe(-500);
    expect(b.leftoverRate).toBe(0);
    expect(ratePct(savedThisMonth(calculateSavingsMetrics(m).balance, 0), 0)).toBe(0);
  });
});

// Case 3 — income 30 000, expenses 31 000 (overspent).
describe('case 3: expenses exceed income', () => {
  const m = month({ income: [row(30000)], expenses: [cat('boende', 31000)] });
  it('remaining is -1 000 and leftover rate clamps to 0', () => {
    const b = calculateBudgetMetrics(m);
    expect(b.remaining).toBe(-1000);
    expect(b.leftoverRate).toBe(0);
  });
});

// Case 4 — pension 2 000 and other savings 1 000: pension never counts as saved.
describe('case 4: pension is separate from saved', () => {
  const m = month({
    income: [row(30000)],
    savings: [cat('sparkonto', 1000), cat('pension', 2000)],
  });
  it('the balance excludes pension, pension reported on its own', () => {
    const s = calculateSavingsMetrics(m);
    expect(s.balance).toBe(1000);
    expect(s.pension).toBe(2000);
  });
});

// Case 5 — budgeted savings 1 000 (in-budget 'sparande' expense) AND actual
// savings 1 000: they are distinct measures and must not be double-counted.
describe('case 5: in-budget sparande vs actual savings are independent', () => {
  const m = month({
    income: [row(30000)],
    expenses: [cat('boende', 4500), cat('sparande', 1000)],
    savings: [cat('sparkonto', 1000)],
  });
  it('expenses count the in-budget sparande once; the balance is independent', () => {
    const b = calculateBudgetMetrics(m);
    const s = calculateSavingsMetrics(m);
    expect(b.expenses).toBe(5500);  // 4500 + 1000 sparande, counted once
    expect(b.remaining).toBe(24500);
    expect(s.balance).toBe(1000);   // from the Savings tab, not doubled
  });
});

// The heart of the 2026-07-14 fix: the recorded amount is a BALANCE, so what you
// saved is how far it MOVED — never the sum of several months' balances.
describe('savedThisMonth (balance model)', () => {
  it('is the change in balance, not the balance itself', () => {
    expect(savedThisMonth(55000, 50000)).toBe(5000);
  });
  it('is negative when you withdrew', () => {
    expect(savedThisMonth(48000, 50000)).toBe(-2000);
  });
  it('equals the balance when there was nothing before', () => {
    expect(savedThisMonth(50000, 0)).toBe(50000);
  });
  it('does NOT add the two months together (the reported bug)', () => {
    // May 50 000 → June 55 000 means 5 000 saved, not 105 000.
    expect(savedThisMonth(55000, 50000)).not.toBe(105000);
  });
});

describe('yearSavingsGrowth', () => {
  const janToDec = (...v: number[]) => [...v, ...Array(12 - v.length).fill(0)];

  it('is the end balance minus what carried in from last December', () => {
    // Jan..Jul balances, carrying in 10 000 from December.
    expect(yearSavingsGrowth(janToDec(12000, 20000, 28000, 35000, 50000, 55000, 61000), 10000)).toBe(51000);
  });
  it('uses the last month WITH data, not December\'s empty cell', () => {
    expect(yearSavingsGrowth(janToDec(5000, 9000), 0)).toBe(9000);
  });
  it('handles an untouched year', () => {
    expect(yearSavingsGrowth(janToDec(), 4000)).toBe(0);
  });
  it('goes negative if you ended the year with less than you started', () => {
    expect(yearSavingsGrowth(janToDec(9000, 6000), 10000)).toBe(-4000);
  });
  it('is NOT the sum of the monthly balances (the old Year-tab bug)', () => {
    // Balances 50 000 → 55 000 summed would be 105 000; the truth is 5 000.
    expect(yearSavingsGrowth(janToDec(50000, 55000), 50000)).toBe(5000);
  });
});

describe('daysLeftInMonth / splitRemaining (daily & weekly budget)', () => {
  it('daysInMonth returns the whole-month length', () => {
    expect(daysInMonth(2026, 6)).toBe(31);  // July
    expect(daysInMonth(2026, 3)).toBe(30);  // April
    expect(daysInMonth(2026, 1)).toBe(28);  // February
    expect(daysInMonth(2028, 1)).toBe(29);  // leap February
  });

  it('counts the remaining days including today', () => {
    expect(daysLeftInMonth(new Date(2026, 6, 12))).toBe(20); // July 12 → 20 left
    expect(daysLeftInMonth(new Date(2026, 6, 1))).toBe(31);  // first day
    expect(daysLeftInMonth(new Date(2026, 6, 31))).toBe(1);  // last day
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29);  // leap February
  });

  it('splits remaining into per-day and per-week (mockup example)', () => {
    expect(splitRemaining(12000, 20)).toEqual({ perDay: 600, perWeek: 4200 });
  });

  it('truncates toward zero — never promises more than exists', () => {
    expect(splitRemaining(10000, 19)).toEqual({ perDay: 526, perWeek: 3684 });
    expect(splitRemaining(-1000, 20)).toEqual({ perDay: -50, perWeek: -350 });
  });

  it('is safe when no days are left', () => {
    expect(splitRemaining(5000, 0)).toEqual({ perDay: 0, perWeek: 0 });
  });
});

// Decimals — exact values preserved, no float drift in the sum.
describe('decimals', () => {
  it('keeps öre without drift', () => {
    const m = month({ income: [row(1200.5), row(0.3)] });
    expect(calculateBudgetMetrics(m).income).toBeCloseTo(1200.8, 5);
  });
});
