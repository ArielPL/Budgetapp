import { useState, type CSSProperties } from 'react';
import type { BudgetCategory, BudgetRow } from '../types';
import { EditableAmount } from './EditableAmount';
import { EditableLabel } from './EditableLabel';
import { generateId, shownName, CATEGORY_ICONS, CATEGORY_PALETTE, isProtectedCategory } from '../defaults';
import { useLang, formatMoneyCompact } from '../i18n';
import { categoryTotal } from '../metrics';
import { RowPeriodPicker, RowPeriodHint } from './RowPeriod';
import type { RowPeriod } from '../types';

interface Props {
  category: BudgetCategory;
  /** `amountEdited` is true only when the change was a ROW AMOUNT edit — the
   *  savings flow uses it to tell "the user recorded a balance" (even a 0)
   *  apart from structural edits like renames and added rows, which must never
   *  count as a recorded balance. Other consumers can ignore it. */
  onChange: (cat: BudgetCategory, amountEdited?: boolean) => void;
  onDelete?: (id: string) => void;
  /** Note shown for protected categories; defaults to the Plan-linked message. */
  protectedNote?: string;
  /**
   * What the amounts on these rows MEAN.
   *
   * `flow` (budget income and expenses) — money moving this month, so a row can
   * say how often it falls due. The total still counts every row in full; the
   * period is a label, not a divisor.
   *
   * `balance` (the Savings tab) — what is in the account right now. "Charged
   * yearly" says nothing about a balance, so no period control is offered.
   * Without this the savings tab inherited the picker and showed 12 000 kr and
   * 1 000 kr for the same account at the same time.
   */
  amountKind?: 'flow' | 'balance';
}

export const ExpenseCategory = ({ category, onChange, onDelete, protectedNote, amountKind = 'flow' }: Props) => {
  const { t, lang, money, currency } = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);

  const protectedCat = isProtectedCategory(category.id);

  const updateAmount = (id: string, amount: number) => {
    onChange({ ...category, rows: category.rows.map(r => r.id === id ? { ...r, amount } : r) }, true);
  };

  const updatePeriod = (id: string, period: RowPeriod | undefined) => {
    onChange({ ...category, rows: category.rows.map(r => r.id === id ? { ...r, period } : r) });
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

  // Every row now counts exactly what it says, so both kinds sum identically.
  // The distinction survives for the PICKER: a savings row holds a balance, and
  // "charged yearly" is meaningless for what is sitting in an account today.
  const isBalance = amountKind === 'balance';
  const total = categoryTotal(category);

  return (
    <section className="budget-section expense-section" style={{ '--accent': category.color } as CSSProperties}>
      <div className="section-header">
        {/* Decorative: collapsing is owned by the collapse-arrow button, so the
            icon is hidden from AT rather than being a keyboard-dead click trap. */}
        <span className="section-icon" aria-hidden="true">
          {category.icon}
        </span>
        {/* title= carries the full name when the ellipsis truncates it on
            narrow screens. Clicking stays as a pointer shortcut; the
            collapse-arrow button is the accessible control. */}
        <h2
          className="section-title"
          title={shownName(category, lang)}
          onClick={() => setCollapsed(c => !c)}
          style={{ cursor: 'pointer' }}
        >
          {shownName(category, lang)}
        </h2>
        {/* Billion-class totals compact ("10 md kr") so the amount can't
            squeeze the category name out of a narrow header; the exact figure
            stays reachable via title= (main review §12). */}
        <span
          className="section-total"
          style={{ color: category.color }}
          title={Math.abs(total) >= 1e9 ? money(total) : undefined}
        >
          {Math.abs(total) >= 1e9 ? formatMoneyCompact(total, currency, lang) : money(total)}
        </span>
        <button
          className="cat-edit-btn"
          onClick={() => setEditing(e => !e)}
          title={t.editCategory}
          aria-label={t.ariaEditCategory(shownName(category, lang))}
          style={{ color: editing ? category.color : undefined }}
        >
          ✎
        </button>
        <button
          className="collapse-arrow"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed
            ? t.ariaExpand(shownName(category, lang))
            : t.ariaCollapse(shownName(category, lang))}
          aria-expanded={!collapsed}
          style={{ color: category.color, cursor: 'pointer', background: 'none', border: 'none', font: 'inherit', padding: 0 }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
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
              <span className="cat-protected-note">{protectedNote ?? t.protectedCategory}</span>
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
                  label={shownName(row, lang)}
                />
                {/* The slot is always here, empty or not, so every amount in
                    the category ends at the same right edge — otherwise rows
                    with a delete button sat 34px to the left of the ones
                    without, and the column looked ragged. */}
                {!isBalance && (
                  <span className="row-period-group">
                    <RowPeriodPicker row={row} label={shownName(row, lang)}
                      onChange={p => updatePeriod(row.id, p)} />
                    <RowPeriodHint row={row} />
                  </span>
                )}
                <span className="row-action">
                  {row.isCustom && (
                    <button className="delete-btn" onClick={() => deleteRow(row.id)}
                      title={t.deleteRow} aria-label={t.ariaDeleteRow(shownName(row, lang))}>×</button>
                  )}
                </span>
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
