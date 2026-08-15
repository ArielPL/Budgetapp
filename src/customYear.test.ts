import { describe, it, expect } from 'vitest';
import {
  customYearRows, customYearTotals, customValuesKey, customSnapshotKey,
  snapshotOf, isMonthSnapshot, snapshotToWrite,
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

  it('reports an unfilable amount as archived instead of dropping it', () => {
    // This test used to assert the opposite — that money from a deleted row is
    // simply ignored — which made it a guard for the bug rather than against
    // it. A row that predates snapshots and no longer exists cannot be filed,
    // but "we cannot classify this" and "this was never there" are different
    // statements, and only one of them is true.
    const store = new FakeStorage(month(2026, 0, { lon: 30000, spoke: 99999 }));
    const [jan] = customYearRows(store, blocks, 2026);
    expect(jan.income).toBe(30000);
    expect(jan.expenses + jan.saved).toBe(0);
    expect(jan.archived).toBe(99999);
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
      income: 61000, expenses: 18000, saved: 5000, remaining: 43000, archived: 0,
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
    expect(totals).toEqual({ income: 0, expenses: 0, saved: 0, remaining: 0, archived: 0 });
  });
});

// ── History belongs to the month it was written in ────────────────────────
describe('per-month snapshots keep history stable', () => {
  const snapshot = (year: number, m: number, tags: Record<string, string>) =>
    ({ [customSnapshotKey(year, m)]: JSON.stringify({ v: 1, tags }) });

  it('keeps September at 555 kr after the block is deleted in October', () => {
    // The reported bug: deleting a block made an earlier month read 0 kr.
    const store = new FakeStorage({
      ...month(2026, 8, { lon: 555 }),
      ...snapshot(2026, 8, { lon: 'in' }),
    });
    // October's structure no longer contains that row at all.
    const rows = customYearRows(store, [], 2026);
    expect(rows[8].income).toBe(555);
    expect(rows[8].archived).toBe(0);
  });

  it('does not reclassify earlier months when a block changes tag', () => {
    // September recorded 'lon' as income. Today the same block is tagged 'out'.
    const store = new FakeStorage({
      ...month(2026, 8, { lon: 555 }),
      ...snapshot(2026, 8, { lon: 'in' }),
    });
    const retagged: YearBlockLike[] = [
      { kind: 'block', tag: 'out', rows: [{ id: 'lon' }] },
    ];
    const rows = customYearRows(store, retagged, 2026);
    expect(rows[8].income).toBe(555);
    expect(rows[8].expenses).toBe(0);
  });

  it('falls back to today\'s structure for a month with no snapshot', () => {
    // Legacy data: amounts written before snapshots existed.
    const store = new FakeStorage(month(2026, 0, { lon: 30000 }));
    expect(customYearRows(store, blocks, 2026)[0].income).toBe(30000);
  });

  it('lets each month keep its own answer', () => {
    const store = new FakeStorage({
      ...month(2026, 0, { x: 100 }), ...snapshot(2026, 0, { x: 'in' }),
      ...month(2026, 1, { x: 100 }), ...snapshot(2026, 1, { x: 'out' }),
    });
    const rows = customYearRows(store, [], 2026);
    expect(rows[0]).toMatchObject({ income: 100, expenses: 0 });
    expect(rows[1]).toMatchObject({ income: 0, expenses: 100 });
  });

  it('ignores a corrupt snapshot rather than trusting it', () => {
    const store = new FakeStorage({
      ...month(2026, 0, { lon: 30000 }),
      [customSnapshotKey(2026, 0)]: '{"v":99,"tags":{"lon":"in"}}',
    });
    // Falls back to today's structure, which still knows 'lon' is income.
    expect(customYearRows(store, blocks, 2026)[0].income).toBe(30000);
  });

  it('drops an unusable tag inside an otherwise valid snapshot', () => {
    const store = new FakeStorage({
      ...month(2026, 0, { lon: 30000 }),
      [customSnapshotKey(2026, 0)]: '{"v":1,"tags":{"lon":"nonsense"}}',
    });
    const [jan] = customYearRows(store, blocks, 2026);
    expect(jan.income).toBe(0);
    expect(jan.archived).toBe(30000);
  });
});

describe('snapshotOf / isMonthSnapshot', () => {
  it('records the tag of every row a block owns', () => {
    expect(snapshotOf(blocks).tags).toMatchObject({
      lon: 'in', extra: 'in', hyra: 'out', mat: 'out', spar: 'save',
    });
  });

  it('skips summary and note blocks, which own no rows', () => {
    expect(Object.keys(snapshotOf([
      { kind: 'summary', tag: 'in', rows: [] },
      { kind: 'note', tag: 'out', rows: [] },
    ]).tags)).toHaveLength(0);
  });

  it('accepts what it writes and refuses what it does not', () => {
    expect(isMonthSnapshot(snapshotOf(blocks))).toBe(true);
    expect(isMonthSnapshot({ v: 1, tags: {} })).toBe(true);
    for (const bad of [
      null, 'x', [], { v: 2, tags: {} }, { v: 1 },
      { v: 1, tags: { a: 'week' } }, { v: 1, tags: [] },
    ]) expect(isMonthSnapshot(bad)).toBe(false);
  });
});

describe('snapshotToWrite — deleting a block does not unfile money already recorded', () => {
  const prev = { v: 1 as const, tags: { lon: 'in' as const, hyra: 'out' as const } };

  it('keeps the old filing for a row the month still holds an amount for', () => {
    // The income block was just deleted, but this month recorded 32 976 against
    // it. Replacing the snapshot outright made that money unclassifiable in the
    // one month the user was standing in, while every other month kept its answer.
    const remaining: YearBlockLike[] = [
      { kind: 'block', tag: 'out', rows: [{ id: 'hyra' }] },
    ];
    const out = snapshotToWrite(remaining, { lon: 32976, hyra: 8801 }, prev);
    expect(out.tags).toEqual({ lon: 'in', hyra: 'out' });
  });

  it('drops a stale entry once the month no longer holds that amount', () => {
    const out = snapshotToWrite([], { hyra: 8801 }, prev);
    expect(out.tags).toEqual({ hyra: 'out' });
  });

  it('lets today\'s structure win for a row that still exists', () => {
    // Retagging a block applies from now on; the current month follows it.
    const retagged: YearBlockLike[] = [
      { kind: 'block', tag: 'out', rows: [{ id: 'lon' }] },
    ];
    expect(snapshotToWrite(retagged, { lon: 100 }, prev).tags.lon).toBe('out');
  });

  it('works with no previous snapshot', () => {
    const blocks2: YearBlockLike[] = [{ kind: 'block', tag: 'in', rows: [{ id: 'x' }] }];
    expect(snapshotToWrite(blocks2, { x: 1 }, null).tags).toEqual({ x: 'in' });
  });
});
