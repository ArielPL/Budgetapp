import { daysInMonth, daysLeftInMonth, splitRemaining } from '../metrics';
import { useLang, MONTHS } from '../i18n';

interface Props {
  remaining: number; // income − budgeted expenses for the viewed month
  year: number;      // viewed year
  month: number;     // viewed month (0-based)
}

// "Left to live on" — the month's remaining money as a livable per-day / per-week
// pace. For the month we're actually in, it divides by the days LEFT (including
// today) so the number adapts as the month passes. For any other month it
// spreads the money across the whole month — a flat planning/retrospective figure.
export const DailyBudget = ({ remaining, year, month }: Props) => {
  const { lang, t, money } = useLang();
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth();

  const days = isCurrent ? daysLeftInMonth(now) : daysInMonth(year, month);
  const { perDay, perWeek } = splitRemaining(remaining, days);
  const tone = perDay < 0 ? ' daily-budget-negative' : '';
  const daysLabel = isCurrent
    ? t.dailyBudgetDaysLeft(days, MONTHS[lang][month])
    : t.dailyBudgetDaysInMonth(days, MONTHS[lang][month]);

  return (
    <div className="daily-budget">
      <div className="daily-budget-head">
        <span className="daily-budget-title">💸 {t.dailyBudgetTitle}</span>
        <span className="daily-budget-days">{daysLabel}</span>
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
