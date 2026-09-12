import { describe, it, expect } from 'vitest';
import {
  fingerprint, newEntries, sumByCategory, entriesFor,
  monthOfEntry, groupByMonth, actualsKey, INCOME_ACTUAL_ID,
  isActualEntry, loadActuals, saveActuals,
} from './actuals';
import type { ActualEntry } from './types';

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
