import { useState, type CSSProperties } from 'react';
import type { BudgetCategory, BudgetRow } from '../types';
import { EditableAmount } from './EditableAmount';
import { EditableLabel } from './EditableLabel';
import { generateId, shownName, CATEGORY_ICONS, CATEGORY_PALETTE, isProtectedCategory } from '../defaults';
import { useLang } from '../i18n';

interface Props {
  category: BudgetCategory;
  onChange: (cat: BudgetCategory) => void;
  onDelete?: (id: string) => void;
}

export const ExpenseCategory = ({ category, onChange, onDelete }: Props) => {
  const { t, lang } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);

  const protectedCat = isProtectedCategory(category.id);

  const updateAmount = (id: string, amount: number) => {
    onChange({ ...category, rows: category.rows.map(r => r.id === id ? { ...r, amount } : r) });
  };

  const updateLabel = (id: string, label: string) => {
    onChange({ ...category, rows: category.rows.map(r => r.id === id ? { ...r, label, userNamed: true } : r) });
  };

  const addRow = () => {
    const newRow: BudgetRow = { id: generateId(), label: t.newRow, amount: 0, isCustom: true };
    onChange({ ...category, rows: [...category.rows, newRow] });
  };

  const deleteRow = (id: string) => {
    onChange({ ...category, rows: category.rows.filter(r => r.id !== id) });
  };

  const handleDelete = () => {
    if (window.confirm(t.deleteCategoryConfirm(shownName(category, lang)))) {
      onDelete?.(category.id);
    }
  };

  const total = category.rows.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="budget-section expense-section" style={{ '--accent': category.color } as CSSProperties}>
      <div className="section-header">
        <span
          className="section-icon"
          onClick={() => setCollapsed(c => !c)}
          style={{ cursor: 'pointer' }}
        >
          {category.icon}
        </span>
        <h2
          className="section-title"
          onClick={() => setCollapsed(c => !c)}
          style={{ cursor: 'pointer' }}
        >
          {shownName(category, lang)}
        </h2>
        <span className="section-total" style={{ color: category.color }}>
          {total.toLocaleString('sv-SE')} kr
        </span>
        <button
          className="cat-edit-btn"
          onClick={() => setEditing(e => !e)}
          title={t.editCategory}
          style={{ color: editing ? category.color : undefined }}
        >
          ✎
        </button>
        <span
          className="collapse-arrow"
          onClick={() => setCollapsed(c => !c)}
          style={{ color: category.color, cursor: 'pointer' }}
        >
          {collapsed ? '▸' : '▾'}
        </span>
      </div>

      {editing && (
        <div className="cat-edit-panel">
          <input
            className="label-input cat-name-input"
            value={shownName(category, lang)}
            placeholder={t.categoryName}
            onChange={e => onChange({ ...category, name: e.target.value, userNamed: true })}
          />
          <div className="cat-edit-field">
            <span className="cat-edit-label">{t.chooseIcon}</span>
            <div className="cat-icon-grid">
              {CATEGORY_ICONS.map(ic => (
                <button
                  key={ic}
                  className={`cat-icon-swatch${category.icon === ic ? ' selected' : ''}`}
                  onClick={() => onChange({ ...category, icon: ic })}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="cat-edit-field">
            <span className="cat-edit-label">{t.chooseColor}</span>
            <div className="cat-color-grid">
              {CATEGORY_PALETTE.map(c => (
                <button
                  key={c}
                  className={`cat-color-swatch${category.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => onChange({ ...category, color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="cat-edit-actions">
            {protectedCat ? (
              <span className="cat-protected-note">{t.protectedCategory}</span>
            ) : (
              onDelete && (
                <button className="cat-delete-btn" onClick={handleDelete}>
                  🗑 {t.deleteCategory}
                </button>
              )
            )}
            <button className="cat-done-btn" onClick={() => setEditing(false)}>
              {t.doneEditing}
            </button>
          </div>
        </div>
      )}

      {!collapsed && (
        <>
          <div className="rows">
            {category.rows.map(row => (
              <div key={row.id} className="budget-row">
                <EditableLabel value={shownName(row, lang)} onChange={label => updateLabel(row.id, label)} />
                <EditableAmount
                  value={row.amount}
                  onChange={val => updateAmount(row.id, val)}
                  color={category.color}
                />
                {row.isCustom && (
                  <button className="delete-btn" onClick={() => deleteRow(row.id)} title={t.deleteRow}>×</button>
                )}
              </div>
            ))}
          </div>
          <button className="add-row-btn" onClick={addRow} style={{ color: category.color }}>
            {t.addRow}
          </button>
        </>
      )}
    </section>
  );
};
