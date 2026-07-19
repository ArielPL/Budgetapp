export interface BudgetRow {
  id: string;
  label: string;
  amount: number;
  isCustom?: boolean;
  userNamed?: boolean;
}

export interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  rows: BudgetRow[];
  userNamed?: boolean;
}

export interface MonthData {
  income: BudgetRow[];
  expenses: BudgetCategory[];
  savings: BudgetCategory[];
  /** Has the user actually RECORDED a savings balance this month? Creating
   *  categories (template, "+ add category") is just structure and stores
   *  `false`; editing any savings amount — including to exactly 0 — stores
   *  `true`. Absent on months saved before the flag existed: those infer from
   *  `savings.length > 0`, because back then structure only appeared alongside
   *  real numbers (see calculateSavingsMetrics). */
  savingsSnapshotRecorded?: boolean;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string; // "YYYY-MM"
  color: string;
  budgetRowId?: string; // links to a row in the 'sparande' expense category
  userNamed?: boolean;
}

export interface PlanData {
  goals: SavingsGoal[];
  notes: string;
}

export type ActiveTab = 'budget' | 'savings' | 'plan' | 'year';
