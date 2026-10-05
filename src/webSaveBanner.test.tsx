// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { appStorage } from './storage';
import { safeSetItem } from './storageWrite';
import { translations } from './i18n';

// ── The "could not save" banner on the web (foundation review 2026-09-29, P1)
//
// The banner used to follow whichever write answered last: a refused write to
// one key, then an ordinary budget edit that saved, and the banner went down
// while the first change was still only on screen. It now shows whether
// EVERYTHING is stored. localStorage refuses here the way a full or blocked
// browser does: by throwing.

const sv = translations.sv;
const A = 'budget_actuals_2026_8';

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
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_2026_8: JSON.stringify({
      income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }], expenses: [], savings: [],
    }),
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const banner = () => document.querySelector('.save-error-banner');
const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));

describe('the banner shows whether everything is stored', () => {
  it('A refused → B saved → still up → A stored by Try again → down', async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());

    const real = Storage.prototype.setItem;
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === A) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    act(() => { expect(safeSetItem(appStorage, A, '[{"id":"a"}]')).toBe(false); });
    await waitFor(() => expect(banner()).not.toBeNull());

    // B: an ordinary edit to the month on screen, which stores fine.
    fireEvent.click(document.querySelector<HTMLButtonElement>('.budget-row .amount-display')!);
    const input = document.activeElement as HTMLInputElement;
    fireEvent.change(input, { target: { value: '31415' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(localStorage.getItem('budget_2026_8')).toContain('31415'));
    await act(async () => { await Promise.resolve(); });
    expect(banner()).not.toBeNull();

    // Room again: Try again stores A itself, and only then the banner goes.
    refuse.mockRestore();
    fireEvent.click(buttonWith(sv.saveRetry)!);
    await waitFor(() => expect(banner()).toBeNull());
    expect(localStorage.getItem(A)).toBe('[{"id":"a"}]');
  });

  it('goes down when a newer write to the SAME key is stored', async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());
    const real = Storage.prototype.setItem;
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === A) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    act(() => { safeSetItem(appStorage, A, '[1]'); });
    await waitFor(() => expect(banner()).not.toBeNull());
    refuse.mockRestore();
    act(() => { expect(safeSetItem(appStorage, A, '[1,2]')).toBe(true); });
    await waitFor(() => expect(banner()).toBeNull());
  });
});
