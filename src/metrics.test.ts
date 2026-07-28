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
  type SavingsSnapshot,
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
/** A month the user recorded. */
const snap = (balance: number, pension = 0): SavingsSnapshot =>
  ({ hasSnapshot: true, balance, pension });
/** A month the user never touched — "no answer", not "zero". */
const noSnap: SavingsSnapshot = { hasSnapshot: false, balance: 0, pension: 0 };

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
    const saved = savedThisMonth(calculateSavingsMetrics(m), snap(800));
    expect(saved).toBe(200);
    expect(ratePct(saved!, 30000)).toBe(1);
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
    expect(ratePct(0, 0)).toBe(0); // divide-by-zero guarded
  });
  it('records no savings snapshot at all — the month is unknown, not 0 saved', () => {
    expect(calculateSavingsMetrics(m).hasSnapshot).toBe(false);
    expect(savedThisMonth(calculateSavingsMetrics(m), snap(0))).toBe(null);
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

// The recorded amount is a BALANCE, so what you saved is how far it MOVED —
// never the sum of several months' balances (the 2026-07-14 fix), and never a
// number at all unless both months are actually recorded (the 2026-07-16 fix).
describe('savedThisMonth (balance model)', () => {
  it('is the change in balance, not the balance itself', () => {
    expect(savedThisMonth(snap(55000), snap(50000))).toBe(5000);
  });
  it('is negative when you withdrew', () => {
    expect(savedThisMonth(snap(48000), snap(50000))).toBe(-2000);
  });
  it('does NOT add the two months together (the reported bug)', () => {
    // May 50 000 → June 55 000 means 5 000 saved, not 105 000.
    expect(savedThisMonth(snap(55000), snap(50000))).not.toBe(105000);
  });

  // An untouched month is a question we haven't asked, not an empty account.
  it('is unknown for an untouched month — NOT a withdrawal of everything', () => {
    // July 10 000, August never opened. The bug reported this as −10 000.
    expect(savedThisMonth(noSnap, snap(10000))).toBe(null);
  });
  it('is unknown for your very first month — the pot may predate the app', () => {
    // 10 000 showing up with no prior month is a baseline, not a month's saving.
    expect(savedThisMonth(snap(10000), noSnap)).toBe(null);
  });
  it('reports a real withdrawal down to an explicitly recorded 0', () => {
    // You really did empty the account: that IS −10 000, and must not read as
    // "unknown" just because the number happens to be zero.
    expect(savedThisMonth(snap(0), snap(10000))).toBe(-10000);
  });
  it('counts a plain month-on-month gain', () => {
    expect(savedThisMonth(snap(11000), snap(10000))).toBe(1000);
  });
  it('ignores pension on both sides', () => {
    expect(savedThisMonth(snap(11000, 5000), snap(10000, 1000))).toBe(1000);
  });
});

describe('yearSavingsGrowth', () => {
  // Recorded months, then the rest of the year left untouched (unknown, not 0).
  const janToDec = (...v: number[]): SavingsSnapshot[] =>
    [...v.map(b => snap(b)), ...Array(12 - v.length).fill(noSnap)];

  it('is the end balance minus what carried in from last December', () => {
    // Jan..Jul balances, carrying in 10 000 from December.
    expect(yearSavingsGrowth(janToDec(12000, 20000, 28000, 35000, 50000, 55000, 61000), snap(10000))).toBe(51000);
  });
  it('uses the last month WITH data, not December\'s empty cell', () => {
    expect(yearSavingsGrowth(janToDec(5000, 9000), snap(0))).toBe(9000);
  });
  it('goes negative if you ended the year with less than you started', () => {
    expect(yearSavingsGrowth(janToDec(9000, 6000), snap(10000))).toBe(-4000);
  });
  it('is NOT the sum of the monthly balances (the old Year-tab bug)', () => {
    // Balances 50 000 → 55 000 summed would be 105 000; the truth is 5 000.
    expect(yearSavingsGrowth(janToDec(50000, 55000), snap(50000))).toBe(5000);
  });

  it('ends on an explicit 0 instead of skipping back to the last positive month', () => {
    // You saved 10 000 in Jan and emptied the account in Feb: over the year you
    // are exactly where you started. Hunting for the last balance > 0 skipped
    // February's real zero, landed on January and called it +10 000 saved.
    expect(yearSavingsGrowth(janToDec(10000, 0), snap(0))).toBe(0);
    expect(yearSavingsGrowth(janToDec(10000, 0), snap(0))).not.toBe(10000);
    // And with money carried in, emptying the account is a real loss.
    expect(yearSavingsGrowth(janToDec(10000, 0), snap(10000))).toBe(-10000);
  });
  it('uses the last real snapshot across a data gap', () => {
    // Jan 10 000, Feb–Nov never filled in, Dec 12 000 → 2 000 for the year.
    const months = [snap(10000), ...Array(10).fill(noSnap), snap(12000)];
    expect(yearSavingsGrowth(months, snap(10000))).toBe(2000);
  });
  it('is unknown without a carry-in baseline, not a windfall', () => {
    // 50 000 in your first tracked year: we cannot tell saving from a pot you
    // already had, so we say so rather than crediting you with all of it.
    expect(yearSavingsGrowth(janToDec(50000), noSnap)).toBe(null);
    expect(yearSavingsGrowth(janToDec(50000), null)).toBe(null);
  });
  it('is unknown for an untouched year', () => {
    expect(yearSavingsGrowth(janToDec(), snap(4000))).toBe(null);
  });
});

// Old months predate the snapshot flag entirely — nothing on disk changes, the
// flag is derived on read. These pin that a v1.9 blob still means what it meant.
describe('backwards compatibility with pre-snapshot month data', () => {
  it('an old month with savings categories reads as recorded', () => {
    const old = month({ income: [row(30000)], savings: [cat('sparkonto', 10000)] });
    const s = calculateSavingsMetrics(old);
    expect(s.hasSnapshot).toBe(true);
    expect(s.balance).toBe(10000);
  });
  it('an old month with a category zeroed out is a real 0, not unknown', () => {
    const old = month({ savings: [cat('sparkonto', 0)] });
    expect(calculateSavingsMetrics(old)).toMatchObject({ hasSnapshot: true, balance: 0 });
  });
  it('a month with only pension recorded still counts as a snapshot', () => {
    const m = month({ savings: [cat('pension', 2000)] });
    expect(calculateSavingsMetrics(m)).toMatchObject({ hasSnapshot: true, balance: 0, pension: 2000 });
  });
  it('a month with no savings key at all is unknown', () => {
    expect(calculateSavingsMetrics({ income: [], expenses: [] } as unknown as MonthData).hasSnapshot).toBe(false);
  });
});

// The explicit flag (main review §5): structure is not a statement about money.
// "Use savings template" creates four 0 kr categories — before the flag, that
// read as "balance recorded: 0" and instantly showed the previous balance as a
// withdrawal the user never made.
describe('savingsSnapshotRecorded — structure vs recorded balance', () => {
  const template = () => [
    cat('sparkonto', 0), cat('isk', 0), cat('fonder', 0), cat('pension', 0),
  ];

  it('a month with only template structure is UNKNOWN, not a recorded 0', () => {
    const m = month({ savings: template(), savingsSnapshotRecorded: false });
    expect(calculateSavingsMetrics(m).hasSnapshot).toBe(false);
  });

  it('the reported bug end to end: July 10 000, template applied to August', () => {
    const july = month({ savings: [cat('sparkonto', 10000)] }); // old data → recorded
    const august = month({ savings: template(), savingsSnapshotRecorded: false });
    // Not −10 000. Not any number. The user has said nothing about August.
    expect(savedThisMonth(calculateSavingsMetrics(august), calculateSavingsMetrics(july))).toBe(null);
  });

  it('an own empty category is also just structure', () => {
    const m = month({ savings: [cat('mitt-konto', 0)], savingsSnapshotRecorded: false });
    expect(calculateSavingsMetrics(m).hasSnapshot).toBe(false);
  });

  it('a CONFIRMED zero balance is a real snapshot: withdrawal to 0 counts', () => {
    const july = month({ savings: [cat('sparkonto', 10000)] });
    const august = month({ savings: template(), savingsSnapshotRecorded: true });
    expect(savedThisMonth(calculateSavingsMetrics(august), calculateSavingsMetrics(july))).toBe(-10000);
  });

  it('recording a real amount over the template works normally', () => {
    const july = month({ savings: [cat('sparkonto', 10000)] });
    const august = month({ savings: [cat('sparkonto', 12000)], savingsSnapshotRecorded: true });
    expect(savedThisMonth(calculateSavingsMetrics(august), calculateSavingsMetrics(july))).toBe(2000);
  });

  it('pension amounts in the template do not leak into the balance either way', () => {
    const m = month({ savings: [cat('sparkonto', 5000), cat('pension', 99999)], savingsSnapshotRecorded: true });
    expect(calculateSavingsMetrics(m)).toMatchObject({ hasSnapshot: true, balance: 5000, pension: 99999 });
  });

  it('an explicit true wins over an empty category list, and vice versa', () => {
    // The stored flag is the authority whenever it exists.
    expect(calculateSavingsMetrics(month({ savings: [], savingsSnapshotRecorded: true })).hasSnapshot).toBe(true);
    expect(calculateSavingsMetrics(month({ savings: [cat('sparkonto', 500)], savingsSnapshotRecorded: false })).hasSnapshot).toBe(false);
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

  // "Left to live on" divides by the month's LENGTH, not by the days remaining.
  // Dividing by what's left inverted the meaning — the figure grew as the month
  // ran out (5 968 kr with 4 days left read as 1 492 kr/day), which is a
  // burn-down rate, not a spending budget.
  it('gives the same per-day figure on the 1st as on the 28th', () => {
    const remaining = 24175;
    const july = daysInMonth(2026, 6);
    const onThe1st = splitRemaining(remaining, july);
    const onThe28th = splitRemaining(remaining, july);
    expect(onThe1st).toEqual(onThe28th);
    expect(onThe1st).toEqual({ perDay: 779, perWeek: 5458 });
  });

  it('does NOT use the days-remaining figure, which climbs as the month ends', () => {
    const remaining = 5968;
    const byMonthLength = splitRemaining(remaining, daysInMonth(2026, 6));
    const byDaysLeft = splitRemaining(remaining, daysLeftInMonth(new Date(2026, 6, 28)));
    expect(byMonthLength.perDay).toBe(192);   // a pace you can actually keep
    expect(byDaysLeft.perDay).toBe(1492);     // what the card used to show
    expect(byMonthLength.perDay).not.toBe(byDaysLeft.perDay);
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
