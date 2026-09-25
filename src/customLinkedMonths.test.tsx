// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { CustomV3 } from './components/CustomV3';
import { planCarryForward } from './customLinked';
import type { BudgetCategory, MonthData } from './types';

// ── A linked panel across months (2026-09-25) ───────────────────────────────
//
// The regular budget keeps its own categories in every month, so a category
// added or renamed on a linked panel changed ONE month and the next month's
// panel said "Transport is not in the budget for October". Now:
//   · leaving Edit layout asks whether to carry the change to later months;
//   · a block whose category a month lacks offers to bring it from an earlier one;
//   · the menu's copy and reset actions are there, since the panel IS that budget.
// Plus the smaller things from the same round: drag on a desktop, ↑ ↓ on a
// standalone desktop, the undo bar after a new choice, and outcome blocks that
// follow an import made in another browser tab.

const cat = (id: string, name: string, rows: BudgetCategory['rows'] = []): BudgetCategory =>
  ({ id, name, icon: '•', color: '#888', userNamed: true, rows });
const row = (id: string, label: string, amount: number, period?: 'year') =>
  ({ id, label, amount, userNamed: true, ...(period ? { period } : {}) });
const month = (expenses: BudgetCategory[]): MonthData =>
  ({ income: [row('lon', 'Lön', 30000)], expenses, savings: [] });
const stored = (y: number, m: number, data: MonthData) => ({ year: y, month: m, data });

describe('planCarryForward', () => {
  const boende = cat('boende', 'Boende', [row('hyra', 'Hyra', 9000)]);

  it('adds a new category to later months that lack it, monthly rows only', () => {
    const resor = cat('resor', 'Resor', [row('sl', 'SL-kort', 970), row('forsakring', 'Reseförsäkring', 1200, 'year')]);
    const plan = planCarryForward([boende], [boende, resor], [stored(2026, 9, month([boende]))]);
    expect(plan.names).toEqual(['Resor']);
    const added = plan.months[0].data.expenses.find(c => c.id === 'resor')!;
    // A yearly charge is paid once — carrying it would invent a cost.
    expect(added.rows.map(r => r.label)).toEqual(['SL-kort']);
  });

  it('renames only where the old name is still there', () => {
    const renamed = { ...boende, name: 'Hem' };
    const plan = planCarryForward([boende], [renamed], [
      stored(2026, 9, month([boende])),
      stored(2026, 10, month([{ ...boende, name: 'Lägenheten' }])),
    ]);
    expect(plan.months.map(m => m.month)).toEqual([9]);
    expect(plan.months[0].data.expenses[0].name).toBe('Hem');
  });

  it('does not bring back a category a later month no longer has', () => {
    const renamed = { ...boende, name: 'Hem' };
    expect(planCarryForward([boende], [renamed], [stored(2026, 9, month([]))]).months).toEqual([]);
  });

  it('never carries savings, which Plan’s goals are tied to', () => {
    const sparande = cat('sparande', 'Sparande', [row('buf', 'Buffert', 2000)]);
    expect(planCarryForward([], [sparande], [stored(2026, 9, month([]))]).months).toEqual([]);
  });

  it('writes nothing when nothing changed', () => {
    expect(planCarryForward([boende], [boende], [stored(2026, 9, month([boende]))])).toEqual({ names: [], months: [] });
  });
});

// ── In the app ──────────────────────────────────────────────────────────────
const chart = { show: false, type: 'bars', size: 'M', position: 'bottom' };
const SEPT = month([cat('boende', 'Boende', [row('hyra', 'Hyra', 9000)])]);

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
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_custom_help_seen: '1', budget_lang: 'sv',
    budget_currency: 'sek', budget_layout: 'custom', budget_custom_mode: 'linked',
  })) localStorage.setItem(k, v);
  localStorage.setItem('budget_2026_8', JSON.stringify(SEPT));
  localStorage.setItem('budget_custom_linked', JSON.stringify([
    { id: 'b', source: { kind: 'category', id: 'boende' }, name: 'Boende', width: 'half', bg: null, chart },
  ]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const openApp = async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.custom-section')).not.toBeNull());
};
const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent?.includes(label));
const read = (y: number, m: number) => JSON.parse(localStorage.getItem(`budget_${y}_${m}`) ?? 'null') as MonthData;

describe('leaving Edit layout carries a new category forward, if asked', () => {
  beforeEach(() => {
    localStorage.setItem('budget_2026_9', JSON.stringify(month([cat('boende', 'Boende', [row('hyra2', 'Hyra', 9000)])])));
  });

  it('adds it to the later month that already has a budget, with a step back', async () => {
    const confirm = vi.fn((message?: string) => message !== undefined);
    vi.stubGlobal('confirm', confirm);
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(document.querySelector('.custom-add-card')!);
    fireEvent.click(buttonWith('Ny kategori')!);
    await waitFor(() => expect(read(2026, 8).expenses).toHaveLength(2));
    fireEvent.click(buttonWith('Klar')!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(String(confirm.mock.calls[0][0])).toContain('oktober 2026');
    const newId = read(2026, 8).expenses[1].id;
    expect(read(2026, 9).expenses.map(c => c.id)).toEqual(['boende', newId]);
    const undo = JSON.parse(localStorage.getItem('budget_undo')!)[0];
    expect(undo.action).toBe('copyBudget');
    expect(undo.changes.map((c: { key: string }) => c.key)).toEqual(['budget_2026_9']);
  });

  it('changes nothing in later months when the answer is no', async () => {
    vi.stubGlobal('confirm', () => false);
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(document.querySelector('.custom-add-card')!);
    fireEvent.click(buttonWith('Ny kategori')!);
    await waitFor(() => expect(read(2026, 8).expenses).toHaveLength(2));
    fireEvent.click(buttonWith('Klar')!);
    expect(read(2026, 9).expenses.map(c => c.id)).toEqual(['boende']);
  });

  it('asks nothing when no category changed', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(buttonWith('Klar')!);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('a block whose category this month lacks', () => {
  it('offers to bring it from the nearest earlier month', async () => {
    localStorage.setItem('budget_2026_7', JSON.stringify(month([
      cat('boende', 'Boende', [row('hyra', 'Hyra', 9000)]),
      cat('resor', 'Resor', [row('sl', 'SL-kort', 970), row('ins', 'Reseförsäkring', 1200, 'year')]),
    ])));
    localStorage.setItem('budget_custom_linked', JSON.stringify([
      { id: 'b', source: { kind: 'category', id: 'boende' }, name: 'Boende', width: 'half', bg: null, chart },
      { id: 'r', source: { kind: 'category', id: 'resor' }, name: 'Resor', width: 'half', bg: null, chart },
    ]));
    await openApp();
    const fetch = buttonWith('Hämta Resor från augusti 2026');
    expect(fetch).toBeDefined();
    fireEvent.click(fetch!);
    await waitFor(() => expect(read(2026, 8).expenses.map(c => c.id)).toEqual(['boende', 'resor']));
    expect(read(2026, 8).expenses[1].rows.map(r => r.label)).toEqual(['SL-kort']);
  });
});

describe('the menu on a linked panel', () => {
  const openMenu = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText(/öppna meny/i));
  };

  it('offers copy and reset, which act on the budget the panel shows', async () => {
    await openApp();
    await openMenu();
    await waitFor(() => expect(screen.getByText(/nästa månad \(/i)).toBeTruthy());
    expect(screen.getByText(/återställ månad/i)).toBeTruthy();
  });

  it('still hides them beside a standalone panel', async () => {
    localStorage.setItem('budget_custom_mode', 'standalone');
    render(<App />);
    await openMenu();
    await waitFor(() => expect(screen.getByText(/exportera data/i)).toBeTruthy());
    expect(screen.queryByText(/nästa månad \(/i)).toBeNull();
    expect(screen.queryByText(/återställ månad/i)).toBeNull();
  });
});

describe('the smaller things', () => {
  it('lets a desktop drag blocks on a linked panel, keeping ↑ ↓ for keyboards', async () => {
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    const section = document.querySelector('.custom-section')!;
    expect(section.getAttribute('draggable')).toBe('true');
    expect(section.querySelector('.custom-grip')).not.toBeNull();
    expect(section.querySelector('[aria-label="Flytta upp"]')).not.toBeNull();
  });

  it('gives a standalone desktop ↑ ↓ too, not only dragging', () => {
    localStorage.setItem('budget_custom_v3', JSON.stringify([
      { id: 'a', name: 'A', userNamed: true, kind: 'block', tag: 'in', width: 'full', rows: [], chart },
      { id: 'b', name: 'B', userNamed: true, kind: 'block', tag: 'out', width: 'full', rows: [], chart },
    ]));
    render(<CustomV3 year={2026} month={8} onSaveFailed={() => {}} onRecordUndo={() => {}} />);
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(document.querySelectorAll('[aria-label="Flytta ner"]')[0]);
    expect([...document.querySelectorAll('.custom-section')].map(s => s.querySelector('input')?.value))
      .toEqual(['B', 'A']);
  });

  it('closes the undo bar from a Start over once a new choice is made', async () => {
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(buttonWith('Börja om')!);
    await waitFor(() => expect(buttonWith('Välj fristående')).toBeDefined());
    expect(document.body.textContent).toContain('Anpassad började om från början');
    fireEvent.click(buttonWith('Välj fristående')!);
    await waitFor(() => expect(document.body.textContent).not.toContain('Anpassad började om från början'));
  });

  it('follows an import made in another browser tab', async () => {
    localStorage.setItem('budget_custom_linked', JSON.stringify([
      { id: 'a', source: { kind: 'actual', id: 'boende' }, width: 'half', bg: null, chart },
    ]));
    await openApp();
    expect(document.body.textContent).toContain('Inga transaktioner för september 2026');
    const key = 'budget_actuals_2026_8';
    localStorage.setItem(key, JSON.stringify([
      { id: 'x', date: '2026-09-01', text: 'Hyra', amount: 9000, categoryId: 'boende', direction: 'out' },
    ]));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key })); });
    await waitFor(() => expect(document.body.textContent).toMatch(/9\s000\s*kr av 9\s000\s*kr|av 9\s000\s*kr i budget/));
  });
});
