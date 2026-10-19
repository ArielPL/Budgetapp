// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { starterMonthData } from './defaults';
import { latestUndo } from './undo';
import { COLLAPSED_KEY } from './collapsed';

// ── Tester feedback, 2026-10-19 ─────────────────────────────────────────────
//
// Template rows could not be removed; a folded category unfolded on every tab
// switch; "SL" is Stockholm's operator; the template had no phone line; a minus
// in Follow-up read as an overrun when it meant money left; and "a button that
// copies ALL months" existed only deep in the menu.

const sv = translations.sv;

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

const seed = (extra: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_guide_row_hidden: '1', ...extra,
  })) localStorage.setItem(k, v);
};
const month = (income: number, rows: { label: string; amount: number }[]) => JSON.stringify({
  income: [{ id: 'in', label: 'Lön', amount: income }],
  expenses: [{ id: 'transport', name: 'Transport', icon: '🚌', color: '#888',
    rows: rows.map((r, i) => ({ id: `r${i}`, ...r })) }],
});
const tab = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(label))!;

describe('the template', () => {
  it('says Kollektivtrafik, not SL, and has a phone line', () => {
    const labels = starterMonthData('sv').expenses.flatMap(c => c.rows.map(r => r.label));
    expect(labels).toContain('Kollektivtrafik');
    expect(labels).not.toContain('SL/Kollektivtrafik');
    expect(labels).toContain('Mobilabonnemang');
    expect(starterMonthData('en').expenses.flatMap(c => c.rows.map(r => r.label))).toContain('Phone plan');
  });

  it('shows an old "SL/Kollektivtrafik" row under the new name', () => {
    seed({ budget_2026_9: month(30000, [{ label: 'SL/Kollektivtrafik', amount: 1030 }]) });
    render(<App />);
    expect(document.body.textContent).toContain('Kollektivtrafik');
    expect(document.body.textContent).not.toContain('SL/Kollektivtrafik');
  });
});

describe('every row can be removed', () => {
  it("a template row has its ✕, and removing it can be undone", async () => {
    seed({ budget_2026_9: month(30000, [{ label: 'Bil', amount: 2000 }, { label: 'Kollektivtrafik', amount: 1030 }]) });
    render(<App />);
    const del = document.querySelector<HTMLButtonElement>(`button[aria-label="${sv.ariaDeleteRow('Bil')}"]`);
    expect(del).not.toBeNull();
    fireEvent.click(del!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem('budget_2026_9')!).expenses[0].rows).toHaveLength(1));
    expect(latestUndo(localStorage)?.action).toBe('deleteRow');
    // Income rows too.
    expect(document.querySelector(`button[aria-label="${sv.ariaDeleteRow('Lön')}"]`)).not.toBeNull();
  });
});

describe('a folded category stays folded', () => {
  it('across a tab switch and a restart', () => {
    seed({ budget_2026_9: month(30000, [{ label: 'Bil', amount: 2000 }]) });
    const { unmount } = render(<App />);
    const arrow = document.querySelector<HTMLButtonElement>('.expense-section .collapse-arrow')!;
    expect(arrow.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(arrow);
    expect(JSON.parse(localStorage.getItem(COLLAPSED_KEY)!)).toEqual(['transport']);
    fireEvent.click(tab(sv.tabPlanShort));
    fireEvent.click(tab(sv.tabBudgetShort));
    expect(document.querySelector('.expense-section .collapse-arrow')!.getAttribute('aria-expanded')).toBe('false');
    unmount();
    render(<App />);
    expect(document.querySelector('.expense-section .collapse-arrow')!.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Follow-up says which way the difference goes', () => {
  it('"kvar" under plan, "över" over it — no bare minus', async () => {
    seed({
      budget_2026_9: month(30000, [{ label: 'Kollektivtrafik', amount: 1000 }]),
      budget_actuals_2026_9: JSON.stringify([
        { id: 'e1', date: '2026-10-03', text: 'SYNT SL', amount: 400, direction: 'out', categoryId: 'transport' },
      ]),
    });
    render(<App />);
    fireEvent.click(tab(sv.tabFollowUp));
    await waitFor(() => expect(document.querySelector('.followup-diff')).not.toBeNull());
    const row = [...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Transport'))!;
    const diff = row.querySelector('.followup-diff')!.textContent!;
    expect(diff).toMatch(/^600\skr/);
    expect(diff).toContain(sv.followUpDiffWords.left);
    expect(diff).not.toMatch(/[−-]/);
  });
});

describe('"Same budget for the rest of the year?"', () => {
  it('is offered when this month is built and the rest are empty, and copies', async () => {
    seed({ budget_2026_9: month(30000, [{ label: 'Bil', amount: 2000 }]) });
    render(<App />);
    const offer = document.querySelector('.copy-offer')!;
    expect(offer.textContent).toContain(sv.copyOfferButton(2));
    fireEvent.click([...offer.querySelectorAll('button')].find(b => b.textContent === sv.copyOfferButton(2))!);
    await waitFor(() => expect(localStorage.getItem('budget_2026_11')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('budget_2026_10')!).income[0].amount).toBe(30000);
    await waitFor(() => expect(document.querySelector('.copy-offer')).toBeNull());
  });

  it('"Not now" is remembered for the year', () => {
    seed({ budget_2026_9: month(30000, [{ label: 'Bil', amount: 2000 }]) });
    const { unmount } = render(<App />);
    fireEvent.click([...document.querySelectorAll('.copy-offer button')].find(b => b.textContent === sv.copyOfferDismiss)!);
    expect(document.querySelector('.copy-offer')).toBeNull();
    unmount();
    render(<App />);
    expect(document.querySelector('.copy-offer')).toBeNull();
  });

  it('is not offered when a later month already has a budget', () => {
    seed({
      budget_2026_9: month(30000, [{ label: 'Bil', amount: 2000 }]),
      budget_2026_11: month(30000, [{ label: 'Bil', amount: 2500 }]),
    });
    render(<App />);
    expect(document.querySelector('.copy-offer')).toBeNull();
  });
});
