import { useLang } from '../i18n';
import { pickInsight, type Insight, type InsightInput } from '../insight';

// One sentence about the month, under the summary cards. Renders nothing when
// there is nothing worth saying — an empty month should stay quiet rather than
// pad itself with a hollow observation.

const text = (insight: Insight, t: ReturnType<typeof useLang>['t'], money: (n: number) => string) => {
  switch (insight.kind) {
    case 'deficit': return t.insightDeficit(money(insight.over));
    case 'savingsDown': return t.insightSavingsDown(money(insight.amount));
    case 'goalClose': return t.insightGoalClose(insight.name, money(insight.remaining));
    case 'savingsStreak': return t.insightSavingsStreak(insight.months);
    case 'savedRate': return t.insightSavedRate(insight.pct);
    case 'topCategory': return t.insightTopCategory(insight.name, insight.pct);
  }
};

export const InsightLine = (input: InsightInput) => {
  const { t, money } = useLang();
  const insight = pickInsight(input);
  if (!insight) return null;

  // A deficit is the one case that earns a warning tone, and the two earned
  // observations get a positive one. Everything else stays neutral on purpose:
  // an app that colours every observation trains people to stop opening it.
  const warn = insight.kind === 'deficit';
  const good = insight.kind === 'goalClose' || insight.kind === 'savingsStreak';
  const tone = warn ? ' insight-line-warn' : good ? ' insight-line-good' : '';
  return (
    <div className={`insight-line${tone}`} role="status">
      <span className="insight-line-icon" aria-hidden="true">{good ? '🎯' : '💡'}</span>
      <span>{text(insight, t, money)}</span>
    </div>
  );
};
