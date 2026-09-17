import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { appStorage } from '../storage';
import { generateId, shownName, standardExpenseCategory } from '../defaults';
import {
  decodeCsv, detectDelimiter, parseCsv, findHeaderRow, guessColumns,
  rowsToParsed, headerFingerprint, groupByText, looksLikeData, placeholderHeader,
  parseDate,
  type ColumnRole, type TextGroup, type DateOrder,
} from '../csvImport';
import { loadCsvMaps, rememberCsvMap, forgetCsvMap } from '../csvMaps';
import {
  suggest, isTransfer, loadCategoryRules, rememberCategoryRule, STANDARD_CATEGORY_IDS,
  type LearnedRules,
} from '../categorise';
import {
  loadActuals, saveActuals, newEntries, groupByMonth,
  INCOME_ACTUAL_ID, UNSORTED_ACTUAL_ID, TRANSFER_ACTUAL_ID,
} from '../actuals';
import { useLang, MONTHS } from '../i18n';
import type { PeriodLocks } from '../periodLabel';
import type { ActualEntry, BudgetCategory } from '../types';

// ── The import, in as few decisions as the file allows ─────────────────────
//
// Three steps, and the middle one usually does not appear: once a bank's column
// layout has been confirmed it is remembered against the file's own header, so
// the next export goes straight to review.
//
// Review groups by DESCRIPTION rather than listing every row. A statement with
// a hundred transactions holds perhaps thirty distinct places, and "ICA
// SUPERMARKET, 6 rows, 782,90" is one decision instead of six.
//
// Most of those places arrive already sorted — see categorise.ts. What you
// correct is remembered and beats the built-in list next time, so the work
// shrinks with every statement rather than repeating.
//
// A place whose category the budget does not have is offered as one to CREATE,
// with its standard id, never created behind your back. The offer is only taken
// up when you press Import, so a proposal you scroll past changes nothing.

type Step = 'file' | 'columns' | 'review';

/** A month the import actually wrote to. */
export interface TouchedMonth {
  year: number;
  month: number;
}

interface Props {
  /** Deliberately NOT told which month is on screen: every entry is filed by
   *  its own date, so a statement covering two months writes to both. */
  categories: BudgetCategory[];
  /** The pay period's start day, or null. An entry belongs to the BUDGET month
   *  its date falls in, which is not the calendar month for anyone paid on the
   *  25th — their rent and standing charges land on the turnover day. */
  periodStartDay: number | null;
  /** Periods pinned by hand, which override the rule for those months. */
  periodLocks: PeriodLocks;
  onClose: () => void;
  /** The months come along as data, not only as words inside the summary: a
   *  statement is usually LAST month's, so the tab that ordered the import is
   *  routinely not the tab anything landed in. Naming the month in a sentence
   *  was not enough — the screen sat unchanged and the import looked like it
   *  had done nothing. The caller can now offer to go there. */
  onImported: (summary: string, months: TouchedMonth[]) => void;
  onSaveFailed: () => void;
  /** Add standard categories the user accepted an offer to create, into the
   *  months the entries are being filed in. */
  onCreateCategories: (ids: string[], months: TouchedMonth[]) => void;
}

/** Prefix marking a choice that is an offer to create rather than a category
 *  that exists. Kept out of band so it can never collide with a real id. */
const CREATE = 'new:';

interface Group extends TextGroup {
  /** '' until decided, an existing category id, INCOME_ACTUAL_ID, or
   *  `new:<standard id>` for a category the budget does not have yet. Groups
   *  left undecided are not imported. */
  choice: string;
  /** Whether the sorter chose this rather than the user. Only what the user
   *  chose is worth learning from; re-learning your own guess teaches nothing
   *  and would cement a mistake the first time one slips through. */
  auto: boolean;
}

export const CsvImport = ({
  categories, periodStartDay, periodLocks, onClose, onImported, onSaveFailed,
  onCreateCategories,
}: Props) => {
  const { t, lang, money } = useLang();
  const [step, setStep] = useState<Step>('file');
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  /** How this file writes its dates. Read from the column, changeable by hand —
   *  "09/05/2026" is two different real days and no single row can say which. */
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy');
  const [dateOrderGuessed, setDateOrderGuessed] = useState(false);
  const [headerless, setHeaderless] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    try {
      const text = decodeCsv(await file.arrayBuffer());
      const rows = parseCsv(text, detectDelimiter(text));
      if (rows.length < 2) { setError(t.csvNoRows); return; }
      const h = findHeaderRow(rows);
      // Some banks export no column names at all. Taking the first DATA row for
      // a heading then loses that transaction without a word — it is neither
      // parsed nor reported, because the importer thinks it was the heading.
      const headerless = looksLikeData(rows[h]);
      const head = headerless ? placeholderHeader(rows[h].length) : rows[h];
      const body = headerless ? rows.slice(h) : rows.slice(h + 1);
      setHeader(head);
      setDataRows(body);

      // A layout confirmed once is reused without asking again.
      const remembered = loadCsvMaps(appStorage)[headerFingerprint(head)];
      const guessed = guessColumns(head, body.slice(0, 20));
      const guess = remembered?.roles ?? guessed.roles;
      const order = remembered?.dateOrder ?? guessed.dateOrder ?? 'dmy';
      setRoles(guess);
      setDateOrder(order);
      setDateOrderGuessed(remembered ? false : (guessed.dateOrderGuessed ?? false));
      setHeaderless(headerless);
      if (remembered) toReview(body, guess, order);
      else setStep('columns');
    } catch {
      setError(t.csvUnreadable);
    }
  };

  const toReview = (body: string[][], useRoles: ColumnRole[], order: DateOrder = dateOrder) => {
    const { rows, skipped } = rowsToParsed(body, { roles: useRoles, dateOrder: order });
    if (rows.length === 0) { setError(t.csvNoRows); setStep('columns'); return; }
    const rules = loadCategoryRules(appStorage);
    const existing = new Set(categories.map(c => c.id));
    setGroups(groupByText(rows, t.csvNoText).map(g => {
      // A RAIL first, whatever its sign. An incoming transfer from your own
      // account is no more income than an outgoing one is spending, and the
      // sign test below would have called it salary.
      if (isTransfer(g.text)) return { ...g, choice: TRANSFER_ACTUAL_ID, auto: true };
      if (g.incoming) return { ...g, choice: INCOME_ACTUAL_ID, auto: true };
      const s = suggest(g.text, existing, rules);
      if (s.categoryId) return { ...g, choice: s.categoryId, auto: true };
      if (s.create) return { ...g, choice: CREATE + s.create, auto: true };
      // Nothing is thrown away. What the sorter cannot place goes to Övrigt,
      // where it is visible, counted, and can be moved out later — the old
      // behaviour silently discarded 173 of 471 transactions on a real file
      // and left no way to reach them again.
      return { ...g, choice: UNSORTED_ACTUAL_ID, auto: true };
    }));
    setSkippedCount(skipped.length);
    setStep('review');
  };

  /**
   * Back to the column step, forgetting what was remembered for this header.
   *
   * The way out of the trap remembering set. A layout confirmed once was reused
   * for that header for ever — so a single wrong confirmation (the balance
   * column taken for the amount, a reference taken for the description) was
   * permanent, silent, and unreachable from inside the app.
   *
   * The mapping is forgotten NOW, before anything is re-confirmed, because that
   * is the safe direction: close the dialog at this point and the next file
   * asks again rather than quietly repeating the mistake.
   */
  const backToColumns = () => {
    forgetCsvMap(appStorage, headerFingerprint(header));
    setError(null);
    setStep('columns');
  };

  const confirmColumns = () => {
    rememberCsvMap(appStorage, headerFingerprint(header), roles, dateOrder);
    toReview(dataRows, roles);
  };

  const ready = groups.filter(g => g.choice);
  /** Groups the user has deliberately set to skip. No longer a leftover: every
   *  group starts with a home, so an empty choice is now an act. */
  const unassigned = groups.length - ready.length;
  const toUnsorted = groups.filter(g => g.choice === UNSORTED_ACTUAL_ID).length;
  const toTransfer = groups.filter(g => g.choice === TRANSFER_ACTUAL_ID).length;
  /** How many the sorter placed without being asked — the number that says
   *  whether it is earning its keep. Counted before any correction, so it does
   *  not flatter itself by counting the ones you fixed. */
  const sorted = groups.filter(g => g.auto && g.choice).length;

  /** The standard categories this import would create, each named once. */
  const toCreate = [...new Set(
    ready.filter(g => g.choice.startsWith(CREATE)).map(g => g.choice.slice(CREATE.length)),
  )];

  /** Standard categories the budget does not have, offered as ones to create. */
  const creatable = STANDARD_CATEGORY_IDS
    .filter(id => !categories.some(c => c.id === id))
    .flatMap(id => {
      const cat = standardExpenseCategory(id, lang);
      return cat ? [{ id, cat }] : [];
    });

  /** A choice as a category id: an offer to create becomes the id it creates. */
  const resolve = (choice: string) =>
    (choice.startsWith(CREATE) ? choice.slice(CREATE.length) : choice);

  const doImport = () => {
    const entries: ActualEntry[] = ready.flatMap(g =>
      g.rows.map(r => ({
        id: generateId(),
        date: r.date,
        text: r.text || t.csvNoText,
        // The sign lives in the category, not in the number — see actuals.ts.
        amount: Math.abs(r.amount),
        categoryId: resolve(g.choice),
      })));

    const { months } = groupByMonth(entries, periodStartDay, periodLocks);

    // The offers first, and into the months the entries are ABOUT to land in.
    // A category that exists with nothing filed under it is harmless; entries
    // filed under a category their own month does not have are not — they show
    // up under "outside the budget" and have to be explained. Every month the
    // file reaches, not only the ones that end up with something new: a month
    // whose rows all turn out to be duplicates still holds those entries and
    // still needs somewhere to show them.
    if (toCreate.length > 0) {
      onCreateCategories(
        toCreate,
        [...months.values()].map(b => ({ year: b.year, month: b.month })),
      );
    }

    // Learn from what YOU decided, never from what the sorter guessed. Storing
    // its own guesses back would cement the first mistake that slips past and
    // make it look, next month, like something you had confirmed.
    let rules: LearnedRules | undefined;
    for (const g of ready) {
      if (g.auto) continue;
      rules = rememberCategoryRule(appStorage, g.text, resolve(g.choice), rules);
    }

    const touched: string[] = [];
    const written: TouchedMonth[] = [];
    let added = 0;
    let duplicates = 0;

    for (const bucket of months.values()) {
      const existing = loadActuals(appStorage, bucket.year, bucket.month);
      // Counts rather than matches: a genuine second identical purchase is kept,
      // while re-importing the same statement adds nothing. See actuals.ts.
      const fresh = newEntries(bucket.entries, existing);
      duplicates += bucket.entries.length - fresh.length;
      if (fresh.length === 0) continue;
      if (!saveActuals(appStorage, bucket.year, bucket.month, [...existing, ...fresh])) {
        onSaveFailed();
        return;
      }
      added += fresh.length;
      touched.push(`${MONTHS[lang][bucket.month]} ${bucket.year}`);
      written.push({ year: bucket.year, month: bucket.month });
    }

    // Which months were touched is said out loud: a file may cover two of them
    // while only one is on screen, and the app must not change something the
    // user cannot see.
    const parts = [t.csvDoneAdded(added)];
    if (touched.length) parts.push(touched.join(', '));
    if (toCreate.length) parts.push(t.csvDoneCreated(toCreate.length));
    if (duplicates) parts.push(t.csvDoneDuplicates(duplicates));
    if (unassigned) parts.push(t.csvDoneUnassigned(unassigned));
    onImported(parts.join(' · '), written);
  };

  const setRole = (i: number, role: ColumnRole) => {
    setRoles(rs => {
      const next = [...rs];
      // A role other than 'skip' belongs to one column only, so claiming it
      // releases whichever column held it before.
      if (role !== 'skip') next.forEach((r, j) => { if (r === role && j !== i) next[j] = 'skip'; });
      next[i] = role;
      return next;
    });
  };

  const hasDate = roles.includes('date');
  const hasAmount = roles.includes('amount') || roles.includes('in') || roles.includes('out');

  // Rendered into <body>, not where it sits in the tree. A `position: fixed`
  // element is only viewport-relative while no ancestor carries a transform,
  // and the tab wrapper carries one for good: `.tab-enter` animates with
  // fill-mode, so its final `translateY(0)` never goes away. Inside that box
  // the dialog anchored to the tab instead of the screen — its title bar and
  // close button landed underneath the app header, out of reach. This is the
  // first dialog in the app opened from inside a tab; the portal makes it
  // immune to whatever an ancestor does.
  return createPortal(
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div className="theme-panel csv-panel" role="dialog" aria-modal="true" aria-label={t.csvTitle} tabIndex={-1}>
        <div className="csv-head">
          <h2 className="csv-title">{t.csvTitle}</h2>
          <button className="utils-menu-close-btn" onClick={onClose} aria-label={t.themeClose}>✕</button>
        </div>

        <div className="csv-body">
          {error && <p className="csv-error" role="alert">{error}</p>}

          {step === 'file' && (
            <div
              className="csv-drop"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void readFile(f); }}
            >
              <p className="csv-drop-lead">{t.csvDropLead}</p>
              <p className="csv-drop-sub">{t.csvDropSub}</p>
              <button className="csv-pick" onClick={() => fileRef.current?.click()}>{t.csvPick}</button>
              <input
                ref={fileRef} type="file" accept=".csv,text/csv" hidden
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }}
              />
            </div>
          )}

          {step === 'columns' && (
            <>
              <p className="csv-lead">{t.csvColumnsLead}</p>
              <div className="csv-cols">
                {header.map((h, i) => (
                  <div className="csv-col" key={i}>
                    <select
                      className="csv-role" value={roles[i] ?? 'skip'}
                      aria-label={h || `#${i + 1}`}
                      onChange={e => setRole(i, e.target.value as ColumnRole)}
                    >
                      <option value="date">{t.csvRoleDate}</option>
                      <option value="text">{t.csvRoleText}</option>
                      <option value="amount">{t.csvRoleAmount}</option>
                      <option value="in">{t.csvRoleIn}</option>
                      <option value="out">{t.csvRoleOut}</option>
                      <option value="skip">{t.csvRoleSkip}</option>
                    </select>
                    <div className="csv-col-head">{h}</div>
                    {dataRows.slice(0, 3).map((r, j) => (
                      <div className="csv-col-cell" key={j}>{r[i]}</div>
                    ))}
                  </div>
                ))}
              </div>
              {/* The date order is a fact about the FILE, not a preference —
                  and one no single row can settle. "09/05/2026" is the 5th of
                  September in Stockholm and the 9th of May in Chicago, and both
                  readings land in a real month. Shown here, with the reading
                  spelled out, because getting it wrong is completely silent. */}
              <div className={`csv-dateorder${dateOrderGuessed ? ' is-guess' : ''}`}>
                <span className="csv-dateorder-label">{t.csvDateOrder}</span>
                <select
                  className="csv-dateorder-pick"
                  value={dateOrder}
                  aria-label={t.csvDateOrder}
                  onChange={e => setDateOrder(e.target.value as DateOrder)}
                >
                  <option value="dmy">{t.csvDateOrderDmy}</option>
                  <option value="mdy">{t.csvDateOrderMdy}</option>
                </select>
                <span className="csv-dateorder-example">
                  {(() => {
                    const di = roles.indexOf('date');
                    const sample = di >= 0 ? dataRows.find(r => r[di]?.trim())?.[di] : undefined;
                    const read = sample ? parseDate(sample, dateOrder) : null;
                    return sample && read ? t.csvDateOrderReads(sample, read) : null;
                  })()}
                </span>
                {dateOrderGuessed && (
                  <span className="csv-dateorder-note">{t.csvDateOrderUnsure}</span>
                )}
              </div>

              {headerless && <p className="csv-note">{t.csvNoHeader}</p>}
              <p className="csv-remember">{t.csvRemember}</p>
              <div className="csv-actions">
                <button className="csv-primary" disabled={!hasDate || !hasAmount} onClick={confirmColumns}>
                  {t.csvContinue}
                </button>
                {(!hasDate || !hasAmount) && <span className="csv-hint">{t.csvNeedBoth}</span>}
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              <p className="csv-lead">
                {t.csvReviewLead(groups.reduce((s, g) => s + g.rows.length, 0), groups.length)}
                {sorted > 0 && <span className="csv-sorted"> {t.csvSorted(sorted, groups.length)}</span>}
                {skippedCount > 0 && <span className="csv-skipped"> {t.csvSkipped(skippedCount)}</span>}
              </p>
              <div className="csv-groups">
                {groups.map((g, i) => (
                  <div className={`csv-group${g.choice ? '' : ' is-unset'}`} key={i}>
                    <span className="csv-group-text">{g.text}</span>
                    <span className="csv-group-count">{t.csvRows(g.rows.length)}</span>
                    <span className="csv-group-sum">{money(Math.abs(g.total))}</span>
                    <select
                      className={`csv-group-cat${g.choice.startsWith(CREATE) ? ' is-new' : ''}`}
                      value={g.choice}
                      aria-label={g.text}
                      onChange={e => setGroups(gs => gs.map((x, j) => (
                        // Changing it makes the choice yours, and only yours is
                        // learned from.
                        j === i ? { ...x, choice: e.target.value, auto: false } : x
                      )))}
                    >
                      <option value="">{t.csvSkipGroup}</option>
                      <option value={INCOME_ACTUAL_ID}>{t.followUpIncome}</option>
                      <option value={UNSORTED_ACTUAL_ID}>{t.followUpUnsorted}</option>
                      <option value={TRANSFER_ACTUAL_ID}>{t.followUpTransfer}</option>
                      {categories.length > 0 && (
                        <optgroup label={t.csvExistingGroup}>
                          {categories.map(c => (
                            <option value={c.id} key={c.id}>{shownName(c, lang)}</option>
                          ))}
                        </optgroup>
                      )}
                      {creatable.length > 0 && (
                        <optgroup label={t.csvCreateGroup}>
                          {creatable.map(({ id, cat }) => (
                            <option value={CREATE + id} key={id}>+ {cat.icon} {cat.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                ))}
              </div>
              <div className="csv-actions">
                <button className="csv-primary" disabled={ready.length === 0} onClick={doImport}>
                  {t.csvImportN(ready.reduce((s, g) => s + g.rows.length, 0))}
                </button>
                {toCreate.length > 0 && <span className="csv-hint csv-hint-new">{t.csvWillCreate(toCreate.length)}</span>}
                {toUnsorted > 0 && <span className="csv-hint">{t.csvToUnsorted(toUnsorted)}</span>}
                {toTransfer > 0 && <span className="csv-hint">{t.csvToTransfer(toTransfer)}</span>}
                {unassigned > 0 && <span className="csv-hint">{t.csvUnassigned(unassigned)}</span>}
                <button className="csv-secondary" onClick={backToColumns}>{t.csvChangeColumns}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};
