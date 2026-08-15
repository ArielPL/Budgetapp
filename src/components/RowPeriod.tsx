import type { BudgetRow, RowPeriod as Period } from '../types';
import { ROW_PERIODS } from '../metrics';
import { useLang } from '../i18n';

// When a row's amount actually leaves the account. Opt-in per row: leave it
// alone and the row is monthly, which is what every row was before this existed.
//
// A LABEL, not a multiplier. A yearly subscription is charged in full in the
// month you pay it, so that month's budget shows the full figure — that is the
// question a budget answers: what leaves the account, and when. Marking it lets
// the app leave the row behind when the budget is copied to next month, and
// tells you at a glance that it is not a recurring monthly cost.

const LABELS: Record<Period, keyof ReturnType<typeof useLang>['t']> = {
  month: 'periodMonth', quarter: 'periodQuarter', year: 'periodYear', once: 'periodOnce',
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

/** A plain note on when the amount is charged. Nothing for a monthly row, which
 *  is the default and needs no explanation.
 *
 *  This used to read "= 400 kr/mån" — the monthly share of a divided amount.
 *  The division is gone: a yearly charge leaves the account in full, in the
 *  month it is paid, and the budget now says so. */
export const RowPeriodHint = ({ row }: { row: BudgetRow }) => {
  const { t } = useLang();
  if (!row.period || row.period === 'month') return null;
  return <span className="row-period-hint">{t.periodChargedNote(row.period)}</span>;
};
