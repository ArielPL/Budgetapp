import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { appStorage } from '../storage';
import { generateId, shownName, loadMonthData } from '../defaults';
import { categoryTotal, calculateBudgetMetrics } from '../metrics';
import { parseMoneyOrZero } from '../money';
import {
  actualsKey, loadActuals, sumByCategory, groupByMonth,
  actualContribution, groupEntriesByText, isBucketId,
  INCOME_ACTUAL_ID, UNSORTED_ACTUAL_ID, TRANSFER_ACTUAL_ID,
} from '../actuals';
import { applyStorageChanges } from '../storageWrite';
import { captureKeys, type UndoEntry } from '../undo';
import { triageUnsorted, movableIds } from '../triage';
import { FollowUpHelp } from './FollowUpHelp';
import { loadCategoryRules } from '../categorise';
import { standardExpenseCategory } from '../defaults';
import { spanMonths, SPANS, isSpan, type Span } from '../span';
import { rememberCategoryRule } from '../categorise';
import { periodRange, lockKey, type PeriodLocks } from '../periodLabel';
import { hasBudgetContent } from '../monthContent';
import { useLang, MONTHS } from '../i18n';
import { CsvImport, type TouchedMonth } from './CsvImport';
import type { ActualEntry, BudgetCategory } from '../types';
import { isValidIsoDate } from '../date';

// ── Follow-up — what the plan said, next to what happened ──────────────────
//
// The budget tab holds INTENTIONS. This one holds records. Every figure here is
// the sum of entries you can open, read and correct — there is no second,
// hand-written total that could disagree with it (see src/actuals.ts).
//
// Nothing is editable in place except an amount: this is the receipt, not the
// form. Filing something under the wrong category is fixed by moving the entry,
// never by nudging a total, so the two views can never drift apart.

interface Props {
  year: number;
  month: number;
  /** The month's expense categories — the plan half of every comparison. */
  categories: BudgetCategory[];
  /** Planned income, which has no category of its own to belong to. */
  totalIncome: number;
  /** A write that storage refused, so the app can say the edit is not stored. */
  onSaveFailed: () => void;
  /** Move the whole app to another month. An imported statement is usually last
   *  month's, so the months it writes to are routinely not this one. */
  onGoToMonth: (year: number, month: number) => void;
  /** Add standard categories the import offered to create, to the months that
   *  received the entries — not necessarily the month on screen. */
  onCreateCategories: (ids: string[], months: TouchedMonth[]) => void;
  /** The pay period's start day, or null for plain calendar months. Decides
   *  which budget month an imported entry belongs to. */
  periodStartDay: number | null;
  /** Periods the user has pinned by hand, for the months no rule can predict. */
  periodLocks: PeriodLocks;
  /** Pin (or, with null, unpin) the day this budget month's period opens. */
  onLockPeriod: (year: number, month: number, iso: string | null) => void;
  /** Create a category the user named, in the months given, and return its id. */
  onCreateNamedCategory: (name: string, months: { year: number; month: number }[]) => string;
  /** Remember a step back from the two actions here that destroy: clearing a
   *  month's record, and an import that lands in the wrong one. */
  onRecordUndo: (entry: UndoEntry) => void;
}

/** Sentinel in the move dropdown: not a category, an invitation to make one. */
const NEW_CATEGORY = '__new_category__';

interface RowSpec {
  id: string;
  label: string;
  icon: string;
  planned: number;
}

/** "YYYY-MM-DD" from a LOCAL date. toISOString can return the previous day. */
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NO_ENTRIES: ActualEntry[] = [];

export const FollowUpTab = ({
  year, month, categories, totalIncome, onSaveFailed, onGoToMonth, onCreateCategories,
  periodStartDay, periodLocks, onLockPeriod, onCreateNamedCategory, onRecordUndo,
}: Props) => {
  const { t, lang, money } = useLang();
  // How many budget months are in view, ending at the one on screen. 1 is the
  // single month this tab began as and stays the default: a span is for asking
  // "how much do I actually spend on food", which is a different question from
  // "how did September go" and should not quietly replace it.
  const [span, setSpan] = useState<Span>(1);
  const months = useMemo(() => spanMonths(year, month, span), [year, month, span]);
  const activeRange = useMemo(
    () => periodRange(year, month, periodStartDay ?? 1, periodLocks),
    [year, month, periodStartDay, periodLocks],
  );
  const [entries, setEntries] = useState<ActualEntry[]>(() => loadActuals(appStorage, year, month));
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; months: TouchedMonth[] } | null>(null);
  const [adjustingPeriod, setAdjustingPeriod] = useState(false);
  const [openPlace, setOpenPlace] = useState<string | null>(null);
  /** The place whose ⇄ is currently asking for a new category's name. */
  const [namingPlace, setNamingPlace] = useState<string | null>(null);
  /** The leftover pile, opened as a worklist. Closed by default: it is an
   *  offer to do some work, not an accusation waiting on every visit. */
  const [triageOpen, setTriageOpen] = useState(false);
  /** The guide. Opened from here rather than from a settings menu: help
   *  filed away from the thing it explains is help nobody reads. */
  const [helpOpen, setHelpOpen] = useState(false);
  /** Places set aside for now. Session-only on purpose — a skip means "not
   *  this time", not "never ask again", and nothing about it is worth
   *  writing to the user's storage. */
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [newCatName, setNewCatName] = useState('');
  // How an opened category lists what is in it. "place" answers "where does it
  // go"; "date" answers "what happened when". Both are real questions, so this
  // is a choice rather than a rule about how many months are in view.
  const [grouping, setGrouping] = useState<'place' | 'date'>('place');
  // Whether the plan is shown beside the record at all. Some sessions are not a
  // comparison — they are "where is the money going", and two extra columns of
  // budget only get in the way of the answer.
  const [showPlan, setShowPlan] = useState(true);
  /** Raw values last loaded for the months in view. A comparison before writing
   *  catches another tab even if its storage event has not reached us yet. */
  const storageBaseline = useRef(new Map<string, string | null>());

  const reloadEntries = useCallback(() => {
    const next: ActualEntry[] = [];
    const baseline = new Map<string, string | null>();
    for (const m of months) {
      const key = actualsKey(m.year, m.month);
      try { baseline.set(key, appStorage.getItem(key)); }
      catch { baseline.set(key, null); }
      next.push(...loadActuals(appStorage, m.year, m.month));
    }
    storageBaseline.current = baseline;
    setEntries(next);
  }, [months]);

  // Reload when the month changes. Writes happen explicitly on each edit below,
  // never from an effect watching state — which is what makes the month-switch
  // data bleed the rest of the app has to guard against impossible here: there
  // is no save effect that could fire with the previous month's entries still
  // in scope.
  useEffect(() => {
    reloadEntries();
    // The summary belongs to the month it was made in. Once you have moved —
    // not least by following its own "show August" button — it has been read.
    setToast(null);
  }, [reloadEntries]);

  // A storage event is sent to OTHER tabs. Reload immediately: every completed
  // edit is already stored, so there is no local in-memory transaction to lose.
  useEffect(() => {
    const keys = new Set(months.map(m => actualsKey(m.year, m.month)));
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !keys.has(event.key)) return;
      reloadEntries();
      setToast({ text: t.followUpExternalReloaded, months: [] });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [months, reloadEntries, t.followUpExternalReloaded]);

  const persist = useCallback((next: ActualEntry[]): boolean => {
    // The event above is asynchronous. Compare the raw values as well, so an
    // edit can never knowingly overwrite a newer version already in storage.
    let changedElsewhere: boolean;
    try {
      changedElsewhere = months.some(m => {
        const key = actualsKey(m.year, m.month);
        return appStorage.getItem(key) !== storageBaseline.current.get(key);
      });
    } catch {
      onSaveFailed();
      return false;
    }
    if (changedElsewhere) {
      reloadEntries();
      setToast({ text: t.followUpExternalReloaded, months: [] });
      return false;
    }

    // Written back per BUDGET MONTH, not to "the month on screen": over a span
    // the entries in hand come from several files and each has to go home to
    // its own. Every month in view is written, empty ones included, or a
    // deletion that emptied a month would appear to have been undone on the
    // next load.
    const { months: byMonth, undated } = groupByMonth(next, periodStartDay, periodLocks);
    if (undated.length > 0) {
      onSaveFailed();
      return false;
    }
    const changes = months.map(m => {
      const bucket = byMonth.get(`${m.year}_${m.month}`);
      return {
        key: actualsKey(m.year, m.month),
        value: bucket?.entries.length ? JSON.stringify(bucket.entries) : null,
      };
    });
    if (!applyStorageChanges(appStorage, changes)) {
      onSaveFailed();
      return false;
    }
    setEntries(next);
    storageBaseline.current = new Map(changes.map(change => [change.key, change.value]));
    return true;
  }, [months, periodStartDay, periodLocks, onSaveFailed, reloadEntries, t.followUpExternalReloaded]);

  const sums = useMemo(() => sumByCategory(entries), [entries]);

  /** What is still waiting, worth the most money first, each with a proposal.
   *  Rules are read here rather than held in state: a move made in this session
   *  teaches one, and the next decision should already know about it. */
  const decisions = useMemo(() => {
    const unsorted = entries.filter(e => e.categoryId === UNSORTED_ACTUAL_ID);
    if (unsorted.length === 0) return [];
    const filed = entries.filter(e => !isBucketId(e.categoryId));
    return triageUnsorted(
      unsorted, filed, movableIds(categories.map(c => c.id)), loadCategoryRules(appStorage),
    ).filter(d => !skipped.has(d.text.toLowerCase()));
  }, [entries, categories, skipped]);

  /** The label on the one-tap button: an existing category, or Income. */
  const categoryLabel = (id: string): string => {
    if (id === INCOME_ACTUAL_ID) return t.followUpIncome;
    const found = categories.find(c => c.id === id);
    return found ? shownName(found, lang) : id;
  };

  /** A standard category's name in the current language, for the "create it"
   *  button. The lookup cannot miss — `create` is a StandardCategoryId — but a
   *  fallback beats a crash if the list is ever edited carelessly. */
  const standardName = (id: string): string => {
    const found = standardExpenseCategory(id, lang);
    return found ? shownName(found, lang) : id;
  };

  /** Accept a proposal for a standard category the budget does not hold: make
   *  it first, in every month the view writes back, then move the place into
   *  it. Same order as the import — the home exists before anything moves in. */
  const createStandardAndMove = (place: string, id: string) => {
    onCreateCategories([id], months.map(m => ({ year: m.year, month: m.month })));
    movePlace(place, id);
  };

  // Each entry is indexed once. The old render path scanned the full list once
  // per category, which became noticeable after large statement imports.
  const entriesByCategory = useMemo(() => {
    const indexed = new Map<string, ActualEntry[]>();
    for (const entry of entries) {
      const list = indexed.get(entry.categoryId);
      if (list) list.push(entry);
      else indexed.set(entry.categoryId, [entry]);
    }
    for (const list of indexed.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return indexed;
  }, [entries]);

  /** The entries behind one grouped place, matched the way the grouping matched
   *  them, so an opened place can never show a different set than it counted. */
  const entriesOfPlace = (list: ActualEntry[], text: string) =>
    list.filter(e => e.text.trim().toLowerCase() === text.trim().toLowerCase());

  /**
   * The plan half, summed over the span.
   *
   * The month on screen comes from props because that is live state; the others
   * are read from storage. A month that was never budgeted is COUNTED AND
   * SKIPPED rather than treated as a plan of zero — the same rule as everywhere
   * else in this app. Summing it as 0 would quietly shrink the plan and make an
   * ordinary span look like overspending.
   */
  const planned = useMemo(() => {
    const perCategory: Record<string, number> = {};
    let income = 0;
    let withoutBudget = 0;
    for (const m of months) {
      const isCurrent = m.year === year && m.month === month;
      const data = isCurrent ? null : loadMonthData(m.year, m.month, lang);
      const cats = isCurrent ? categories : (data?.expenses ?? []);
      const inc = isCurrent ? totalIncome : (data ? calculateBudgetMetrics(data).income : 0);
      if (!isCurrent && data && !hasBudgetContent(data)) { withoutBudget++; continue; }
      if (isCurrent && cats.length === 0 && inc === 0) { withoutBudget++; continue; }
      income += inc;
      for (const c of cats) perCategory[c.id] = (perCategory[c.id] ?? 0) + categoryTotal(c);
    }
    return { perCategory, income, withoutBudget };
  }, [months, year, month, categories, totalIncome, lang]);

  // The rows define what the plan is. A category that existed in an earlier
  // month of the span but not in this one is not shown — and so its plan is not
  // counted either, or the total would disagree with the rows above it.
  const rows: RowSpec[] = useMemo(() => [
    { id: INCOME_ACTUAL_ID, label: t.followUpIncome, icon: '💰', planned: planned.income },
    ...categories.map(c => ({
      id: c.id, label: shownName(c, lang), icon: c.icon, planned: planned.perCategory[c.id] ?? 0,
    })),
    // Shown only once they hold something — an empty bucket is noise.
    ...(sums[UNSORTED_ACTUAL_ID] !== undefined
      ? [{ id: UNSORTED_ACTUAL_ID, label: t.followUpUnsorted, icon: '❔', planned: 0 }] : []),
    ...(sums[TRANSFER_ACTUAL_ID] !== undefined
      ? [{ id: TRANSFER_ACTUAL_ID, label: t.followUpTransfer, icon: '⇄', planned: 0 }] : []),
  ], [categories, planned, lang, sums, t.followUpIncome, t.followUpUnsorted, t.followUpTransfer]);

  /** Without the plan beside them, the rows have no reason to keep the
   *  budget's order — so they take the only order that answers the question
   *  being asked: most spent first. Income stays on top; it is not spending. */
  const shownRows = useMemo(() => {
    if (showPlan) return rows;
    const [income, ...rest] = rows;
    return [income, ...rest.sort((a, b) => (sums[b.id] ?? 0) - (sums[a.id] ?? 0))];
  }, [rows, showPlan, sums]);

  const addEntry = (categoryId: string, date: string, text: string, amount: number) => {
    if (persist([...entries, { id: generateId(), date, text, amount, categoryId, manual: true }])) {
      setAddingTo(null);
    }
  };

  const deleteEntry = (id: string) => {
    // Asked for by name: an entry is a record of something that happened, and
    // removing one silently would be the same class of loss the import's
    // duplicate rule exists to prevent.
    const victim = entries.find(e => e.id === id);
    if (victim && !window.confirm(t.followUpDeleteConfirm(victim.text))) return;
    // Review 2026-09-18, F3. One entry is small, but it is a record of what was
    // actually spent — it has to be fetched from the bank again, not retyped.
    // Captured across every month the view writes back, the same key list
    // `persist` builds.
    const before = captureKeys(appStorage, months.map(m => actualsKey(m.year, m.month)));
    if (persist(entries.filter(e => e.id !== id))) {
      onRecordUndo({
        at: new Date().toISOString(),
        action: 'deleteEntry',
        year,
        month,
        count: 1,
        changes: before,
      });
    }
  };

  const setAmount = (id: string, amount: number) => {
    persist(entries.map(e => (e.id === id ? { ...e, amount } : e)));
  };

  /**
   * Move every entry from one place into another category, and remember it.
   *
   * The place is the unit, not the entry: you are looking at "Zettle_*WE ARE O
   * · 21 poster · 581 kr", and moving that one line is the whole point. Doing
   * it one entry at a time would be twenty-one confirmations for one decision.
   *
   * Learned like a correction in the import, because it IS one — the next
   * statement puts that place straight into the category you chose here.
   */
  const movePlace = (place: string, categoryId: string): boolean => {
    if (!categoryId) return false;
    const key = place.trim().toLowerCase();
    const saved = persist(entries.map(e => (
      e.text.trim().toLowerCase() === key ? { ...e, categoryId } : e
    )));
    if (!saved) return false;
    rememberCategoryRule(appStorage, place, categoryId);
    setOpenPlace(null);
    return true;
  };

  /** Create the category the user is naming and file the place into it. The
   *  category is added to every month in view, so a span-wide move does not
   *  orphan the entries it moved in the months that are not on screen. */
  const createAndMove = (place: string) => {
    const name = newCatName.trim();
    if (!name) return;
    const id = onCreateNamedCategory(name, months);
    if (movePlace(place, id)) {
      setNamingPlace(null);
      setNewCatName('');
    }
  };

  /** Empty the month's record in one go. The way back from an import of the
   *  wrong file, or the wrong month — removing a hundred entries one ✕ and one
   *  confirmation at a time was not a way back, it was a punishment. Lives here
   *  rather than in the import dialog, which is closed by the time you change
   *  your mind, and names the count and the month because it cannot be undone. */
  const clearMonth = () => {
    const n = entries.length;
    if (n === 0) return;
    if (!window.confirm(t.followUpClearConfirm(n, `${MONTHS[lang][month]} ${year}`))) return;
    // Captured before the write, across every month the view writes back — the
    // same key list `persist` builds, so undo restores exactly what was emptied.
    const before = captureKeys(appStorage, months.map(m => actualsKey(m.year, m.month)));
    if (persist([])) {
      onRecordUndo({
        at: new Date().toISOString(),
        action: 'clearActuals',
        year,
        month,
        count: n,
        changes: before,
      });
      setOpenRow(null);
      setToast({ text: t.followUpClearDone(n), months: [] });
    }
  };

  // Entries whose category this month's budget does not have. It happens more
  // often than it sounds: importing a statement into a month you have not
  // budgeted yet files everything under categories that exist elsewhere, and a
  // deleted category leaves its past entries behind too. Without a home they
  // were simply not drawn — the import said it had written five entries and the
  // month showed one. A row is derived from having a PLAN or an ACTUAL, never
  // from the plan alone.
  const orphanIds = useMemo(() => {
    const known = new Set(categories.map(c => c.id));
    // A bucket is not a category that went missing — it has its own row.
    return Object.keys(sums).filter(id => !known.has(id) && !isBucketId(id));
  }, [sums, categories]);
  const orphanEntries = useMemo(() => {
    const ids = new Set(orphanIds);
    return entries.filter(e => ids.has(e.categoryId));
  }, [entries, orphanIds]);
  const orphanTotal = orphanIds.reduce((s, id) => s + (sums[id] ?? 0), 0);

  const plannedOut = categories.reduce((s, c) => s + (planned.perCategory[c.id] ?? 0), 0);
  // Orphans and Övrigt count here: they are money that left, whatever it was
  // for. A total that leaves out rows printed above it is the same
  // disagreement rowSumGuard.test.ts exists to prevent.
  //
  // TRANSFERS DO NOT. Moving 5 000 kr to your own savings account is not
  // spending 5 000 kr, and on one real statement counting them would have
  // inflated a period's outgoings by 20 485 kr of money that never left. That
  // row sits below the total, outside it, and says why.
  const unsortedTotal = sums[UNSORTED_ACTUAL_ID] ?? 0;
  const actualOut = categories.reduce((s, c) => s + (sums[c.id] ?? 0), 0)
    + orphanTotal + unsortedTotal;
  const anyOut = categories.some(c => sums[c.id] !== undefined)
    || orphanIds.length > 0 || sums[UNSORTED_ACTUAL_ID] !== undefined;

  /** An actual, or "–" when this row has no entries. Absence is not zero: not
   *  having recorded food yet and having spent nothing on food are different
   *  facts, and the same rule governs savings everywhere else in the app. */
  const actualCell = (id: string) =>
    sums[id] === undefined
      ? <span className="amount-unknown" title={t.followUpNotRecorded}>–</span>
      : money(sums[id]);

  const diffCell = (id: string, planned: number) => {
    if (sums[id] === undefined || planned === 0) return null;
    const diff = sums[id] - planned;
    if (diff === 0) return <span className="followup-diff followup-diff-ok">✓</span>;
    // Over the plan is bad for an expense and good for income, so the sign alone
    // cannot decide the colour.
    const bad = id === INCOME_ACTUAL_ID ? diff < 0 : diff > 0;
    return (
      <span className={`followup-diff ${bad ? 'followup-diff-over' : 'followup-diff-under'}`}>
        {diff > 0 ? '+' : ''}{money(diff)}
      </span>
    );
  };

  /** One row of the table, with what is inside it when opened. Used for every
   *  kind — income, a budget category, and the two buckets — so they cannot
   *  drift apart in how they list, sum or let you correct what they hold. */
  const renderRow = (row: RowSpec) => {
    const open = openRow === row.id;
    const mine = entriesByCategory.get(row.id) ?? NO_ENTRIES;
    const isBucket = row.id === UNSORTED_ACTUAL_ID || row.id === TRANSFER_ACTUAL_ID;
    return (
      <div className={`followup-row-wrap${open ? ' is-open' : ''}`} key={row.id}>
        <button
          className={`followup-row${isBucket ? ' is-bucket' : ''}`}
          aria-expanded={open}
          onClick={() => setOpenRow(open ? null : row.id)}
        >
          <span className="followup-name">
            <span aria-hidden="true">{row.icon}</span> {row.label}
            <span className="followup-caret" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
          </span>
          {showPlan && (
            <span className="num followup-planned">
              {isBucket
                ? <span className="amount-unknown">–</span>
                : money(row.planned)}
            </span>
          )}
          <span className="num followup-actual">{actualCell(row.id)}</span>
          {showPlan && (
            <span className="num followup-diffcell">
              {isBucket ? null : diffCell(row.id, row.planned)}
            </span>
          )}
        </button>

        {open && (
          <div className="followup-entries">
            {row.id === UNSORTED_ACTUAL_ID && (
              <p className="followup-none">{t.followUpUnsortedHint}</p>
            )}
            {row.id === TRANSFER_ACTUAL_ID && (
              <p className="followup-none">{t.followUpTransferHint}</p>
            )}
            {mine.length === 0 && (
              <p className="followup-none">{t.followUpNoEntries}</p>
            )}

            {/* Grouped by PLACE. Thirty Espresso House lines spread through a
                year say nothing; "Espresso House, 33 entries, 1 188 kr" is the
                answer. Each place opens onto its own dated entries, so nothing
                is hidden — only folded. */}
            {grouping === 'place' && groupEntriesByText(mine).map(g => {
              const key = `${row.id}|${g.text.toLowerCase()}`;
              const placeOpen = openPlace === key;
              return (
                <div className="followup-place-wrap" key={g.text}>
                  <div className="followup-place-head">
                    <button
                      className={`followup-place${placeOpen ? ' is-open' : ''}`}
                      aria-expanded={placeOpen}
                      onClick={() => setOpenPlace(placeOpen ? null : key)}
                    >
                      <span className="followup-place-text">
                        {g.text}
                        <span className="followup-caret" aria-hidden="true">{placeOpen ? '⌃' : '⌄'}</span>
                      </span>
                      <span className="followup-place-count">{t.csvRows(g.count)}</span>
                      <span className="followup-place-sum">{money(g.total)}</span>
                    </button>
                    {/* The whole place moves at once, and the choice is
                        learned. This is the way out of Övrigt — and the reason
                        an import no longer has to throw anything away. */}
                    <select
                      className="followup-place-move"
                      value=""
                      aria-label={t.followUpMoveTo(g.text)}
                      onChange={ev => {
                        if (ev.target.value === NEW_CATEGORY) {
                          setNewCatName('');
                          setNamingPlace(key);
                          return;
                        }
                        movePlace(g.text, ev.target.value);
                      }}
                    >
                      <option value="">⇄</option>
                      <option value={INCOME_ACTUAL_ID}>{t.followUpIncome}</option>
                      {categories.map(c => (
                        <option value={c.id} key={c.id}>{shownName(c, lang)}</option>
                      ))}
                      <option value={UNSORTED_ACTUAL_ID}>{t.followUpUnsorted}</option>
                      <option value={TRANSFER_ACTUAL_ID}>{t.followUpTransfer}</option>
                      <option value={NEW_CATEGORY}>{t.followUpNewCategory}</option>
                    </select>
                  </div>

                  {/* Naming one here rather than in the budget tab, because
                      this is the moment you realise you need it: staring at a
                      place in Övrigt that belongs to nothing you have. */}
                  {namingPlace === key && (
                    <div className="followup-newcat">
                      <input
                        className="followup-newcat-name"
                        value={newCatName}
                        placeholder={t.followUpNewCategoryName}
                        aria-label={t.followUpNewCategoryName}
                        onChange={ev => setNewCatName(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') createAndMove(g.text); }}
                      />
                      <button className="followup-newcat-save" onClick={() => createAndMove(g.text)}>
                        {t.followUpSave}
                      </button>
                      <button className="followup-newcat-cancel" onClick={() => setNamingPlace(null)}>
                        {t.followUpCancel}
                      </button>
                    </div>
                  )}
                  {placeOpen && entriesOfPlace(mine, g.text).map(e => (
                    <EntryRow
                      key={e.id} entry={e} nested
                      onAmount={v => setAmount(e.id, v)}
                      onDelete={() => deleteEntry(e.id)}
                      manualLabel={t.followUpManual}
                      deleteLabel={t.followUpDelete(e.text)}
                    />
                  ))}
                </div>
              );
            })}

            {grouping === 'date' && mine.map(e => (
              <EntryRow
                key={e.id} entry={e}
                onAmount={v => setAmount(e.id, v)}
                onDelete={() => deleteEntry(e.id)}
                manualLabel={t.followUpManual}
                deleteLabel={t.followUpDelete(e.text)}
              />
            ))}

            {/* Adding is a single-month act: the form files the entry by a
                date, and a date needs a month you are actually looking at
                rather than one of twelve. Not offered for a bucket — you do
                not type something in as "unknown". */}
            {span === 1 && !isBucket && (addingTo === row.id ? (
              <AddEntryForm
                year={year}
                month={month}
                minDate={isoLocal(activeRange.from)}
                maxDate={isoLocal(activeRange.to)}
                onCancel={() => setAddingTo(null)}
                onAdd={(date, text, amount) => addEntry(row.id, date, text, amount)}
              />
            ) : (
              <button className="followup-add" onClick={() => setAddingTo(row.id)}>
                + {t.followUpAddEntry}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tab-content followup-tab">
      <div className="followup-top">
        <h2 className="followup-heading">{t.followUpHeading}</h2>
        <div className="followup-top-actions">
          {/* Only for a single month. "Clear the month's actuals" over a span
              would empty a year on one click, which is not what the words say. */}
          {span === 1 && entries.length > 0 && (
            <button className="followup-clear" onClick={clearMonth}>{t.followUpClear}</button>
          )}
          <button className="followup-import" onClick={() => setImporting(true)}>
            ⬆ {t.followUpImport}
          </button>
          <button
            className="followup-help-btn"
            onClick={() => setHelpOpen(true)}
            title={t.followUpHelpTitle}
            aria-label={t.followUpHelpTitle}
          >
            ?
          </button>
        </div>
      </div>

      <div className="followup-spans" role="group" aria-label={t.followUpSpanAria}>
        {SPANS.map(n => (
          <button
            key={n}
            className={`followup-span${span === n ? ' is-on' : ''}`}
            aria-pressed={span === n}
            onClick={() => { if (isSpan(n)) { setSpan(n); setOpenRow(null); } }}
          >
            {t.followUpSpan(n)}
          </button>
        ))}
        <span className="followup-toggles">
          <button
            className={`followup-toggle${showPlan ? '' : ' is-on'}`}
            aria-pressed={!showPlan}
            onClick={() => setShowPlan(v => !v)}
          >{showPlan ? t.followUpOnlyActuals : t.followUpWithPlan}</button>
          <button
            className="followup-toggle"
            onClick={() => { setGrouping(g => (g === 'place' ? 'date' : 'place')); setOpenPlace(null); }}
          >{grouping === 'place' ? t.followUpByDate : t.followUpByPlace}</button>
        </span>

        {span > 1 && (
          <span className="followup-span-range">
            {t.followUpSpanRange(
              `${MONTHS[lang][months[0].month]} ${months[0].year}`,
              `${MONTHS[lang][month]} ${year}`,
            )}
          </span>
        )}
      </div>

      {periodStartDay !== null && span === 1 && (() => {
        const range = periodRange(year, month, periodStartDay, periodLocks);
        const pinned = periodLocks[lockKey(year, month)] !== undefined;
        return (
          <div className="followup-period">
            {!adjustingPeriod ? (
              <button className="followup-period-btn" onClick={() => setAdjustingPeriod(true)}>
                {pinned ? '⚿ ' : ''}{isoLocal(range.from)} – {isoLocal(range.to)} · {t.followUpAdjustPeriod}
              </button>
            ) : (
              <div className="followup-period-edit">
                <label htmlFor="followup-period-start">{t.followUpPeriodStarts}</label>
                <input
                  id="followup-period-start"
                  type="date"
                  value={isoLocal(range.from)}
                  onChange={ev => {
                    if (!ev.target.value) return;
                    onLockPeriod(year, month, ev.target.value);
                    setAdjustingPeriod(false);
                  }}
                />
                {pinned && (
                  <button
                    className="followup-period-reset"
                    onClick={() => { onLockPeriod(year, month, null); setAdjustingPeriod(false); }}
                  >{t.followUpPeriodReset}</button>
                )}
                <button className="followup-period-cancel" onClick={() => setAdjustingPeriod(false)}>
                  {t.followUpCancel}
                </button>
                <p className="followup-period-hint">{t.followUpPeriodHint}</p>
              </div>
            )}
          </div>
        );
      })()}

      {planned.withoutBudget > 0 && (
        <p className="followup-note">{t.followUpSpanNoBudget(planned.withoutBudget)}</p>
      )}

      {toast && (
        <p className="followup-toast" role="status">
          {toast.text}
          {/* Only months other than this one: an offer to go where you already
              are reads as a bug, and says nothing about why the table did not
              change. */}
          {toast.months
            .filter(m => !(m.year === year && m.month === month))
            .map(m => (
              <button
                key={`${m.year}-${m.month}`}
                className="followup-toast-go"
                onClick={() => onGoToMonth(m.year, m.month)}
              >
                {t.csvGoToMonth(`${MONTHS[lang][m.month]} ${m.year}`)}
              </button>
            ))}
        </p>
      )}

      {helpOpen && <FollowUpHelp onClose={() => setHelpOpen(false)} />}

      {importing && (
        <CsvImport
          categories={categories}
          periodStartDay={periodStartDay}
          periodLocks={periodLocks}
          onCreateCategories={onCreateCategories}
          onClose={() => setImporting(false)}
          onSaveFailed={onSaveFailed}
          onRecordUndo={onRecordUndo}
          onImported={(summary, months) => {
            setImporting(false);
            setToast({ text: summary, months });
            // Re-read rather than merge in memory: the import may have written
            // to months this view is not showing, and storage is the truth.
            reloadEntries();
          }}
        />
      )}

      {entries.length === 0 && (
        <div className="followup-empty">
          <p>{t.followUpEmptyBody}</p>
        </div>
      )}

      {/* ── The leftover pile, as a short list of decisions ──────────────
          The parts were all here already: a place moves in one go and the move
          is learned. What was missing was the asking. Sorting used to mean
          finding the Övrigt row, opening it, and reading 34 places to see which
          were worth a move. This puts the biggest ones in front, with a
          proposal, and each tap teaches the sorter for next month. */}
      {decisions.length > 0 && (
        <div className="triage">
          <div className="triage-head">
            <span className="triage-title">
              ❔ {t.triageWaiting(entries.filter(e => e.categoryId === UNSORTED_ACTUAL_ID).length)}
            </span>
            <button className="triage-toggle" onClick={() => setTriageOpen(o => !o)}>
              {triageOpen ? t.triageHide : t.triageOpen}
            </button>
          </div>

          {triageOpen && (
            <ul className="triage-list">
              {decisions.map(d => (
                <li className="triage-item" key={d.text}>
                  <div className="triage-place">
                    <span className="triage-place-text">{d.text}</span>
                    <span className="triage-place-meta">
                      {t.csvRows(d.count)} · {money(d.total)}
                    </span>
                  </div>
                  <div className="triage-actions">
                    {d.categoryId && (
                      <button
                        className="triage-accept"
                        onClick={() => movePlace(d.text, d.categoryId!)}
                      >
                        {categoryLabel(d.categoryId)}
                        {d.source && <span className="triage-why">{t.triageSource(d.source)}</span>}
                      </button>
                    )}
                    {d.create && (
                      <button
                        className="triage-accept triage-accept-new"
                        onClick={() => createStandardAndMove(d.text, d.create!)}
                      >
                        {t.triageCreate(standardName(d.create))}
                        {d.source && <span className="triage-why">{t.triageSource(d.source)}</span>}
                      </button>
                    )}
                    <select
                      className="triage-other"
                      value=""
                      aria-label={t.followUpMoveTo(d.text)}
                      onChange={ev => { if (ev.target.value) movePlace(d.text, ev.target.value); }}
                    >
                      <option value="">{t.triageOther}</option>
                      <option value={INCOME_ACTUAL_ID}>{t.followUpIncome}</option>
                      {categories.map(c => (
                        <option value={c.id} key={c.id}>{shownName(c, lang)}</option>
                      ))}
                      <option value={TRANSFER_ACTUAL_ID}>{t.followUpTransfer}</option>
                    </select>
                    <button
                      className="triage-skip"
                      onClick={() => setSkipped(prev => new Set(prev).add(d.text.toLowerCase()))}
                    >
                      {t.triageSkip}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={`followup-table${showPlan ? '' : ' is-actuals-only'}`}>
        <div className="followup-head">
          <span>{t.followUpColCategory}</span>
          {showPlan && <span className="num">{t.followUpColPlan}</span>}
          <span className="num">{t.followUpColActual}</span>
          {showPlan && <span className="num">{t.followUpColDiff}</span>}
        </div>

        {shownRows.filter(r => r.id !== TRANSFER_ACTUAL_ID).map(renderRow)}

        {orphanIds.length > 0 && (
          <div className={`followup-row-wrap${openRow === '__orphans__' ? ' is-open' : ''}`}>
            <button
              className="followup-row"
              aria-expanded={openRow === '__orphans__'}
              onClick={() => setOpenRow(openRow === '__orphans__' ? null : '__orphans__')}
            >
              <span className="followup-name">
                <span aria-hidden="true">❓</span> {t.followUpOutsideBudget}
                <span className="followup-caret" aria-hidden="true">
                  {openRow === '__orphans__' ? '⌃' : '⌄'}
                </span>
              </span>
              {showPlan && (
                <span className="num followup-planned">
                  <span className="amount-unknown" title={t.followUpOutsideBudgetHint}>–</span>
                </span>
              )}
              <span className="num followup-actual">{money(orphanTotal)}</span>
              {showPlan && <span className="num followup-diffcell" />}
            </button>

            {openRow === '__orphans__' && span > 1 && (
              <div className="followup-entries">
                <p className="followup-none">{t.followUpOutsideBudgetHint}</p>
                {groupEntriesByText(orphanEntries).map(g => (
                  <div className="followup-place" key={g.text}>
                    <span className="followup-place-text">{g.text}</span>
                    <span className="followup-place-count">{t.csvRows(g.count)}</span>
                    <span className="followup-place-sum">{money(g.total)}</span>
                  </div>
                ))}
              </div>
            )}

            {openRow === '__orphans__' && span === 1 && (
              <div className="followup-entries">
                <p className="followup-none">{t.followUpOutsideBudgetHint}</p>
                {orphanEntries.map(e => (
                  <div className="followup-entry" key={e.id}>
                    <span className="followup-entry-date">{e.date.slice(5)}</span>
                    <span className="followup-entry-text">{e.text}</span>
                    <EntryAmount
                      value={e.amount}
                      displayValue={actualContribution(e)}
                      onChange={v => setAmount(e.id, v)}
                      label={e.text}
                    />
                    <button
                      className="followup-delete"
                      onClick={() => deleteEntry(e.id)}
                      aria-label={t.followUpDelete(e.text)}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="followup-row followup-total">
          <span className="followup-name">{t.followUpTotalOut}</span>
          {showPlan && <span className="num followup-planned">{money(plannedOut)}</span>}
          <span className="num followup-actual">
            {anyOut ? money(actualOut) : <span className="amount-unknown" title={t.followUpNotRecorded}>–</span>}
          </span>
          {showPlan && (
            <span className="num followup-diffcell">{anyOut ? diffCell('__total__', 0) : null}</span>
          )}
        </div>

        {/* Below the total, on purpose: a transfer is not part of it. */}
        {shownRows.filter(r => r.id === TRANSFER_ACTUAL_ID).map(renderRow)}
      </div>
    </div>
  );
};

/** One dated entry: what it was, what it cost, and the two ways to correct it.
 *  Shared by both listings so a figure can be fixed wherever you found it. */
const EntryRow = ({ entry, nested, onAmount, onDelete, manualLabel, deleteLabel }: {
  entry: ActualEntry;
  nested?: boolean;
  onAmount: (v: number) => void;
  onDelete: () => void;
  manualLabel: string;
  deleteLabel: string;
}) => (
  <div className={`followup-entry${nested ? ' is-nested' : ''}`}>
    <span className="followup-entry-date">{entry.date.slice(5)}</span>
    <span className="followup-entry-text">
      {entry.text}
      {entry.manual && <span className="followup-manual">{manualLabel}</span>}
    </span>
    <EntryAmount
      value={entry.amount}
      displayValue={actualContribution(entry)}
      onChange={onAmount}
      label={entry.text}
    />
    <button className="followup-delete" onClick={onDelete} aria-label={deleteLabel}>✕</button>
  </div>
);

/** An entry's amount, editable in place. Reuses the app's money input so the
 *  same rejection rules apply here as everywhere else — 1e309 and a four-hundred
 *  digit number are refused rather than quietly rewritten. */
const EntryAmount = ({ value, displayValue, onChange, label }: {
  value: number; displayValue: number; onChange: (v: number) => void; label: string;
}) => {
  const { money } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);

  if (!editing) {
    return (
      <button
        className="followup-entry-amount"
        onClick={() => { setDraft(String(value)); setError(false); setEditing(true); }}
        aria-label={label}
      >{money(displayValue)}</button>
    );
  }
  const commit = () => {
    const r = parseMoneyOrZero(draft);
    if (!r.ok) { setError(true); return; }
    onChange(r.value);
    setEditing(false);
  };
  return (
    <input
      ref={ref}
      className={`followup-entry-input${error ? ' has-error' : ''}`}
      inputMode="decimal"
      value={draft}
      onChange={ev => { setDraft(ev.target.value); setError(false); }}
      onBlur={() => { if (parseMoneyOrZero(draft).ok) commit(); else setEditing(false); }}
      onKeyDown={ev => {
        if (ev.key === 'Enter') commit();
        if (ev.key === 'Escape') setEditing(false);
      }}
    />
  );
};

/** Date, text and amount. The category is not asked for — the form opens inside
 *  the category it belongs to, so the entry cannot land somewhere unexpected. */
const AddEntryForm = ({ year, month, minDate, maxDate, onAdd, onCancel }: {
  year: number;
  month: number;
  minDate: string;
  maxDate: string;
  onAdd: (date: string, text: string, amount: number) => void;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  // Defaults to the FIRST of the month being viewed, not today: an entry filed
  // from the September tab belongs to September even if it is typed in November.
  const pad = (n: number) => String(n).padStart(2, '0');
  const firstOfMonth = `${year}-${pad(month + 1)}-01`;
  const initialDate = firstOfMonth < minDate
    ? minDate
    : (firstOfMonth > maxDate ? maxDate : firstOfMonth);
  const [date, setDate] = useState(initialDate);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const r = parseMoneyOrZero(amount);
    if (!r.ok || r.value <= 0) { setError(t.followUpBadAmount); return; }
    if (!text.trim()) { setError(t.followUpBadText); return; }
    if (!isValidIsoDate(date) || date < minDate || date > maxDate) {
      setError(t.followUpBadDate);
      return;
    }
    onAdd(date, text.trim(), r.value);
  };

  return (
    <div className="followup-form">
      <input
        type="date" className="followup-form-date" value={date} min={minDate} max={maxDate}
        onChange={e => { setDate(e.target.value); setError(null); }} aria-label={t.followUpDate}
      />
      <input
        className="followup-form-text" value={text} placeholder={t.followUpText}
        onChange={e => { setText(e.target.value); setError(null); }} aria-label={t.followUpText}
      />
      <input
        className="followup-form-amount" inputMode="decimal" value={amount} placeholder={t.followUpAmount}
        onChange={e => { setAmount(e.target.value); setError(null); }} aria-label={t.followUpAmount}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
      />
      <div className="followup-form-actions">
        <button className="followup-form-save" onClick={submit}>{t.followUpSave}</button>
        <button className="followup-form-cancel" onClick={onCancel}>{t.followUpCancel}</button>
      </div>
      {error && <p className="followup-form-error" role="alert">{error}</p>}
    </div>
  );
};
