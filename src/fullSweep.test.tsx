// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { installStorage } from './storage';
import { createCachedStorage, type AsyncBackend } from './storageCache';
import { translations, formatMoney } from './i18n';
import { Capacitor } from '@capacitor/core';

// Android's Back button, as the app registers it.
const native = vi.hoisted(() => ({
  back: null as null | (() => void),
  minimized: 0,
}));
vi.mock('./nativeShare', () => ({ shareBackupFile: async () => 'shared' }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (_event: string, cb: () => void) => {
      native.back = cb;
      return { remove: async () => {} };
    },
    minimizeApp: async () => { native.minimized += 1; },
  },
}));

// ── Full sweep, 2026-10-08 ──────────────────────────────────────────────────
//
// The app over the same cached store the phones install, with a database that
// can be made slow. Synthetic values only.

const sv = translations.sv;

const makeBackend = (seed: Record<string, string>) => {
  const disk = new Map(Object.entries(seed));
  let gate: Promise<void> | null = null;
  let open: () => void = () => {};
  const b: AsyncBackend & { disk: Map<string, string>; hold(): void; release(): void } = {
    disk,
    hold() { gate = new Promise(r => { open = r; }); },
    release() { gate = null; open(); },
    async loadAll() { return Object.fromEntries(disk); },
    async write(k, v) { disk.set(k, v); },
    async remove(k) { disk.delete(k); },
    async commit(changes) {
      if (gate) await gate;
      for (const c of changes) {
        if (c.value === null) disk.delete(c.key); else disk.set(c.key, c.value);
      }
    },
  };
  return b;
};

const SEPT = JSON.stringify({
  income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
  expenses: [{ id: 'boende', name: 'Boende', icon: '•', color: '#888', userNamed: true,
    rows: [{ id: 'hyra', label: 'Hyra', amount: 9000, userNamed: true }] }],
  savings: [],
});

let b: ReturnType<typeof makeBackend>;

const boot = async (extra: Record<string, string> = {}) => {
  b = makeBackend({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_changelog_seen: 'x', budget_2026_8: SEPT, ...extra,
  });
  const store = createCachedStorage(b);
  await store.hydrate();
  installStorage(store);
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());
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
  vi.stubGlobal('alert', () => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe('Follow-up: adding an entry', () => {
  it('a double tap on "Add" while the database is busy adds the entry once', async () => {
    await boot();
    fireEvent.click(buttonWith(sv.tabFollowUp)!);
    await waitFor(() => expect(buttonWith('Boende')).toBeTruthy());
    fireEvent.click([...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Boende'))!);
    fireEvent.click(buttonWith(sv.followUpAddEntry)!);
    fireEvent.change(document.querySelector('.followup-form-text')!, { target: { value: 'SYNT HYRA' } });
    fireEvent.change(document.querySelector('.followup-form-amount')!, { target: { value: '9000' } });
    b.hold();
    const save = document.querySelector<HTMLButtonElement>('.followup-form-save')!;
    fireEvent.click(save);
    fireEvent.click(save);
    b.release();
    await waitFor(() => expect(document.querySelector('.followup-form')).toBeNull());
    await settle();
    const stored = JSON.parse(b.disk.get('budget_actuals_2026_8') ?? '[]') as { text: string }[];
    expect(stored.map(e => e.text)).toEqual(['SYNT HYRA']);
  });
});

describe('Custom (standalone): copy last month', () => {
  const STRUCT = JSON.stringify([{
    id: 'b', name: 'Resan', userNamed: true, kind: 'block', tag: 'out', width: 'full',
    rows: [{ id: 'x', name: 'Tåg', userNamed: true }],
    chart: { show: false, type: 'bars', size: 'M', position: 'bottom' },
  }]);
  const custom = {
    budget_layout: 'custom', budget_custom_mode: 'standalone', budget_custom_help_seen: '1',
    budget_custom_v3: STRUCT,
  };

  it('from a month with nothing recorded, leaves this month alone and says so', async () => {
    await boot({ ...custom, budget_custom_v3_values_2026_8: '{"x":1234}' });
    await waitFor(() => expect(buttonWith(sv.copyLastMonth)).toBeTruthy());
    fireEvent.click(buttonWith(sv.copyLastMonth)!);
    await settle();
    expect(document.body.textContent).toContain(sv.copyPrevMonthEmpty('Augusti'));
    expect(b.disk.get('budget_custom_v3_values_2026_8')).toBe('{"x":1234}');
    expect(b.disk.has('budget_undo')).toBe(false);
  });

  it('from a month that has amounts, still copies them', async () => {
    await boot({ ...custom, budget_custom_v3_values_2026_7: '{"x":500}', budget_custom_v3_values_2026_8: '{"x":1234}' });
    await waitFor(() => expect(buttonWith(sv.copyLastMonth)).toBeTruthy());
    fireEvent.click(buttonWith(sv.copyLastMonth)!);
    await waitFor(() => expect(b.disk.get('budget_custom_v3_values_2026_8')).toBe('{"x":500}'));
  });
});

describe('Combined layout: the year and the savings plan follow an edit at once', () => {
  const editAmount = (label: string, from: number, to: string) => {
    fireEvent.click(document.querySelector(`[aria-label="${sv.ariaEditAmount(label, formatMoney(from, 'sek'))}"]`)!);
    const input = document.activeElement as HTMLInputElement;
    fireEvent.change(input, { target: { value: to } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  it('the year table shows the new income straight away', async () => {
    await boot({ budget_layout: 'combined' });
    await waitFor(() => expect(document.querySelector('.year-tab')?.textContent).toContain(formatMoney(30000, 'sek')));
    editAmount('Lön', 30000, '41000');
    await waitFor(() => expect(b.disk.get('budget_2026_8')).toContain('41000'));
    expect(document.querySelector('.year-tab')?.textContent).toContain(formatMoney(41000, 'sek'));
  });

  it('"ahead of the plan" follows a savings balance edit straight away', async () => {
    const withSavings = (amount: number) => JSON.stringify({
      ...JSON.parse(SEPT),
      savings: [{ id: 'konto', name: 'Konto', icon: '•', color: '#888', userNamed: true,
        rows: [{ id: 'k1', label: 'Konto', amount, userNamed: true }] }],
      savingsSnapshotRecorded: true,
    });
    await boot({
      budget_layout: 'combined',
      budget_onboard_savings: '1',
      budget_2026_7: withSavings(10000),
      budget_2026_8: withSavings(11000),
      budget_savings_plan: JSON.stringify({ monthlyAmount: 1000, annualReturnPct: 0, startAmount: 0, startYM: '2026-08', years: 5 }),
    });
    await waitFor(() => expect(document.querySelector('.sparplan-badge')).not.toBeNull());
    expect(document.querySelector('.sparplan-badge')?.textContent).not.toContain(sv.sparplanAhead(formatMoney(4000, 'sek')));
    editAmount('Konto', 11000, '15000');
    await waitFor(() => expect(b.disk.get('budget_2026_8')).toContain('15000'));
    expect(document.querySelector('.sparplan-badge')?.textContent).toContain(sv.sparplanAhead(formatMoney(4000, 'sek')));
  });
});

describe('Android Back on the wallets screen', () => {
  it('goes back to the budget instead of leaving the app', async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    native.back = null;
    native.minimized = 0;
    await boot({ budget_layout: 'combined' });
    fireEvent.click(buttonWith(sv.menu)!);
    fireEvent.click(buttonWith(`✈️ ${sv.wMenu}`)!);
    await waitFor(() => expect(document.querySelector('.wallet')).not.toBeNull());
    await waitFor(() => expect(native.back).not.toBeNull());
    act(() => { native.back!(); });
    expect(native.minimized).toBe(0);
    expect(document.querySelector('.wallet')).toBeNull();
    expect(document.querySelector('.combined-page')).not.toBeNull();
    // From the budget itself, Back still leaves, as before.
    act(() => { native.back!(); });
    await settle();
    expect(native.minimized).toBe(1);
  });
});

describe('Follow-up: spent to the cent', () => {
  it('shows ✓ rather than a "+0 kr" overrun', async () => {
    await boot({
      budget_2026_8: JSON.stringify({
        income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
        expenses: [{ id: 'boende', name: 'Boende', icon: '•', color: '#888', userNamed: true,
          rows: [{ id: 'hyra', label: 'Hyra', amount: 60.3, userNamed: true }] }],
        savings: [],
      }),
      budget_actuals_2026_8: JSON.stringify([
        { id: 'e1', date: '2026-09-03', text: 'SYNT A', amount: 20.1, direction: 'out', categoryId: 'boende' },
        { id: 'e2', date: '2026-09-04', text: 'SYNT B', amount: 40.2, direction: 'out', categoryId: 'boende' },
      ]),
    });
    fireEvent.click(buttonWith(sv.tabFollowUp)!);
    await waitFor(() => expect(buttonWith('Boende')).toBeTruthy());
    const row = [...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Boende'))!;
    expect(row.querySelector('.followup-diff')?.textContent).toBe('✓');
  });
});

describe('Custom (linked): typing over a savings row linked to a goal', () => {
  it('moves the goal by what changed, not by every keystroke on the way', async () => {
    await boot({
      budget_layout: 'custom', budget_custom_mode: 'linked', budget_custom_help_seen: '1',
      budget_historic_goal_rows_migrated: '1',
      budget_plan: JSON.stringify({ goals: [{ id: 'g1', name: 'Buffert', targetAmount: 10000, currentAmount: 300,
        deadline: '', color: '#22c55e', budgetRowId: 'sr1', userNamed: true }], notes: '' }),
      budget_2026_8: JSON.stringify({
        income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
        expenses: [{ id: 'sparande', name: 'Sparande', icon: '•', color: '#888', userNamed: true,
          rows: [{ id: 'sr1', label: 'Buffert', amount: 1000, userNamed: true }] }],
        savings: [],
      }),
    });
    await waitFor(() => expect(document.querySelector('[aria-label*="Buffert"].cv3-amount-input')).not.toBeNull());
    const input = document.querySelector<HTMLInputElement>('[aria-label*="Buffert"].cv3-amount-input')!;
    for (const v of ['1', '15', '150', '1500']) fireEvent.change(input, { target: { value: v } });
    fireEvent.blur(input);
    await waitFor(() => expect(b.disk.get('budget_2026_8')).toContain('1500'));
    await settle();
    const goal = JSON.parse(b.disk.get('budget_plan')!).goals[0] as { currentAmount: number };
    // 300 + (1500 − 1000). Keystroke by keystroke it was 1 499.
    expect(goal.currentAmount).toBe(800);
  });
});

describe('Renaming a goal’s budget row', () => {
  it('renames the goal and the same row in every other month', async () => {
    const withRow = (label: string) => JSON.stringify({
      income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
      expenses: [{ id: 'sparande', name: 'Sparande', icon: '•', color: '#888', userNamed: true,
        rows: [{ id: 'sr1', label, amount: 500, userNamed: true }] }],
      savings: [],
    });
    await boot({
      budget_historic_goal_rows_migrated: '1',
      budget_plan: JSON.stringify({ goals: [{ id: 'g1', name: 'Buffert', targetAmount: 10000, currentAmount: 0,
        deadline: '', color: '#22c55e', budgetRowId: 'sr1', userNamed: true }], notes: '' }),
      budget_2026_7: withRow('Buffert'),
      budget_2026_8: withRow('Buffert'),
      budget_2026_9: withRow('Buffert'),
    });
    const label = [...document.querySelectorAll<HTMLButtonElement>('button.editable-label')].find(x => x.textContent === 'Buffert')!;
    fireEvent.click(label);
    const input = document.querySelector<HTMLInputElement>('input.label-input')!;
    fireEvent.change(input, { target: { value: 'Japan 2027' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(b.disk.get('budget_2026_8')).toContain('Japan 2027'));
    await settle();
    const rowLabel = (key: string) => JSON.parse(b.disk.get(key)!).expenses[0].rows[0].label;
    expect(rowLabel('budget_2026_7')).toBe('Japan 2027');
    expect(rowLabel('budget_2026_9')).toBe('Japan 2027');
    expect(JSON.parse(b.disk.get('budget_plan')!).goals[0].name).toBe('Japan 2027');
  });
});

describe('Combined layout: the Debt tab follows a loan payment recorded in Follow-up', () => {
  it('"paid this month" updates as soon as the entry is stored', async () => {
    await boot({
      budget_layout: 'combined',
      budget_2026_8: JSON.stringify({
        income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
        expenses: [{ id: 'lan', name: 'Lån', icon: '•', color: '#888', userNamed: true,
          rows: [{ id: 'csn', label: 'CSN', amount: 1200, userNamed: true }] }],
        savings: [],
      }),
      budget_debts: JSON.stringify({ debts: [{ id: 'd1', name: 'CSN', kind: 'csn', balance: 100000,
        balanceDate: '2026-09-01', ratePct: 1, monthlyPayment: 1200, budgetRowId: 'csn' }],
        extraPerMonth: 0, strategy: 'avalanche', plainRows: [] }),
    });
    await waitFor(() => expect(document.querySelector('.debt-notes')).not.toBeNull());
    expect(document.querySelector('.debt-notes')!.textContent).not.toContain(formatMoney(1234, 'sek'));
    const lanRow = () => [...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Lån'));
    await waitFor(() => expect(lanRow()).toBeTruthy());
    fireEvent.click(lanRow()!);
    fireEvent.click(buttonWith(sv.followUpAddEntry)!);
    fireEvent.change(document.querySelector('.followup-form-text')!, { target: { value: 'SYNT CSN' } });
    fireEvent.change(document.querySelector('.followup-form-amount')!, { target: { value: '1234' } });
    fireEvent.click(document.querySelector('.followup-form-save')!);
    await waitFor(() => expect(b.disk.get('budget_actuals_2026_8')).toContain('SYNT CSN'));
    await waitFor(() => expect(document.querySelector('.debt-notes')!.textContent).toContain(formatMoney(1234, 'sek')));
  });
});

describe('Backup in the apps, sent through the share sheet', () => {
  it('asks in the share sheet\'s words, not about a download', async () => {
    const asked: string[] = [];
    vi.stubGlobal('confirm', (m: string) => { asked.push(m); return true; });
    await boot();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    fireEvent.click(buttonWith(sv.menu)!);
    fireEvent.click(buttonWith(sv.exportData)!);
    await waitFor(() => expect(asked).toContain(sv.backupConfirmShared));
    expect(asked).not.toContain(sv.backupConfirmSaved);
    await waitFor(() => expect(b.disk.has('budget_last_backup')).toBe(true));
  });
});

describe('Month names mid-sentence are lower case in Swedish and Spanish', () => {
  it('reset month and pull from last month say "september", not "September"', async () => {
    const asked: string[] = [];
    vi.stubGlobal('confirm', (m: string) => { asked.push(m); return false; });
    await boot({ budget_2026_7: SEPT });
    fireEvent.click(buttonWith(sv.menu)!);
    fireEvent.click(buttonWith(sv.resetMonth)!);
    // Declined, so the menu is still open.
    fireEvent.click([...document.querySelectorAll('button.utils-action')].find(x => x.textContent?.startsWith('←'))!);
    expect(asked[0]).toContain('för september 2026');
    expect(asked[1]).toContain('i september 2026 med de från augusti');
    expect(asked.join(' ')).not.toMatch(/September|Augusti/);
  });
});

describe('Follow-up: moving a place moves only what the row shows', () => {
  const ENTRIES = JSON.stringify([
    { id: 'u1', date: '2026-09-03', text: 'SYNT ICA', amount: 100, direction: 'out', categoryId: '__unsorted__' },
    { id: 'u2', date: '2026-09-04', text: 'SYNT ICA', amount: 200, direction: 'out', categoryId: '__unsorted__' },
    { id: 'u3', date: '2026-09-05', text: 'synt ica', amount: 300, direction: 'out', categoryId: '__unsorted__' },
    { id: 'f1', date: '2026-09-06', text: 'SYNT ICA', amount: 400, direction: 'out', categoryId: 'fritid' },
    { id: 'r1', date: '2026-09-07', text: 'SYNT ICA', amount: 50, direction: 'in', categoryId: '__income__' },
  ]);
  const where = () => Object.fromEntries(
    (JSON.parse(b.disk.get('budget_actuals_2026_8')!) as { id: string; categoryId: string }[]).map(e => [e.id, e.categoryId]),
  );
  const expectOnlyTheThree = () => expect(where()).toEqual({
    u1: 'boende', u2: 'boende', u3: 'boende', f1: 'fritid', r1: '__income__',
  });
  const open = async () => {
    await boot({ budget_actuals_2026_8: ENTRIES });
    fireEvent.click(buttonWith(sv.tabFollowUp)!);
    await waitFor(() => expect(buttonWith(sv.followUpUnsorted)).toBeTruthy());
  };

  it('from inside a row: exactly the row’s entries move, and the rule is learned', async () => {
    await open();
    fireEvent.click([...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes(sv.followUpUnsorted))!);
    // The row says three, and three move.
    expect(document.querySelector('.followup-place-count')?.textContent).toBe(sv.csvRows(3));
    fireEvent.change(document.querySelector('select.followup-place-move')!, { target: { value: 'boende' } });
    await waitFor(() => expect(where().u1).toBe('boende'));
    expectOnlyTheThree();
    expect((b.disk.get('budget_category_rules') ?? '').toLowerCase()).toContain('boende');
  });

  it('from the leftover list: only the unsorted entries move', async () => {
    await open();
    fireEvent.click(buttonWith(sv.triageOpen)!);
    fireEvent.change(document.querySelector('select.triage-other')!, { target: { value: 'boende' } });
    await waitFor(() => expect(where().u1).toBe('boende'));
    expectOnlyTheThree();
  });
});
