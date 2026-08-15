// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseCategory } from './components/ExpenseCategory';
import type { BudgetCategory } from './types';

// ── Why this file exists ──────────────────────────────────────────────────
//
// Every other suite tests a pure function or scans source text. That is why 352
// green tests coexisted with a savings account showing 12 000 kr and 1 000 kr at
// the same time: the arithmetic was right in isolation, and the fault lived in
// which component was handed which mode.
//
// These mount the real component and read what a person would see. jsdom rather
// than a real browser, deliberately — the bugs that actually happened were about
// wiring and totals, not pixels. Layout and overflow still need a browser, and
// that gap is real; it is simply not the gap that cost us anything.

afterEach(cleanup);

const cat = (rows: BudgetCategory['rows']): BudgetCategory =>
  ({ id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows });

const row = (id: string, label: string, amount: number, period?: 'month' | 'quarter' | 'year' | 'once') =>
  ({ id, label, amount, ...(period ? { period } : {}), isCustom: true });

/** The category header total, as rendered. */
const headerTotal = () =>
  document.querySelector('.section-total')?.textContent ?? '';

describe('Savings rows are balances, not charges', () => {
  it('offers no period control in the Savings tab', () => {
    // 12 000 kr marked "per year" once showed as 1 000 kr in the category header
    // while the tab total said 12 000 — the same account, two numbers, one
    // screen. The control should never have been reachable here.
    render(
      <ExpenseCategory
        category={cat([row('s1', 'Huvudkonto', 12000, 'year')])}
        onChange={() => {}}
        amountKind="balance"
      />,
    );
    expect(document.querySelectorAll('.row-period')).toHaveLength(0);
    expect(headerTotal()).toContain('12');
    expect(headerTotal()).not.toContain('1 000');
  });

  it('shows the full balance even for a row carrying a legacy period', () => {
    render(
      <ExpenseCategory
        category={cat([row('s1', 'Konto', 60000, 'year')])}
        onChange={() => {}}
        amountKind="balance"
      />,
    );
    expect(headerTotal().replace(/\s/g, '')).toContain('60000');
  });
});

describe('Budget rows can say when they are charged', () => {
  it('offers the period control for a normal expense category', () => {
    render(<ExpenseCategory category={cat([row('r1', 'Hyra', 8801)])} onChange={() => {}} />);
    expect(document.querySelectorAll('.row-period')).toHaveLength(1);
  });

  it('counts a yearly charge in full, in the month it sits in', () => {
    // The period is a timing label, never a divisor: the money leaves the
    // account in one go, and the budget has to agree with the bank that month.
    render(
      <ExpenseCategory
        category={cat([row('r1', 'Hyra', 8801), row('r2', 'Försäkring', 4800, 'year')])}
        onChange={() => {}}
      />,
    );
    expect(headerTotal().replace(/\s/g, '')).toContain('13601');
  });

  it('explains a non-monthly row in words rather than a second figure', () => {
    render(
      <ExpenseCategory
        category={cat([row('r2', 'Försäkring', 4800, 'year')])}
        onChange={() => {}}
      />,
    );
    const hint = document.querySelector('.row-period-hint');
    expect(hint?.textContent).toBe('dras en gång per år');
    // The old "= 400 kr/mån" implied a division that no longer happens.
    expect(hint?.textContent).not.toContain('/mån');
  });

  it('says nothing extra for a plain monthly row', () => {
    render(<ExpenseCategory category={cat([row('r1', 'Hyra', 8801)])} onChange={() => {}} />);
    expect(document.querySelector('.row-period-hint')).toBeNull();
  });

  it('stores "monthly" as no period at all, so an untouched row stays untouched', async () => {
    const onChange = vi.fn();
    render(
      <ExpenseCategory
        category={cat([row('r2', 'Försäkring', 4800, 'year')])}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(document.querySelector('.row-period')!, 'month');
    const updated = onChange.mock.calls.at(-1)?.[0] as BudgetCategory;
    expect(updated.rows[0].period).toBeUndefined();
  });

  it('offers exactly the four timings the app knows', () => {
    render(<ExpenseCategory category={cat([row('r1', 'Hyra', 8801)])} onChange={() => {}} />);
    const select = document.querySelector('.row-period') as HTMLSelectElement;
    expect([...select.options].map(o => o.value))
      .toEqual(['month', 'quarter', 'year', 'once']);
  });
});

describe('Deleting a category asks first', () => {
  it('keeps the category when the confirmation is declined', async () => {
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ExpenseCategory
        category={cat([row('r1', 'Hyra', 8801)])}
        onChange={() => {}}
        onDelete={onDelete}
      />,
    );
    // The delete button lives behind the category's edit toggle. Selected by
    // class: the accessible names of the pencil, the row's × and the collapse
    // arrow all contain the category or row name, so a name query is ambiguous.
    await userEvent.click(document.querySelector('.cat-edit-btn')!);
    const del = document.querySelector('.cat-delete-btn');
    expect(del).not.toBeNull();
    await userEvent.click(del!);

    expect(window.confirm).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
