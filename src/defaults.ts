import type { BudgetCategory, BudgetRow, MonthData, PlanData, SavingsGoal } from './types';

export const SWEDISH_MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

export const SWEDISH_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
];

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

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultIncome(): BudgetRow[] {
  return [
    { id: makeId(), label: 'Lön', amount: 0 },
    { id: makeId(), label: 'Sidoinkomst', amount: 0 },
    { id: makeId(), label: 'Bidrag/Ersättning', amount: 0 },
  ];
}

export function defaultExpenses(): BudgetCategory[] {
  return [
    {
      id: 'boende', name: 'Boende', icon: '🏠', color: CATEGORY_COLORS.boende,
      rows: [
        { id: makeId(), label: 'Hyra/Bolån', amount: 0 },
        { id: makeId(), label: 'El & Värme', amount: 0 },
        { id: makeId(), label: 'Internet', amount: 0 },
        { id: makeId(), label: 'Hemförsäkring', amount: 0 },
      ],
    },
    {
      id: 'mat', name: 'Mat & Dryck', icon: '🛒', color: CATEGORY_COLORS.mat,
      rows: [
        { id: makeId(), label: 'Matvaror', amount: 0 },
        { id: makeId(), label: 'Restaurang & Takeaway', amount: 0 },
        { id: makeId(), label: 'Kaffe & Fika', amount: 0 },
      ],
    },
    {
      id: 'transport', name: 'Transport', icon: '🚌', color: CATEGORY_COLORS.transport,
      rows: [
        { id: makeId(), label: 'SL/Kollektivtrafik', amount: 0 },
        { id: makeId(), label: 'Bil', amount: 0 },
        { id: makeId(), label: 'Försäkringar', amount: 0 },
      ],
    },
    {
      id: 'prenumerationer', name: 'Prenumerationer', icon: '📱', color: CATEGORY_COLORS.prenumerationer,
      rows: [
        { id: makeId(), label: 'Streaming', amount: 0 },
        { id: makeId(), label: 'Gym', amount: 0 },
        { id: makeId(), label: 'Appar', amount: 0 },
      ],
    },
    {
      id: 'personligt', name: 'Personligt', icon: '👤', color: CATEGORY_COLORS.personligt,
      rows: [
        { id: makeId(), label: 'Kläder', amount: 0 },
        { id: makeId(), label: 'Hygien', amount: 0 },
        { id: makeId(), label: 'Hälsa', amount: 0 },
      ],
    },
    {
      id: 'fritid', name: 'Fritid', icon: '🎯', color: CATEGORY_COLORS.fritid,
      rows: [
        { id: makeId(), label: 'Hobby', amount: 0 },
        { id: makeId(), label: 'Gåvor & Välgörenhet', amount: 0 },
        { id: makeId(), label: 'Semester', amount: 0 },
      ],
    },
    {
      id: 'sparande', name: 'Sparande', icon: '💰', color: CATEGORY_COLORS.sparande,
      rows: [
        { id: makeId(), label: 'Sparande', amount: 0 },
        { id: makeId(), label: 'Investeringar', amount: 0 },
      ],
    },
    // givande rows are always seeded from planData.giving in App.tsx
    defaultGivande(),
  ];
}

export function defaultSavings(): BudgetCategory[] {
  return [
    {
      id: 'sparkonto', name: 'Sparkonto', icon: '🏦', color: SAVINGS_COLORS.sparkonto,
      rows: [
        { id: makeId(), label: 'Huvudkonto', amount: 0 },
        { id: makeId(), label: 'Buffertkonto', amount: 0 },
      ],
    },
    {
      id: 'isk', name: 'ISK / Aktiedepå', icon: '📈', color: SAVINGS_COLORS.isk,
      rows: [
        { id: makeId(), label: 'Aktier', amount: 0 },
        { id: makeId(), label: 'ETF:er', amount: 0 },
      ],
    },
    {
      id: 'fonder', name: 'Fonder', icon: '💹', color: SAVINGS_COLORS.fonder,
      rows: [
        { id: makeId(), label: 'Indexfonder', amount: 0 },
        { id: makeId(), label: 'Aktivt förvaltade', amount: 0 },
      ],
    },
    {
      id: 'pension', name: 'Pension (extra)', icon: '🛡️', color: SAVINGS_COLORS.pension,
      rows: [
        { id: makeId(), label: 'Tjänstepension tillägg', amount: 0 },
        { id: makeId(), label: 'Privat pension', amount: 0 },
      ],
    },
  ];
}

export function defaultPlanData(): PlanData {
  return {
    goals: [],
    giving: [
      { id: makeId(), label: 'Välgörenhet', amount: 0 },
      { id: makeId(), label: 'Gåvor', amount: 0 },
    ],
    notes: '',
  };
}

export function defaultMonthData(): MonthData {
  return {
    income: defaultIncome(),
    expenses: defaultExpenses(),
    savings: defaultSavings(),
  };
}

// A givande category whose rows mirror planData.giving
export function defaultGivande(rows: BudgetRow[] = []): BudgetCategory {
  return {
    id: 'givande',
    name: 'Givande & Välgörenhet',
    icon: '🤲',
    color: CATEGORY_COLORS.givande,
    rows,
  };
}

export function storageKey(year: number, month: number): string {
  return `budget_${year}_${month}`;
}

export function loadMonthData(year: number, month: number): MonthData {
  const key = storageKey(year, month);
  const raw = localStorage.getItem(key);
  if (!raw) return defaultMonthData();
  try {
    const parsed = JSON.parse(raw) as MonthData;
    if (!parsed.savings) parsed.savings = defaultSavings();
    // backfill givande category if missing (added later)
    if (!parsed.expenses.find(c => c.id === 'givande')) {
      parsed.expenses.push(defaultGivande());
    }
    return parsed;
  } catch {
    return defaultMonthData();
  }
}

export function saveMonthData(year: number, month: number, data: MonthData): void {
  localStorage.setItem(storageKey(year, month), JSON.stringify(data));
}

export function loadPlanData(): PlanData {
  const raw = localStorage.getItem('budget_plan');
  if (!raw) return defaultPlanData();
  try {
    return JSON.parse(raw) as PlanData;
  } catch {
    return defaultPlanData();
  }
}

export function savePlanData(data: PlanData): void {
  localStorage.setItem('budget_plan', JSON.stringify(data));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function makeGoalColor(index: number): string {
  return GOAL_COLORS[index % GOAL_COLORS.length];
}

// Read savings totals for every month in a year, for the growth chart
export function loadYearSavingsTotals(year: number): { month: string; total: number; byCategory: Record<string, number> }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const data = loadMonthData(year, m);
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const cat of data.savings) {
      const sum = cat.rows.reduce((s, r) => s + r.amount, 0);
      byCategory[cat.id] = sum;
      total += sum;
    }
    return { month: SWEDISH_MONTHS_SHORT[m], total, byCategory };
  });
}
