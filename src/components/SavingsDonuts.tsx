import { PieChart, Pie, Cell } from 'recharts';
import type { BudgetCategory } from '../types';
import { displayLabel } from '../defaults';
import { useLang } from '../i18n';

interface Props {
  categories: BudgetCategory[];
}

function hexShade(hex: string, index: number, total: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const opacity = total <= 1 ? 1 : 1 - (index * 0.45) / (total - 1);
  return `rgba(${r},${g},${b},${opacity.toFixed(2)})`;
}

export const SavingsDonuts = ({ categories }: Props) => {
  const { lang } = useLang();
  return (
  <div className="savings-donuts-grid">
    {categories.map(cat => {
      const rows = cat.rows.filter(r => r.amount > 0);
      const total = cat.rows.reduce((s, r) => s + r.amount, 0);
      const empty = rows.length === 0;

      return (
        <div key={cat.id} className="savings-donut-card">
          {/* Chart + center label */}
          <div className="savings-donut-wrap">
            <PieChart width={100} height={100}>
              <Pie
                data={empty ? [{ value: 1 }] : rows}
                cx={50}
                cy={50}
                innerRadius={30}
                outerRadius={46}
                dataKey={empty ? 'value' : 'amount'}
                paddingAngle={empty ? 0 : 3}
                strokeWidth={0}
              >
                {empty
                  ? <Cell fill="#1e293b" />
                  : rows.map((_, i) => (
                      <Cell key={i} fill={hexShade(cat.color, i, rows.length)} />
                    ))
                }
              </Pie>
            </PieChart>
            <div className="savings-donut-center-text">
              <span style={{ color: empty ? '#475569' : cat.color }}>
                {empty ? '–' : total >= 1000
                  ? `${(total / 1000).toFixed(0)}k`
                  : total.toLocaleString('sv-SE')}
              </span>
            </div>
          </div>

          {/* Category name */}
          <div className="savings-donut-name" style={{ color: cat.color }}>
            {cat.icon} {displayLabel(cat.name, lang)}
          </div>

          {/* Row breakdown */}
          {!empty && (
            <div className="savings-donut-rows">
              {rows.map((r, i) => (
                <div key={r.id} className="savings-donut-row">
                  <span
                    className="savings-donut-dot"
                    style={{ background: hexShade(cat.color, i, rows.length) }}
                  />
                  <span className="savings-donut-row-label">{displayLabel(r.label, lang)}</span>
                  <span className="savings-donut-row-amt">
                    {r.amount.toLocaleString('sv-SE')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
  );
};
