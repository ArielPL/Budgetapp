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

// ── The biggest purchases and the small ones ───────────────────────────────
//
// "Boende was the biggest" tells nobody anything: the rent is always the
// biggest. What a person wants from this card is the part they CANNOT see in
// their head — the few big things they bought, and the small ones that add up
// without anyone noticing (Ariel, 2026-10-03).
//
// Both lists look past categories: a purchase is big or small by its amount.
// So they need no sorting to be right, with one exception said out loud on the
// card — fixed costs are left out BY CATEGORY, and an unsorted rent payment
// cannot be recognised as one. It is shown, marked unsorted, rather than
// guessed away.

/** Standard categories that hold fixed costs, not purchases: the rent and
 *  everything at home, subscriptions, loan payments, and money put aside. */
export const FIXED_COST_CATEGORIES: ReadonlySet<string> =
  new Set(['boende', 'prenumerationer', 'lan', 'sparande']);

export interface Purchase {
  id: string;
  text: string;
  /** The key its place is hidden by. */
  key: string;
  date: string;
  amount: number;
  /** Still in Övrigt: it may be a fixed cost the card could not recognise. */
  unsorted: boolean;
}

export interface SmallPlace {
  /** The place as the bank wrote it, from its first purchase in view. */
  text: string;
  /** The key a hidden place is remembered by (categorise's normalise). */
  key: string;
  count: number;
  total: number;
}

export interface PurchaseHighlights {
  /** Purchases at or above the limit, biggest first. */
  biggest: Purchase[];
  /** Purchases under the limit, by place, most money first. */
  small: { total: number; count: number; places: SmallPlace[] };
}

/**
 * The biggest purchases and the small ones in `entries`, leaving out income,
 * transfers, refunds, fixed costs and the places the user chose not to count.
 *
 * `placeKey` turns a bank text into the key hidden places are kept under —
 * passed in so this module stays free of the sorter's matching rules.
 */
export function purchaseHighlights(
  entries: ActualEntry[],
  smallLimit: number,
  hidden: ReadonlySet<string>,
  placeKey: (text: string) => string,
): PurchaseHighlights {
  const biggest: Purchase[] = [];
  const places = new Map<string, SmallPlace>();
  let smallTotal = 0;
  let smallCount = 0;

  for (const e of entries) {
    if (e.categoryId === INCOME_ACTUAL_ID || e.categoryId === TRANSFER_ACTUAL_ID) continue;
    if (FIXED_COST_CATEGORIES.has(e.categoryId)) continue;
    const amount = actualContribution(e);
    // A refund is not a purchase, and a purchase of nothing says nothing.
    if (amount <= 0) continue;
    const key = placeKey(e.text);
    if (hidden.has(key)) continue;

    if (amount >= smallLimit) {
      biggest.push({
        id: e.id, text: e.text, key, date: e.date, amount,
        unsorted: e.categoryId === UNSORTED_ACTUAL_ID,
      });
      continue;
    }
    smallTotal += amount;
    smallCount += 1;
    const place = places.get(key) ?? { text: e.text, key, count: 0, total: 0 };
    place.count += 1;
    place.total += amount;
    places.set(key, place);
  }

  biggest.sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date));
  return {
    biggest,
    small: {
      total: smallTotal,
      count: smallCount,
      // Most money first; between equals, the place visited more often.
      places: [...places.values()].sort((a, b) => b.total - a.total || b.count - a.count),
    },
  };
}

/** Where the small-purchase limit starts: 200 kronor, 3 000 yen, or 20 of
 *  the others — roughly the same coffee-and-a-bun in each. */
export function defaultSmallLimit(currency: string): number {
  if (currency === 'sek') return 200;
  if (currency === 'jpy') return 3000;
  return 20;
}

/** The limits offered, around the default. */
export function smallLimitChoices(currency: string): number[] {
  if (currency === 'sek') return [50, 100, 200, 300, 500];
  if (currency === 'jpy') return [500, 1000, 2000, 3000, 5000];
  return [5, 10, 20, 30, 50];
}
