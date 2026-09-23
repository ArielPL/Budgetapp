import { describe, it, expect } from 'vitest';
import { planPersist, actualsKey, loadActuals, newEntries, groupByMonth } from './actuals';
import { applyStorageChanges } from './storageWrite';
import { repairFiling } from './filingRepair';
import { readUndo, undoLast } from './undo';
import { PERIOD_START_KEY } from './periodLabel';
import type { ActualEntry } from './types';
import type { StorageLike } from './storage';

// ── An edit in Follow-up must never delete entries it was not asked to ─────
//
// Found 2026-09-22 from a production report: imported transactions vanished.
//
// Until 2026-09-16 entries were filed by CALENDAR month. That day the rule
// became the pay period, and nothing moved the entries already stored. The
// Follow-up tab writes back per budget month but used to write only the months
// on screen — so an entry whose date now belonged to the next month was
// regrouped there and written nowhere, while the month it came from was
// rewritten without it.
//
// Reproduced before the fix with the real functions and invented data: three
// entries stored in August, pay period from the 25th, delete ONE of them —
// zero left anywhere in storage.

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const entry = (id: string, date: string, amount = 100): ActualEntry =>
  ({ id, date, text: `SYNTETISK ${id}`, amount, direction: 'out', categoryId: 'mat' });

/** Every entry id in storage, with the month file it sits in. */
const whereIs = (s: FakeStorage): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of s.map) {
    if (!k.startsWith('budget_actuals_')) continue;
    for (const e of JSON.parse(v) as ActualEntry[]) out[e.id] = k.replace('budget_actuals_', '');
  }
  return out;
};

const AUGUST = { year: 2026, month: 7 };

/** A pay period from the 25th, as set in the app. */
const withPayDay = (s: FakeStorage) => { s.setItem(PERIOD_START_KEY, '25'); return s; };

/** August's file as a pre-2026-09-16 import left it: filed by calendar. */
const calendarFiledAugust = () => {
  const s = new FakeStorage();
  s.setItem(actualsKey(2026, 7), JSON.stringify([
    entry('a1', '2026-08-10'),
    entry('a2', '2026-08-26'),   // the pay-period rule says September
    entry('a3', '2026-08-28'),   // likewise
  ]));
  return s;
};

/** What Follow-up's persist does with a plan. */
const persist = (s: FakeStorage, next: ActualEntry[], inView = [AUGUST], startDay: number | null = 25) => {
  const plan = planPersist(s, next, inView, startDay, {});
  expect(plan.undated).toEqual([]);
  expect(applyStorageChanges(s, plan.changes)).toBe(true);
  return plan;
};

describe('planPersist never drops an entry', () => {
  it('deleting one entry deletes that entry and nothing else', () => {
    // The reproduction. Before the fix: {} — all three gone.
    const s = calendarFiledAugust();
    persist(s, loadActuals(s, 2026, 7).filter(e => e.id !== 'a1'));
    expect(whereIs(s)).toEqual({ a2: '2026_8', a3: '2026_8' });
  });

  it('moves an entry home to the month its date belongs to', () => {
    const s = calendarFiledAugust();
    const plan = persist(s, loadActuals(s, 2026, 7));
    expect(whereIs(s)).toEqual({ a1: '2026_7', a2: '2026_8', a3: '2026_8' });
    expect(plan.movedTo).toEqual([{ year: 2026, month: 8, count: 2 }]);
  });

  it('keeps only what belongs in the view, so the table matches storage', () => {
    const s = calendarFiledAugust();
    const plan = persist(s, loadActuals(s, 2026, 7));
    expect(plan.kept.map(e => e.id)).toEqual(['a1']);
  });

  it('merges into the other month rather than writing over it', () => {
    // September already holds an entry of its own. Writing the arrivals over
    // the file would trade one loss for another.
    const s = calendarFiledAugust();
    s.setItem(actualsKey(2026, 8), JSON.stringify([entry('s1', '2026-09-05')]));
    persist(s, loadActuals(s, 2026, 7));
    expect(whereIs(s)).toEqual({ a1: '2026_7', a2: '2026_8', a3: '2026_8', s1: '2026_8' });
  });

  it('keeps an entry once even if it somehow sat in both files', () => {
    const s = calendarFiledAugust();
    s.setItem(actualsKey(2026, 8), JSON.stringify([entry('a2', '2026-08-26')]));
    persist(s, loadActuals(s, 2026, 7));
    const september = loadActuals(s, 2026, 8).map(e => e.id).sort();
    expect(september).toEqual(['a2', 'a3']);
  });

  it('changes nothing about the ordinary case, where every entry is home', () => {
    const s = new FakeStorage();
    s.setItem(actualsKey(2026, 7), JSON.stringify([entry('a1', '2026-08-10'), entry('a2', '2026-08-12')]));
    const plan = persist(s, loadActuals(s, 2026, 7).filter(e => e.id !== 'a1'), [AUGUST], null);
    expect(whereIs(s)).toEqual({ a2: '2026_7' });
    expect(plan.movedTo).toEqual([]);
    expect(plan.changes.map(c => c.key)).toEqual([actualsKey(2026, 7)]);
  });

  it('still removes the file when the view is emptied', () => {
    const s = new FakeStorage();
    s.setItem(actualsKey(2026, 7), JSON.stringify([entry('a1', '2026-08-10')]));
    persist(s, [], [AUGUST], null);
    expect(s.getItem(actualsKey(2026, 7))).toBeNull();
  });
});

describe('repairFiling puts stored entries where the rule says', () => {

  it('moves misfiled entries and says how many', () => {
    const s = withPayDay(calendarFiledAugust());
    const step = repairFiling(s, new Date('2026-09-22T08:00:00Z'));
    expect(step?.action).toBe('refileRepair');
    expect(step?.count).toBe(2);
    expect(whereIs(s)).toEqual({ a1: '2026_7', a2: '2026_8', a3: '2026_8' });
  });

  it('loses nothing — every entry is still there, exactly once', () => {
    const s = withPayDay(calendarFiledAugust());
    s.setItem(actualsKey(2026, 8), JSON.stringify([entry('s1', '2026-09-05')]));
    repairFiling(s);
    expect(Object.keys(whereIs(s)).sort()).toEqual(['a1', 'a2', 'a3', 's1']);
  });

  it('does nothing, and records nothing, when the filing already agrees', () => {
    const s = withPayDay(new FakeStorage());
    s.setItem(actualsKey(2026, 7), JSON.stringify([entry('a1', '2026-08-10')]));
    const before = new Map(s.map);
    expect(repairFiling(s)).toBeNull();
    expect(s.map).toEqual(before);
    expect(readUndo(s)).toEqual([]);
  });

  it('is idempotent — a second start finds nothing to do', () => {
    const s = withPayDay(calendarFiledAugust());
    repairFiling(s);
    expect(repairFiling(s)).toBeNull();
  });

  it('can be taken back exactly', () => {
    const s = withPayDay(calendarFiledAugust());
    const original = s.getItem(actualsKey(2026, 7));
    repairFiling(s);
    expect(undoLast(s)?.action).toBe('refileRepair');
    expect(s.getItem(actualsKey(2026, 7))).toBe(original);
    expect(loadActuals(s, 2026, 8)).toEqual([]);
  });

  it('leaves calendar filing alone when no pay period is set', () => {
    const s = calendarFiledAugust();   // no PERIOD_START_KEY
    expect(repairFiling(s)).toBeNull();
    expect(whereIs(s)).toEqual({ a1: '2026_7', a2: '2026_7', a3: '2026_7' });
  });
});

// ── Getting lost entries back ──────────────────────────────────────────────
//
// What the changelog tells a user who lost entries: import the same statement
// again. That is only true if (a) the entries still present are recognised and
// skipped, and (b) the missing ones come back — and it is only SAFE if the
// startup repair has run first. Otherwise an entry still sitting in the old
// month is not found in its new one, and the import adds it a second time.


/** The same bank rows a fresh import would produce: new ids, same facts. */
const reimported = (ids: string[], dates: string[]) =>
  ids.map((id, i) => ({ ...entry(id, dates[i]), id: `new-${id}` }));

/** What CsvImport does per month: add only what is not already there. */
const importInto = (s: FakeStorage, incoming: ActualEntry[], startDay: number | null) => {
  const { months } = groupByMonth(incoming, startDay, {});
  for (const b of months.values()) {
    const existing = loadActuals(s, b.year, b.month);
    const fresh = newEntries(b.entries, existing);
    s.setItem(actualsKey(b.year, b.month), JSON.stringify([...existing, ...fresh]));
  }
};

const ids = (s: FakeStorage) => Object.keys(whereIs(s)).map(k => k.replace('new-', '')).sort();

describe('re-importing the same statement restores what was lost', () => {
  const dates = ['2026-08-10', '2026-08-26', '2026-08-28'];

  it('brings back the missing entries and nothing twice', () => {
    // a2 and a3 were lost; a1 survived in August.
    const s = withPayDay(new FakeStorage());
    s.setItem(actualsKey(2026, 7), JSON.stringify([entry('a1', '2026-08-10')]));
    repairFiling(s);
    importInto(s, reimported(['a1', 'a2', 'a3'], dates), 25);
    expect(ids(s)).toEqual(['a1', 'a2', 'a3']);
    expect(Object.keys(whereIs(s))).toHaveLength(3);
  });

  it('would duplicate entries if the repair had not run first', () => {
    // Why the repair runs before anything else: nothing was lost here, but
    // a2 and a3 still sit in August while the import files them in September.
    const s = calendarFiledAugust();
    importInto(s, reimported(['a1', 'a2', 'a3'], dates), 25);
    expect(Object.keys(whereIs(s))).toHaveLength(5);
  });

  it('adds nothing at all once the repair has put everything home', () => {
    const s = withPayDay(calendarFiledAugust());
    repairFiling(s);
    importInto(s, reimported(['a1', 'a2', 'a3'], dates), 25);
    expect(Object.keys(whereIs(s))).toHaveLength(3);
  });
});

