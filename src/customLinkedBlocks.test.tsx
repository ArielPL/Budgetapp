// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { largestCategory, sameSource, loadLinkedLayout } from './customLinked';
import type { MonthData } from './types';
import { splitRemaining } from './metrics';
import { periodDays } from './periodLabel';

// ── Custom, linked: outcome, goal and figure blocks; new category
//
// Items 1–6 of the Custom list after linked mode landed (2026-09-23):
//   1. "+ New category" — the budget tab is not on screen in linked mode.
//   2. A guide written for a linked panel.
//   3. An outcome block: budgeted against what the imported transactions say.
//   4. A savings goal block from Plan.
//   5. Figure blocks: biggest category, and Left to live on.
// (Item 6, quick entry, was built and then taken out at Ariel's request.)
// Every figure is read through the function the tab it comes from uses, so the
// tests below check the panel against those numbers, not against new ones.

const SEPT: MonthData = {
  income: [{ id: 'lon', label: 'Lön', amount: 32000, userNamed: true }],
  expenses: [
    { id: 'boende', name: 'Boende', icon: '🏠', color: '#f87171', userNamed: true,
      rows: [{ id: 'hyra', label: 'Hyra', amount: 9200, userNamed: true }, { id: 'el', label: 'El', amount: 600, userNamed: true }] },
    { id: 'mat', name: 'Mat', icon: '🍔', color: '#fb923c', userNamed: true,
      rows: [{ id: 'livs', label: 'Livsmedel', amount: 4500, userNamed: true }] },
    { id: 'nöje', name: 'Nöje', icon: '🎉', color: '#a78bfa', userNamed: true,
      rows: [{ id: 'bio', label: 'Bio', amount: 400, userNamed: true }] },
    { id: 'sparande', name: 'Sparande', icon: '🏦', color: '#22d3ee', userNamed: true,
      rows: [{ id: 'buf', label: 'Japan 2027', amount: 3000, userNamed: true }] },
  ],
  savings: [],
};
const chart = { show: false, type: 'bars', size: 'M', position: 'bottom' };
const block = (id: string, source: Record<string, unknown>, name?: string) =>
  ({ id, source, name, width: 'half', bg: null, chart });
const entry = (id: string, text: string, amount: number, categoryId: string, direction: 'in' | 'out' = 'out') =>
  ({ id, date: '2026-09-05', text, amount, categoryId, direction });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('confirm', () => true);
  localStorage.setItem('budget_welcome_seen', '1');
  localStorage.setItem('budget_custom_help_seen', '1');
  localStorage.setItem('budget_lang', 'sv');
  localStorage.setItem('budget_currency', 'sek');
  localStorage.setItem('budget_layout', 'custom');
  localStorage.setItem('budget_custom_mode', 'linked');
  localStorage.setItem('budget_2026_8', JSON.stringify(SEPT));
  localStorage.setItem('budget_actuals_2026_8', JSON.stringify([
    entry('a1', 'Hyra Bostad AB', 9200, 'boende'),
    entry('a3', 'ICA Nära', 1850, 'mat'),
    entry('a4', 'Willys', 2960, 'mat'),
    entry('a5', 'Okänd butik', 350, '__unsorted__'),
    entry('a6', 'Lön', 32000, '__income__', 'in'),
  ]));
  localStorage.setItem('budget_plan', JSON.stringify({ goals: [{
    id: 'g1', name: 'Japan 2027', targetAmount: 40000, currentAmount: 12000, deadline: '2027-06',
    color: '#f472b6', budgetRowId: 'buf', userNamed: true,
  }], notes: '' }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const withLayout = (blocks: unknown[]) => localStorage.setItem('budget_custom_linked', JSON.stringify(blocks));
const openApp = async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.custom-section')).not.toBeNull());
};
const sectionWith = (text: string) =>
  [...document.querySelectorAll('.custom-section')].find(s => s.textContent?.includes(text));
const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent?.includes(label));
const month = () => JSON.parse(localStorage.getItem('budget_2026_8')!) as MonthData;

describe('the model', () => {
  it('never names savings the biggest category', () => {
    const big = { ...SEPT, expenses: SEPT.expenses.map(c => (c.id === 'sparande'
      ? { ...c, rows: [{ id: 'buf', label: 'x', amount: 50000 }] } : c)) };
    expect(largestCategory(big)?.id).toBe('boende');
    // 9 800 of 14 700 spent.
    expect(largestCategory(SEPT)).toEqual({ id: 'boende', amount: 9800, share: 67 });
  });

  it('treats one category, one goal, one figure as one block', () => {
    expect(sameSource({ kind: 'actual', id: 'mat' }, { kind: 'actual', id: 'mat' })).toBe(true);
    expect(sameSource({ kind: 'actual', id: 'mat' }, { kind: 'category', id: 'mat' })).toBe(false);
    expect(sameSource({ kind: 'kpi', metric: 'largest' }, { kind: 'kpi', metric: 'perDay' })).toBe(false);
    expect(sameSource({ kind: 'note' }, { kind: 'note' })).toBe(false);
  });

  it('keeps the new kinds on reload and drops a figure it does not know', () => {
    withLayout([
      block('a', { kind: 'actual', id: 'mat' }), block('g', { kind: 'goal', id: 'g1' }),
      block('k', { kind: 'kpi', metric: 'perDay' }), block('x', { kind: 'kpi', metric: 'mood' }),
    ]);
    expect(loadLinkedLayout()!.map(b => b.id)).toEqual(['a', 'g', 'k']);
  });
});

describe('3 — outcome: what actually happened', () => {
  it('shows the imported total against the budget, and what is over', async () => {
    withLayout([block('a', { kind: 'actual', id: 'mat' })]);
    await openApp();
    const s = sectionWith('UTFALL')!.textContent!;
    expect(s).toMatch(/4\s810\s*kr/);                 // 1 850 + 2 960
    expect(s).toMatch(/av 4\s500\s*kr i budget/);
    expect(s).toMatch(/310\s*kr över budget/);
    expect(s).toContain('2 transaktioner');
  });

  it('says the unsorted money could belong here, as a range, not in the total', async () => {
    withLayout([block('a', { kind: 'actual', id: 'mat' })]);
    await openApp();
    expect(sectionWith('UTFALL')!.textContent).toMatch(/Upp till 350\s*kr osorterat/);
  });

  it('tells nothing recorded apart from zero', async () => {
    withLayout([block('a', { kind: 'actual', id: 'nöje' })]);
    await openApp();
    const s = sectionWith('UTFALL')!;
    expect(s.querySelector('.amount-unknown')).not.toBeNull();
    expect(s.textContent).toContain('Inget har registrerats i Nöje ännu');
  });

  it('says so when the month has no transactions at all', async () => {
    localStorage.removeItem('budget_actuals_2026_8');
    withLayout([block('a', { kind: 'actual', id: 'mat' })]);
    await openApp();
    expect(sectionWith('UTFALL')!.textContent).toContain('Inga transaktioner för september 2026');
  });

  it('counts income as arrived, not as spent', async () => {
    withLayout([block('a', { kind: 'actual', id: '__income__' })]);
    await openApp();
    expect(sectionWith('UTFALL')!.textContent).toContain('Allt har kommit in');
    expect(sectionWith('UTFALL')!.textContent).not.toContain('osorterat');
  });
});

describe('4 — a savings goal from Plan', () => {
  it('shows the goal’s own amounts, deadline and this month’s row', async () => {
    withLayout([block('g', { kind: 'goal', id: 'g1' })]);
    await openApp();
    const s = sectionWith('SPARMÅL')!.textContent!;
    expect(s).toContain('Japan 2027');
    expect(s).toMatch(/12\s000\s*kr/);
    expect(s).toMatch(/av 40\s000\s*kr · 30%/);
    expect(s).toContain('Klart senast juni 2027');
    expect(s).toMatch(/3\s000\s*kr sparas i september 2026/);
  });

  it('says so when the goal has been deleted in Plan', async () => {
    withLayout([block('g', { kind: 'goal', id: 'gone' }, 'Bilen')]);
    await openApp();
    expect(sectionWith('SPARMÅL')!.textContent).toContain('Sparmålet finns inte längre i Plan');
  });
});

describe('5 — figures the budget already works out', () => {
  it('names the biggest category and its share', async () => {
    withLayout([block('k', { kind: 'kpi', metric: 'largest' })]);
    await openApp();
    const s = sectionWith('NYCKELTAL')!.textContent!;
    expect(s).toContain('Boende');
    expect(s).toContain('67 % av utgifterna');
  });

  it('shows Left to live on from what is left after saving', async () => {
    withLayout([block('k', { kind: 'kpi', metric: 'perDay' })]);
    await openApp();
    // 32 000 − 17 700 = 14 300 over September's 30 days, through the budget
    // tab's own split — which truncates, so it never promises money that is not there.
    const { perDay } = splitRemaining(14300, periodDays(2026, 8, null, {}));
    expect(perDay).toBe(476);
    expect(document.querySelector('.daily-budget')!.textContent).toMatch(/476\s*kr/);
  });
});

describe('1 — a new category from the panel', () => {
  it('creates it in this month’s budget and shows it', async () => {
    withLayout([block('i', { kind: 'income' })]);
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(document.querySelector('.custom-add-card')!);
    fireEvent.click(buttonWith('Ny kategori')!);
    await waitFor(() => expect(month().expenses.length).toBe(SEPT.expenses.length + 1));
    const added = month().expenses[month().expenses.length - 1];
    expect(loadLinkedLayout()!.some(b => b.source.kind === 'category' && b.source.id === added.id)).toBe(true);
  });
});

describe('2 — a guide for a linked panel', () => {
  it('explains one budget, not tags and templates', async () => {
    withLayout([block('i', { kind: 'income' })]);
    await openApp();
    fireEvent.click(buttonWith('Så funkar det')!);
    fireEvent.click(buttonWith('Visa guide') ?? buttonWith('guide')!);
    const help = document.querySelector('.custom-help')!.textContent!;
    expect(help).toContain('Samma budget');
    expect(help).not.toContain('IN / UT / SPAR');
  });
});
