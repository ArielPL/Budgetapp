// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SpendingCard } from './components/SpendingCard';
import { spendingBreakdown, purchaseHighlights } from './spending';
import { UNSORTED_ACTUAL_ID } from './actuals';
import type { ActualEntry } from './types';

// What a person reads on the card. The arithmetic is tested in spending.test.ts;
// this checks that the words and the buttons follow it.

afterEach(cleanup);

let n = 0;
const spend = (categoryId: string, amount: number, text?: string): ActualEntry =>
  ({ id: `e${++n}`, date: '2026-09-05', text: text ?? `SYNTETISK ${n}`, amount, direction: 'out', categoryId });

const range = { from: new Date(2026, 7, 25), to: new Date(2026, 8, 24) };
const names: Record<string, string> = { mat: 'Mat', transport: 'Transport', restaurang: 'Restaurang' };
const nameOf = (id: string) => names[id] ?? id;

const key = (text: string) => text.toLowerCase();
const show = (
  entries: ActualEntry[], onSort = vi.fn(),
  { hidden = {}, onHide = vi.fn(), onUnhide = vi.fn(), onLimit = vi.fn() }: {
    hidden?: Record<string, string>; onHide?: () => void; onUnhide?: () => void; onLimit?: () => void;
  } = {},
) => {
  render(
    <SpendingCard
      breakdown={spendingBreakdown(entries)}
      highlights={purchaseHighlights(entries, 200, new Set(Object.keys(hidden)), key)}
      range={range} nameOf={nameOf} onSort={onSort}
      smallLimit={200} limitChoices={[50, 100, 200, 300, 500]} onLimit={onLimit}
      hidden={hidden} onHide={onHide} onUnhide={onUnhide}
    />,
  );
  return onSort;
};
const byCategory = () => fireEvent.click(screen.getByRole('button', { name: 'Visa per kategori' }));

describe('SpendingCard', () => {
  it('always says which days it counted', () => {
    show([spend('mat', 100)]);
    expect(screen.getByText('25 aug – 24 sep')).toBeTruthy();
  });

  it('names the leader when the unsorted pile cannot change it', () => {
    show([spend('mat', 8000), spend('transport', 4000), spend(UNSORTED_ACTUAL_ID, 1000)]);
    byCategory();
    expect(screen.getByText(/Mat är störst även om allt osorterat/)).toBeTruthy();
  });

  it('refuses to name a leader when the pile could overturn it', () => {
    show([spend('mat', 5000), spend('transport', 4500), spend(UNSORTED_ACTUAL_ID, 1000)]);
    byCategory();
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
    byCategory();
    expect(screen.getByText(/Allt är sorterat/)).toBeTruthy();
  });

  it('shows each category as a range in the details when money is unsorted', () => {
    show([spend('restaurang', 1760), spend(UNSORTED_ACTUAL_ID, 1240)]);
    const toggle = screen.getByRole('button', { name: 'Visa per kategori' });
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

  it('leads with the biggest purchases and the small ones, not the categories', () => {
    show([
      spend('boende', 9000, 'HYRESVÄRD SYNT'),
      spend('fritid', 1245, 'SYNT TÅG'),
      spend('mat', 45, 'SYNT KAFÉ'), spend('mat', 45, 'SYNT KAFÉ'), spend('mat', 30, 'SYNT KIOSK'),
      spend('transport', 100, 'SYNT BUSS'),
    ]);
    expect(screen.getByText('Största köpen')).toBeTruthy();
    expect(screen.getByText('SYNT TÅG')).toBeTruthy();
    // The rent is a fixed cost, and the card says that it leaves those out.
    expect(screen.queryByText('HYRESVÄRD SYNT')).toBeNull();
    expect(screen.getByText(/räknas inte här, eftersom de är fasta kostnader/)).toBeTruthy();
    expect(screen.getByText(/Småköpen: 220\s*kr/)).toBeTruthy();
    expect(screen.getByText(/^4 köp under 200\s*kr$/)).toBeTruthy();
    expect(screen.getByText('SYNT KAFÉ')).toBeTruthy();
    expect(screen.getByText('2 gånger')).toBeTruthy();
    // The categories are still there, one tap away.
    expect(screen.queryByText('Mat')).toBeNull();
  });

  it('marks an unsorted purchase, which may be a fixed cost it could not recognise', () => {
    show([spend(UNSORTED_ACTUAL_ID, 9000, 'SYNT OKÄND')]);
    expect(screen.getByText('SYNT OKÄND')).toBeTruthy();
    expect(screen.getByText('osorterad')).toBeTruthy();
  });

  it('hides a place on request, and lists it to count again', () => {
    const onHide = vi.fn();
    show([spend('fritid', 1245, 'SYNT TÅG')], vi.fn(), { onHide });
    fireEvent.click(screen.getByRole('button', { name: 'Räkna inte med SYNT TÅG här' }));
    expect(onHide).toHaveBeenCalledWith('synt tåg', 'SYNT TÅG');
    cleanup();

    const onUnhide = vi.fn();
    show([spend('fritid', 1245, 'SYNT TÅG'), spend('fritid', 900, 'SYNT ANNAT')], vi.fn(),
      { hidden: { 'synt tåg': 'SYNT TÅG' }, onUnhide });
    expect(screen.queryByText('SYNT TÅG')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Visa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Räkna med SYNT TÅG igen' }));
    expect(onUnhide).toHaveBeenCalledWith('synt tåg');
  });

  it('says so when everything was a fixed cost', () => {
    show([spend('boende', 9000)]);
    expect(screen.getByText('Inga köp utöver de fasta kostnaderna.')).toBeTruthy();
  });
});
