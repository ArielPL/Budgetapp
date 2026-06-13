import type { ActiveTab } from '../types';

interface Props {
  active: ActiveTab;
  onChange: (tab: ActiveTab) => void;
}

const TABS: { id: ActiveTab; label: string; short: string; icon: string }[] = [
  { id: 'budget',  label: 'Budget',                   short: 'Budget',   icon: '📋' },
  { id: 'savings', label: 'Sparande & Investeringar', short: 'Sparande', icon: '📈' },
  { id: 'plan',    label: 'Plan',                     short: 'Plan',     icon: '🎯' },
];

export const TabNav = ({ active, onChange }: Props) => (
  <div className="tab-nav">
    {TABS.map(t => (
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
