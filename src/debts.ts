// ── debts — the way out of debt, as arithmetic ─────────────────────────────
//
// The Debt tab (Ariel, 2026-10-03). Pure: no storage, no React, so every date
// and every krona the tab shows is unit-tested here.
//
// What it answers, and what it deliberately does not:
//
//   · WHEN each debt is paid, and when all of them are, for a given extra
//     amount a month — by the two orders the research names (Konsumentverket;
//     Gal & McShane, Kellogg 2012): the AVALANCHE, highest interest first,
//     which costs the least; and the SNOWBALL, smallest debt first, which
//     gives the first paid-off debt soonest. Both are shown; neither is
//     recommended. The app does arithmetic, not advice.
//
//   · Every balance is an ESTIMATE. A lender adds interest daily, rounds, and
//     charges fees this model does not know. The user types what the lender
//     says, with the date it said it, and the tab marks everything after that
//     as estimated until it is corrected again.
//
// A mortgage can be listed but takes no part in the way out: it is repaid over
// decades by the bank's own rules and would swamp every date (Ariel's call).

export type DebtKind = 'csn' | 'loan' | 'card' | 'installment' | 'mortgage' | 'other';

export const DEBT_KINDS: readonly DebtKind[] = ['csn', 'loan', 'card', 'installment', 'mortgage', 'other'];

export interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  /** What was owed on `balanceDate`, as the lender said. */
  balance: number;
  /** "YYYY-MM-DD": when that balance was true. */
  balanceDate: string;
  /** Nominal yearly interest in percent, e.g. 2.135. */
  ratePct: number;
  /** What is paid each month. For CSN: the yearly amount ÷ 12. */
  monthlyPayment: number;
  /** The row in the budget's loans category that carries this payment. */
  budgetRowId?: string;
}

export type Strategy = 'avalanche' | 'snowball';

export interface YearMonth {
  year: number;
  /** 0-based, as everywhere in this app. */
  month: number;
}

/** CSN's annuity is built to rise about 2 % a year at an unchanged rate. */
export const CSN_YEARLY_RISE = 0.02;


/** Fifty years. A plan that is not done by then is reported as never done,
 *  not given a date nobody should plan a life around. */
export const HORIZON_MONTHS = 600;

/** Less than this is paid off: floating-point dust, not a debt. */
const PAID = 0.005;

/** Takes part in the way out: owes something, and is not a mortgage. */
export function inPlan(debt: Debt): boolean {
  return debt.kind !== 'mortgage' && debt.balance > PAID;
}

export const addMonths = (at: YearMonth, n: number): YearMonth => {
  const total = at.year * 12 + at.month + n;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
};

const monthsBetween = (from: YearMonth, to: YearMonth) =>
  (to.year - from.year) * 12 + (to.month - from.month);

/** The payment due in month `m` of a plan: CSN's rises once a year. */
function paymentAt(debt: Debt, m: number): number {
  return debt.kind === 'csn'
    ? debt.monthlyPayment * (1 + CSN_YEARLY_RISE) ** Math.floor(m / 12)
    : debt.monthlyPayment;
}

/** One month's interest on `balance`. */
const interestOn = (balance: number, ratePct: number) => balance * (ratePct / 100 / 12);

/**
 * What is probably owed now, from what the lender said on `balanceDate` and
 * the ordinary payments since. An estimate — say so wherever it is shown.
 */
export function estimatedBalance(debt: Debt, now: YearMonth): number {
  const [y, m] = debt.balanceDate.split('-').map(Number);
  if (!y || !m) return debt.balance;
  const elapsed = monthsBetween({ year: y, month: m - 1 }, now);
  let balance = debt.balance;
  for (let i = 0; i < elapsed && balance > PAID; i++) {
    balance += interestOn(balance, debt.ratePct);
    balance -= Math.min(paymentAt(debt, i), balance);
  }
  return Math.max(0, balance);
}

/** The order the extra money goes in. Ties fall back to the other rule, then
 *  to the name, so the same debts always come out in the same order. */
export function priorityOrder(debts: Debt[], strategy: Strategy): Debt[] {
  return [...debts].sort((a, b) => {
    const byRate = b.ratePct - a.ratePct;
    const byBalance = a.balance - b.balance;
    const first = strategy === 'avalanche' ? byRate : byBalance;
    const second = strategy === 'avalanche' ? byBalance : byRate;
    return first || second || a.name.localeCompare(b.name);
  });
}

export interface Payoff {
  id: string;
  /** Months from the start until it is paid; 1 = paid in the first month. */
  months: number;
  at: YearMonth;
}

export interface PayoffPlan {
  strategy: Strategy | 'minimum';
  /** Debts in the order the extra money goes to them. */
  order: string[];
  /** Each debt that is paid within the horizon, in the order they finish. */
  payoffs: Payoff[];
  /** Months until the last one is paid, or null: not within fifty years. */
  months: number | null;
  debtFree: YearMonth | null;
  /** Interest paid on the way, in whole currency units. Up to the horizon
   *  when the plan never finishes. */
  totalInterest: number;
  /** Debts whose own payment does not even cover their interest: on their
   *  own they grow, and are never paid. */
  growing: string[];
}

/**
 * Pay `debts` month by month from `start`: interest first, then each debt's
 * own payment, then the extra amount — plus every payment a paid-off debt has
 * freed — to the first unpaid debt in the strategy's order.
 *
 * 'minimum' pays only each debt's own payment and frees nothing: the "if
 * nothing changes" line the two strategies are measured against.
 *
 * Balances are taken as they are; pass estimatedBalance()s for a plan that
 * starts today.
 */
export function payoffPlan(
  debts: Debt[], extraPerMonth: number, strategy: Strategy | 'minimum', start: YearMonth,
): PayoffPlan {
  const plan = debts.filter(inPlan);
  const ordered = strategy === 'minimum' ? plan : priorityOrder(plan, strategy);
  const balance = new Map(ordered.map(d => [d.id, d.balance]));
  const payoffs: Payoff[] = [];
  const extra = strategy === 'minimum' ? 0 : Math.max(0, extraPerMonth);
  let interest = 0;
  let m = 0;

  while (payoffs.length < ordered.length && m < HORIZON_MONTHS) {
    // What is free to go to the first unpaid debt this month: the extra, and
    // every payment that no longer has a debt to go to.
    let pool = extra;
    for (const d of ordered) {
      const owed = balance.get(d.id)!;
      if (owed <= PAID) {
        if (strategy !== 'minimum') pool += paymentAt(d, m);
        continue;
      }
      const charged = interestOn(owed, d.ratePct);
      interest += charged;
      const due = paymentAt(d, m);
      const paid = Math.min(due, owed + charged);
      balance.set(d.id, owed + charged - paid);
      // The last payment is often smaller than the usual one: the rest is free.
      if (strategy !== 'minimum') pool += due - paid;
    }
    for (const d of ordered) {
      if (pool <= PAID) break;
      const owed = balance.get(d.id)!;
      if (owed <= PAID) continue;
      const paid = Math.min(pool, owed);
      balance.set(d.id, owed - paid);
      pool -= paid;
    }
    m += 1;
    for (const d of ordered) {
      if (balance.get(d.id)! <= PAID && !payoffs.some(p => p.id === d.id)) {
        payoffs.push({ id: d.id, months: m, at: addMonths(start, m - 1) });
      }
    }
  }

  const done = payoffs.length === ordered.length;
  const months = done ? (payoffs.length ? Math.max(...payoffs.map(p => p.months)) : 0) : null;
  return {
    strategy,
    order: ordered.map(d => d.id),
    payoffs,
    months,
    debtFree: months === null ? null : months === 0 ? start : addMonths(start, months - 1),
    totalInterest: Math.round(interest),
    growing: ordered
      .filter(d => paymentAt(d, 0) <= interestOn(d.balance, d.ratePct) + PAID)
      .map(d => d.id),
  };
}

/** What the three lines need, from debts as the user entered them. */
export function compareStrategies(
  debts: Debt[], extraPerMonth: number, now: YearMonth,
): Record<Strategy | 'minimum', PayoffPlan> {
  const today = debts.map(d => ({ ...d, balance: estimatedBalance(d, now) }));
  return {
    minimum: payoffPlan(today, 0, 'minimum', now),
    avalanche: payoffPlan(today, extraPerMonth, 'avalanche', now),
    snowball: payoffPlan(today, extraPerMonth, 'snowball', now),
  };
}

/** What the plan's debts cost a month, before any extra: the budget's share. */
export function monthlyTotal(debts: Debt[]): number {
  return debts.filter(d => d.balance > PAID).reduce((s, d) => s + d.monthlyPayment, 0);
}

/**
 * A first guess at what kind of debt a budget row is, from its name — for a
 * row the user added under "Lån & skulder" before saying anything else about
 * it. Only a starting point in a form the user confirms; "loan" when unsure.
 */
export function kindFromLabel(label: string): DebtKind {
  const s = label.toLowerCase();
  if (/\bcsn\b|studiel[aå]n|student|estudi/.test(s)) return 'csn';
  if (/bol[aå]n|mortgage|hipoteca|amorter/.test(s)) return 'mortgage';
  if (/kreditkort|\bkort\b|credit card|\bcard\b|tarjeta/.test(s)) return 'card';
  if (/avbetalning|delbetalning|instal+ment|plazos/.test(s)) return 'installment';
  return 'loan';
}
