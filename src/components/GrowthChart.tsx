import { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { BudgetCategory } from '../types';
import { loadYearSavingsTotals } from '../defaults';
import { useLang } from '../i18n';

type ChartType = 'area' | 'line' | 'stacked';
const CHART_TYPE_KEY = 'budget_savings_chart';

function loadChartType(): ChartType {
  const v = localStorage.getItem(CHART_TYPE_KEY);
  return v === 'line' || v === 'stacked' ? v : 'area';
}

interface Props {
  year: number;
  currentMonth: number;
  currentSavings: BudgetCategory[]; // live React state — avoids stale localStorage bug
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter(p => p.value > 0);
  if (!filtered.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-dim)' }}>{label}</div>
      {filtered.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: {p.value.toLocaleString('sv-SE')} kr
        </div>
      ))}
    </div>
  );
};

export const GrowthChart = ({ year, currentMonth, currentSavings }: Props) => {
  const { lang, t } = useLang();
  const [chartType, setChartType] = useState<ChartType>(loadChartType);

  const selectChartType = (type: ChartType) => {
    setChartType(type);
    localStorage.setItem(CHART_TYPE_KEY, type);
  };

  const isLight = document.documentElement.dataset.theme === 'light';
  const tickColor  = isLight ? '#64748b' : '#64748b';
  const gridColor  = isLight ? '#e2e8f0' : '#1e293b';

  const LINES = [
    { key: 'sparkonto', label: t.lineSparkonto, color: '#22d3ee' },
    { key: 'isk',       label: t.lineIsk,       color: '#22c55e' },
    { key: 'fonder',    label: t.lineFonder,    color: '#a78bfa' },
    { key: 'pension',   label: t.linePension,   color: '#fb923c' },
  ];

  const allMonths = loadYearSavingsTotals(year, lang);

  // Build flat data array — fix: use live currentSavings for the current month
  // instead of stale localStorage value
  const data = allMonths.slice(0, currentMonth + 1).map((entry, idx) => {
    let byCategory = entry.byCategory;
    if (idx === currentMonth) {
      // Override with live React state
      byCategory = {};
      for (const cat of currentSavings) {
        byCategory[cat.id] = cat.rows.reduce((s, r) => s + r.amount, 0);
      }
    }
    // Flatten so Recharts can use simple dataKey="sparkonto" (no nested dot access)
    return {
      month: entry.month,
      sparkonto: byCategory['sparkonto'] ?? 0,
      isk:       byCategory['isk']       ?? 0,
      fonder:    byCategory['fonder']    ?? 0,
      pension:   byCategory['pension']   ?? 0,
    };
  });

  const hasData = data.some(d => d.sparkonto + d.isk + d.fonder + d.pension > 0);

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
        tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
        axisLine={false}
        tickLine={false}
        width={38}
      />
      <Tooltip content={<CustomTooltip />} />
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
        <ResponsiveContainer width="100%" height={260}>
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
