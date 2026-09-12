import type { ActiveTab } from '../types';
import { useLang } from '../i18n';

interface Props {
  active: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}

export const TabNav = ({ active, onChange }: Props) => {
  const { t } = useLang();
  const tabs: { id: ActiveTab; label: string; short: string; icon: string }[] = [
    { id: 'budget',  label: t.tabBudget,  short: t.tabBudget,        icon: '📋' },
    { id: 'followup', label: t.tabFollowUp, short: t.tabFollowUpShort, icon: '🧾' },
    { id: 'savings', label: t.tabSavings, short: t.tabSavingsShort,  icon: '📈' },
    { id: 'plan',    label: t.tabPlan,    short: t.tabPlanShort,     icon: '🎯' },
    { id: 'year',    label: t.tabYear,    short: t.tabYearShort,     icon: '📅' },
  ];

  return (
    <div className="tab-nav">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`tab-btn ${active === t.id ? 'tab-active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-label={t.label}
          aria-current={active === t.id ? 'page' : undefined}
        >
          {/* Visual-only spans: the accessible name is the aria-label above,
              so long+short labels don't read as "BudgetBudget". */}
          <span aria-hidden="true" className="tab-icon">{t.icon}</span>
          <span aria-hidden="true" className="tab-label">{t.label}</span>
          <span aria-hidden="true" className="tab-label-short">{t.short}</span>
        </button>
      ))}
    </div>
  );
};
