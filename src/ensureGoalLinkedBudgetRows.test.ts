import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureGoalLinkedBudgetRows, defaultMonthData, starterMonthData,
  isHistoricMonth, cleanupHistoricGoalRows,
  runHistoricGoalRowMigration, HISTORIC_GOAL_ROWS_MIGRATION,
} from './defaults';
import type { MonthData, SavingsGoal, BudgetCategory } from './types';

const goal = (id: string, budgetRowId?: string, name = id): SavingsGoal => ({
  id, name, targetAmount: 0, currentAmount: 0, deadline: '', color: '#000',
  budgetRowId, userNamed: true,
});
const sparandeOf = (m: MonthData): BudgetCategory | undefined =>
  m.expenses.find(c => c.id === 'sparande');

describe('ensureGoalLinkedBudgetRows', () => {
  it('creates a sparande category on a blank/reset month (the bug)', () => {
    const goals = [goal('g1', 'row-1', 'Bil')];
    const out = ensureGoalLinkedBudgetRows(defaultMonthData('sv'), goals, 'sv');
    const sp = sparandeOf(out);
    expect(sp).toBeDefined();
    expect(sp!.rows).toHaveLength(1);
    expect(sp!.rows[0]).toMatchObject({ id: 'row-1', amount: 0, isCustom: true, label: 'Bil' });
  });

  it('appends only the missing linked row to an existing sparande category', () => {
    const month: MonthData = {
      income: [], savings: [],
      expenses: [{
        id: 'sparande', name: 'Sparande', icon: '💰', color: '#14b8a6',
        rows: [{ id: 'row-1', label: 'Bil', amount: 500 }],
      }],
    };
    const goals = [goal('g1', 'row-1'), goal('g2', 'row-2')];
    const out = ensureGoalLinkedBudgetRows(month, goals, 'sv');
    const rows = sparandeOf(out)!.rows;
    expect(rows.map(r => r.id)).toEqual(['row-1', 'row-2']);
    expect(rows.find(r => r.id === 'row-1')!.amount).toBe(500); // existing untouched
    expect(rows.find(r => r.id === 'row-2')!.amount).toBe(0);   // new one at 0
  });

  it('is idempotent — running twice adds no duplicate row', () => {
    const goals = [goal('g1', 'row-1')];
    const once = ensureGoalLinkedBudgetRows(defaultMonthData('sv'), goals, 'sv');
    const twice = ensureGoalLinkedBudgetRows(once, goals, 'sv');
    expect(sparandeOf(twice)!.rows).toHaveLength(1);
    expect(twice).toBe(once); // nothing missing → same reference returned
  });

  it('ignores goals without a budgetRowId', () => {
    const out = ensureGoalLinkedBudgetRows(defaultMonthData('sv'), [goal('g1')], 'sv');
    expect(sparandeOf(out)).toBeUndefined();
    expect(out.expenses).toHaveLength(0);
  });

  it('returns the month unchanged when there are no goals', () => {
    const m = defaultMonthData('sv');
    expect(ensureGoalLinkedBudgetRows(m, [], 'sv')).toBe(m);
  });

  it('preserves the link when applied over the starter template', () => {
    // Starter has its own sparande category; the goal row must still be added.
    const goals = [goal('g1', 'row-x', 'Resa')];
    const out = ensureGoalLinkedBudgetRows(starterMonthData('sv'), goals, 'sv');
    const rows = sparandeOf(out)!.rows;
    expect(rows.some(r => r.id === 'row-x' && r.amount === 0)).toBe(true);
  });
});

// Bug report 2026-07-19: entering an amount in a goal row, then browsing to an
// earlier month, planted that row in the earlier month too — and it looked like
// it had always been there. Finished months are history and stay untouched.
describe('isHistoricMonth (which months may receive goal rows)', () => {
  const now = new Date('2026-07-19T12:00:00Z'); // July 2026 = month index 6

  it('treats earlier months in the same year as history', () => {
    expect(isHistoricMonth(2026, 5, now)).toBe(true); // June
    expect(isHistoricMonth(2026, 0, now)).toBe(true); // January
  });

  it('treats the current month as still open', () => {
    expect(isHistoricMonth(2026, 6, now)).toBe(false);
  });

  it('treats future months as open — budgeting ahead is the point', () => {
    expect(isHistoricMonth(2026, 7, now)).toBe(false);  // August
    expect(isHistoricMonth(2027, 0, now)).toBe(false);
  });

  it('compares across year boundaries, not just month numbers', () => {
    expect(isHistoricMonth(2025, 11, now)).toBe(true);  // Dec 2025 is past
    expect(isHistoricMonth(2025, 8, now)).toBe(true);
    expect(isHistoricMonth(2026, 11, now)).toBe(false); // Dec 2026 is future
  });
});

// Blocking new writes was not enough: the rows the old backfill had ALREADY
// saved were still on disk, so to the user nothing had been fixed. These start
// from data that is already polluted — the state a real install is in.
describe('cleanupHistoricGoalRows (repairing months already written to)', () => {
  const now = new Date('2026-07-25T12:00:00Z'); // July 2026 = index 6
  const goals: SavingsGoal[] = [
    goal('g1', 'row-tillnagon', 'Till någon'),
    goal('g2', 'row-buffert', 'Buffert (Nordnet)'),
  ];
  const polluted = (extraRows: Array<{ id: string; label: string; amount: number }> = []) => ({
    income: [{ id: 'i1', label: 'Lön', amount: 30000 }],
    savings: [],
    expenses: [{
      id: 'sparande', name: 'Sparande', icon: '💰', color: '#14b8a6',
      rows: [
        { id: 's-spar', label: 'Sparande', amount: 1000 },
        { id: 's-fond', label: 'Fonder', amount: 2000 },
        ...extraRows,
      ],
    }],
  });
  // Minimal localStorage stand-in so the repair is testable in plain Node.
  class FakeStorage {
    private map = new Map<string, string>();
    get length() { return this.map.size; }
    key(i: number) { return [...this.map.keys()][i] ?? null; }
    getItem(k: string) { return this.map.get(k) ?? null; }
    setItem(k: string, v: string) { this.map.set(k, v); }
    removeItem(k: string) { this.map.delete(k); }
  }
  let store: FakeStorage;
  beforeEach(() => { store = new FakeStorage(); });

  const put = (key: string, value: unknown) =>
    store.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  const clean = (gs = goals) => cleanupHistoricGoalRows(gs, now, store);
  const rowsOf = (key: string) => {
    const m = JSON.parse(store.getItem(key)!) as MonthData;
    return m.expenses.find(c => c.id === 'sparande')?.rows.map(r => r.id) ?? [];
  };

  it('removes the 0 kr goal rows the old version planted in a finished month', () => {
    put('budget_2026_5', JSON.stringify(polluted([  // June
      { id: 'row-tillnagon', label: 'Till någon', amount: 0 },
      { id: 'row-buffert', label: 'Buffert (Nordnet)', amount: 0 },
    ])));
    expect(clean()).toBe(2);
    expect(rowsOf('budget_2026_5')).toEqual(['s-spar', 's-fond']);
  });

  it('KEEPS a goal row that has real money in it — that is budget history', () => {
    put('budget_2026_5', JSON.stringify(polluted([
      { id: 'row-buffert', label: 'Buffert (Nordnet)', amount: 1000 },
    ])));
    expect(clean()).toBe(0);
    expect(rowsOf('budget_2026_5')).toContain('row-buffert');
  });

  it('leaves the current and future months alone — the offer belongs there', () => {
    const rows = [{ id: 'row-tillnagon', label: 'Till någon', amount: 0 }];
    put('budget_2026_6', JSON.stringify(polluted(rows))); // July = now
    put('budget_2026_7', JSON.stringify(polluted(rows))); // August
    expect(clean()).toBe(0);
    expect(rowsOf('budget_2026_6')).toContain('row-tillnagon');
    expect(rowsOf('budget_2026_7')).toContain('row-tillnagon');
  });

  it('never touches a row the user created, even at 0 kr', () => {
    put('budget_2026_5', JSON.stringify(polluted([
      { id: 'user-made-row', label: 'Till någon', amount: 0 }, // same label, own id
    ])));
    expect(clean()).toBe(0);
    expect(rowsOf('budget_2026_5')).toContain('user-made-row');
  });

  it('drops a sparande category left with no rows at all', () => {
    put('budget_2026_5', JSON.stringify({
      income: [], savings: [],
      expenses: [{
        id: 'sparande', name: 'Sparande', icon: '💰', color: '#14b8a6',
        rows: [{ id: 'row-tillnagon', label: 'Till någon', amount: 0 }],
      }],
    }));
    clean();
    const m = JSON.parse(store.getItem('budget_2026_5')!) as MonthData;
    expect(m.expenses.find(c => c.id === 'sparande')).toBeUndefined();
  });

  it('is idempotent and does nothing on a second pass', () => {
    put('budget_2026_5', JSON.stringify(polluted([
      { id: 'row-tillnagon', label: 'Till någon', amount: 0 },
    ])));
    expect(clean()).toBe(1);
    expect(clean()).toBe(0);
  });

  it('cleans every affected month, not just one', () => {
    const rows = [{ id: 'row-buffert', label: 'Buffert (Nordnet)', amount: 0 }];
    put('budget_2026_3', JSON.stringify(polluted(rows)));
    put('budget_2026_4', JSON.stringify(polluted(rows)));
    put('budget_2025_11', JSON.stringify(polluted(rows)));
    expect(clean()).toBe(3);
  });

  it('ignores unrelated and malformed keys without throwing', () => {
    put('budget_lang', 'sv');
    put('budget_2026_99', JSON.stringify(polluted()));
    put('budget_2026_4', 'not json');
    expect(() => clean()).not.toThrow();
    expect(store.getItem('budget_lang')).toBe('sv');
  });

  it('does nothing when no goal is linked', () => {
    put('budget_2026_5', JSON.stringify(polluted([
      { id: 'row-tillnagon', label: 'Till någon', amount: 0 },
    ])));
    expect(clean([goal('g3')])).toBe(0);
    expect(rowsOf('budget_2026_5')).toContain('row-tillnagon');
  });

  // Main review 2026-07-26 §8: the repair was described as one-time but ran on
  // every start. Its rule also matches a zero a user deliberately records in a
  // past month later, so repeating it would quietly delete real entries.
  describe('runHistoricGoalRowMigration (marker-guarded)', () => {
    const migrate = (gs = goals) => runHistoricGoalRowMigration(gs, now, store);

    it('repairs on the first run and writes the marker', () => {
      put('budget_2026_5', JSON.stringify(polluted([
        { id: 'row-tillnagon', label: 'Till någon', amount: 0 },
      ])));
      expect(migrate()).toBe(1);
      expect(store.getItem(HISTORIC_GOAL_ROWS_MIGRATION)).toBeTruthy();
    });

    it('does not run a second time', () => {
      put('budget_2026_5', JSON.stringify(polluted([
        { id: 'row-tillnagon', label: 'Till någon', amount: 0 },
      ])));
      migrate();
      // A row the user deliberately zeroes AFTER the migration must survive,
      // even though it matches the old rule exactly.
      put('budget_2026_5', JSON.stringify(polluted([
        { id: 'row-tillnagon', label: 'Till någon', amount: 0 },
      ])));
      expect(migrate()).toBe(0);
      expect(rowsOf('budget_2026_5')).toContain('row-tillnagon');
    });

    it('writes the marker even when there was nothing to repair', () => {
      expect(migrate()).toBe(0);
      expect(store.getItem(HISTORIC_GOAL_ROWS_MIGRATION)).toBeTruthy();
    });

    it('leaves months alone once the marker is present', () => {
      store.setItem(HISTORIC_GOAL_ROWS_MIGRATION, '2026-07-26T00:00:00.000Z');
      put('budget_2026_5', JSON.stringify(polluted([
        { id: 'row-buffert', label: 'Buffert (Nordnet)', amount: 0 },
      ])));
      expect(migrate()).toBe(0);
      expect(rowsOf('budget_2026_5')).toContain('row-buffert');
    });
  });
});
