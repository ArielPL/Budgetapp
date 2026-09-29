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
  // hold(): the next transactions wait until release() — a slow database.
  let gate: Promise<void> | null = null;
  let open: () => void = () => {};
  const b: AsyncBackend & {
    disk: Map<string, string>; refuse: Set<string>; hold(): void; release(): void;
  } = {
    disk,
    refuse,
    hold() { gate = new Promise(r => { open = r; }); },
    release() { gate = null; open(); },
    async loadAll() { return Object.fromEntries(disk); },
    async write(k, v) { if (refuse.has(k)) throw new Error('refused'); disk.set(k, v); },
    async remove(k) { if (refuse.has(k)) throw new Error('refused'); disk.delete(k); },
    async commit(changes) {
      if (gate) await gate;
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
  it('is not taken down by a DIFFERENT write that saved (foundation review, P1)', async () => {
    await openApp();
    // A is refused…
    b.refuse.add('budget_actuals_2026_8');
    act(() => { appStorage.setItem('budget_actuals_2026_8', '[{"id":"a"}]'); });
    await waitFor(() => expect(document.querySelector('.save-error-banner')).not.toBeNull());
    // …B, an ordinary budget edit, saves fine…
    const amount = document.querySelector<HTMLButtonElement>('.budget-row .amount-display')!;
    fireEvent.click(amount);
    const input = document.activeElement as HTMLInputElement;
    fireEvent.change(input, { target: { value: '31415' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(b.disk.get('budget_2026_8')).toContain('31415'));
    await settle();
    // …and the banner is still up, because A is still not stored.
    expect(document.querySelector('.save-error-banner')).not.toBeNull();
    // A stored by Try again: now it goes.
    b.refuse.clear();
    fireEvent.click(buttonWith(sv.saveRetry)!);
    await waitFor(() => expect(document.querySelector('.save-error-banner')).toBeNull());
    expect(b.disk.get('budget_actuals_2026_8')).toBe('[{"id":"a"}]');
  });

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

// ── Follow-up and Custom wait for the database (foundation review 2026-09-29,
// P1) ─────────────────────────────────────────────────────────────────────

const ENTRIES = JSON.stringify([
  { id: 'e1', date: '2026-09-03', text: 'SYNT A', amount: 100, direction: 'out', categoryId: 'boende' },
  { id: 'e2', date: '2026-09-04', text: 'SYNT B', amount: 200, direction: 'out', categoryId: 'boende' },
  { id: 'e3', date: '2026-09-05', text: 'SYNT C', amount: 300, direction: 'out', categoryId: 'boende' },
]);
const shownEntries = () => [...document.querySelectorAll('.followup-entry-text')].map(e => e.textContent);
const openFollowUp = async () => {
  b.disk.set('budget_actuals_2026_8', ENTRIES);
  const store = createCachedStorage(b);
  await store.hydrate();
  installStorage(store);
  await openApp();
  fireEvent.click(buttonWith(sv.tabFollowUp)!);
  await waitFor(() => expect(buttonWith('Boende')).toBeTruthy());
  fireEvent.click([...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Boende'))!);
  // One row per entry, rather than grouped by place.
  fireEvent.click([...document.querySelectorAll('button.followup-toggle')].find(el => el.textContent === 'Per datum')!);
  await waitFor(() => expect(shownEntries()).toHaveLength(3));
};
const del = (text: string) => fireEvent.click(document.querySelector(`[aria-label="${sv.followUpDelete(text)}"]`)!);
const undoOnDisk = () => JSON.parse(b.disk.get('budget_undo') ?? '[]') as { action: string }[];

describe('Follow-up', () => {
  it('removes an entry from the table only once the database has it', async () => {
    await openFollowUp();
    b.hold();
    del('SYNT A');
    await settle();
    // Waiting: the table and the undo list still say what is stored.
    expect(shownEntries()).toHaveLength(3);
    expect(undoOnDisk()).toEqual([]);
    b.release();
    await waitFor(() => expect(shownEntries()).toEqual(['SYNT B', 'SYNT C']));
    await waitFor(() => expect(undoOnDisk().map(u => u.action)).toEqual(['deleteEntry']));
  });

  it('keeps the entry, offers no step back and says so when the database refuses', async () => {
    await openFollowUp();
    b.refuse.add('budget_actuals_2026_8');
    del('SYNT A');
    await waitFor(() => expect(alerts).toContain(sv.changeNotSaved));
    expect(shownEntries()).toHaveLength(3);
    expect(JSON.parse(b.disk.get('budget_actuals_2026_8')!)).toHaveLength(3);
    expect(undoOnDisk()).toEqual([]);
  });

  it('loses neither of two quick deletes made while the first is still saving', async () => {
    await openFollowUp();
    b.hold();
    del('SYNT A');
    del('SYNT B');
    b.release();
    await waitFor(() => expect(shownEntries()).toEqual(['SYNT C']));
    await settle();
    expect(JSON.parse(b.disk.get('budget_actuals_2026_8')!).map((e: { id: string }) => e.id)).toEqual(['e3']);
  });
});

describe('Custom', () => {
  it('"clear all amounts" changes nothing and says so when the database refuses', async () => {
    b.disk.set('budget_layout', 'custom');
    b.disk.set('budget_custom_mode', 'standalone');
    b.disk.set('budget_custom_help_seen', '1');
    b.disk.set('budget_custom_v3', JSON.stringify([{
      id: 'b', name: 'Resan', userNamed: true, kind: 'block', tag: 'out', width: 'full',
      rows: [{ id: 'x', label: 'Tåg' }], chart: { show: false, type: 'bars', size: 'M', position: 'bottom' },
    }]));
    b.disk.set('budget_custom_v3_values_2026_8', '{"x":5}');
    const store = createCachedStorage(b);
    await store.hydrate();
    installStorage(store);
    await openApp();
    b.refuse.add('budget_custom_v3_values_2026_8');
    // Custom is loaded on demand; clearing lives under Edit layout.
    await waitFor(() => expect(buttonWith('Redigera layout')).toBeTruthy(), { timeout: 4000 });
    fireEvent.click(buttonWith('Redigera layout')!);
    const clear = buttonWith(sv.clearAmounts);
    expect(clear).toBeTruthy();
    fireEvent.click(clear!);
    await waitFor(() => expect(alerts).toContain(sv.changeNotSaved));
    expect(b.disk.get('budget_custom_v3_values_2026_8')).toBe('{"x":5}');
    expect(appStorage.getItem('budget_custom_v3_values_2026_8')).toBe('{"x":5}');
    expect(undoOnDisk()).toEqual([]);
  });
});

// ── A CSV import is one transaction (foundation review 2026-09-29, P1) ──────
//
// The entries, the remembered column layout, the categories the file needs
// and the rules learned from the user's choices land together or not at all,
// and "done" and the step back come only once they have. A synthetic two-month
// statement; the user files ICA under a Mat category that has to be created.

const CSV = 'Datum;Text;Belopp\n2026-09-03;ICA NARA SYNT;-250,00\n2026-08-28;ICA NARA SYNT;-120,00\n';
const IMPORT_KEYS = ['budget_actuals_2026_8', 'budget_actuals_2026_7', 'budget_category_rules', 'budget_csv_maps'];

const importSynthetic = async () => {
  await openApp();
  fireEvent.click(buttonWith(sv.tabFollowUp)!);
  await waitFor(() => expect(buttonWith(sv.followUpImport)).toBeTruthy());
  fireEvent.click(buttonWith(sv.followUpImport)!);
  const input = await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>('input[type=file][accept*=csv]');
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.change(input, { target: { files: [new File([CSV], 'synt.csv', { type: 'text/csv' })] } });
  // Columns first (a new bank layout), then the places.
  await waitFor(() => expect(document.querySelector('.csv-cols, .csv-groups')).not.toBeNull());
  if (document.querySelector('.csv-cols')) fireEvent.click(document.querySelector('.csv-actions .csv-primary')!);
  const place = await waitFor(() => {
    const el = document.querySelector<HTMLSelectElement>('select.csv-group-cat');
    expect(el).not.toBeNull();
    return el!;
  });
  fireEvent.change(place, { target: { value: 'new:mat' } });
  fireEvent.click(document.querySelector('.csv-actions .csv-primary')!);
};

describe('a CSV import', () => {
  it('stores entries, layout, category and rule together — and only then says done', async () => {
    await importSynthetic();
    await waitFor(() => expect(document.querySelector('.followup-toast')).not.toBeNull());
    expect(alerts).toEqual([]);
    expect(JSON.parse(b.disk.get('budget_actuals_2026_8')!)).toHaveLength(1);
    expect(JSON.parse(b.disk.get('budget_actuals_2026_7')!)).toHaveLength(1);
    expect(b.disk.get('budget_csv_maps')).toBeTruthy();
    expect(Object.values(JSON.parse(b.disk.get('budget_category_rules')!))).toContain('mat');
    for (const key of ['budget_2026_8', 'budget_2026_7']) {
      expect(JSON.parse(b.disk.get(key)!).expenses.map((c: { id: string }) => c.id)).toContain('mat');
    }
    await waitFor(() => expect(undoOnDisk().map(u => u.action)).toContain('import'));
    // And after a restart, the same.
    const again = createCachedStorage(b);
    await again.hydrate();
    expect(JSON.parse(again.getItem('budget_actuals_2026_7')!)[0].categoryId).toBe('mat');
  });

  it.each(['budget_actuals_2026_7', 'budget_category_rules'])(
    'stores none of it, says so and records no step back when %s is refused',
    async refused => {
      const monthBefore = b.disk.get('budget_2026_8');
      b.refuse.add(refused);
      await importSynthetic();
      await waitFor(() => expect(alerts).toContain(sv.importWriteFailed));
      for (const key of IMPORT_KEYS) expect(b.disk.has(key)).toBe(false);
      expect(b.disk.get('budget_2026_8')).toBe(monthBefore);
      expect(b.disk.has('budget_2026_7')).toBe(false);
      expect(undoOnDisk()).toEqual([]);
      expect(document.querySelector('.followup-toast')).toBeNull();
    },
  );
});

describe('Follow-up, moving to another month while a change is saving (Codex, 2026-09-29)', () => {
  it('shows only the new month once the old month’s change lands', async () => {
    b.disk.set('budget_2026_9', SEPT);
    b.disk.set('budget_actuals_2026_9', JSON.stringify([
      { id: 'o1', date: '2026-10-02', text: 'SYNT OKT', amount: 50, direction: 'out', categoryId: 'boende' },
    ]));
    await openFollowUp();
    b.hold();
    del('SYNT A');                                   // September's change, held
    fireEvent.click(document.querySelector(`[aria-label="${sv.nextMonth}"]`)!);
    await settle();
    b.release();                                     // …and it lands now
    await settle();
    await settle();
    // Whatever row is open in October, only October's entries can be in it.
    const boende = [...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Boende'))!;
    if (boende.getAttribute('aria-expanded') === 'false') fireEvent.click(boende);
    await waitFor(() => expect(shownEntries()).toEqual(['SYNT OKT']));
    // September's change itself is stored.
    await waitFor(() => expect(JSON.parse(b.disk.get('budget_actuals_2026_8')!).map((e: { id: string }) => e.id)).toEqual(['e2', 'e3']));
  });

  it('also when the write had already started before the move', async () => {
    b.disk.set('budget_2026_9', SEPT);
    b.disk.set('budget_actuals_2026_9', JSON.stringify([
      { id: 'o1', date: '2026-10-02', text: 'SYNT OKT', amount: 50, direction: 'out', categoryId: 'boende' },
    ]));
    await openFollowUp();
    b.hold();
    del('SYNT A');
    await settle();                                  // the transaction is on its way
    expect(shownEntries()).toHaveLength(3);
    fireEvent.click(document.querySelector(`[aria-label="${sv.nextMonth}"]`)!);
    await settle();
    b.release();
    await settle();
    await settle();
    const boende = [...document.querySelectorAll('button.followup-row')].find(el => el.textContent?.includes('Boende'))!;
    if (boende.getAttribute('aria-expanded') === 'false') fireEvent.click(boende);
    await waitFor(() => expect(shownEntries()).toEqual(['SYNT OKT']));
    await waitFor(() => expect(JSON.parse(b.disk.get('budget_actuals_2026_8')!).map((e: { id: string }) => e.id)).toEqual(['e2', 'e3']));
    // Going back shows September as stored.
    fireEvent.click(document.querySelector(`[aria-label="${sv.prevMonth}"]`)!);
    const back = await waitFor(() => {
      const el = [...document.querySelectorAll('button.followup-row')].find(x => x.textContent?.includes('Boende'));
      expect(el).toBeTruthy();
      return el!;
    });
    if (back.getAttribute('aria-expanded') === 'false') fireEvent.click(back);
    await waitFor(() => expect(shownEntries()).toEqual(['SYNT B', 'SYNT C']));
  });
});
