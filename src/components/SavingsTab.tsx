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
  const catTotal = (cat: BudgetCategory) => cat.rows.reduce((cs, r) => cs + r.amount, 0);

  // "Saved" totals exclude pension — pension is tracked as a separate long-term bucket.
  const total = categories.reduce(
    (s, cat) => (cat.id === 'pension' ? s : s + catTotal(cat)), 0
  );
  const pensionTotal = categories
    .filter(cat => cat.id === 'pension')
    .reduce((s, cat) => s + catTotal(cat), 0);

  // Previous month total for comparison (also excludes pension)
  const prevYear = currentMonth === 0 ? year - 1 : year;
  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevData = loadMonthData(prevYear, prevMonthIdx, lang);
  const prevTotal = prevData.savings.reduce(
    (s, cat) => (cat.id === 'pension' ? s : s + cat.rows.reduce((cs, r) => cs + r.amount, 0)), 0
  );
  const diff = total - prevTotal;

  return (
    <div className="tab-content">
      {/* Summary cards + separate, faint pension box */}
      <div className="savings-summary-wrap">
        <div className="savings-summary">
          <div className="summary-card savings-card">
            <div className="card-label">{t.savedThisMonth}</div>
            <div className="card-amount">
              {total.toLocaleString('sv-SE')} kr
            </div>
          </div>

          <div className="summary-card savings-prev-card">
            <div className="card-label">{t.savedPrevMonth}</div>
            <div className="card-amount">
              {prevTotal.toLocaleString('sv-SE')} kr
            </div>
            {prevTotal > 0 && total > 0 && (
              <div className="card-sub" style={{ color: diff >= 0 ? '#22c55e' : '#f87171' }}>
                {diff >= 0 ? '+' : ''}{diff.toLocaleString('sv-SE')} kr {t.vsPrev}
              </div>
            )}
          </div>
        </div>

        <div className="savings-pension-card">
          <span className="card-label">{t.pensionBox}</span>
          <span className="card-amount">{pensionTotal.toLocaleString('sv-SE')} kr</span>
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
