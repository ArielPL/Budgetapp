import type { ReactNode } from 'react';
import type { BudgetCategory } from '../types';
import { loadMonthData } from '../defaults';
import { calculateSavingsMetrics, savedThisMonth } from '../metrics';
import { useLang } from '../i18n';
import { ExpenseCategory } from './ExpenseCategory';
import { GrowthChart } from './GrowthChart';
import { SavingsDonuts } from './SavingsDonuts';

interface Props {
  categories: BudgetCategory[];
  onChange: (cat: BudgetCategory, amountEdited?: boolean) => void;
  onAddCategory: () => void;
  onDeleteCategory: (id: string) => void;
  year: number;
  currentMonth: number;
  /** The month's savingsSnapshotRecorded flag — the components here only get
   *  the category list, and categories alone can't distinguish "template just
   *  created structure" from "balance recorded" (main review §5). */
  snapshotRecorded?: boolean;
  starterSlot?: ReactNode;
}

// Savings summary cards (saved this month / prev month) + the faint pension box.
// Extracted so the Custom layout's `savings-inputs` block can reuse it.
export const SavingsSummary = ({ categories, year, currentMonth, snapshotRecorded }: {
  categories: BudgetCategory[]; year: number; currentMonth: number; snapshotRecorded?: boolean;
}) => {
  const { lang, t, money } = useLang();

  // The amounts recorded here are a running BALANCE (what you have), not this
  // month's deposit — so "saved this month" is how far the balance MOVED.
  // Pension is excluded: a separate long-term bucket. All of that lives in
  // calculateSavingsMetrics; computing it again by hand here is how the rule
  // drifted out of sync with the other tabs in the first place.
  const snapshot = calculateSavingsMetrics({
    income: [], expenses: [], savings: categories,
    savingsSnapshotRecorded: snapshotRecorded,
  });
  const { balance, pension: pensionTotal } = snapshot;

  // Previous month — the baseline for this month's change. An untouched month
  // is unknown, not empty, so `saved` can legitimately be null.
  const prevYear = currentMonth === 0 ? year - 1 : year;
  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
  const prev = calculateSavingsMetrics(loadMonthData(prevYear, prevMonthIdx, lang));
  const saved = savedThisMonth(snapshot, prev);

  return (
    <div className="savings-summary-wrap">
      <div className="savings-summary">
        <div className="summary-card savings-card">
          <div className="card-label">{t.totalSaved}</div>
          <div className="card-amount">
            {snapshot.hasSnapshot ? money(balance) : <span className="amount-unknown">–</span>}
          </div>
        </div>

        <div className="summary-card savings-prev-card">
          <div className="card-label">{t.savedThisMonth}</div>
          {saved === null ? (
            <>
              <div className="card-amount amount-unknown" title={t.notRecordedHint}>–</div>
              <div className="card-sub">{t.notRecorded}</div>
            </>
          ) : (
            <>
              <div className="card-amount" style={{ color: saved < 0 ? '#f87171' : undefined }}>
                {saved > 0 ? '+' : ''}{money(saved)}
              </div>
              <div className="card-sub">
                {t.savedPrevMonth}: {money(prev.balance)}
              </div>
            </>
          )}
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
  onChange: (cat: BudgetCategory, amountEdited?: boolean) => void;
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

export const SavingsTab = ({ categories, onChange, onAddCategory, onDeleteCategory, year, currentMonth, snapshotRecorded, starterSlot }: Props) => {
  return (
    <div className="tab-content">
      {/* Summary cards + separate, faint pension box */}
      <SavingsSummary categories={categories} year={year} currentMonth={currentMonth} snapshotRecorded={snapshotRecorded} />

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
          <GrowthChart year={year} currentMonth={currentMonth} currentSavings={categories} currentSnapshotRecorded={snapshotRecorded} />
          <SavingsDonuts categories={categories} />
        </div>
      </div>
    </div>
  );
};
