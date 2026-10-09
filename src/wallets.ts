// ── Wallets — a separate budget for one thing, like a trip ─────────────────
//
// A wallet has its own total, its own parts ("pots": travel, stay, food…) and
// its own expenses, typed in as they happen. It is SEPARATE from the regular
// budget by design (Ariel, 2026-10-04): nothing in it is counted in a month,
// and nothing in a month is counted in it. A wallet starts empty and the user
// makes its parts; a trip is a template that starts with four.
//
// Everything lives in one key, `budget_wallets`, so every change is one write
// and a backup carries it like any other key. Read defensively, like the debt
// store: a wallet that does not hold up is dropped rather than half-trusted.

import type { StorageLike } from './storage';
import type { StorageChange } from './storageWrite';
import { toCents } from './money';

export const WALLETS_KEY = 'budget_wallets';
/** Which panel Custom opens on: a wallet's id, or absent for the budget. A
 *  per-device convenience, so the trip you are on is where the app opens. */
export const OPEN_PANEL_KEY = 'budget_panel_open';

export type WalletKind = 'blank' | 'trip';
export const WALLET_KINDS: readonly WalletKind[] = ['blank', 'trip'];

export interface WalletPot {
  id: string;
  name: string;
  /** Planned for this part. */
  planned: number;
}

export interface WalletExpense {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  text: string;
  /** Positive. */
  amount: number;
  /** The part it belongs to; '' for none — a wallet need not have parts. */
  potId: string;
}

export interface Wallet {
  id: string;
  name: string;
  /** How it started. Only the icon differs afterwards. */
  kind: WalletKind;
  /** The whole budget for the wallet. */
  total: number;
  /** Optional dates, "YYYY-MM-DD". */
  from?: string;
  to?: string;
  pots: WalletPot[];
  /** Oldest first, as entered. */
  expenses: WalletExpense[];
  archived?: boolean;
}

/** The trip template: its parts, and the share of the total each starts with.
 *  The shares only fill in a first plan; every amount can be changed. */
export const TRIP_POTS = [
  { key: 'travel', share: 0.30 },
  { key: 'stay', share: 0.35 },
  { key: 'food', share: 0.20 },
  { key: 'fun', share: 0.15 },
] as const;
export type TripPotKey = (typeof TRIP_POTS)[number]['key'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isPot(v: unknown): v is WalletPot {
  return isObj(v) && typeof v.id === 'string' && v.id !== '' && typeof v.name === 'string'
    && isNum(v.planned) && v.planned >= 0;
}

function isExpense(v: unknown): v is WalletExpense {
  return isObj(v) && typeof v.id === 'string' && v.id !== '' && isDate(v.date)
    && typeof v.text === 'string' && isNum(v.amount) && v.amount >= 0 && typeof v.potId === 'string';
}

export function isWallet(v: unknown): v is Wallet {
  if (!isObj(v)) return false;
  if (!(typeof v.id === 'string' && v.id !== '' && typeof v.name === 'string'
    && (WALLET_KINDS as readonly unknown[]).includes(v.kind)
    && isNum(v.total) && v.total >= 0
    && (v.from === undefined || isDate(v.from)) && (v.to === undefined || isDate(v.to))
    && Array.isArray(v.pots) && v.pots.every(isPot)
    && Array.isArray(v.expenses) && v.expenses.every(isExpense)
    && (v.archived === undefined || typeof v.archived === 'boolean'))) return false;
  // Every expense belongs to a part the wallet has, or to none.
  const pots = new Set((v.pots as WalletPot[]).map(p => p.id));
  return (v.expenses as WalletExpense[]).every(e => e.potId === '' || pots.has(e.potId));
}

/** For the backup check: the whole stored value. */
export function isWalletStore(v: unknown): boolean {
  return isObj(v) && Array.isArray(v.wallets) && v.wallets.every(isWallet);
}

export function loadWallets(storage: StorageLike): Wallet[] {
  let raw: string | null;
  try { raw = storage.getItem(WALLETS_KEY); } catch { return []; }
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { wallets?: unknown } | null;
    return Array.isArray(v?.wallets) ? v.wallets.filter(isWallet) : [];
  } catch {
    return [];
  }
}

/** The write that stores `wallets`. */
export function walletsChange(wallets: Wallet[]): StorageChange {
  return { key: WALLETS_KEY, value: JSON.stringify({ wallets }) };
}

/** Whether a stored value holds a wallet — for "is there anything worth a
 *  backup on this device". */
export function walletsHaveContent(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const v = JSON.parse(raw) as { wallets?: unknown };
    return Array.isArray(v?.wallets) && v.wallets.some(isWallet);
  } catch {
    return false;
  }
}

/** A new empty wallet: a name and a total, and nothing else until the user
 *  adds it. */
export function newBlank(
  { id, name, total, from, to }: { id: string; name: string; total: number; from?: string; to?: string },
): Wallet {
  return { id, name: name.trim(), kind: 'blank', total, from, to, pots: [], expenses: [] };
}

/**
 * A new trip wallet. The total is shared out over the template's parts in
 * whole units, the last part taking what rounding left, so the parts always
 * add up to exactly the total.
 */
export function newTrip(
  { id, name, total, from, to, potNames, newId }: {
    id: string; name: string; total: number; from?: string; to?: string;
    potNames: Record<TripPotKey, string>; newId: () => string;
  },
): Wallet {
  let given = 0;
  const pots = TRIP_POTS.map((p, i) => {
    const planned = i === TRIP_POTS.length - 1 ? total - given : Math.round(total * p.share);
    given += planned;
    return { id: newId(), name: potNames[p.key], planned };
  });
  return { id, name: name.trim(), kind: 'trip', total, from, to, pots, expenses: [] };
}

export interface PotSummary {
  pot: WalletPot;
  spent: number;
}

export interface WalletSummary {
  spent: number;
  /** total − spent; negative when over. */
  left: number;
  pots: PotSummary[];
  /** Planned over the parts — may differ from the total if the user changed one. */
  plannedInPots: number;
  /** Spent on expenses that belong to no part. */
  unassigned: number;
  /** Where today sits in the dates, when there are dates. */
  timing:
    | { kind: 'none' }
    | { kind: 'before'; days: number }
    | { kind: 'during'; daysLeft: number }
    | { kind: 'after' };
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** `today` is "YYYY-MM-DD" in the user's own time zone. */
export function walletSummary(w: Wallet, today: string): WalletSummary {
  const byPot = new Map<string, number>();
  let spent = 0;
  for (const e of w.expenses) {
    spent += e.amount;
    byPot.set(e.potId, (byPot.get(e.potId) ?? 0) + e.amount);
  }
  let plannedInPots = 0;
  for (const p of w.pots) plannedInPots += p.planned;
  const t = dayNumber(today);
  let timing: WalletSummary['timing'] = { kind: 'none' };
  if (w.from && t < dayNumber(w.from)) timing = { kind: 'before', days: dayNumber(w.from) - t };
  else if (w.to && t > dayNumber(w.to)) timing = { kind: 'after' };
  else if (w.to) timing = { kind: 'during', daysLeft: dayNumber(w.to) - t + 1 };
  // To the cent, or a wallet spent to the cent read as "0 € over" — toCents.
  spent = toCents(spent);
  return {
    spent, left: toCents(w.total - spent), plannedInPots: toCents(plannedInPots), timing,
    unassigned: toCents(byPot.get('') ?? 0),
    pots: w.pots.map(pot => ({ pot, spent: toCents(byPot.get(pot.id) ?? 0) })),
  };
}
