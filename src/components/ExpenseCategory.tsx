import { useState, type CSSProperties } from 'react';
import type { BudgetCategory, BudgetRow } from '../types';
import { EditableAmount } from './EditableAmount';
import { EditableLabel } from './EditableLabel';
import { generateId } from '../defaults';

interface Props {
  category: BudgetCategory;
  onChange: (cat: BudgetCategory) => void;
}

export const ExpenseCategory = ({ category, onChange }: Props) => {
  const [collapsed, setCollapsed] = useState(false);

  const updateAmount = (id: string, amount: number) => {
    onChange({ ...category, rows: category.rows.map(r => r.id === id ? { ...r, amount } : r) });
  };

  const updateLabel = (id: string, label: string) => {
    onChange({ ...category, rows: category.rows.map(r => r.id === id ? { ...r, label } : r) });
  };

  const addRow = () => {
    const newRow: BudgetRow = { id: generateId(), label: 'Ny rad', amount: 0, isCustom: true };
    onChange({ ...category, rows: [...category.rows, newRow] });
  };

  const deleteRow = (id: string) => {
    onChange({ ...category, rows: category.rows.filter(r => r.id !== id) });
  };

  const total = category.rows.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="budget-section expense-section" style={{ '--accent': category.color } as CSSProperties}>
      <div className="section-header" onClick={() => setCollapsed(c => !c)} style={{ cursor: 'pointer' }}>
        <span className="section-icon">{category.icon}</span>
        <h2 className="section-title">{category.name}</h2>
        <span className="section-total" style={{ color: category.color }}>
          {total.toLocaleString('sv-SE')} kr
        </span>
        <span className="collapse-arrow" style={{ color: category.color }}>{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <>
          <div className="rows">
            {category.rows.map(row => (
              <div key={row.id} className="budget-row">
                <EditableLabel value={row.label} onChange={label => updateLabel(row.id, label)} />
                <EditableAmount
                  value={row.amount}
                  onChange={val => updateAmount(row.id, val)}
                  color={category.color}
                />
                {row.isCustom && (
                  <button className="delete-btn" onClick={() => deleteRow(row.id)} title="Ta bort rad">×</button>
                )}
              </div>
            ))}
          </div>
          <button className="add-row-btn" onClick={addRow} style={{ color: category.color }}>
            + Lägg till rad
          </button>
        </>
      )}
    </section>
  );
};
