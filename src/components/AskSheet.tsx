import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CURRENCIES, useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { monthYear } from '../dateLabel';
import { isStandardCategoryId } from '../categorise';
import type { MonthData, SavingsGoal } from '../types';
import type { YearMonth } from '../debts';
import type { PeriodLocks } from '../periodLabel';
import { QuestionCards, type CardPreset, type NewGoalRequest } from './QuestionCards';
import { toLiteRt, toolSpecs } from '../ai/registry';
import { systemPrompt } from '../ai/prompt';
import { askMacModel } from '../ai/model';
import { amountsNotInQuestion, checkCall, type CheckedCall, type FieldValue, type Named } from '../ai/checks';
import { aiChangeOf, type AiChange } from '../ai/changes';
import type { RawCall } from '../ai/parseCall';
import type { WhatIfTarget } from '../tools';

// ── Budget AI: the "Ask" sheet ─────────────────────────────────────────────
//
// The user writes a question; the model picks ONE tool and fills in its
// fields; the app checks every field (ai/checks.ts) and then shows the same
// card the app already has, filled in — or the Confirm box for a change.
// Every figure comes from the app. A text reply carrying an amount the user
// never wrote is not shown: the model must not do sums.
//
// For now only in `npm run dev`, with the model on the developer's Mac
// (ai/model.ts). The add-on purchase decides it later (Ariel, 2026-10-23: the
// button shows only for those who bought it — no lock, no teaser).

interface Props {
  /** The month on screen and its budget, as in memory. */
  at: YearMonth;
  budget: MonthData;
  goals: SavingsGoal[];
  wallets: Named[];
  debts: { name: string }[];
  nameOf: (id: string) => string;
  periodStartDay: number | null;
  periodLocks: PeriodLocks;
  onCreateGoal: (goal: NewGoalRequest) => Promise<boolean>;
  /** A change to confirm: the sheet closes and the Confirm box takes over. */
  onChange: (change: AiChange) => void;
  onClose: () => void;
}

type Result =
  | { kind: 'thinking' }
  | { kind: 'offline' }
  | { kind: 'text'; text: string }
  | { kind: 'not-understood' }
  | { kind: 'open'; call: RawCall; checked: Extract<CheckedCall, { ok: true }> }
  | { kind: 'card'; preset: CardPreset; n: number }
  | { kind: 'elsewhere'; checked: Extract<CheckedCall, { ok: true }> };

/** The fields a choice fills in by name rather than by id: the checks match
 *  goals, wallets and rows by name. */
const BY_NAME = new Set(['goal', 'wallet', 'row']);

const ym = (v: FieldValue | undefined) => (v && typeof v === 'object' && 'year' in v ? v : undefined);

/** The card a checked call opens, or null for a tool without one here yet. */
function cardOf(c: Extract<CheckedCall, { ok: true }>, now: YearMonth): CardPreset | null {
  const v = c.values;
  switch (c.tool) {
    case 'category_spending': return { open: 'category', categoryId: v.category as string };
    case 'list_subscriptions': return { open: 'recurring' };
    case 'daily_allowance': return { open: 'perDay' };
    case 'budget_kept': return { open: 'kept', keptAt: ym(v.month) ?? now };
    case 'biggest_increases': return { open: 'rises' };
    case 'goal_eta': return { open: 'goal' };
    case 'search_purchases': return { open: null, query: v.query as string };
    case 'what_if': {
      const target = v.target as WhatIfTarget;
      return { open: 'whatIf', whatIf: { on: target.kind === 'income' ? 'income' : target.id, amount: v.change as number } };
    }
    case 'need_to_save':
      return { open: 'needToSave', need: { target: v.target_amount as number, by: ym(v.by_month)! } };
    case 'propose_create_goal':
      return { open: 'needToSave', need: { name: v.name as string, target: v.target_amount as number, by: ym(v.by_month)! } };
    default: return null;
  }
}

export const AskSheet = (p: Props) => {
  const { t, lang, currency } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const shown = useRef(0);
  useModalFocus(panel, true, p.onClose);

  const today = new Date();
  const now: YearMonth = { year: today.getFullYear(), month: today.getMonth() };
  const ctx = (q: string) => ({ budget: p.budget, goals: p.goals.map(g => ({ id: g.id, name: g.name })), wallets: p.wallets, question: q, now });

  /** What the app does with a call: a card, the Confirm box, or a question back. */
  const settle = (call: RawCall, q: string) => {
    const checked = checkCall(call, ctx(q));
    if (!checked.ok) return setResult({ kind: 'not-understood' });
    if (checked.open.length > 0) return setResult({ kind: 'open', call, checked });
    const change = aiChangeOf(checked);
    if (change) return p.onChange(change);
    const preset = cardOf(checked, now);
    shown.current += 1;
    setResult(preset ? { kind: 'card', preset, n: shown.current } : { kind: 'elsewhere', checked });
  };

  const send = async () => {
    const q = question.trim();
    if (!q || result?.kind === 'thinking') return;
    setResult({ kind: 'thinking' });
    const system = systemPrompt({
      lang, today, currency: CURRENCIES[currency].symbol, budget: p.budget,
      incomeName: t.income, goals: p.goals, debts: p.debts, wallets: p.wallets,
      amount: n => new Intl.NumberFormat(CURRENCIES[currency].locale).format(n), monthName: monthYear(now, lang),
    });
    const tools = toolSpecs(p.budget.expenses.map(c => (isStandardCategoryId(c.id) ? { id: c.id } : { id: c.id, name: c.name })))
      .map(toLiteRt);
    try {
      const a = await askMacModel(system, tools, q);
      if (a.call) return settle(a.call, q);
      const text = a.text.trim();
      setResult(text && amountsNotInQuestion(text, q).length === 0 ? { kind: 'text', text } : { kind: 'not-understood' });
    } catch {
      setResult({ kind: 'offline' });
    }
  };

  const pick = (field: string, choice: Named) => {
    if (result?.kind !== 'open') return;
    const value = BY_NAME.has(field) ? choice.name : choice.id;
    settle({ name: result.call.name, args: { ...result.call.args, [field]: value } }, question);
  };

  const body = () => {
    if (!result) return null;
    switch (result.kind) {
      case 'thinking': return <p className="q-note" role="status">{t.askThinking}</p>;
      case 'offline': return <p className="q-note q-note-warn" role="status">{t.askOffline}</p>;
      case 'not-understood': return <p className="q-note" role="status">{t.askNotUnderstood}</p>;
      case 'text': return <p className="ask-reply" role="status">{result.text}</p>;
      case 'open': {
        const withChoices = result.checked.open.find(o => o.choices && o.choices.length > 0);
        return (
          <div role="status">
            <p className="q-note">{withChoices ? t.askPick : t.askMissing}</p>
            {withChoices && (
              <div className="ask-choices">
                {withChoices.choices!.map(c => (
                  <button key={c.id} type="button" className="seg-btn" onClick={() => pick(withChoices.field, c)}>{c.name}</button>
                ))}
              </div>
            )}
          </div>
        );
      }
      case 'card':
        return (
          <QuestionCards key={result.n} preset={result.preset} shown={p.at} nameOf={p.nameOf}
            periodStartDay={p.periodStartDay} periodLocks={p.periodLocks} onCreateGoal={p.onCreateGoal} />
        );
      case 'elsewhere':
        return (
          <div role="status">
            <p className="q-note">{t.askElsewhere}</p>
            <p className="q-note ask-dev">{result.checked.tool} {JSON.stringify(result.checked.values)}</p>
          </div>
        );
    }
  };

  return createPortal(
    <>
      <div className="theme-backdrop" onClick={p.onClose} />
      <div ref={panel} className="theme-panel ask-sheet" role="dialog" aria-modal="true" aria-label={t.askTitle} tabIndex={-1}>
        <div className="ask-head">
          <h2 className="confirm-change-title">✨ {t.askTitle}</h2>
          <button className="utils-menu-close-btn" onClick={p.onClose} aria-label={t.themeClose}>✕</button>
        </div>
        <form className="ask-form" onSubmit={e => { e.preventDefault(); void send(); }}>
          <input className="label-input" value={question} onChange={e => setQuestion(e.target.value)}
            placeholder={t.askPlaceholder} aria-label={t.askTitle} enterKeyHint="send" />
          <button type="submit" className="custom-primary-btn" disabled={!question.trim() || result?.kind === 'thinking'}>{t.askSend}</button>
        </form>
        <div className="ask-answer">{body()}</div>
      </div>
    </>,
    document.body,
  );
};
