import { useState } from 'react';
import type { PlanData, SavingsGoal } from '../types';
import { generateId, makeGoalColor, shownName } from '../defaults';
import { useLang, MONTHS } from '../i18n';
import { EditableAmount } from './EditableAmount';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
}

const GoalCard = ({ goal, onUpdate, onDelete }: {
  goal: SavingsGoal;
  onUpdate: (g: SavingsGoal) => void;
  onDelete: () => void;
}) => {
  const { lang, t } = useLang();
  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(goal.name);

  const commitName = () => {
    onUpdate({ ...goal, name: nameDraft || goal.name, userNamed: true });
    setEditingName(false);
  };

  return (
    <div className="goal-card" style={{ borderLeftColor: goal.color }}>
      <div className="goal-header">
        {editingName ? (
          <input
            className="label-input goal-name-input"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
          />
        ) : (
          <span className="goal-name" onClick={() => { setEditingName(true); setNameDraft(shownName(goal, lang)); }}>
            {shownName(goal, lang)}
          </span>
        )}
        <button className="delete-btn" onClick={onDelete} title={t.deleteGoal}>×</button>
      </div>
      {goal.budgetRowId && (
        <div className="goal-budget-link" title={t.linkedRowTitle}>
          📋 {t.linkedToBudget}
        </div>
      )}

      <div className="goal-amounts">
        <div className="goal-amount-block">
          <span className="goal-amount-label">{t.saved}</span>
          <EditableAmount
            value={goal.currentAmount}
            onChange={v => onUpdate({ ...goal, currentAmount: v })}
            color={goal.color}
          />
        </div>
        <div className="goal-amount-sep">{t.of}</div>
        <div className="goal-amount-block">
          <span className="goal-amount-label">{t.goal}</span>
          <EditableAmount
            value={goal.targetAmount}
            onChange={v => onUpdate({ ...goal, targetAmount: v })}
            color={goal.color}
          />
        </div>
        {goal.deadline && (
          <div className="goal-deadline">
            📅 {(() => {
              const [y, m] = goal.deadline.split('-');
              return `${MONTHS[lang][parseInt(m) - 1]} ${y}`;
            })()}
          </div>
        )}
      </div>

      <div className="goal-bar-track">
        <div
          className="goal-bar-fill"
          style={{ width: `${pct}%`, background: goal.color }}
        />
      </div>
      <div className="goal-pct" style={{ color: goal.color }}>{pct}%</div>

      <div className="goal-deadline-edit">
        <label className="goal-deadline-label">{t.deadline}</label>
        <input
          type="month"
          className="deadline-input"
          value={goal.deadline}
          onChange={e => onUpdate({ ...goal, deadline: e.target.value })}
        />
      </div>
    </div>
  );
};

export const PlanTab = ({ data, onChange }: Props) => {
  const { t } = useLang();
  const addGoal = () => {
    const newGoal: SavingsGoal = {
      id: generateId(),
      budgetRowId: generateId(), // will create a linked row in Budget → Sparande
      name: t.newGoalName,
      targetAmount: 0,
      currentAmount: 0,
      deadline: '',
      color: makeGoalColor(data.goals.length),
    };
    onChange({ ...data, goals: [...data.goals, newGoal] });
  };

  const updateGoal = (updated: SavingsGoal) => {
    onChange({ ...data, goals: data.goals.map(g => g.id === updated.id ? updated : g) });
  };

  const deleteGoal = (id: string) => {
    onChange({ ...data, goals: data.goals.filter(g => g.id !== id) });
  };

  return (
    <div className="tab-content plan-tab">

      {/* ── Goals ── */}
      <section className="plan-section">
        <div className="plan-section-header">
          <h2 className="plan-section-title">🏆 {t.savingsGoals}</h2>
          <button className="add-goal-btn" onClick={addGoal}>{t.newGoal}</button>
        </div>
        {data.goals.length === 0 && (
          <div className="plan-empty">{t.noGoals}</div>
        )}
        <div className="goals-grid">
          {data.goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onUpdate={updateGoal}
              onDelete={() => deleteGoal(goal.id)}
            />
          ))}
        </div>
      </section>

      {/* ── Notes ── */}
      <section className="plan-section">
        <div className="plan-section-header">
          <h2 className="plan-section-title">📝 {t.notes}</h2>
        </div>
        <textarea
          className="plan-notes"
          placeholder={t.notesPlaceholder}
          value={data.notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
          rows={8}
        />
      </section>

    </div>
  );
};
