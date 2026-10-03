// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';

// ── "+ New category…" in Follow-up, on a full browser (Codex, 2026-10-03) ───
//
// On the web the category, the moved entries and the rule are written key by
// key and rolled back if one is refused. If the rollback itself is refused,
// the user is told the change was only PARTLY saved — never "nothing changed"
// — and what the screen still shows is kept as unsaved for Try again.
// Synthetic values only.

const sv = translations.sv;
const ACTUALS = 'budget_actuals_2026_8';
const MONTH = 'budget_2026_8';
const ENTRIES = JSON.stringify([
  { id: 'k1', date: '2026-09-06', text: 'SYNT KIOSK', amount: 40, direction: 'out', categoryId: '__unsorted__' },
]);
const SEPT = JSON.stringify({
  income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
  expenses: [{ id: 'boende', name: 'Boende', icon: '•', color: '#888', userNamed: true,
    rows: [{ id: 'hyra', label: 'Hyra', amount: 9000, userNamed: true }] }],
  savings: [],
});

let alerts: string[];
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
  alerts = [];
  vi.stubGlobal('alert', (m: string) => { alerts.push(String(m)); });
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    [MONTH]: SEPT, [ACTUALS]: ENTRIES,
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));
const nameInput = () => document.querySelector<HTMLInputElement>(`input[aria-label="${sv.followUpNewCategoryName}"]`);
const rowLabels = () => [...document.querySelectorAll('button.followup-row')].map(el => el.textContent ?? '');
const banner = () => document.querySelector('.save-error-banner');

const startNaming = async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());
  fireEvent.click(buttonWith(sv.tabFollowUp)!);
  const unsorted = await waitFor(() => {
    const el = [...document.querySelectorAll('button.followup-row')].find(x => x.textContent?.includes(sv.followUpUnsorted));
    expect(el).toBeTruthy();
    return el!;
  });
  fireEvent.click(unsorted);
  const move = await waitFor(() => {
    const el = document.querySelector<HTMLSelectElement>(`select[aria-label="${sv.followUpMoveTo('SYNT KIOSK')}"]`);
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.change(move, { target: { value: '__new_category__' } });
  fireEvent.change(nameInput()!, { target: { value: 'Testkategori' } });
};
const save = () => fireEvent.click(document.querySelector('.followup-newcat-save')!);

describe('"+ New category…" on a browser that refuses', () => {
  it('changes nothing and says so when the budget month is refused', async () => {
    await startNaming();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === MONTH) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    save();
    await waitFor(() => expect(alerts).toEqual([sv.changeNotSaved]));
    expect(localStorage.getItem(ACTUALS)).toBe(ENTRIES);
    expect(localStorage.getItem(MONTH)).toBe(SEPT);
    expect(localStorage.getItem('budget_category_rules')).toBeNull();
    expect(nameInput()?.value).toBe('Testkategori');
    expect(rowLabels().some(l => l.includes('Testkategori'))).toBe(false);
    expect(banner()).toBeNull();
  });

  it('says "partly saved", never "nothing changed", when the entries cannot be put back — and Try again can', async () => {
    await startNaming();
    const real = Storage.prototype.setItem;
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      // The month is refused, and so is putting the entries back.
      if (k === MONTH) throw new DOMException('full', 'QuotaExceededError');
      if (k === ACTUALS && v === ENTRIES) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    });
    save();
    await waitFor(() => expect(alerts).toEqual([sv.changePartlySaved]));
    expect(alerts).not.toContain(sv.changeNotSaved);
    // The entries moved on disk, the category did not: the screen still shows
    // them unsorted, and that is what is counted as unsaved.
    expect(localStorage.getItem(ACTUALS)).not.toBe(ENTRIES);
    expect(localStorage.getItem(MONTH)).toBe(SEPT);
    expect(rowLabels().some(l => l.includes('Testkategori'))).toBe(false);
    expect(nameInput()?.value).toBe('Testkategori');
    await waitFor(() => expect(banner()).not.toBeNull());

    // Room again: Try again puts the entries back where the screen has them.
    refuse.mockRestore();
    fireEvent.click(buttonWith(sv.saveRetry)!);
    await waitFor(() => expect(banner()).toBeNull());
    expect(localStorage.getItem(ACTUALS)).toBe(ENTRIES);
  });

  it('stores all of it when nothing is refused', async () => {
    await startNaming();
    save();
    await waitFor(() => expect(nameInput()).toBeNull());
    const cat = (JSON.parse(localStorage.getItem(MONTH)!).expenses as { id: string; name: string }[])
      .find(c => c.name === 'Testkategori')!;
    expect(cat).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(ACTUALS)!)[0].categoryId).toBe(cat.id);
    expect(JSON.parse(localStorage.getItem('budget_category_rules')!)['synt kiosk']).toBe(cat.id);
    expect(rowLabels().some(l => l.includes('Testkategori'))).toBe(true);
    expect(alerts).toEqual([]);
  });
});
