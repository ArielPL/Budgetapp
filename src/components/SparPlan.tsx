import { useMemo, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { loadMonthData } from '../defaults';
import { calculateSavingsMetrics } from '../metrics';
import { useLang, MONTHS_SHORT, formatAxisTick } from '../i18n';
import {
  loadSavingsPlan, saveSavingsPlan, projectPlan, monthsBetween, toYM, earliestSavingsYM,
  planVsActual, type SavingsPlan,
} from '../sparplan';
import { parseAmount } from '../goalForm';

const TEAL = '#14b8a6';
const GRAY = '#888780';
const HORIZON_MONTHS = 60; // fixed 5-year projection window (v1)

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string | number;
  money?: (n: number) => string;
  labelText?: (l: string | number) => string;
}

const ChartTooltip = ({ active, payload, label, money, labelText }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-dim)' }}>
        {labelText ? labelText(label ?? '') : label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: {money ? money(Math.round(p.value)) : p.value}
        </div>
      ))}
    </div>
  );
};

export const SparPlanSection = () => {
  const { lang, t, money } = useLang();
  const isLight = document.documentElement.dataset.theme === 'light';
  const tickColor = '#64748b';
  const gridColor = isLight ? '#e2e8f0' : '#1e293b';

  const [plan, setPlanState] = useState<SavingsPlan | null>(loadSavingsPlan);

  // Auto-default the plan's start to the earliest month with recorded savings
  // (excl. pension) — so "Plan vs reality" spans your real history, not just the
  // month you happened to open the planner. Falls back to this month if there's
  // no saving history yet. The user can still override it via the field below.
  const autoStartYM = useMemo(() => {
    const months: Array<{ ym: string; saved: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const match = key && /^budget_(\d{4})_(\d+)$/.exec(key);
      if (!match) continue;
      const y = Number(match[1]);
      const mi = Number(match[2]);
      const saved = calculateSavingsMetrics(loadMonthData(y, mi, lang)).balance;
      if (saved > 0) months.push({ ym: toYM(y, mi), saved });
    }
    const d = new Date();
    return earliestSavingsYM(months) ?? toYM(d.getFullYear(), d.getMonth());
  }, [lang]);

  // Draft input strings (typing-friendly); seeded from the saved plan or defaults.
  const [monthly, setMonthly] = useState(() => (plan ? String(plan.monthlyAmount) : '2000'));
  const [ret, setRet] = useState(() => (plan ? String(plan.annualReturnPct) : '7'));
  const [start, setStart] = useState(() => (plan && plan.startAmount > 0 ? String(plan.startAmount) : ''));
  const [startYM, setStartYM] = useState(() => plan?.startYM ?? autoStartYM);

  // Persist on every valid edit. The start month is user-editable (defaults to
  // the first savings month) and drives the plan-vs-actual comparison window.
  const commit = (m: string, r: string, s: string, sy: string) => {
    const mv = parseAmount(m);
    const rv = parseAmount(r);
    const sv = s.trim() === '' ? 0 : parseAmount(s);
    if (isNaN(mv) || mv < 0 || isNaN(rv) || rv < 0 || sv < 0 || isNaN(sv)) return;
    if (!/^\d{4}-\d{2}$/.test(sy)) return;
    const next: SavingsPlan = { monthlyAmount: mv, annualReturnPct: rv, startAmount: sv, startYM: sy };
    saveSavingsPlan(next);
    setPlanState(next);
  };

  // Projection uses the saved plan, or a preview from the current drafts so the
  // chart is alive before the first edit is persisted.
  const previewPlan: SavingsPlan = plan ?? {
    monthlyAmount: parseAmount(monthly) || 0,
    annualReturnPct: parseAmount(ret) || 0,
    startAmount: start.trim() === '' ? 0 : parseAmount(start) || 0,
    startYM,
  };
  const series = projectPlan(previewPlan, HORIZON_MONTHS);
  const projData = series.map((v, k) => ({
    k,
    growth: v,
    flat: previewPlan.startAmount + previewPlan.monthlyAmount * k,
  }));
  const finalValue = series[HORIZON_MONTHS];
  const deposits = previewPlan.startAmount + previewPlan.monthlyAmount * HORIZON_MONTHS;
  const growthPart = Math.max(0, finalValue - deposits);
  // Axis ticks land only on whole years (0, 12, 24 … months); the TOOLTIP can
  // hit any month, so it gets its own months-based label ("Månad 37"), never a
  // fractional year like "År 3.08".
  const yearLabel = (k: string | number) => (Number(k) === 0 ? t.sparplanNow : `${t.tabYear} ${Number(k) / 12}`);
  const monthLabel = (k: string | number) => (Number(k) === 0 ? t.sparplanNow : t.sparplanMonth(Number(k)));

  // ── Plan vs actual — PROGRESS SINCE THE PLAN STARTED, on both sides.
  // The Savings tab records a running BALANCE, so progress is how far that
  // balance moved from what you already had on the plan's start month — the
  // shared zero point for both lines (planVsActual). Two traps this avoids:
  // summing the monthly balances, and counting the pot you started with as if
  // you'd saved it under the plan.
  const now = new Date();
  const nowYM = toYM(now.getFullYear(), now.getMonth());
  let vsRows: Array<{ label: string; actual: number; plan: number }> = [];
  let vsDiff = 0;
  if (plan) {
    const elapsed = Math.max(0, monthsBetween(plan.startYM, nowYM)) + 1; // incl. current month
    const planSeries = projectPlan({ ...plan, startAmount: 0 }, elapsed);
    const [sy, sm] = plan.startYM.split('-').map(Number);
    const labels: string[] = [];
    const balances: number[] = [];
    for (let k = 0; k < elapsed; k++) {
      const y = sy + Math.floor((sm - 1 + k) / 12);
      const mi = (sm - 1 + k) % 12;
      labels.push(MONTHS_SHORT[lang][mi]);
      balances.push(calculateSavingsMetrics(loadMonthData(y, mi, lang)).balance);
    }
    vsRows = planVsActual(balances, planSeries).map((p, k) => ({ label: labels[k], ...p }));
    // Keep the chart readable if a plan has run for years: show the last 24 months.
    if (vsRows.length > 24) vsRows = vsRows.slice(-24);
    vsDiff = vsRows.length ? vsRows[vsRows.length - 1].actual - vsRows[vsRows.length - 1].plan : 0;
  }
  const onTrack = Math.abs(vsDiff) < 50;

  const field = (
    id: string, label: string, value: string, placeholder: string,
    set: (v: string) => void, after: (v: string) => void,
  ) => (
    <div className="goal-form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} className="label-input" inputMode="decimal" value={value}
        placeholder={placeholder}
        onChange={e => { set(e.target.value); after(e.target.value); }}
      />
    </div>
  );

  return (
    <section className="plan-section">
      <div className="plan-section-header">
        <h2 className="plan-section-title">📈 {t.sparplanTitle}</h2>
      </div>

      <div className="sparplan-card">
        <p className="sparplan-body">{t.sparplanBody}</p>
        <div className="sparplan-inputs">
          {field('sp-monthly', t.sparplanMonthly, monthly, '2000', setMonthly, v => commit(v, ret, start, startYM))}
          {field('sp-return', t.sparplanReturn, ret, '7', setRet, v => commit(monthly, v, start, startYM))}
          {field('sp-start', t.sparplanStartAmount, start, '0', setStart, v => commit(monthly, ret, v, startYM))}
          <div className="goal-form-field">
            <label htmlFor="sp-startym">{t.sparplanStartMonth}</label>
            <input
              id="sp-startym" className="label-input" type="month" value={startYM}
              onChange={e => { setStartYM(e.target.value); commit(monthly, ret, start, e.target.value); }}
            />
          </div>
        </div>

        <div className="sparplan-hero">
          <span className="sparplan-hero-value">{money(Math.round(finalValue))}</span>
          <span className="sparplan-hero-sub">
            {t.sparplanIn5Years} · <span className="sparplan-growth">{t.sparplanOfWhichGrowth(money(Math.round(growthPart)))}</span>
          </span>
        </div>

        <div className="sparplan-legend">
          <span className="sparplan-legend-item"><span className="sparplan-swatch" style={{ background: TEAL }} />{t.sparplanWithGrowth}</span>
          <span className="sparplan-legend-item"><span className="sparplan-swatch sparplan-swatch-line" style={{ background: GRAY }} />{t.sparplanDepositsOnly}</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={projData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="k" type="number" domain={[0, HORIZON_MONTHS]}
              ticks={[0, 12, 24, 36, 48, 60]} tickFormatter={yearLabel}
              tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fill: tickColor, fontSize: 11 }} width={44}
              tickFormatter={v => formatAxisTick(v, lang)} axisLine={false} tickLine={false}
            />
            <Tooltip content={<ChartTooltip money={money} labelText={monthLabel} />} />
            <Area type="monotone" dataKey="growth" name={t.sparplanWithGrowth}
              stroke={TEAL} strokeWidth={2} fill={TEAL} fillOpacity={0.12}
              isAnimationActive={false} />
            <Area type="monotone" dataKey="flat" name={t.sparplanDepositsOnly}
              stroke={GRAY} strokeWidth={2} fill="transparent"
              isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {plan && vsRows.length > 0 && (
        <div className="sparplan-card">
          <h3 className="sparplan-subtitle">🎯 {t.sparplanVsTitle}</h3>
          <p className="sparplan-body">{t.sparplanVsBody}</p>
          <div className={`sparplan-badge ${onTrack ? 'sparplan-badge-ontrack' : vsDiff > 0 ? 'sparplan-badge-ahead' : 'sparplan-badge-behind'}`}>
            {onTrack
              ? t.sparplanOnTrack
              : vsDiff > 0
                ? t.sparplanAhead(money(Math.round(vsDiff)))
                : t.sparplanBehind(money(Math.round(Math.abs(vsDiff))))}
          </div>
          <div className="sparplan-legend">
            <span className="sparplan-legend-item"><span className="sparplan-swatch" style={{ background: TEAL }} />{t.sparplanActual}</span>
            <span className="sparplan-legend-item"><span className="sparplan-swatch sparplan-swatch-dash" style={{ background: GRAY }} />{t.sparplanPlanLine}</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={vsRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: tickColor, fontSize: 11 }} width={44}
                tickFormatter={v => formatAxisTick(v, lang)} axisLine={false} tickLine={false}
              />
              <Tooltip content={<ChartTooltip money={money} />} />
              <Line type="monotone" dataKey="actual" name={t.sparplanActual}
                stroke={TEAL} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="plan" name={t.sparplanPlanLine}
                stroke={GRAY} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
