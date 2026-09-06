// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ExpenseChart } from './components/Charts';
import { formatMoney } from './i18n';

// ── Review 2026-09-05, F5 ──────────────────────────────────────────────────
//
// The legend used to divide by INCOME whenever income was non-zero, while the
// donut arc is drawn from the values themselves. With one expense category the
// circle was completely full and the label beside it read "45 %". The label and
// the picture described different quantities, and the label silently changed
// meaning the moment income went to zero.
//
// Income is no longer a prop at all, so it cannot come back as a hidden second
// base. Rendered as style="list", which shares the same `pct` and needs no
// chart engine — so this asserts the number a person reads, not a helper.

afterEach(cleanup);

const money = (n: number) => formatMoney(n, 'sek');

/** Render one chart in a clean DOM and return the percentages as shown. */
const pcts = (values: number[]): string[] => {
  cleanup();
  const data = values.map((value, i) => ({
    name: `Kategori ${i + 1}`, value, color: '#6366f1', icon: '🏠',
  }));
  render(
    <ExpenseChart
      data={data}
      totalExpenses={values.reduce((s, v) => s + v, 0)}
      style="list" height={200} money={money} currency="sek" totalLabel="Totalt"
    />,
  );
  return [...document.querySelectorAll('.expense-list-pct')].map(e => e.textContent ?? '');
};

describe('expense-distribution percentages', () => {
  it('gives a lone category 100%, matching the full circle it draws', () => {
    // The case from the report: one category, which fills the whole donut.
    expect(pcts([11000])).toEqual(['100%']);
  });

  it('splits by share of expenses', () => {
    // Sorted by value, descending — the list renders largest first.
    expect(pcts([7500, 2500])).toEqual(['75%', '25%']);
  });

  it('is unaffected by how large the income happens to be', () => {
    // Same expenses, same answer — there is no income to divide by any more.
    // 11 000 against a 30 000 income used to read "37 %" here.
    expect(pcts([11000])).toEqual(pcts([11000]));
    expect(pcts([11000])).toEqual(['100%']);
  });

  it('does not divide by zero when there are no expenses', () => {
    expect(pcts([0, 0])).toEqual(['0%', '0%']);
  });
});
