// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import App from './App';
import { loadCustomMode, customResetKeys } from './customMode';
import { linkedSummary, defaultLinkedLayout } from './customLinked';
import { checkBackup } from './backup';
import type { StorageLike } from './storage';
import type { MonthData } from './types';

// ── Custom: linked or standalone, chosen first, and Start over ──────────────
//
// The tab bar briefly showed Follow-up, Savings and Plan next to a STANDALONE
// Custom budget — tabs about the regular budget beside blocks holding other
// numbers. The decision since (Ariel, 2026-09-23):
//
//   · The user chooses first: linked to the regular budget, or standalone.
//   · Linked: the blocks ARE the regular budget, laid out differently. Every
//     amount lives in budget_<year>_<month>, and every tab is shown.
//   · Standalone: its own amounts, and no tabs about someone else's numbers.
//   · "Start over" returns to the choice, and never touches the regular budget.

const SEPT: MonthData = {
  income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
  expenses: [
    { id: 'boende', name: 'Boende', icon: '🏠', color: '#f87171', userNamed: true,
      rows: [{ id: 'hyra', label: 'Hyra', amount: 9000, userNamed: true }] },
    { id: 'sparande', name: 'Sparande', icon: '🏦', color: '#22d3ee', userNamed: true,
      rows: [{ id: 'buf', label: 'Buffert', amount: 3000, userNamed: true }] },
  ],
  savings: [],
};
const BUDGET_KEY = 'budget_2026_8';

/** A plain in-memory storage for the pure functions. */
const createMemoryStorage = (seed: Record<string, string> = {}): StorageLike => {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

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
  localStorage.setItem('budget_layout', 'custom');
  localStorage.setItem(BUDGET_KEY, JSON.stringify(SEPT));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent?.includes(label));
const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');
const tabLabels = () =>
  [...document.querySelectorAll('.tab-nav button')].map(b => b.getAttribute('aria-label'));

const openApp = async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.custom-canvas')).not.toBeNull());
};
const chooseLinked = async () => {
  await openApp();
  fireEvent.click(buttonWith('Välj kopplad')!);
  await waitFor(() => expect(document.querySelector('.custom-section')).not.toBeNull());
};

describe('the mode on this device', () => {
  it('is not chosen on a fresh device', () => {
    expect(loadCustomMode(createMemoryStorage())).toBeNull();
  });

  it('is standalone for anyone who built Custom before modes existed', () => {
    const s = createMemoryStorage({ budget_custom_v3: '[]' });
    expect(loadCustomMode(s)).toBe('standalone');
  });

  it('is what was chosen, once chosen', () => {
    const s = createMemoryStorage({ budget_custom_v3: '[]', budget_custom_mode: 'linked' });
    expect(loadCustomMode(s)).toBe('linked');
  });
});

describe('the first screen is the choice', () => {
  it('asks before building anything, and shows no tabs yet', async () => {
    await openApp();
    expect(document.body.textContent).toContain('Vad ska Anpassad vara?');
    expect(buttonWith('Välj kopplad')).toBeDefined();
    expect(buttonWith('Välj fristående')).toBeDefined();
    expect(document.querySelector('.tab-nav')).toBeNull();
  });

  it('keeps an existing Custom budget as standalone, without asking', async () => {
    localStorage.setItem('budget_custom_v3', JSON.stringify([{
      id: 'b', name: 'Resan', userNamed: true, kind: 'block', tag: 'out', width: 'full', rows: [],
      chart: { show: false, type: 'bars', size: 'M', position: 'bottom' },
    }]));
    await openApp();
    expect(document.body.textContent).not.toContain('Vad ska Anpassad vara?');
    expect(document.body.textContent).toContain('Resan');
    expect(document.querySelector('.tab-nav')).toBeNull();
  });
});

describe('a linked panel is the regular budget', () => {
  it('opens with the budget’s own income and categories', async () => {
    await chooseLinked();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Boende');
    expect(text).toContain('Hyra');
    expect(text).toContain('Kopplad till din vanliga budget');
    expect(localStorage.getItem('budget_custom_mode')).toBe('linked');
  });

  it('shows every tab, Year included, since they describe the same numbers', async () => {
    await chooseLinked();
    expect(tabLabels()).toEqual(['Anpassad', 'Uppföljning', 'Sparande & Investeringar', 'Plan & Översikt', 'År']);
  });

  it('writes a typed amount to the regular budget, and nowhere else', async () => {
    await chooseLinked();
    const hyra = screen.getByLabelText(/Boende – Hyra/);
    act(() => { fireEvent.change(hyra, { target: { value: '9500' } }); });
    await waitFor(() => {
      const month = stored(BUDGET_KEY) as MonthData;
      expect(month.expenses.find(c => c.id === 'boende')!.rows[0].amount).toBe(9500);
    });
    const customKeys = Object.keys(localStorage).filter(k => k.startsWith('budget_custom_v3'));
    expect(customKeys).toEqual([]);
  });

  it('removes a block from the panel without touching the budget', async () => {
    await chooseLinked();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(screen.getByLabelText(/Ta bort Boende från panelen/));
    expect(document.body.textContent).not.toContain('Hyra');
    expect((stored(BUDGET_KEY) as MonthData).expenses.map(c => c.id)).toEqual(['boende', 'sparande']);
  });

  it('says so when this month’s budget lacks a category the panel shows', async () => {
    localStorage.setItem('budget_custom_mode', 'linked');
    localStorage.setItem('budget_custom_linked', JSON.stringify([
      { id: 'x', source: { kind: 'category', id: 'transport' }, name: 'Transport', width: 'half', bg: null,
        chart: { show: false, type: 'bars', size: 'M', position: 'bottom' } },
    ]));
    await openApp();
    expect(document.body.textContent).toContain('Transport finns inte i budgeten för september 2026');
  });
});

describe('a month with no budget at all', () => {
  it('offers last month once, and marks each block unknown rather than repeating why', async () => {
    localStorage.setItem('budget_custom_mode', 'linked');
    localStorage.setItem('budget_custom_linked', JSON.stringify(defaultLinkedLayout(SEPT)));
    localStorage.setItem('budget_2026_7', JSON.stringify(SEPT));
    localStorage.removeItem(BUDGET_KEY);
    await openApp();
    expect(document.querySelector('.custom-month-empty')?.textContent).toContain('Kopiera augusti');
    expect(document.body.textContent).not.toContain('finns inte i budgeten');
    expect(document.querySelectorAll('.cv3-linked-missing .amount-unknown').length).toBe(2);
  });
});

describe('the linked summary', () => {
  it('shows Kvar before saving, and after it equal to the regular budget’s Kvar', () => {
    const s = linkedSummary(SEPT);
    expect(s).toEqual({ income: 30000, expenses: 9000, saved: 3000, remaining: 21000 });
    // The regular budget counts savings as an expense category: 30 000 − 12 000.
    expect(s.remaining - s.saved).toBe(18000);
  });

  it('starts from everything the month holds, then the summary', () => {
    const kinds = defaultLinkedLayout(SEPT).map(b => (b.source.kind === 'category' ? b.source.id : b.source.kind));
    expect(kinds).toEqual(['income', 'boende', 'sparande', 'summary']);
  });
});

describe('Start over', () => {
  it('removes only what the chosen mode owns — never the regular budget', () => {
    const s = createMemoryStorage({
      budget_custom_v3: '[]', budget_custom_v3_values_2026_8: '{}', budget_custom_v3_meta_2026_8: '{}',
      budget_custom_linked: '[]', budget_custom_mode: 'standalone', [BUDGET_KEY]: '{}',
    });
    expect(customResetKeys(s, 'standalone').sort()).toEqual([
      'budget_custom_mode', 'budget_custom_v3', 'budget_custom_v3_meta_2026_8', 'budget_custom_v3_values_2026_8',
    ]);
    expect(customResetKeys(s, 'linked').sort()).toEqual(['budget_custom_linked', 'budget_custom_mode']);
  });

  it('takes a linked panel back to the choice, with the budget intact and a way back', async () => {
    await chooseLinked();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(buttonWith('Börja om')!);
    await waitFor(() => expect(document.body.textContent).toContain('Vad ska Anpassad vara?'));
    expect(localStorage.getItem('budget_custom_linked')).toBeNull();
    expect(localStorage.getItem('budget_custom_mode')).toBeNull();
    expect(stored(BUDGET_KEY)).toEqual(SEPT);
    expect(document.querySelector('.tab-nav')).toBeNull();
    expect(stored('budget_undo')[0].action).toBe('resetCustom');
  });

  it('asks first, and a no changes nothing', async () => {
    vi.stubGlobal('confirm', () => false);
    await chooseLinked();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(buttonWith('Börja om')!);
    expect(localStorage.getItem('budget_custom_mode')).toBe('linked');
    expect(document.querySelector('.custom-section')).not.toBeNull();
  });

  it('clears a standalone budget’s own amounts in every month', async () => {
    localStorage.setItem('budget_custom_mode', 'standalone');
    localStorage.setItem('budget_custom_v3', JSON.stringify([{
      id: 'b', name: 'Resan', userNamed: true, kind: 'block', tag: 'out', width: 'full',
      rows: [{ id: 'r', name: 'Flyg', color: '#fff', userNamed: true }],
      chart: { show: false, type: 'bars', size: 'M', position: 'bottom' },
    }]));
    localStorage.setItem('budget_custom_v3_values_2026_3', JSON.stringify({ r: 8000 }));
    await openApp();
    fireEvent.click(buttonWith('Redigera layout')!);
    fireEvent.click(buttonWith('Börja om')!);
    await waitFor(() => expect(document.body.textContent).toContain('Vad ska Anpassad vara?'));
    expect(localStorage.getItem('budget_custom_v3')).toBeNull();
    expect(localStorage.getItem('budget_custom_v3_values_2026_3')).toBeNull();
    expect(stored(BUDGET_KEY)).toEqual(SEPT);
    // Every removed key is in the step back.
    const keys = (stored('budget_undo')[0].changes as { key: string }[]).map(c => c.key);
    expect(keys).toContain('budget_custom_v3_values_2026_3');
  });

  it('goes straight back from a standalone panel with nothing built yet', async () => {
    await openApp();
    fireEvent.click(buttonWith('Välj fristående')!);
    await waitFor(() => expect(buttonWith('Välj en annan sorts panel')).toBeDefined());
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    fireEvent.click(buttonWith('Välj en annan sorts panel')!);
    await waitFor(() => expect(document.body.textContent).toContain('Vad ska Anpassad vara?'));
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('a backup carrying the choice', () => {
  const backup = (data: Record<string, string>) =>
    JSON.stringify({ app: 'budget', version: 1, exportedAt: '2026-09-23T10:00:00Z', data });

  it('accepts both modes and a linked layout', () => {
    expect(checkBackup(backup({ budget_custom_mode: 'linked', budget_custom_linked: '[{"source":{"kind":"income"}}]' })).ok).toBe(true);
    expect(checkBackup(backup({ budget_custom_mode: 'standalone' })).ok).toBe(true);
  });

  it('refuses a mode that is neither', () => {
    expect(checkBackup(backup({ budget_custom_mode: 'both' })).ok).toBe(false);
  });
});
