import type { BudgetCategory } from '../types';
import { loadMonthData } from '../defaults';
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
}

export const SavingsTab = ({ categories, onChange, onAddCategory, onDeleteCategory, year, currentMonth }: Props) => {
  const { lang, t } = useLang();
  const total = categories.reduce(
    (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
  );

  // Previous month total for comparison
  const prevYear = currentMonth === 0 ? year - 1 : year;
  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevData = loadMonthData(prevYear, prevMonthIdx, lang);
  const prevTotal = prevData.savings.reduce(
    (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
  );
  const diff = total - prevTotal;

  return (
    <div className="tab-content">
      {/* Summary cards */}
      <div className="savings-summary">
        <div className="summary-card savings-card">
          <div className="card-label">{t.savedThisMonth}</div>
          <div className="card-amount" style={{ color: '#22d3ee' }}>
            {total.toLocaleString('sv-SE')} kr
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">{t.savedPrevMonth}</div>
          <div className="card-amount" style={{ color: '#94a3b8' }}>
            {prevTotal.toLocaleString('sv-SE')} kr
          </div>
          {prevTotal > 0 && total > 0 && (
            <div className="card-sub" style={{ color: diff >= 0 ? '#22c55e' : '#f87171' }}>
              {diff >= 0 ? '+' : ''}{diff.toLocaleString('sv-SE')} kr {t.vsPrev}
            </div>
          )}
        </div>
      </div>

      {/* Main grid: categories left, charts right */}
      <div className="budget-grid savings-grid">
        <div className="budget-left">
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
        </div>
        <div className="budget-right">
          <GrowthChart year={year} currentMonth={currentMonth} currentSavings={categories} />
          <SavingsDonuts categories={categories} />
        </div>
      </div>
    </div>
  );
};
