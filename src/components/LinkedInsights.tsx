import type { ActualEntry, MonthData, SavingsGoal } from '../types';
import { useLang, MONTHS } from '../i18n';
import { shownName } from '../defaults';
import { sumRows, categoryTotal } from '../metrics';
import { sumByCategory, INCOME_ACTUAL_ID } from '../actuals';
import { spendingBreakdown } from '../spending';
import type { PeriodLocks } from '../periodLabel';
import { largestCategory, linkedSummary, SAVINGS_CATEGORY, type InsightSource } from '../customLinked';
import { targetState, inSentence } from './CustomV3';
import { DailyBudget } from './DailyBudget';

// ── Blocks that show what the app already knows ────────────────────────────
//
// A linked panel can show more than the budget's rows: what actually happened
// (Follow-up's imported transactions), a savings goal (Plan), and a couple of
// figures the budget tab works out. None of them computes anything new. Each
// reads the same function the tab it comes from uses — sumByCategory for the
// outcome, the goal's own amounts, DailyBudget itself — so a number here can
// never disagree with the same number one tab away.

interface Props {
  source: InsightSource;
  /** The name last seen, for a category or goal this month does not have. */
  fallbackName?: string;
  data: MonthData;
  goals: SavingsGoal[];
  /** This budget month's imported and hand-entered transactions. */
  entries: ActualEntry[];
  year: number;
  month: number;
  monthLabel: string;
  periodStartDay: number | null;
  periodLocks: PeriodLocks;
}

export const InsightContent = (props: Props) => {
  const { source } = props;
  if (source.kind === 'actual') return <ActualBlock {...props} id={source.id} />;
  if (source.kind === 'goal') return <GoalBlock {...props} id={source.id} />;
  return <KpiBlock {...props} metric={source.metric} />;
};

const Head = ({ tag, icon, title }: { tag: string; icon: string; title: string }) => (
  <>
    <div className="cv3-kind-tag">{tag}</div>
    <div className="cv3-title-row">
      <span className="cv3-title-icon" aria-hidden="true">{icon}</span>
      <h3 className="custom-block-title">{title}</h3>
    </div>
  </>
);

// ── Outcome: budgeted against what actually happened ──
const ActualBlock = ({ id, fallbackName, data, entries, monthLabel }: Props & { id: string }) => {
  const { t, lang, money } = useLang();
  const isIncome = id === INCOME_ACTUAL_ID;
  const cat = isIncome ? undefined : data.expenses.find(c => c.id === id);
  const name = isIncome ? t.income : cat ? shownName(cat, lang) : (fallbackName ?? '');
  const budget = isIncome ? sumRows(data.income) : cat ? categoryTotal(cat) : 0;
  // Absent is not zero: a category nothing was filed under has no outcome yet.
  const actual: number | undefined = sumByCategory(entries)[id];
  const filed = entries.filter(e => e.categoryId === id).length;
  // Money still waiting in Övrigt could belong here — said as a range, never
  // guessed into the total. Income is not spending, so it has none.
  const unsorted = isIncome ? 0 : spendingBreakdown(entries).unsorted.amount;

  const head = <Head tag={`🧾 ${t.kindActual}`} icon={isIncome ? '💵' : (cat?.icon ?? '🧾')} title={name} />;
  if (entries.length === 0) {
    return <>{head}<p className="cv3-insight-note">{t.actualNoEntries(monthLabel)}</p></>;
  }
  if (actual === undefined) {
    return (
      <>
        {head}
        <div className="cv3-insight-big"><span className="amount-unknown">–</span></div>
        <p className="cv3-insight-note">{t.actualNothingHere(name)}</p>
        {unsorted > 0 && <p className="cv3-insight-note">{t.actualUnsorted(money(unsorted))}</p>}
      </>
    );
  }
  const state = budget > 0 ? targetState(actual, budget, !isIncome) : null;
  const status = !state ? null
    : isIncome ? (state === 'reached' ? t.actualIncomeDone : t.actualIncomeToCome(money(budget - actual)))
      : state === 'over' ? t.actualOver(money(actual - budget))
        : t.actualLeft(money(budget - actual));
  return (
    <>
      {head}
      <div className="cv3-insight-big">{money(actual)}</div>
      <p className="cv3-insight-sub">
        {budget > 0 ? t.actualOfBudget(money(budget)) : t.actualNoBudget} · {t.actualCount(filed)}
      </p>
      {state && (
        <div className={`cv3-target cv3-target-${state}`}>
          <div className="cv3-target-track">
            <div className="cv3-target-fill" style={{ width: `${Math.min(100, Math.round((actual / budget) * 100))}%` }} />
          </div>
          <div className="cv3-target-label"><span className="cv3-target-status">{status}</span></div>
        </div>
      )}
      {unsorted > 0 && <p className="cv3-insight-note">{t.actualUnsorted(money(unsorted))}</p>}
    </>
  );
};

// ── A savings goal from Plan ──
const GoalBlock = ({ id, fallbackName, goals, data, monthLabel }: Props & { id: string }) => {
  const { t, lang, money } = useLang();
  const goal = goals.find(g => g.id === id);
  if (!goal) {
    return (
      <>
        <Head tag={`🎯 ${t.kindGoal}`} icon="🎯" title={fallbackName ?? ''} />
        <p className="cv3-insight-note">{t.goalMissing}</p>
      </>
    );
  }
  const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
  // The goal's own row in this month's savings category, when it has one.
  const row = goal.budgetRowId
    ? data.expenses.find(c => c.id === SAVINGS_CATEGORY)?.rows.find(r => r.id === goal.budgetRowId)
    : undefined;
  const deadline = /^\d{4}-\d{2}$/.test(goal.deadline)
    ? `${inSentence(MONTHS[lang][Number(goal.deadline.slice(5)) - 1], lang)} ${goal.deadline.slice(0, 4)}` : null;
  return (
    <>
      <Head tag={`🎯 ${t.kindGoal}`} icon="🎯" title={shownName(goal, lang)} />
      <div className="cv3-insight-big">{money(goal.currentAmount)}</div>
      <p className="cv3-insight-sub">{t.goalOf(money(goal.targetAmount))} · {pct}%</p>
      <div className="cv3-target">
        <div className="cv3-target-track">
          <div className="cv3-target-fill" style={{ width: `${pct}%`, background: goal.color }} />
        </div>
      </div>
      {deadline && <p className="cv3-insight-note">📅 {t.goalBy(deadline)}</p>}
      {row && <p className="cv3-insight-note">{t.goalThisMonth(money(row.amount), monthLabel)}</p>}
    </>
  );
};

// ── A figure the budget tab already works out ──
const KpiBlock = ({ metric, data, year, month, periodStartDay, periodLocks }: Props & { metric: 'largest' | 'perDay' }) => {
  const { t, lang, money } = useLang();
  if (metric === 'perDay') {
    const s = linkedSummary(data);
    // What the budget tab shows under the same heading: income minus every
    // budgeted expense, savings included — "Kvar efter sparande".
    return s.income > 0
      ? <DailyBudget remaining={s.remaining - s.saved} year={year} month={month}
          periodStartDay={periodStartDay} periodLocks={periodLocks} />
      : (
        <>
          <Head tag={`📊 ${t.kindKpi}`} icon="💸" title={t.dailyBudgetTitle} />
          <p className="cv3-insight-note">{t.kpiNoIncome}</p>
        </>
      );
  }
  const largest = largestCategory(data);
  const cat = largest ? data.expenses.find(c => c.id === largest.id) : undefined;
  return (
    <>
      <Head tag={`📊 ${t.kindKpi}`} icon={cat?.icon ?? '📊'} title={t.kpiLargest} />
      {largest && cat ? (
        <>
          <div className="cv3-insight-big">{shownName(cat, lang)}</div>
          <p className="cv3-insight-sub">{money(largest.amount)} · {t.kpiShare(largest.share)}</p>
        </>
      ) : <p className="cv3-insight-note">{t.kpiNothing}</p>}
    </>
  );
};
