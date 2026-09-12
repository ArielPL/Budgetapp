import type { BudgetCategory, BudgetRow, MonthData, PlanData, SavingsGoal } from './types';
import { safeSetItem } from './storageWrite';
import type { Lang } from './i18n';
import { MONTHS_SHORT } from './i18n';
import { calculateSavingsMetrics, isRowPeriod } from './metrics';
import type { StorageLike } from './backup';
import { coerceStoredMoney, isValidMoney } from './money';
import { appStorage } from './storage';

export const CATEGORY_COLORS: Record<string, string> = {
  boende: '#6366f1',
  mat: '#f59e0b',
  transport: '#10b981',
  prenumerationer: '#8b5cf6',
  personligt: '#ec4899',
  fritid: '#f97316',
  sparande: '#14b8a6',
};

export const SAVINGS_COLORS: Record<string, string> = {
  sparkonto: '#22d3ee',
  isk: '#22c55e',
  fonder: '#a78bfa',
  pension: '#fb923c',
};

export const GOAL_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

// Palette offered as swatches when adding/editing a custom category
export const CATEGORY_PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#f43f5e', '#22d3ee', '#22c55e', '#a78bfa', '#fb923c',
];

// Curated emoji set offered when adding/editing a custom category
export const CATEGORY_ICONS = [
  '🏠', '🛒', '🚌', '📱', '👤', '🎯', '💰', '🤲',
  '🎁', '🐶', '🚗', '✈️', '🍽️', '💊', '📚', '🎓',
  '💡', '🏥', '💳', '🎮',
];

// The four default savings categories — power the growth-chart lines and per-id
// structure, so they must always exist and never be deletable.
const DEFAULT_SAVINGS_IDS = ['sparkonto', 'isk', 'fonder', 'pension'] as const;

// Categories that must never be deletable: the one wired to the Plan tab
// (sparande) plus the four fixed savings defaults.
const PROTECTED_CATEGORY_IDS = ['sparande', ...DEFAULT_SAVINGS_IDS] as const;

export function isProtectedCategory(id: string): boolean {
  return (PROTECTED_CATEGORY_IDS as readonly string[]).includes(id);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Default label dictionary, keyed by language ─────────────────────
type LabelEntry = { sv: string; en: string; es: string };

const L = {
  // income
  salary: { sv: 'Lön', en: 'Salary', es: 'Salario' },
  sideIncome: { sv: 'Sidoinkomst', en: 'Side income', es: 'Ingreso extra' },
  benefits: { sv: 'Bidrag/Ersättning', en: 'Benefits', es: 'Prestaciones' },
  // boende
  boende: { sv: 'Boende', en: 'Housing', es: 'Vivienda' },
  rent: { sv: 'Hyra/Bolån', en: 'Rent/Mortgage', es: 'Alquiler/Hipoteca' },
  electricity: { sv: 'El & Värme', en: 'Electricity & Heating', es: 'Electricidad y calefacción' },
  internet: { sv: 'Internet', en: 'Internet', es: 'Internet' },
  homeInsurance: { sv: 'Hemförsäkring', en: 'Home insurance', es: 'Seguro de hogar' },
  // mat
  mat: { sv: 'Mat & Dryck', en: 'Food & Drink', es: 'Comida y bebida' },
  groceries: { sv: 'Matvaror', en: 'Groceries', es: 'Comestibles' },
  restaurant: { sv: 'Restaurang & Takeaway', en: 'Restaurant & Takeaway', es: 'Restaurante y comida para llevar' },
  coffee: { sv: 'Kaffe & Fika', en: 'Coffee & Snacks', es: 'Café y aperitivos' },
  // transport
  transport: { sv: 'Transport', en: 'Transport', es: 'Transporte' },
  publicTransit: { sv: 'SL/Kollektivtrafik', en: 'Public transit', es: 'Transporte público' },
  car: { sv: 'Bil', en: 'Car', es: 'Coche' },
  insurances: { sv: 'Försäkringar', en: 'Insurances', es: 'Seguros' },
  // prenumerationer
  subscriptions: { sv: 'Prenumerationer', en: 'Subscriptions', es: 'Suscripciones' },
  streaming: { sv: 'Streaming', en: 'Streaming', es: 'Streaming' },
  gym: { sv: 'Gym', en: 'Gym', es: 'Gimnasio' },
  apps: { sv: 'Appar', en: 'Apps', es: 'Aplicaciones' },
  // personligt
  personligt: { sv: 'Personligt', en: 'Personal', es: 'Personal' },
  clothes: { sv: 'Kläder', en: 'Clothes', es: 'Ropa' },
  hygiene: { sv: 'Hygien', en: 'Hygiene', es: 'Higiene' },
  health: { sv: 'Hälsa', en: 'Health', es: 'Salud' },
  // fritid
  fritid: { sv: 'Fritid', en: 'Leisure', es: 'Ocio' },
  hobby: { sv: 'Hobby', en: 'Hobby', es: 'Pasatiempos' },
  giftsCharity: { sv: 'Gåvor & Välgörenhet', en: 'Gifts & Charity', es: 'Regalos y donaciones' },
  vacation: { sv: 'Semester', en: 'Vacation', es: 'Vacaciones' },
  // sparande
  sparande: { sv: 'Sparande', en: 'Savings', es: 'Ahorro' },
  savingsRow: { sv: 'Sparande', en: 'Savings', es: 'Ahorro' },
  investments: { sv: 'Investeringar', en: 'Investments', es: 'Inversiones' },
  // savings tab
  sparkonto: { sv: 'Sparkonto', en: 'Savings account', es: 'Cuenta de ahorro' },
  mainAccount: { sv: 'Huvudkonto', en: 'Main account', es: 'Cuenta principal' },
  bufferAccount: { sv: 'Buffertkonto', en: 'Buffer account', es: 'Cuenta de reserva' },
  isk: { sv: 'ISK / Aktiedepå', en: 'Investment account', es: 'Cuenta de inversión' },
  stocks: { sv: 'Aktier', en: 'Stocks', es: 'Acciones' },
  etf: { sv: 'ETF:er', en: 'ETFs', es: 'ETF' },
  fonder: { sv: 'Fonder', en: 'Funds', es: 'Fondos' },
  indexFunds: { sv: 'Indexfonder', en: 'Index funds', es: 'Fondos indexados' },
  activeFunds: { sv: 'Aktivt förvaltade', en: 'Actively managed', es: 'Gestión activa' },
  pension: { sv: 'Pension (extra)', en: 'Pension (extra)', es: 'Pensión (extra)' },
  occupationalPension: { sv: 'Tjänstepension tillägg', en: 'Occupational pension top-up', es: 'Aporte a pensión laboral' },
  privatePension: { sv: 'Privat pension', en: 'Private pension', es: 'Pensión privada' },
  // placeholders for newly added items / goals
  newGoal: { sv: 'Nytt mål', en: 'New goal', es: 'Nueva meta' },
  newRow: { sv: 'Ny rad', en: 'New row', es: 'Nueva fila' },
  newItem: { sv: 'Ny post', en: 'New item', es: 'Nuevo elemento' },
} as const;

const tr = (entry: LabelEntry, lang: Lang) => entry[lang];

// Reverse lookup: any known default label (in any language) → its translations.
// Lets built-in labels that were SAVED as plain strings (e.g. all in Swedish) be
// re-rendered in the current language. Labels the user customized won't match and
// are returned unchanged.
const REVERSE_LABELS: Record<string, LabelEntry> = {};
for (const entry of Object.values(L)) {
  REVERSE_LABELS[entry.sv] = entry;
  REVERSE_LABELS[entry.en] = entry;
  REVERSE_LABELS[entry.es] = entry;
}

/** Translate a built-in default label to the current language; pass through custom labels. */
function displayLabel(label: string, lang: Lang): string {
  return REVERSE_LABELS[label]?.[lang] ?? label;
}

/**
 * Display name honoring the `userNamed` flag: user-named items are shown raw
 * (never reverse-translated), defaults still translate to the active language.
 * Handles both `name` (categories/goals) and `label` (rows).
 */
export function shownName(
  item: { name?: string; label?: string; userNamed?: boolean },
  lang: Lang,
): string {
  const raw = item.name ?? item.label ?? '';
  return item.userNamed ? raw : displayLabel(raw, lang);
}

function defaultIncome(lang: Lang = 'sv'): BudgetRow[] {
  return [
    { id: makeId(), label: tr(L.salary, lang), amount: 0 },
    { id: makeId(), label: tr(L.sideIncome, lang), amount: 0 },
    { id: makeId(), label: tr(L.benefits, lang), amount: 0 },
  ];
}

function defaultExpenses(lang: Lang = 'sv'): BudgetCategory[] {
  return [
    {
      id: 'boende', name: tr(L.boende, lang), icon: '🏠', color: CATEGORY_COLORS.boende,
      rows: [
        { id: makeId(), label: tr(L.rent, lang), amount: 0 },
        { id: makeId(), label: tr(L.electricity, lang), amount: 0 },
        { id: makeId(), label: tr(L.internet, lang), amount: 0 },
        { id: makeId(), label: tr(L.homeInsurance, lang), amount: 0 },
      ],
    },
    {
      id: 'mat', name: tr(L.mat, lang), icon: '🛒', color: CATEGORY_COLORS.mat,
      rows: [
        { id: makeId(), label: tr(L.groceries, lang), amount: 0 },
        { id: makeId(), label: tr(L.restaurant, lang), amount: 0 },
        { id: makeId(), label: tr(L.coffee, lang), amount: 0 },
      ],
    },
    {
      id: 'transport', name: tr(L.transport, lang), icon: '🚌', color: CATEGORY_COLORS.transport,
      rows: [
        { id: makeId(), label: tr(L.publicTransit, lang), amount: 0 },
        { id: makeId(), label: tr(L.car, lang), amount: 0 },
        { id: makeId(), label: tr(L.insurances, lang), amount: 0 },
      ],
    },
    {
      id: 'prenumerationer', name: tr(L.subscriptions, lang), icon: '📱', color: CATEGORY_COLORS.prenumerationer,
      rows: [
        { id: makeId(), label: tr(L.streaming, lang), amount: 0 },
        { id: makeId(), label: tr(L.gym, lang), amount: 0 },
        { id: makeId(), label: tr(L.apps, lang), amount: 0 },
      ],
    },
    {
      id: 'personligt', name: tr(L.personligt, lang), icon: '👤', color: CATEGORY_COLORS.personligt,
      rows: [
        { id: makeId(), label: tr(L.clothes, lang), amount: 0 },
        { id: makeId(), label: tr(L.hygiene, lang), amount: 0 },
        { id: makeId(), label: tr(L.health, lang), amount: 0 },
      ],
    },
    {
      id: 'fritid', name: tr(L.fritid, lang), icon: '🎯', color: CATEGORY_COLORS.fritid,
      rows: [
        { id: makeId(), label: tr(L.hobby, lang), amount: 0 },
        { id: makeId(), label: tr(L.giftsCharity, lang), amount: 0 },
        { id: makeId(), label: tr(L.vacation, lang), amount: 0 },
      ],
    },
    {
      id: 'sparande', name: tr(L.sparande, lang), icon: '💰', color: CATEGORY_COLORS.sparande,
      rows: [
        { id: makeId(), label: tr(L.savingsRow, lang), amount: 0 },
        { id: makeId(), label: tr(L.investments, lang), amount: 0 },
      ],
    },
  ];
}

function defaultSavings(lang: Lang = 'sv'): BudgetCategory[] {
  return [
    {
      id: 'sparkonto', name: tr(L.sparkonto, lang), icon: '🏦', color: SAVINGS_COLORS.sparkonto,
      rows: [
        { id: makeId(), label: tr(L.mainAccount, lang), amount: 0 },
        { id: makeId(), label: tr(L.bufferAccount, lang), amount: 0 },
      ],
    },
    {
      id: 'isk', name: tr(L.isk, lang), icon: '📈', color: SAVINGS_COLORS.isk,
      rows: [
        { id: makeId(), label: tr(L.stocks, lang), amount: 0 },
        { id: makeId(), label: tr(L.etf, lang), amount: 0 },
      ],
    },
    {
      id: 'fonder', name: tr(L.fonder, lang), icon: '💹', color: SAVINGS_COLORS.fonder,
      rows: [
        { id: makeId(), label: tr(L.indexFunds, lang), amount: 0 },
        { id: makeId(), label: tr(L.activeFunds, lang), amount: 0 },
      ],
    },
    {
      id: 'pension', name: tr(L.pension, lang), icon: '🛡️', color: SAVINGS_COLORS.pension,
      rows: [
        { id: makeId(), label: tr(L.occupationalPension, lang), amount: 0 },
        { id: makeId(), label: tr(L.privatePension, lang), amount: 0 },
      ],
    },
  ];
}

export function defaultPlanData(_lang: Lang = 'sv'): PlanData {
  return {
    goals: [],
    notes: '',
  };
}

// A brand-new / empty month starts BLANK — no auto-seeded categories. Users
// build from scratch via "+ Add category" / "+ Add goal", or one-tap the
// starter pack (starterMonthData). The lang param is kept for signature
// compatibility with existing callers.
export function defaultMonthData(_lang: Lang = 'sv'): MonthData {
  return { income: [], expenses: [], savings: [] };
}

// The old default category set, offered as a one-tap "starter pack" so a blank
// app isn't a dead end. Not auto-applied — only when the user asks for it.
export function starterMonthData(lang: Lang = 'sv'): MonthData {
  return {
    income: defaultIncome(lang),
    expenses: defaultExpenses(lang),
    savings: defaultSavings(lang),
  };
}

// Make sure every goal that declares a linked budget row (`budgetRowId`) has a
// matching row in the in-budget "sparande" category. The UI promises this link
// survives — but a freshly reset/empty month has NO sparande category, so the
// old inline "only if the category exists" backfill silently dropped the link
// (UX review §7). This pure, immutable helper is the ONE place that guarantee
// lives; call it wherever month data is (re)built: month load, reset, import
// (via reload) and the starter template. Idempotent — re-running never adds a
// duplicate row, so month-switching / reloads can't append twice.
export function ensureGoalLinkedBudgetRows(
  month: MonthData,
  goals: SavingsGoal[],
  lang: Lang = 'sv',
): MonthData {
  const linked = goals.filter(g => g.budgetRowId);
  if (linked.length === 0) return month;

  const sparande = month.expenses.find(c => c.id === 'sparande');
  const existingRowIds = new Set(sparande?.rows.map(r => r.id) ?? []);
  const missing = linked.filter(g => !existingRowIds.has(g.budgetRowId!));
  if (missing.length === 0) return month; // every link already backed by a row

  const newRows: BudgetRow[] = missing.map(g => ({
    id: g.budgetRowId!,
    label: shownName(g, lang),
    amount: 0,
    isCustom: true,
  }));

  if (sparande) {
    // Append the missing rows to the existing category.
    return {
      ...month,
      expenses: month.expenses.map(c =>
        c.id === 'sparande' ? { ...c, rows: [...c.rows, ...newRows] } : c,
      ),
    };
  }

  // No sparande category at all (fresh/reset month) — create a minimal one so
  // the goal↔budget link the Plan tab shows actually exists in the budget.
  const created: BudgetCategory = {
    id: 'sparande',
    name: tr(L.sparande, lang),
    icon: '💰',
    color: CATEGORY_COLORS.sparande,
    rows: newRows,
  };
  return { ...month, expenses: [...month.expenses, created] };
}

export function storageKey(year: number, month: number): string {
  return `budget_${year}_${month}`;
}

/**
 * Is this month already over? A finished month is HISTORY: the goal↔budget
 * backfill must never reach into it and add rows the user never budgeted for.
 * Creating a goal today used to inject a 0 kr row into every earlier month the
 * user happened to browse — rows that then looked like they had always been
 * there (bug report 2026-07-19). The current month counts as open, so a goal
 * created today can still be filled in for today.
 */
export function isHistoricMonth(year: number, monthIndex: number, now = new Date()): boolean {
  const nowYM = now.getFullYear() * 12 + now.getMonth();
  return year * 12 + monthIndex < nowYM;
}

export function loadMonthData(year: number, month: number, lang: Lang = 'sv'): MonthData {
  const key = storageKey(year, month);
  const raw = appStorage.getItem(key);
  if (!raw) return defaultMonthData(lang); // new/empty month → blank
  try {
    const parsed = JSON.parse(raw) as MonthData;
    // Preserve existing saved months EXACTLY — no auto-seeding of default
    // categories (that's now opt-in via the starter pack). Only normalize shape
    // (guard against a missing array) and strip the long-removed 'givande'
    // category, neither of which destroys any user data.
    if (!Array.isArray(parsed.income)) parsed.income = [];
    if (!Array.isArray(parsed.savings)) parsed.savings = [];
    if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
    else parsed.expenses = parsed.expenses.filter(c => c.id !== 'givande');
    // Defensive read: a build before the shared money validation could store an
    // amount as `null` (JSON.stringify's rendering of Infinity/NaN). One null
    // would turn every total that touched it into NaN, so amounts are coerced
    // on the way in. This does NOT rewrite storage — the month is only written
    // back when the user edits it.
    parsed.income = parsed.income.map(normalizeRow);
    parsed.expenses = parsed.expenses.map(normalizeCategory);
    parsed.savings = parsed.savings.map(normalizeCategory);
    return parsed;
  } catch {
    return defaultMonthData(lang);
  }
}

const normalizeRow = (r: BudgetRow): BudgetRow => {
  const amount = isValidMoney(r?.amount) ? r.amount : coerceStoredMoney(r?.amount);
  // Backup import is strict about `period`, but data read straight out of
  // localStorage never passes through it — an older build, a hand edit or a
  // half-written record could carry `period: "week"`. Anything unrecognised is
  // dropped here so it can never reach the arithmetic. Storage itself is left
  // alone; this is a defensive READ, not a migration.
  const period = isRowPeriod(r?.period) ? r.period : undefined;
  if (amount === r?.amount && period === r?.period) return r;
  return { ...r, amount, period };
};

const normalizeCategory = (c: BudgetCategory): BudgetCategory =>
  Array.isArray(c?.rows) ? { ...c, rows: c.rows.map(normalizeRow) } : { ...c, rows: [] };

/** Returns whether the month was written. False means the edit is still only
 *  on screen — the caller must say so rather than imply it was saved (F4). */
export function saveMonthData(year: number, month: number, data: MonthData): boolean {
  const key = storageKey(year, month);
  // Don't CREATE a key for a brand-new, completely empty month — that just
  // litters localStorage with blank entries while navigating (e.g. in Custom
  // mode). An already-saved month is still updated (so clearing it persists).
  // A hand-written period label is content too. Without this, typing one on an
  // otherwise-untouched month looked like it worked and was gone on reload —
  // the label was the month's ONLY content, and this guard dropped it.
  const empty = data.income.length === 0 && data.expenses.length === 0
    && data.savings.length === 0 && !data.periodLabel;
  // Nothing to write is not a failure: the month legitimately stays absent.
  if (empty && appStorage.getItem(key) === null) return true;
  return safeSetItem(appStorage, key, JSON.stringify(data));
}

/**
 * One-time repair for months the OLD backfill already polluted.
 *
 * Before isHistoricMonth existed, opening a finished month planted a 0 kr row
 * for every goal and saved it there. Blocking new writes doesn't undo that —
 * the rows are already on disk, which is why the bug looked unfixed. This
 * removes exactly those rows, and nothing else:
 *
 *   • only months that are already over (the current/future offer stays),
 *   • only rows whose id IS a goal's budgetRowId — an id the app generated for
 *     the link, never one a user-created row can have,
 *   • only rows still at 0 kr — a row with real money in it is budget history
 *     and survives, same rule as everywhere else.
 *
 * Idempotent, but see runHistoricGoalRowMigration: this must NOT keep running
 * on every start, or a zero a user deliberately records in a past month would
 * later match the rule and be swept away.
 */
export function cleanupHistoricGoalRows(
  goals: SavingsGoal[],
  now = new Date(),
  // Injected so the repair is unit-testable without a browser, same port style
  // as backup.ts. Defaults to the real thing in the app.
  storage: StorageLike = appStorage,
): number {
  const linkedIds = new Set(goals.map(g => g.budgetRowId).filter((id): id is string => !!id));
  if (linkedIds.size === 0) return 0;

  let cleaned = 0;
  // Snapshot the keys first: writing while iterating localStorage by index can
  // shift the indices under us.
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k) keys.push(k);
  }

  for (const key of keys) {
    const match = /^budget_(\d{4})_(\d{1,2})$/.exec(key);
    if (!match) continue;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]);
    if (monthIndex > 11 || !isHistoricMonth(year, monthIndex, now)) continue;

    try {
      const month = JSON.parse(storage.getItem(key)!) as MonthData;
      const sparande = month.expenses?.find(c => c.id === 'sparande');
      if (!sparande) continue;
      const kept = sparande.rows.filter(r => !(linkedIds.has(r.id) && (r.amount || 0) === 0));
      if (kept.length === sparande.rows.length) continue;

      // A sparande category left with nothing is just clutter — drop it too.
      const expenses = kept.length > 0
        ? month.expenses.map(c => (c.id === 'sparande' ? { ...c, rows: kept } : c))
        : month.expenses.filter(c => c.id !== 'sparande');
      storage.setItem(key, JSON.stringify({ ...month, expenses }));
      cleaned += sparande.rows.length - kept.length;
    } catch {
      // Malformed month blob — leave it alone rather than risk data.
    }
  }
  return cleaned;
}

/** Marks the historic-goal-row repair as done. Versioned in the name so a
 *  future, differently-scoped repair can ship without disturbing this one. */
export const HISTORIC_GOAL_ROWS_MIGRATION = 'budget_migration_historic_goal_rows_v1';

/**
 * Run the historic-goal-row repair ONCE per device.
 *
 * The repair is idempotent, so re-running it was harmless for the rows it was
 * written for — but not for the user: its rule ("a goal-linked row at exactly
 * 0 in a finished month") also matches a zero someone deliberately records
 * later, and running on every start would quietly delete that (main review §8).
 * The marker is written only after the sweep finishes, so an interrupted first
 * run simply tries again next time.
 */
export function runHistoricGoalRowMigration(
  goals: SavingsGoal[],
  now = new Date(),
  storage: StorageLike = appStorage,
): number {
  if (storage.getItem(HISTORIC_GOAL_ROWS_MIGRATION)) return 0;
  const cleaned = cleanupHistoricGoalRows(goals, now, storage);
  storage.setItem(HISTORIC_GOAL_ROWS_MIGRATION, new Date().toISOString());
  return cleaned;
}

export function loadPlanData(lang: Lang = 'sv'): PlanData {
  const raw = appStorage.getItem('budget_plan');
  if (!raw) return defaultPlanData(lang);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultPlanData(lang);
    const obj = parsed as Partial<PlanData>;
    // A blind `as PlanData` cast used to be enough to make a malformed plan
    // look like app data. Shape and amounts are checked instead: a goal whose
    // amount was stored as `null` reads as 0 rather than making every
    // progress bar NaN, and a non-object goal is dropped instead of crashing.
    const goals = Array.isArray(obj.goals)
      ? obj.goals
        .filter((g): g is SavingsGoal => !!g && typeof g === 'object' && typeof g.id === 'string')
        .map(g => ({
          ...g,
          name: typeof g.name === 'string' ? g.name : '',
          targetAmount: coerceStoredMoney(g.targetAmount),
          currentAmount: coerceStoredMoney(g.currentAmount),
        }))
      : [];
    return { ...defaultPlanData(lang), ...obj, goals };
  } catch {
    return defaultPlanData(lang);
  }
}

/** Returns whether the plan was written — see saveMonthData. */
export function savePlanData(data: PlanData): boolean {
  return safeSetItem(appStorage, 'budget_plan', JSON.stringify(data));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Create a brand-new user category with one starter row.
export function createCategory(name: string, icon: string, color: string, starterRowLabel: string): BudgetCategory {
  return {
    id: generateId(),
    name,
    icon,
    color,
    rows: [{ id: generateId(), label: starterRowLabel, amount: 0, isCustom: true }],
  };
}

export function makeGoalColor(index: number): string {
  return GOAL_COLORS[index % GOAL_COLORS.length];
}

// Read savings totals for every month in a year, for the growth chart
export function loadYearSavingsTotals(year: number, lang: Lang = 'sv'): { month: string; total: number; hasSnapshot: boolean; byCategory: Record<string, number> }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const data = loadMonthData(year, m, lang);
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const cat of data.savings) {
      const sum = cat.rows.reduce((s, r) => s + r.amount, 0);
      byCategory[cat.id] = sum;
      total += sum;
    }
    // `hasSnapshot: false` = the month was never filled in, so callers must plot
    // a gap rather than a 0 (which draws the pot crashing to the axis).
    // Sourced from metrics so there's exactly one definition of "recorded".
    return {
      month: MONTHS_SHORT[lang][m], total,
      hasSnapshot: calculateSavingsMetrics(data).hasSnapshot,
      byCategory,
    };
  });
}
