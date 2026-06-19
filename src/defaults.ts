import type { BudgetCategory, BudgetRow, MonthData, PlanData } from './types';
import type { Lang } from './i18n';
import { MONTHS_SHORT } from './i18n';

export const CATEGORY_COLORS: Record<string, string> = {
  boende: '#6366f1',
  mat: '#f59e0b',
  transport: '#10b981',
  prenumerationer: '#8b5cf6',
  personligt: '#ec4899',
  fritid: '#f97316',
  sparande: '#14b8a6',
  givande: '#f43f5e',
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

// The two categories wired to the Plan tab — must never be deletable.
export const PROTECTED_CATEGORY_IDS = ['sparande', 'givande'] as const;

export function isProtectedCategory(id: string): boolean {
  return (PROTECTED_CATEGORY_IDS as readonly string[]).includes(id);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Default label dictionary, keyed by language ─────────────────────
const L = {
  // income
  salary: { sv: 'Lön', en: 'Salary' },
  sideIncome: { sv: 'Sidoinkomst', en: 'Side income' },
  benefits: { sv: 'Bidrag/Ersättning', en: 'Benefits' },
  // boende
  boende: { sv: 'Boende', en: 'Housing' },
  rent: { sv: 'Hyra/Bolån', en: 'Rent/Mortgage' },
  electricity: { sv: 'El & Värme', en: 'Electricity & Heating' },
  internet: { sv: 'Internet', en: 'Internet' },
  homeInsurance: { sv: 'Hemförsäkring', en: 'Home insurance' },
  // mat
  mat: { sv: 'Mat & Dryck', en: 'Food & Drink' },
  groceries: { sv: 'Matvaror', en: 'Groceries' },
  restaurant: { sv: 'Restaurang & Takeaway', en: 'Restaurant & Takeaway' },
  coffee: { sv: 'Kaffe & Fika', en: 'Coffee & Snacks' },
  // transport
  transport: { sv: 'Transport', en: 'Transport' },
  publicTransit: { sv: 'SL/Kollektivtrafik', en: 'Public transit' },
  car: { sv: 'Bil', en: 'Car' },
  insurances: { sv: 'Försäkringar', en: 'Insurances' },
  // prenumerationer
  subscriptions: { sv: 'Prenumerationer', en: 'Subscriptions' },
  streaming: { sv: 'Streaming', en: 'Streaming' },
  gym: { sv: 'Gym', en: 'Gym' },
  apps: { sv: 'Appar', en: 'Apps' },
  // personligt
  personligt: { sv: 'Personligt', en: 'Personal' },
  clothes: { sv: 'Kläder', en: 'Clothes' },
  hygiene: { sv: 'Hygien', en: 'Hygiene' },
  health: { sv: 'Hälsa', en: 'Health' },
  // fritid
  fritid: { sv: 'Fritid', en: 'Leisure' },
  hobby: { sv: 'Hobby', en: 'Hobby' },
  giftsCharity: { sv: 'Gåvor & Välgörenhet', en: 'Gifts & Charity' },
  vacation: { sv: 'Semester', en: 'Vacation' },
  // sparande
  sparande: { sv: 'Sparande', en: 'Savings' },
  savingsRow: { sv: 'Sparande', en: 'Savings' },
  investments: { sv: 'Investeringar', en: 'Investments' },
  // givande
  givande: { sv: 'Givande & Välgörenhet', en: 'Giving & Charity' },
  charity: { sv: 'Välgörenhet', en: 'Charity' },
  gifts: { sv: 'Gåvor', en: 'Gifts' },
  // savings tab
  sparkonto: { sv: 'Sparkonto', en: 'Savings account' },
  mainAccount: { sv: 'Huvudkonto', en: 'Main account' },
  bufferAccount: { sv: 'Buffertkonto', en: 'Buffer account' },
  isk: { sv: 'ISK / Aktiedepå', en: 'ISK / Brokerage' },
  stocks: { sv: 'Aktier', en: 'Stocks' },
  etf: { sv: 'ETF:er', en: 'ETFs' },
  fonder: { sv: 'Fonder', en: 'Funds' },
  indexFunds: { sv: 'Indexfonder', en: 'Index funds' },
  activeFunds: { sv: 'Aktivt förvaltade', en: 'Actively managed' },
  pension: { sv: 'Pension (extra)', en: 'Pension (extra)' },
  occupationalPension: { sv: 'Tjänstepension tillägg', en: 'Occupational pension top-up' },
  privatePension: { sv: 'Privat pension', en: 'Private pension' },
  // placeholders for newly added items / goals
  newGoal: { sv: 'Nytt mål', en: 'New goal' },
  newRow: { sv: 'Ny rad', en: 'New row' },
  newItem: { sv: 'Ny post', en: 'New item' },
} as const;

const tr = (entry: { sv: string; en: string }, lang: Lang) => entry[lang];

// Reverse lookup: any known default label (in either language) → its translations.
// Lets built-in labels that were SAVED as plain strings (e.g. all in Swedish) be
// re-rendered in the current language. Labels the user customized won't match and
// are returned unchanged.
const REVERSE_LABELS: Record<string, { sv: string; en: string }> = {};
for (const entry of Object.values(L)) {
  REVERSE_LABELS[entry.sv] = entry;
  REVERSE_LABELS[entry.en] = entry;
}

/** Translate a built-in default label to the current language; pass through custom labels. */
export function displayLabel(label: string, lang: Lang): string {
  return REVERSE_LABELS[label]?.[lang] ?? label;
}

export function defaultIncome(lang: Lang = 'sv'): BudgetRow[] {
  return [
    { id: makeId(), label: tr(L.salary, lang), amount: 0 },
    { id: makeId(), label: tr(L.sideIncome, lang), amount: 0 },
    { id: makeId(), label: tr(L.benefits, lang), amount: 0 },
  ];
}

export function defaultExpenses(lang: Lang = 'sv'): BudgetCategory[] {
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
    // givande rows are always seeded from planData.giving in App.tsx
    defaultGivande([], lang),
  ];
}

export function defaultSavings(lang: Lang = 'sv'): BudgetCategory[] {
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

export function defaultPlanData(lang: Lang = 'sv'): PlanData {
  return {
    goals: [],
    giving: [
      { id: makeId(), label: tr(L.charity, lang), amount: 0 },
      { id: makeId(), label: tr(L.gifts, lang), amount: 0 },
    ],
    notes: '',
  };
}

export function defaultMonthData(lang: Lang = 'sv'): MonthData {
  return {
    income: defaultIncome(lang),
    expenses: defaultExpenses(lang),
    savings: defaultSavings(lang),
  };
}

// A givande category whose rows mirror planData.giving
export function defaultGivande(rows: BudgetRow[] = [], lang: Lang = 'sv'): BudgetCategory {
  return {
    id: 'givande',
    name: tr(L.givande, lang),
    icon: '🤲',
    color: CATEGORY_COLORS.givande,
    rows,
  };
}

export function storageKey(year: number, month: number): string {
  return `budget_${year}_${month}`;
}

export function loadMonthData(year: number, month: number, lang: Lang = 'sv'): MonthData {
  const key = storageKey(year, month);
  const raw = localStorage.getItem(key);
  if (!raw) return defaultMonthData(lang);
  try {
    const parsed = JSON.parse(raw) as MonthData;
    if (!parsed.savings) parsed.savings = defaultSavings(lang);
    // backfill givande category if missing (added later)
    if (!parsed.expenses.find(c => c.id === 'givande')) {
      parsed.expenses.push(defaultGivande([], lang));
    }
    return parsed;
  } catch {
    return defaultMonthData(lang);
  }
}

export function saveMonthData(year: number, month: number, data: MonthData): void {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
}

export function loadPlanData(lang: Lang = 'sv'): PlanData {
  const raw = localStorage.getItem('budget_plan');
  if (!raw) return defaultPlanData(lang);
  try {
    return JSON.parse(raw) as PlanData;
  } catch {
    return defaultPlanData(lang);
  }
}

export function savePlanData(data: PlanData): void {
  localStorage.setItem('budget_plan', JSON.stringify(data));
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
export function loadYearSavingsTotals(year: number, lang: Lang = 'sv'): { month: string; total: number; byCategory: Record<string, number> }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const data = loadMonthData(year, m, lang);
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const cat of data.savings) {
      const sum = cat.rows.reduce((s, r) => s + r.amount, 0);
      byCategory[cat.id] = sum;
      total += sum;
    }
    return { month: MONTHS_SHORT[lang][m], total, byCategory };
  });
}
