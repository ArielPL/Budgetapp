import { describe, it, expect } from 'vitest';
import {
  fingerprint, newEntries, sumByCategory, entriesFor,
  monthOfEntry, groupByMonth, actualsKey, INCOME_ACTUAL_ID,
  UNSORTED_ACTUAL_ID, TRANSFER_ACTUAL_ID, isBucketId,
  isActualEntry, loadActuals, saveActuals, planRefile, applyRefile, groupEntriesByText,
} from './actuals';
import type { ActualEntry } from './types';
import type { StorageLike } from './storage';

const e = (
  id: string, date: string, text: string, amount: number,
  categoryId = 'mat', manual = false,
): ActualEntry => ({ id, date, text, amount, categoryId, ...(manual ? { manual: true } : {}) });

describe('fingerprint — what makes two rows the same transaction', () => {
  it('is date, text and amount', () => {
    expect(fingerprint(e('a', '2026-09-02', 'ICA Maxi', 842)))
      .toBe(fingerprint(e('b', '2026-09-02', 'ICA Maxi', 842)));
  });

  it('ignores the category', () => {
    // The bank decides what a transaction IS. Which category you filed it under
    // is your opinion about it — re-filing must not create a second purchase.
    const a = e('a', '2026-09-02', 'ICA Maxi', 842, 'mat');
    const b = e('b', '2026-09-02', 'ICA Maxi', 842, 'personligt');
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('ignores casing and surrounding whitespace in the text', () => {
    // Banks are not consistent about either, across exports or over time.
    expect(fingerprint(e('a', '2026-09-02', '  ica maxi ', 842)))
      .toBe(fingerprint(e('b', '2026-09-02', 'ICA Maxi', 842)));
  });

  it('separates rows that differ by a single öre', () => {
    expect(fingerprint(e('a', '2026-09-02', 'ICA', 842)))
      .not.toBe(fingerprint(e('b', '2026-09-02', 'ICA', 842.5)));
  });
});

describe('newEntries — counts, never merely matches', () => {
  it('adds everything when nothing is stored', () => {
    const incoming = [e('1', '2026-09-02', 'ICA', 842), e('2', '2026-09-03', 'SL', 390)];
    expect(newEntries(incoming, [])).toHaveLength(2);
  });

  it('adds nothing when the very same file is imported twice', () => {
    // The case this rule exists for: you import September, then import it again.
    const file = [e('1', '2026-09-02', 'ICA', 842), e('2', '2026-09-03', 'SL', 390)];
    const stored = [e('x', '2026-09-02', 'ICA', 842), e('y', '2026-09-03', 'SL', 390)];
    expect(newEntries(file, stored)).toEqual([]);
  });

  it('keeps a genuine second identical purchase', () => {
    // Two coffees at the same place, same day, same price is an ordinary thing
    // to do. A rule that asked "does this already exist?" would throw the second
    // one away and never say so — losing something that really happened in order
    // to guard against a re-import. Counting guards without discarding.
    const file = [e('1', '2026-09-02', 'Espresso House', 45), e('2', '2026-09-02', 'Espresso House', 45)];
    expect(newEntries(file, [])).toHaveLength(2);
  });

  it('adds only the shortfall when storage already holds some of them', () => {
    // Storage has one coffee, the file has two: exactly one is new.
    const file = [e('1', '2026-09-02', 'Espresso House', 45), e('2', '2026-09-02', 'Espresso House', 45)];
    const stored = [e('x', '2026-09-02', 'Espresso House', 45)];
    const out = newEntries(file, stored);
    expect(out).toHaveLength(1);
    expect(fingerprint(out[0])).toBe(fingerprint(file[0]));
  });

  it('adds nothing when storage already holds MORE than the file does', () => {
    const file = [e('1', '2026-09-02', 'Espresso House', 45)];
    const stored = [e('x', '2026-09-02', 'Espresso House', 45), e('y', '2026-09-02', 'Espresso House', 45)];
    expect(newEntries(file, stored)).toEqual([]);
  });

  it('is not confused by a hand-typed entry that matches an imported one', () => {
    // You noted the lunch yourself, then imported the statement. It is one
    // lunch. Where the record came from does not change what happened.
    const stored = [e('x', '2026-09-21', 'Lunch med Anna', 150, 'mat', true)];
    const file = [e('1', '2026-09-21', 'Lunch med Anna', 150)];
    expect(newEntries(file, stored)).toEqual([]);
  });

  it('leaves the stored entries alone', () => {
    // It reports what to ADD. Removing or rewriting what is already there is
    // never this function's job.
    const stored = [e('x', '2026-09-02', 'ICA', 842)];
    const before = JSON.stringify(stored);
    newEntries([e('1', '2026-09-02', 'ICA', 842)], stored);
    expect(JSON.stringify(stored)).toBe(before);
  });
});

describe('sumByCategory', () => {
  it('adds up per category', () => {
    const sums = sumByCategory([
      e('1', '2026-09-02', 'ICA', 842, 'mat'),
      e('2', '2026-09-08', 'Coop', 1204, 'mat'),
      e('3', '2026-09-01', 'Hyra', 8801, 'boende'),
    ]);
    expect(sums).toEqual({ mat: 2046, boende: 8801 });
  });

  it('leaves a category with no entries ABSENT, not zero', () => {
    // Absence is not zero — the same rule the savings snapshot follows. "I have
    // not recorded transport yet" and "I spent nothing on transport" are
    // different facts, and the view has to be able to show them differently.
    const sums = sumByCategory([e('1', '2026-09-02', 'ICA', 842, 'mat')]);
    expect('transport' in sums).toBe(false);
    expect(sums.transport).toBeUndefined();
  });

  it('handles income alongside expenses', () => {
    const sums = sumByCategory([
      e('1', '2026-09-25', 'Lön', 32596, INCOME_ACTUAL_ID),
      e('2', '2026-09-02', 'ICA', 842, 'mat'),
    ]);
    expect(sums[INCOME_ACTUAL_ID]).toBe(32596);
    expect(sums.mat).toBe(842);
  });

  it('is empty for no entries at all', () => {
    expect(sumByCategory([])).toEqual({});
  });
});

describe('entriesFor', () => {
  it('returns one category, oldest first', () => {
    const all = [
      e('1', '2026-09-15', 'Willys', 1893, 'mat'),
      e('2', '2026-09-02', 'ICA', 842, 'mat'),
      e('3', '2026-09-01', 'Hyra', 8801, 'boende'),
    ];
    expect(entriesFor(all, 'mat').map(x => x.id)).toEqual(['2', '1']);
  });

  it('returns nothing for a category with no entries', () => {
    expect(entriesFor([e('1', '2026-09-02', 'ICA', 842, 'mat')], 'transport')).toEqual([]);
  });
});

describe('monthOfEntry — an entry belongs to its own date', () => {
  it('reads year and 0-based month', () => {
    expect(monthOfEntry('2026-09-24')).toEqual({ year: 2026, month: 8 });
    expect(monthOfEntry('2026-01-01')).toEqual({ year: 2026, month: 0 });
    expect(monthOfEntry('2026-12-31')).toEqual({ year: 2026, month: 11 });
  });

  it('refuses anything it cannot read rather than guessing', () => {
    for (const bad of ['24/09/2026', '2026-9-24', '', '2026-13-01', '2026-00-05', 'nonsense']) {
      expect(monthOfEntry(bad)).toBeNull();
    }
  });
});

describe('groupByMonth — a file may cover more than one month', () => {
  it('files each entry under its own month', () => {
    const { months } = groupByMonth([
      e('1', '2026-09-28', 'ICA', 842),
      e('2', '2026-10-02', 'ICA', 910),
      e('3', '2026-09-30', 'SL', 390),
    ]);
    expect([...months.keys()].sort()).toEqual(['2026_8', '2026_9']);
    expect(months.get('2026_8')!.entries).toHaveLength(2);
    expect(months.get('2026_9')!.entries).toHaveLength(1);
    expect(months.get('2026_9')!.month).toBe(9);
  });

  it('crosses a year boundary', () => {
    const { months } = groupByMonth([
      e('1', '2026-12-31', 'Nyårsmat', 600),
      e('2', '2027-01-01', 'Taxi', 320),
    ]);
    expect([...months.keys()].sort()).toEqual(['2026_11', '2027_0']);
  });

  it('hands back an unreadable date instead of dropping it', () => {
    // Silently losing a row is the one thing this module exists to prevent.
    const { months, undated } = groupByMonth([
      e('1', '2026-09-02', 'ICA', 842),
      e('2', 'inte ett datum', 'Mystisk post', 100),
    ]);
    expect(undated.map(x => x.id)).toEqual(['2']);
    expect(months.get('2026_8')!.entries).toHaveLength(1);
  });
});

describe('actualsKey', () => {
  it('pairs visibly with the month key it belongs beside', () => {
    expect(actualsKey(2026, 8)).toBe('budget_actuals_2026_8');
  });

  it('stays inside the prefix the backup owns, so exports include it', () => {
    expect(actualsKey(2026, 0).startsWith('budget_')).toBe(true);
  });
});

// ── Reading and writing ────────────────────────────────────────────────────

class FakeStorage {
  private map = new Map<string, string>();
  failOnKey: string | null = null;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k === this.failOnKey) throw new DOMException('QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  has(k: string) { return this.map.has(k); }
}

describe('isActualEntry — storage may hold anything', () => {
  it('accepts a well-formed entry, with or without the manual flag', () => {
    expect(isActualEntry(e('1', '2026-09-02', 'ICA', 842))).toBe(true);
    expect(isActualEntry(e('1', '2026-09-02', 'Lunch', 150, 'mat', true))).toBe(true);
  });

  it('rejects a non-finite amount', () => {
    // The 1e309 lesson: an Infinity here would poison every total it joins, and
    // the user could not see why their food budget had become meaningless.
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 0), amount: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 0), amount: Number.NaN })).toBe(false);
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 0), amount: null })).toBe(false);
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 0), amount: '842' })).toBe(false);
  });

  it('rejects a date it could never file into a month', () => {
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 842), date: '24/09/2026' })).toBe(false);
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 842), date: '' })).toBe(false);
  });

  it('rejects missing identity or category', () => {
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 842), id: '' })).toBe(false);
    expect(isActualEntry({ ...e('1', '2026-09-02', 'ICA', 842), categoryId: '' })).toBe(false);
  });

  it('rejects things that are not entries at all', () => {
    for (const bad of [null, undefined, 42, 'entry', [], [e('1', '2026-09-02', 'ICA', 842)]]) {
      expect(isActualEntry(bad)).toBe(false);
    }
  });
});

describe('loadActuals', () => {
  it('returns nothing for a month never recorded', () => {
    expect(loadActuals(new FakeStorage(), 2026, 8)).toEqual([]);
  });

  it('reads back what was written', () => {
    const s = new FakeStorage();
    saveActuals(s, 2026, 8, [e('1', '2026-09-02', 'ICA', 842)]);
    expect(loadActuals(s, 2026, 8).map(x => x.id)).toEqual(['1']);
  });

  it('skips a bad row instead of losing the whole month', () => {
    // One unreadable entry must not cost the eleven good ones beside it.
    const s = new FakeStorage();
    s.setItem(actualsKey(2026, 8), JSON.stringify([
      e('1', '2026-09-02', 'ICA', 842),
      { id: '2', date: 'trasigt', text: 'x', amount: 5, categoryId: 'mat' },
      e('3', '2026-09-08', 'Coop', 1204),
    ]));
    expect(loadActuals(s, 2026, 8).map(x => x.id)).toEqual(['1', '3']);
  });

  it('survives junk rather than throwing', () => {
    const s = new FakeStorage();
    for (const junk of ['not json', '{}', 'null', '"a string"', '5']) {
      s.setItem(actualsKey(2026, 8), junk);
      expect(loadActuals(s, 2026, 8)).toEqual([]);
    }
  });
});

describe('saveActuals', () => {
  it('reports success, and failure when storage refuses', () => {
    const s = new FakeStorage();
    expect(saveActuals(s, 2026, 8, [e('1', '2026-09-02', 'ICA', 842)])).toBe(true);
    s.failOnKey = actualsKey(2026, 8);
    expect(saveActuals(s, 2026, 8, [e('2', '2026-09-03', 'SL', 390)])).toBe(false);
  });

  it('leaves no key behind when the last entry is deleted', () => {
    // An empty month should look untouched, not like a month recorded as empty.
    const s = new FakeStorage();
    saveActuals(s, 2026, 8, [e('1', '2026-09-02', 'ICA', 842)]);
    expect(s.has(actualsKey(2026, 8))).toBe(true);
    expect(saveActuals(s, 2026, 8, [])).toBe(true);
    expect(s.has(actualsKey(2026, 8))).toBe(false);
  });

  it('does not damage what was stored when a write fails', () => {
    const s = new FakeStorage();
    saveActuals(s, 2026, 8, [e('1', '2026-09-02', 'ICA', 842)]);
    s.failOnKey = actualsKey(2026, 8);
    expect(saveActuals(s, 2026, 8, [e('2', '2026-09-03', 'SL', 390)])).toBe(false);
    expect(loadActuals(s, 2026, 8).map(x => x.id)).toEqual(['1']);
  });
});

// ── Re-filing when the pay period changes ──────────────────────────────────

describe('planRefile / applyRefile', () => {
  const entry = (date: string, text: string, amount: number): ActualEntry =>
    ({ id: `${date}-${text}`, date, text, amount, categoryId: 'mat' });

  /** August and September as a calendar-filed store would hold them. */
  const seeded = (): StorageLike => {
    const s = new FakeStorage();
    saveActuals(s, 2026, 7, [            // August
      entry('2026-08-10', 'ICA', 100),
      entry('2026-08-24', 'Lön', 32596),  // last day of Ariel's August period
      entry('2026-08-25', 'Hyra', 5877),  // turnover day — belongs to September
      entry('2026-08-31', 'TEMPO', 24),
    ]);
    saveActuals(s, 2026, 8, [            // September
      entry('2026-09-02', 'TEMPO', 23),
    ]);
    return s;
  };

  it('counts what would move before anything moves', () => {
    const s = seeded();
    const plan = planRefile(s, 25);
    expect(plan.total).toBe(5);
    // The two August entries on or after the 25th.
    expect(plan.moving).toBe(2);
    // Nothing written yet.
    expect(loadActuals(s, 2026, 7)).toHaveLength(4);
  });

  it('moves the turnover day into the next budget month', () => {
    const s = seeded();
    applyRefile(s, planRefile(s, 25));
    const aug = loadActuals(s, 2026, 7).map(e => e.text);
    const sep = loadActuals(s, 2026, 8).map(e => e.text);
    expect(aug).toEqual(['ICA', 'Lön']);
    expect(sep).toEqual(expect.arrayContaining(['Hyra', 'TEMPO', 'TEMPO']));
    expect(sep).toHaveLength(3);
  });

  it('never loses or duplicates an entry', () => {
    const s = seeded();
    const before = planRefile(s, null).total;
    applyRefile(s, planRefile(s, 25));
    expect(planRefile(s, 25).total).toBe(before);
  });

  it('is idempotent — running it again changes nothing', () => {
    const s = seeded();
    applyRefile(s, planRefile(s, 25));
    const second = planRefile(s, 25);
    expect(second.moving).toBe(0);
  });

  it('goes back when the period is switched off', () => {
    const s = seeded();
    applyRefile(s, planRefile(s, 25));
    applyRefile(s, planRefile(s, null));
    expect(loadActuals(s, 2026, 7).map(e => e.text))
      .toEqual(expect.arrayContaining(['ICA', 'Lön', 'Hyra', 'TEMPO']));
    expect(loadActuals(s, 2026, 7)).toHaveLength(4);
    expect(loadActuals(s, 2026, 8)).toHaveLength(1);
  });

  it('empties a file rather than removing it, so a half-done run is repairable', () => {
    const s = new FakeStorage();
    // One month whose every entry moves away.
    saveActuals(s, 2026, 7, [entry('2026-08-25', 'Hyra', 5877)]);
    const plan = planRefile(s, 25);
    expect(plan.emptied).toEqual(['budget_actuals_2026_7']);
    applyRefile(s, plan);
    expect(s.getItem('budget_actuals_2026_7')).toBe('[]');
    expect(loadActuals(s, 2026, 8).map(e => e.text)).toEqual(['Hyra']);
  });

  it('reports a refused write instead of claiming success', () => {
    const s = seeded();
    const plan = planRefile(s, 25);
    const full: StorageLike = {
      ...s,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };
    expect(applyRefile(full, plan)).toBe(false);
  });

  it('has nothing to do on an empty store', () => {
    const plan = planRefile(new FakeStorage(), 25);
    expect(plan.total).toBe(0);
    expect(plan.moving).toBe(0);
    expect(applyRefile(new FakeStorage(), plan)).toBe(true);
  });
});

describe('groupEntriesByText — where the money actually went', () => {
  it('collapses the same place onto one line, biggest first', () => {
    const got = groupEntriesByText([
      e('1', '2026-09-02', 'Espresso House', 56),
      e('2', '2026-09-05', 'ICA SUPERMARKET', 294),
      e('3', '2026-09-09', 'Espresso House', 56),
      e('4', '2026-09-11', 'Espresso House', 56),
    ]);
    expect(got).toEqual([
      { text: 'ICA SUPERMARKET', count: 1, total: 294 },
      { text: 'Espresso House', count: 3, total: 168 },
    ]);
  });

  it('treats the same shop at two tills as one place', () => {
    const got = groupEntriesByText([
      e('1', '2026-09-02', 'Pressbyran', 49),
      e('2', '2026-09-03', 'PRESSBYRAN', 39),
      e('3', '2026-09-04', ' pressbyran ', 30),
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ text: 'Pressbyran', count: 3, total: 118 });
  });

  it('keeps the spelling the bank used, not the one it matched on', () => {
    expect(groupEntriesByText([e('1', '2026-09-02', 'ICA Maxi', 10)])[0].text).toBe('ICA Maxi');
  });

  it('breaks a tie by name so the order never wobbles between renders', () => {
    const got = groupEntriesByText([
      e('1', '2026-09-02', 'Zettle', 100),
      e('2', '2026-09-03', 'Apotek', 100),
    ]);
    expect(got.map(g => g.text)).toEqual(['Apotek', 'Zettle']);
  });

  it('has nothing to say about nothing', () => {
    expect(groupEntriesByText([])).toEqual([]);
  });
});

describe('the holding buckets', () => {
  it('knows a bucket from a category', () => {
    expect(isBucketId(INCOME_ACTUAL_ID)).toBe(true);
    expect(isBucketId(UNSORTED_ACTUAL_ID)).toBe(true);
    expect(isBucketId(TRANSFER_ACTUAL_ID)).toBe(true);
    expect(isBucketId('mat')).toBe(false);
    expect(isBucketId('x7f3k1a')).toBe(false);
  });

  it('keeps the three apart', () => {
    const ids = new Set([INCOME_ACTUAL_ID, UNSORTED_ACTUAL_ID, TRANSFER_ACTUAL_ID]);
    expect(ids.size).toBe(3);
  });

  it('sums a bucket like any other id, so a total can include or exclude it', () => {
    const sums = sumByCategory([
      e('1', '2026-09-02', 'ICA', 100),
      e('2', '2026-09-03', 'Okänt', 50, UNSORTED_ACTUAL_ID),
      e('3', '2026-09-04', 'Överföring', 5000, TRANSFER_ACTUAL_ID),
    ]);
    expect(sums.mat).toBe(100);
    expect(sums[UNSORTED_ACTUAL_ID]).toBe(50);
    expect(sums[TRANSFER_ACTUAL_ID]).toBe(5000);
  });
});
