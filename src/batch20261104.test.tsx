// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';

// ── Ariel's list of 2026-11-04 ─────────────────────────────────────────────
//
// A short note on a budget row, the (i) beside the two ways out of debt, the
// savings summary laid out like the budget's, and "47 % of income goes to
// expenses" said as a sentence.

const sv = translations.sv;

const month = {
  income: [{ id: 'in', label: 'Lön', amount: 30000 }],
  expenses: [{ id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows: [{ id: 'hyra', label: 'Hyra', amount: 9000 }] }],
};
const debt = (id: string, name: string, balance: number, ratePct: number) => ({
  id, name, kind: 'loan', balance, balanceDate: '2026-10-01', ratePct, monthlyPayment: 500,
});

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
  vi.stubGlobal('confirm', () => true);
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_changelog_seen: 'x', budget_guide_row_hidden: '1', budget_2026_9: JSON.stringify(month),
    budget_debts: JSON.stringify({
      debts: [debt('a', 'Kort', 8000, 19), debt('b', 'Billån', 60000, 6)],
      extraPerMonth: 500, strategy: 'avalanche', plainRows: [],
    }),
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const tab = (label: string) => fireEvent.click([...document.querySelectorAll('.tab-btn')].find(el => el.getAttribute('aria-label') === label)!);
const stored = (key: string) => JSON.parse(localStorage.getItem(key)!);

describe('a note on a budget row', () => {
  it('is written under the row, kept to 100 characters, and stored with it', async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector(`button[aria-label="${sv.rowNoteAria('Hyra')}"]`)).not.toBeNull());
    fireEvent.click(document.querySelector(`button[aria-label="${sv.rowNoteAria('Hyra')}"]`)!);
    const input = document.querySelector<HTMLInputElement>('.row-note-input')!;
    expect(input.maxLength).toBe(100);
    fireEvent.change(input, { target: { value: '  Betalas den 27:e  ' } });
    fireEvent.blur(input);
    await waitFor(() => expect(stored('budget_2026_9').expenses[0].rows[0].note).toBe('Betalas den 27:e'));
    expect(document.querySelector('.row-note-text')?.textContent).toBe('Betalas den 27:e');
  });

  it('Escape leaves it as it was, and emptying it takes it away', async () => {
    localStorage.setItem('budget_2026_9', JSON.stringify({
      ...month, expenses: [{ ...month.expenses[0], rows: [{ id: 'hyra', label: 'Hyra', amount: 9000, note: 'Gammal' }] }],
    }));
    render(<App />);
    await waitFor(() => expect(document.querySelector('.row-note-text')).not.toBeNull());
    fireEvent.click(document.querySelector('.row-note-text')!);
    let input = document.querySelector<HTMLInputElement>('.row-note-input')!;
    fireEvent.change(input, { target: { value: 'Ny' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelector('.row-note-text')?.textContent).toBe('Gammal');
    fireEvent.click(document.querySelector('.row-note-text')!);
    input = document.querySelector<HTMLInputElement>('.row-note-input')!;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await waitFor(() => expect(stored('budget_2026_9').expenses[0].rows[0].note).toBeUndefined());
  });
});

describe('the rest of the list', () => {
  it('the (i) beside the way to debt-free explains the avalanche and the snowball', async () => {
    render(<App />);
    tab(sv.tabDebt);
    await waitFor(() => expect(document.querySelector('.debt-info-btn')).not.toBeNull());
    expect(document.querySelector('.debt-ways-info')).toBeNull();
    fireEvent.click(document.querySelector('.debt-info-btn')!);
    expect(document.querySelector('.debt-ways-info')?.textContent).toContain('Dave Ramsey');
    expect(document.querySelector('.debt-info-btn')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('Remaining says how much of the income goes to expenses', async () => {
    render(<App />);
    await waitFor(() => expect(document.body.textContent).toContain(sv.pctOfIncome(30)));
  });

  it('the savings summary is three cards on the budget tab\'s grid, pension the third', async () => {
    render(<App />);
    tab(sv.tabSavings);
    await waitFor(() => expect(document.querySelector('.savings-summary')).not.toBeNull());
    const cards = [...document.querySelectorAll('.savings-summary.summary-cards > .summary-card')];
    expect(cards.map(c => c.classList.contains('savings-pension-card'))).toEqual([false, false, true]);
  });
});

describe('deleting categories, and envelopes from the list (Ariel, 2026-11-04, second round)', () => {
  const withSavings = () => {
    const m = {
      ...month,
      expenses: [...month.expenses, { id: 'sparande', name: 'Sparande', icon: '💰', color: '#10b981', rows: [{ id: 'goal-row', label: 'Buffert', amount: 1000 }] }],
      savings: [{ id: 'sparkonto', name: 'Sparkonto', icon: '🏦', color: '#22d3ee', rows: [{ id: 's1', label: 'Huvudkonto', amount: 5000 }] }],
    };
    localStorage.setItem('budget_2026_9', JSON.stringify(m));
  };

  it('a default savings category can be deleted', async () => {
    withSavings();
    render(<App />);
    tab(sv.tabSavings);
    await waitFor(() => expect(document.querySelector('.savings-summary')).not.toBeNull());
    const section = [...document.querySelectorAll('.expense-section')].find(s => s.textContent?.includes('Sparkonto'))!;
    fireEvent.click(section.querySelector('.cat-edit-btn')!);
    fireEvent.click(section.querySelector('.cat-delete-btn')!);
    await waitFor(() => expect(stored('budget_2026_9').savings).toEqual([]));
  });

  it('Sparande can be deleted with no goal linked, and says which goals hold it otherwise', async () => {
    withSavings();
    localStorage.setItem('budget_plan', JSON.stringify({
      goals: [{ id: 'g', name: 'Buffert', target: 10000, saved: 0, budgetRowId: 'goal-row', color: '#10b981' }], notes: '',
    }));
    render(<App />);
    const sparande = () => [...document.querySelectorAll('.expense-section')].find(s => s.querySelector('.section-title')?.textContent === 'Sparande')!;
    await waitFor(() => expect(sparande()).toBeTruthy());
    fireEvent.click(sparande().querySelector('.cat-edit-btn')!);
    expect(sparande().querySelector('.cat-delete-btn')).toBeNull();
    expect(sparande().querySelector('.cat-protected-note')?.textContent).toBe(sv.protectedCategory('Buffert'));
    cleanup();
    localStorage.setItem('budget_plan', JSON.stringify({ goals: [], notes: '' }));
    render(<App />);
    await waitFor(() => expect(sparande()).toBeTruthy());
    fireEvent.click(sparande().querySelector('.cat-edit-btn')!);
    fireEvent.click(sparande().querySelector('.cat-delete-btn')!);
    await waitFor(() => expect(stored('budget_2026_9').expenses.map((c: { id: string }) => c.id)).toEqual(['boende']));
  });

  it('an envelope keeps a colour from the palette, and nothing else', async () => {
    const { isWallet } = await import('./wallets');
    const w = { id: 'w', name: 'Resa', kind: 'blank', total: 100, pots: [], expenses: [] };
    expect(isWallet({ ...w, color: '#10b981' })).toBe(true);
    expect(isWallet({ ...w, color: 'red; background:url(x)' })).toBe(false);
  });
});
