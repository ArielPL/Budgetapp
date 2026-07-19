import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { loadMonthData } from '../defaults';
import { calculateSavingsMetrics, yearSavingsGrowth, type SavingsSnapshot } from '../metrics';
import { useLang, MONTHS, MONTHS_SHORT, formatAxisTick } from '../i18n';
import { chartColors } from '../themes';

interface Props {
  year: number;
}

interface MonthRow {
  index: number;
  income: number;
  expenses: number;
  savings: number;
  hasSavings: boolean; // false = never recorded, so the cell shows "–" not 0 kr
  remaining: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  money?: (n: number) => string;
}

const SAVINGS_COLOR = '#06b6d4';

const CustomTooltip = ({ active, payload, label, money }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-dim)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: {money ? money(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

export const YearTab = ({ year }: Props) => {
  const { lang, t, money } = useLang();
  const { text: tickColor, grid: gridColor } = chartColors();

  const snapshots: SavingsSnapshot[] = [];
  const rows: MonthRow[] = Array.from({ length: 12 }, (_, m) => {
    const data = loadMonthData(year, m, lang);
    const income = data.income.reduce((s, r) => s + r.amount, 0);
    const expenses = data.expenses.reduce(
      (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
    );
    // Savings BALANCE for the month (excludes pension — a separate long-term
    // bucket). A month with nothing recorded is unknown, not a balance of 0.
    const snap = calculateSavingsMetrics(data);
    snapshots.push(snap);
    return {
      index: m, income, expenses,
      savings: snap.balance, hasSavings: snap.hasSnapshot,
      remaining: income - expenses,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      expenses: acc.expenses + r.expenses,
      remaining: acc.remaining + r.remaining,
    }),
    { income: 0, expenses: 0, remaining: 0 }
  );

  // Savings is a running BALANCE, so the year's figure is NOT the sum of the
  // months (that would add the same money twelve times — the old bug). It's how
  // much the balance actually grew: where it ended, minus what carried in from
  // last December. Null when that December was never recorded — a first-year
  // pot could be a lifetime's saving, and we won't guess.
  const carryIn = calculateSavingsMetrics(loadMonthData(year - 1, 11, lang));
  const savingsGrowth = yearSavingsGrowth(snapshots, carryIn);

  const hasData = totals.income > 0 || totals.expenses > 0 || rows.some(r => r.hasSavings);

  // An unrecorded month contributes `null`, so the bar is simply absent rather
  // than a 0 kr bar claiming the account was emptied.
  const chartData = rows.map(r => ({
    month: MONTHS_SHORT[lang][r.index],
    income: r.income,
    expenses: r.expenses,
    savings: r.hasSavings ? r.savings : null,
  }));

  const remColor = (n: number) => (n >= 0 ? '#22c55e' : '#f87171');
  // The year's change is unknown for a different REASON than a month's balance:
  // the missing fact is last December's baseline, and the hint must say so.
  const missingBaseline = savingsGrowth === null && rows.some(r => r.hasSavings);
  /** A savings figure, or "–" when the month/year has nothing recorded. */
  const savingsCell = (v: number | null, recorded = true, hint = t.notRecordedHint) =>
    v === null || !recorded
      ? <span className="amount-unknown" title={hint}>–</span>
      : money(v);
  const yearCell = savingsCell(savingsGrowth, true, missingBaseline ? t.yearBaselineHint(year) : t.notRecordedHint);

  return (
    <div className="year-tab">
      <h2 className="year-heading">{t.yearOverview(year)}</h2>

      {!hasData && (
        <div className="charts-placeholder">
          <p>{t.yearEmpty}</p>
        </div>
      )}

      {hasData && (
        <>
          <div className="charts-container">
            <div className="chart-block">
              <h3 className="chart-title">{t.yearChartTitle}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: tickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: tickColor, fontSize: 11 }}
                    tickFormatter={v => formatAxisTick(v, lang)}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                  />
                  <Tooltip content={<CustomTooltip money={money} />} cursor={{ fill: gridColor, opacity: 0.4 }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '8px' }}
                  />
                  <Bar dataKey="income" name={t.colIncome} fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                  <Bar dataKey="expenses" name={t.colExpenses} fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                  <Bar dataKey="savings" name={t.colSavingsBalance} fill={SAVINGS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mobile: month cards instead of a side-scrolling table (CSS swaps
              which one is visible at the 640px breakpoint). */}
          <div className="year-cards">
            {rows.map(r => (
              <div className="year-card" key={r.index}>
                <div className="year-card-month">{MONTHS[lang][r.index]}</div>
                <div className="year-card-row"><span>{t.colIncome}</span><span>{money(r.income)}</span></div>
                <div className="year-card-row"><span>{t.colExpenses}</span><span>{money(r.expenses)}</span></div>
                <div className="year-card-row"><span>{t.colSavingsBalance}</span><span style={{ color: SAVINGS_COLOR }}>{savingsCell(r.savings, r.hasSavings)}</span></div>
                <div className="year-card-row year-card-remaining">
                  <span>{t.colRemaining}</span>
                  <span style={{ color: remColor(r.remaining) }}>{r.remaining > 0 ? '+' : ''}{money(r.remaining)}</span>
                </div>
              </div>
            ))}
            {/* Full-year total card — the mobile counterpart of the table footer. */}
            <div className="year-card year-card-total">
              <div className="year-card-month">{t.yearTotal}</div>
              <div className="year-card-row"><span>{t.colIncome}</span><span>{money(totals.income)}</span></div>
              <div className="year-card-row"><span>{t.colExpenses}</span><span>{money(totals.expenses)}</span></div>
              <div className="year-card-row"><span>{t.colSavedDuringYear}</span><span style={{ color: SAVINGS_COLOR }}>{yearCell}</span></div>
              <div className="year-card-row year-card-remaining">
                <span>{t.colRemaining}</span>
                <span style={{ color: remColor(totals.remaining) }}>{totals.remaining > 0 ? '+' : ''}{money(totals.remaining)}</span>
              </div>
            </div>
          </div>

          <div className="year-table-wrap">
            <table className="year-table">
              <thead>
                <tr>
                  <th>{t.colMonth}</th>
                  <th className="num">{t.colIncome}</th>
                  <th className="num">{t.colExpenses}</th>
                  <th className="num">{t.colSavingsBalance}</th>
                  <th className="num">{t.colRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.index}>
                    <td>{MONTHS[lang][r.index]}</td>
                    <td className="num">{money(r.income)}</td>
                    <td className="num">{money(r.expenses)}</td>
                    <td className="num" style={{ color: SAVINGS_COLOR }}>{savingsCell(r.savings, r.hasSavings)}</td>
                    <td className="num" style={{ color: remColor(r.remaining) }}>
                      {r.remaining > 0 ? '+' : ''}{money(r.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {/* The savings column changes meaning in this row: the months
                      above are balances, this is the year's change — so the
                      cell carries its own VISIBLE label, not just a title. */}
                  <td>{t.yearTotal}</td>
                  <td className="num">{money(totals.income)}</td>
                  <td className="num">{money(totals.expenses)}</td>
                  <td className="num" style={{ color: SAVINGS_COLOR }}>
                    <span className="year-total-measure">{t.colSavedDuringYear}</span>
                    {yearCell}
                  </td>
                  <td className="num" style={{ color: remColor(totals.remaining) }}>
                    {totals.remaining > 0 ? '+' : ''}{money(totals.remaining)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Why the year total reads "–": the missing fact is LAST year's
              December baseline. Visible text (not just a tooltip) so sighted
              and screen-reader users get the same explanation. */}
          {missingBaseline && (
            <p className="year-baseline-hint">💡 {t.yearBaselineHint(year)}</p>
          )}
        </>
      )}
    </div>
  );
};
