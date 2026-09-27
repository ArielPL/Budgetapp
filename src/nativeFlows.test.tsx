// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { appStorage, installStorage } from './storage';
import { createCachedStorage, type AsyncBackend } from './storageCache';
import { translations } from './i18n';

// ── The app on the phones' store, with the database saying no ───────────────
//
// Deep review 2026-09-27: in the iOS and Android apps a write is QUEUED for the
// database, so "the write returned" no longer means "it is stored". These run
// the real App over the same cached store the apps install, with a database
// that refuses chosen keys, and check what the user is told and what is left
// on disk. Synthetic values only.

const sv = translations.sv;

const makeBackend = (seed: Record<string, string>) => {
  const disk = new Map(Object.entries(seed));
  const refuse = new Set<string>();
  const b: AsyncBackend & { disk: Map<string, string>; refuse: Set<string> } = {
    disk,
    refuse,
    async loadAll() { return Object.fromEntries(disk); },
    async write(k, v) { if (refuse.has(k)) throw new Error('refused'); disk.set(k, v); },
    async remove(k) { if (refuse.has(k)) throw new Error('refused'); disk.delete(k); },
    async commit(changes) {
      if (changes.some(c => refuse.has(c.key))) throw new Error('refused');
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
let alerts: string[];

beforeEach(async () => {
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
  alerts = [];
  vi.stubGlobal('alert', (m: string) => { alerts.push(String(m)); });
  b = makeBackend({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_2026_8: SEPT,
  });
  const store = createCachedStorage(b);
  await store.hydrate();
  installStorage(store);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const openApp = async () => {
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());
};
const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));
const openMenu = () => fireEvent.click(buttonWith(sv.menu)!);
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe('copying a budget', () => {
  it('says nothing changed, and records no step back, when the database refuses', async () => {
    b.refuse.add('budget_2026_9');
    await openApp();
    openMenu();
    fireEvent.click(buttonWith(sv.copyNextMonth)!);
    await waitFor(() => expect(alerts).toContain(sv.changeNotSaved));
    expect(b.disk.has('budget_2026_9')).toBe(false);
    expect(appStorage.getItem('budget_2026_9')).toBeNull();
    expect(b.disk.has('budget_undo')).toBe(false);
    expect(document.body.textContent).not.toContain(sv.copiedTo('oktober'));
  });

  it('says it is done only once the database has it', async () => {
    await openApp();
    openMenu();
    fireEvent.click(buttonWith(sv.copyNextMonth)!);
    await waitFor(() => expect(b.disk.has('budget_2026_9')).toBe(true));
    await waitFor(() => expect(b.disk.has('budget_undo')).toBe(true));
    expect(alerts).toEqual([]);
  });
});

describe('the "could not save" banner', () => {
  it('stays until what was refused is really stored — whatever wrote it', async () => {
    await openApp();
    // A write from somewhere other than the month on screen: an import's
    // entries, say. The old Try again rewrote only the month and the plan.
    b.refuse.add('budget_actuals_2026_8');
    act(() => { appStorage.setItem('budget_actuals_2026_8', '[{"id":"x"}]'); });
    await waitFor(() => expect(document.querySelector('.save-error-banner')).not.toBeNull());
    // On a phone there is no browser to free space in.
    expect(document.querySelector('.save-error-banner')!.textContent).toContain(sv.saveFailedBodyApp);
    // The app's copy shows what is stored, not the refused value.
    expect(appStorage.getItem('budget_actuals_2026_8')).toBeNull();

    // Still refused: Try again leaves the banner up.
    fireEvent.click(buttonWith(sv.saveRetry)!);
    await settle();
    expect(document.querySelector('.save-error-banner')).not.toBeNull();

    // Space freed: Try again stores exactly what was refused, then closes.
    b.refuse.clear();
    fireEvent.click(buttonWith(sv.saveRetry)!);
    await waitFor(() => expect(document.querySelector('.save-error-banner')).toBeNull());
    expect(b.disk.get('budget_actuals_2026_8')).toBe('[{"id":"x"}]');
  });
});

describe('a backup', () => {
  it('holds what is stored, and says first that a refused change is not in it', async () => {
    const saved: string[] = [];
    vi.stubGlobal('showSaveFilePicker', async () => ({
      createWritable: async () => ({
        write: async (d: string) => { saved.push(d); },
        close: async () => {},
      }),
    }));
    const asked: string[] = [];
    vi.stubGlobal('confirm', (m: string) => { asked.push(String(m)); return true; });
    await openApp();
    b.refuse.add('budget_actuals_2026_8');
    act(() => { appStorage.setItem('budget_actuals_2026_8', '[{"id":"refused"}]'); });
    await waitFor(() => expect(document.querySelector('.save-error-banner')).not.toBeNull());

    fireEvent.click(buttonWith(sv.exportData)!);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(asked).toContain(sv.backupHasUnsaved);
    const file = JSON.parse(saved[0]) as { data: Record<string, string> };
    expect(file.data.budget_actuals_2026_8).toBeUndefined();
    expect(file.data.budget_2026_8).toBe(SEPT);
  });

  it('is not made at all if the user would rather not, while something is unsaved', async () => {
    const picker = vi.fn();
    vi.stubGlobal('showSaveFilePicker', picker);
    vi.stubGlobal('confirm', () => false);
    await openApp();
    b.refuse.add('budget_actuals_2026_8');
    act(() => { appStorage.setItem('budget_actuals_2026_8', '[]'); });
    await waitFor(() => expect(document.querySelector('.save-error-banner')).not.toBeNull());
    fireEvent.click(buttonWith(sv.exportData)!);
    await settle();
    expect(picker).not.toHaveBeenCalled();
  });
});
