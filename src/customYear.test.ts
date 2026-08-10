import { describe, it, expect } from 'vitest';
import {
  customYearRows, customYearTotals, customValuesKey,
  type YearBlockLike,
} from './customYear';
import type { StorageLike } from './backup';

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const blocks: YearBlockLike[] = [
  { kind: 'block', tag: 'in', rows: [{ id: 'lon' }, { id: 'extra' }] },
  { kind: 'block', tag: 'out', rows: [{ id: 'hyra' }, { id: 'mat' }] },
  { kind: 'block', tag: 'save', rows: [{ id: 'spar' }] },
  { kind: 'summary', tag: 'in', rows: [] },
  { kind: 'note', tag: 'in', rows: [] },
];

const month = (year: number, m: number, values: Record<string, unknown>) =>
  ({ [customValuesKey(year, m)]: JSON.stringify(values) });

describe('customYearRows', () => {
  it('sorts each row into the column its block is tagged with', () => {
    const store = new FakeStorage(month(2026, 0, {
      lon: 30000, extra: 2000, hyra: 9000, mat: 4000, spar: 3000,
    }));
    const [jan] = customYearRows(store, blocks, 2026);
    expect(jan).toMatchObject({
      index: 0, income: 32000, expenses: 13000, saved: 3000,
      remaining: 19000, hasData: true,
    });
  });

  it('leaves remaining as income minus expenses — saved is not subtracted', () => {
    // Must match the Custom summary block, which reads remaining the same way.
    const store = new FakeStorage(month(2026, 0, { lon: 10000, hyra: 4000, spar: 5000 }));
    const [jan] = customYearRows(store, blocks, 2026);
    expect(jan.remaining).toBe(6000);
  });

  it('marks a month with no stored values as unknown, not as zeroes', () => {
    const store = new FakeStorage(month(2026, 0, { lon: 30000 }));
    const rows = customYearRows(store, blocks, 2026);
    expect(rows[0].hasData).toBe(true);
    // February was never opened — the view renders "–" for this, not "0 kr".
    expect(rows[1]).toMatchObject({ hasData: false, income: 0, expenses: 0, saved: 0 });
    expect(rows).toHaveLength(12);
  });

  it('ignores amounts whose block has since been deleted', () => {
    const store = new FakeStorage(month(2026, 0, { lon: 30000, spoke: 99999 }));
    const [jan] = customYearRows(store, blocks, 2026);
    expect(jan.income).toBe(30000);
    expect(jan.expenses + jan.saved).toBe(0);
  });

  it('takes nothing from summary or note blocks', () => {
    const onlyNonRowBlocks: YearBlockLike[] = [
      { kind: 'summary', tag: 'in', rows: [] },
      { kind: 'note', tag: 'out', rows: [] },
    ];
    const store = new FakeStorage(month(2026, 0, { lon: 30000 }));
    const [jan] = customYearRows(store, onlyNonRowBlocks, 2026);
    expect(jan).toMatchObject({ income: 0, expenses: 0, saved: 0 });
  });

  it('reads a corrupt amount as 0 instead of poisoning the total', () => {
    // Written as raw JSON, which is what actually sits on disk: `null` is how
    // JSON.stringify renders Infinity/NaN, and an out-of-range literal parses
    // back to Infinity. One of these leaking through would make the whole year
    // read NaN or Infinity.
    const store = new FakeStorage({
      [customValuesKey(2026, 0)]:
        '{"lon":30000,"extra":null,"hyra":"nio tusen","mat":1e999}',
    });
    const [jan] = customYearRows(store, blocks, 2026);
    expect(jan.income).toBe(30000);
    expect(jan.expenses).toBe(0);
    expect(Number.isFinite(jan.income)).toBe(true);
    expect(Number.isFinite(jan.expenses)).toBe(true);
  });

  it('survives a values entry that is not an object', () => {
    const store = new FakeStorage({
      [customValuesKey(2026, 0)]: '"nope"',
      [customValuesKey(2026, 1)]: '[1,2,3]',
      [customValuesKey(2026, 2)]: '{ trasig',
    });
    const rows = customYearRows(store, blocks, 2026);
    expect(rows.slice(0, 3).every(r => !r.hasData)).toBe(true);
  });

  it('reads each month from its own key', () => {
    const store = new FakeStorage({
      ...month(2026, 0, { lon: 10000 }),
      ...month(2026, 5, { lon: 20000 }),
      ...month(2025, 0, { lon: 999999 }), // another year must not leak in
    });
    const rows = customYearRows(store, blocks, 2026);
    expect(rows[0].income).toBe(10000);
    expect(rows[5].income).toBe(20000);
    expect(rows[1].income).toBe(0);
  });
});

describe('customYearTotals', () => {
  it('adds the months up', () => {
    const store = new FakeStorage({
      ...month(2026, 0, { lon: 30000, hyra: 9000, spar: 3000 }),
      ...month(2026, 1, { lon: 31000, hyra: 9000, spar: 2000 }),
    });
    const totals = customYearTotals(customYearRows(store, blocks, 2026));
    expect(totals).toEqual({
      income: 61000, expenses: 18000, saved: 5000, remaining: 43000,
    });
  });

  it('SUMS saved across the year — deliberately unlike the Classic Year tab', () => {
    // Classic stores a running BALANCE, so summing it would count the same money
    // twelve times; that is what yearSavingsGrowth guards against. Custom stores
    // what was set aside THAT month, and a monthly flow is exactly what you sum.
    // This test exists so nobody "corrects" customYearRows to match Classic.
    const store = new FakeStorage({
      ...month(2026, 0, { spar: 1000 }),
      ...month(2026, 1, { spar: 1000 }),
      ...month(2026, 2, { spar: 1000 }),
    });
    const totals = customYearTotals(customYearRows(store, blocks, 2026));
    expect(totals.saved).toBe(3000); // NOT 1000
  });

  it('is all zeroes for a year that was never used', () => {
    const totals = customYearTotals(customYearRows(new FakeStorage(), blocks, 2026));
    expect(totals).toEqual({ income: 0, expenses: 0, saved: 0, remaining: 0 });
  });
});
