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
  /** Weekly envelopes made together share this, so a week can find the one
   *  before it (Ariel, 2026-10-27). */
  series?: string;
  /** What the week before left and was moved into this one; 0 when the user
   *  said no. Absent until asked. */
  carry?: number;
  /** The row the envelope is shown in, and that row's name, which the user
   *  can change (Ariel, 2026-10-29): envelopes made together share one, and a
   *  new one starts its own. Absent on envelopes made before rows. */
  groupId?: string;
  groupName?: string;
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
    && (v.archived === undefined || typeof v.archived === 'boolean')
    && (v.series === undefined || typeof v.series === 'string')
    && (v.carry === undefined || (isNum(v.carry) && v.carry >= 0))
    && (v.groupId === undefined || typeof v.groupId === 'string')
    && (v.groupName === undefined || typeof v.groupName === 'string'))) return false;
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

// ── A wallet made from Left to live on ─────────────────────────────────────

/** "YYYY-MM-DD" of a local date. */
export const isoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The ISO week number (Monday first, week 1 holds the year's first Thursday). */
export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * The week a "per week" wallet covers: Monday to Sunday of this week when
 * today falls in the month being planned, otherwise the month's first seven
 * days — planning next month on the 28th plans its first week, not this one.
 */
export function walletWeek(today: Date, month: { from: Date; to: Date }): { from: Date; to: Date } {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const inMonth = day >= month.from && day <= month.to;
  const from = inMonth ? new Date(day) : new Date(month.from);
  if (inMonth) from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from, to };
}

// ── Envelopes from Left to live on, with rows of the budget taken along ────
//
// Ariel, 2026-10-27: the month's amount becomes one envelope, and each budget
// row ticked — groceries, say — an envelope of its own beside it. The week's
// becomes one envelope per week left in the period, each holding its share of
// what is left and of every row ticked, as parts.

/** A row of envelopes: its id, and the name it shows. */
export interface EnvelopeGroupName {
  id: string;
  name: string;
}

/** A row of envelopes as shown: those not archived first. */
export interface EnvelopeGroup extends EnvelopeGroupName {
  wallets: Wallet[];
}

/**
 * The rows envelopes are shown in, in the order each row's first envelope was
 * made. Envelopes from before rows share one, with the id '' and `fallback`
 * for a name.
 */
export function envelopeGroups(wallets: Wallet[], fallback: string): EnvelopeGroup[] {
  const groups: EnvelopeGroup[] = [];
  for (const w of wallets) {
    const id = w.groupId ?? '';
    let g = groups.find(x => x.id === id);
    if (!g) {
      g = { id, name: id === '' ? fallback : w.groupName || fallback, wallets: [] };
      groups.push(g);
    }
    g.wallets.push(w);
  }
  for (const g of groups) g.wallets = [...g.wallets.filter(w => !w.archived), ...g.wallets.filter(w => w.archived)];
  return groups;
}

/** Every envelope in row `id` given the name `name`. The row of older
 *  envelopes ('') becomes a row of its own with `newId`, so it keeps a name. */
export function renameGroup(wallets: Wallet[], id: string, name: string, newId: string): Wallet[] {
  return wallets.map(w => ((w.groupId ?? '') === id
    ? { ...w, groupId: id === '' ? newId : id, groupName: name }
    : w));
}

/** A budget row offered to take along. */
export interface EnvelopeRow {
  id: string;
  label: string;
  amount: number;
}

/** The Monday-to-Sunday weeks of a period, cut at its ends, and how many of
 *  the period's days each holds. */
export function periodWeeks(period: { from: Date; to: Date }): { from: Date; to: Date; days: number }[] {
  const weeks: { from: Date; to: Date; days: number }[] = [];
  const start = new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate());
  const end = new Date(period.to.getFullYear(), period.to.getMonth(), period.to.getDate());
  let from = start;
  while (from <= end) {
    const sunday = new Date(from);
    sunday.setDate(sunday.getDate() + (7 - ((from.getDay() + 6) % 7)) - 1);
    const to = sunday < end ? sunday : end;
    weeks.push({ from, to, days: Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 });
    from = new Date(to);
    from.setDate(from.getDate() + 1);
  }
  return weeks;
}

/**
 * `amount` shared over `weeks` by their days, in whole units: each week gets
 * the rounded running total less what the weeks before it got, so the shares
 * always add up to exactly `amount`.
 */
function shareByDays(amount: number, weeks: { days: number }[]): number[] {
  const total = weeks.reduce((n, w) => n + w.days, 0);
  let days = 0;
  let given = 0;
  return weeks.map(w => {
    days += w.days;
    const upTo = Math.round((amount * days) / total);
    const share = upTo - given;
    given = upTo;
    return share;
  });
}

/**
 * The envelopes a month makes: what is left, named `name`, and one for each
 * row taken along, all over the same period.
 */
export function monthEnvelopes(
  { name, left, rows, period, group, newId }: {
    name: string; left: number; rows: EnvelopeRow[]; period: { from: Date; to: Date };
    group: EnvelopeGroupName; newId: () => string;
  },
): Wallet[] {
  const from = isoDay(period.from);
  const to = isoDay(period.to);
  const inGroup = (w: Wallet): Wallet => ({ ...w, groupId: group.id, groupName: group.name });
  return [
    inGroup(newBlank({ id: newId(), name, total: left, from, to })),
    ...rows.map(r => inGroup(newBlank({ id: newId(), name: r.label, total: r.amount, from, to }))),
  ];
}

/**
 * The envelopes a week makes: one per week of the period, leaving out the
 * weeks already over when `today` falls inside it. Each holds its days' share of what is left and of each row taken
 * along; with rows, those shares are its parts, what is left first.
 */
export function weekEnvelopes(
  { name, left, rows, period, today, everyday, group, newId }: {
    name: (week: number) => string; left: number; rows: EnvelopeRow[];
    period: { from: Date; to: Date }; today: Date; everyday: string;
    group: EnvelopeGroupName; newId: () => string;
  },
): Wallet[] {
  const weeks = periodWeeks(period);
  const leftShares = shareByDays(left, weeks);
  const rowShares = rows.map(r => shareByDays(r.amount, weeks));
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Weeks already over are skipped only while the period runs. A period
  // planned ahead, or one already over, gets every week: skipping them all
  // made "0 envelopes" (Ariel, 2026-10-29, on a pay period that had ended).
  const running = weeks.length > 0 && day >= weeks[0].from && day <= weeks[weeks.length - 1].to;
  const series = newId();
  return weeks.flatMap((w, i) => {
    if (running && w.to < day) return [];
    const pots: WalletPot[] = rows.length === 0 ? [] : [
      { id: newId(), name: everyday, planned: leftShares[i] },
      ...rows.map((r, k) => ({ id: newId(), name: r.label, planned: rowShares[k][i] })),
    ];
    const total = leftShares[i] + rowShares.reduce((n, s) => n + s[i], 0);
    return [{
      ...newBlank({ id: newId(), name: name(isoWeek(w.from)), total, from: isoDay(w.from), to: isoDay(w.to) }),
      pots, series, groupId: group.id, groupName: group.name,
    }];
  });
}

/** Today, or the nearest day of `from`–`to` when today is outside them: a
 *  November envelope opened in October starts on 1 November (review
 *  2026-10-29, P2-1). */
export function expenseDay(today: string, from?: string, to?: string): string {
  if (from && today < from) return from;
  if (to && today > to) return to;
  return today;
}

/** The week before `w` in its series, if there is one. */
export function previousInSeries(w: Wallet, all: Wallet[]): Wallet | undefined {
  if (!w.series || !w.from) return undefined;
  const from = w.from;
  return all
    .filter(x => x.series === w.series && x.id !== w.id && x.to !== undefined && x.to < from)
    .sort((a, b) => (a.to! < b.to! ? 1 : -1))[0];
}

/**
 * `amount` from the week before moved into `w`: onto its total, and onto its
 * first part — what is left — when it has parts, so the parts still add up.
 */
export function withCarry(w: Wallet, amount: number): Wallet {
  return {
    ...w,
    carry: amount,
    total: toCents(w.total + amount),
    pots: w.pots.map((p, i) => (i === 0 ? { ...p, planned: toCents(p.planned + amount) } : p)),
  };
}
