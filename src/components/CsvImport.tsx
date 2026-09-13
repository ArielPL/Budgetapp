import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { appStorage } from '../storage';
import { generateId, shownName } from '../defaults';
import {
  decodeCsv, detectDelimiter, parseCsv, findHeaderRow, guessColumns,
  rowsToParsed, headerFingerprint, groupByText, type ColumnRole, type TextGroup,
} from '../csvImport';
import { loadCsvMaps, rememberCsvMap } from '../csvMaps';
import { loadActuals, saveActuals, newEntries, groupByMonth, INCOME_ACTUAL_ID } from '../actuals';
import { useLang, MONTHS } from '../i18n';
import type { ActualEntry, BudgetCategory } from '../types';

// ── The import, in as few decisions as the file allows ─────────────────────
//
// Three steps, and the middle one usually does not appear: once a bank's column
// layout has been confirmed it is remembered against the file's own header, so
// the next export goes straight to review.
//
// Review groups by DESCRIPTION rather than listing every row. A statement with
// a hundred transactions holds perhaps thirty distinct places, and "ICA
// SUPERMARKET, 6 rows, 782,90" is one decision instead of six. Until the
// sorting learns (that is the next step), this is what keeps the work sane.

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
  onClose: () => void;
  /** The months come along as data, not only as words inside the summary: a
   *  statement is usually LAST month's, so the tab that ordered the import is
   *  routinely not the tab anything landed in. Naming the month in a sentence
   *  was not enough — the screen sat unchanged and the import looked like it
   *  had done nothing. The caller can now offer to go there. */
  onImported: (summary: string, months: TouchedMonth[]) => void;
  onSaveFailed: () => void;
}

interface Group extends TextGroup {
  /** Empty until the user picks one; groups without a category are not imported. */
  categoryId: string;
}

export const CsvImport = ({ categories, onClose, onImported, onSaveFailed }: Props) => {
  const { t, lang, money } = useLang();
  const [step, setStep] = useState<Step>('file');
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    try {
      const text = decodeCsv(await file.arrayBuffer());
      const rows = parseCsv(text, detectDelimiter(text));
      if (rows.length < 2) { setError(t.csvNoRows); return; }
      const h = findHeaderRow(rows);
      const head = rows[h];
      const body = rows.slice(h + 1);
      setHeader(head);
      setDataRows(body);

      // A layout confirmed once is reused without asking again.
      const remembered = loadCsvMaps(appStorage)[headerFingerprint(head)];
      const guess = remembered ?? guessColumns(head, body.slice(0, 5)).roles;
      setRoles(guess);
      if (remembered) toReview(body, guess);
      else setStep('columns');
    } catch {
      setError(t.csvUnreadable);
    }
  };

  const toReview = (body: string[][], useRoles: ColumnRole[]) => {
    const { rows, skipped } = rowsToParsed(body, { roles: useRoles });
    if (rows.length === 0) { setError(t.csvNoRows); setStep('columns'); return; }
    setGroups(groupByText(rows, t.csvNoText).map(g => ({
      ...g,
      // Money in defaults to the income bucket; money out waits for a choice.
      categoryId: g.incoming ? INCOME_ACTUAL_ID : '',
    })));
    setSkippedCount(skipped.length);
    setStep('review');
  };

  const confirmColumns = () => {
    rememberCsvMap(appStorage, headerFingerprint(header), roles);
    toReview(dataRows, roles);
  };

  const ready = groups.filter(g => g.categoryId);
  const unassigned = groups.length - ready.length;

  const doImport = () => {
    const entries: ActualEntry[] = ready.flatMap(g =>
      g.rows.map(r => ({
        id: generateId(),
        date: r.date,
        text: r.text || t.csvNoText,
        // The sign lives in the category, not in the number — see actuals.ts.
        amount: Math.abs(r.amount),
        categoryId: g.categoryId,
      })));

    const { months } = groupByMonth(entries);
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
                {skippedCount > 0 && <span className="csv-skipped"> {t.csvSkipped(skippedCount)}</span>}
              </p>
              <div className="csv-groups">
                {groups.map((g, i) => (
                  <div className={`csv-group${g.categoryId ? '' : ' is-unset'}`} key={i}>
                    <span className="csv-group-text">{g.text}</span>
                    <span className="csv-group-count">{t.csvRows(g.rows.length)}</span>
                    <span className="csv-group-sum">{money(Math.abs(g.total))}</span>
                    <select
                      className="csv-group-cat" value={g.categoryId}
                      aria-label={g.text}
                      onChange={e => setGroups(gs => gs.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}
                    >
                      <option value="">{t.csvChoose}</option>
                      <option value={INCOME_ACTUAL_ID}>{t.followUpIncome}</option>
                      {categories.map(c => (
                        <option value={c.id} key={c.id}>{shownName(c, lang)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="csv-actions">
                <button className="csv-primary" disabled={ready.length === 0} onClick={doImport}>
                  {t.csvImportN(ready.reduce((s, g) => s + g.rows.length, 0))}
                </button>
                {unassigned > 0 && <span className="csv-hint">{t.csvUnassigned(unassigned)}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};
