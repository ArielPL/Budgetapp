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

/** Matches a per-month amounts key and captures its year and month. */
const VALUES_KEY_RE = /^budget_custom_v3_values_(\d+)_(\d+)$/;

/**
 * How many stored months hold a recorded amount for any of these rows.
 *
 * Used before a delete, so the user is told what a layout edit will do to
 * history rather than discovering it afterwards.
 *
 * Two decisions worth keeping:
 *
 * The ACTIVE month is included. It was once skipped, on the reasoning that the
 * user can see what they are removing — but the amount does not leave with the
 * block. The month's snapshot keeps its filing, so the year view goes on
 * counting money the monthly budget has stopped showing. That is the case most
 * worth warning about, not the one to leave out.
 *
 * A recorded 0 counts, because the user typed it and Custom has no separate
 * "recorded" flag to appeal to. Corruption still does not: the reader elsewhere
 * coerces unusable entries to 0, so this looks at the RAW stored value and
 * insists on a real finite number. A stored null or string is evidence of a bad
 * write, not of anything a person did.
 */
export function monthsHoldingRows(storage: StorageLike, rowIds: string[]): number {
  if (rowIds.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !VALUES_KEY_RE.test(key)) continue;
    try {
      const vals = JSON.parse(storage.getItem(key) ?? '{}');
      if (rowIds.some(id => Number.isFinite(vals?.[id]))) count++;
    } catch { /* unreadable month — nothing to warn about */ }
  }
  return count;
}

/**
 * Freeze today's filing for every month that has amounts but no snapshot.
 *
 * Snapshots only started being written when a month's amounts were saved, so
 * every month recorded before that still relies on the fallback in
 * `customYearRows`: today's block list. That fallback is the original bug held
 * one step back — delete or retag a block and those older months change their
 * answer about the past. Writing the snapshot they never got closes it.
 *
 * Rules this migration obeys, in order of how much damage breaking them would do:
 *
 * 1. It never touches an amount. It writes one new key per month and nothing else.
 * 2. It never overwrites a snapshot that already exists — not even an unreadable
 *    one. A month that already made its own record is not this function's to
 *    revise, and "corrupt" is a guess we are not entitled to act on.
 * 3. It is idempotent: a second run finds every month already covered and writes
 *    nothing. That matters because it runs on every mount, and twice per mount
 *    under StrictMode.
 * 4. It records only the rows that month actually holds money for. A snapshot
 *    describes how THIS month's money is filed; copying in tags for rows the
 *    month never had would be inventing history rather than preserving it.
 *
 * Deliberately skipped, and why:
 *
 * - No blocks at all (Custom never set up, or storage lost). `snapshotOf` would
 *   return an empty map, and writing it would permanently file every legacy
 *   month as unclassified — turning a recoverable fallback into a locked-in
 *   wrong answer. Doing nothing keeps every option open.
 * - A month whose amounts will not parse. There is nothing readable to protect,
 *   and guessing at its contents is how data gets rewritten.
 * - A month whose rows are all unknown today. The fallback and the snapshot
 *   would say the same thing (unclassified), so the write buys nothing and costs
 *   the chance that the structure comes back — via a backup import, say.
 *
 * Returns how many months were written, for tests and for the caller to log.
 */
export function migrateLegacySnapshots(
  storage: StorageLike,
  blocks: YearBlockLike[],
): number {
  const currentTags = snapshotOf(blocks).tags;
  if (Object.keys(currentTags).length === 0) return 0;

  // Collect first, write after: mutating storage while walking its index by
  // position can skip entries, and localStorage gives no iteration guarantee.
  const pending: { key: string; tags: Record<string, BlockTag> }[] = [];

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const match = key && VALUES_KEY_RE.exec(key);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isFinite(year) || month < 0 || month > 11) continue;
    if (storage.getItem(customSnapshotKey(year, month)) !== null) continue;

    const values = readValues(storage, year, month);
    if (!values) continue;

    const tags: Record<string, BlockTag> = {};
    for (const id of Object.keys(values)) {
      const tag = currentTags[id];
      if (tag) tags[id] = tag;
    }
    if (Object.keys(tags).length === 0) continue;

    pending.push({ key: customSnapshotKey(year, month), tags });
  }

  for (const { key, tags } of pending) {
    storage.setItem(key, JSON.stringify({ v: 1, tags } satisfies MonthSnapshot));
  }
  return pending.length;
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
