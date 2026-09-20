import { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { BudgetCategory } from '../types';
import { loadYearSavingsTotals } from '../defaults';
import { useLang, formatAxisTick } from '../i18n';
import { chartColors } from '../themes';
import { PENSION_CATEGORY_ID } from '../metrics';
import { appStorage } from '../storage';
import { safeSetItem } from '../storageWrite';

type ChartType = 'area' | 'line' | 'stacked';
const CHART_TYPE_KEY = 'budget_savings_chart';

function loadChartType(): ChartType {
  const v = appStorage.getItem(CHART_TYPE_KEY);
  return v === 'line' || v === 'stacked' ? v : 'area';
}

interface Props {
  year: number;
  currentMonth: number;
  currentSavings: BudgetCategory[]; // live React state — avoids stale localStorage bug
  /** Live savingsSnapshotRecorded for the current month — template-created
   *  categories are structure, not a recorded balance (main review §5). */
  currentSnapshotRecorded?: boolean;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  money?: (n: number) => string;
}

const CustomTooltip = ({ active, payload, label, money }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter(p => p.value > 0);
  if (!filtered.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-dim)' }}>{label}</div>
      {filtered.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: {money ? money(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

export const GrowthChart = ({ year, currentMonth, currentSavings, currentSnapshotRecorded }: Props) => {
  const { lang, t, money } = useLang();
  const [chartType, setChartType] = useState<ChartType>(loadChartType);

  const selectChartType = (type: ChartType) => {
    setChartType(type);
    // A display preference: worth keeping, not worth an error banner.
    safeSetItem(appStorage, CHART_TYPE_KEY, type);
  };

  const { text: tickColor, grid: gridColor } = chartColors();

  const allMonths = loadYearSavingsTotals(year, lang);

  // The three categories the app ships with keep their translated labels and
  // their established chart colours, so nothing an existing user recognises
  // moves.
  const BUILT_IN: Record<string, { label: string; color: string }> = {
    sparkonto: { label: t.lineSparkonto, color: '#22d3ee' },
    isk:       { label: t.lineIsk,       color: '#22c55e' },
    fonder:    { label: t.lineFonder,    color: '#a78bfa' },
  };

  // Which lines to draw.
  //
  // This was hardcoded to exactly those three ids. But the Savings tab offers
  // "+ add category", and calculateSavingsMetrics sums ALL of them except
  // pension — so a category the user made was counted by the card above and
  // ignored by the chart below. 20 000 on the sparkonto plus 30 000 in a
  // self-made "Buffert" showed a card reading 50 000 over a chart adding up to
  // 20 000; with everything in Buffert, the chart claimed nothing was recorded
  // at all (finding 7). Pension stays out, which was the real intent all along
  // — it is a separate bucket, and metrics.ts excludes it everywhere too.
  const lineMap = new Map<string, { key: string; label: string; color: string }>();
  const addCategory = (c: { id: string; name: string; color: string }) => {
    if (c.id === PENSION_CATEGORY_ID || lineMap.has(c.id)) return;
    const builtIn = BUILT_IN[c.id];
    lineMap.set(c.id, {
      key: c.id,
      label: builtIn?.label ?? c.name,
      color: builtIn?.color ?? c.color,
    });
  };
  // Built-ins first, in their familiar order, then whatever the user added.
  for (const id of Object.keys(BUILT_IN)) {
    const found = allMonths.flatMap(m => m.categories).find(c => c.id === id)
      ?? currentSavings.find(c => c.id === id);
    if (found) addCategory(found);
  }
  for (const m of allMonths.slice(0, currentMonth + 1)) m.categories.forEach(addCategory);
  for (const c of currentSavings) addCategory(c);
  const LINES = [...lineMap.values()];

  // Build flat data array — fix: use live currentSavings for the current month
  // instead of stale localStorage value
  const data = allMonths.slice(0, currentMonth + 1).map((entry, idx) => {
    let byCategory = entry.byCategory;
    let hasSnapshot = entry.hasSnapshot;
    if (idx === currentMonth) {
      // Override with live React state
      byCategory = {};
      for (const cat of currentSavings) {
        byCategory[cat.id] = cat.rows.reduce((s, r) => s + r.amount, 0);
      }
      hasSnapshot = typeof currentSnapshotRecorded === 'boolean'
        ? currentSnapshotRecorded
        : currentSavings.length > 0;
    }
    // Flatten so Recharts can use simple dataKey="sparkonto" (no nested dot access).
    // Pension is intentionally excluded — it's a separate bucket, not charted.
    // A month with nothing recorded plots `null`, which Recharts leaves as a gap:
    // plotting 0 drew the balance plunging to the axis and back, money the user
    // never withdrew. Within a recorded month, an absent category IS 0.
    const at = (key: string) => (hasSnapshot ? byCategory[key] ?? 0 : null);
    const row: Record<string, string | number | null> = { month: entry.month };
    for (const l of LINES) row[l.key] = at(l.key);
    return row;
  });

  const hasData = data.some(
    d => LINES.reduce((sum, l) => sum + ((d[l.key] as number | null) ?? 0), 0) > 0,
  );

  if (!hasData) {
    return (
      <div className="charts-placeholder">
        <p>{t.placeholderSavings}</p>
      </div>
    );
  }

  // Shared axis/grid/tooltip/legend elements for every chart type
  const sharedChildren = (
    <>
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
      <Tooltip content={<CustomTooltip money={money} />} />
      <Legend
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '8px' }}
      />
    </>
  );

  const margin = { top: 10, right: 16, left: 0, bottom: 0 };

  return (
    <div className="charts-container">
      <div className="chart-block">
        <div className="chart-head">
          <h3 className="chart-title">{t.chartGrowth(year)}</h3>
          <div className="utils-seg chart-type-toggle" role="tablist">
            <button
              className={`seg-btn${chartType === 'area' ? ' seg-active' : ''}`}
              onClick={() => selectChartType('area')}
              role="tab"
              aria-selected={chartType === 'area'}
            >
              {t.chartTypeArea}
            </button>
            <button
              className={`seg-btn${chartType === 'line' ? ' seg-active' : ''}`}
              onClick={() => selectChartType('line')}
              role="tab"
              aria-selected={chartType === 'line'}
            >
              {t.chartTypeLine}
            </button>
            <button
              className={`seg-btn${chartType === 'stacked' ? ' seg-active' : ''}`}
              onClick={() => selectChartType('stacked')}
              role="tab"
              aria-selected={chartType === 'stacked'}
            >
              {t.chartTypeStacked}
            </button>
          </div>
        </div>
        {/* Screen-reader alternative: the SVG below is decorative noise to AT,
            so the same data ships as a visually-hidden table. The wrapper (not
            the table itself) is hidden — a clipped table still asserts its
            intrinsic width and gave the page sideways scroll at 320px. */}
        <div className="sr-only-table-wrap">
        <table>
          <caption>{t.chartGrowth(year)}</caption>
          <thead>
            <tr>
              <th scope="col">{t.colMonth}</th>
              {LINES.map(l => <th key={l.key} scope="col">{l.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.month}>
                <th scope="row">{d.month}</th>
                {LINES.map(l => (
                  <td key={l.key}>
                    {d[l.key] === null ? t.notRecorded : money(d[l.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <ResponsiveContainer width="100%" height={260} aria-hidden="true">
          {chartType === 'area' ? (
            <AreaChart data={data} margin={margin}>
              <defs>
                {LINES.map(l => (
                  <linearGradient key={l.key} id={`grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={l.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={l.color} stopOpacity={0}    />
                  </linearGradient>
                ))}
              </defs>
              {sharedChildren}
              {LINES.map(l => (
                <Area
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.label}
                  stroke={l.color}
                  strokeWidth={2}
                  fill={`url(#grad-${l.key})`}
                  dot={{ r: 3, fill: l.color, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          ) : chartType === 'line' ? (
            <LineChart data={data} margin={margin}>
              {sharedChildren}
              {LINES.map(l => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.label}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: l.color, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={margin}>
              {sharedChildren}
              {LINES.map(l => (
                <Bar
                  key={l.key}
                  dataKey={l.key}
                  name={l.label}
                  stackId="savings"
                  fill={l.color}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
