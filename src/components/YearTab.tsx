import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { loadMonthData } from '../defaults';
import { useLang, MONTHS, MONTHS_SHORT } from '../i18n';

interface Props {
  year: number;
}

interface MonthRow {
  index: number;
  income: number;
  expenses: number;
  remaining: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-dim)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: {p.value.toLocaleString('sv-SE')} kr
        </div>
      ))}
    </div>
  );
};

export const YearTab = ({ year }: Props) => {
  const { lang, t } = useLang();
  const isLight = document.documentElement.dataset.theme === 'light';
  const tickColor = '#64748b';
  const gridColor = isLight ? '#e2e8f0' : '#1e293b';

  const rows: MonthRow[] = Array.from({ length: 12 }, (_, m) => {
    const data = loadMonthData(year, m, lang);
    const income = data.income.reduce((s, r) => s + r.amount, 0);
    const expenses = data.expenses.reduce(
      (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
    );
    return { index: m, income, expenses, remaining: income - expenses };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.income,
      expenses: acc.expenses + r.expenses,
      remaining: acc.remaining + r.remaining,
    }),
    { income: 0, expenses: 0, remaining: 0 }
  );

  const hasData = totals.income > 0 || totals.expenses > 0;

  const chartData = rows.map(r => ({
    month: MONTHS_SHORT[lang][r.index],
    income: r.income,
    expenses: r.expenses,
  }));

  const fmt = (n: number) => n.toLocaleString('sv-SE');
  const remColor = (n: number) => (n >= 0 ? '#22c55e' : '#f87171');

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
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: gridColor, opacity: 0.4 }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '8px' }}
                  />
                  <Bar dataKey="income" name={t.colIncome} fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="expenses" name={t.colExpenses} fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="year-table-wrap">
            <table className="year-table">
              <thead>
                <tr>
                  <th>{t.colMonth}</th>
                  <th className="num">{t.colIncome}</th>
                  <th className="num">{t.colExpenses}</th>
                  <th className="num">{t.colRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.index}>
                    <td>{MONTHS[lang][r.index]}</td>
                    <td className="num">{fmt(r.income)} kr</td>
                    <td className="num">{fmt(r.expenses)} kr</td>
                    <td className="num" style={{ color: remColor(r.remaining) }}>
                      {r.remaining > 0 ? '+' : ''}{fmt(r.remaining)} kr
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t.yearTotal}</td>
                  <td className="num">{fmt(totals.income)} kr</td>
                  <td className="num">{fmt(totals.expenses)} kr</td>
                  <td className="num" style={{ color: remColor(totals.remaining) }}>
                    {totals.remaining > 0 ? '+' : ''}{fmt(totals.remaining)} kr
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
