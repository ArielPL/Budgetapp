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
