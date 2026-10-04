import { describe, it, expect } from 'vitest';
import {
  loadWallets, walletsChange, walletsHaveContent, isWalletStore, newTrip, walletSummary,
  WALLETS_KEY, type Wallet,
} from './wallets';
import type { StorageLike } from './storage';

// Synthetic values only.

const store = (seed: Record<string, string>): StorageLike => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as StorageLike;
};

let n = 0;
const newId = () => `id${n++}`;
const potNames = { travel: 'Resor', stay: 'Boende', food: 'Mat', fun: 'Upplevelser' };
const trip = (total = 40000, extra: Partial<Wallet> = {}): Wallet =>
  ({ ...newTrip({ id: 'w1', name: ' SYNT JAPAN ', total, potNames, newId }), ...extra });

describe('newTrip', () => {
  it('shares the total over the four parts, adding up to exactly the total', () => {
    const w = trip(40001);
    expect(w.name).toBe('SYNT JAPAN');
    expect(w.pots.map(p => [p.name, p.planned])).toEqual([
      ['Resor', 12000], ['Boende', 14000], ['Mat', 8000], ['Upplevelser', 6001],
    ]);
    expect(w.expenses).toEqual([]);
  });
});

describe('walletSummary', () => {
  const w = (() => {
    const base = trip();
    const [travel, stay] = base.pots;
    return {
      ...base, from: '2027-04-03', to: '2027-04-17',
      expenses: [
        { id: 'e1', date: '2026-10-01', text: 'SYNT FLYG', amount: 6500, potId: travel.id },
        { id: 'e2', date: '2026-10-02', text: 'SYNT HOTELL', amount: 2500, potId: stay.id },
      ],
    };
  })();

  it('adds up what is spent, overall and per part', () => {
    const s = walletSummary(w, '2026-10-04');
    expect([s.spent, s.left, s.plannedInPots]).toEqual([9000, 31000, 40000]);
    expect(s.pots.map(p => p.spent)).toEqual([6500, 2500, 0, 0]);
  });

  it('says where today sits in the dates', () => {
    expect(walletSummary(w, '2027-04-01').timing).toEqual({ kind: 'before', days: 2 });
    expect(walletSummary(w, '2027-04-03').timing).toEqual({ kind: 'during', daysLeft: 15 });
    expect(walletSummary(w, '2027-04-17').timing).toEqual({ kind: 'during', daysLeft: 1 });
    expect(walletSummary(w, '2027-04-18').timing).toEqual({ kind: 'after' });
    expect(walletSummary({ ...w, from: undefined, to: undefined }, '2027-04-18').timing).toEqual({ kind: 'none' });
  });

  it('goes below zero when over', () => {
    expect(walletSummary({ ...w, total: 8000 }, '2026-10-04').left).toBe(-1000);
  });
});

describe('storing', () => {
  it('reads back what it wrote', () => {
    const s = store({});
    const w = trip();
    const c = walletsChange([w]);
    s.setItem(c.key, c.value!);
    expect(c.key).toBe(WALLETS_KEY);
    expect(loadWallets(s)).toEqual([w]);
    expect(walletsHaveContent(s.getItem(WALLETS_KEY))).toBe(true);
  });

  it('drops a wallet that does not hold up, and keeps the rest', () => {
    const good = trip();
    const s = store({ [WALLETS_KEY]: JSON.stringify({ wallets: [
      good,
      { ...good, id: 'w2', total: -5 },
      { ...good, id: 'w3', expenses: [{ id: 'x', date: '2026-10-01', text: 'SYNT', amount: 1, potId: 'nope' }] },
      'junk',
    ] }) });
    expect(loadWallets(s).map(w => w.id)).toEqual(['w1']);
    expect(isWalletStore(JSON.parse(s.getItem(WALLETS_KEY)!))).toBe(false);
    expect(isWalletStore({ wallets: [good] })).toBe(true);
  });

  it('reads nothing, without failing, from nothing or junk', () => {
    expect(loadWallets(store({}))).toEqual([]);
    expect(loadWallets(store({ [WALLETS_KEY]: '{oops' }))).toEqual([]);
    expect(walletsHaveContent(null)).toBe(false);
    expect(walletsHaveContent(JSON.stringify({ wallets: [] }))).toBe(false);
  });
});
