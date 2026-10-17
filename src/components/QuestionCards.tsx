import { useId, useState } from 'react';
import { useLang } from '../i18n';
import { parseMoneyInput } from '../money';
import { appStorage } from '../storage';
import { loadActuals } from '../actuals';
import { loadMonthData, loadPlanData, shownName, standardExpenseCategory, storageKey } from '../defaults';
import { monthYear, shortDay } from '../dateLabel';
import { budgetMonthOf, periodDays, periodRange, type PeriodLocks } from '../periodLabel';
import { spanMonths } from '../span';
import { addMonths, type YearMonth } from '../debts';
import { PENSION_CATEGORY_ID } from '../metrics';
import {
  categoryOverMonths, recurringPayments, biggestRises, perDayLeft, budgetKept, goalForecasts,
  RECURRING_MIN_MONTHS, COMPARE_MIN_MONTHS,
  type Basis, type MonthEntries,
} from '../questions';
import { whatIf, needToSave, searchEntries, type WhatIfTarget } from '../tools';
import { calculateBudgetMetrics } from '../metrics';
import { ConfirmChange } from './ConfirmChange';
import type { MonthData } from '../types';

// ── Question cards ─────────────────────────────────────────────────────────
//
// Six questions as buttons; the app works out each answer from what is stored
// (questions.ts) the moment it is asked. No language model, nothing sent
// anywhere. Every answer says what it stands on — how many months, how much is
// unsorted — and a question the data cannot answer says so instead of guessing.
//
// "Now" is today's budget month, not the month on screen: the questions are in
// the present tense ("this year", "last month", "the rest of the month").

// The last two are tools rather than questions (tools.ts): the user tries a
// change, and nothing is stored unless a confirmed step makes it real.
type QuestionId = 'category' | 'recurring' | 'rises' | 'perDay' | 'kept' | 'goal' | 'whatIf' | 'needToSave';
const QUESTIONS: QuestionId[] = ['category', 'recurring', 'perDay', 'kept', 'rises', 'goal', 'whatIf', 'needToSave'];
const ICONS: Record<QuestionId, string> = {
  category: '🛒', recurring: '🔁', rises: '📈', perDay: '📅', kept: '⚖️', goal: '🎯', whatIf: '🧮', needToSave: '💰',
};

/** What "Create as savings goal" asks the app to store. */
export interface NewGoalRequest {
  name: string;
  target: number;
  saved: number;
  /** "YYYY-MM" */
  deadline: string;
  /** Put in the savings row of `at`'s budget. */
  monthly: number;
  at: YearMonth;
}

/** An amount that may be negative: "−500" is a cut. Typed minus signs vary. */
function parseSigned(raw: string): number | null {
  const s = raw.trim();
  const negative = /^[-−–]/.test(s);
  const r = parseMoneyInput(negative ? s.slice(1) : s);
  return r.ok ? (negative ? -r.value : r.value) : null;
}

const toMonthInput = (at: YearMonth) => `${at.year}-${String(at.month + 1).padStart(2, '0')}`;
const fromMonthInput = (v: string): YearMonth | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1 } : null;
};

interface Props {
  /** A category's name as Follow-up shows it; used for ids no budget names. */
  nameOf: (id: string) => string;
  periodStartDay: number | null;
  periodLocks: PeriodLocks;
  /** Store a goal from "What do I need to save?". Absent: no create button. */
  onCreateGoal?: (goal: NewGoalRequest) => Promise<boolean>;
}

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const withEntries = (months: YearMonth[]): MonthEntries[] =>
  months.map(m => ({ ...m, entries: loadActuals(appStorage, m.year, m.month) }));

export const QuestionCards = ({ nameOf, periodStartDay, periodLocks, onCreateGoal }: Props) => {
  const { t, lang, money } = useLang();
  const [open, setOpen] = useState<QuestionId | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const pickId = useId();
  const formId = useId();
  // What if…?
  const [whatIfOn, setWhatIfOn] = useState<string>('income');
  const [whatIfText, setWhatIfText] = useState('');
  // What do I need to save?
  const [needName, setNeedName] = useState('');
  const [needTarget, setNeedTarget] = useState('');
  const [needBy, setNeedBy] = useState('');
  const [needSaved, setNeedSaved] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Search
  const [query, setQuery] = useState('');

  const today = new Date();
  const now: YearMonth = budgetMonthOf(localIso(today), periodStartDay, periodLocks)
    ?? { year: today.getFullYear(), month: today.getMonth() };
  const budgetOf = (at: YearMonth): MonthData | null =>
    appStorage.getItem(storageKey(at.year, at.month)) ? loadMonthData(at.year, at.month, lang) : null;
  // Read on every render rather than kept: the store is an in-memory cache,
  // and a category added since must appear.
  const current = budgetOf(now);

  const name = (id: string) => {
    const own = current?.expenses.find(c => c.id === id);
    if (own) return shownName(own, lang);
    const std = standardExpenseCategory(id, lang);
    return std ? shownName(std, lang) : nameOf(id);
  };
  const choices = (current?.expenses ?? []).filter(c => c.id !== 'sparande' && c.id !== PENSION_CATEGORY_ID);
  const chosenId = categoryId ?? (choices.find(c => c.id === 'mat') ?? choices[0])?.id ?? 'mat';
  const month = (at: YearMonth) => monthYear(at, lang);
  const span = (ms: YearMonth[]) => `${month(ms[0])} – ${month(ms[ms.length - 1])}`;

  const ask = (q: QuestionId): string => {
    switch (q) {
      case 'category': return t.qCategoryYear(name(chosenId));
      case 'recurring': return t.qRecurring;
      case 'rises': return t.qRises;
      case 'perDay': return t.qPerDay;
      case 'kept': return t.qKept;
      case 'goal': return t.qGoal;
      case 'whatIf': return t.qWhatIf;
      case 'needToSave': return t.qNeedToSave;
    }
  };

  const basisNote = (basis: Basis) => (
    <>
      {basis.covered < basis.asked && basis.covered > 0 && (
        <p className="q-note">{t.qBasisMonths(basis.covered, basis.asked)}</p>
      )}
      {basis.unsorted.amount > 0 && (
        <p className="q-note q-note-warn">{t.qBasisUnsorted(money(Math.round(basis.unsorted.amount)), basis.unsorted.count)}</p>
      )}
    </>
  );
  const lines = (rows: Array<{ key: string; label: string; value: string; sub?: string }>) => (
    <ul className="q-lines">
      {rows.map(r => (
        <li key={r.key}>
          <span className="q-line-label">{r.label}</span>
          <span className="q-line-value">{r.value}{r.sub && <span className="q-line-sub"> {r.sub}</span>}</span>
        </li>
      ))}
    </ul>
  );
  const headline = (text: string, sub?: string) => (
    <div className="q-headline">
      <div className="q-headline-main">{text}</div>
      {sub && <div className="q-headline-sub">{sub}</div>}
    </div>
  );

  const answer = (q: QuestionId) => {
    // Derived figures (averages, per day) in whole units; an amount that was
    // actually charged exactly, in the currency's own precision — "$34.99",
    // not "$35" (store screenshots, 2026-10-05).
    const r = (n: number) => money(Math.round(n));
    const x = (n: number) => money(n);
    switch (q) {
      case 'category': {
        const months = withEntries(spanMonths(now.year, now.month, now.month + 1));
        const a = categoryOverMonths(months, chosenId);
        return (
          <>
            <label className="q-pick" htmlFor={pickId}>
              {t.qCategoryPick}{' '}
              <select id={pickId} className="label-input" value={chosenId} onChange={e => setCategoryId(e.target.value)}>
                {choices.map(c => <option key={c.id} value={c.id}>{shownName(c, lang)}</option>)}
              </select>
            </label>
            {a.basis.covered === 0 ? <p className="q-note">{t.qNothing}</p> : (
              <>
                {headline(t.qCategoryTotal(r(a.total), now.year), a.average !== null ? t.qCategoryAverage(r(a.average)) : undefined)}
                {lines(a.perMonth.map(m => ({
                  key: `${m.year}_${m.month}`, label: month(m), value: m.amount === null ? '–' : r(m.amount),
                })))}
                {a.basis.covered < a.basis.asked && <p className="q-note">{t.qUnknownMonth}</p>}
                {basisNote(a.basis)}
              </>
            )}
          </>
        );
      }
      case 'recurring': {
        const a = recurringPayments(withEntries(spanMonths(now.year, now.month, 6)));
        if (a.status === 'too-little') return <p className="q-note">{t.qTooLittle(RECURRING_MIN_MONTHS, a.basis.covered)}</p>;
        return (
          <>
            {a.items.length === 0 ? <p className="q-note">{t.qRecurringNone}</p> : (
              <>
                {headline(t.qRecurringAnswer(a.items.length, x(a.perMonth)), t.qRecurringYear(x(a.perMonth * 12)))}
                {lines(a.items.map(i => ({
                  key: i.text, label: i.text, value: x(i.typical), sub: `· ${t.qRecurringSeen(i.months)}`,
                })))}
              </>
            )}
            <p className="q-note">{t.qRecurringRule}</p>
            {/* Unsorted entries are searched too (an unsorted gym was found),
                so they cannot hide a subscription: only the months are noted. */}
            {basisNote({ ...a.basis, unsorted: { amount: 0, count: 0 } })}
          </>
        );
      }
      case 'rises': {
        const recentMonths = spanMonths(now.year, now.month - 1, 3);
        const earlierMonths = spanMonths(now.year, now.month - 4, 3);
        const a = biggestRises(withEntries(earlierMonths), withEntries(recentMonths));
        if (a.status === 'too-little') {
          return <p className="q-note">{t.qTooLittle(COMPARE_MIN_MONTHS * 2, a.earlier.covered + a.recent.covered)}</p>;
        }
        return (
          <>
            <p className="q-note">{t.qRisesWindows(span(recentMonths), span(earlierMonths))}</p>
            {a.risers.length === 0 ? <p className="q-note">{t.qRisesNone}</p> : lines(a.risers.map(c => ({
              key: c.id, label: name(c.id), value: `+${r(c.after - c.before)}`,
              sub: `· ${r(c.before)} → ${r(c.after)} ${t.qRisesPerMonth}`,
            })))}
            {basisNote({
              asked: a.earlier.asked + a.recent.asked,
              covered: a.earlier.covered + a.recent.covered,
              unsorted: {
                amount: a.earlier.unsorted.amount + a.recent.unsorted.amount,
                count: a.earlier.unsorted.count + a.recent.unsorted.count,
              },
            })}
          </>
        );
      }
      case 'perDay': {
        const budget = budgetOf(now);
        if (!budget) return <p className="q-note">{t.qNoBudget(month(now))}</p>;
        const to = periodRange(now.year, now.month, periodStartDay ?? 1, periodLocks).to;
        const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysLeft = Math.round((to.getTime() - midnight.getTime()) / 86_400_000) + 1;
        const a = perDayLeft(budget, loadActuals(appStorage, now.year, now.month), daysLeft);
        return (
          <>
            {a.state === 'left' && a.perDay !== null && headline(t.qPerDayAnswer(r(a.perDay)), t.qPerDayLeft(r(a.left), a.daysLeft))}
            {a.state === 'used-up' && headline(t.qPerDayUsedUp)}
            {a.state === 'none-planned' && headline(t.qPerDayNonePlanned)}
            {a.state === 'over' && headline(t.qPerDayOver(r(-a.left)))}
            <p className="q-note">{a.through ? t.qPerDayThrough(shortDay(a.through, lang)) : t.qPerDayNothingYet(month(now))}</p>
            <p className="q-note">{t.qPerDayRule}</p>
            {a.unsorted.amount > 0 && (
              <p className="q-note q-note-warn">{t.qBasisUnsorted(r(a.unsorted.amount), a.unsorted.count)}</p>
            )}
          </>
        );
      }
      case 'kept': {
        const last = addMonths(now, -1);
        const budget = budgetOf(last);
        const entries = loadActuals(appStorage, last.year, last.month);
        if (!budget || entries.length === 0) return <p className="q-note">{t.qKeptNothing(month(last))}</p>;
        const a = budgetKept(budget, entries);
        const diff = a.actualTotal - a.plannedTotal;
        return (
          <>
            {headline(diff > 0 ? t.qKeptNo(x(diff), month(last)) : t.qKeptYes(x(-diff), month(last)))}
            {lines(a.lines.map(l => ({
              key: l.id, label: name(l.id), value: t.qKeptRow(x(l.actual), x(l.planned)),
              sub: l.actual > l.planned ? `· +${x(l.actual - l.planned)}` : undefined,
            })))}
            <p className="q-note">{t.qKeptRule}</p>
            {a.unsorted.amount > 0 && (
              <p className="q-note q-note-warn">{t.qBasisUnsorted(r(a.unsorted.amount), a.unsorted.count)}</p>
            )}
          </>
        );
      }
      case 'goal': {
        const goals = loadPlanData(lang).goals;
        if (goals.length === 0) return <p className="q-note">{t.qGoalNone}</p>;
        const forecasts = goalForecasts(goals, budgetOf(now) ?? { income: [], expenses: [], savings: [] } as unknown as MonthData, now);
        return (
          <>
            {lines(forecasts.map(f => ({
              key: f.goal.id,
              label: shownName(f.goal, lang),
              value: f.kind === 'reached' ? t.qGoalReached
                : f.kind === 'no-monthly' ? '–'
                  : t.qGoalAt(month(f.at)),
              sub: f.kind === 'on-its-way'
                ? `· ${t.qGoalMonthly(r(f.monthly))}${f.late === null ? '' : ` · ${f.late === 0 ? t.qGoalInTime : t.qGoalLate(f.late)}`}`
                : f.kind === 'no-monthly' ? `· ${t.qGoalNoMonthly(month(now))}` : undefined,
            })))}
            <p className="q-note">{t.qGoalRule}</p>
          </>
        );
      }
      case 'whatIf': {
        const budget = budgetOf(now);
        if (!budget) return <p className="q-note">{t.qNoBudget(month(now))}</p>;
        const targets = budget.expenses.filter(c => c.id !== PENSION_CATEGORY_ID);
        const on = whatIfOn === 'income' || targets.some(c => c.id === whatIfOn) ? whatIfOn : 'income';
        const target: WhatIfTarget = on === 'income' ? { kind: 'income' } : { kind: 'category', id: on };
        const delta = parseSigned(whatIfText) ?? 0;
        const a = whatIf(budget, target, delta, periodDays(now.year, now.month, periodStartDay, periodLocks));
        const change = (b: number, c: number) => (b === c ? r(b) : `${r(b)} → ${r(c)}`);
        return (
          <>
            <p className="q-note">{t.qWhatIfLead(month(now))}</p>
            <div className="q-form">
              <label htmlFor={`${formId}-on`}>{t.qWhatIfWhat}</label>
              <select id={`${formId}-on`} className="label-input" value={on} onChange={e => setWhatIfOn(e.target.value)}>
                <option value="income">{t.qWhatIfIncome}</option>
                {targets.map(c => <option key={c.id} value={c.id}>{shownName(c, lang)}</option>)}
              </select>
              <label htmlFor={`${formId}-amount`}>{t.qWhatIfAmount}</label>
              <input id={`${formId}-amount`} className="label-input" inputMode="decimal" placeholder="1500"
                value={whatIfText} onChange={e => setWhatIfText(e.target.value)} />
            </div>
            <p className="q-note">{t.qWhatIfHint}</p>
            {lines([
              { key: 'remaining', label: t.qWhatIfRemaining, value: change(a.before.remaining, a.after.remaining) },
              { key: 'perDay', label: t.qWhatIfPerDay, value: change(a.before.perDay, a.after.perDay) },
              {
                key: 'savings', label: t.qWhatIfSavings,
                value: a.before.savings === a.after.savings ? r(a.before.savings) : change(a.before.savings, a.after.savings),
                sub: a.before.savings === a.after.savings ? `· ${t.qWhatIfSame}` : undefined,
              },
            ])}
          </>
        );
      }
      case 'needToSave': {
        const target = parseMoneyInput(needTarget);
        const saved = parseMoneyInput(needSaved || '0');
        const by = fromMonthInput(needBy || toMonthInput(addMonths(now, 8)));
        const a = target.ok && saved.ok && by ? needToSave(target.value, saved.value, now, by) : null;
        const budget = budgetOf(now);
        const remaining = budget ? calculateBudgetMetrics(budget).remaining : 0;
        const name = needName.trim() || t.toolGoalDefaultName;
        return (
          <>
            <div className="q-form">
              <label htmlFor={`${formId}-name`}>{t.qNeedName}</label>
              <input id={`${formId}-name`} className="label-input" placeholder={t.qNeedNamePlaceholder}
                value={needName} onChange={e => setNeedName(e.target.value)} />
              <label htmlFor={`${formId}-target`}>{t.qNeedTarget}</label>
              <input id={`${formId}-target`} className="label-input" inputMode="decimal" placeholder="30000"
                value={needTarget} onChange={e => setNeedTarget(e.target.value)} />
              <label htmlFor={`${formId}-by`}>{t.qNeedBy}</label>
              <input id={`${formId}-by`} className="label-input" type="month"
                value={needBy || toMonthInput(addMonths(now, 8))} onChange={e => setNeedBy(e.target.value)} />
              <label htmlFor={`${formId}-saved`}>{t.qNeedSaved}</label>
              <input id={`${formId}-saved`} className="label-input" inputMode="decimal" placeholder="0"
                value={needSaved} onChange={e => setNeedSaved(e.target.value)} />
            </div>
            {a?.kind === 'reached' && <p className="q-note">{t.qNeedReached}</p>}
            {a?.kind === 'past' && <p className="q-note q-note-warn">{t.qNeedPast}</p>}
            {a?.kind === 'ok' && by && target.ok && saved.ok && (
              <>
                {headline(t.qNeedAnswer(r(a.perMonth)), t.qNeedSub(r(a.left), a.months))}
                {remaining > 0 && <p className="q-note">{t.qNeedShare(Math.round((a.perMonth / remaining) * 100), month(now))}</p>}
                {onCreateGoal && (
                  <button className="custom-primary-btn q-act" onClick={() => setConfirming(true)}>{t.qNeedCreate}</button>
                )}
                {confirming && onCreateGoal && (
                  <ConfirmChange
                    title={t.toolGoalTitle}
                    lines={[
                      { label: t.toolGoalName, after: name },
                      { label: t.qNeedTarget, after: x(target.value) },
                      ...(saved.value > 0 ? [{ label: t.qNeedSaved, after: x(saved.value) }] : []),
                      { label: t.qNeedBy, after: month(by) },
                      { label: t.toolGoalInBudget(month(now)), after: t.toolPerMonth(r(a.perMonth)) },
                    ]}
                    onClose={() => setConfirming(false)}
                    onConfirm={async () => {
                      const ok = await onCreateGoal({
                        name, target: target.value, saved: saved.value,
                        deadline: toMonthInput(by), monthly: a.perMonth, at: now,
                      });
                      if (ok) {
                        setNeedName(''); setNeedTarget(''); setNeedBy(''); setNeedSaved('');
                        setOpen('goal');
                      }
                      return ok;
                    }}
                  />
                )}
              </>
            )}
          </>
        );
      }
    }
  };

  /** Search through the last twelve months' purchases, under the questions. */
  const search = () => {
    const a = query.trim() ? searchEntries(withEntries(spanMonths(now.year, now.month, 12)), query) : null;
    const x = (n: number) => money(n);
    return (
      <div className="q-search">
        <label className="q-search-label" htmlFor={`${formId}-search`}>🔍 {t.qSearch}</label>
        <input id={`${formId}-search`} className="label-input" type="search" placeholder={t.qSearchPlaceholder}
          value={query} onChange={e => setQuery(e.target.value)} />
        {a && (a.count === 0 ? <p className="q-note">{t.qSearchNone(query.trim())}</p> : (
          <div role="status">
            {headline(x(a.total), t.qSearchSub(a.count))}
            {lines(a.months.map(m => ({
              key: `${m.year}_${m.month}`, label: month(m), value: x(m.amount), sub: `· ${t.qSearchCount(m.count)}`,
            })))}
            {a.mostlyIn && <p className="q-note">{t.qSearchMostly(name(a.mostlyIn))}</p>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="q-card" aria-label={t.qTitle}>
      {open === null ? (
        <>
          <h3 className="q-title">💬 {t.qTitle}</h3>
          <p className="q-lead">{t.qLead}</p>
          {search()}
          <div className="q-list">
            {QUESTIONS.map(q => (
              <button key={q} className="q-ask" onClick={() => setOpen(q)}>
                <span aria-hidden="true">{ICONS[q]}</span> {ask(q)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button className="q-back" onClick={() => setOpen(null)}>← {t.qBack}</button>
          <h3 className="q-title">{ask(open)}</h3>
          <div className="q-answer" role="status">{answer(open)}</div>
        </>
      )}
    </section>
  );
};
