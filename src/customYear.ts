// ── Year aggregation for the Custom layout ─────────────────────────────────
// Custom hides the whole tab bar, so its users had no way to see more than one
// month at a time. Everything needed was already on disk: the block structure is
// cross-month, and each month has its own rowId → amount map.
//
// Pure and storage-injected (the StorageLike port backup.ts already uses), so it
// unit-tests in node without a browser or a React tree.

import { coerceStoredMoney } from './money';
import type { StorageLike } from './backup';
import type { BlockTag, BlockKind } from './components/CustomV3';

/** Structural shape this module needs — CustomBlock satisfies it. Kept local so
 *  the module never pulls the component (and React, and recharts) into a test. */
export interface YearBlockLike {
  kind: BlockKind;
  tag: BlockTag;
  rows: { id: string }[];
}

export interface CustomYearRow {
  index: number;      // 0-11
  income: number;     // rows belonging to 'in' blocks
  expenses: number;   // 'out'
  saved: number;      // 'save'
  remaining: number;  // income − expenses
  /** Did this month have a stored values entry at all? A month that was never
   *  opened is unknown, not a month where everything was zero. */
  hasData: boolean;
  /** Money on this month that no longer maps to any block — a row deleted
   *  before snapshots existed. Counted and surfaced rather than dropped: it is
   *  the user's number, and silently showing 0 is how the money "disappeared"
   *  in the first place. */
  archived: number;
}

export interface CustomYearTotals {
  income: number;
  expenses: number;
  saved: number;
  remaining: number;
  archived: number;
}

/** The per-month amounts key. Exported so CustomV3 and this module cannot drift. */
export const customValuesKey = (year: number, month: number): string =>
  `budget_custom_v3_values_${year}_${month}`;

/**
 * The per-month STRUCTURE snapshot: which block each row belonged to when the
 * month's amounts were written.
 *
 * The year view used to classify all twelve months with TODAY's block list, so
 * deleting a block made September's 555 kr read as 0 kr, and retagging a block
 * from income to expense rewrote history backwards. Neither touched a stored
 * amount — the money was still on disk — but the user could no longer see it,
 * which is data loss in every way that matters.
 *
 * A separate key rather than a new field inside the values object: every values
 * record already on a real device stays readable exactly as it is.
 */
export const customSnapshotKey = (year: number, month: number): string =>
  `budget_custom_v3_meta_${year}_${month}`;

export interface MonthSnapshot {
  /** Bumped only if this shape changes in a way an older build cannot read. */
  v: 1;
  /** rowId → the tag that row was filed under THAT month. */
  tags: Record<string, BlockTag>;
}

const isTag = (v: unknown): v is BlockTag => v === 'in' || v === 'out' || v === 'save';

/** Build the snapshot to store next to a month's amounts. */
export function snapshotOf(blocks: YearBlockLike[]): MonthSnapshot {
  const tags: Record<string, BlockTag> = {};
  for (const b of blocks) {
    if (b.kind !== 'block') continue;
    for (const r of b.rows) tags[r.id] = b.tag;
  }
  return { v: 1, tags };
}

/**
 * The snapshot to WRITE for a month: today's structure, plus the filing already
 * recorded for any row this month still holds money for.
 *
 * A snapshot describes how this month's MONEY is filed, not merely how the
 * layout looks right now. Replacing it outright meant deleting a block
 * unclassified the amounts in the month you happened to be standing in — the
 * other eleven kept theirs, and only the current one lost its answer. Keeping
 * the old entry for a row that still has an amount is the difference between
 * "this money was income" and "we no longer know what this money was".
 */
export function snapshotToWrite(
  blocks: YearBlockLike[],
  values: Record<string, number>,
  previous: MonthSnapshot | null,
): MonthSnapshot {
  const tags = { ...snapshotOf(blocks).tags };
  for (const [id, tag] of Object.entries(previous?.tags ?? {})) {
    if (!(id in tags) && id in values) tags[id] = tag;
  }
  return { v: 1, tags };
}

/** The snapshot stored for a month, or null when there is none. */
export function loadSnapshot(
  storage: StorageLike, year: number, month: number,
): MonthSnapshot | null {
  return readSnapshot(storage, year, month);
}

function readSnapshot(storage: StorageLike, year: number, month: number): MonthSnapshot | null {
  const raw = storage.getItem(customSnapshotKey(year, month));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.tags !== 'object' || parsed.tags === null) return null;
    const tags: Record<string, BlockTag> = {};
    for (const [id, tag] of Object.entries(parsed.tags as Record<string, unknown>)) {
      if (isTag(tag)) tags[id] = tag;
    }
    return { v: 1, tags };
  } catch { return null; }
}

/** True when the shape is one we could store ourselves — used by backup import. */
export function isMonthSnapshot(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (typeof o.tags !== 'object' || o.tags === null || Array.isArray(o.tags)) return false;
  return Object.values(o.tags as Record<string, unknown>).every(isTag);
}

function readValues(storage: StorageLike, year: number, month: number):
  Record<string, number> | null {
  const raw = storage.getItem(customValuesKey(year, month));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Same defensive read as CustomV3's loadValues: a stored null (what
      // JSON.stringify does with Infinity/NaN) must not poison a year total.
      out[id] = coerceStoredMoney(v);
    }
    return out;
  } catch { return null; }
}

/**
 * Twelve rows for `year`, aggregated by block tag.
 *
 * ⚠️ `saved` IS summed across the months, which is the opposite of what the
 * Classic Year tab does — and that is deliberate, not an oversight.
 *
 * Classic's savings figure is a running BALANCE, so adding twelve months would
 * count the same money twelve times; `yearSavingsGrowth` in metrics.ts exists
 * purely to avoid that. Custom has no balance model and no
 * `savingsSnapshotRecorded` flag: a 'save'-tagged block holds what the user put
 * aside THAT month — the summary block already presents it that way, next to
 * that month's income and expenses. A monthly flow is exactly the thing you sum.
 *
 * So do not "fix" this by reaching for yearSavingsGrowth or
 * calculateSavingsMetrics; neither one describes Custom's data.
 */
export function customYearRows(
  storage: StorageLike,
  blocks: YearBlockLike[],
  year: number,
): CustomYearRow[] {
  // Today's structure, used only as a fallback for months written before
  // snapshots existed. It must never override a month's own record.
  const currentTags = snapshotOf(blocks).tags;

  return Array.from({ length: 12 }, (_, index) => {
    const values = readValues(storage, year, index);
    // The month's OWN structure decides how its money is classified. Editing
    // this month's layout cannot reach backwards and change what September was.
    const snapshot = readSnapshot(storage, year, index);
    const tags = snapshot ? snapshot.tags : currentTags;

    let income = 0, expenses = 0, saved = 0, archived = 0;
    if (values) {
      for (const [id, amount] of Object.entries(values)) {
        const tag = tags[id];
        if (tag === 'in') income += amount;
        else if (tag === 'out') expenses += amount;
        else if (tag === 'save') saved += amount;
        // No tag in this month's record and none today either: the row is gone
        // and predates snapshots, so the honest answer is "we cannot file this",
        // not "it was never there".
        else archived += amount;
      }
    }
    return {
      index, income, expenses, saved, archived,
      // Matches the summary block exactly: saved is not subtracted here.
      remaining: income - expenses,
      hasData: values !== null,
    };
  });
}

export function customYearTotals(rows: CustomYearRow[]): CustomYearTotals {
  return rows.reduce<CustomYearTotals>((acc, r) => ({
    income: acc.income + r.income,
    expenses: acc.expenses + r.expenses,
    saved: acc.saved + r.saved,
    remaining: acc.remaining + r.remaining,
    archived: acc.archived + r.archived,
  }), { income: 0, expenses: 0, saved: 0, remaining: 0, archived: 0 });
}
