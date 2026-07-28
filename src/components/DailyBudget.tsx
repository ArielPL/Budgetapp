import { daysInMonth, splitRemaining } from '../metrics';
import { useLang, MONTHS, formatMoneyCompact } from '../i18n';

interface Props {
  remaining: number; // income − budgeted expenses for the viewed month
  year: number;      // viewed year
  month: number;     // viewed month (0-based)
}

// "Left to live on" — what's left spread evenly across the WHOLE month, so it
// answers "what can I spend per day this month?" and stays put from the 1st to
// the 31st.
//
// It used to divide by the days REMAINING in the current month, which inverted
// the meaning: the fewer days left, the bigger the number. On 28 July, 5 968 kr
// with 4 days left read as 1 492 kr/day and 10 444 kr/week — a spending pace
// nobody could act on, and one that climbed precisely as the month ran out.
// Dividing by the month's real length is a budget; dividing by what's left is a
// burn-down, and that's a separate (planned) feature.
export const DailyBudget = ({ remaining, year, month }: Props) => {
  const { lang, t, money, currency } = useLang();

  const days = daysInMonth(year, month);
  const { perDay, perWeek } = splitRemaining(remaining, days);
  const tone = perDay < 0 ? ' daily-budget-negative' : '';
  // Billion-class figures compact like the summary cards — a 12-digit expense
  // made the per-day tile the last element still widening the page at 320px.
  const tileMoney = (n: number) =>
    Math.abs(n) >= 1e9
      ? <span title={money(n)}>{formatMoneyCompact(n, currency, lang)}</span>
      : money(n);
  const daysLabel = t.dailyBudgetDaysInMonth(days, MONTHS[lang][month]);

  return (
    <div className="daily-budget">
      <div className="daily-budget-head">
        <span className="daily-budget-title">💸 {t.dailyBudgetTitle}</span>
        <span className="daily-budget-days">{daysLabel}</span>
      </div>
      <div className="daily-budget-tiles">
        <div className="daily-budget-tile">
          <span className="daily-budget-label"><span aria-hidden="true">☀️</span> {t.dailyBudgetPerDay}</span>
          <span className={`daily-budget-value${tone}`}>{tileMoney(perDay)}</span>
        </div>
        <div className="daily-budget-tile">
          <span className="daily-budget-label"><span aria-hidden="true">📅</span> {t.dailyBudgetPerWeek}</span>
          <span className={`daily-budget-value${tone}`}>{tileMoney(perWeek)}</span>
        </div>
      </div>
    </div>
  );
};
