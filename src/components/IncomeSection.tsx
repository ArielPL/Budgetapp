import { useState } from 'react';
import type { BudgetRow } from '../types';
import { EditableAmount } from './EditableAmount';
import { EditableLabel } from './EditableLabel';
import { generateId, shownName } from '../defaults';
import { useLang } from '../i18n';
import { sumRows } from '../metrics';
import { RowPeriodPicker } from './RowPeriod';
import { RowNoteButton, RowNoteLine } from './RowNote';
import type { RowPeriod } from '../types';

interface Props {
  rows: BudgetRow[];
  onChange: (rows: BudgetRow[]) => void;
}

export const IncomeSection = ({ rows, onChange }: Props) => {
  const { t, lang, money } = useLang();
  /** The row whose note is being written, if any. */
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const updateAmount = (id: string, amount: number) => {
    onChange(rows.map(r => r.id === id ? { ...r, amount } : r));
  };

  const updateLabel = (id: string, label: string) => {
    onChange(rows.map(r => r.id === id ? { ...r, label, userNamed: true } : r));
  };

  const addRow = () => {
    onChange([...rows, { id: generateId(), label: t.newRow, amount: 0, isCustom: true }]);
  };

  const deleteRow = (id: string) => {
    onChange(rows.filter(r => r.id !== id));
  };

  const updatePeriod = (id: string, period: RowPeriod | undefined) => {
    onChange(rows.map(r => r.id === id ? { ...r, period } : r));
  };

  const updateNote = (id: string, note: string | undefined) => {
    onChange(rows.map(r => r.id === id ? { ...r, note } : r));
  };

  const total = sumRows(rows);

  return (
    <section className="budget-section income-section" data-guide="income">
      <div className="section-header">
        <span className="section-icon">💵</span>
        <h2 className="section-title">{t.incomeSection}</h2>
        <span className="section-total income-total">{money(total)}</span>
      </div>
      <div className="rows">
        {rows.map(row => (
          <div key={row.id} className="budget-row">
            <EditableLabel value={shownName(row, lang)} onChange={label => updateLabel(row.id, label)} />
            <EditableAmount
              value={row.amount}
              onChange={val => updateAmount(row.id, val)}
              color="#22d3ee"
              label={shownName(row, lang)}
            />
            <span className="row-period-group">
              <RowNoteButton row={row} label={shownName(row, lang)} open={noteOpen === row.id}
                onToggle={() => setNoteOpen(o => (o === row.id ? null : row.id))} />
              <RowPeriodPicker row={row} label={shownName(row, lang)}
                onChange={p => updatePeriod(row.id, p)} />
            </span>
            {/* Always-present slot keeps every amount on the same right edge —
                see the same pattern in ExpenseCategory. */}
            <span className="row-action">
              {/* Every row, the template's too: someone with no car or mortgage must
                  be able to remove them (tester, 2026-10-19). Undoable like any removal. */}
              <button className="delete-btn" onClick={() => deleteRow(row.id)}
                title={t.deleteRow} aria-label={t.ariaDeleteRow(shownName(row, lang))}>×</button>
            </span>
            <RowNoteLine row={row} label={shownName(row, lang)} open={noteOpen === row.id}
              onOpen={() => setNoteOpen(row.id)} onClose={() => setNoteOpen(null)}
              onSave={note => updateNote(row.id, note)} />
          </div>
        ))}
      </div>
      <button className="add-row-btn" onClick={addRow}>{t.addRow}</button>
    </section>
  );
};
