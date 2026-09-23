// ── spending — "where did the money go?", answered honestly ────────────────
//
// The first question the app answers in words rather than as a table. Agreed
// in the Budget AI analysis (2026-09-21) as the smallest useful step towards
// asking the app questions at all — and useful on its own if that never comes.
//
// It adds no new source of numbers. Every amount here is the same
// actualContribution sum the Follow-up table already shows, over the same
// entries, so the card and the table beneath it cannot disagree.
//
// What it adds is HONESTY ABOUT THE GAP. Entries the sorter could not place sit
// in Övrigt, and "Food was your biggest category" is only true if the unsorted
// pile could not change it. Two rules keep that honest without inventing a
// threshold anyone would have to defend:
//
//   · A CLAIM is checked against the worst case. "X was the biggest" holds if
//     X still leads when ALL the unsorted money is given to the runner-up. That
//     is exact arithmetic, not a judgement about how good the sorter is.
//
//   · A QUANTITY is given as a range. How much went on restaurants is somewhere
//     between what is confirmed and that plus everything unsorted. The sorter's
//     proposals are NOT used to narrow it: using a guess to bound the error of
//     that same guess is circular. Proposals belong in the sorting step, where
//     they shrink the range by being accepted.

import type { ActualEntry } from './types';
import {
  actualContribution, INCOME_ACTUAL_ID, TRANSFER_ACTUAL_ID, UNSORTED_ACTUAL_ID,
} from './actuals';

/**
 * How far "the biggest category" can be trusted.
 *
 *   empty         — nothing was spent in this view; there is no answer to give.
 *   complete      — nothing is unsorted; the answer is exact.
 *   partial       — something is unsorted, but it could not change the answer.
 *   insufficient  — the unsorted money could change which category is biggest.
 */
export type BreakdownStatus = 'empty' | 'complete' | 'partial' | 'insufficient';

export interface CategorySpend {
  id: string;
  /** Net: a refund reduces the category it was filed under, as in the table. */
  amount: number;
  /** Entries filed under it. */
  count: number;
}

export interface SpendingBreakdown {
  /** Categories money actually went to, biggest first. */
  categories: CategorySpend[];
  /** Money that left the account and is still waiting in Övrigt. */
  unsorted: { amount: number; count: number };
  /** Every spending entry counted — categorised and unsorted, not income or
   *  transfers, which are not spending. */
  count: number;
  status: BreakdownStatus;
}

/**
 * Where the money in `entries` went.
 *
 * `entries` is exactly what the Follow-up tab has in view. Income and transfers
 * are left out: money coming in is not spending, and a transfer between your own
 * accounts is not money leaving you.
 */
export function spendingBreakdown(entries: ActualEntry[]): SpendingBreakdown {
  const byCategory = new Map<string, CategorySpend>();
  let unsortedAmount = 0;
  let unsortedCount = 0;
  let count = 0;

  for (const e of entries) {
    if (e.categoryId === INCOME_ACTUAL_ID || e.categoryId === TRANSFER_ACTUAL_ID) continue;
    const contribution = actualContribution(e);

    if (e.categoryId === UNSORTED_ACTUAL_ID) {
      // Only money that LEFT counts towards what the pile could add to a
      // category. Money that came in and was never sorted — a Swish from a
      // friend, say — is not spending, and netting it off would make the pile
      // look smaller than the spending in it, understating the uncertainty.
      if (contribution > 0) {
        unsortedAmount += contribution;
        unsortedCount += 1;
        count += 1;
      }
      continue;
    }

    count += 1;
    const c = byCategory.get(e.categoryId) ?? { id: e.categoryId, amount: 0, count: 0 };
    c.amount += contribution;
    c.count += 1;
    byCategory.set(e.categoryId, c);
  }

  // A category refunded down to nothing or below is not somewhere money went.
  const categories = [...byCategory.values()]
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    categories,
    unsorted: { amount: unsortedAmount, count: unsortedCount },
    count,
    status: statusOf(categories, unsortedAmount),
  };
}

function statusOf(categories: CategorySpend[], unsorted: number): BreakdownStatus {
  if (categories.length === 0 && unsorted === 0) return 'empty';
  if (unsorted === 0) return 'complete';
  // Everything is unsorted: there is no leader to defend.
  if (categories.length === 0) return 'insufficient';
  const leader = categories[0].amount;
  // The strongest possible challenger: the runner-up, or a category that has
  // nothing yet, handed the whole pile. Strictly greater — a possible tie is
  // not a leader.
  const challenger = (categories[1]?.amount ?? 0) + unsorted;
  return leader > challenger ? 'partial' : 'insufficient';
}

/**
 * What one category could really come to: from what is confirmed, up to that
 * plus everything unsorted. A point when nothing is unsorted.
 */
export function categoryRange(
  breakdown: SpendingBreakdown, id: string,
): { low: number; high: number } {
  const low = breakdown.categories.find(c => c.id === id)?.amount ?? 0;
  return { low, high: low + breakdown.unsorted.amount };
}
