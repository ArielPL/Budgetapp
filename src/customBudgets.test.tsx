// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CustomV3 } from './components/CustomV3';
import { WalletArea } from './components/Wallets';
import {
  customBudgetKeys, customBudgetNs, isCustomBudgetList, loadCustomBudgets,
  CUSTOM_BUDGETS_KEY, CUSTOM_NAME_KEY,
} from './customBudgets';
import { customYearRows, monthsHoldingRows } from './customYear';
import { checkBackup, BACKUP_VERSION } from './backup';
import { hasRestorableUserData } from './userData';
import { translations } from './i18n';
import type { UndoEntry } from './undo';

// ── Budgets beside the Custom panel's own (Ariel, 2026-10-23) ──────────────
//
// A small business wants a budget of its own: months of income and costs,
// never counted in the household's. Each added budget lives under its own
// namespace, so the one thing these tests guard above all is that no budget
// can read, show, clear or remove another's months.

const sv = translations.sv;
const FIRM = 'firm1';
const FIRM_NS = customBudgetNs(FIRM);

const block = (id: string, tag: 'in' | 'out', rowId: string) => ({
  id, name: id, userNamed: true, kind: 'block', tag, width: 'full',
  rows: [{ id: rowId, name: rowId, color: '#22c55e', userNamed: true }],
  chart: { show: false, type: 'bars', size: 'M', position: 'bottom' },
});
const STRUCTURE = JSON.stringify([block('Inkomst', 'in', 'lon'), block('Utgifter', 'out', 'hyra')]);

/** A plain in-memory storage for the pure helpers. */
const memory = (seed: Record<string, string>) => {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

describe('keys and list', () => {
  it('a budget owns exactly its own keys, never a longer id or the panel', () => {
    const s = memory({
      budget_cb_ab: '[]', budget_cb_ab_values_2026_8: '{}', budget_cb_ab_meta_2026_8: '{}',
      budget_cb_abc: '[]', budget_cb_abc_values_2026_8: '{}',
      budget_custom_v3: '[]', budget_custom_v3_values_2026_8: '{}',
    });
    expect(customBudgetKeys(s, 'ab').sort()).toEqual(
      ['budget_cb_ab', 'budget_cb_ab_meta_2026_8', 'budget_cb_ab_values_2026_8']);
  });

  it('a bad entry in the list costs that entry, not the others', () => {
    const s = memory({ [CUSTOM_BUDGETS_KEY]: JSON.stringify([
      { id: 'ok1', name: 'SYNT A' }, { id: 'BAD ID', name: 'x' }, { id: 'ok2', name: '' }, 'junk',
    ]) });
    expect(loadCustomBudgets(s)).toEqual([{ id: 'ok1', name: 'SYNT A' }]);
  });

  it('only a clean list passes backup validation', () => {
    expect(isCustomBudgetList([{ id: 'a1', name: 'SYNT' }])).toBe(true);
    expect(isCustomBudgetList([{ id: 'a1', name: 'X' }, { id: 'a1', name: 'Y' }])).toBe(false);
    expect(isCustomBudgetList([{ id: 'a-1', name: 'X' }])).toBe(false);
  });
});

describe('the year view and the history guard read one budget only', () => {
  const s = memory({
    budget_custom_v3_values_2026_8: JSON.stringify({ lon: 11111 }),
    [`${FIRM_NS}_values_2026_8`]: JSON.stringify({ lon: 22222 }),
  });
  const blocks = JSON.parse(STRUCTURE);

  it('customYearRows', () => {
    expect(customYearRows(s, blocks, 2026)[8].income).toBe(11111);
    expect(customYearRows(s, blocks, 2026, FIRM_NS)[8].income).toBe(22222);
  });

  it('monthsHoldingRows', () => {
    expect(monthsHoldingRows(s, ['lon'])).toBe(1);
    expect(monthsHoldingRows(s, ['lon'], FIRM_NS)).toBe(1);
    expect(monthsHoldingRows(s, ['lon'], customBudgetNs('other'))).toBe(0);
  });
});

describe('backup and "is there anything worth a backup"', () => {
  const file = (data: Record<string, string>) =>
    JSON.stringify({ app: 'budget', version: BACKUP_VERSION, exportedAt: '', data });

  it('an added budget travels in a backup', () => {
    const check = checkBackup(file({
      [CUSTOM_BUDGETS_KEY]: JSON.stringify([{ id: FIRM, name: 'SYNT FIRMA' }]),
      [CUSTOM_NAME_KEY]: 'SYNT HEMMET',
      [FIRM_NS]: STRUCTURE,
      [`${FIRM_NS}_values_2026_8`]: JSON.stringify({ lon: 22222 }),
      [`${FIRM_NS}_meta_2026_8`]: JSON.stringify({ v: 1, tags: { lon: 'in' } }),
    }));
    expect(check.ok).toBe(true);
  });

  it('a damaged one is refused, like the panel\'s own', () => {
    expect(checkBackup(file({ [`${FIRM_NS}_values_2026_8`]: '"not amounts"' })).ok).toBe(false);
    expect(checkBackup(file({ [`${FIRM_NS}_meta_2026_8`]: JSON.stringify({ v: 1, tags: { lon: 'sideways' } }) })).ok).toBe(false);
    expect(checkBackup(file({ [CUSTOM_BUDGETS_KEY]: '[{"id":"a b","name":"x"}]' })).ok).toBe(false);
  });

  it('a device holding only an added budget is a device worth backing up', () => {
    expect(hasRestorableUserData(memory({ [`${FIRM_NS}_values_2026_8`]: JSON.stringify({ lon: 22222 }) }))).toBe(true);
  });
});

describe('in Custom', () => {
  let undo: UndoEntry[];
  beforeEach(() => {
    localStorage.clear();
    undo = [];
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent: () => false,
    }));
    localStorage.setItem('budget_custom_help_seen', '1');
    localStorage.setItem('budget_custom_v3', STRUCTURE);
    localStorage.setItem('budget_custom_v3_values_2026_8', JSON.stringify({ lon: 11111 }));
    localStorage.setItem(CUSTOM_BUDGETS_KEY, JSON.stringify([{ id: FIRM, name: 'SYNT FIRMA' }]));
    localStorage.setItem(FIRM_NS, STRUCTURE);
    localStorage.setItem(`${FIRM_NS}_values_2026_8`, JSON.stringify({ lon: 22222 }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const props = { year: 2026, month: 8, onSaveFailed: () => {}, onRecordUndo: (e: UndoEntry) => { undo.push(e); } };
  const mount = () => render(
    <WalletArea budget={<CustomV3 {...props} />} budgetTag={sv.wTagStandalone} onRecordUndo={props.onRecordUndo}
      renderBudget={ns => <CustomV3 {...props} ns={ns} />} />,
  );
  const text = () => document.body.textContent ?? '';
  const toggle = () => document.querySelector('.wallet-switch-toggle')!;
  const pick = (name: string) => {
    fireEvent.click(toggle());
    fireEvent.click([...document.querySelectorAll('.wallet-switch-row')].find(r => r.textContent?.includes(name))!);
  };
  const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label);

  it('each budget shows its own months, and switching carries nothing across', () => {
    mount();
    expect(text()).toMatch(/11\s111/);
    pick('SYNT FIRMA');
    expect(toggle().textContent).toContain('SYNT FIRMA');
    expect(text()).toMatch(/22\s222/);
    expect(text()).not.toMatch(/11\s111/);
    pick(sv.wMyBudget);
    expect(text()).toMatch(/11\s111/);
    expect(localStorage.getItem('budget_custom_v3_values_2026_8')).toBe(JSON.stringify({ lon: 11111 }));
    expect(localStorage.getItem(`${FIRM_NS}_values_2026_8`)).toBe(JSON.stringify({ lon: 22222 }));
  });

  it('a new budget is made from a name, and opens empty', async () => {
    mount();
    fireEvent.click(toggle());
    fireEvent.click(button(`+ ${sv.cbNew}`)!);
    fireEvent.change(document.querySelector('.wallet input')!, { target: { value: 'SYNT NY' } });
    fireEvent.click(button(sv.cbCreate)!);
    await waitFor(() => expect(toggle().textContent).toContain('SYNT NY'));
    expect(loadCustomBudgets(localStorage).map(b => b.name)).toEqual(['SYNT FIRMA', 'SYNT NY']);
    expect(text()).not.toMatch(/11\s111|22\s222/);
  });

  it('the panel\'s own budget can be named, and an empty name goes back to the default', async () => {
    mount();
    fireEvent.click(document.querySelector('.wallet-switch-edit')!);
    fireEvent.change(document.querySelector('.budget-name input')!, { target: { value: 'SYNT HEMMET' } });
    fireEvent.click(button(sv.wSave)!);
    await waitFor(() => expect(toggle().textContent).toContain('SYNT HEMMET'));
    expect(localStorage.getItem(CUSTOM_NAME_KEY)).toBe('SYNT HEMMET');
    // The panel's own budget is never offered for removal.
    fireEvent.click(document.querySelector('.wallet-switch-edit')!);
    expect(document.querySelector('.budget-name-delete')).toBeNull();
    fireEvent.change(document.querySelector('.budget-name input')!, { target: { value: '' } });
    fireEvent.click(button(sv.wSave)!);
    await waitFor(() => expect(toggle().textContent).toContain(sv.wMyBudget));
    expect(localStorage.getItem(CUSTOM_NAME_KEY)).toBeNull();
  });

  it('an added budget is renamed in the list', async () => {
    mount();
    pick('SYNT FIRMA');
    fireEvent.click(document.querySelector('.wallet-switch-edit')!);
    fireEvent.change(document.querySelector('.budget-name input')!, { target: { value: 'SYNT FIRMA AB' } });
    fireEvent.click(button(sv.wSave)!);
    await waitFor(() => expect(loadCustomBudgets(localStorage)).toEqual([{ id: FIRM, name: 'SYNT FIRMA AB' }]));
  });

  it('removing a budget takes all its months, leaves the others, and can be undone', async () => {
    vi.stubGlobal('confirm', () => true);
    mount();
    pick('SYNT FIRMA');
    fireEvent.click(document.querySelector('.wallet-switch-edit')!);
    fireEvent.click(document.querySelector('.budget-name-delete')!);
    await waitFor(() => expect(localStorage.getItem(FIRM_NS)).toBeNull());
    expect(localStorage.getItem(`${FIRM_NS}_values_2026_8`)).toBeNull();
    expect(localStorage.getItem(CUSTOM_BUDGETS_KEY)).toBeNull();
    expect(localStorage.getItem('budget_custom_v3_values_2026_8')).toBe(JSON.stringify({ lon: 11111 }));
    expect(toggle().textContent).toContain(sv.wMyBudget);
    expect(undo).toHaveLength(1);
    expect(undo[0].action).toBe('deleteCustomBudget');
    const captured = Object.fromEntries(undo[0].changes.map(c => [c.key, c.value]));
    expect(captured[FIRM_NS]).toBe(STRUCTURE);
    expect(captured[`${FIRM_NS}_values_2026_8`]).toBe(JSON.stringify({ lon: 22222 }));
    expect(JSON.parse(captured[CUSTOM_BUDGETS_KEY]!)).toEqual([{ id: FIRM, name: 'SYNT FIRMA' }]);
  });

  it('a budget that was open last time opens again', () => {
    localStorage.setItem('budget_panel_open', `cb:${FIRM}`);
    mount();
    expect(toggle().textContent).toContain('SYNT FIRMA');
  });
});
