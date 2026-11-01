// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { installStorage } from './storage';
import { createCachedStorage, type AsyncBackend } from './storageCache';
import { translations } from './i18n';

// ── Debt changes in quick succession (deep review 2026-10-14, P1) ───────────
//
// A new extra amount, then a strategy, chosen before the first had been
// stored: both changes were built from the same old copy, and the second write
// put the old extra back while the field still showed the new one. Over the
// cached store the apps use, with a database that can be held or made to
// refuse. Synthetic values only.

const sv = translations.sv;

const makeBackend = (seed: Record<string, string>) => {
  const disk = new Map(Object.entries(seed));
  let gate: Promise<void> | null = null;
  let open: () => void = () => {};
  let refuse = 0;
  let refuseIf: ((value: string) => boolean) | null = null;
  const b: AsyncBackend & {
    disk: Map<string, string>; hold(): void; release(): void; refuseNext(): void;
    refuseWhen(f: (value: string) => boolean): void;
  } = {
    disk,
    hold() { gate = new Promise(r => { open = r; }); },
    release() { gate = null; open(); },
    refuseNext() { refuse += 1; },
    refuseWhen(f) { refuseIf = f; },
    async loadAll() { return Object.fromEntries(disk); },
    async write(k, v) { disk.set(k, v); },
    async remove(k) { disk.delete(k); },
    async commit(changes) {
      if (gate) await gate;
      if (refuse > 0) { refuse -= 1; throw new Error('SYNT refused'); }
      if (refuseIf && changes.some(c => c.value !== null && refuseIf!(c.value))) throw new Error('SYNT refused');
      for (const c of changes) {
        if (c.value === null) disk.delete(c.key); else disk.set(c.key, c.value);
      }
    },
  };
  return b;
};

const debt = (id: string, name: string, balance: number) => ({
  id, name, kind: 'loan', balance, balanceDate: '2026-09-01', ratePct: 5, monthlyPayment: 500,
});
const DEBTS = JSON.stringify({
  debts: [debt('d1', 'SYNT Lån A', 10000), debt('d2', 'SYNT Lån B', 4000)],
  extraPerMonth: 200, strategy: 'snowball', plainRows: [],
});

let b: ReturnType<typeof makeBackend>;
let alerts: string[];

const boot = async () => {
  b = makeBackend({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_changelog_seen: 'x', budget_debts: DEBTS,
  });
  const store = createCachedStorage(b);
  await store.hydrate();
  installStorage(store);
  render(<App />);
  await waitFor(() => expect(document.querySelector('.app-main')).not.toBeNull());
  fireEvent.click([...document.querySelectorAll('.tab-btn')].find(el => el.getAttribute('aria-label') === sv.tabDebt)!);
  await waitFor(() => expect(document.getElementById('debt-extra')).not.toBeNull());
};

beforeEach(() => {
  localStorage.clear();
  alerts = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('alert', (m: string) => { alerts.push(m); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const stored = () => JSON.parse(b.disk.get('budget_debts')!) as {
  debts: { id: string; name: string }[]; extraPerMonth: number; strategy: string;
};
const extraField = () => document.getElementById('debt-extra') as HTMLInputElement;
const typeExtra = (v: string) => {
  fireEvent.change(extraField(), { target: { value: v } });
  fireEvent.blur(extraField());
};
const card = (title: string) =>
  [...document.querySelectorAll('button.debt-way-card')].find(el => el.textContent?.includes(title))!;
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); });

describe('Skuld: two quick changes keep both', () => {
  it('a new extra amount, then a strategy, before the first is stored', async () => {
    await boot();
    b.hold();
    typeExtra('300');
    fireEvent.click(card(sv.debtAvalanche));
    b.release();
    await settle();
    expect(stored().extraPerMonth).toBe(300);
    expect(stored().strategy).toBe('avalanche');
    expect(extraField().value).toBe('300');
  });

  it('a strategy, then a new extra amount, before the first is stored', async () => {
    await boot();
    b.hold();
    fireEvent.click(card(sv.debtAvalanche));
    typeExtra('300');
    b.release();
    await settle();
    expect(stored().extraPerMonth).toBe(300);
    expect(stored().strategy).toBe('avalanche');
  });

  it('a new extra amount and a deleted debt, before either is stored', async () => {
    await boot();
    b.hold();
    typeExtra('300');
    fireEvent.click(document.querySelector(`[aria-label="${sv.debtDelete('SYNT Lån B')}"]`)!);
    fireEvent.click([...document.querySelectorAll('button.debt-delete-btn')].find(el => el.textContent === sv.debtDeleteShort)!);
    b.release();
    await settle();
    expect(stored().extraPerMonth).toBe(300);
    expect(stored().debts.map(d => d.id)).toEqual(['d1']);
  });
});

describe('Skuld: a refused write', () => {
  it('says so, puts the field back to what is stored, and the next change still lands', async () => {
    await boot();
    b.hold();
    b.refuseNext();
    typeExtra('300');
    fireEvent.click(card(sv.debtAvalanche));
    b.release();
    await settle();
    expect(alerts).toEqual([sv.changeNotSaved]);
    expect(stored().extraPerMonth).toBe(200);
    expect(stored().strategy).toBe('avalanche');
    await waitFor(() => expect(extraField().value).toBe('200'));
  });

  it('the second of two refused: the first stays stored, and the screen shows it', async () => {
    await boot();
    b.refuseWhen(v => v.includes('"strategy":"avalanche"'));
    b.hold();
    typeExtra('300');
    fireEvent.click(card(sv.debtAvalanche));
    b.release();
    await settle();
    expect(alerts).toEqual([sv.changeNotSaved]);
    expect(stored().extraPerMonth).toBe(300);
    expect(stored().strategy).toBe('snowball');
    expect(extraField().value).toBe('300');
    expect(card(sv.debtSnowball).getAttribute('aria-pressed')).toBe('true');
  });
});
