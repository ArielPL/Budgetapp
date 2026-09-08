// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { YearTab } from './components/YearTab';
import { PlanTab } from './components/PlanTab';
import type { MonthData } from './types';

// ── Absence is not zero — applied to the Year tab and the goal card ────────
//
// metrics.ts spends thirty lines explaining that a month with no savings
// recorded is UNKNOWN, not a balance of 0, because reading the first as the
// second once told users they had emptied their account. The savings column
// followed that rule. Income and expenses did not: a year with four months
// filled in drew eight months of "0 kr", which reads as a year with no earnings
// and no spending rather than a year not yet lived.
//
// The same mistake sat on the Plan tab, where "Måluppfyllnad 0 %" was shown to
// someone who had never created a goal — a score for a game they had not
// started, beside two cards that already knew how to say "–".

const month = (income: number, expense: number, balance: number | null): MonthData => ({
  income: [{ id: 'i1', label: 'Lön', amount: income }],
  expenses: [{
    id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1',
    rows: [{ id: 'r1', label: 'Hyra', amount: expense }],
  }],
  savings: balance === null ? [] : [{
    id: 'buffert', name: 'Buffert', icon: '🛟', color: '#22c55e',
    rows: [{ id: 's1', label: 'Sparkonto', amount: balance }],
  }],
  ...(balance === null ? {} : { savingsSnapshotRecorded: true }),
});

beforeEach(() => {
  localStorage.clear();
  // Recharts' ResponsiveContainer needs it; jsdom does not ship it.
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The table row for one month, as the cells read. */
const rowFor = (name: string): string[] => {
  const cell = [...document.querySelectorAll('.year-table tbody td')]
    .find(td => td.textContent?.trim() === name);
  const tr = cell?.closest('tr');
  return [...(tr?.children ?? [])].map(td => td.textContent?.trim() ?? '');
};

describe('Year tab — a month never filled in', () => {
  beforeEach(() => {
    // Only September (month index 8) exists.
    localStorage.setItem('budget_2026_8', JSON.stringify(month(32596, 8801, 48000)));
  });

  it('shows a dash for every figure, not 0 kr', () => {
    render(<YearTab year={2026} />);
    // Income, expenses, savings and remaining are all unknown for January.
    expect(rowFor('Januari').slice(1)).toEqual(['–', '–', '–', '–']);
  });

  it('still shows the real figures for a month that was filled in', () => {
    render(<YearTab year={2026} />);
    const september = rowFor('September');
    expect(september[1]).toContain('32');
    expect(september[2]).toContain('8');
    expect(september.some(c => c === '–')).toBe(false);
  });

  it('treats a month built but left at 0 kr as a real zero, not as unknown', () => {
    // The distinction the whole fix rests on: structure the user created is
    // data, whatever it is worth. Only an untouched month is unknown.
    localStorage.setItem('budget_2026_0', JSON.stringify(month(0, 0, null)));
    render(<YearTab year={2026} />);
    const januari = rowFor('Januari');
    expect(januari[1]).not.toBe('–');   // income: a real 0
    expect(januari[2]).not.toBe('–');   // expenses: a real 0
    expect(januari[3]).toBe('–');       // savings: genuinely never recorded
  });
});

describe('Plan tab — goal progress with no goals', () => {
  const render0 = () => render(
    <PlanTab
      data={{ goals: [], notes: '' }}
      onChange={() => {}}
      totalIncome={30000}
      savedThisMonth={2800}
      year={2026}
      month={8}
    />,
  );

  it('shows a dash, not 0%, when no goal has been created', () => {
    render0();
    const card = document.querySelector('.overview-stat-goal')!;
    const value = within(card as HTMLElement).getByText('–');
    expect(value).toBeTruthy();
    // And it says WHY, rather than leaving a bare dash to be puzzled over.
    expect(value.getAttribute('title')).toMatch(/mål/i);
  });

  it('shows a real percentage once a goal exists', () => {
    render(
      <PlanTab
        data={{
          goals: [{
            id: 'g1', name: 'Resa', targetAmount: 10000, currentAmount: 2500,
            deadline: '2027-01', color: '#6366f1',
          }],
          notes: '',
        }}
        onChange={() => {}}
        totalIncome={30000}
        savedThisMonth={2800}
        year={2026}
        month={8}
      />,
    );
    const card = document.querySelector('.overview-stat-goal')!;
    expect(card.textContent).toContain('25%');
  });
});
