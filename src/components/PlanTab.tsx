import { useState, useId, useRef } from 'react';
import type { PlanData, SavingsGoal } from '../types';
import { generateId, makeGoalColor, shownName } from '../defaults';
import { validateNewGoal, parseAmount, type GoalFormError } from '../goalForm';
import { useLang, MONTHS } from '../i18n';
import { EditableAmount } from './EditableAmount';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
  totalIncome: number;
  totalSavings: number;
  year: number;
  month: number;
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
          <button
            type="button"
            className="goal-name"
            onClick={() => { setEditingName(true); setNameDraft(shownName(goal, lang)); }}
            title={t.clickToRename}
          >
            {shownName(goal, lang)}
          </button>
        )}
        <button className="delete-btn" onClick={onDelete} title={t.deleteGoal}
          aria-label={`${t.deleteGoal}: ${shownName(goal, lang)}`}>×</button>
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
            label={`${t.saved} — ${shownName(goal, lang)}`}
            showZero
          />
        </div>
        <div className="goal-amount-sep">{t.of}</div>
        <div className="goal-amount-block">
          <span className="goal-amount-label">{t.goal}</span>
          <EditableAmount
            value={goal.targetAmount}
            onChange={v => onUpdate({ ...goal, targetAmount: v })}
            color={goal.color}
            label={`${t.goal} — ${shownName(goal, lang)}`}
            showZero
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
        <label className="goal-deadline-label" htmlFor={`deadline-${goal.id}`}>{t.deadline}</label>
        <input
          id={`deadline-${goal.id}`}
          type="month"
          className="deadline-input"
          value={goal.deadline}
          onChange={e => onUpdate({ ...goal, deadline: e.target.value })}
        />
      </div>
    </div>
  );
};

// ── Extracted, reusable sections (used by PlanTab AND the Custom layout) ──

export const GoalsSection = ({ data, onChange }: { data: PlanData; onChange: (data: PlanData) => void }) => {
  const { t } = useLang();
  const fid = useId();

  // "+ New goal" opens a form instead of creating a goal immediately, so an
  // accidental tap no longer creates a persisted goal + linked budget row. The
  // goal (and its budget row) are created only on "Create goal" (UX review §15).
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [deadline, setDeadline] = useState('');

  // Validation error shown as visible text (not just a disabled button, per
  // fix plan 2026-07-12 §9). Cleared as soon as the user edits any field.
  const [formError, setFormError] = useState<GoalFormError | null>(null);

  // Blocks a rapid double-tap on "Create goal" from firing createGoal twice in
  // one commit (both calls would read the same stale goals list, dropping one).
  const submittingRef = useRef(false);

  const resetForm = () => {
    setName(''); setTarget(''); setSaved(''); setDeadline(''); setAdding(false);
    setFormError(null);
    submittingRef.current = false;
  };

  const createGoal = () => {
    if (submittingRef.current) return;
    const result = validateNewGoal(name, target);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    submittingRef.current = true;
    const savedNum = parseAmount(saved);
    const newGoal: SavingsGoal = {
      id: generateId(),
      budgetRowId: generateId(), // links a row in Budget → Sparande (created on confirm)
      name: result.name,
      userNamed: true,
      targetAmount: result.target,
      currentAmount: isNaN(savedNum) ? 0 : Math.max(0, savedNum),
      deadline,
      color: makeGoalColor(data.goals.length),
    };
    onChange({ ...data, goals: [...data.goals, newGoal] });
    resetForm();
  };

  const updateGoal = (updated: SavingsGoal) => {
    onChange({ ...data, goals: data.goals.map(g => g.id === updated.id ? updated : g) });
  };

  const deleteGoal = (id: string) => {
    onChange({ ...data, goals: data.goals.filter(g => g.id !== id) });
  };

  return (
    <section className="plan-section">
      <div className="plan-section-header">
        <h2 className="plan-section-title">🏆 {t.savingsGoals}</h2>
        {!adding && (
          <button className="add-goal-btn" onClick={() => setAdding(true)}>{t.newGoal}</button>
        )}
      </div>

      {adding && (
        <form className="goal-form" onSubmit={e => { e.preventDefault(); createGoal(); }}>
          <div className="goal-form-field">
            <label htmlFor={`${fid}-name`}>{t.goalNameLabel}</label>
            <input id={`${fid}-name`} className="label-input" value={name} autoFocus
              placeholder={t.newGoalName}
              onChange={e => { setName(e.target.value); setFormError(null); }} />
          </div>
          <div className="goal-form-grid">
            <div className="goal-form-field">
              <label htmlFor={`${fid}-target`}>{t.goal}</label>
              <input id={`${fid}-target`} className="label-input" inputMode="decimal" value={target}
                placeholder="0" onChange={e => { setTarget(e.target.value); setFormError(null); }} />
            </div>
            <div className="goal-form-field">
              <label htmlFor={`${fid}-saved`}>{t.saved}</label>
              <input id={`${fid}-saved`} className="label-input" inputMode="decimal" value={saved}
                placeholder="0" onChange={e => setSaved(e.target.value)} />
            </div>
            <div className="goal-form-field">
              <label htmlFor={`${fid}-deadline`}>{t.deadline}</label>
              <input id={`${fid}-deadline`} className="label-input" type="month" value={deadline}
                onChange={e => setDeadline(e.target.value)} />
            </div>
          </div>
          {formError && (
            <p className="goal-form-error" role="alert">
              {formError === 'name' ? t.goalErrorName : t.goalErrorTarget}
            </p>
          )}
          <div className="goal-form-actions">
            <button type="button" className="custom-secondary-btn" onClick={resetForm}>{t.cancel}</button>
            <button type="submit" className="custom-primary-btn">{t.createGoal}</button>
          </div>
        </form>
      )}

      {data.goals.length === 0 && !adding && (
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
  );
};

export const NotesSection = ({ data, onChange }: { data: PlanData; onChange: (data: PlanData) => void }) => {
  const { t } = useLang();
  return (
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
  );
};

export const PlanTab = ({ data, onChange, totalIncome, totalSavings, year, month }: Props) => {
  const { lang, t, money } = useLang();

  // ── Overview highlights (current month) ──
  // Real savings rate: money actually moved to savings this month ÷ income.
  // (totalSavings already excludes pension — see App / calculateSavingsMetrics.)
  const savingsRate = totalIncome > 0
    ? Math.max(0, Math.round((totalSavings / totalIncome) * 100))
    : 0;
  const totalTarget = data.goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalCurrent = data.goals.reduce((s, g) => s + g.currentAmount, 0);
  const goalProgress = totalTarget > 0
    ? Math.round((totalCurrent / totalTarget) * 100)
    : 0;
  const monthLabel = `${MONTHS[lang][month]} ${year}`;

  return (
    <div className="tab-content plan-tab">

      {/* ── Overview ── */}
      <section className="plan-section">
        <div className="plan-section-header">
          <h2 className="plan-section-title">📊 {t.planOverview}</h2>
        </div>

        {/* Highlight stat cards */}
        <div className="overview-highlights">
          <div className="overview-stat overview-stat-rate">
            <div className="overview-stat-label">{t.overviewSavingsRate}</div>
            <div className="overview-stat-value">{savingsRate}%</div>
          </div>
          <div className="overview-stat overview-stat-saved">
            <div className="overview-stat-label">{t.overviewSavedThisMonth}</div>
            <div className="overview-stat-value">{money(totalSavings)}</div>
            <div className="overview-stat-sub">{monthLabel}</div>
          </div>
          <div className="overview-stat overview-stat-goal">
            <div className="overview-stat-label">{t.overviewGoalProgress}</div>
            <div className="overview-stat-value">{goalProgress}%</div>
          </div>
        </div>

        {/* Goal progress summary */}
        <div className="overview-goals-summary">
          <h3 className="overview-subtitle">{t.goalProgressSummary}</h3>
          {data.goals.length === 0 ? (
            <div className="plan-empty">{t.noGoalsSummary}</div>
          ) : (
            <div className="overview-goal-list">
              {data.goals.map(goal => {
                const pct = goal.targetAmount > 0
                  ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
                  : 0;
                return (
                  <div className="overview-goal-row" key={goal.id}>
                    <span className="overview-goal-name">{shownName(goal, lang)}</span>
                    <div className="overview-goal-bar-track">
                      <div
                        className="overview-goal-bar-fill"
                        style={{ width: `${pct}%`, background: goal.color }}
                      />
                    </div>
                    <span className="overview-goal-pct" style={{ color: goal.color }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Goals ── */}
      <GoalsSection data={data} onChange={onChange} />

      {/* ── Notes ── */}
      <NotesSection data={data} onChange={onChange} />

    </div>
  );
};
