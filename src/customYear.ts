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
}

export interface CustomYearTotals {
  income: number;
  expenses: number;
  saved: number;
  remaining: number;
}

/** The per-month amounts key. Exported so CustomV3 and this module cannot drift. */
export const customValuesKey = (year: number, month: number): string =>
  `budget_custom_v3_values_${year}_${month}`;

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
  // The structure is cross-month, so one rowId → tag map serves all twelve.
  // Only real blocks carry rows; summary and note blocks have none.
  const tagOf = new Map<string, BlockTag>();
  for (const b of blocks) {
    if (b.kind !== 'block') continue;
    for (const r of b.rows) tagOf.set(r.id, b.tag);
  }

  return Array.from({ length: 12 }, (_, index) => {
    const values = readValues(storage, year, index);
    let income = 0, expenses = 0, saved = 0;
    if (values) {
      for (const [id, amount] of Object.entries(values)) {
        // A row id with no tag belongs to a block deleted since the amount was
        // written. Its money is no longer part of any budget, so it is skipped
        // rather than silently landing in a column it was never assigned to.
        const tag = tagOf.get(id);
        if (tag === 'in') income += amount;
        else if (tag === 'out') expenses += amount;
        else if (tag === 'save') saved += amount;
      }
    }
    return {
      index, income, expenses, saved,
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
  }), { income: 0, expenses: 0, saved: 0, remaining: 0 });
}
