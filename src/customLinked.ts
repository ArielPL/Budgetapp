// ── customLinked — a Custom panel that is a layout over the regular budget ──
//
// The model behind CustomLinked.tsx. A linked block does not hold money: it
// POINTS at the regular budget's income or one of its categories, and the
// amounts are read from budget_<year>_<month> every time. What is stored under
// CUSTOM_LINKED_KEY is presentation only — which parts, in what order, and how.

import type { BudgetCategory, MonthData } from './types';
import { sumRows, sumCategories, categoryTotal, ratePct, recursNextMonth } from './metrics';
import { appStorage } from './storage';
import { CUSTOM_LINKED_KEY } from './customMode';
import { defaultChart, normalizeBlockChart, type BlockChart } from './blockChart';
import { loadMonthText, type BlockWidth } from './components/CustomV3';

export type LinkedSource =
  | { kind: 'income' }
  | { kind: 'category'; id: string }
  | { kind: 'summary' }
  | { kind: 'note' }
  /** What actually happened in one category (or income), from the imported
   *  transactions Follow-up keeps — beside what was budgeted for it. */
  | { kind: 'actual'; id: string }
  /** One savings goal from the Plan tab. */
  | { kind: 'goal'; id: string }
  /** A figure the app already works out: the biggest category, or what is
   *  left per day. */
  | { kind: 'kpi'; metric: KpiMetric };

export type KpiMetric = 'largest' | 'perDay';

/** The blocks that show what the app already knows rather than budget rows. */
export type InsightSource = Extract<LinkedSource, { kind: 'actual' | 'goal' | 'kpi' }>;

export const isInsight = (s: LinkedSource): s is InsightSource =>
  s.kind === 'actual' || s.kind === 'goal' || s.kind === 'kpi';

export interface LinkedBlock {
  id: string;
  source: LinkedSource;
  width: BlockWidth;
  bg: string | null;
  chart: BlockChart;
  icon?: string;
  target?: number;
  /** A note's or summary's title, or the income block's own heading. For a
   *  category it is the last name seen, used only to say which one is missing
   *  in a month that does not have it. */
  name?: string;
  text?: string;
  noteScope?: 'month';
  monthText?: Record<string, string>;
}

/** The regular budget's savings category: saving, not spending. */
export const SAVINGS_CATEGORY = 'sparande';

const uid = () => `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function newLinkedBlock(source: LinkedSource, extra: Partial<LinkedBlock> = {}): LinkedBlock {
  return { id: uid(), source, width: 'half', bg: null, chart: defaultChart(), ...extra };
}

/** The first layout: everything the budget holds this month, then the summary. */
export function defaultLinkedLayout(data: MonthData): LinkedBlock[] {
  return [
    newLinkedBlock({ kind: 'income' }),
    ...data.expenses.map(c => newLinkedBlock({ kind: 'category', id: c.id }, { name: c.name })),
    newLinkedBlock({ kind: 'summary' }, { width: 'full' }),
  ];
}

function isSource(v: unknown): v is LinkedSource {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (s.kind === 'income' || s.kind === 'summary' || s.kind === 'note') return true;
  if (s.kind === 'kpi') return s.metric === 'largest' || s.metric === 'perDay';
  return (s.kind === 'category' || s.kind === 'actual' || s.kind === 'goal')
    && typeof s.id === 'string' && s.id !== '';
}

/** Strict on read, like the standalone loader: a block whose source is unusable
 *  is dropped rather than shown pointing at nothing. */
export function loadLinkedLayout(): LinkedBlock[] | null {
  try {
    const raw = appStorage.getItem(CUSTOM_LINKED_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(b => typeof b === 'object' && b !== null && isSource(b.source)).map(b => ({
      id: typeof b.id === 'string' && b.id ? b.id : uid(),
      source: b.source as LinkedSource,
      width: b.width === 'full' || b.width === 'third' ? b.width : 'half',
      bg: typeof b.bg === 'string' ? b.bg : null,
      chart: normalizeBlockChart(b.chart),
      icon: typeof b.icon === 'string' && b.icon ? b.icon : undefined,
      target: typeof b.target === 'number' && b.target > 0 ? b.target : undefined,
      name: typeof b.name === 'string' ? b.name : undefined,
      text: typeof b.text === 'string' ? b.text : undefined,
      noteScope: b.noteScope === 'month' ? 'month' as const : undefined,
      monthText: loadMonthText(b.monthText),
    }));
  } catch { return null; }
}


/**
 * The panel's money, read from the regular budget. "Expenses" leaves out the
 * savings category and "saved" is that category alone, so the summary shows
 * Kvar before saving and after it — and "after" is exactly the regular
 * budget's own Kvar, since there savings is one of the expense categories.
 */
/** Same source, same block: two "Boende" blocks, or two of one goal, would
 *  only repeat each other. Notes are the exception — any number of them. */
export function sameSource(a: LinkedSource, b: LinkedSource): boolean {
  if (a.kind !== b.kind || a.kind === 'note') return false;
  if (a.kind === 'kpi' && b.kind === 'kpi') return a.metric === b.metric;
  if ('id' in a && 'id' in b) return a.id === b.id;
  return true;
}

/**
 * The biggest spending category this month, and its share of spending.
 * Savings is not spending, so it never wins; null when nothing is budgeted.
 */
export function largestCategory(data: MonthData): { id: string; amount: number; share: number } | null {
  const spending = data.expenses.filter(c => c.id !== SAVINGS_CATEGORY);
  const total = sumCategories(spending);
  let best: { id: string; amount: number } | null = null;
  for (const c of spending) {
    const amount = categoryTotal(c);
    if (amount > 0 && (!best || amount > best.amount)) best = { id: c.id, amount };
  }
  return best ? { ...best, share: ratePct(best.amount, total) } : null;
}

export function linkedSummary(data: MonthData) {
  const income = sumRows(data.income);
  const saved = sumCategories(data.expenses.filter(c => c.id === SAVINGS_CATEGORY));
  const expenses = sumCategories(data.expenses, SAVINGS_CATEGORY);
  return { income, expenses, saved, remaining: income - expenses };
}


// ── Changes that should reach later months too ─────────────────────────────
//
// The regular budget keeps its own set of categories in every month. A
// category added or renamed on a linked panel therefore changed ONE month, and
// the next month's panel said "Transport is not in the budget for October" —
// true, and confusing. Leaving Edit layout now asks whether the change should
// also apply to the later months that already hold a budget.

/** A month as it is stored, with where it belongs. */
export interface StoredMonth { year: number; month: number; data: MonthData }

/**
 * What applying this month's category changes to later months would write.
 *
 * `before` is the month's categories when editing began, `now` as they are.
 * Changed means NEW (absent before) or RENAMED. A later month:
 *   · gets a new category it lacks — its monthly rows, amounts included, the
 *     way "copy to next month" carries a budget forward;
 *   · takes a rename only where it still has the OLD name, so a name the user
 *     chose there on purpose is not overwritten;
 *   · is otherwise left alone. A category missing there that already existed
 *     here is not re-added — the user may have removed it from that month.
 * Savings is never carried: its rows are tied to Plan's goals, and that link
 * is kept by its own rules (ensureGoalLinkedBudgetRows).
 *
 * Returns only the months that actually change, and the names that did.
 */
export function planCarryForward(
  before: BudgetCategory[], now: BudgetCategory[], later: StoredMonth[],
): { names: string[]; months: StoredMonth[] } {
  const was = new Map(before.map(c => [c.id, c]));
  const changed = now.filter(c => c.id !== SAVINGS_CATEGORY
    && (!was.has(c.id) || was.get(c.id)!.name !== c.name));
  if (changed.length === 0) return { names: [], months: [] };

  const months: StoredMonth[] = [];
  for (const m of later) {
    let touched = false;
    const expenses = m.data.expenses.map(c => {
      const next = changed.find(x => x.id === c.id);
      const old = was.get(c.id);
      if (!next || !old || c.name !== old.name || c.name === next.name) return c;
      touched = true;
      return { ...c, name: next.name, userNamed: next.userNamed };
    });
    for (const next of changed) {
      if (was.has(next.id) || expenses.some(c => c.id === next.id)) continue;
      touched = true;
      expenses.push({ ...next, rows: next.rows.filter(recursNextMonth) });
    }
    if (touched) months.push({ ...m, data: { ...m.data, expenses } });
  }
  return { names: changed.map(c => c.name), months };
}
