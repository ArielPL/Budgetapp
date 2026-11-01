// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import App from './App';
import { installStorage } from './storage';
import { createCachedStorage, type AsyncBackend } from './storageCache';
import { translations, formatMoney } from './i18n';

// ── Tools in the app (2026-10-17) ───────────────────────────────────────────
//
// "What if…?", "What do I need to save?", search, and the Debt tab's "Try an
// amount". A try-out stores nothing; a change happens only through the
// confirmation box, and Cancel leaves storage as it was. Synthetic values only.

const sv = translations.sv;
const kr = (n: number) => formatMoney(n, 'sek');

const makeBackend = (seed: Record<string, string>) => {
  const disk = new Map(Object.entries(seed));
  const b: AsyncBackend & { disk: Map<string, string> } = {
    disk,
    async loadAll() { return Object.fromEntries(disk); },
    async write(k, v) { disk.set(k, v); },
    async remove(k) { disk.delete(k); },
    async commit(changes) {
      for (const c of changes) {
        if (c.value === null) disk.delete(c.key); else disk.set(c.key, c.value);
      }
    },
  };
  return b;
};

// September 2026 is "now" (see the clock below): budget_2026_8.
const SEPT = JSON.stringify({
  income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
  expenses: [
    { id: 'boende', name: 'Boende', icon: '•', color: '#888', userNamed: true,
      rows: [{ id: 'hyra', label: 'Hyra', amount: 9000, userNamed: true }] },
    { id: 'mat', name: 'Mat & Dryck', icon: '•', color: '#888', userNamed: true,
      rows: [{ id: 'matvaror', label: 'Matvaror', amount: 5000, userNamed: true }] },
  ],
  savings: [],
});
// Remaining 30 000 − 14 000 = 16 000.
const ACTUALS = JSON.stringify([
  { id: 'e1', date: '2026-09-03', text: 'SYNT Kaféet', amount: 45, direction: 'out', categoryId: 'mat' },
  { id: 'e2', date: '2026-09-10', text: 'SYNT Kaféet', amount: 55, direction: 'out', categoryId: 'mat' },
  { id: 'e3', date: '2026-09-11', text: 'SYNT Matbutik', amount: 700, direction: 'out', categoryId: 'mat' },
]);
const debt = (id: string, name: string, balance: number) => ({
  id, name, kind: 'loan', balance, balanceDate: '2026-09-01', ratePct: 8, monthlyPayment: 500,
});
const DEBTS = JSON.stringify({ debts: [debt('d1', 'SYNT Lån', 20000)], extraPerMonth: 0, strategy: 'avalanche', plainRows: [] });

let b: ReturnType<typeof makeBackend>;

const boot = async () => {
  b = makeBackend({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_changelog_seen: 'x', budget_2026_8: SEPT, budget_actuals_2026_8: ACTUALS, budget_debts: DEBTS,
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

const tab = (label: string) =>
  fireEvent.click([...document.querySelectorAll('.tab-btn')].find(el => el.getAttribute('aria-label') === label)!);
const buttonWith = (label: string, root: ParentNode = document) =>
  [...root.querySelectorAll('button')].find(el => el.textContent?.includes(label));
const card = () => document.querySelector('.q-card') as HTMLElement;
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); });
const openFollowUp = async () => {
  tab(sv.tabFollowUp);
  await waitFor(() => expect(document.querySelector('.q-card')).not.toBeNull());
};

describe('What if…?', () => {
  it('shows the month before and after a change, and stores nothing', async () => {
    await boot();
    await openFollowUp();
    fireEvent.click(buttonWith(sv.qWhatIf, card())!);
    const c = within(card());
    fireEvent.change(c.getByLabelText(sv.qWhatIfWhat), { target: { value: 'boende' } });
    fireEvent.change(c.getByLabelText(sv.qWhatIfAmount), { target: { value: '1500' } });
    expect(card().textContent).toContain(`${kr(16000)} → ${kr(14500)}`);
    // September has 30 days: 16 000 / 30 = 533, 14 500 / 30 = 483.
    expect(card().textContent).toContain(`${kr(533)} → ${kr(483)}`);
    expect(b.disk.get('budget_2026_8')).toBe(SEPT);
  });

  it('a cut is typed with a minus sign', async () => {
    await boot();
    await openFollowUp();
    fireEvent.click(buttonWith(sv.qWhatIf, card())!);
    const c = within(card());
    fireEvent.change(c.getByLabelText(sv.qWhatIfWhat), { target: { value: 'mat' } });
    fireEvent.change(c.getByLabelText(sv.qWhatIfAmount), { target: { value: '−500' } });
    expect(card().textContent).toContain(`${kr(16000)} → ${kr(16500)}`);
  });
});

describe('Search your purchases', () => {
  it('sums what matches, per month', async () => {
    await boot();
    await openFollowUp();
    fireEvent.change(within(card()).getByLabelText(new RegExp(sv.qSearch)), { target: { value: 'kafé' } });
    expect(card().textContent).toContain(kr(100));
    expect(card().textContent).toContain(sv.qSearchSub(2));
  });

  it('nothing found says so', async () => {
    await boot();
    await openFollowUp();
    fireEvent.change(within(card()).getByLabelText(new RegExp(sv.qSearch)), { target: { value: 'gym' } });
    expect(card().textContent).toContain(sv.qSearchNone('gym'));
  });
});

describe('What do I need to save? → a goal, only once confirmed', () => {
  const fill = () => {
    const c = within(card());
    fireEvent.change(c.getByLabelText(sv.qNeedName), { target: { value: 'SYNT Resa' } });
    fireEvent.change(c.getByLabelText(sv.qNeedTarget), { target: { value: '10000' } });
    fireEvent.change(c.getByLabelText(sv.qNeedBy), { target: { value: '2027-01' } });
    fireEvent.change(c.getByLabelText(sv.qNeedSaved), { target: { value: '2000' } });
  };

  it('works out the monthly amount; Cancel stores nothing', async () => {
    await boot();
    await openFollowUp();
    fireEvent.click(buttonWith(sv.qNeedToSave, card())!);
    fill();
    // September 2026 – January 2027 is five months: 8 000 / 5 = 1 600.
    expect(card().textContent).toContain(sv.qNeedAnswer(kr(1600)));
    fireEvent.click(buttonWith(sv.qNeedCreate)!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('SYNT Resa');
    expect(dialog.textContent).toContain(sv.toolPerMonth(kr(1600)));
    fireEvent.click(buttonWith(sv.cancel, dialog)!);
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(b.disk.get('budget_plan') ?? '').not.toContain('SYNT Resa');
  });

  it('Confirm stores the goal and its monthly amount together, with a step back', async () => {
    await boot();
    await openFollowUp();
    fireEvent.click(buttonWith(sv.qNeedToSave, card())!);
    fill();
    fireEvent.click(buttonWith(sv.qNeedCreate)!);
    fireEvent.click(buttonWith(sv.toolConfirm, document.querySelector('[role="dialog"]')!)!);
    await settle();
    const plan = JSON.parse(b.disk.get('budget_plan')!) as { goals: { name: string; targetAmount: number; currentAmount: number; deadline: string; budgetRowId: string }[] };
    const goal = plan.goals.find(g => g.name === 'SYNT Resa')!;
    expect(goal).toMatchObject({ targetAmount: 10000, currentAmount: 2000, deadline: '2027-01' });
    const month = JSON.parse(b.disk.get('budget_2026_8')!) as { expenses: { id: string; rows: { id: string; amount: number }[] }[] };
    const row = month.expenses.find(c => c.id === 'sparande')!.rows.find(r => r.id === goal.budgetRowId)!;
    expect(row.amount).toBe(1600);
    expect(b.disk.get('budget_undo')).toContain('"createGoal"');
  });
});

describe('Debt: try an amount', () => {
  it('shows the effect, stores nothing until confirmed, then stores it with a step back', async () => {
    await boot();
    tab(sv.tabDebt);
    await waitFor(() => expect(document.getElementById('debt-try')).not.toBeNull());
    fireEvent.change(document.getElementById('debt-try')!, { target: { value: '1000' } });
    const box = document.querySelector('.debt-try') as HTMLElement;
    expect(box.textContent).toContain(sv.debtTryDebtFree);
    expect(box.textContent).toMatch(new RegExp(sv.debtTrySaves('.+')));
    expect(JSON.parse(b.disk.get('budget_debts')!).extraPerMonth).toBe(0);

    fireEvent.click(buttonWith(sv.debtTryUse(kr(1000)), box)!);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain(`${kr(0)} → ${kr(1000)}`);
    fireEvent.click(buttonWith(sv.toolConfirm, dialog)!);
    await settle();
    expect(JSON.parse(b.disk.get('budget_debts')!).extraPerMonth).toBe(1000);
    expect((document.getElementById('debt-extra') as HTMLInputElement).value).toBe('1000');
    expect(b.disk.get('budget_undo')).toContain('"debtExtra"');
  });
});
