import { describe, it, expect } from 'vitest';
import {
  customYearRows, customYearTotals, customValuesKey, customSnapshotKey,
  snapshotOf, isMonthSnapshot, snapshotToWrite,
  migrateLegacySnapshots, monthsHoldingRows,
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


// ── Migrating months recorded before snapshots existed ────────────────────
//
// These months are the original bug held one step back: with no record of their
// own they are classified with TODAY's blocks, so deleting or retagging a block
// still rewrites what they say about the past.

describe('migrateLegacySnapshots', () => {
  it('gives a legacy month the record it never got', () => {
    const st = new FakeStorage(month(2026, 8, { lon: 30000, hyra: 9000 }));
    expect(migrateLegacySnapshots(st, blocks)).toBe(1);

    const written = JSON.parse(st.getItem(customSnapshotKey(2026, 8))!);
    expect(written).toEqual({ v: 1, tags: { lon: 'in', hyra: 'out' } });
  });

  it('records only the rows that month actually holds money for', () => {
    // A snapshot says how THIS month's money is filed. Copying in tags for rows
    // the month never had would be inventing history, not preserving it.
    const st = new FakeStorage(month(2026, 8, { lon: 30000 }));
    migrateLegacySnapshots(st, blocks);
    const written = JSON.parse(st.getItem(customSnapshotKey(2026, 8))!);
    expect(Object.keys(written.tags)).toEqual(['lon']);
  });

  it('never overwrites a snapshot that already exists', () => {
    const existing = JSON.stringify({ v: 1, tags: { lon: 'save' } });
    const st = new FakeStorage({
      ...month(2026, 8, { lon: 30000 }),
      [customSnapshotKey(2026, 8)]: existing,
    });
    expect(migrateLegacySnapshots(st, blocks)).toBe(0);
    expect(st.getItem(customSnapshotKey(2026, 8))).toBe(existing);
  });

  it('leaves an unreadable snapshot alone rather than replacing it', () => {
    // "Corrupt" is a guess. A month that made its own record is not this
    // function's to revise, so it steps over it and the fallback still applies.
    const st = new FakeStorage({
      ...month(2026, 8, { lon: 30000 }),
      [customSnapshotKey(2026, 8)]: '{{{ not json',
    });
    expect(migrateLegacySnapshots(st, blocks)).toBe(0);
    expect(st.getItem(customSnapshotKey(2026, 8))).toBe('{{{ not json');
  });

  it('migrates the unprotected months in a mixed year and only those', () => {
    const st = new FakeStorage({
      ...month(2026, 0, { lon: 1000 }),
      ...month(2026, 1, { lon: 2000 }),
      [customSnapshotKey(2026, 1)]: JSON.stringify({ v: 1, tags: { lon: 'in' } }),
      ...month(2026, 2, { hyra: 3000 }),
    });
    expect(migrateLegacySnapshots(st, blocks)).toBe(2);
    expect(st.getItem(customSnapshotKey(2026, 0))).not.toBeNull();
    expect(st.getItem(customSnapshotKey(2026, 2))).not.toBeNull();
  });

  it('is idempotent — a second run changes nothing', () => {
    const st = new FakeStorage(month(2026, 8, { lon: 30000 }));
    expect(migrateLegacySnapshots(st, blocks)).toBe(1);
    const after = st.getItem(customSnapshotKey(2026, 8));
    expect(migrateLegacySnapshots(st, blocks)).toBe(0);
    expect(st.getItem(customSnapshotKey(2026, 8))).toBe(after);
  });

  it('never touches an amount', () => {
    const raw = JSON.stringify({ lon: 30000, hyra: 9000 });
    const st = new FakeStorage({ [customValuesKey(2026, 8)]: raw });
    migrateLegacySnapshots(st, blocks);
    expect(st.getItem(customValuesKey(2026, 8))).toBe(raw);
  });

  it('writes nothing when there is no structure to record', () => {
    // An empty map would file every legacy month as unclassified — permanently.
    // Doing nothing keeps the fallback, and every option, open.
    const st = new FakeStorage(month(2026, 8, { lon: 30000 }));
    expect(migrateLegacySnapshots(st, [])).toBe(0);
    expect(st.getItem(customSnapshotKey(2026, 8))).toBeNull();
  });

  it('skips a month whose amounts will not parse', () => {
    const st = new FakeStorage({ [customValuesKey(2026, 8)]: 'not json at all' });
    expect(migrateLegacySnapshots(st, blocks)).toBe(0);
    expect(st.getItem(customSnapshotKey(2026, 8))).toBeNull();
  });

  it('skips a month whose rows are all unknown today', () => {
    // Snapshot and fallback would say the same thing (unclassified), so the
    // write buys nothing and costs the chance the structure comes back.
    const st = new FakeStorage(month(2026, 8, { gone: 500 }));
    expect(migrateLegacySnapshots(st, blocks)).toBe(0);
    expect(st.getItem(customSnapshotKey(2026, 8))).toBeNull();
  });

  it('ignores keys that only look like a month', () => {
    const st = new FakeStorage({
      'budget_custom_v3_values_2026': JSON.stringify({ lon: 1 }),
      'budget_custom_v3_values_2026_13': JSON.stringify({ lon: 1 }),
      'budget_2026_8': JSON.stringify({ income: [] }),
    });
    expect(migrateLegacySnapshots(st, blocks)).toBe(0);
  });

  it('holds September in place when the block is deleted in October', () => {
    // The whole point, end to end.
    const st = new FakeStorage(month(2026, 8, { lon: 555 }));
    migrateLegacySnapshots(st, blocks);

    const afterDeletingIncome: YearBlockLike[] = blocks.filter(b => b.tag !== 'in');
    const rows = customYearRows(st, afterDeletingIncome, 2026);
    expect(rows[8].income).toBe(555);
    expect(rows[8].archived).toBe(0);
  });

  it('holds September in place when the block is retagged', () => {
    const st = new FakeStorage(month(2026, 8, { lon: 555 }));
    migrateLegacySnapshots(st, blocks);

    const retagged: YearBlockLike[] = [
      { kind: 'block', tag: 'out', rows: [{ id: 'lon' }, { id: 'extra' }] },
      ...blocks.slice(1),
    ];
    const rows = customYearRows(st, retagged, 2026);
    expect(rows[8].income).toBe(555);
    expect(rows[8].expenses).toBe(0);
  });

  it('keeps an unknown row visible as archived instead of dropping it', () => {
    const st = new FakeStorage(month(2026, 8, { lon: 555, gone: 120 }));
    migrateLegacySnapshots(st, blocks);
    const rows = customYearRows(st, blocks, 2026);
    expect(rows[8].income).toBe(555);
    expect(rows[8].archived).toBe(120);
  });

  it('produces snapshots a backup import will accept', () => {
    const st = new FakeStorage(month(2026, 8, { lon: 555 }));
    migrateLegacySnapshots(st, blocks);
    const written = JSON.parse(st.getItem(customSnapshotKey(2026, 8))!);
    expect(isMonthSnapshot(written)).toBe(true);
  });
});

// ── Warning before a delete ───────────────────────────────────────────────

describe('monthsHoldingRows', () => {
  const seeded = () => new FakeStorage({
    ...month(2026, 0, { lon: 1000 }),
    ...month(2026, 1, { lon: 2000, hyra: 500 }),
    ...month(2026, 2, { hyra: 700 }),
  });

  it('counts every month holding any of the rows', () => {
    expect(monthsHoldingRows(seeded(), ['lon'])).toBe(2);
    expect(monthsHoldingRows(seeded(), ['hyra'])).toBe(2);
    expect(monthsHoldingRows(seeded(), ['lon', 'hyra'])).toBe(3);
  });

  it('counts a month at most once however many rows it holds', () => {
    const st = new FakeStorage(month(2026, 1, { lon: 1, hyra: 2, mat: 3 }));
    expect(monthsHoldingRows(st, ['lon', 'hyra', 'mat'])).toBe(1);
  });

  it('counts a recorded 0 — the user typed that too', () => {
    const st = new FakeStorage(month(2026, 1, { lon: 0 }));
    expect(monthsHoldingRows(st, ['lon'])).toBe(1);
  });

  it('does not count a corrupt entry as something the user recorded', () => {
    // The reader coerces these to 0; a bad write is not a decision.
    // Written as raw JSON rather than an object literal: `1e999` is exactly what
    // a bad build left on disk, and TypeScript will not accept it as source.
    const st = new FakeStorage({
      [customValuesKey(2026, 1)]: '{"lon":null,"hyra":"x","mat":1e999}',
    });
    expect(monthsHoldingRows(st, ['lon', 'hyra', 'mat'])).toBe(0);
  });

  it('says nothing about rows nobody has money against', () => {
    expect(monthsHoldingRows(seeded(), ['spar'])).toBe(0);
    expect(monthsHoldingRows(seeded(), [])).toBe(0);
  });

  it('survives a month that will not parse', () => {
    const st = new FakeStorage({
      ...month(2026, 0, { lon: 1000 }),
      [customValuesKey(2026, 1)]: 'broken',
    });
    expect(monthsHoldingRows(st, ['lon'])).toBe(1);
  });

  it('looks only at Custom amount keys', () => {
    const st = new FakeStorage({ budget_2026_8: JSON.stringify({ lon: 5 }) });
    expect(monthsHoldingRows(st, ['lon'])).toBe(0);
  });
});
