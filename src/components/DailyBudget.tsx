import { splitRemaining } from '../metrics';
import { periodDays, periodRange, type PeriodLocks } from '../periodLabel';
import { useLang, MONTHS, formatMoneyCompact } from '../i18n';
import { inSentence, formatPeriodRange } from '../dateLabel';

interface Props {
  remaining: number; // income − budgeted expenses for the viewed month
  year: number;      // viewed year
  month: number;     // viewed month (0-based)
  /** The pay period's start day, or null for plain calendar months. The budget
   *  month is what this tile divides by, and for anyone paid on the 25th that
   *  is not the calendar month — see periodDays. */
  periodStartDay?: number | null;
  periodLocks?: PeriodLocks;
  /** Make a wallet of the week's or the month's amount (Ariel, 2026-10-18):
   *  a plan for the month's everyday spending. Absent where the tile is only
   *  information — the Custom panel's copy of it. */
  onMakeWallet?: (span: 'week' | 'month', amount: number) => void;
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
export const DailyBudget = ({ remaining, year, month, periodStartDay = null, periodLocks = {}, onMakeWallet }: Props) => {
  const { lang, t, money, currency } = useLang();

  const days = periodDays(year, month, periodStartDay, periodLocks);
  const { perDay, perWeek } = splitRemaining(remaining, days);
  const tone = perDay < 0 ? ' daily-budget-negative' : '';
  // Billion-class figures compact like the summary cards — a 12-digit expense
  // made the per-day tile the last element still widening the page at 320px.
  const tileMoney = (n: number) =>
    Math.abs(n) >= 1e9
      ? <span title={money(n)}>{formatMoneyCompact(n, currency, lang)}</span>
      : money(n);
  // Mid-sentence: "repartido en octubre", not "en Octubre". With a pay period
  // the days are the PERIOD's, so the period is what it names: "25 aug – 24 sep
  // (31 dagar)". It said "september (31 dagar)", and September has 30 (Ariel,
  // 2026-10-18).
  const usesPeriod = periodStartDay !== null || Object.keys(periodLocks).length > 0;
  const spanName = usesPeriod
    ? formatPeriodRange(periodRange(year, month, periodStartDay ?? 1, periodLocks), lang)
    : inSentence(MONTHS[lang][month], lang);
  const daysLabel = t.dailyBudgetDaysInMonth(days, spanName);
  // A wallet needs money to plan with; a month already over budget has none.
  const canMake = onMakeWallet !== undefined && perDay > 0;
  const tile = (icon: string, label: string, amount: number, span?: 'week' | 'month') => {
    const body = (
      <>
        <span className="daily-budget-label"><span aria-hidden="true">{icon}</span> {label}</span>
        <span className={`daily-budget-value${tone}`}>{tileMoney(amount)}</span>
        {span && canMake && <span className="daily-budget-make" aria-hidden="true">{t.dailyBudgetToWallet}</span>}
      </>
    );
    return span && canMake
      ? (
        <button type="button" className={`daily-budget-tile daily-budget-tile-btn${span === 'month' ? ' daily-budget-tile-month' : ''}`}
          aria-label={`${label}: ${money(amount)}. ${t.dailyBudgetWalletAria(money(amount))}`}
          onClick={() => onMakeWallet?.(span, amount)}>
          {body}
        </button>
      )
      : <div className={`daily-budget-tile${span === 'month' ? ' daily-budget-tile-month' : ''}`}>{body}</div>;
  };

  return (
    <div className="daily-budget" data-guide="leftToLive">
      <div className="daily-budget-head">
        <span className="daily-budget-title">💸 {t.dailyBudgetTitle}</span>
        <span className="daily-budget-days">{daysLabel}</span>
      </div>
      <div className="daily-budget-tiles">
        {tile('☀️', t.dailyBudgetPerDay, perDay)}
        {tile('📅', t.dailyBudgetPerWeek, perWeek, 'week')}
        {tile('🗓️', t.dailyBudgetPerMonth, remaining, 'month')}
      </div>
    </div>
  );
};
