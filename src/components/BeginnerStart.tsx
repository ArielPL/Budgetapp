// ── Beginner's start — "have you made a budget before?" ────────────────────
//
// Testers on 2026-10-19: "it feels like you must know everything before you can
// use it", "I can't find where to write my salary", "ask questions at the start
// so the app knows what to prioritise". Ariel's answer: one question after the
// intro. Someone who has done this before gets today's start (template, empty
// budget, import). A beginner gets eight plain questions, one at a time, each
// skippable, and a budget of exactly what they answered — for this month, or
// for every month left this year, so the salary is typed once, not twelve times.
//
// Portals to document.body like the other first-run dialogs; nothing is stored
// until the last button, and that step can be undone.
//
// Also opened from the menu, to start over (Ariel, 2026-10-27): then it begins
// at the first question, and Back from there closes it.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { parseMoneyInput } from '../money';
import { sumRows, sumCategories } from '../metrics';
import { beginnerMonthData, shownName, type BeginnerAnswers } from '../defaults';

const KEYS: (keyof BeginnerAnswers)[] = ['salary', 'housing', 'electricity', 'food', 'phone', 'commute', 'loans', 'savings'];

interface Props {
  /** "Rows answered for which months": the button names them. */
  span: { from: string; to: string | null };
  onExpert: () => void;
  onTemplate: () => void;
  /** restOfYear: also every empty month after this one, through December. */
  onCreate: (answers: BeginnerAnswers, restOfYear: boolean) => Promise<boolean>;
  /** Opened from the menu: straight to the questions, no "made a budget before?". */
  restart?: boolean;
}

export const BeginnerStart = ({ span, onExpert, onTemplate, onCreate, restart = false }: Props) => {
  const { t, lang, money } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  // 'choice', then the questions by index, then the summary.
  const [step, setStep] = useState<'choice' | number | 'summary'>(restart ? 0 : 'choice');
  const [answers, setAnswers] = useState<BeginnerAnswers>({});
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  // Escape is the experienced path: today's start, nothing lost.
  useModalFocus(panel, true, onExpert);

  const goTo = (next: 'choice' | number | 'summary') => {
    setError(false);
    if (typeof next === 'number') {
      const v = answers[KEYS[next]];
      setDraft(v !== undefined ? String(v) : '');
    }
    setStep(next);
  };
  const advance = (from: number) => goTo(from + 1 < KEYS.length ? from + 1 : 'summary');

  const submit = (i: number) => {
    const parsed = parseMoneyInput(draft.trim());
    if (!parsed.ok && parsed.reason !== 'empty') { setError(true); return; }
    setAnswers(a => ({ ...a, [KEYS[i]]: parsed.ok && parsed.value > 0 ? parsed.value : undefined }));
    advance(i);
  };
  const skip = (i: number) => {
    setAnswers(a => ({ ...a, [KEYS[i]]: undefined }));
    advance(i);
  };

  const built = beginnerMonthData(answers, lang);
  const rows = [
    ...built.income.map(r => ({ id: r.id, label: shownName(r, lang), amount: r.amount })),
    ...built.expenses.flatMap(c => c.rows.map(r => ({ id: r.id, label: shownName(r, lang), amount: r.amount }))),
  ];
  const income = sumRows(built.income);
  const out = sumCategories(built.expenses);

  const create = async (restOfYear: boolean) => {
    if (busy) return;
    setBusy(true);
    try { await onCreate(answers, restOfYear); } finally { setBusy(false); }
  };

  let body;
  if (step === 'choice') {
    body = (
      <div className="intro-body beg-body">
        <div className="intro-emoji" aria-hidden="true">🧭</div>
        <h2 className="intro-title" id="beg-title">{t.startChoiceTitle}</h2>
        <p className="intro-text">{t.startChoiceBody}</p>
        <div className="beg-choices">
          <button type="button" className="beg-choice" onClick={onExpert}>
            <strong>{t.startExpert}</strong>
            <span>{t.startExpertSub}</span>
          </button>
          <button type="button" className="beg-choice is-main" onClick={() => goTo(0)}>
            <strong>{t.startBeginner}</strong>
            <span>{t.startBeginnerSub}</span>
          </button>
        </div>
      </div>
    );
  } else if (step === 'summary') {
    body = (
      <div className="intro-body beg-body">
        <h2 className="intro-title" id="beg-title">{t.begSummaryTitle}</h2>
        {rows.length === 0 ? (
          <>
            <p className="intro-text">{t.begEmpty}</p>
            <div className="beg-actions">
              <button type="button" className="custom-secondary-btn" onClick={() => goTo(KEYS.length - 1)}>{t.begBack}</button>
              <button type="button" className="custom-primary-btn" onClick={onTemplate}>{t.begTemplate}</button>
            </div>
          </>
        ) : (
          <>
            <ul className="beg-summary">
              {rows.map(r => (
                <li key={r.id}><span>{r.label}</span><span>{money(r.amount)}</span></li>
              ))}
              {income > 0 && (
                <li className={`beg-left${income - out < 0 ? ' is-negative' : ''}`}>
                  <span>{t.begLeftover}</span><span>{money(income - out)}</span>
                </li>
              )}
            </ul>
            <div className="beg-actions">
              <button type="button" className="custom-secondary-btn" onClick={() => goTo(KEYS.length - 1)}>{t.begBack}</button>
              {span.to && (
                // Ariel, 2026-10-20: not everyone wants the whole year at once.
                <button type="button" className="custom-secondary-btn" disabled={busy} onClick={() => void create(false)}>
                  {t.begCreateOne(span.from)}
                </button>
              )}
              <button type="button" className="custom-primary-btn" disabled={busy} onClick={() => void create(true)}>
                {span.to ? t.begCreate(span.from, span.to) : t.begCreateOne(span.from)}
              </button>
            </div>
          </>
        )}
      </div>
    );
  } else {
    const i = step;
    const q = t.begQuestions[i];
    body = (
      <form className="intro-body beg-body" onSubmit={e => { e.preventDefault(); submit(i); }}>
        <span className="intro-dots-visual beg-dots" aria-hidden="true">
          {KEYS.map((k, j) => <span key={k} className={`intro-dot${j <= i ? ' is-on' : ''}`} />)}
        </span>
        <h2 className="intro-title" id="beg-title">{q.title}</h2>
        <p className="intro-text">{q.hint}</p>
        <input
          key={i}
          className="label-input beg-input"
          inputMode="decimal"
          autoFocus
          aria-labelledby="beg-title"
          aria-invalid={error || undefined}
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(false); }}
        />
        {error && <p className="beg-error" role="alert">{t.invalidAmount}</p>}
        <div className="beg-actions">
          <button type="button" className="custom-secondary-btn" onClick={() => (i > 0 ? goTo(i - 1) : restart ? onExpert() : goTo('choice'))}>{t.begBack}</button>
          <button type="button" className="custom-secondary-btn" onClick={() => skip(i)}>{t.begSkip}</button>
          <button type="submit" className="custom-primary-btn">{t.begNext}</button>
        </div>
      </form>
    );
  }

  return createPortal(
    <>
      <div className="theme-backdrop intro-backdrop" />
      <div className="theme-panel intro-modal beg-modal" role="dialog" aria-modal="true"
        aria-labelledby="beg-title" tabIndex={-1} ref={panel}>
        {body}
      </div>
    </>,
    document.body,
  );
};
