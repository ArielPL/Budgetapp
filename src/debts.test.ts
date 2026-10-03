import { describe, it, expect } from 'vitest';
import {
  payoffPlan, compareStrategies, estimatedBalance, priorityOrder, addMonths, monthlyTotal, inPlan,
  HORIZON_MONTHS, kindFromLabel, type Debt,
} from './debts';

// The Debt tab's arithmetic. Synthetic debts only.

const START = { year: 2026, month: 9 }; // October 2026
const debt = (over: Partial<Debt> & Pick<Debt, 'id'>): Debt => ({
  name: over.id, kind: 'loan', balance: 10000, balanceDate: '2026-10-01', ratePct: 5, monthlyPayment: 500,
  ...over,
});

/** The textbook annuity payment that clears `b` in `n` months at `pct` a year. */
const annuity = (b: number, pct: number, n: number) => {
  const r = pct / 100 / 12;
  return (b * r) / (1 - (1 + r) ** -n);
};

describe('payoffPlan', () => {
  it('agrees with the annuity formula: paid in exactly n months, interest n·P − B', () => {
    const p = annuity(50000, 6, 36);
    const plan = payoffPlan([debt({ id: 'a', balance: 50000, ratePct: 6, monthlyPayment: p })], 0, 'minimum', START);
    expect(plan.months).toBe(36);
    expect(plan.debtFree).toEqual(addMonths(START, 35));
    expect(plan.totalInterest).toBe(Math.round(36 * p - 50000));
  });

  it('at no interest, is plain division', () => {
    const plan = payoffPlan([debt({ id: 'a', balance: 1200, ratePct: 0, monthlyPayment: 100 })], 0, 'minimum', START);
    expect(plan.months).toBe(12);
    expect(plan.totalInterest).toBe(0);
  });

  it('extra money shortens it and costs less interest', () => {
    const d = [debt({ id: 'a', balance: 20000, ratePct: 10, monthlyPayment: 500 })];
    const base = payoffPlan(d, 0, 'minimum', START);
    const faster = payoffPlan(d, 500, 'avalanche', START);
    expect(faster.months!).toBeLessThan(base.months!);
    expect(faster.totalInterest).toBeLessThan(base.totalInterest);
  });

  it('the avalanche never costs more interest than the snowball', () => {
    const d = [
      debt({ id: 'small-cheap', balance: 3000, ratePct: 2, monthlyPayment: 150 }),
      debt({ id: 'big-dear', balance: 30000, ratePct: 19.9, monthlyPayment: 900 }),
      debt({ id: 'mid', balance: 12000, ratePct: 8, monthlyPayment: 400 }),
    ];
    const av = payoffPlan(d, 1000, 'avalanche', START);
    const sb = payoffPlan(d, 1000, 'snowball', START);
    expect(av.totalInterest).toBeLessThanOrEqual(sb.totalInterest);
    // …while the snowball pays its first debt off sooner.
    expect(sb.payoffs[0].id).toBe('small-cheap');
    expect(sb.payoffs[0].months).toBeLessThan(av.payoffs[0].months);
  });

  it('frees a paid-off debt’s payment for the next one (the roll-over)', () => {
    const d = [
      debt({ id: 'a', balance: 1000, ratePct: 0, monthlyPayment: 500 }),
      debt({ id: 'b', balance: 6000, ratePct: 0, monthlyPayment: 500 }),
    ];
    const plan = payoffPlan(d, 0, 'snowball', START);
    // a: 2 months, b at 5 000 by then. From month 3 b gets both payments,
    // 1 000 a month → 5 more months = month 7.
    expect(plan.payoffs.map(p => [p.id, p.months])).toEqual([['a', 2], ['b', 7]]);
    // Without the roll-over b takes its 12 months.
    expect(payoffPlan(d, 0, 'minimum', START).months).toBe(12);
  });

  it('leaves a mortgage out of the way out', () => {
    const d = [debt({ id: 'home', kind: 'mortgage', balance: 2_000_000 }), debt({ id: 'a', balance: 1000, ratePct: 0 })];
    const plan = payoffPlan(d, 0, 'avalanche', START);
    expect(plan.order).toEqual(['a']);
    expect(plan.months).toBe(2);
    expect(inPlan(d[0])).toBe(false);
  });

  it('says never, rather than a date, when the payment does not cover the interest', () => {
    const d = [debt({ id: 'card', balance: 50000, ratePct: 24, monthlyPayment: 900 })]; // 1 000 interest a month
    const plan = payoffPlan(d, 0, 'minimum', START);
    expect(plan.months).toBeNull();
    expect(plan.debtFree).toBeNull();
    expect(plan.growing).toEqual(['card']);
    // Enough extra money still gets it paid.
    expect(payoffPlan(d, 1500, 'avalanche', START).months).not.toBeNull();
  });

  it('stops at fifty years', () => {
    const d = [debt({ id: 'slow', balance: 1e9, ratePct: 0, monthlyPayment: 1 })];
    expect(payoffPlan(d, 0, 'minimum', START).months).toBeNull();
    expect(HORIZON_MONTHS).toBe(600);
  });

  it('raises a CSN payment 2 % a year, so it finishes sooner than a flat one', () => {
    const csn = debt({ id: 'csn', kind: 'csn', balance: 200000, ratePct: 2.135, monthlyPayment: 1000 });
    const flat = { ...csn, kind: 'loan' as const };
    expect(payoffPlan([csn], 0, 'minimum', START).months!)
      .toBeLessThan(payoffPlan([flat], 0, 'minimum', START).months!);
  });

  it('with nothing to pay, is debt-free now', () => {
    const plan = payoffPlan([], 500, 'avalanche', START);
    expect(plan.months).toBe(0);
    expect(plan.debtFree).toEqual(START);
  });
});

describe('priorityOrder', () => {
  const d = [
    debt({ id: 'cheap-small', balance: 1000, ratePct: 1 }),
    debt({ id: 'dear-big', balance: 9000, ratePct: 20 }),
    debt({ id: 'mid', balance: 5000, ratePct: 7 }),
  ];
  it('avalanche: highest rate first', () => {
    expect(priorityOrder(d, 'avalanche').map(x => x.id)).toEqual(['dear-big', 'mid', 'cheap-small']);
  });
  it('snowball: smallest balance first', () => {
    expect(priorityOrder(d, 'snowball').map(x => x.id)).toEqual(['cheap-small', 'mid', 'dear-big']);
  });
});

describe('estimatedBalance', () => {
  it('is the stated balance in the month it was stated', () => {
    expect(estimatedBalance(debt({ id: 'a', balanceDate: '2026-10-15' }), START)).toBe(10000);
  });
  it('takes off the payments since, interest added', () => {
    const d = debt({ id: 'a', balance: 1200, ratePct: 0, monthlyPayment: 100, balanceDate: '2026-07-01' });
    expect(estimatedBalance(d, START)).toBe(900); // July, August, September paid
  });
  it('never goes below nothing', () => {
    const d = debt({ id: 'a', balance: 100, ratePct: 0, monthlyPayment: 100, balanceDate: '2025-01-01' });
    expect(estimatedBalance(d, START)).toBe(0);
  });
});

describe('compareStrategies and monthlyTotal', () => {
  it('starts every line from today’s estimated balance', () => {
    const d = [debt({ id: 'a', balance: 1200, ratePct: 0, monthlyPayment: 100, balanceDate: '2026-07-01' })];
    const c = compareStrategies(d, 0, START);
    expect(c.minimum.months).toBe(9);
    expect(c.avalanche.months).toBe(9);
  });
  it('adds up what the debts cost a month, leaving out paid ones', () => {
    expect(monthlyTotal([debt({ id: 'a' }), debt({ id: 'b', balance: 0 })])).toBe(500);
  });
});

describe('kindFromLabel', () => {
  it('guesses from the row name, and says "loan" when unsure', () => {
    expect(kindFromLabel('Studielån (CSN)')).toBe('csn');
    expect(kindFromLabel('CSN')).toBe('csn');
    expect(kindFromLabel('Bolån & amortering')).toBe('mortgage');
    expect(kindFromLabel('Kreditkort')).toBe('card');
    expect(kindFromLabel('Avbetalning soffa')).toBe('installment');
    expect(kindFromLabel('Billån')).toBe('loan');
    expect(kindFromLabel('Övriga lån & krediter')).toBe('loan');
  });
});
