import { describe, it, expect } from 'vitest';
import { loadDebts, debtsChange, debtsHaveContent, EMPTY_DEBTS, DEBTS_KEY } from './debtStore';
import { withLoanRow, shownName } from './defaults';
import type { MonthData } from './types';

// Synthetic values only.

const mem = (raw: string | null) => ({
  getItem: (k: string) => (k === DEBTS_KEY ? raw : null),
  setItem() {}, removeItem() {}, key: () => null, length: 0,
});
const DEBT = { id: 'd1', name: 'SYNT LÅN', kind: 'loan', balance: 1000, balanceDate: '2026-10-01', ratePct: 5, monthlyPayment: 100 };

describe('loadDebts', () => {
  it('reads what debtsChange wrote', () => {
    const state = { debts: [DEBT as never], extraPerMonth: 250, strategy: 'snowball' as const };
    expect(loadDebts(mem(debtsChange(state).value))).toEqual(state);
  });
  it('is empty for nothing, nonsense and the wrong shape', () => {
    for (const raw of [null, '', '{', '42', 'null', '[]']) expect(loadDebts(mem(raw))).toEqual(EMPTY_DEBTS);
  });
  it('drops a debt that does not hold up, keeps the rest', () => {
    const raw = JSON.stringify({ debts: [DEBT, { ...DEBT, id: 'x', balance: -5 }, { ...DEBT, id: 'y', kind: 'boat' }], extraPerMonth: -1, strategy: 'odd' });
    expect(loadDebts(mem(raw))).toEqual({ debts: [DEBT], extraPerMonth: 0, strategy: 'avalanche' });
  });
  it('counts as data worth a backup only with a debt in it', () => {
    expect(debtsHaveContent(JSON.stringify({ debts: [DEBT] }))).toBe(true);
    expect(debtsHaveContent(JSON.stringify({ debts: [], extraPerMonth: 500 }))).toBe(false);
    expect(debtsHaveContent('{')).toBe(false);
  });
});

describe('withLoanRow', () => {
  const empty: MonthData = { income: [], expenses: [], savings: [] };
  const row = { id: 'r1', label: 'SYNT LÅN', amount: 100 };

  it('creates the loans category with only that row when the month has none', () => {
    const out = withLoanRow(empty, row, 'sv');
    expect(out.expenses).toHaveLength(1);
    expect(out.expenses[0].id).toBe('lan');
    expect(out.expenses[0].rows.map(r => [r.id, r.label, r.amount])).toEqual([['r1', 'SYNT LÅN', 100]]);
  });
  it('updates the row in place, and returns the same object when nothing changes', () => {
    const once = withLoanRow(empty, row, 'sv');
    expect(withLoanRow(once, row, 'sv')).toBe(once);
    const changed = withLoanRow(once, { ...row, amount: 150 }, 'sv');
    expect(changed.expenses[0].rows).toHaveLength(1);
    expect(changed.expenses[0].rows[0].amount).toBe(150);
  });
  it('calls the category "Lån & skulder", also in months saved under its old name', () => {
    expect(shownName(withLoanRow(empty, row, 'sv').expenses[0], 'sv')).toBe('Lån & skulder');
    expect(shownName({ name: 'Lån & Krediter' }, 'sv')).toBe('Lån & skulder');
    expect(shownName({ name: 'Lån & Krediter' }, 'en')).toBe('Loans & Debts');
    // A name the user chose is theirs.
    expect(shownName({ name: 'Lån & Krediter', userNamed: true }, 'sv')).toBe('Lån & Krediter');
  });
});
