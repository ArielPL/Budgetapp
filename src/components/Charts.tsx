import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Treemap, RadialBarChart, RadialBar, Legend,
  AreaChart, Area, Line,
} from 'recharts';
import type { BudgetCategory } from '../types';
import { shownName, loadMonthData } from '../defaults';
import { useLang, CURRENCIES, MONTHS_SHORT } from '../i18n';

interface Props {
  categories: BudgetCategory[];
  totalIncome: number;
}

// Expense-composition chart styles (single category snapshot) + the
// month-spanning 'trend'. Chosen per-block in Custom mode's config panel.
export type ExpenseChartStyle =
  | 'donut' | 'bars' | 'pie' | 'list'
  | 'stacked' | 'treemap' | 'radial' | 'trend';

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
  const isLight = document.documentElement.dataset.theme === 'light';
  const gridColor = isLight ? '#ece9f5' : '#243044';
  const tickColor = isLight ? '#9a96ad' : '#64748b';
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
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={gridColor} />
          <XAxis type="number" tick={{ fill: tickColor, fontSize: 11 }}
            tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={120}
            tick={{ fill: tickColorStrong, fontSize: 12 }} axisLine={false} tickLine={false} />
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
          <div className="donut-value">{totalExpenses.toLocaleString(CURRENCIES[currency].locale)}</div>
          <div className="donut-currency">{CURRENCIES[currency].symbol}</div>
        </div>
      </div>
      {legend}
    </>
  );
};

// ── Budget trend: income vs expenses across the 12 months of the year ──
interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  money?: (n: number) => string;
}
const TrendTooltip = ({ active, payload, label, money }: TrendTooltipProps) => {
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

export const BudgetTrendChart = ({ year, height }: { year: number; height: number }) => {
  const { lang, t, money } = useLang();
  const isLight = document.documentElement.dataset.theme === 'light';
  const tickColor = '#64748b';
  const gridColor = isLight ? '#e2e8f0' : '#1e293b';

  const data = MONTHS_SHORT[lang].map((label, m) => {
    const md = loadMonthData(year, m, lang);
    const income = md.income.reduce((s, r) => s + r.amount, 0);
    const expenses = md.expenses.reduce((s, c) => s + c.rows.reduce((cs, r) => cs + r.amount, 0), 0);
    return { month: label, income, expenses };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-budget-exp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f87171" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: tickColor, fontSize: 11 }}
          tickFormatter={v => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={38} />
        <Tooltip content={<TrendTooltip money={money} />} />
        <Legend iconType="circle" iconSize={8}
          wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: '8px' }} />
        <Area type="monotone" dataKey="expenses" name={t.expenses} stroke="#f87171" strokeWidth={2}
          fill="url(#grad-budget-exp)" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="income" name={t.income} stroke="#22c55e" strokeWidth={2}
          dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// Build the {name,value,color,icon} list from categories (shared).
export function buildCatData(categories: BudgetCategory[], lang: 'sv' | 'en' | 'es'): CatDatum[] {
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
