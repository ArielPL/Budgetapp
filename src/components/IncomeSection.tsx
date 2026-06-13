import type { BudgetRow } from '../types';
import { EditableAmount } from './EditableAmount';
import { EditableLabel } from './EditableLabel';
import { generateId } from '../defaults';

interface Props {
  rows: BudgetRow[];
  onChange: (rows: BudgetRow[]) => void;
}

export const IncomeSection = ({ rows, onChange }: Props) => {
  const updateAmount = (id: string, amount: number) => {
    onChange(rows.map(r => r.id === id ? { ...r, amount } : r));
  };

  const updateLabel = (id: string, label: string) => {
    onChange(rows.map(r => r.id === id ? { ...r, label } : r));
  };

  const addRow = () => {
    onChange([...rows, { id: generateId(), label: 'Ny rad', amount: 0, isCustom: true }]);
  };

  const deleteRow = (id: string) => {
    onChange(rows.filter(r => r.id !== id));
  };

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="budget-section income-section">
      <div className="section-header">
        <span className="section-icon">💵</span>
        <h2 className="section-title">Inkomst</h2>
        <span className="section-total income-total">{total.toLocaleString('sv-SE')} kr</span>
      </div>
      <div className="rows">
        {rows.map(row => (
          <div key={row.id} className="budget-row">
            <EditableLabel value={row.label} onChange={label => updateLabel(row.id, label)} />
            <EditableAmount
              value={row.amount}
              onChange={val => updateAmount(row.id, val)}
              color="#22d3ee"
            />
            {row.isCustom && (
              <button className="delete-btn" onClick={() => deleteRow(row.id)} title="Ta bort rad">×</button>
            )}
          </div>
        ))}
      </div>
      <button className="add-row-btn" onClick={addRow}>+ Lägg till rad</button>
    </section>
  );
};
