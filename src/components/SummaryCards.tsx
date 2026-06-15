import { loadMonthData } from '../defaults';
import { useLang } from '../i18n';
import type { Translations } from '../i18n';

interface Props {
  totalIncome: number;
  totalExpenses: number;
  year: number;
  month: number;
}

function Diff({ current, prev, t, lowerIsBetter = false }: { current: number; prev: number; t: Translations; lowerIsBetter?: boolean }) {
  if (prev === 0) return null;
  const delta = current - prev;
  if (delta === 0) return <div className="card-sub" style={{ color: '#64748b' }}>{t.samePrevMonth}</div>;
  const positive = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className="card-sub" style={{ color: positive ? '#22c55e' : '#f87171' }}>
      {delta > 0 ? '+' : ''}{delta.toLocaleString('sv-SE')} kr {t.vsPrev}
    </div>
  );
}

export const SummaryCards = ({ totalIncome, totalExpenses, year, month }: Props) => {
  const { lang, t } = useLang();
  const remaining = totalIncome - totalExpenses;
  const isPositive = remaining >= 0;

  // Load previous month
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prev = loadMonthData(prevYear, prevMonth, lang);
  const prevIncome = prev.income.reduce((s, r) => s + r.amount, 0);
  const prevExpenses = prev.expenses.reduce(
    (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
  );
  const prevRemaining = prevIncome - prevExpenses;

  return (
    <div className="summary-cards">
      <div className="summary-card income-card">
        <div className="card-label">{t.income}</div>
        <div className="card-amount income-amount">{totalIncome.toLocaleString('sv-SE')} kr</div>
        <Diff current={totalIncome} prev={prevIncome} t={t} />
      </div>
      <div className="summary-card expense-card">
        <div className="card-label">{t.expenses}</div>
        <div className="card-amount expense-amount">{totalExpenses.toLocaleString('sv-SE')} kr</div>
        <Diff current={totalExpenses} prev={prevExpenses} t={t} lowerIsBetter />
      </div>
      <div className="summary-card remaining-card">
        <div className="card-label">{t.remaining}</div>
        <div className={`card-amount ${isPositive ? 'positive-amount' : 'negative-amount'}`}>
          {isPositive ? '+' : ''}{remaining.toLocaleString('sv-SE')} kr
        </div>
        {totalIncome > 0 && (
          <div className="card-sub" style={{ color: '#64748b' }}>
            {Math.round((totalExpenses / totalIncome) * 100)}% {t.pctOfIncome}
          </div>
        )}
        <Diff current={remaining} prev={prevRemaining} t={t} />
      </div>
    </div>
  );
};
