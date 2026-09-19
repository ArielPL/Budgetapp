// ── triage — turning the leftover pile into a short list of decisions ───────
//
// After an import, what the sorter could not place lands in Övrigt. On the
// author's own statement that was 34 entries out of 123 places — a third of the
// month, waiting. The app already had every part needed to fix that: a place
// can be moved in one go, and the move is learned. What it did not do was ASK.
// The pile sat inside a collapsed row, and finding the entries worth moving was
// the user's job, one expansion at a time.
//
// This module answers two questions per place, so the tab can put them in front
// of the user instead: WHICH places are worth deciding first (the biggest, by
// money), and WHAT to propose for each.
//
// The order of the proposal sources is the point:
//
//   1. a rule the user taught the app — their own explicit correction;
//   2. where they filed the same place before — their own behaviour;
//   3. the built-in merchant list — a stranger's guess about their money.
//
// Nothing here writes, moves or creates. It proposes, and the user taps.

import type { ActualEntry } from './types';
import { groupEntriesByText, isBucketId, INCOME_ACTUAL_ID } from './actuals';
import { normalise, seedKind, isStandardCategoryId, type LearnedRules, type StandardCategoryId } from './categorise';

export type SuggestionSource = 'rule' | 'history' | 'seed';

export interface PlaceDecision {
  /** The place as the statement spells it, for the label. */
  text: string;
  count: number;
  total: number;
  /** An existing category to move this place into, when there is one to propose. */
  categoryId?: string;
  /** A standard category this place belongs in that the budget does not hold
   *  yet. Offered as something to create — never created behind the user's back,
   *  the same promise the import makes. */
  create?: StandardCategoryId;
  /** Where the proposal came from. Shown, because "because you did this in
   *  July" and "because a built-in list says so" deserve different trust. */
  source?: SuggestionSource;
}

/**
 * Where the user has filed each place before, across every month in hand.
 *
 * Buckets do not count: "you put it in Övrigt last time" is not an answer to
 * "where does this go", it is the question repeated back.
 */
export function placeHistory(entries: ActualEntry[]): Map<string, string> {
  const byPlace = new Map<string, string>();
  for (const e of entries) {
    if (isBucketId(e.categoryId)) continue;
    const key = e.text.trim().toLowerCase();
    if (key && !byPlace.has(key)) byPlace.set(key, e.categoryId);
  }
  return byPlace;
}

/**
 * What to propose for one place.
 *
 * Returns nothing rather than guessing. A wrong proposal one tap away is worse
 * than no proposal at all: the tap is the whole point, and a user who learns
 * the suggestions are unreliable has to read every one of them anyway — which
 * is the work this was meant to remove.
 */
export function proposeFor(
  text: string,
  existingIds: ReadonlySet<string>,
  rules: LearnedRules,
  history: ReadonlyMap<string, string>,
): Pick<PlaceDecision, 'categoryId' | 'create' | 'source'> {
  const taught = rules[normalise(text)];
  if (taught && existingIds.has(taught)) return { categoryId: taught, source: 'rule' };

  const before = history.get(text.trim().toLowerCase());
  if (before && existingIds.has(before)) return { categoryId: before, source: 'history' };

  // A rule that names a standard category the budget lost still means something:
  // offer to create it again rather than silently filing the place elsewhere.
  if (taught && isStandardCategoryId(taught)) return { create: taught, source: 'rule' };

  const kind = seedKind(text);
  if (!kind) return {};
  return existingIds.has(kind)
    ? { categoryId: kind, source: 'seed' }
    : { create: kind, source: 'seed' };
}

/**
 * The pile, as a list of decisions worth making — biggest first.
 *
 * Biggest by MONEY, not by count: eight coffees and one insurance bill are not
 * equally worth a tap, and the question the follow-up tab exists to answer is
 * where the money went.
 */
export function triageUnsorted(
  unsorted: ActualEntry[],
  filedElsewhere: ActualEntry[],
  existingIds: ReadonlySet<string>,
  rules: LearnedRules,
): PlaceDecision[] {
  const history = placeHistory(filedElsewhere);
  return groupEntriesByText(unsorted).map(g => ({
    text: g.text,
    count: g.count,
    total: g.total,
    ...proposeFor(g.text, existingIds, rules, history),
  }));
}

/** Category ids a proposal may point at: the month's own, plus Income, which is
 *  where a misread salary or refund belongs and is not an expense category. */
export function movableIds(categoryIds: string[]): Set<string> {
  return new Set([...categoryIds, INCOME_ACTUAL_ID]);
}
