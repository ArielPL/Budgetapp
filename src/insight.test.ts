import { describe, it, expect } from 'vitest';
import { pickInsight, savingsStreakFrom, type InsightInput } from './insight';

const base: InsightInput = {
  income: 30000,
  expenses: 10000,
  categories: [{ name: 'Boende', total: 8000 }, { name: 'Mat', total: 2000 }],
  saved: null,
};

describe('pickInsight — priority', () => {
  it('puts a deficit above everything else', () => {
    expect(pickInsight({ ...base, expenses: 32400, saved: 5000 }))
      .toEqual({ kind: 'deficit', over: 2400 });
  });

  it('reports a falling savings balance before a flattering rate', () => {
    expect(pickInsight({ ...base, saved: -1500 }))
      .toEqual({ kind: 'savingsDown', amount: 1500 });
  });

  it('prefers the measured savings rate over the planned top category', () => {
    // Savings is a recorded balance — real behaviour — while categories are
    // only a plan. The real fact wins.
    expect(pickInsight({ ...base, saved: 3600 }))
      .toEqual({ kind: 'savedRate', pct: 12 });
  });

  it('falls back to the largest expense category', () => {
    expect(pickInsight(base))
      .toEqual({ kind: 'topCategory', name: 'Boende', pct: 27 });
  });
});

describe('pickInsight — when to stay quiet', () => {
  it('says nothing without income', () => {
    expect(pickInsight({ ...base, income: 0 })).toBeNull();
    expect(pickInsight({ ...base, income: 0, expenses: 5000 })).toBeNull();
  });

  it('says nothing when there is no category with an amount', () => {
    expect(pickInsight({ ...base, categories: [] })).toBeNull();
    expect(pickInsight({ ...base, categories: [{ name: 'Tom', total: 0 }] })).toBeNull();
  });

  it('treats an unrecorded month as unknown, not as zero saved', () => {
    // saved: null must never become "you saved 0 %" — it means not recorded.
    const out = pickInsight({ ...base, saved: null });
    expect(out?.kind).toBe('topCategory');
  });

  it('does not claim a rate when the balance stood still', () => {
    // Exactly 0 is a real recorded value, but "you saved 0 %" is not worth
    // saying — fall through to something useful instead.
    expect(pickInsight({ ...base, saved: 0 })?.kind).toBe('topCategory');
  });
});

describe('pickInsight — encouragement', () => {
  const goal = (name: string, current: number, target: number) => ({ name, current, target });

  it('names the gap when a goal is within reach', () => {
    expect(pickInsight({ ...base, goals: [goal('Resa', 18800, 20000)] }))
      .toEqual({ kind: 'goalClose', name: 'Resa', remaining: 1200 });
  });

  it('stays quiet about a goal that is barely started', () => {
    // "Almost there" at 40 % would be a lie, and hollow praise erodes trust.
    expect(pickInsight({ ...base, goals: [goal('Resa', 8000, 20000)] })?.kind)
      .toBe('topCategory');
  });

  it('picks the goal with the smallest gap, not the first', () => {
    const out = pickInsight({
      ...base,
      goals: [goal('Resa', 18000, 20000), goal('Buffert', 49500, 50000)],
    });
    expect(out).toEqual({ kind: 'goalClose', name: 'Buffert', remaining: 500 });
  });

  it('never congratulates a goal that is already finished', () => {
    // A finished goal stays finished — celebrating it monthly would crowd out
    // every other insight forever.
    expect(pickInsight({ ...base, goals: [goal('Resa', 20000, 20000)] })?.kind)
      .toBe('topCategory');
    expect(pickInsight({ ...base, goals: [goal('Resa', 25000, 20000)] })?.kind)
      .toBe('topCategory');
  });

  it('ignores a goal with no target', () => {
    expect(pickInsight({ ...base, goals: [goal('Tom', 0, 0)] })?.kind).toBe('topCategory');
  });

  it('reports a savings streak above the routine rate', () => {
    expect(pickInsight({ ...base, saved: 3600, savingsStreak: 3 }))
      .toEqual({ kind: 'savingsStreak', months: 3 });
  });

  it('does not call two months a streak', () => {
    expect(pickInsight({ ...base, saved: 3600, savingsStreak: 2 }))
      .toEqual({ kind: 'savedRate', pct: 12 });
  });

  it('still puts a deficit above any encouragement', () => {
    const out = pickInsight({
      ...base, expenses: 40000, savingsStreak: 5, goals: [goal('Resa', 19000, 20000)],
    });
    expect(out?.kind).toBe('deficit');
  });
});

describe('savingsStreakFrom', () => {
  it('counts consecutive growth back from the newest month', () => {
    expect(savingsStreakFrom([10000, 11000, 12000, 13000])).toBe(3);
  });

  it('stops at the first month that did not grow', () => {
    expect(savingsStreakFrom([10000, 12000, 11000, 13000])).toBe(1);
  });

  it('treats a flat month as breaking the streak', () => {
    expect(savingsStreakFrom([10000, 11000, 11000, 12000])).toBe(1);
  });

  it('ends the streak at a gap rather than guessing across it', () => {
    // Claiming "3 months running" over a month we know nothing about would be
    // a guess presented as a fact.
    expect(savingsStreakFrom([10000, null, 12000, 13000])).toBe(1);
  });

  it('is 0 when the newest month is unrecorded or falling', () => {
    expect(savingsStreakFrom([10000, 11000, 12000, null])).toBe(0);
    expect(savingsStreakFrom([10000, 11000, 12000, 9000])).toBe(0);
  });
});

describe('pickInsight — arithmetic', () => {
  it('reports the deficit as the amount over, not the total', () => {
    const out = pickInsight({ ...base, income: 20000, expenses: 25000 });
    expect(out).toEqual({ kind: 'deficit', over: 5000 });
  });

  it('rounds percentages the same way the rest of the app does', () => {
    expect(pickInsight({ ...base, saved: 10000 })).toEqual({ kind: 'savedRate', pct: 33 });
  });

  it('picks the biggest category, not the first', () => {
    const out = pickInsight({
      ...base,
      categories: [{ name: 'Mat', total: 2000 }, { name: 'Boende', total: 9000 }],
    });
    expect(out).toEqual({ kind: 'topCategory', name: 'Boende', pct: 30 });
  });

  it('handles a single category taking the whole income', () => {
    const out = pickInsight({
      ...base, expenses: 30000, categories: [{ name: 'Boende', total: 30000 }],
    });
    expect(out).toEqual({ kind: 'topCategory', name: 'Boende', pct: 100 });
  });
});
