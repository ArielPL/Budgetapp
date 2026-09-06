import { loadMonthData } from '../defaults';
import { calculateBudgetMetrics } from '../metrics';
import { useLang, formatMoneyCompact } from '../i18n';
import type { Translations } from '../i18n';

interface Props {
  totalIncome: number;
  totalExpenses: number;
  year: number;
  month: number;
}

function Diff({ current, prev, t, money, lowerIsBetter = false }: { current: number; prev: number; t: Translations; money: (n: number) => string; lowerIsBetter?: boolean }) {
  if (prev === 0) return null;
  const delta = current - prev;
  if (delta === 0) return <div className="card-sub">{t.samePrevMonth}</div>;
  const positive = lowerIsBetter ? delta < 0 : delta > 0;
  // Theme tokens, not fixed greens/reds: these sit on a TINTED card, where a
  // hardcoded #22c55e measured about 2:1. The tint pairs are contrast-checked
  // per palette (9.5–12.5:1) and adapt to light and dark.
  return (
    <div className={`card-sub ${positive ? 'card-sub-positive' : 'card-sub-deficit'}`}>
      {delta > 0 ? '+' : ''}{money(delta)} {t.vsPrev}
    </div>
  );
}

export const SummaryCards = ({ totalIncome, totalExpenses, year, month }: Props) => {
  const { lang, t, money, currency } = useLang();
  // Billions don't fit a phone-width card: compact them ("10 md kr" / "$10B")
  // and keep the exact figure reachable via title= and the accessible name.
  const cardMoney = (n: number) =>
    Math.abs(n) >= 1e9
      ? <span title={money(n)} aria-label={money(n)}>{formatMoneyCompact(n, currency, lang)}</span>
      : money(n);
  // An amount this long overflows its card on the narrowest screens. Measured
  // at 320px, where a card gives the amount 122px: 14 characters still fit at
  // the normal 0.95rem ("999 999 999 kr" needs 105px), 17 needs 130px and the
  // longest possible ("+999 999 999,50 kr") needs 140px. So the step-down is
  // for hundreds of millions WITH öre and nothing else — ordinary amounts,
  // including a salary with öre, keep the full size.
  const LONG_AMOUNT_CHARS = 15;
  // Only the plain form can get long: a compacted billion is "1,0 md kr".
  const longAmount = (n: number, prefix = '') =>
    Math.abs(n) < 1e9 && (prefix + money(n)).length >= LONG_AMOUNT_CHARS
      ? ' card-amount-long'
      : '';
  const remaining = totalIncome - totalExpenses;
  // Exactly 0 is NOT a deficit — you're on budget, which is a fine place to be.
  const isDeficit = remaining < 0;
  // Share of income NOT consumed by budgeted expenses. This is money left over,
  // not money actually moved to savings — so it's labelled as such (the real
  // savings rate lives in the Plan tab, computed from the Savings tab).
  const leftoverRate = totalIncome > 0
    ? Math.max(0, Math.round((remaining / totalIncome) * 100))
    : 0;

  // Load previous month
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prev = loadMonthData(prevYear, prevMonth, lang);
  const { income: prevIncome, expenses: prevExpenses } = calculateBudgetMetrics(prev);
  const prevRemaining = prevIncome - prevExpenses;

  return (
    <div className="summary-cards">
      <div className="summary-card income-card">
        <div className="card-label">{t.income}</div>
        <div className={`card-amount income-amount${longAmount(totalIncome)}`}>{cardMoney(totalIncome)}</div>
        <Diff current={totalIncome} prev={prevIncome} t={t} money={money} />
      </div>
      <div className="summary-card expense-card">
        <div className="card-label">{t.expenses}</div>
        <div className={`card-amount expense-amount${longAmount(totalExpenses)}`}>{cardMoney(totalExpenses)}</div>
        <Diff current={totalExpenses} prev={prevExpenses} t={t} money={money} lowerIsBetter />
      </div>
      {/* Overspending gets its own semantic state. The card used to keep the
          green "money left" background and a green "0% left after budgeted
          expenses" line even at −16 500 kr, so a deficit read as partly
          positive — and that green on green measured ~1.99:1 (main review §6).
          The deficit tokens are the theme's own negative pair, tuned per
          palette, so every palette stays legible in both modes. */}
      <div className={`summary-card remaining-card ${isDeficit ? 'is-deficit' : 'is-positive'}`}>
        <div className="card-label">{t.remaining}</div>
        <div className={`card-amount ${isDeficit ? 'negative-amount' : 'positive-amount'}${longAmount(remaining, isDeficit ? '' : '+')}`}>
          {isDeficit ? '' : '+'}{cardMoney(remaining)}
        </div>
        {totalIncome > 0 && (
          <div className={`card-sub ${isDeficit ? 'card-sub-deficit' : 'card-sub-positive'}`}>
            {Math.round((totalExpenses / totalIncome) * 100)}% {t.pctOfIncome}
          </div>
        )}
        {totalIncome > 0 && (
          // In deficit the words carry the meaning, not just the colour.
          <div className={`card-sub ${isDeficit ? 'card-sub-deficit' : 'card-sub-positive'}`}>
            {isDeficit
              ? t.deficitOverBudget(Math.round((-remaining / totalIncome) * 100))
              : t.leftAfterBudget(leftoverRate)}
          </div>
        )}
        {isDeficit && (
          <div className="card-sub card-sub-deficit">{t.deficitAmount(money(-remaining))}</div>
        )}
        <Diff current={remaining} prev={prevRemaining} t={t} money={money} />
      </div>
    </div>
  );
};
