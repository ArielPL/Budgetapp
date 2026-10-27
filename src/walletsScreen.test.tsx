// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { newBlank, loadWallets, WALLETS_KEY, OPEN_PANEL_KEY, type Wallet } from './wallets';

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
