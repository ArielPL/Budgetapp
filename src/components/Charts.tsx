import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { BudgetCategory } from '../types';
import { shownName } from '../defaults';
import { useLang } from '../i18n';

interface Props {
  categories: BudgetCategory[];
  totalIncome: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="chart-tooltip">
      <span style={{ color: item.payload.color }}>{item.name}</span>
      <span>{item.value.toLocaleString('sv-SE')} kr</span>
    </div>
  );
};

export const Charts = ({ categories, totalIncome }: Props) => {
  const { t, lang } = useLang();
  const data = categories
    .map(cat => ({
      name: shownName(cat, lang),
      value: cat.rows.reduce((s, r) => s + r.amount, 0),
      color: cat.color,
      icon: cat.icon,
    }))
    .filter(d => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="charts-placeholder">
        <p>{t.placeholderExpenses}</p>
      </div>
    );
  }

  const totalExpenses = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="charts-container">
      <div className="chart-block">
        <h3 className="chart-title">{t.chartExpenseDistribution}</h3>
        <div className="donut-wrapper">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                isAnimationActive={false}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            <div className="donut-label">{t.chartTotal}</div>
            <div className="donut-value">{totalExpenses.toLocaleString('sv-SE')}</div>
            <div className="donut-currency">kr</div>
          </div>
        </div>
        <div className="donut-legend">
          {data.map((d, i) => (
            <div key={i} className="legend-item">
              <span className="legend-dot" style={{ background: d.color }} />
              <span className="legend-name">{d.icon} {d.name}</span>
              <span className="legend-pct">
                {totalIncome > 0
                  ? `${Math.round((d.value / totalIncome) * 100)}%`
                  : `${Math.round((d.value / totalExpenses) * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-block">
        <h3 className="chart-title">{t.chartPerCategory}</h3>
        <ResponsiveContainer width="100%" height={data.length * 44 + 20}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="#1e293b" />
            <XAxis
              type="number"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
