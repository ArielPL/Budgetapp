import { describe, it, expect } from 'vitest';
import { ensureGoalLinkedBudgetRows, defaultMonthData, starterMonthData } from './defaults';
import type { MonthData, SavingsGoal, BudgetCategory } from './types';

const goal = (id: string, budgetRowId?: string, name = id): SavingsGoal => ({
  id, name, targetAmount: 0, currentAmount: 0, deadline: '', color: '#000',
  budgetRowId, userNamed: true,
});
const sparandeOf = (m: MonthData): BudgetCategory | undefined =>
  m.expenses.find(c => c.id === 'sparande');

describe('ensureGoalLinkedBudgetRows', () => {
  it('creates a sparande category on a blank/reset month (the bug)', () => {
    const goals = [goal('g1', 'row-1', 'Bil')];
    const out = ensureGoalLinkedBudgetRows(defaultMonthData('sv'), goals, 'sv');
    const sp = sparandeOf(out);
    expect(sp).toBeDefined();
    expect(sp!.rows).toHaveLength(1);
    expect(sp!.rows[0]).toMatchObject({ id: 'row-1', amount: 0, isCustom: true, label: 'Bil' });
  });

  it('appends only the missing linked row to an existing sparande category', () => {
    const month: MonthData = {
      income: [], savings: [],
      expenses: [{
        id: 'sparande', name: 'Sparande', icon: '💰', color: '#14b8a6',
        rows: [{ id: 'row-1', label: 'Bil', amount: 500 }],
      }],
    };
    const goals = [goal('g1', 'row-1'), goal('g2', 'row-2')];
    const out = ensureGoalLinkedBudgetRows(month, goals, 'sv');
    const rows = sparandeOf(out)!.rows;
    expect(rows.map(r => r.id)).toEqual(['row-1', 'row-2']);
    expect(rows.find(r => r.id === 'row-1')!.amount).toBe(500); // existing untouched
    expect(rows.find(r => r.id === 'row-2')!.amount).toBe(0);   // new one at 0
  });

  it('is idempotent — running twice adds no duplicate row', () => {
    const goals = [goal('g1', 'row-1')];
    const once = ensureGoalLinkedBudgetRows(defaultMonthData('sv'), goals, 'sv');
    const twice = ensureGoalLinkedBudgetRows(once, goals, 'sv');
    expect(sparandeOf(twice)!.rows).toHaveLength(1);
    expect(twice).toBe(once); // nothing missing → same reference returned
  });

  it('ignores goals without a budgetRowId', () => {
    const out = ensureGoalLinkedBudgetRows(defaultMonthData('sv'), [goal('g1')], 'sv');
    expect(sparandeOf(out)).toBeUndefined();
    expect(out.expenses).toHaveLength(0);
  });

  it('returns the month unchanged when there are no goals', () => {
    const m = defaultMonthData('sv');
    expect(ensureGoalLinkedBudgetRows(m, [], 'sv')).toBe(m);
  });

  it('preserves the link when applied over the starter template', () => {
    // Starter has its own sparande category; the goal row must still be added.
    const goals = [goal('g1', 'row-x', 'Resa')];
    const out = ensureGoalLinkedBudgetRows(starterMonthData('sv'), goals, 'sv');
    const rows = sparandeOf(out)!.rows;
    expect(rows.some(r => r.id === 'row-x' && r.amount === 0)).toBe(true);
  });
});
