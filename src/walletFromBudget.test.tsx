// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { isoWeek, walletWeek, loadWallets, WALLETS_KEY } from './wallets';
import { latestUndo } from './undo';

// ── A wallet from Left to live on (Ariel, 2026-10-18) ──────────────────────
//
// The week's or the month's amount becomes a wallet — a plan for everyday
// spending. Confirmed first, undoable after, and the budget is not touched.

const sv = translations.sv;

describe('the week a wallet covers', () => {
  const october = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) };

  it('is Monday to Sunday of this week when today is in the month', () => {
    const w = walletWeek(new Date(2026, 9, 15), october); // a Thursday
    expect([w.from.getDate(), w.to.getDate()]).toEqual([12, 18]);
    expect(isoWeek(w.from)).toBe(42);
  });

  it("is the month's first seven days when planning another month", () => {
    const w = walletWeek(new Date(2026, 8, 28), october);
    expect([w.from.getMonth(), w.from.getDate(), w.to.getDate()]).toEqual([9, 1, 7]);
  });

  it('numbers weeks the ISO way across the new year', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);   // a Thursday: week 1
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);  // a Friday: last week of 2026
  });
});

const seed = (extra: Record<string, string> = {}) => {
  const month = {
    income: [{ id: 'in', label: 'Lön', amount: 31000 }],
    expenses: [{ id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows: [{ id: 'r', label: 'Hyra', amount: 9000 }] }],
  };
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_guide_row_hidden: '1', budget_2026_9: JSON.stringify(month), ...extra,
  })) localStorage.setItem(k, v);
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const tile = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.daily-budget-tile-btn')].find(b => b.textContent?.includes(label))!;
const confirmBtn = () => document.querySelector<HTMLButtonElement>('.confirm-change .custom-primary-btn')!;

describe('Left to live on → a wallet', () => {
  it('the month: confirmed, stored with the amount and the dates, opened, undoable', async () => {
    seed();
    render(<App />);
    expect(document.querySelector('.daily-budget-tile-month')?.textContent).toMatch(/22\s000/);
    fireEvent.click(tile(sv.dailyBudgetPerMonth));
    // Nothing stored until it is confirmed.
    expect(document.querySelector('.confirm-change')?.textContent).toContain('Vardag oktober');
    expect(localStorage.getItem(WALLETS_KEY)).toBeNull();

    fireEvent.click(confirmBtn());
    await waitFor(() => expect(loadWallets(localStorage)).toHaveLength(1));
    const w = loadWallets(localStorage)[0];
    expect(w).toMatchObject({ name: 'Vardag oktober', total: 22000, from: '2026-10-01', to: '2026-10-31', expenses: [] });
    expect(latestUndo(localStorage)?.action).toBe('createWallet');
    // The wallets screen opens on it.
    await waitFor(() => expect(document.body.textContent).toContain('Vardag oktober'));
    // It speaks of a period, not of a trip.
    expect(document.body.textContent).toContain('resten av perioden');
    expect(document.body.textContent).not.toContain('resten av resan');
    // The budget is not touched.
    expect(JSON.parse(localStorage.getItem('budget_2026_9')!).expenses[0].rows[0].amount).toBe(9000);
  });

  it('the week: Monday to Sunday, named by its week number', async () => {
    seed();
    render(<App />);
    fireEvent.click(tile(sv.dailyBudgetPerWeek));
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(loadWallets(localStorage)).toHaveLength(1));
    expect(loadWallets(localStorage)[0]).toMatchObject({ name: 'Vardag v. 42', total: 4967, from: '2026-10-12', to: '2026-10-18' });
  });

  it('cancelling stores nothing', () => {
    seed();
    render(<App />);
    fireEvent.click(tile(sv.dailyBudgetPerMonth));
    fireEvent.click(document.querySelector<HTMLButtonElement>('.confirm-change .custom-secondary-btn')!);
    expect(document.querySelector('.confirm-change')).toBeNull();
    expect(localStorage.getItem(WALLETS_KEY)).toBeNull();
  });

  it('a month already over budget offers no wallet', () => {
    seed({ budget_2026_9: JSON.stringify({ income: [{ id: 'in', label: 'Lön', amount: 5000 }],
      expenses: [{ id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows: [{ id: 'r', label: 'Hyra', amount: 9000 }] }] }) });
    render(<App />);
    expect(document.querySelectorAll('.daily-budget-tile-btn')).toHaveLength(0);
  });

  it('with a pay period, names the period, not a calendar month of the wrong length', () => {
    seed({ budget_period_start_day: '25' });
    render(<App />);
    const days = document.querySelector('.daily-budget-days')!.textContent!;
    expect(days).not.toContain('oktober');
    expect(days).toMatch(/sep – \d+ okt \(\d+ dagar\)/);
  });
});
