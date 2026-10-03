// ── debtStore — the Debt tab's one key ─────────────────────────────────────
//
// Everything the tab knows lives in `budget_debts`: the debts as the user
// entered them, the extra amount a month, and the chosen order. One key, so a
// change to it is one write, and a backup carries it like any other.
//
// Read DEFENSIVELY: a hand-edited or half-written value must not take the tab
// down. A debt that does not hold up is dropped rather than half-trusted —
// the same rule the undo stack and the backup check follow.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';
import { DEBT_KINDS, type Debt, type Strategy } from './debts';

export const DEBTS_KEY = 'budget_debts';

export interface DebtState {
  debts: Debt[];
  /** Paid on top of the debts' own payments, each month. */
  extraPerMonth: number;
  strategy: Strategy;
}

export const EMPTY_DEBTS: DebtState = { debts: [], extraPerMonth: 0, strategy: 'avalanche' };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function isDebt(v: unknown): v is Debt {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return typeof d.id === 'string' && d.id !== ''
    && typeof d.name === 'string'
    && (DEBT_KINDS as readonly unknown[]).includes(d.kind)
    && isNum(d.balance) && d.balance >= 0
    && isDate(d.balanceDate)
    && isNum(d.ratePct) && d.ratePct >= 0 && d.ratePct < 1000
    && isNum(d.monthlyPayment) && d.monthlyPayment >= 0
    && (d.budgetRowId === undefined || typeof d.budgetRowId === 'string');
}

export function loadDebts(storage: StorageLike): DebtState {
  let raw: string | null;
  try { raw = storage.getItem(DEBTS_KEY); } catch { return EMPTY_DEBTS; }
  if (!raw) return EMPTY_DEBTS;
  try {
    const v = JSON.parse(raw) as Partial<DebtState> | null;
    if (typeof v !== 'object' || v === null) return EMPTY_DEBTS;
    return {
      debts: Array.isArray(v.debts) ? v.debts.filter(isDebt) : [],
      extraPerMonth: isNum(v.extraPerMonth) && v.extraPerMonth >= 0 ? v.extraPerMonth : 0,
      strategy: v.strategy === 'snowball' ? 'snowball' : 'avalanche',
    };
  } catch {
    return EMPTY_DEBTS;
  }
}

/** The write that stores `state`. */
export function debtsChange(state: DebtState): StorageChange {
  return { key: DEBTS_KEY, value: JSON.stringify(state) };
}

/** Whether a stored value holds a debt — for "is there anything worth a
 *  backup on this device". */
export function debtsHaveContent(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const v = JSON.parse(raw) as { debts?: unknown };
    return Array.isArray(v?.debts) && v.debts.some(isDebt);
  } catch {
    return false;
  }
}
