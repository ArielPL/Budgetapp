import type { BudgetRow, RowPeriod as Period } from '../types';
import { ROW_PERIODS, rowMonthly } from '../metrics';
import { useLang } from '../i18n';

// How often a row's amount actually falls due. Opt-in per row: leave it alone
// and the row is monthly, which is what every row was before this existed.
//
// The AMOUNT FIELD keeps showing what the user typed (4 800 for a yearly
// insurance) — that is the figure they know and the one they will edit. Only the
// TOTALS use the monthly share, and the hint below spells that out so the two
// numbers on screen never look like a contradiction.

const LABELS: Record<Period, keyof ReturnType<typeof useLang>['t']> = {
  month: 'periodMonth', quarter: 'periodQuarter', year: 'periodYear',
};

export const RowPeriodPicker = ({ row, label, onChange }: {
  row: BudgetRow;
  /** Display name of the row, for the accessible label. */
  label: string;
  onChange: (period: Period | undefined) => void;
}) => {
  const { t } = useLang();
  const current: Period = row.period ?? 'month';
  return (
    <select
      className={`row-period${row.period ? ' row-period-set' : ''}`}
      value={current}
      aria-label={t.periodAria(label)}
      onChange={e => {
        const next = e.target.value as Period;
        // Monthly is the absence of a period, not a stored value — that keeps a
        // row the user never touched byte-identical to how it has always been.
        onChange(next === 'month' ? undefined : next);
      }}
    >
      {ROW_PERIODS.map(p => (
        <option key={p} value={p}>{t[LABELS[p]] as string}</option>
      ))}
    </select>
  );
};

/** "= 400 kr/mån" under a periodised amount. Nothing for a monthly row — there
 *  would be no second number to explain. */
export const RowPeriodHint = ({ row }: { row: BudgetRow }) => {
  const { t, money } = useLang();
  if (!row.period) return null;
  return <span className="row-period-hint">{t.periodMonthlyShare(money(rowMonthly(row)))}</span>;
};
