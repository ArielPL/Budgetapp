/**
 * How often the amount on a row actually falls due.
 *
 * A LABEL about timing, never a multiplier. The amount is what leaves the
 * account in the month the row sits in: a yearly subscription is charged in
 * full, once, so that month's budget shows the full figure. An earlier version
 * divided a yearly amount by twelve — which answers "what does this cost me per
 * month on average?", the opposite of what "how often is it paid" asks, and it
 * made the budget disagree with the bank in the month the money actually went.
 */
export type RowPeriod = 'month' | 'quarter' | 'year' | 'once';

export interface BudgetRow {
  id: string;
  label: string;
  amount: number;
  isCustom?: boolean;
  userNamed?: boolean;
  /** Absent = monthly, which is every row written before this existed — so no
   *  migration, and an untouched budget behaves exactly as it always did.
   *  When set, `amount` is still the figure the user typed and the budget counts
   *  ALL of it in the month the row sits in: a 4 800 yearly insurance is 4 800
   *  that month, not 400. See RowPeriod above for why the division was removed. */
  period?: RowPeriod;
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
  /** The user's own name for what period this month stands for ("Lönevecka 34").
   *  Overrides the label generated from the pay-day rule, for this month only.
   *  Absent = use the rule, or show nothing if no rule is set. Purely a label:
   *  it never touches a total. */
  periodLabel?: string;
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
