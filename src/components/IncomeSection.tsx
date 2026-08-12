import type { BudgetRow } from '../types';
import { EditableAmount } from './EditableAmount';
import { EditableLabel } from './EditableLabel';
import { generateId, shownName } from '../defaults';
import { useLang } from '../i18n';
import { sumRows } from '../metrics';
import { RowPeriodPicker, RowPeriodHint } from './RowPeriod';
import type { RowPeriod } from '../types';

interface Props {
  rows: BudgetRow[];
  onChange: (rows: BudgetRow[]) => void;
}

export const IncomeSection = ({ rows, onChange }: Props) => {
  const { t, lang, money } = useLang();
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

  const total = sumRows(rows);

  return (
    <section className="budget-section income-section">
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
            <RowPeriodPicker row={row} label={shownName(row, lang)}
              onChange={p => updatePeriod(row.id, p)} />
            <RowPeriodHint row={row} />
            {/* Always-present slot keeps every amount on the same right edge —
                see the same pattern in ExpenseCategory. */}
            <span className="row-action">
              {row.isCustom && (
                <button className="delete-btn" onClick={() => deleteRow(row.id)}
                  title={t.deleteRow} aria-label={t.ariaDeleteRow(shownName(row, lang))}>×</button>
              )}
            </span>
          </div>
        ))}
      </div>
      <button className="add-row-btn" onClick={addRow}>{t.addRow}</button>
    </section>
  );
};
