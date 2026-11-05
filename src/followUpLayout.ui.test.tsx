// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { FOLLOWUP_LAYOUT_KEY } from './followUpLayout';
import { UNSORTED_ACTUAL_ID } from './actuals';

// ── The Follow-up tab: sub-tabs by default, boxes on request (Ariel, 2026-11-05)
//
// It was one long column with the table 1 700 px down on a phone. Now one part
// at a time, and a choice behind ⋯ for anyone who would rather have them all on
// one page. These test what a person sees and keeps; the figures are tested
// where they are made.

const sv = translations.sv;

const month = JSON.stringify({
  income: [{ id: 'in', label: 'Lön', amount: 30000 }],
  expenses: [{ id: 'mat', name: 'Mat', icon: '🛒', color: '#f59e0b', rows: [{ id: 'g', label: 'Matvaror', amount: 4000 }] }],
  savings: [],
});
const entry = (id: string, text: string, amount: number, categoryId: string) =>
  ({ id, date: '2026-10-05', text, amount, categoryId, direction: 'out' });

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
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_guide_row_hidden: '1', budget_2026_9: month,
    budget_actuals_2026_9: JSON.stringify([
      entry('a1', 'SYNT Butik', 400, 'mat'),
      entry('a2', 'SYNT Kiosk', 60, UNSORTED_ACTUAL_ID),
      entry('a3', 'SYNT Kiosk', 40, UNSORTED_ACTUAL_ID),
    ]),
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));
const subtab = (label: string) =>
  [...document.querySelectorAll('.followup-subtab')].find(el => el.textContent?.includes(label)) as HTMLElement;
const open = async () => {
  render(<App />);
  fireEvent.click(buttonWith(sv.tabFollowUp)!);
  await waitFor(() => expect(document.querySelector('.followup-tab')).not.toBeNull());
};
const chooseLayout = (label: string) => {
  fireEvent.click(document.querySelector('.followup-more-btn')!);
  fireEvent.click([...document.querySelectorAll('.followup-more-item')].find(el => el.textContent?.includes(label))!);
};

describe('Follow-up under sub-tabs (the default)', () => {
  it('opens on the table, with the long parts one tap away', async () => {
    await open();
    expect(document.querySelector('.followup-table')).not.toBeNull();
    expect(document.querySelector('.q-card')).toBeNull();
    expect(document.querySelector('.spending-card')).toBeNull();
    expect(document.querySelector('.triage')).toBeNull();
    expect([...document.querySelectorAll('.followup-subtab')].map(el => el.textContent?.replace(/\d+$/, '')))
      .toEqual([sv.followUpSecOverview, sv.triageOpen, sv.followUpSecPurchases, sv.followUpSecQuestions]);
  });

  it('counts what waits for a category on the Sort tab, and reminds you on the overview', async () => {
    await open();
    expect(subtab(sv.triageOpen).textContent).toContain('2');
    expect(document.querySelector('.followup-nudge')?.textContent).toContain(sv.triageWaiting(2));
  });

  it('shows one part at a time, and the sorting list is open without a toggle', async () => {
    await open();
    fireEvent.click(subtab(sv.triageOpen));
    expect(document.querySelector('.followup-table')).toBeNull();
    expect(document.querySelector('.triage-list')).not.toBeNull();
    expect(document.querySelector('.triage-toggle')).toBeNull();

    fireEvent.click(subtab(sv.followUpSecPurchases));
    expect(document.querySelector('.spending-card')).not.toBeNull();
    expect(document.querySelector('.triage')).toBeNull();

    fireEvent.click(subtab(sv.followUpSecQuestions));
    expect(document.querySelector('.q-card')).not.toBeNull();

    fireEvent.click(subtab(sv.followUpSecOverview));
    expect(document.querySelector('.followup-table')).not.toBeNull();
  });

  it('the nudge takes you to Sort', async () => {
    await open();
    fireEvent.click(document.querySelector('.followup-nudge button')!);
    expect(document.querySelector('.triage-list')).not.toBeNull();
  });

  it('keeps Import outside the menu and puts the clearing and the help inside it', async () => {
    await open();
    expect(buttonWith(sv.followUpImport)).toBeTruthy();
    expect(document.querySelector('.followup-clear-all')).toBeNull();
    fireEvent.click(document.querySelector('.followup-more-btn')!);
    const items = [...document.querySelectorAll('.followup-more-item')].map(el => el.textContent);
    expect(items.some(t => t?.includes(sv.followUpClear))).toBe(true);
    expect(items.some(t => t?.includes(sv.followUpClearAll))).toBe(true);
    expect(items.some(t => t?.includes(sv.followUpHelpTitle))).toBe(true);
  });

  it('closes the menu on Escape', async () => {
    await open();
    fireEvent.click(document.querySelector('.followup-more-btn')!);
    expect(document.querySelector('.followup-more-menu')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.followup-more-menu')).toBeNull();
  });
});

describe('Follow-up as boxes', () => {
  it('shows every part on one page, and remembers the choice', async () => {
    await open();
    chooseLayout(sv.followUpLayoutBoxes);
    expect(document.querySelector('.followup-subtabs')).toBeNull();
    for (const sel of ['.followup-table', '.triage', '.spending-card', '.q-card']) {
      expect(document.querySelector(sel), sel).not.toBeNull();
    }
    expect(localStorage.getItem(FOLLOWUP_LAYOUT_KEY)).toBe('boxes');
  });

  it('starts as boxes for someone who chose them, and the list is still folded away', async () => {
    localStorage.setItem(FOLLOWUP_LAYOUT_KEY, 'boxes');
    await open();
    expect(document.querySelector('.followup-subtabs')).toBeNull();
    expect(document.querySelector('.triage')).not.toBeNull();
    expect(document.querySelector('.triage-list')).toBeNull();
    fireEvent.click(document.querySelector('.triage-toggle')!);
    expect(document.querySelector('.triage-list')).not.toBeNull();
  });

  it('goes back to sub-tabs, and forgets the choice as the default needs no key', async () => {
    localStorage.setItem(FOLLOWUP_LAYOUT_KEY, 'boxes');
    await open();
    chooseLayout(sv.followUpLayoutTabs);
    expect(document.querySelector('.followup-subtabs')).not.toBeNull();
    expect(localStorage.getItem(FOLLOWUP_LAYOUT_KEY)).toBeNull();
  });
});

describe('after an import (Ariel, 2026-11-05)', () => {
  const importCsv = async (csv: string) => {
    fireEvent.click(buttonWith(sv.followUpImport)!);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[type=file][accept*=csv]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.change(input, { target: { files: [new File([csv], 'synt.csv', { type: 'text/csv' })] } });
    await waitFor(() => expect(document.querySelector('.csv-cols, .csv-groups')).not.toBeNull());
    if (document.querySelector('.csv-cols')) fireEvent.click(document.querySelector('.csv-actions .csv-primary')!);
    await waitFor(() => expect(document.querySelector('.csv-groups')).not.toBeNull());
    fireEvent.click(document.querySelector('.csv-actions .csv-primary')!);
    await waitFor(() => expect(document.querySelector('.csv-groups')).toBeNull());
  };

  it('goes straight to Sort when the import left something to sort', async () => {
    localStorage.setItem('budget_actuals_2026_9', JSON.stringify([entry('a1', 'SYNT Butik', 400, 'mat')]));
    await open();
    expect(subtab(sv.followUpSecSort)).toBeUndefined();
    await importCsv('Datum;Text;Belopp\n2026-10-06;SYNT Okänt ställe;-120\n2026-10-07;SYNT Okänt ställe;-80\n');
    await waitFor(() => expect(subtab(sv.followUpSecSort)?.getAttribute('aria-selected')).toBe('true'));
  });

  it('an import into another month goes to Sort there, once its "show" button is followed', async () => {
    localStorage.setItem('budget_actuals_2026_9', JSON.stringify([entry('a1', 'SYNT Butik', 400, 'mat')]));
    await open();
    await importCsv('Datum;Text;Belopp\n2026-09-06;SYNT Okänt ställe;-120\n');
    // October, the month in view, has nothing new to sort: it stays put.
    expect(subtab(sv.followUpSecSort)).toBeUndefined();
    fireEvent.click(document.querySelector('.followup-toast-go')!);
    await waitFor(() => expect(subtab(sv.followUpSecSort)?.getAttribute('aria-selected')).toBe('true'));
  });
});
