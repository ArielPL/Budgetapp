// ── customBudgets — more than one standalone budget ────────────────────────
//
// Asked for by Ariel on 2026-10-23: a small business, say, wants a budget of
// its own next to the household's. That is a budget, not a wallet: income and
// costs that come back every month, not a sum that is spent down once.
//
// The Custom panel itself stays exactly where it always was (budget_custom_v3*,
// linked or standalone). Every budget added here is standalone, lives under its
// own namespace `budget_cb_<id>` and is never counted anywhere else. The list
// of them and their names sits in one key, so a backup carries them with
// everything else. The panel's own name ("My budget" until the user names it)
// has a key of its own; no name stored means the translated default.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';

export interface CustomBudget {
  id: string;
  name: string;
}

export const CUSTOM_BUDGETS_KEY = 'budget_custom_budgets';
/** What the user calls the Custom panel's own budget. Plain text, not JSON. */
export const CUSTOM_NAME_KEY = 'budget_custom_name';

/** Letters and digits only: the id becomes part of storage keys and of a
 *  regular expression, so it must never carry anything to escape. */
const ID_RE = /^[a-z0-9]{1,40}$/;

/** A budget's namespace, as customYear.ts and CustomV3 take it. */
export const customBudgetNs = (id: string): string => `budget_cb_${id}`;

/** Any key an added budget owns: its structure, or a month's amounts or filing. */
export const CUSTOM_BUDGET_KEY_RE = /^budget_cb_([a-z0-9]+)(?:_(values|meta)_(\d{4})_(\d+))?$/;

export function newCustomBudgetId(): string {
  let id = '';
  while (id.length < 12) id += Math.random().toString(36).slice(2);
  return id.slice(0, 12);
}

const isBudget = (v: unknown): v is CustomBudget =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
  && typeof (v as CustomBudget).id === 'string' && ID_RE.test((v as CustomBudget).id)
  && typeof (v as CustomBudget).name === 'string' && (v as CustomBudget).name.trim() !== '';

/** The stored list is well formed: used by backup import, which refuses junk. */
export function isCustomBudgetList(v: unknown): v is CustomBudget[] {
  if (!Array.isArray(v) || !v.every(isBudget)) return false;
  return new Set(v.map(b => b.id)).size === v.length;
}

export function loadCustomBudgets(storage: StorageLike): CustomBudget[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CUSTOM_BUDGETS_KEY) ?? '[]');
    // One bad entry costs that entry, not the whole list: the others' months
    // are still on disk and still the user's.
    return Array.isArray(parsed) ? parsed.filter(isBudget) : [];
  } catch {
    return [];
  }
}

export function customBudgetsChange(budgets: CustomBudget[]): StorageChange {
  return { key: CUSTOM_BUDGETS_KEY, value: budgets.length ? JSON.stringify(budgets) : null };
}

/** Every key one added budget owns, found by walking storage. Collected first:
 *  removing while walking by index skips entries. */
export function customBudgetKeys(storage: StorageLike, id: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    const m = k ? CUSTOM_BUDGET_KEY_RE.exec(k) : null;
    if (k && m && m[1] === id) keys.push(k);
  }
  return keys;
}

/** The name the user gave the Custom panel's budget, or null for the default. */
export function loadMainBudgetName(storage: StorageLike): string | null {
  try {
    const v = storage.getItem(CUSTOM_NAME_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}
