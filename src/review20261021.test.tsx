// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations, type Lang } from './i18n';
import { adoptRetiredGiving, loadMonthData } from './defaults';
import { isNearName, landingOf, mergeInto, type DraftRow } from './budgetImport';
import { newBlank, WALLETS_KEY, OPEN_PANEL_KEY } from './wallets';
import type { BudgetCategory, MonthData } from './types';

// ── Review 2026-10-21 ──────────────────────────────────────────────────────
//
// P0: the retired 🤲 giving category was hidden on reading, so the next edit
//     to an old month wrote its rows away. They now join today's 🎁.
// P1: an import added "Hyra" beside "Hyra/Bolån" — a second rent nobody had.
// P2: choosing Custom opened the wallet last opened from the menu.
// P2: "Import from Excel" for an import that reads Word and CSV too.
// P3: "1 månader", and "skrevs över" for a copy into an empty month.

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
    budget_guide_row_hidden: '1', budget_changelog_seen: '1.13.0', budget_copy_offer_dismissed: '2026', ...extra,
  })) localStorage.setItem(k, v);
};
const oldGiving: BudgetCategory = {
  id: 'givande', name: 'Givande & Välgörenhet', icon: '🤲', color: '#f43f5e',
  rows: [{ id: 'g1', label: 'SYNT Välgörenhet', amount: 500 }, { id: 'g2', label: 'SYNT Gåvor', amount: 300 }],
};
const transport: BudgetCategory = {
  id: 'transport', name: 'Transport', icon: '🚌', color: '#888', rows: [{ id: 't1', label: 'Bil', amount: 2000 }],
};

describe('P0: the retired giving category keeps its rows', () => {
  it('becomes today\'s 🎁 category, rows and amounts intact', () => {
    const out = adoptRetiredGiving([transport, oldGiving], 'sv');
    const g = out.find(c => c.id === 'givande')!;
    expect(g.icon).toBe('🎁');
    expect(g.name).toBe('Gåvor & givande');
    expect(g.rows.map(r => [r.label, r.amount])).toEqual([['SYNT Välgörenhet', 500], ['SYNT Gåvor', 300]]);
    expect(out).toHaveLength(2);
  });

  it('joins a 🎁 category already there: one category, no id twice, nothing counted twice', () => {
    const fresh: BudgetCategory = { id: 'givande', name: 'Gåvor & givande', icon: '🎁', color: '#84cc16',
      rows: [{ id: 'g1', label: 'SYNT Kollekt', amount: 200 }] };
    const out = adoptRetiredGiving([oldGiving, transport, fresh], 'sv');
    expect(out.filter(c => c.id === 'givande')).toHaveLength(1);
    const rows = out.find(c => c.id === 'givande')!.rows;
    expect(rows.map(r => r.label)).toEqual(['SYNT Kollekt', 'SYNT Välgörenhet', 'SYNT Gåvor']);
    expect(new Set(rows.map(r => r.id)).size).toBe(3);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1000);
  });

  it('leaves a month without it untouched', () => {
    const list = [transport];
    expect(adoptRetiredGiving(list, 'sv')).toBe(list);
  });

  it('an unrelated edit to an old month saves the rows; only opening it writes nothing', async () => {
    const raw = JSON.stringify({ income: [{ id: 'in', label: 'Lön', amount: 30000 }], expenses: [transport, oldGiving], savings: [] });
    seed({ budget_2026_9: raw });
    render(<App />);
    expect(document.body.textContent).toContain('SYNT Välgörenhet');
    expect(localStorage.getItem('budget_2026_9')).toBe(raw);

    fireEvent.click(document.querySelector(`button[aria-label="${sv.ariaDeleteRow('Bil')}"]`)!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem('budget_2026_9')!).expenses
      .find((c: BudgetCategory) => c.id === 'transport').rows).toHaveLength(0));
    const stored = JSON.parse(localStorage.getItem('budget_2026_9')!) as MonthData;
    const g = stored.expenses.find(c => c.id === 'givande')!;
    expect(g.icon).toBe('🎁');
    expect(g.rows.map(r => r.amount)).toEqual([500, 300]);

    cleanup();
    render(<App />);
    expect(document.body.textContent).toContain('SYNT Gåvor');
  });

  it('a month that has only the new 🎁 category keeps it', () => {
    const fresh = { id: 'givande', name: 'Gåvor & givande', icon: '🎁', color: '#84cc16', rows: [{ id: 'k', label: 'SYNT Kollekt', amount: 100 }] };
    seed({ budget_2026_9: JSON.stringify({ income: [], expenses: [fresh], savings: [] }) });
    expect(loadMonthData(2026, 9, 'sv').expenses.map(c => c.icon)).toEqual(['🎁']);
  });
});

describe('P1: a near name in an import is asked about, never guessed', () => {
  const row = (label: string, into?: string): DraftRow => ({
    key: label, label, amounts: [12000], target: { kind: 'standard', id: 'boende' }, into,
  });
  const month: MonthData = {
    income: [], savings: [],
    expenses: [{ id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows: [{ id: 'h', label: 'Hyra/Bolån', amount: 12000 }] }],
  };
  const ids = { row: (k: string) => `new-${k}`, category: (n: string) => `cat-${n}` };

  it('knows a near name from a different one', () => {
    expect(isNearName('Hyra', 'Hyra/Bolån')).toBe(true);
    expect(isNearName('El', 'El & Värme')).toBe(true);
    expect(isNearName('Mat', 'Matvaror')).toBe(false);
    expect(isNearName('Hyra', 'hyra')).toBe(false);
  });

  it('says where a row lands', () => {
    expect(landingOf(month, row('Hyra')).near.map(r => r.label)).toEqual(['Hyra/Bolån']);
    expect(landingOf(month, row('Hyra/Bolån')).exact?.label).toBe('Hyra/Bolån');
  });

  it('adds by default, and replaces the row the user chose', () => {
    const added = mergeInto(month, [{ row: row('Hyra'), amount: 12000 }], ids, 'sv');
    expect(added.expenses[0].rows.map(r => r.label)).toEqual(['Hyra/Bolån', 'Hyra']);
    const replaced = mergeInto(month, [{ row: row('Hyra', 'Hyra/Bolån'), amount: 11500 }], ids, 'sv');
    expect(replaced.expenses[0].rows.map(r => [r.label, r.amount])).toEqual([['Hyra/Bolån', 11500]]);
  });

  it('the dialog shows the totals before, offers the choice, and stores what was chosen', async () => {
    seed({ budget_2026_9: JSON.stringify({
      income: [{ id: 'in', label: 'Lön', amount: 30000 }], savings: [],
      expenses: [{ id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1', rows: [
        { id: 'h', label: 'Hyra/Bolån', amount: 12000 }, { id: 'f', label: 'Försäkring', amount: 2900 }] }],
    }) });
    render(<App />);
    fireEvent.click(document.querySelector('.menu-btn')!);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === sv.bimMenu)!);
    await waitFor(() => expect(document.querySelector('.bim-panel')).not.toBeNull());
    fireEvent.change(document.querySelector('.bim-paste textarea')!, { target: { value: 'Post;Belopp\nLön;30000\nHyra;12000\nMat;4000\nKvar;14000' } });
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent === sv.bimRead)!);
    await waitFor(() => expect(document.querySelector('.bim-after')).not.toBeNull());

    // Left alone, "Hyra" would be a second rent: 30 900 kr out, 900 kr short.
    const after = () => document.querySelector('.bim-after')!.textContent!;
    expect(after()).toMatch(/14\s900\skr → 30\s900\skr/);
    expect(document.querySelector('.bim-near')!.textContent).toContain(sv.bimNearAsk('Hyra/Bolån'));
    expect(document.body.textContent).toContain(sv.bimRowReplaces('Lön'));

    fireEvent.change(document.querySelector('.bim-near select')!, { target: { value: 'Hyra/Bolån' } });
    expect(after()).toMatch(/14\s900\skr → 18\s900\skr/);
    expect(document.body.textContent).toContain(sv.bimRowReplaces('Hyra/Bolån'));

    fireEvent.click(document.querySelector('.bim-panel button.csv-primary')!);
    await waitFor(() => expect(document.querySelector('.bim-panel')).toBeNull());
    const stored = JSON.parse(localStorage.getItem('budget_2026_9')!) as MonthData;
    expect(stored.expenses.find(c => c.id === 'boende')!.rows.map(r => [r.label, r.amount]))
      .toEqual([['Hyra/Bolån', 12000], ['Försäkring', 2900]]);
  });
});

describe('P2: choosing Custom shows Custom', () => {
  it('not the wallet last opened from the menu', async () => {
    const w = newBlank({ id: 'w1', name: 'SYNT Resa', total: 5000 });
    seed({ [WALLETS_KEY]: JSON.stringify({ wallets: [w] }), [OPEN_PANEL_KEY]: 'w1' });
    render(<App />);
    fireEvent.click(document.querySelector('.menu-btn')!);
    fireEvent.change(document.getElementById('layout-pick')!, { target: { value: 'custom' } });
    await waitFor(() => expect(document.querySelector('.custom-choice')).not.toBeNull());
    expect(document.querySelector('.custom-choice')!.textContent).toContain(sv.choiceTitle);
    // The wallet is still there to open.
    expect(JSON.parse(localStorage.getItem(WALLETS_KEY)!).wallets).toHaveLength(1);
  });
});

describe('P2/P3: words that say what happens', () => {
  const all = Object.entries(translations) as [Lang, typeof sv][];

  it('the import button promises no particular file format', () => {
    for (const [lang, t] of all) {
      expect(t.bimMenu, lang).not.toMatch(/Excel/);
      expect(t.bimHeroButton, lang).not.toMatch(/Excel/);
    }
  });

  it('one month is one month', () => {
    const wrong = /\b1 (månader|months|meses|mesi)\b/;
    for (const [lang, t] of all) {
      expect(t.copyAllRemaining(1), lang).not.toMatch(wrong);
      expect(t.copiedToMonths(1), lang).not.toMatch(wrong);
    }
    expect(sv.copyAllRemaining(1)).toBe('Alla återstående (1 månad)');
  });

  it('a copy says copied, not overwritten', () => {
    expect(sv.undoWhat('copyBudget', 'november', 1)).toBe('Budgeten kopierades till november');
    expect(sv.undoWhat('copyBudget', '', 2)).toBe('Budgeten kopierades till 2 månader');
    for (const [lang, t] of all) expect(t.undoWhat('copyBudget', 'X', 1), lang).not.toMatch(/skrevs över|written over|sobrescrib|überschrieben|sovrascritt|sobrescrit|перезапис|üzerine yaz|上書き|覆盖|remplacé/);
  });
});
