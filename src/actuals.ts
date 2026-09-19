// ── actuals — what actually left the account, next to what was planned ──────
//
// The budget holds INTENTIONS: "I mean to spend 4 200 on food". Nothing in the
// app has ever known whether that happened, which is why insight.ts is forbidden
// from ever saying "you spent" — it can only speak about a plan. This module is
// the other half.
//
// Two rules shape everything here.
//
//   1. ONE NUMBER, ONE SOURCE. A category's actual is the SUM OF ITS ENTRIES and
//      nothing else. There is no hand-written total competing with an imported
//      one, because a hand-written figure IS an entry — it simply has no file
//      behind it. So the two can never disagree, and every figure on screen can
//      be opened and read line by line.
//
//   2. AN ENTRY BELONGS TO ITS OWN DATE. A file covering two months writes to
//      both, never to whichever month happens to be on screen. A purchase made
//      in September is September's, even if it was imported in November.
//
//      "September" means the budget month, which is not always the calendar
//      month: a user paid on the 25th lives in 25 Aug – 24 Sep, and their rent
//      and standing charges all land on the turnover day. See budgetMonthOf in
//      periodLabel.ts. With no pay period set the two are the same thing, which
//      is why every function here takes the start day as an optional argument
//      and behaves exactly as before without it.
//
// Pure and DOM-free, like metrics.ts — the arithmetic is unit-tested without a
// browser, and the views can only ever agree because they all call these.

import type { ActualEntry } from './types';
import type { StorageLike } from './storage';
import { applyStorageChanges } from './storageWrite';
import { isValidMoney } from './money';
import { budgetMonthOf, type PeriodLocks } from './periodLabel';
import { isValidIsoDate } from './date';

/** Money IN has no budget category to belong to: income is a list of rows, not
 *  a category. Entries for it carry this id instead. It cannot collide with a
 *  real category — `isProtectedCategory` and the defaults use 'boende', 'mat',
 *  'transport', 'prenumerationer', 'personligt', 'fritid' and 'sparande', and a
 *  user-made category gets a generated id. */
export const INCOME_ACTUAL_ID = '__income__';

/**
 * Two holding buckets, so an import never has to throw a transaction away.
 *
 * Dropping what the sorter could not place was the wrong kind of safe: on one
 * real statement it silently discarded 173 of 471 transactions, and the user
 * had no way to reach them afterwards because they had never become entries.
 * Now everything lands somewhere, visibly, and can be moved out.
 *
 * Ids, not categories, for the same reason INCOME_ACTUAL_ID is: you do not
 * BUDGET for "I don't know yet". They exist only in the record.
 */
export const UNSORTED_ACTUAL_ID = '__unsorted__';
export const TRANSFER_ACTUAL_ID = '__transfer__';

/** Buckets are not categories: they never appear in the budget tab, and
 *  `orphanIds` in the follow-up tab must not collect them as lost categories. */
export function isBucketId(id: string): boolean {
  return id === INCOME_ACTUAL_ID || id === UNSORTED_ACTUAL_ID || id === TRANSFER_ACTUAL_ID;
}

/** Where a month's entries live. Mirrors `budget_<year>_<month>` so the two are
 *  recognisably a pair, and sits inside the backup's `budget_` prefix. */
export const actualsKey = (year: number, month: number): string =>
  `budget_actuals_${year}_${month}`;

/** The year/month an entry belongs to, read from its own date. `month` is the
 *  0-based index the rest of the app uses, so January is 0. */
export function monthOfEntry(dateISO: string): { year: number; month: number } | null {
  if (!isValidIsoDate(dateISO)) return null;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateISO);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

/**
 * What makes two entries "the same transaction".
 *
 * Date, text, amount and bank direction — deliberately NOT the category. The bank decides what
 * a transaction is; which category you filed it under is your opinion about it,
 * and re-filing the same purchase must not turn it into a second purchase.
 */
export function fingerprint(
  e: Pick<ActualEntry, 'date' | 'text' | 'amount' | 'direction'>,
): string {
  return `${e.date}|${e.text.trim().toLowerCase()}|${e.amount}|${e.direction ?? ''}`;
}

/** Fingerprint used only to match records written before bank direction was
 * stored. A legacy row acts as a one-use wildcard for direction so importing
 * the same old statement after an upgrade does not duplicate every entry. */
function legacyFingerprint(
  e: Pick<ActualEntry, 'date' | 'text' | 'amount'>,
): string {
  return `${e.date}|${e.text.trim().toLowerCase()}|${e.amount}`;
}

/** The signed contribution to the category the entry currently belongs to. */
export function actualContribution(entry: ActualEntry): number {
  if (!entry.direction || entry.categoryId === TRANSFER_ACTUAL_ID) return entry.amount;
  const categoryIsIncome = entry.categoryId === INCOME_ACTUAL_ID;
  const bankIsIncoming = entry.direction === 'in';
  return categoryIsIncome === bankIsIncoming ? entry.amount : -entry.amount;
}

/**
 * Which of `incoming` are genuinely new, given what is already stored.
 *
 * COUNTS rather than matches, and that distinction is the whole point. Two
 * coffees at the same café on the same day for the same price is an ordinary
 * thing to do. A rule that simply asked "does this already exist?" would throw
 * the second one away and the user would never know — losing a real purchase to
 * protect against a re-import. Counting protects against the re-import without
 * ever discarding something that actually happened: if the file holds two and
 * storage holds one, exactly one is added.
 */
export function newEntries(incoming: ActualEntry[], existing: ActualEntry[]): ActualEntry[] {
  const have = new Map<string, number>();
  const legacyHave = new Map<string, number>();
  for (const e of existing) {
    if (e.direction) {
      const k = fingerprint(e);
      have.set(k, (have.get(k) ?? 0) + 1);
    } else {
      const k = legacyFingerprint(e);
      legacyHave.set(k, (legacyHave.get(k) ?? 0) + 1);
    }
  }
  const out: ActualEntry[] = [];
  for (const e of incoming) {
    const k = fingerprint(e);
    const left = have.get(k) ?? 0;
    if (left > 0) {
      have.set(k, left - 1); // exact direction already accounted for
      continue;
    }
    const legacyKey = legacyFingerprint(e);
    const legacyLeft = legacyHave.get(legacyKey) ?? 0;
    if (legacyLeft > 0) {
      legacyHave.set(legacyKey, legacyLeft - 1); // pre-direction row: consume once
      continue;
    }
    out.push(e);
  }
  return out;
}

/** Total per category id. Absent categories are absent, not zero: a category
 *  with no entries has no actual yet, which is a different fact from spending
 *  nothing, and the views must be able to tell them apart (same rule the
 *  savings snapshot follows). */
export function sumByCategory(entries: ActualEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    out[e.categoryId] = (out[e.categoryId] ?? 0) + actualContribution(e);
  }
  return out;
}

/** One place, and what it came to. */
export interface TextTotal {
  /** The description as the bank wrote it, from the first entry seen. */
  text: string;
  count: number;
  total: number;
}

/**
 * A category's entries collapsed onto distinct places, biggest first.
 *
 * The view a bank statement cannot give you, because it is sorted by date:
 * eleven separate Espresso House lines scattered through a month say nothing,
 * while "Espresso House, 11 entries, 616 kr" is the whole point. Matched on the
 * description case-insensitively, so the same shop at two tills is one line.
 *
 * Summed with a loop rather than a reduce on purpose — see rowSumGuard.test.ts.
 * That guard exists because five views once each decided for themselves what an
 * amount meant, and this module is not going to become the sixth.
 */
export function groupEntriesByText(entries: ActualEntry[]): TextTotal[] {
  const byText = new Map<string, TextTotal>();
  for (const e of entries) {
    const key = e.text.trim().toLowerCase();
    const group = byText.get(key) ?? { text: e.text.trim(), count: 0, total: 0 };
    group.count += 1;
    group.total += actualContribution(e);
    byText.set(key, group);
  }
  return [...byText.values()]
    .sort((a, b) => b.total - a.total || a.text.localeCompare(b.text));
}

/** Split entries by the month their own date falls in, ready to be written to
 *  one key per month. Entries with an unreadable date are returned separately
 *  rather than dropped — silently losing a row is exactly what this module
 *  exists to prevent. */
export function groupByMonth(
  entries: ActualEntry[], startDay: number | null = null, locks: PeriodLocks = {},
): {
  months: Map<string, { year: number; month: number; entries: ActualEntry[] }>;
  undated: ActualEntry[];
} {
  const months = new Map<string, { year: number; month: number; entries: ActualEntry[] }>();
  const undated: ActualEntry[] = [];
  for (const e of entries) {
    // Defaults to null, so every existing caller keeps the calendar-month
    // behaviour it was written against until it is told about the period.
    const at = budgetMonthOf(e.date, startDay, locks);
    if (!at) { undated.push(e); continue; }
    const key = `${at.year}_${at.month}`;
    const bucket = months.get(key) ?? { ...at, entries: [] };
    bucket.entries.push(e);
    months.set(key, bucket);
  }
  return { months, undated };
}

// ── Reading and writing ────────────────────────────────────────────────────
//
// Storage is passed in rather than reached for, the same way customYear.ts does
// it: the whole module stays testable against a fake, and the app hands it the
// appStorage port so a native build swaps the backing store in one place.

/** Shape check for one stored entry. DEFENSIVE — this reads storage, which may
 *  hold anything an older build, a hand edit or a bad import left behind. Shared
 *  with the backup validator so a file can never carry an entry the app would
 *  then refuse to display. */
export function isActualEntry(v: unknown): v is ActualEntry {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'string' && e.id.length > 0
    && typeof e.date === 'string' && monthOfEntry(e.date) !== null
    && typeof e.text === 'string'
    // Same money rule as everywhere else: NaN and Infinity are not amounts.
    // A row that fails this would poison every total it is part of.
    && isValidMoney(e.amount)
    && typeof e.categoryId === 'string' && e.categoryId.length > 0
    && (e.direction === undefined || e.direction === 'in' || e.direction === 'out')
    && (e.manual === undefined || typeof e.manual === 'boolean');
}

/**
 * One month's entries. Junk is skipped ROW BY ROW rather than failing the whole
 * month: one unreadable entry should not cost you the eleven good ones beside
 * it. A file import is strict instead — see backup.ts — because there the user
 * can still say no.
 */
export function loadActuals(storage: StorageLike, year: number, month: number): ActualEntry[] {
  try {
    const raw = storage.getItem(actualsKey(year, month));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActualEntry);
  } catch {
    return [];
  }
}

// ── Re-filing, when the pay period changes ─────────────────────────────────
//
// Changing the start day changes which month an entry belongs to, so the files
// have to be rebuilt. This is lossless and deterministic for exactly the reason
// the feature is honest in the first place: every entry carries its own date,
// so nothing is guessed and re-running it changes nothing further.
//
// Split in two on purpose. The plan can be shown to the user — "412 entries
// will move" — and can be tested without touching storage; only `applyRefile`
// writes. Data this hard to recreate should never move without being counted
// out loud first.

const ACTUALS_KEY = /^budget_actuals_(\d{4})_(\d{1,2})$/;

/** Every stored actuals key, read out BEFORE anything is written: walking an
 *  index while mutating the same store is how entries go missing. */
function actualKeys(storage: StorageLike): { key: string; year: number; month: number }[] {
  const out: { key: string; year: number; month: number }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null) continue;
    const m = ACTUALS_KEY.exec(key);
    if (m) out.push({ key, year: Number(m[1]), month: Number(m[2]) });
  }
  return out;
}

export interface RefilePlan {
  /** Entries that would land in a different file than they sit in now. */
  moving: number;
  /** Every entry there is, bucketed by where it belongs under the new day. */
  buckets: Map<string, { year: number; month: number; entries: ActualEntry[] }>;
  /** Files that hold entries today and would be left empty. */
  emptied: string[];
  /** Every entry read, whatever happens to it — the count that must not change. */
  total: number;
}

/** What re-filing under `startDay` would do. Reads storage; writes nothing. */
export function planRefile(
  storage: StorageLike, startDay: number | null, locks: PeriodLocks = {},
): RefilePlan {
  const keys = actualKeys(storage);
  const buckets = new Map<string, { year: number; month: number; entries: ActualEntry[] }>();
  let moving = 0;
  let total = 0;

  for (const { key, year, month } of keys) {
    for (const e of loadActuals(storage, year, month)) {
      total++;
      const at = budgetMonthOf(e.date, startDay, locks);
      // Unreadable dates cannot happen — loadActuals validates every entry —
      // but leaving one where it is beats dropping it on the floor.
      const target = at ?? { year, month };
      const targetKey = actualsKey(target.year, target.month);
      if (targetKey !== key) moving++;
      const bucket = buckets.get(targetKey) ?? { ...target, entries: [] };
      bucket.entries.push(e);
      buckets.set(targetKey, bucket);
    }
  }

  const emptied = keys.map(k => k.key).filter(k => !buckets.has(k));
  return { moving, buckets, emptied, total };
}

/**
 * Carry out a plan. Returns whether every write went through.
 *
 * Emptied files are written as `[]` rather than removed. Every touched key is
 * snapshotted first; if one write fails, the earlier writes are restored so a
 * retry cannot read both the old source and a new destination as two entries.
 */
export function applyRefile(storage: StorageLike, plan: RefilePlan): boolean {
  return applyStorageChanges(storage, [
    ...[...plan.buckets.entries()].map(([key, bucket]) => ({
      key,
      value: JSON.stringify(bucket.entries),
    })),
    ...plan.emptied.map(key => ({ key, value: '[]' })),
  ]);
}
