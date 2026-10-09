import { describe, it, expect } from 'vitest';
import { calculateBudgetMetrics, sumRows } from './metrics';
import { walletSummary, type Wallet } from './wallets';
import { formatMoney } from './i18n';
import { toCents } from './money';
import type { MonthData } from './types';

// ── Spent to the cent is 0 left, not "−0" (full sweep 2026-10-08) ─────────
//
// 20.10 + 40.20 is 60.300000000000004 in binary. Against a 60.30 income that
// left −0.000000000000007: the summary card printed "Remaining −0 €" in deficit
// red, and a wallet spent to the cent said "0 € over budget". Synthetic values.

const month: MonthData = {
  income: [{ id: 'i', label: 'Pay', amount: 60.3 }],
  expenses: [{ id: 'c', name: 'Housing', icon: '', color: '', rows: [
    { id: 'a', label: 'A', amount: 20.1 }, { id: 'b', label: 'B', amount: 40.2 },
  ] }],
  savings: [],
};

describe('totals are made to the cent', () => {
  it('a budget spent to the cent has exactly 0 remaining', () => {
    const m = calculateBudgetMetrics(month);
    expect(m.expenses).toBe(60.3);
    expect(m.remaining).toBe(0);
    expect(Object.is(m.remaining, -0)).toBe(false);
  });

  it('a wallet spent to the cent has exactly 0 left, and is not over', () => {
    const w: Wallet = {
      id: 'w', name: 'Trip', kind: 'blank', total: 60.3, pots: [],
      expenses: [
        { id: 'e1', date: '2026-10-01', text: 'A', amount: 20.1, potId: '' },
        { id: 'e2', date: '2026-10-02', text: 'B', amount: 40.2, potId: '' },
      ],
    };
    const s = walletSummary(w, '2026-10-08');
    expect(s.spent).toBe(60.3);
    expect(s.left).toBe(0);
    expect(s.left < 0).toBe(false);
  });

  it('keeps every cent a user typed', () => {
    expect(sumRows([{ id: 'a', label: '', amount: 0.1 }, { id: 'b', label: '', amount: 0.2 }])).toBe(0.3);
    expect(sumRows([{ id: 'a', label: '', amount: 999_999_999_999 }])).toBe(999_999_999_999);
    expect(toCents(-0.004)).toBe(0);
    expect(Object.is(toCents(-0.004), -0)).toBe(false);
  });

  it('never prints a negative zero', () => {
    expect(formatMoney(-7e-15, 'eur')).not.toMatch(/[-−]/);
    expect(formatMoney(-0.001, 'sek')).not.toMatch(/[-−]/);
    expect(formatMoney(-0.4, 'jpy')).not.toMatch(/[-−]/);
    expect(formatMoney(-5, 'eur')).toMatch(/[-−]/);
  });
});
