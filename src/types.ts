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

/**
 * One thing that actually happened: a purchase, a salary, a transfer.
 *
 * Imported from a bank file or typed by hand — the app stores both the same
 * way ON PURPOSE. A hand-entered figure is not a competing total, it is simply
 * an entry with no file behind it, so a category can never end up with two
 * different answers for what it cost. See src/actuals.ts.
 */
export interface ActualEntry {
  id: string;
  /** "YYYY-MM-DD". Decides which month the entry belongs to — never the month
   *  that happens to be on screen when it is imported. */
  date: string;
  /** The bank's own wording, or what the user typed. Kept verbatim: it is what
   *  makes a transaction recognisable, and what the sorting learns from. */
  text: string;
  /** Positive kronor, matching how budget rows are stored — the sign lives in
   *  `categoryId` (income vs an expense category), not in the number. */
  amount: number;
  /** An expense category's id, or INCOME_ACTUAL_ID for money coming in. */
  categoryId: string;
  /** Typed by hand rather than imported. Shown to the user, because a bank
   *  record and someone's memory deserve to be told apart. Absent = imported. */
  manual?: boolean;
}

export interface PlanData {
  goals: SavingsGoal[];
  notes: string;
}

/** 'followup' sits second, right after 'budget': the plan and what came of it
 *  belong side by side, and the tabs then run from this month outwards to the
 *  year. */
export type ActiveTab = 'budget' | 'followup' | 'savings' | 'plan' | 'year';
