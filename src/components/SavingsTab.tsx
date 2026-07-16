import type { ReactNode } from 'react';
import type { BudgetCategory } from '../types';
import { loadMonthData } from '../defaults';
import { savedThisMonth } from '../metrics';
import { useLang } from '../i18n';
import { ExpenseCategory } from './ExpenseCategory';
import { GrowthChart } from './GrowthChart';
import { SavingsDonuts } from './SavingsDonuts';

interface Props {
  categories: BudgetCategory[];
  onChange: (cat: BudgetCategory) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  year: number;
  currentMonth: number;
  starterSlot?: ReactNode;
}

// Savings summary cards (saved this month / prev month) + the faint pension box.
// Extracted so the Custom layout's `savings-inputs` block can reuse it.
export const SavingsSummary = ({ categories, year, currentMonth }: {
  categories: BudgetCategory[]; year: number; currentMonth: number;
}) => {
  const { lang, t, money } = useLang();
  const catTotal = (cat: BudgetCategory) => cat.rows.reduce((cs, r) => cs + r.amount, 0);

  // The amounts recorded here are a running BALANCE (what you have), not this
  // month's deposit — so "saved this month" is how far the balance MOVED.
  // Pension is excluded: a separate long-term bucket.
  const balance = categories.reduce(
    (s, cat) => (cat.id === 'pension' ? s : s + catTotal(cat)), 0
  );
  const pensionTotal = categories
    .filter(cat => cat.id === 'pension')
    .reduce((s, cat) => s + catTotal(cat), 0);

  // Previous month's balance — the baseline for this month's change.
  const prevYear = currentMonth === 0 ? year - 1 : year;
  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevData = loadMonthData(prevYear, prevMonthIdx, lang);
  const prevBalance = prevData.savings.reduce(
    (s, cat) => (cat.id === 'pension' ? s : s + cat.rows.reduce((cs, r) => cs + r.amount, 0)), 0
  );
  const saved = savedThisMonth(balance, prevBalance);

  return (
    <div className="savings-summary-wrap">
      <div className="savings-summary">
        <div className="summary-card savings-card">
          <div className="card-label">{t.totalSaved}</div>
          <div className="card-amount">{money(balance)}</div>
        </div>

        <div className="summary-card savings-prev-card">
          <div className="card-label">{t.savedThisMonth}</div>
          <div className="card-amount" style={{ color: saved < 0 ? '#f87171' : undefined }}>
            {saved > 0 ? '+' : ''}{money(saved)}
          </div>
          <div className="card-sub">
            {t.savedPrevMonth}: {money(prevBalance)}
          </div>
        </div>
      </div>

      <div className="savings-pension-card">
        <span className="card-label">{t.pensionBox}</span>
        <span className="card-amount">{money(pensionTotal)}</span>
      </div>
    </div>
  );
};

// The editable savings category list + "add category" button.
export const SavingsCategoryList = ({ categories, onChange, onAddCategory, onDeleteCategory, starterSlot }: {
  categories: BudgetCategory[];
  onChange: (cat: BudgetCategory) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  starterSlot?: ReactNode;
}) => {
  const { t } = useLang();
  return (
    <>
      {categories.map(cat => (
        <ExpenseCategory
          key={cat.id}
          category={cat}
          onChange={onChange}
          onDelete={onDeleteCategory}
          protectedNote={t.protectedSavingsCategory}
        />
      ))}
      <button className="add-category-btn" onClick={onAddCategory}>
        {t.addCategory}
      </button>
      {starterSlot}
    </>
  );
};

export const SavingsTab = ({ categories, onChange, onAddCategory, onDeleteCategory, year, currentMonth, starterSlot }: Props) => {
  return (
    <div className="tab-content">
      {/* Summary cards + separate, faint pension box */}
      <SavingsSummary categories={categories} year={year} currentMonth={currentMonth} />

      {/* Main grid: categories left, charts right */}
      <div className="budget-grid savings-grid">
        <div className="budget-left">
          <SavingsCategoryList
            categories={categories}
            onChange={onChange}
            onAddCategory={onAddCategory}
            onDeleteCategory={onDeleteCategory}
            starterSlot={starterSlot}
          />
        </div>
        <div className="budget-right">
          <GrowthChart year={year} currentMonth={currentMonth} currentSavings={categories} />
          <SavingsDonuts categories={categories} />
        </div>
      </div>
    </div>
  );
};
