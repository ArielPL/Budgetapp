import { daysLeftInMonth, splitRemaining } from '../metrics';
import { useLang, MONTHS } from '../i18n';

interface Props {
  remaining: number; // income − budgeted expenses for the viewed month
  year: number;      // viewed year
  month: number;     // viewed month (0-based)
}

// "Left to live on" — the month's remaining money as a livable pace: per day
// and per week, based on the days LEFT (including today), so it adapts as the
// month progresses. Only rendered for the month we're actually in — a daily
// pace for a past or future month has no meaning.
export const DailyBudget = ({ remaining, year, month }: Props) => {
  const { lang, t, money } = useLang();
  const now = new Date();
  if (year !== now.getFullYear() || month !== now.getMonth()) return null;

  const daysLeft = daysLeftInMonth(now);
  const { perDay, perWeek } = splitRemaining(remaining, daysLeft);
  const tone = perDay < 0 ? ' daily-budget-negative' : '';

  return (
    <div className="daily-budget">
      <div className="daily-budget-head">
        <span className="daily-budget-title">💸 {t.dailyBudgetTitle}</span>
        <span className="daily-budget-days">{t.dailyBudgetDaysLeft(daysLeft, MONTHS[lang][month])}</span>
      </div>
      <div className="daily-budget-tiles">
        <div className="daily-budget-tile">
          <span className="daily-budget-label"><span aria-hidden="true">☀️</span> {t.dailyBudgetPerDay}</span>
          <span className={`daily-budget-value${tone}`}>{money(perDay)}</span>
        </div>
        <div className="daily-budget-tile">
          <span className="daily-budget-label"><span aria-hidden="true">📅</span> {t.dailyBudgetPerWeek}</span>
          <span className={`daily-budget-value${tone}`}>{money(perWeek)}</span>
        </div>
      </div>
    </div>
  );
};
