import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { appStorage } from '../storage';
import { generateId, shownName } from '../defaults';
import { categoryTotal } from '../metrics';
import { parseMoneyOrZero } from '../money';
import {
  loadActuals, saveActuals, sumByCategory, entriesFor, INCOME_ACTUAL_ID,
} from '../actuals';
import { useLang } from '../i18n';
import type { ActualEntry, BudgetCategory } from '../types';

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
}

interface RowSpec {
  id: string;
  label: string;
  icon: string;
  planned: number;
}

export const FollowUpTab = ({ year, month, categories, totalIncome, onSaveFailed }: Props) => {
  const { t, lang, money } = useLang();
  const [entries, setEntries] = useState<ActualEntry[]>(() => loadActuals(appStorage, year, month));
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  // Reload when the month changes. Writes happen explicitly on each edit below,
  // never from an effect watching state — which is what makes the month-switch
  // data bleed the rest of the app has to guard against impossible here: there
  // is no save effect that could fire with the previous month's entries still
  // in scope.
  useEffect(() => { setEntries(loadActuals(appStorage, year, month)); }, [year, month]);

  const persist = useCallback((next: ActualEntry[]) => {
    setEntries(next);
    if (!saveActuals(appStorage, year, month, next)) onSaveFailed();
  }, [year, month, onSaveFailed]);

  const sums = useMemo(() => sumByCategory(entries), [entries]);

  const rows: RowSpec[] = useMemo(() => [
    { id: INCOME_ACTUAL_ID, label: t.followUpIncome, icon: '💰', planned: totalIncome },
    ...categories.map(c => ({
      id: c.id, label: shownName(c, lang), icon: c.icon, planned: categoryTotal(c),
    })),
  ], [categories, totalIncome, lang, t.followUpIncome]);

  const addEntry = (categoryId: string, date: string, text: string, amount: number) => {
    persist([...entries, { id: generateId(), date, text, amount, categoryId, manual: true }]);
    setAddingTo(null);
  };

  const deleteEntry = (id: string) => {
    // Asked for by name: an entry is a record of something that happened, and
    // removing one silently would be the same class of loss the import's
    // duplicate rule exists to prevent.
    const victim = entries.find(e => e.id === id);
    if (victim && !window.confirm(t.followUpDeleteConfirm(victim.text))) return;
    persist(entries.filter(e => e.id !== id));
  };

  const setAmount = (id: string, amount: number) => {
    persist(entries.map(e => (e.id === id ? { ...e, amount } : e)));
  };

  const plannedOut = categories.reduce((s, c) => s + categoryTotal(c), 0);
  const actualOut = categories.reduce((s, c) => s + (sums[c.id] ?? 0), 0);
  const anyOut = categories.some(c => sums[c.id] !== undefined);

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

  return (
    <div className="tab-content followup-tab">
      <h2 className="followup-heading">{t.followUpHeading}</h2>

      {entries.length === 0 && (
        <div className="followup-empty">
          <p>{t.followUpEmptyBody}</p>
          <p className="followup-empty-soon">{t.followUpEmptySoon}</p>
        </div>
      )}

      <div className="followup-table">
        <div className="followup-head">
          <span>{t.followUpColCategory}</span>
          <span className="num">{t.followUpColPlan}</span>
          <span className="num">{t.followUpColActual}</span>
          <span className="num">{t.followUpColDiff}</span>
        </div>

        {rows.map(row => {
          const open = openRow === row.id;
          const mine = entriesFor(entries, row.id);
          return (
            <div className={`followup-row-wrap${open ? ' is-open' : ''}`} key={row.id}>
              <button
                className="followup-row"
                aria-expanded={open}
                onClick={() => setOpenRow(open ? null : row.id)}
              >
                <span className="followup-name">
                  <span aria-hidden="true">{row.icon}</span> {row.label}
                  <span className="followup-caret" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
                </span>
                <span className="num followup-planned">{money(row.planned)}</span>
                <span className="num followup-actual">{actualCell(row.id)}</span>
                <span className="num followup-diffcell">{diffCell(row.id, row.planned)}</span>
              </button>

              {open && (
                <div className="followup-entries">
                  {mine.length === 0 && (
                    <p className="followup-none">{t.followUpNoEntries}</p>
                  )}
                  {mine.map(e => (
                    <div className="followup-entry" key={e.id}>
                      <span className="followup-entry-date">{e.date.slice(5)}</span>
                      <span className="followup-entry-text">
                        {e.text}
                        {e.manual && <span className="followup-manual">{t.followUpManual}</span>}
                      </span>
                      <EntryAmount value={e.amount} onChange={v => setAmount(e.id, v)} label={e.text} />
                      <button
                        className="followup-delete"
                        onClick={() => deleteEntry(e.id)}
                        aria-label={t.followUpDelete(e.text)}
                      >✕</button>
                    </div>
                  ))}

                  {addingTo === row.id ? (
                    <AddEntryForm
                      year={year}
                      month={month}
                      onCancel={() => setAddingTo(null)}
                      onAdd={(date, text, amount) => addEntry(row.id, date, text, amount)}
                    />
                  ) : (
                    <button className="followup-add" onClick={() => setAddingTo(row.id)}>
                      + {t.followUpAddEntry}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="followup-row followup-total">
          <span className="followup-name">{t.followUpTotalOut}</span>
          <span className="num followup-planned">{money(plannedOut)}</span>
          <span className="num followup-actual">
            {anyOut ? money(actualOut) : <span className="amount-unknown" title={t.followUpNotRecorded}>–</span>}
          </span>
          <span className="num followup-diffcell">{anyOut ? diffCell('__total__', 0) : null}</span>
        </div>
      </div>
    </div>
  );
};

/** An entry's amount, editable in place. Reuses the app's money input so the
 *  same rejection rules apply here as everywhere else — 1e309 and a four-hundred
 *  digit number are refused rather than quietly rewritten. */
const EntryAmount = ({ value, onChange, label }: {
  value: number; onChange: (v: number) => void; label: string;
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
      >{money(value)}</button>
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
const AddEntryForm = ({ year, month, onAdd, onCancel }: {
  year: number;
  month: number;
  onAdd: (date: string, text: string, amount: number) => void;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  // Defaults to the FIRST of the month being viewed, not today: an entry filed
  // from the September tab belongs to September even if it is typed in November.
  const pad = (n: number) => String(n).padStart(2, '0');
  const [date, setDate] = useState(`${year}-${pad(month + 1)}-01`);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const r = parseMoneyOrZero(amount);
    if (!r.ok || r.value <= 0) { setError(t.followUpBadAmount); return; }
    if (!text.trim()) { setError(t.followUpBadText); return; }
    onAdd(date, text.trim(), r.value);
  };

  return (
    <div className="followup-form">
      <input
        type="date" className="followup-form-date" value={date}
        onChange={e => setDate(e.target.value)} aria-label={t.followUpDate}
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
