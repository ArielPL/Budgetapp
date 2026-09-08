import { describe, it, expect } from 'vitest';
import { adoptExternalMonth } from './crossTab';
import type { MonthData } from './types';

// ── Review 2026-09-05, F1 ──────────────────────────────────────────────────
//
// Reproduced in two real browser tabs before this existed: A raised the salary,
// B (holding a copy loaded before that) changed the rent, and the stored month
// came back with B's rent and A's salary REVERTED — no warning of any kind.
//
// These test the rule that stops it: a tab must not keep a copy it knows is
// stale. The two-tab outcome itself is verified in a browser; what is locked in
// here is every decision the rule has to get right for that to hold.

const month = (salary: number, rent: number): MonthData => ({
  income: [{ id: 'i1', label: 'Lön', amount: salary }],
  expenses: [{
    id: 'boende', name: 'Boende', icon: '🏠', color: '#6366f1',
    rows: [{ id: 'r4', label: 'Hyra', amount: rent }],
  }],
  savings: [],
});

const KEY = 'budget_2026_8';
const ev = (key: string | null, newValue: string | null) => ({ key, newValue });

describe('adoptExternalMonth', () => {
  it('adopts the month another tab just wrote', () => {
    const theirs = month(31000, 10000);
    const mine = JSON.stringify(month(30000.5, 10000));

    const got = adoptExternalMonth(ev(KEY, JSON.stringify(theirs)), KEY, mine);

    // The salary raise arrives, so this tab's next edit is made on top of it.
    expect(got?.data.income[0].amount).toBe(31000);
  });

  it('hands back a baseline identical to what this tab would write', () => {
    // If these differ by so much as a key order, the save effect sees a change,
    // writes the adopted value straight back out, and the tabs ping-pong.
    const theirs = month(31000, 10000);
    const got = adoptExternalMonth(ev(KEY, JSON.stringify(theirs)), KEY, null);
    expect(got?.raw).toBe(JSON.stringify(got?.data));
  });

  it('ignores a write to a DIFFERENT month', () => {
    // The bug this prevents is worse than the one being fixed: September's
    // figures appearing in October because an event was not matched by key.
    const other = JSON.stringify(month(1, 2));
    expect(adoptExternalMonth(ev('budget_2026_9', other), KEY, null)).toBeNull();
  });

  it('ignores keys that are not month data at all', () => {
    for (const key of ['budget_lang', 'budget_plan', 'budget_custom_v3', null]) {
      expect(adoptExternalMonth(ev(key, JSON.stringify(month(1, 2))), KEY, null)).toBeNull();
    }
  });

  it('ignores its own value coming back', () => {
    const mine = JSON.stringify(month(30000.5, 10000));
    expect(adoptExternalMonth(ev(KEY, mine), KEY, mine)).toBeNull();
  });

  it('ignores a removal rather than blanking the screen', () => {
    // An import clears every owned key before writing. Wiping what the user is
    // looking at mid-import helps nobody; the reload afterwards tells the truth.
    expect(adoptExternalMonth(ev(KEY, null), KEY, null)).toBeNull();
  });

  it('ignores a corrupt or foreign write instead of trusting it', () => {
    expect(adoptExternalMonth(ev(KEY, 'not json'), KEY, null)).toBeNull();
    expect(adoptExternalMonth(ev(KEY, '{"income":"nope"}'), KEY, null)).toBeNull();
    expect(adoptExternalMonth(ev(KEY, 'null'), KEY, null)).toBeNull();
    // Same shape rule as an imported file: a row with a non-finite amount is
    // not a month, however it arrived.
    expect(adoptExternalMonth(ev(KEY, '{"income":[{"id":"i","amount":null}],"expenses":[],"savings":[]}'), KEY, null)).toBeNull();
  });

  it('keeps an explicitly recorded savings snapshot intact', () => {
    // savingsSnapshotRecorded: false and "absent" mean different things, and a
    // recorded 0 is a real balance. Adoption must not flatten either.
    const theirs: MonthData = { ...month(31000, 10000), savingsSnapshotRecorded: false };
    const got = adoptExternalMonth(ev(KEY, JSON.stringify(theirs)), KEY, null);
    expect(got?.data.savingsSnapshotRecorded).toBe(false);
  });
});
