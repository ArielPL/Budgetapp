import { useId, useState } from 'react';
import { useLang } from '../i18n';
import { appStorage } from '../storage';
import { loadActuals } from '../actuals';
import { loadMonthData, loadPlanData, shownName, standardExpenseCategory, storageKey } from '../defaults';
import { monthYear, shortDay } from '../dateLabel';
import { budgetMonthOf, periodRange, type PeriodLocks } from '../periodLabel';
import { spanMonths } from '../span';
import { addMonths, type YearMonth } from '../debts';
import { PENSION_CATEGORY_ID } from '../metrics';
import {
  categoryOverMonths, recurringPayments, biggestRises, perDayLeft, budgetKept, goalForecasts,
  RECURRING_MIN_MONTHS, COMPARE_MIN_MONTHS,
  type Basis, type MonthEntries,
} from '../questions';
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

type QuestionId = 'category' | 'recurring' | 'rises' | 'perDay' | 'kept' | 'goal';
const QUESTIONS: QuestionId[] = ['category', 'recurring', 'perDay', 'kept', 'rises', 'goal'];
const ICONS: Record<QuestionId, string> = {
  category: '🛒', recurring: '🔁', rises: '📈', perDay: '📅', kept: '⚖️', goal: '🎯',
};

interface Props {
  /** A category's name as Follow-up shows it; used for ids no budget names. */
  nameOf: (id: string) => string;
  periodStartDay: number | null;
  periodLocks: PeriodLocks;
}

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const withEntries = (months: YearMonth[]): MonthEntries[] =>
  months.map(m => ({ ...m, entries: loadActuals(appStorage, m.year, m.month) }));

export const QuestionCards = ({ nameOf, periodStartDay, periodLocks }: Props) => {
  const { t, lang, money } = useLang();
  const [open, setOpen] = useState<QuestionId | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const pickId = useId();

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
    const r = (n: number) => money(Math.round(n));
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
                {headline(t.qRecurringAnswer(a.items.length, r(a.perMonth)), t.qRecurringYear(r(a.perMonth * 12)))}
                {lines(a.items.map(i => ({
                  key: i.text, label: i.text, value: r(i.typical), sub: `· ${t.qRecurringSeen(i.months)}`,
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
            {headline(diff > 0 ? t.qKeptNo(r(diff), month(last)) : t.qKeptYes(r(-diff), month(last)))}
            {lines(a.lines.map(l => ({
              key: l.id, label: name(l.id), value: t.qKeptRow(r(l.actual), r(l.planned)),
              sub: l.actual > l.planned ? `· +${r(l.actual - l.planned)}` : undefined,
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
    }
  };

  return (
    <section className="q-card" aria-label={t.qTitle}>
      {open === null ? (
        <>
          <h3 className="q-title">💬 {t.qTitle}</h3>
          <p className="q-lead">{t.qLead}</p>
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
