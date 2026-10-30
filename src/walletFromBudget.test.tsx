// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { isoWeek, walletWeek, loadWallets, WALLETS_KEY, periodWeeks, weekEnvelopes, monthEnvelopes, previousInSeries, withCarry, type Wallet } from './wallets';
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
    expect((document.querySelector('.env-field-name input') as HTMLInputElement).value).toBe('Vardag oktober');
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

  it('the week: one envelope per week left in the month, Monday to Sunday, named by week number', async () => {
    seed();
    render(<App />);
    fireEvent.click(tile(sv.dailyBudgetPerWeek));
    expect(document.querySelector('.confirm-change')?.textContent).toContain(sv.envWeeksValue(42, 44, 3));
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(loadWallets(localStorage)).toHaveLength(3));
    expect(loadWallets(localStorage).map(w => [w.name, w.total, w.from, w.to])).toEqual([
      ['Vardag v. 42', 4968, '2026-10-12', '2026-10-18'],
      ['Vardag v. 43', 4968, '2026-10-19', '2026-10-25'],
      ['Vardag v. 44', 4258, '2026-10-26', '2026-10-31'],
    ]);
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

// ── Envelopes with budget rows taken along, and last week's rest (Ariel, 2026-10-27)
describe('the weeks of a period', () => {
  it('are Monday to Sunday, cut at the ends of the period', () => {
    const weeks = periodWeeks({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) });
    expect(weeks.map(w => [w.from.getDate(), w.to.getDate(), w.days])).toEqual([
      [1, 4, 4], [5, 11, 7], [12, 18, 7], [19, 25, 7], [26, 31, 6],
    ]);
  });

  it('follow a pay period across the month', () => {
    const weeks = periodWeeks({ from: new Date(2026, 8, 25), to: new Date(2026, 9, 24) });
    expect(weeks[0].from.getMonth()).toBe(8);
    expect(weeks.at(-1)!.to.getDate()).toBe(24);
    expect(weeks.reduce((n, w) => n + w.days, 0)).toBe(30);
  });
});

describe('envelopes from the budget', () => {
  const october = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) };
  let n = 0;
  const newId = () => `id${n++}`;
  const food = { id: 'f', label: 'Matvaror', amount: 4000 };

  it('a month: what is left, and one envelope per row taken along', () => {
    const made = monthEnvelopes({ name: 'Vardag oktober', left: 22000, rows: [food], period: october, group: { id: 'g', name: 'Oktober 2026' }, newId });
    expect(made.map(w => [w.name, w.total, w.from, w.to, w.pots.length])).toEqual([
      ['Vardag oktober', 22000, '2026-10-01', '2026-10-31', 0],
      ['Matvaror', 4000, '2026-10-01', '2026-10-31', 0],
    ]);
  });

  it('a week: the shares add up to the whole over every week, and rows become parts', () => {
    const all = weekEnvelopes({ name: w => `v. ${w}`, left: 22000, rows: [food], period: october,
      today: new Date(2026, 8, 20), everyday: 'Vardag', group: { id: 'g', name: 'Oktober 2026' }, newId });
    expect(all).toHaveLength(5);
    expect(all.reduce((s, w) => s + w.total, 0)).toBe(26000);
    expect(all.reduce((s, w) => s + w.pots[1].planned, 0)).toBe(4000);
    for (const w of all) {
      expect(w.pots.map(p => p.name)).toEqual(['Vardag', 'Matvaror']);
      expect(w.pots[0].planned + w.pots[1].planned).toBe(w.total);
      expect(w.series).toBe(all[0].series);
    }
  });

  it('a period already over gets every week, not none (Ariel, 2026-10-29)', () => {
    const all = weekEnvelopes({ name: w => `v. ${w}`, left: 22000, rows: [], period: october,
      today: new Date(2026, 10, 3), everyday: 'Vardag', group: { id: 'g', name: 'Oktober 2026' }, newId });
    expect(all).toHaveLength(5);
  });

  it('a week planned mid-month skips the weeks already over', () => {
    const left = weekEnvelopes({ name: w => `v. ${w}`, left: 22000, rows: [], period: october,
      today: new Date(2026, 9, 15), everyday: 'Vardag', group: { id: 'g', name: 'Oktober 2026' }, newId });
    expect(left.map(w => w.name)).toEqual(['v. 42', 'v. 43', 'v. 44']);
    expect(left.every(w => w.pots.length === 0)).toBe(true);
  });

  it('what the week before left moves onto the total and onto what is left', () => {
    const [a, b] = weekEnvelopes({ name: w => `v. ${w}`, left: 22000, rows: [food], period: october,
      today: new Date(2026, 9, 15), everyday: 'Vardag', group: { id: 'g', name: 'Oktober 2026' }, newId });
    expect(previousInSeries(b, [a, b])?.id).toBe(a.id);
    expect(previousInSeries(a, [a, b])).toBeUndefined();
    const moved = withCarry(b, 300);
    expect(moved.total).toBe(b.total + 300);
    expect(moved.pots[0].planned).toBe(b.pots[0].planned + 300);
    expect(moved.pots[1].planned).toBe(b.pots[1].planned);
    expect(moved.carry).toBe(300);
  });
});

describe('Left to live on → envelopes, in the app', () => {
  const withFood = () => seed({ budget_2026_9: JSON.stringify({
    income: [{ id: 'in', label: 'Lön', amount: 31000 }],
    expenses: [
      { id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows: [{ id: 'r', label: 'Hyra', amount: 9000 }] },
      { id: 'mat', name: 'Mat & Dryck', icon: '🛒', color: '#f59e0b', rows: [{ id: 'g', label: 'Matvaror', amount: 4000 }, { id: 'c', label: 'Kaffe', amount: 0 }] },
    ],
  }) });

  it('offers everyday rows with an amount, not the rent, and makes one envelope per row ticked', async () => {
    withFood();
    render(<App />);
    fireEvent.click(tile(sv.dailyBudgetPerMonth));
    const rows = [...document.querySelectorAll('.env-include-row')].map(r => r.querySelector('.env-include-label')!.textContent);
    expect(rows).toEqual(['Matvaror']);
    fireEvent.click(document.querySelector('.env-include-row input')!);
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(loadWallets(localStorage)).toHaveLength(2));
    expect(loadWallets(localStorage).map(w => [w.name, w.total])).toEqual([['Vardag oktober', 18000], ['Matvaror', 4000]]);
    expect(latestUndo(localStorage)?.action).toBe('createWallet');
  });

  it('the name and the dates can be changed before it is made', async () => {
    seed();
    render(<App />);
    fireEvent.click(tile(sv.dailyBudgetPerMonth));
    fireEvent.change(document.querySelector('.env-field-name input')!, { target: { value: 'Oktoberpengar' } });
    const [from, to] = document.querySelectorAll<HTMLInputElement>('.env-field input[type="date"]');
    fireEvent.change(to, { target: { value: '2026-10-01' } });
    fireEvent.change(from, { target: { value: '2026-10-05' } });
    // The end before the start: said, and nothing made.
    expect(document.querySelector('.env-error')?.textContent).toBe(sv.wErrDates);
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(confirmBtn().disabled).toBe(false));
    expect(localStorage.getItem(WALLETS_KEY)).toBeNull();
    fireEvent.change(to, { target: { value: '2026-10-20' } });
    expect(document.querySelector('.env-error')).toBeNull();
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(loadWallets(localStorage)).toHaveLength(1));
    expect(loadWallets(localStorage)[0]).toMatchObject({ name: 'Oktoberpengar', from: '2026-10-05', to: '2026-10-20' });
  });

  it('asks what last week left once it is over, and moves it', async () => {
    const weeks = weekEnvelopes({ name: w => `Vardag v. ${w}`, left: 22000, rows: [], period: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) },
      today: new Date(2026, 9, 12), everyday: 'Vardag', group: { id: 'g', name: 'Oktober 2026' }, newId: (() => { let i = 0; return () => `w${i++}`; })() });
    // Week 42 is over on the 19th, with 700 spent of it.
    const spent: Wallet = { ...weeks[0], expenses: [{ id: 'e', date: '2026-10-13', text: 'SYNT', amount: 700, potId: '' }] };
    seed({ [WALLETS_KEY]: JSON.stringify({ wallets: [spent, ...weeks.slice(1)] }), budget_panel_open: weeks[1].id });
    vi.setSystemTime(new Date(2026, 9, 19, 12));
    render(<App />);
    fireEvent.click(document.querySelector('.menu-btn')!);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === `✉️ ${sv.wMenu}`)!);
    await waitFor(() => expect(document.querySelectorAll('.wallet-carry')).toHaveLength(1));
    expect((document.querySelector('.wallet-carry-input') as HTMLInputElement).value).toBe(String(weeks[0].total - 700));
    fireEvent.change(document.querySelector('.wallet-carry-input')!, { target: { value: '300' } });
    fireEvent.click(document.querySelector('.wallet-carry .custom-primary-btn')!);
    await waitFor(() => expect(loadWallets(localStorage)[1].carry).toBe(300));
    expect(loadWallets(localStorage)[1].total).toBe(weeks[1].total + 300);
    await waitFor(() => expect(document.querySelector('.wallet-carry')).toBeNull());
    expect(document.body.textContent).toMatch(/Varav 300\skr från förra veckan/);
  });

  it('"No thanks" is an answer too: asked once', async () => {
    const weeks = weekEnvelopes({ name: w => `Vardag v. ${w}`, left: 22000, rows: [], period: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) },
      today: new Date(2026, 9, 12), everyday: 'Vardag', group: { id: 'g', name: 'Oktober 2026' }, newId: (() => { let i = 0; return () => `n${i++}`; })() });
    // On a phone (matchMedia says narrow) the list comes first; this opens the week.
    seed({ [WALLETS_KEY]: JSON.stringify({ wallets: weeks }), budget_panel_open: weeks[1].id });
    vi.setSystemTime(new Date(2026, 9, 19, 12));
    render(<App />);
    fireEvent.click(document.querySelector('.menu-btn')!);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === `✉️ ${sv.wMenu}`)!);
    await waitFor(() => expect(document.querySelector('.wallet-carry')).not.toBeNull());
    fireEvent.click(document.querySelector('.wallet-carry .custom-secondary-btn')!);
    await waitFor(() => expect(loadWallets(localStorage)[1].carry).toBe(0));
    expect(loadWallets(localStorage)[1].total).toBe(weeks[1].total);
    await waitFor(() => expect(document.querySelector('.wallet-carry')).toBeNull());
  });
});
