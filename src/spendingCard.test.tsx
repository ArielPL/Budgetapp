// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpendingCard } from './components/SpendingCard';
import { spendingBreakdown } from './spending';
import { UNSORTED_ACTUAL_ID } from './actuals';
import type { ActualEntry } from './types';

// What a person reads on the card. The arithmetic is tested in spending.test.ts;
// this checks that the words and the buttons follow it.

afterEach(cleanup);

let n = 0;
const spend = (categoryId: string, amount: number): ActualEntry =>
  ({ id: `e${++n}`, date: '2026-09-05', text: `SYNTETISK ${n}`, amount, direction: 'out', categoryId });

const range = { from: new Date(2026, 7, 25), to: new Date(2026, 8, 24) };
const names: Record<string, string> = { mat: 'Mat', transport: 'Transport', restaurang: 'Restaurang' };
const nameOf = (id: string) => names[id] ?? id;

const show = (entries: ActualEntry[], onSort = vi.fn()) => {
  render(<SpendingCard breakdown={spendingBreakdown(entries)} range={range} nameOf={nameOf} onSort={onSort} />);
  return onSort;
};

describe('SpendingCard', () => {
  it('always says which days it counted', () => {
    show([spend('mat', 100)]);
    expect(screen.getByText('25 aug – 24 sep')).toBeTruthy();
  });

  it('names the leader when the unsorted pile cannot change it', () => {
    show([spend('mat', 8000), spend('transport', 4000), spend(UNSORTED_ACTUAL_ID, 1000)]);
    expect(screen.getByText(/Mat är störst även om allt osorterat/)).toBeTruthy();
  });

  it('refuses to name a leader when the pile could overturn it', () => {
    show([spend('mat', 5000), spend('transport', 4500), spend(UNSORTED_ACTUAL_ID, 1000)]);
    expect(screen.getByText(/stort nog att ändra ordningen/)).toBeTruthy();
    expect(screen.queryByText(/är störst/)).toBeNull();
  });

  it('offers to sort only when something is waiting, and sorting opens the list', () => {
    const onSort = show([spend('mat', 100), spend(UNSORTED_ACTUAL_ID, 40)]);
    fireEvent.click(screen.getByRole('button', { name: 'Sortera de här' }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it('has no sort button when everything is sorted', () => {
    show([spend('mat', 100)]);
    expect(screen.queryByRole('button', { name: 'Sortera de här' })).toBeNull();
    expect(screen.getByText(/Allt är sorterat/)).toBeTruthy();
  });

  it('shows each category as a range in the details when money is unsorted', () => {
    show([spend('restaurang', 1760), spend(UNSORTED_ACTUAL_ID, 1240)]);
    const toggle = screen.getByRole('button', { name: 'Visa underlag' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Range endpoints are the only numbers the details add.
    expect(screen.getByText(/kan vara upp till 3\s000 kr/)).toBeTruthy();
  });

  it('says so, and prints no amount, when nothing was spent', () => {
    show([]);
    expect(screen.getByText('Inga utgifter är importerade för den här perioden.')).toBeTruthy();
    expect(document.querySelector('.spending-card-amount')).toBeNull();
  });
});
