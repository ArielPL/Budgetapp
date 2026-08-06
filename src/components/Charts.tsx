import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Treemap, RadialBarChart, RadialBar, Legend,
} from 'recharts';
import type { BudgetCategory } from '../types';
import { shownName } from '../defaults';
import { useLang, CURRENCIES, formatAxisTick } from '../i18n';
import { chartColors } from '../themes';
import type { ExpenseChartStyle } from '../blockChart';

interface Props {
  categories: BudgetCategory[];
  totalIncome: number;
}

// Chart styles live in blockChart.ts — the shared source UI, the localStorage
// loader and the backup validator all agree on. Re-exported so existing
// importers of this module keep working.
export type { ExpenseChartStyle };

interface CatDatum { name: string; value: number; color: string; icon: string; }

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
  money?: (n: number) => string;
}

const CustomTooltip = ({ active, payload, money }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="chart-tooltip">
      <span style={{ color: item.payload?.color }}>{item.name}</span>
      <span>{money ? money(item.value) : item.value}</span>
    </div>
  );
};

// Treemap cells render their own label + color (Recharts passes geometry props).
interface TreemapCellProps {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; color?: string;
}
const TreemapCell = ({ x = 0, y = 0, width = 0, height = 0, name = '', color }: TreemapCellProps) => (
  <g>
    <rect x={x} y={y} width={width} height={height} fill={color} stroke="var(--surface)" strokeWidth={2} rx={3} />
    {width > 52 && height > 24 && (
      <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} style={{ pointerEvents: 'none' }}>
        {name}
      </text>
    )}
  </g>
);

interface ExpenseChartProps {
  data: CatDatum[];
  totalIncome: number;
  totalExpenses: number;
  style: ExpenseChartStyle;
  height: number;
  money: (n: number) => string;
  currency: keyof typeof CURRENCIES;
  totalLabel: string;
}

// The reusable expense-composition engine — used by the inline expense chart
// AND by Custom-mode sections (which pass their own style + height).
export const ExpenseChart = ({ data, totalIncome, totalExpenses, style, height, money, currency, totalLabel }: ExpenseChartProps) => {
  const { lang } = useLang();
  const isLight = document.documentElement.dataset.theme === 'light';
  const { text: tickColor, grid: gridColor } = chartColors();
  const tickColorStrong = isLight ? '#5d5972' : '#94a3b8';
  const cursorFill = 'rgba(139, 92, 246, 0.10)';

  const pct = (value: number) => totalIncome > 0
    ? Math.round((value / totalIncome) * 100)
    : Math.round((value / totalExpenses) * 100);

  const legend = (
    <div className="donut-legend">
      {data.map((d, i) => (
        <div key={i} className="legend-item">
          <span className="legend-dot" style={{ background: d.color }} />
          <span className="legend-name">{d.icon} {d.name}</span>
          <span className="legend-pct">{pct(d.value)}%</span>
        </div>
      ))}
    </div>
  );

  if (style === 'list') {
    return (
      <div className="expense-list">
        {[...data].sort((a, b) => b.value - a.value).map((d, i) => (
          <div key={i} className="expense-list-row">
            <span className="legend-dot" style={{ background: d.color }} />
            <span className="expense-list-name">{d.icon} {d.name}</span>
            <span className="expense-list-amount">{money(d.value)}</span>
            <span className="expense-list-pct">{pct(d.value)}%</span>
          </div>
        ))}
      </div>
    );
  }

  if (style === 'stacked') {
    // One horizontal 100%-width bar split by category proportion. Pure CSS
    // (no Recharts) with a fixed bar height so it never stretches vertically.
    return (
      <div className="stacked-wrap">
        <div className="stacked-bar">
          {data.map((d, i) => (
            <div
              key={i}
              className="stacked-seg"
              style={{ flexGrow: d.value, background: d.color }}
              title={`${d.name}: ${money(d.value)}`}
            />
          ))}
        </div>
        {legend}
      </div>
    );
  }

  if (style === 'bars') {
    // Narrow screens: truncate long category names ("Mat & Dryck…") on the
    // axis so bars keep room — the tooltip still shows the full name.
    const narrow = typeof window !== 'undefined' && window.innerWidth <= 640;
    const tickLabel = (v: string) =>
      narrow && v.length > 10 ? `${v.slice(0, 9)}…` : v;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={gridColor} />
          <XAxis type="number" tick={{ fill: tickColor, fontSize: 11 }}
            tickFormatter={v => formatAxisTick(v, lang)} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={narrow ? 86 : 120}
            tickFormatter={tickLabel}
            tick={{ fill: tickColorStrong, fontSize: narrow ? 11 : 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip money={money} />} cursor={{ fill: cursorFill }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (style === 'treemap') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={data as unknown as Record<string, unknown>[]}
          dataKey="value"
          nameKey="name"
          isAnimationActive={false}
          content={<TreemapCell />}
        >
          <Tooltip content={<CustomTooltip money={money} />} />
        </Treemap>
      </ResponsiveContainer>
    );
  }

  if (style === 'radial') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart
          data={data}
          innerRadius="20%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar dataKey="value" background isAnimationActive={false}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </RadialBar>
          <Tooltip content={<CustomTooltip money={money} />} />
          <Legend iconType="circle" iconSize={8}
            wrapperStyle={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  if (style === 'pie') {
    // A full pie needs square space — give the container a height equal to its
    // diameter and use a percentage radius so the whole circle always fits,
    // centered, with no clipping at any size or width.
    const diameter = Math.min(height + 60, 300);
    return (
      <>
        <div className="pie-wrapper" style={{ height: diameter }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={0}
                outerRadius="92%"
                paddingAngle={1}
                dataKey="value"
                isAnimationActive={false}
              >
                {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip money={money} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {legend}
      </>
    );
  }

  // donut (default) — radius scales to the slot height so it never clips in a
  // short/narrow block. Classic passes height=240 → outer 100 / inner 65 (the
  // original look); a small Custom block (e.g. S=140) shrinks the ring to fit.
  const donutOuter = Math.min(100, Math.floor(height / 2) - 8);
  const donutInner = Math.round(donutOuter * 0.65);
  return (
    <>
      <div className="donut-wrapper">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={donutInner}
              outerRadius={donutOuter}
              paddingAngle={3}
              dataKey="value"
              isAnimationActive={false}
            >
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip content={<CustomTooltip money={money} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <div className="donut-label">{totalLabel}</div>
          {/* Round like every other amount surface — no raw decimals in the donut center. */}
          <div className="donut-value">{Math.round(totalExpenses).toLocaleString(CURRENCIES[currency].locale)}</div>
          <div className="donut-currency">{CURRENCIES[currency].symbol}</div>
        </div>
      </div>
      {legend}
    </>
  );
};

// Build the {name,value,color,icon} list a chart renders, dropping empty
// categories. Shared by the Classic/Combined donut and per-category bars.
function buildCatData(categories: BudgetCategory[], lang: 'sv' | 'en' | 'es'): CatDatum[] {
  return categories
    .map(cat => ({
      name: shownName(cat, lang),
      value: cat.rows.reduce((s, r) => s + r.amount, 0),
      color: cat.color,
      icon: cat.icon,
    }))
    .filter(d => d.value > 0);
}

// Plain expense chart for Classic & Combined: always the default donut +
// per-category bars (no inline style switcher — chart type is chosen only
// per-block in Custom mode's config panel).
export const Charts = ({ categories, totalIncome }: Props) => {
  const { t, lang, currency, money } = useLang();
  const data = buildCatData(categories, lang);

  if (data.length === 0) {
    return (
      <div className="charts-container">
        <div className="charts-placeholder">
          <p>{t.placeholderExpenses}</p>
        </div>
      </div>
    );
  }

  const totalExpenses = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="charts-container">
      <div className="chart-block">
        <h3 className="chart-title">{t.chartExpenseDistribution}</h3>
        <ExpenseChart
          data={data}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          style="donut"
          height={240}
          money={money}
          currency={currency}
          totalLabel={t.chartTotal}
        />
      </div>

      <div className="chart-block">
        <h3 className="chart-title">{t.chartPerCategory}</h3>
        <ExpenseChart
          data={data}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          style="bars"
          height={data.length * 44 + 20}
          money={money}
          currency={currency}
          totalLabel={t.chartTotal}
        />
      </div>
    </div>
  );
};
