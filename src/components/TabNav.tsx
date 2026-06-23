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
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
          <span className="tab-label-short">{t.short}</span>
        </button>
      ))}
    </div>
  );
};
