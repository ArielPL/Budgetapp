import { useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { standardExpenseCategory } from '../defaults';
import { STANDARD_CATEGORY_IDS, isStandardCategoryId } from '../categorise';
import { monthYear } from '../dateLabel';
import {
  readSpreadsheet, readText, analyse, rowsByMonth, SpreadsheetError,
  type Sheet, type Draft, type Target,
} from '../budgetImport';

// ── Import a budget from a spreadsheet ─────────────────────────────────────
//
// Choose a file or paste cells; see every row with the home proposed for it;
// change any of them; then import. Nothing is stored until the last step, and
// that step is one write the user can undo (App.importBudget). The reading
// and the proposals are budgetImport.ts, tested there.

interface Props {
  /** The month on screen: where a one-month list goes. */
  year: number;
  month: number;
  onClose: () => void;
  /** Store the draft; resolves to whether it was stored. */
  onImport: (draft: Draft) => Promise<boolean>;
}

const encode = (t: Target): string =>
  t.kind === 'income' ? 'income'
    : t.kind === 'standard' ? `std:${t.id}`
      : t.kind === 'custom' ? `custom:${t.name}`
        : 'skip';

const decode = (v: string): Target => {
  if (v === 'income') return { kind: 'income' };
  if (v === 'skip') return { kind: 'skip' };
  if (v.startsWith('std:') && isStandardCategoryId(v.slice(4))) return { kind: 'standard', id: v.slice(4) as never };
  return { kind: 'custom', name: v.slice(7) };
};

export const BudgetImport = ({ year, month, onClose, onImport }: Props) => {
  const { t, lang, money } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, true, onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteId = useId();

  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [amountIdx, setAmountIdx] = useState<number | undefined>(undefined);
  /** The user's own choices, by row, over the proposals. */
  const [chosen, setChosen] = useState<Record<string, Target>>({});
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const draft = useMemo<Draft | null>(() => {
    if (!sheets) return null;
    const d = analyse(sheets[sheetIdx].rows, { year, month }, t.bimOther, amountIdx);
    return { ...d, rows: d.rows.map(r => ({ ...r, target: chosen[r.key] ?? r.target })) };
  }, [sheets, sheetIdx, amountIdx, chosen, year, month, t.bimOther]);

  const start = (next: Sheet[]) => {
    const first = analyse(next[0].rows, { year, month }, t.bimOther);
    if (first.columns.length === 0) { setError(t.bimErrNoAmounts); return; }
    if (first.rows.length === 0) { setError(t.bimErrEmpty); return; }
    setError(null);
    setSheets(next);
    setSheetIdx(0);
    setAmountIdx(undefined);
    setChosen({});
  };

  const readFile = async (file: File) => {
    try {
      start(readSpreadsheet(await file.arrayBuffer(), file.name));
    } catch (e) {
      const reason = e instanceof SpreadsheetError ? e.reason : 'unreadable';
      setError(failureText(reason));
    }
  };
  const failureText = (reason: string) => (
    reason === 'too-big' ? t.bimErrTooBig
      : reason === 'too-large-table' ? t.bimErrTooLarge
        : reason === 'empty' ? t.bimErrEmpty : t.bimErrUnreadable);
  const readPaste = () => {
    let rows;
    try {
      rows = readText(paste);
    } catch (e) {
      setError(failureText(e instanceof SpreadsheetError ? e.reason : 'unreadable'));
      return;
    }
    if (rows.length === 0) { setError(t.bimErrEmpty); return; }
    start([{ name: '', rows }]);
  };

  const months = draft ? rowsByMonth(draft) : [];
  const importing = draft ? draft.rows.filter(r => r.target.kind !== 'skip' && r.amounts.some(a => a !== null)) : [];
  const customNames = draft
    ? [...new Set([...draft.rows.flatMap(r => (r.target.kind === 'custom' ? [r.target.name] : [])), t.bimOther])]
    : [];

  const doImport = async () => {
    if (!draft || busy || importing.length === 0) return;
    setBusy(true);
    try {
      if (await onImport(draft)) onClose();
    } finally {
      setBusy(false);
    }
  };

  const where = months.length === 1
    ? t.bimIntoMonth(monthYear(months[0], lang))
    : months.length > 1
      ? t.bimIntoMonths(months.length, monthYear(months[0], lang), monthYear(months[months.length - 1], lang))
      : '';

  // A portal, like the bank import: an ancestor's transform would otherwise
  // anchor this fixed dialog to the tab instead of the screen.
  return createPortal(
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div ref={panel} className="theme-panel csv-panel bim-panel" role="dialog" aria-modal="true" aria-label={t.bimTitle} tabIndex={-1}>
        <div className="csv-head">
          <h2 className="csv-title">{t.bimTitle}</h2>
          <button className="utils-menu-close-btn" onClick={onClose} aria-label={t.themeClose}>✕</button>
        </div>

        <div className="csv-body">
          {error && <p className="csv-error" role="alert">{error}</p>}

          {!draft && (
            <>
              <div
                className="csv-drop"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void readFile(f); }}
              >
                <p className="csv-drop-sub">{t.bimLead}</p>
                <button className="csv-pick" onClick={() => fileRef.current?.click()}>{t.bimPick}</button>
                <input
                  ref={fileRef} type="file" hidden
                  accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,text/plain"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }}
                />
              </div>
              <div className="bim-paste">
                <label htmlFor={pasteId}>{t.bimPasteLabel}</label>
                <textarea
                  id={pasteId} className="label-input" rows={5} value={paste}
                  placeholder={t.bimPastePlaceholder}
                  onChange={e => setPaste(e.target.value)}
                />
                <button className="csv-secondary" disabled={!paste.trim()} onClick={readPaste}>{t.bimRead}</button>
              </div>
            </>
          )}

          {draft && sheets && (
            <>
              <div className="bim-options">
                {sheets.length > 1 && (
                  <label>
                    {t.bimSheet}{' '}
                    <select className="label-input" value={sheetIdx}
                      onChange={e => { setSheetIdx(Number(e.target.value)); setAmountIdx(undefined); setChosen({}); }}>
                      {sheets.map((s, i) => <option key={i} value={i}>{s.name || i + 1}</option>)}
                    </select>
                  </label>
                )}
                {draft.layout === 'list' && draft.amountChoices.length > 1 && (
                  <label>
                    {t.bimAmountColumn}{' '}
                    <select className="label-input" value={draft.columns[0]?.index}
                      onChange={e => { setAmountIdx(Number(e.target.value)); }}>
                      {draft.amountChoices.map(c => (
                        <option key={c.index} value={c.index}>{c.header || t.bimColumn(c.index + 1)}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className="csv-lead">{where}</p>

              <div className="csv-groups">
                {draft.rows.map(r => {
                  const filled = r.amounts.filter(a => a !== null);
                  return (
                    <div className={`csv-group${r.target.kind === 'skip' ? ' is-unset' : ''}`} key={r.key}>
                      <span className="csv-group-text">
                        {r.label}
                        {r.section && <span className="bim-section"> · {r.section}</span>}
                      </span>
                      <span className="csv-group-sum">
                        {draft.layout === 'list'
                          ? (filled.length ? money(filled[0]!) : '–')
                          : t.bimMonthsN(filled.length)}
                      </span>
                      <select
                        className="csv-group-cat"
                        value={encode(r.target)}
                        aria-label={r.label}
                        onChange={e => setChosen(c => ({ ...c, [r.key]: decode(e.target.value) }))}
                      >
                        <option value="skip">{t.bimSkip}</option>
                        <option value="income">{t.followUpIncome}</option>
                        <optgroup label={t.bimStandardGroup}>
                          {STANDARD_CATEGORY_IDS.map(id => {
                            const cat = standardExpenseCategory(id, lang);
                            return cat ? <option key={id} value={`std:${id}`}>{cat.icon} {cat.name}</option> : null;
                          })}
                        </optgroup>
                        <optgroup label={t.bimNewGroup}>
                          {customNames.map(n => <option key={n} value={`custom:${n}`}>+ {n}</option>)}
                        </optgroup>
                      </select>
                    </div>
                  );
                })}
              </div>

              <p className="csv-hint">{t.bimNote}</p>
              <div className="csv-actions">
                <button className="csv-primary" disabled={importing.length === 0 || busy} onClick={() => void doImport()}>
                  {t.bimImportN(importing.length)}
                </button>
                <button className="csv-secondary" onClick={() => { setSheets(null); setChosen({}); setError(null); }}>
                  {t.bimBack}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};
