// ── Budget AI: the changes it may propose, worked out before anything is ───
// ── written                                                              ───
//
// Three of the five change tools had no counterpart in the app: a new amount
// on a row, a new row, and moving a shop's purchases to another category. Each
// is planned here as the exact writes it would make — read from storage, never
// written — so the Confirm box can show before → after and count what moves,
// and the same writes then go to storage in ONE transaction with a step back
// (AiChangeConfirm.tsx). Nothing here is reached unless the user confirms.
//
// Ariel's decisions (2026-10-23):
// - A budget change asks every time: "only October" or "October and later".
//   The budget is stored per month; "later" means the later months already
//   stored that have the row (or the category, for a new row). A month not
//   made yet gets the change the usual way, when it is filled from this one.
// - Moving purchases moves the OLD ones and teaches the sorting the NEW ones,
//   with the number of purchases shown, and can be undone.

import type { BudgetCategory, MonthData } from '../types';
import type { YearMonth } from '../debts';
import type { StorageLike } from '../storage';
import type { StorageChange } from '../storageWrite';
import { storageKey } from '../defaults';
import { actualContribution, actualsKey, INCOME_ACTUAL_ID, loadActuals, TRANSFER_ACTUAL_ID } from '../actuals';
import { learnedRulesChange, normalise } from '../categorise';
import { SEARCH_MIN_LENGTH } from '../tools';
import type { CheckedCall } from './checks';

/** A checked proposal, in the app's own ids — what the Confirm box shows. */
export type AiChange =
  | { kind: 'setAmount'; categoryId: string; rowId: string; amount: number }
  | { kind: 'addRow'; categoryId: string; label: string; amount: number }
  | { kind: 'move'; place: string; categoryId: string };

/** The change a checked call proposes, or null when it is not one of these
 *  three or a field is still open for the user to fill in. */
export function aiChangeOf(call: CheckedCall): AiChange | null {
  if (!call.ok || call.open.length > 0) return null;
  const v = call.values;
  const str = (k: string) => (typeof v[k] === 'string' ? v[k] as string : null);
  const num = (k: string) => (typeof v[k] === 'number' ? v[k] as number : null);
  const categoryId = str('category');
  if (categoryId === null) return null;
  if (call.tool === 'propose_set_amount') {
    const rowId = str('row');
    const amount = num('amount');
    return rowId !== null && amount !== null ? { kind: 'setAmount', categoryId, rowId, amount } : null;
  }
  if (call.tool === 'propose_add_row') {
    const label = str('label');
    const amount = num('amount');
    return label !== null && amount !== null ? { kind: 'addRow', categoryId, label, amount } : null;
  }
  if (call.tool === 'propose_recategorize') {
    const place = str('place');
    return place !== null ? { kind: 'move', place, categoryId } : null;
  }
  return null;
}

/** "Only this month" or "this month and the later ones already stored". */
export type Reach = 'month' | 'later';

/** The month on screen as it is in memory, which may hold edits the save
 *  effect has not written yet. Planning from storage instead would throw
 *  them away. */
export interface Screen {
  at: YearMonth;
  data: MonthData;
}

export interface PlannedChange {
  changes: StorageChange[];
  /** Budget months written, the first one included. */
  months: YearMonth[];
}

const MONTH_KEY = /^budget_(\d{4})_(\d{1,2})$/;
const ACTUALS_KEY = /^budget_actuals_(\d{4})_(\d{1,2})$/;
const index = (at: YearMonth) => at.year * 12 + at.month;

/** Stored months matching `re`, read out before anything is written. */
function storedMonths(storage: StorageLike, re: RegExp): YearMonth[] {
  const out: YearMonth[] = [];
  for (let i = 0; i < storage.length; i++) {
    const m = re.exec(storage.key(i) ?? '');
    if (m) out.push({ year: Number(m[1]), month: Number(m[2]) });
  }
  return out.sort((a, b) => index(a) - index(b));
}

function readMonth(storage: StorageLike, at: YearMonth): MonthData | null {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(at.year, at.month)) ?? 'null') as MonthData | null;
    return parsed && Array.isArray(parsed.expenses) ? parsed : null;
  } catch {
    return null;
  }
}

/** The month the change starts in, then — for "later" — every later stored
 *  month, each read from the screen when it is the one on screen. */
function monthsFor(storage: StorageLike, from: YearMonth, reach: Reach, screen: Screen | null): { at: YearMonth; data: MonthData }[] {
  const read = (at: YearMonth) =>
    screen && index(screen.at) === index(at) ? screen.data : readMonth(storage, at);
  const first = read(from);
  const out = first ? [{ at: from, data: first }] : [];
  if (reach === 'later') {
    for (const at of storedMonths(storage, MONTH_KEY)) {
      if (index(at) <= index(from)) continue;
      const data = read(at);
      if (data) out.push({ at, data });
    }
  }
  return out;
}

const write = (at: YearMonth, data: MonthData): StorageChange =>
  ({ key: storageKey(at.year, at.month), value: JSON.stringify(data) });

const withCategory = (data: MonthData, id: string, edit: (c: BudgetCategory) => BudgetCategory): MonthData =>
  ({ ...data, expenses: data.expenses.map(c => (c.id === id ? edit(c) : c)) });

/**
 * A new amount on one row. In a later month the row is the one with the same
 * id, or failing that the same name in the same category; a month without it
 * is left alone rather than given a row the user never had there.
 */
export function planSetAmount(
  storage: StorageLike, from: YearMonth, screen: Screen | null,
  categoryId: string, rowId: string, amount: number, reach: Reach,
): PlannedChange | null {
  const first = monthsFor(storage, from, 'month', screen)[0];
  const label = first?.data.expenses.find(c => c.id === categoryId)?.rows.find(r => r.id === rowId)?.label;
  if (label === undefined) return null;
  const changes: StorageChange[] = [];
  const months: YearMonth[] = [];
  for (const { at, data } of monthsFor(storage, from, reach, screen)) {
    const cat = data.expenses.find(c => c.id === categoryId);
    const row = cat?.rows.find(r => r.id === rowId)
      ?? cat?.rows.find(r => normalise(r.label) === normalise(label));
    if (!row || row.amount === amount) continue;
    changes.push(write(at, withCategory(data, categoryId, c => ({
      ...c, rows: c.rows.map(r => (r === row ? { ...r, amount } : r)),
    }))));
    months.push(at);
  }
  return { changes, months };
}

/**
 * A new row, in the month the change starts in and — for "later" — every
 * later stored month that has the category. The same id everywhere, as a row
 * carried from month to month has.
 */
export function planAddRow(
  storage: StorageLike, from: YearMonth, screen: Screen | null,
  categoryId: string, label: string, amount: number, reach: Reach, id: string,
): PlannedChange | null {
  const changes: StorageChange[] = [];
  const months: YearMonth[] = [];
  for (const { at, data } of monthsFor(storage, from, reach, screen)) {
    if (!data.expenses.some(c => c.id === categoryId)) continue;
    changes.push(write(at, withCategory(data, categoryId, c => ({
      ...c, rows: [...c.rows, { id, label, amount, isCustom: true, userNamed: true }],
    }))));
    months.push(at);
  }
  return months.length > 0 && index(months[0]) === index(from) ? { changes, months } : null;
}

export interface PlannedMove extends PlannedChange {
  /** Purchases moved. */
  count: number;
  /** Their total, as the search counts it. */
  amount: number;
}

/**
 * Every purchase whose text contains `place` — matched the way the purchase
 * search matches, so the count shown is the count the search shows — moved to
 * `categoryId`, and each of their descriptions learned, so the next import
 * files them there too. Money coming in and transfers between own accounts
 * are not purchases and stay. Null when the place is too short to mean
 * anything.
 */
export function planMove(storage: StorageLike, place: string, categoryId: string): PlannedMove | null {
  const q = normalise(place);
  if (q.length < SEARCH_MIN_LENGTH) return null;
  const changes: StorageChange[] = [];
  const months: YearMonth[] = [];
  const taught: { text: string; categoryId: string }[] = [];
  let count = 0;
  let amount = 0;
  for (const at of storedMonths(storage, ACTUALS_KEY)) {
    const entries = loadActuals(storage, at.year, at.month);
    let moved = false;
    const next = entries.map(e => {
      if (e.categoryId === INCOME_ACTUAL_ID || e.categoryId === TRANSFER_ACTUAL_ID) return e;
      if (!normalise(e.text).includes(q)) return e;
      if (!taught.some(t => normalise(t.text) === normalise(e.text))) taught.push({ text: e.text, categoryId });
      if (e.categoryId === categoryId) return e;
      moved = true;
      count += 1;
      amount += actualContribution(e);
      return { ...e, categoryId };
    });
    if (moved) {
      changes.push({ key: actualsKey(at.year, at.month), value: JSON.stringify(next) });
      months.push(at);
    }
  }
  const rules = learnedRulesChange(storage, taught);
  if (rules) changes.push(rules);
  return { changes, months, count, amount: Math.round(amount * 100) / 100 };
}
