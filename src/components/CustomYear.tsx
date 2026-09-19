import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { customYearRows, customYearTotals, type YearBlockLike } from '../customYear';
import { useLang, MONTHS, MONTHS_SHORT, formatAxisTick } from '../i18n';
import { chartColors } from '../themes';
import { appStorage } from '../storage';

// The Custom layout hides the tab bar, so this is its only way to see more than
// one month. Reuses the Year tab's .year-* styling (table on desktop, cards on
// phones — CSS swaps them at 640px) so it reads as part of the same app.

interface Props {
  blocks: YearBlockLike[];
  year: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  money?: (n: number) => string;
}

const SAVED_COLOR = '#06b6d4';

const YearTooltip = ({ active, payload, label, money }: TooltipProps) => {
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

export const CustomYear = ({ blocks, year }: Props) => {
  const { lang, t, money } = useLang();
  const { text: tickColor, grid: gridColor } = chartColors();

  // Twelve localStorage reads + parses — not something to redo on every render.
  const rows = useMemo(() => customYearRows(appStorage, blocks, year), [blocks, year]);
  const totals = useMemo(() => customYearTotals(rows), [rows]);

  const hasData = rows.some(r => r.hasData);
  const remColor = (n: number) => (n >= 0 ? '#22c55e' : '#f87171');
  const signed = (n: number) => `${n > 0 ? '+' : ''}${money(n)}`;

  /** A month never opened is unknown, not a month where everything was zero. */
  const cell = (value: number, known: boolean) =>
    known ? money(value) : <span className="amount-unknown" title={t.notRecordedHint}>–</span>;

  // A month with no entry contributes null, so the bar is simply absent instead
  // of a 0 kr bar claiming the month was empty.
  const chartData = rows.map(r => ({
    month: MONTHS_SHORT[lang][r.index],
    income: r.hasData ? r.income : null,
    expenses: r.hasData ? r.expenses : null,
    saved: r.hasData ? r.saved : null,
  }));

  return (
    <div className="year-tab custom-year-view">
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
                  <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: tickColor, fontSize: 11 }}
                    tickFormatter={v => formatAxisTick(v, lang)}
                    axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<YearTooltip money={money} />} cursor={{ fill: gridColor, opacity: 0.4 }} />
                  <Legend iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '8px' }} />
                  <Bar dataKey="income" name={t.colIncome} fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                  <Bar dataKey="expenses" name={t.colExpenses} fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                  <Bar dataKey="saved" name={t.summarySaved} fill={SAVED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Phones get cards; the table below is hidden at 640px. */}
          <div className="year-cards">
            {rows.map(r => (
              <div className="year-card" key={r.index}>
                <div className="year-card-month">{MONTHS[lang][r.index]}</div>
                <div className="year-card-row"><span>{t.colIncome}</span><span>{cell(r.income, r.hasData)}</span></div>
                <div className="year-card-row"><span>{t.colExpenses}</span><span>{cell(r.expenses, r.hasData)}</span></div>
                <div className="year-card-row"><span>{t.summarySaved}</span><span style={{ color: SAVED_COLOR }}>{cell(r.saved, r.hasData)}</span></div>
                <div className="year-card-row year-card-remaining">
                  <span>{t.colRemaining}</span>
                  <span style={{ color: remColor(r.remaining) }}>
                    {r.hasData ? signed(r.remaining) : cell(0, false)}
                  </span>
                </div>
              </div>
            ))}
            <div className="year-card year-card-total">
              <div className="year-card-month">{t.yearTotal}</div>
              <div className="year-card-row"><span>{t.colIncome}</span><span>{money(totals.income)}</span></div>
              <div className="year-card-row"><span>{t.colExpenses}</span><span>{money(totals.expenses)}</span></div>
              <div className="year-card-row"><span>{t.summarySaved}</span><span style={{ color: SAVED_COLOR }}>{money(totals.saved)}</span></div>
              <div className="year-card-row year-card-remaining">
                <span>{t.colRemaining}</span>
                <span style={{ color: remColor(totals.remaining) }}>{signed(totals.remaining)}</span>
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
                  <th className="num">{t.summarySaved}</th>
                  <th className="num">{t.colRemaining}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.index}>
                    <td>{MONTHS[lang][r.index]}</td>
                    <td className="num">{cell(r.income, r.hasData)}</td>
                    <td className="num">{cell(r.expenses, r.hasData)}</td>
                    <td className="num" style={{ color: SAVED_COLOR }}>{cell(r.saved, r.hasData)}</td>
                    <td className="num" style={{ color: remColor(r.remaining) }}>
                      {r.hasData ? signed(r.remaining) : cell(0, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t.yearTotal}</td>
                  <td className="num">{money(totals.income)}</td>
                  <td className="num">{money(totals.expenses)}</td>
                  {/* Unlike the Classic Year tab, this column really is the sum of
                      the months above: Custom stores what was set aside each
                      month, not a running balance. */}
                  <td className="num" style={{ color: SAVED_COLOR }}>{money(totals.saved)}</td>
                  <td className="num" style={{ color: remColor(totals.remaining) }}>{signed(totals.remaining)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Money we cannot file is stated, not hidden. Showing 0 for it is
              exactly how deleted rows appeared to erase history. */}
          {totals.archived > 0 && (
            <p className="year-baseline-hint">💡 {t.yearArchivedNote(money(totals.archived))}</p>
          )}
        </>
      )}
    </div>
  );
};
