import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { loadMonthData } from '../defaults';
import { calculateSavingsMetrics } from '../metrics';
import { useLang, MONTHS_SHORT, formatAxisTick, type Translations } from '../i18n';
import { chartColors } from '../themes';
import {
  loadSavingsPlan, saveSavingsPlan, deleteSavingsPlan, validateSavingsPlan,
  projectPlan, monthsBetween, toYM, earliestSavingsYM,
  planVsActual, type SavingsPlan, type PlanVsActualPoint, type PlanField,
} from '../sparplan';

type VsRow = { label: string } & PlanVsActualPoint;
import { parseAmount } from '../goalForm';
import { appStorage } from '../storage';

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

// Plan-vs-reality tooltip: the line plots the real pot, so each row also spells
// out the progress behind it — "61 443 kr · +7 294 sedan start".
const VsTooltip = ({ active, payload, label, money, t }: {
  active?: boolean;
  payload?: Array<{ payload: VsRow }>;
  label?: string | number;
  money: (n: number) => string;
  t: Translations;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${money(Math.round(n))}`;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ color: TEAL, fontSize: '0.8rem' }}>
        {t.totalSaved}: {row.actualTotal === null || row.actualProgress === null
          ? t.notRecorded
          : `${money(Math.round(row.actualTotal))} · ${signed(row.actualProgress)} ${t.sparplanSinceStart}`}
      </div>
      <div style={{ color: GRAY, fontSize: '0.8rem' }}>
        {t.sparplanPlanLine}: {money(Math.round(row.planTotal))} · {signed(row.planProgress)} {t.sparplanSinceStart}
      </div>
    </div>
  );
};

export const SparPlanSection = () => {
  const { lang, t, money } = useLang();
  const { text: tickColor, grid: gridColor } = chartColors();

  const [plan, setPlanState] = useState<SavingsPlan | null>(loadSavingsPlan);

  // Auto-default the plan's start to the earliest month with recorded savings
  // (excl. pension) — so "Plan vs reality" spans your real history, not just the
  // month you happened to open the planner. Falls back to this month if there's
  // no saving history yet. The user can still override it via the field below.
  const autoStartYM = useMemo(() => {
    const months: Array<{ ym: string; hasSnapshot: boolean }> = [];
    for (let i = 0; i < appStorage.length; i++) {
      const key = appStorage.key(i);
      const match = key && /^budget_(\d{4})_(\d+)$/.exec(key);
      if (!match) continue;
      const y = Number(match[1]);
      const mi = Number(match[2]);
      const snap = calculateSavingsMetrics(loadMonthData(y, mi, lang));
      months.push({ ym: toYM(y, mi), hasSnapshot: snap.hasSnapshot });
    }
    const d = new Date();
    return earliestSavingsYM(months) ?? toYM(d.getFullYear(), d.getMonth());
  }, [lang]);

  // Draft input strings (typing-friendly); seeded from the saved plan or defaults.
  const [monthly, setMonthly] = useState(() => (plan ? String(plan.monthlyAmount) : '2000'));
  const [ret, setRet] = useState(() => (plan ? String(plan.annualReturnPct) : '7'));
  const [start, setStart] = useState(() => (plan && plan.startAmount > 0 ? String(plan.startAmount) : ''));
  const [startYM, setStartYM] = useState(() => plan?.startYM ?? autoStartYM);

  // Persist on every VALID edit; an invalid one shows a field error, keeps the
  // draft so it can be fixed, and touches neither storage nor the chart. The
  // same validateSavingsPlan runs here, in saveSavingsPlan and in the loader —
  // the old form-only isNaN check let `1e309` through as Infinity, which
  // JSON.stringify wrote as null and the loader then rejected: the plan
  // silently vanished on the next reload.
  const [fieldErrors, setFieldErrors] = useState<PlanField[]>([]);
  const commit = (m: string, r: string, s: string, sy: string) => {
    const next: SavingsPlan = {
      monthlyAmount: parseAmount(m),
      annualReturnPct: parseAmount(r),
      startAmount: s.trim() === '' ? 0 : parseAmount(s),
      startYM: sy,
    };
    const errors = validateSavingsPlan(next);
    setFieldErrors(errors);
    if (errors.length > 0) return;
    saveSavingsPlan(next);
    setPlanState(next);
  };

  const removePlan = () => {
    if (!window.confirm(t.sparplanDeleteConfirm)) return;
    deleteSavingsPlan();
    setPlanState(null);
    setFieldErrors([]);
    setMonthly('2000');
    setRet('7');
    setStart('');
    setStartYM(autoStartYM);
  };

  // Projection uses the saved plan, or a preview from the current drafts so the
  // chart is alive before the first edit is persisted. The draft preview is
  // validated too — `parseAmount('1e309') || 0` is Infinity, not 0, so an
  // unvalidated draft could feed Recharts a non-finite series. Every path into
  // the chart goes through validateSavingsPlan; NaN/Infinity cannot reach it.
  const draftPreview: SavingsPlan = {
    monthlyAmount: parseAmount(monthly) || 0,
    annualReturnPct: parseAmount(ret) || 0,
    startAmount: start.trim() === '' ? 0 : parseAmount(start) || 0,
    startYM,
  };
  const draftValid = validateSavingsPlan(draftPreview).length === 0;

  // While a draft is INVALID the chart holds the last valid projection instead
  // of collapsing to a zero plan — a typo shows a field error, not a graph
  // where five years of saving vanish (main review §11).
  const [lastValidDraft, setLastValidDraft] = useState<SavingsPlan | null>(null);
  useEffect(() => {
    if (draftValid) setLastValidDraft(draftPreview);
    // Drafts are derived 1:1 from these strings, so they are the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, ret, start, startYM]);

  const previewPlan: SavingsPlan = plan
    ?? (draftValid ? draftPreview : lastValidDraft
      ?? { monthlyAmount: 0, annualReturnPct: 0, startAmount: 0, startYM });
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

  // ── Plan vs actual — the lines plot the real POT; the tooltip and the badge
  // spell out the progress behind it. The plan's start month anchors both sides
  // (planVsActual): the pot you already had isn't progress, and the plan carries
  // that same baseline forward rather than taking credit for it. Two traps this
  // avoids: summing the monthly balances, and counting your starting pot as if
  // you'd saved it under the plan.
  const now = new Date();
  const nowYM = toYM(now.getFullYear(), now.getMonth());
  let vsRows: VsRow[] = [];
  let vsDiff = 0;
  let hasVsData = false; // any month with a real snapshot to compare against
  if (plan) {
    const elapsed = Math.max(0, monthsBetween(plan.startYM, nowYM)) + 1; // incl. current month
    const planSeries = projectPlan({ ...plan, startAmount: 0 }, elapsed);
    const [sy, sm] = plan.startYM.split('-').map(Number);
    const labels: string[] = [];
    const balances: Array<number | null> = [];
    for (let k = 0; k < elapsed; k++) {
      const y = sy + Math.floor((sm - 1 + k) / 12);
      const mi = (sm - 1 + k) % 12;
      labels.push(MONTHS_SHORT[lang][mi]);
      // An unrecorded month is unknown, not a balance of 0 — pass null through
      // so the line breaks rather than diving to the axis.
      const snap = calculateSavingsMetrics(loadMonthData(y, mi, lang));
      balances.push(snap.hasSnapshot ? snap.balance : null);
    }
    vsRows = planVsActual(balances, planSeries).map((p, k) => ({ label: labels[k], ...p }));
    // Keep the chart readable if a plan has run for years: show the last 24 months.
    if (vsRows.length > 24) vsRows = vsRows.slice(-24);
    // Ahead or behind is judged on the last month you actually recorded — not on
    // a trailing empty month, which would read as "you're 61 443 kr behind".
    const lastReal = [...vsRows].reverse().find(r => r.actualTotal !== null);
    hasVsData = !!lastReal;
    vsDiff = lastReal ? lastReal.actualTotal! - lastReal.planTotal : 0;
  }
  const onTrack = Math.abs(vsDiff) < 50;

  // The two lines sit on top of a shared starting pot, so a zero-based axis
  // would squash the gap between them into a hairline. Fit the axis to the data
  // (with breathing room) so being ahead or behind is actually visible.
  const vsValues = vsRows
    .flatMap(r => [r.actualTotal, r.planTotal])
    .filter((v): v is number => v !== null);
  const vsMin = vsValues.length ? Math.min(...vsValues) : 0;
  const vsMax = vsValues.length ? Math.max(...vsValues) : 0;
  const vsPad = Math.max(100, (vsMax - vsMin) * 0.25);
  const vsDomain: [number, number] = [Math.max(0, vsMin - vsPad), vsMax + vsPad];

  const field = (
    id: string, label: string, value: string, placeholder: string,
    set: (v: string) => void, after: (v: string) => void, errorText?: string,
  ) => (
    <div className="goal-form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} className="label-input" inputMode="decimal" value={value}
        placeholder={placeholder}
        aria-invalid={errorText ? true : undefined}
        aria-describedby={errorText ? `${id}-err` : undefined}
        onChange={e => { set(e.target.value); after(e.target.value); }}
      />
      {errorText && <span className="field-error" id={`${id}-err`} role="alert">{errorText}</span>}
    </div>
  );
  const errFor = (f: PlanField, text: string) => (fieldErrors.includes(f) ? text : undefined);

  return (
    <section className="plan-section">
      <div className="plan-section-header">
        <h2 className="plan-section-title">📈 {t.sparplanTitle}</h2>
      </div>

      <div className="sparplan-card">
        <p className="sparplan-body">{t.sparplanBody}</p>
        <div className="sparplan-inputs">
          {field('sp-monthly', t.sparplanMonthly, monthly, '2000', setMonthly,
            v => commit(v, ret, start, startYM), errFor('monthlyAmount', t.sparplanErrAmount))}
          {field('sp-return', t.sparplanReturn, ret, '7', setRet,
            v => commit(monthly, v, start, startYM), errFor('annualReturnPct', t.sparplanErrReturn))}
          {field('sp-start', t.sparplanStartAmount, start, '0', setStart,
            v => commit(monthly, ret, v, startYM), errFor('startAmount', t.sparplanErrAmount))}
          <div className="goal-form-field">
            <label htmlFor="sp-startym">{t.sparplanStartMonth}</label>
            <input
              id="sp-startym" className="label-input" type="month" value={startYM}
              aria-invalid={fieldErrors.includes('startYM') ? true : undefined}
              aria-describedby={fieldErrors.includes('startYM') ? 'sp-startym-err' : undefined}
              onChange={e => { setStartYM(e.target.value); commit(monthly, ret, start, e.target.value); }}
            />
            {fieldErrors.includes('startYM') && (
              <span className="field-error" id="sp-startym-err" role="alert">{t.sparplanErrMonth}</span>
            )}
          </div>
        </div>
        {plan && (
          <button className="sparplan-delete-btn" onClick={removePlan}>
            🗑 {t.sparplanDelete}
          </button>
        )}

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
        {/* SR alternative for the projection: whole-year points as a hidden
            table. Hidden via the wrapper — a clipped table still asserts its
            intrinsic width and widened the page at 320px (main review §7). */}
        <div className="sr-only-table-wrap">
        <table>
          <caption>{t.sparplanTitle}</caption>
          <thead>
            <tr>
              <th scope="col">{t.tabYear}</th>
              <th scope="col">{t.sparplanWithGrowth}</th>
              <th scope="col">{t.sparplanDepositsOnly}</th>
            </tr>
          </thead>
          <tbody>
            {[0, 12, 24, 36, 48, 60].map(k => (
              <tr key={k}>
                <th scope="row">{yearLabel(k)}</th>
                <td>{money(Math.round(projData[k].growth))}</td>
                <td>{money(Math.round(projData[k].flat))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <ResponsiveContainer width="100%" height={200} aria-hidden="true">
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

      {plan && vsRows.length > 0 && hasVsData && (
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
            <span className="sparplan-legend-item"><span className="sparplan-swatch" style={{ background: TEAL }} />{t.totalSaved}</span>
            <span className="sparplan-legend-item"><span className="sparplan-swatch sparplan-swatch-dash" style={{ background: GRAY }} />{t.sparplanPlanLine}</span>
          </div>
          {/* SR alternative for plan-vs-reality; the badge above carries the
              verdict as visible text. Wrapper-hidden — see the projection table. */}
          <div className="sr-only-table-wrap">
          <table>
            <caption>{t.sparplanVsTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{t.colMonth}</th>
                <th scope="col">{t.totalSaved}</th>
                <th scope="col">{t.sparplanPlanLine}</th>
              </tr>
            </thead>
            <tbody>
              {vsRows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r.label}</th>
                  <td>{r.actualTotal === null ? t.notRecorded : money(Math.round(r.actualTotal))}</td>
                  <td>{money(Math.round(r.planTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <ResponsiveContainer width="100%" height={190} aria-hidden="true">
            <LineChart data={vsRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: tickColor, fontSize: 11 }} width={44} domain={vsDomain}
                tickFormatter={v => formatAxisTick(v, lang)} axisLine={false} tickLine={false}
              />
              <Tooltip content={<VsTooltip money={money} t={t} />} />
              <Line type="monotone" dataKey="actualTotal" name={t.totalSaved}
                stroke={TEAL} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="planTotal" name={t.sparplanPlanLine}
                stroke={GRAY} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
};
