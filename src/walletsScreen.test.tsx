// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { newBlank, loadWallets, WALLETS_KEY, OPEN_PANEL_KEY, type Wallet } from './wallets';
import { closeTopLayer } from './useModalFocus';

// ── The wallets screen shows every wallet (Ariel, 2026-10-27) ──────────────
//
// Side by side from 641px up, with a "+" card last; a list on a phone, where a
// tap opens one wallet. Sketched in three directions, A (list) and B (columns)
// chosen: A on the phone, B on a computer and a tablet.

const sv = translations.sv;

/** Whether the screen counts as wide; the app asks with matchMedia. */
const screen = (wide: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({
  matches: wide && query.includes('min-width: 641px'), media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
}));

const seed = (wallets: Wallet[]) => {
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_guide_row_hidden: '1',
  })) localStorage.setItem(k, v);
  localStorage.setItem(WALLETS_KEY, JSON.stringify({ wallets }));
};
const synth = (id: string, name: string, total: number, extra: Partial<Wallet> = {}): Wallet =>
  ({ ...newBlank({ id, name, total }), ...extra });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));
const openWallets = async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());
  fireEvent.click(buttonWith(sv.menu)!);
  fireEvent.click(buttonWith(`✉️ ${sv.wMenu}`)!);
  await waitFor(() => expect(document.querySelector('.wallet-screen-head')).not.toBeNull());
};
const stored = () => loadWallets(localStorage);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('confirm', () => true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('on a wide screen', () => {
  beforeEach(() => screen(true));

  it('stands every wallet in a column, with a "+" card last and no switcher', async () => {
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    await openWallets();
    const names = [...document.querySelectorAll('.wallet-column .wallet-col-title')].map(e => e.textContent);
    expect(names).toHaveLength(2);
    expect(names[0]).toContain('SYNT MAT');
    expect(names[1]).toContain('SYNT RESA');
    expect(document.querySelectorAll('.wallet-column .wallet-hero')).toHaveLength(2);
    expect(document.querySelector('.wallet-columns > :last-child')?.textContent).toContain(sv.wNew);
    expect(document.querySelector('.wallet-switch')).toBeNull();
    // The actions sit behind ⋯, not in a footer.
    expect(document.querySelector('.wallet-footer')).toBeNull();
  });

  it('puts an archived wallet last, and the "+" card starts a new one', async () => {
    seed([synth('a', 'SYNT ARKIV', 1000, { archived: true }), synth('b', 'SYNT AKTIV', 2000)]);
    await openWallets();
    const names = [...document.querySelectorAll('.wallet-column .wallet-col-title')].map(e => e.textContent ?? '');
    expect(names[0]).toContain('SYNT AKTIV');
    expect(names[1]).toContain('SYNT ARKIV');
    expect(names[1]).toContain(sv.wArchived);
    fireEvent.click(document.querySelector('.wallet-plus')!);
    await waitFor(() => expect(document.querySelector('.wallet-title')?.textContent).toContain(sv.wNew));
  });

  it('archives and deletes from the ⋯ menu, and a tap elsewhere closes it', async () => {
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    await openWallets();
    const more = () => document.querySelectorAll<HTMLButtonElement>('.wallet-more-btn');
    fireEvent.click(more()[0]);
    expect(document.querySelector('.wallet-more-menu')).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(document.querySelector('.wallet-more-menu')).toBeNull();

    fireEvent.click(more()[0]);
    fireEvent.click(buttonWith(sv.wArchive)!);
    await waitFor(() => expect(stored().find(w => w.id === 'a')?.archived).toBe(true));
    // The archived one moved last.
    await waitFor(() => expect(document.querySelector('.wallet-column .wallet-col-title')?.textContent).toContain('SYNT RESA'));

    fireEvent.click(more()[0]);
    fireEvent.click(buttonWith(sv.wDelete)!);
    await waitFor(() => expect(stored().map(w => w.id)).toEqual(['a']));
    // One is left: the screen stays on the wallets.
    expect(document.querySelectorAll('.wallet-column')).toHaveLength(1);
  });

  it('goes back to the budget when the last wallet is deleted', async () => {
    seed([synth('a', 'SYNT MAT', 4500)]);
    await openWallets();
    fireEvent.click(document.querySelector('.wallet-more-btn')!);
    fireEvent.click(buttonWith(sv.wDelete)!);
    await waitFor(() => expect(stored()).toEqual([]));
    await waitFor(() => expect(document.querySelector('.wallet-screen-head')).toBeNull());
  });

  it('"Min budget" leaves the wallets screen', async () => {
    seed([synth('a', 'SYNT MAT', 4500)]);
    await openWallets();
    fireEvent.click(buttonWith(`‹ ${sv.wMyBudget}`)!);
    expect(document.querySelector('.wallet-screen-head')).toBeNull();
  });
});

describe('on a phone', () => {
  beforeEach(() => screen(false));

  it('lists the wallets, opens one on a tap, and Back returns to the list', async () => {
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    await openWallets();
    const cards = document.querySelectorAll('.wallet-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('SYNT MAT');
    expect(cards[0].textContent).toContain(sv.wLeft);
    expect(document.querySelector('.wallet-hero')).toBeNull();

    fireEvent.click(cards[1]);
    expect(document.querySelector('.wallet-col-title')?.textContent).toContain('SYNT RESA');
    expect(document.querySelector('.wallet-hero')).not.toBeNull();
    // Here the actions are in the footer, as before.
    expect(document.querySelector('.wallet-footer')).not.toBeNull();
    expect(document.querySelector('.wallet-more-btn')).toBeNull();

    fireEvent.click(buttonWith(`‹ ${sv.wMenu}`)!);
    expect(document.querySelectorAll('.wallet-card')).toHaveLength(2);
  });

  it('deleting one of several returns to the list', async () => {
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    await openWallets();
    fireEvent.click(document.querySelectorAll('.wallet-card')[0]);
    fireEvent.click(buttonWith(sv.wDelete)!);
    await waitFor(() => expect(stored().map(w => w.id)).toEqual(['b']));
    await waitFor(() => expect(document.querySelectorAll('.wallet-card')).toHaveLength(1));
  });

  it('opens on the wallet that was just made from Left to live on', async () => {
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    localStorage.setItem(OPEN_PANEL_KEY, 'b');
    await openWallets();
    expect(document.querySelector('.wallet-col-title')?.textContent).toContain('SYNT RESA');
    // The name is used up: the next visit starts on the list.
    expect(localStorage.getItem(OPEN_PANEL_KEY)).toBeNull();
  });
});

// ── Custom: the envelopes are one folder in the switcher (Ariel, 2026-10-29) ─
describe('in Custom', () => {
  const openCustom = async (wallets: Wallet[]) => {
    seed(wallets);
    localStorage.setItem('budget_layout', 'custom');
    localStorage.setItem('budget_custom_mode', 'linked');
    localStorage.setItem('budget_custom_help_seen', '1');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.wallet-switch-toggle')).not.toBeNull());
  };
  const folderRow = () => [...document.querySelectorAll('.wallet-switch-row')].find(r => r.textContent?.includes(sv.wMenu));

  it('lists the envelopes as one folder, which opens on all of them with a "+" card', async () => {
    screen(true);
    await openCustom([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    fireEvent.click(document.querySelector('.wallet-switch-toggle')!);
    // One row for the envelopes, not one per envelope.
    expect(document.querySelectorAll('.wallet-switch-row')).toHaveLength(2);
    expect(folderRow()?.textContent).toContain('SYNT MAT, SYNT RESA');
    fireEvent.click(folderRow()!);
    await waitFor(() => expect(document.querySelectorAll('.wallet-column')).toHaveLength(2));
    expect(document.querySelector('.wallet-switch-toggle')?.textContent).toContain(sv.wMenu);
    // More can be made from right there.
    fireEvent.click(document.querySelector('.wallet-plus')!);
    await waitFor(() => expect(document.querySelector('.wallet-title')?.textContent).toContain(sv.wNew));
  });

  it('on a phone, opens on the envelope last open, and Back goes to the folder', async () => {
    screen(false);
    localStorage.setItem(OPEN_PANEL_KEY, 'b');
    await openCustom([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    await waitFor(() => expect(document.querySelector('.wallet-title')?.textContent).toContain('SYNT RESA'));
    fireEvent.click(buttonWith(`‹ ${sv.wMenu}`)!);
    await waitFor(() => expect(document.querySelectorAll('.wallet-card')).toHaveLength(2));
    expect(stored()).toHaveLength(2);
  });
});

describe("Android's Back on a phone", () => {
  it('goes from one envelope to the list first (emulator, 2026-10-29)', async () => {
    screen(false);
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    await openWallets();
    fireEvent.click([...document.querySelectorAll('.wallet-card')][1]);
    await waitFor(() => expect(document.querySelector('.wallet-title')?.textContent).toContain('SYNT RESA'));
    act(() => { expect(closeTopLayer()).toBe(true); });
    await waitFor(() => expect(document.querySelectorAll('.wallet-card')).toHaveLength(2));
    // Nothing more of the envelopes is a layer: the next Back is the app's own.
    expect(closeTopLayer()).toBe(false);
  });
});

// ── Rows of envelopes (Ariel, 2026-10-29) ───────────────────────────────────
// Envelopes made together share a row; a new one starts a row of its own; a
// row's name can be changed.
describe('rows of envelopes', () => {
  const fill = (label: string, value: string) => {
    const el = [...document.querySelectorAll('label')].find(l => l.textContent === label);
    fireEvent.change(document.getElementById(el!.htmlFor)!, { target: { value } });
  };
  const inRow = (g: string, name: string) => ({ groupId: g, groupName: name });
  const titles = () => [...document.querySelectorAll('.wallet-group-title')].map(e => e.textContent);
  const namesIn = (i: number) => [...document.querySelectorAll('.wallet-group')[i].querySelectorAll('.wallet-col-title')]
    .map(e => e.textContent?.replace(/^\S+\s/, ''));

  it('the order and names, with older envelopes in a row of their own', async () => {
    const { envelopeGroups, renameGroup } = await import('./wallets');
    const ws = [synth('a', 'SYNT GAMMAL', 100), synth('b', 'SYNT MAT', 200, inRow('okt', 'Oktober 2026')), synth('c', 'SYNT VARDAG', 300, inRow('okt', 'Oktober 2026'))];
    expect(envelopeGroups(ws, 'Kuvert').map(g => [g.id, g.name, g.wallets.map(w => w.id)]))
      .toEqual([['', 'Kuvert', ['a']], ['okt', 'Oktober 2026', ['b', 'c']]]);
    const renamed = renameGroup(ws, '', 'SYNT ÄLDRE', 'new');
    expect(renamed[0]).toMatchObject({ groupId: 'new', groupName: 'SYNT ÄLDRE' });
    expect(renamed[1]).toBe(ws[1]);
  });

  it('on the menu screen: one row each, "+" adds to its row, and a new row starts its own', async () => {
    screen(true);
    seed([synth('b', 'SYNT MAT', 200, inRow('okt', 'Oktober 2026')), synth('c', 'SYNT VARDAG', 300, inRow('okt', 'Oktober 2026'))]);
    await openWallets();
    expect(titles()).toEqual(['Oktober 2026']);
    // "+" inside the row: the new envelope joins it.
    fireEvent.click(document.querySelector('.wallet-group .wallet-plus')!);
    fill(sv.wName, 'SYNT EXTRA');
    fill(sv.wTotal, '500');
    fireEvent.click(buttonWith(sv.wCreate)!);
    await waitFor(() => expect(stored()).toHaveLength(3));
    expect(stored()[2]).toMatchObject({ name: 'SYNT EXTRA', groupId: 'okt', groupName: 'Oktober 2026' });
    await waitFor(() => expect(namesIn(0)).toEqual(['SYNT MAT', 'SYNT VARDAG', 'SYNT EXTRA']));
    // A new row: named after its first envelope.
    fireEvent.click(buttonWith(sv.envNewGroup)!);
    fill(sv.wName, 'SYNT RESA');
    fill(sv.wTotal, '9000');
    fireEvent.click(buttonWith(sv.wCreate)!);
    await waitFor(() => expect(titles()).toEqual(['Oktober 2026', 'SYNT RESA']));
    expect(stored()[3].groupId).not.toBe('okt');
  });

  it('a row can be renamed, and every envelope in it follows', async () => {
    screen(true);
    seed([synth('b', 'SYNT MAT', 200, inRow('okt', 'Oktober 2026')), synth('c', 'SYNT VARDAG', 300, inRow('okt', 'Oktober 2026'))]);
    await openWallets();
    fireEvent.click(document.querySelector('.wallet-group-head .wallet-switch-edit')!);
    fireEvent.change(document.querySelector('.budget-name input')!, { target: { value: 'SYNT HÖST' } });
    fireEvent.click(document.querySelector('.budget-name button[type="submit"]')!);
    await waitFor(() => expect(titles()).toEqual(['SYNT HÖST']));
    expect(stored().map(w => w.groupName)).toEqual(['SYNT HÖST', 'SYNT HÖST']);
  });

  it('in Custom, each row is its own folder in the switcher', async () => {
    screen(true);
    seed([synth('b', 'SYNT MAT', 200, inRow('okt', 'Oktober 2026')), synth('r', 'SYNT RESA', 9000, inRow('resa', 'SYNT RESA'))]);
    localStorage.setItem('budget_layout', 'custom');
    localStorage.setItem('budget_custom_mode', 'linked');
    localStorage.setItem('budget_custom_help_seen', '1');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.wallet-switch-toggle')).not.toBeNull());
    fireEvent.click(document.querySelector('.wallet-switch-toggle')!);
    const rows = [...document.querySelectorAll('.wallet-switch-row .wallet-switch-name')].map(e => e.textContent);
    expect(rows).toEqual([sv.wMyBudget, 'Oktober 2026', 'SYNT RESA']);
    fireEvent.click([...document.querySelectorAll('.wallet-switch-row')].find(r => r.textContent?.includes('SYNT RESA'))!);
    await waitFor(() => expect(document.querySelectorAll('.wallet-column')).toHaveLength(1));
    expect(document.querySelector('.wallet-col-title')?.textContent).toContain('SYNT RESA');
  });
});

// ── Review 2026-10-29 ───────────────────────────────────────────────────────
describe('an expense in an envelope keeps to its dates (P2-1)', () => {
  it('starts on the nearest day of the period, and says so before taking another', async () => {
    const { expenseDay } = await import('./wallets');
    expect(expenseDay('2026-10-29', '2026-11-01', '2026-11-07')).toBe('2026-11-01');
    expect(expenseDay('2026-11-09', '2026-11-01', '2026-11-07')).toBe('2026-11-07');
    expect(expenseDay('2026-11-03', '2026-11-01', '2026-11-07')).toBe('2026-11-03');
    expect(expenseDay('2026-11-03')).toBe('2026-11-03');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 29, 12));
    screen(true);
    seed([synth('n', 'SYNT NOVEMBER', 350, { from: '2026-11-01', to: '2026-11-07' })]);
    await openWallets();
    fireEvent.click(buttonWith(sv.wAddExpense)!);
    const field = (label: string) => document.getElementById(
      [...document.querySelectorAll('label')].find(l => l.textContent === label)!.htmlFor)! as HTMLInputElement;
    expect(field(sv.wDate).value).toBe('2026-11-01');
    fireEvent.change(field(sv.wAmount), { target: { value: '500' } });
    // A day outside: said, and the first press adds nothing.
    fireEvent.change(field(sv.wDate), { target: { value: '2026-10-29' } });
    expect(document.querySelector('.wallet-expense-form')?.textContent).toContain(sv.wDateOutside('1 nov', '7 nov'));
    fireEvent.click(document.querySelector('.wallet-expense-form button[type="submit"]')!);
    expect(document.querySelector('.wallet-expense-form button[type="submit"]')?.textContent).toBe(sv.wAddAnyway);
    expect(stored()[0].expenses).toEqual([]);
    // The second press is a choice.
    fireEvent.click(document.querySelector('.wallet-expense-form button[type="submit"]')!);
    await waitFor(() => expect(stored()[0].expenses.map(e => e.date)).toEqual(['2026-10-29']));
    vi.useRealTimers();
  });
});

describe('the switcher on a phone shows the row, not the envelope open in it (P2-5)', () => {
  it('Custom: envelope open, then the row chosen again → the list', async () => {
    screen(false);
    seed([synth('a', 'SYNT MAT', 4500), synth('b', 'SYNT RESA', 8000)]);
    localStorage.setItem('budget_layout', 'custom');
    localStorage.setItem('budget_custom_mode', 'linked');
    localStorage.setItem('budget_custom_help_seen', '1');
    localStorage.setItem(OPEN_PANEL_KEY, 'b');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.wallet-title')?.textContent).toContain('SYNT RESA'));
    fireEvent.click(document.querySelector('.wallet-switch-toggle')!);
    fireEvent.click([...document.querySelectorAll('.wallet-switch-row')].find(r => r.textContent?.includes(sv.wMenu))!);
    await waitFor(() => expect(document.querySelectorAll('.wallet-card')).toHaveLength(2));
  });
});
