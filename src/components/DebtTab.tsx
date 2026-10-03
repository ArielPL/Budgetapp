import { useId, useMemo, useState } from 'react';
import { useLang } from '../i18n';
import { appStorage } from '../storage';
import { generateId, shownName } from '../defaults';
import { parseMoneyInput } from '../money';
import { longDate, monthYear } from '../dateLabel';
import { loadActuals, actualContribution } from '../actuals';
import {
  compareStrategies, estimatedBalance, inPlan, monthlyTotal, kindFromLabel, DEBT_KINDS,
  type Debt, type DebtKind, type Strategy, type YearMonth,
} from '../debts';
import type { DebtState } from '../debtStore';
import type { BudgetRow } from '../types';

// ── Skuld — the way out of debt ────────────────────────────────────────────
//
// Ariel, 2026-10-03, from research into what debt advisers actually say:
// basics first (the budget), then the debts in an order the user chooses. The
// two orders are shown side by side with what each costs and when each ends;
// the app never says which is right. Every balance after the lender's own
// figure is an estimate, and says so.
//
// Everything the tab computes is in debts.ts and tested there. This file only
// asks, shows, and hands changes to App, which stores the debts and the
// budget row in one write.

interface Props {
  state: DebtState;
  /** The month on screen, for the budget row and "paid this month". */
  year: number;
  month: number;
  /** Whether a row can be added to the month on screen (it is not over). */
  canAddRow: boolean;
  /** What is left in the month's budget after every planned expense. */
  remaining: number;
  /** The rows of "Lån & skulder" in the month on screen. One with money in it
   *  and no debt behind it is shown here too, waiting for its details. */
  loanRows: BudgetRow[];
  /** Store `next`; with `row`, also put that row in the month on screen.
   *  Resolves to whether it was stored. */
  onSave: (next: DebtState, row?: { id: string; label: string; amount: number }) => Promise<boolean>;
  /** Remove a debt; with `removeRow`, its row in the month on screen too.
   *  Resolves to what to tell the user, or null when nothing was stored. */
  onDelete: (id: string, removeRow: boolean) => Promise<string | null>;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const DebtTab = ({ state, year, month, canAddRow, remaining, loanRows, onSave, onDelete }: Props) => {
  const { t, lang, money } = useLang();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /** The budget row whose details are being filled in. */
  const [completing, setCompleting] = useState<string | null>(null);
  /** The debt whose card is asking how to delete it. */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** What the last deletion did, until it is dismissed. */
  const [notice, setNotice] = useState<string | null>(null);
  const remove = async (id: string, removeRow: boolean) => {
    setDeleting(null);
    const said = await onDelete(id, removeRow);
    if (said) setNotice(said);
  };
  const [extraText, setExtraText] = useState(String(state.extraPerMonth || ''));

  // Plans start this calendar month, whatever month the app is showing: a
  // way out of debt begins today, not in the month being looked at.
  const now = useMemo<YearMonth>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }, []);
  const plans = useMemo(
    () => compareStrategies(state.debts, state.extraPerMonth, now),
    [state.debts, state.extraPerMonth, now],
  );
  const chosen = plans[state.strategy];
  const inWay = state.debts.filter(inPlan);
  const totalLeft = inWay.reduce((s, d) => s + estimatedBalance(d, now), 0);
  const perMonth = monthlyTotal(inWay);
  const byId = (id: string) => state.debts.find(d => d.id === id);
  // Rows added in the budget, not here: they cost something each month but
  // the tab knows nothing else about them yet (Ariel, 2026-10-03).
  const linked = new Set(state.debts.map(d => d.budgetRowId).filter(Boolean));
  // Not a row the user turned back into an ordinary budget row by deleting
  // only its debt: offering it again made Delete look as if it had failed.
  const plain = new Set(state.plainRows);
  const fromBudget = loanRows.filter(r => !linked.has(r.id) && !plain.has(r.id) && r.amount > 0);
  const when = (at: YearMonth | null) => (at ? monthYear(at, lang) : t.debtNotWithin);
  const pct = (n: number) => (lang === 'en' ? String(n) : String(n).replace('.', ','));
  /** Whether a debt's payment is a row in the month on screen. */
  const hasRow = (d: Debt) => d.budgetRowId !== undefined && loanRows.some(r => r.id === d.budgetRowId);

  // What Follow-up recorded under "Lån & skulder" in the month on screen.
  const paidThisMonth = useMemo(
    () => loadActuals(appStorage, year, month)
      .filter(e => e.categoryId === 'lan')
      .reduce((s, e) => s + actualContribution(e), 0),
    [year, month],
  );

  const saveExtra = () => {
    const parsed = parseMoneyInput(extraText || '0');
    if (!parsed.ok) { setExtraText(String(state.extraPerMonth || '')); return; }
    if (parsed.value !== state.extraPerMonth) void onSave({ ...state, extraPerMonth: parsed.value });
  };
  const choose = (strategy: Strategy) => {
    if (strategy !== state.strategy) void onSave({ ...state, strategy });
  };

  const strategyCard = (strategy: Strategy, title: string, sub: string) => {
    const plan = plans[strategy];
    const first = plan.payoffs[0];
    const on = state.strategy === strategy;
    return (
      <button
        className={`debt-way-card${on ? ' is-on' : ''}`}
        aria-pressed={on}
        onClick={() => choose(strategy)}
      >
        <span className="debt-way-name">{title}</span>
        <span className="debt-way-sub">{sub}</span>
        <span className="debt-way-free">{plan.debtFree ? t.debtFreeBy(when(plan.debtFree)) : t.debtNotWithin}</span>
        <span className="debt-way-fact">{t.debtInterest(money(plan.totalInterest))}</span>
        {first && (
          <span className="debt-way-fact">{t.debtFirstPaid(byId(first.id)?.name ?? '', when(first.at))}</span>
        )}
      </button>
    );
  };

  return (
    <div className="tab-content debt-tab">
      <section className="plan-section">
        <div className="plan-section-header">
          <h2 className="plan-section-title">{t.debtTitle}</h2>
          {!adding && (
            <button className="add-goal-btn" onClick={() => { setAdding(true); setEditing(null); }}>{t.debtAdd}</button>
          )}
        </div>
        <p className="debt-intro">{t.debtIntro}</p>
        {notice && (
          <p className="debt-notice" role="status">
            <span>{notice}</span>
            <button className="debt-notice-close" aria-label={t.themeClose} onClick={() => setNotice(null)}>✕</button>
          </p>
        )}

        {inWay.length > 0 && (
          <div className="overview-highlights debt-summary">
            <div className="overview-stat">
              <div className="overview-stat-label">{t.debtSummaryTotal}</div>
              <div className="overview-stat-value">{money(Math.round(totalLeft))}</div>
            </div>
            <div className="overview-stat">
              <div className="overview-stat-label">{t.debtSummaryMonthly}</div>
              <div className="overview-stat-value">{money(Math.round(perMonth))}</div>
            </div>
            <div className="overview-stat">
              <div className="overview-stat-label">{t.debtSummaryFree}</div>
              <div className="overview-stat-value">{chosen.debtFree ? when(chosen.debtFree) : t.debtNotWithin}</div>
            </div>
          </div>
        )}

        {adding && (
          <DebtForm
            canAddRow={canAddRow}
            rowMonth={monthYear({ year, month }, lang)}
            onCancel={() => setAdding(false)}
            onSubmit={async (debt, addRow) => {
              const withRow = addRow ? { ...debt, budgetRowId: generateId() } : debt;
              const ok = await onSave(
                { ...state, debts: [...state.debts, withRow] },
                withRow.budgetRowId
                  ? { id: withRow.budgetRowId, label: withRow.name, amount: withRow.monthlyPayment }
                  : undefined,
              );
              if (ok) setAdding(false);
            }}
          />
        )}

        {state.debts.length === 0 && fromBudget.length === 0 && !adding && (
          <div className="plan-empty">{t.debtEmpty}</div>
        )}

        {fromBudget.length > 0 && (
          <ul className="debt-list debt-list-pending">
            {fromBudget.map(r => {
              const label = shownName(r, lang);
              if (completing === r.id) {
                const kind = kindFromLabel(label);
                return (
                  <li className="debt-list-form" key={r.id}>
                    <DebtForm
                      draft={{
                        name: label, kind,
                        monthlyPayment: !r.period || r.period === 'month' ? r.amount : undefined,
                      }}
                      canAddRow={false}
                      rowMonth={monthYear({ year, month }, lang)}
                      onCancel={() => setCompleting(null)}
                      onSubmit={async debt => {
                        const withRow = { ...debt, budgetRowId: r.id };
                        const ok = await onSave(
                          { ...state, debts: [...state.debts, withRow] },
                          // The row is the user's; it is only rewritten in a
                          // month that is not over yet.
                          canAddRow ? { id: r.id, label: withRow.name, amount: withRow.monthlyPayment } : undefined,
                        );
                        if (ok) setCompleting(null);
                      }}
                    />
                  </li>
                );
              }
              return (
                <li className="debt-card debt-card-pending" key={r.id}>
                  <div className="debt-card-head">
                    <span className="debt-card-name">{label}</span>
                  </div>
                  <p className="debt-card-meta">{t.debtFromBudget(money(r.amount))}</p>
                  <p className="debt-card-hint">{t.debtFromBudgetHint}</p>
                  <div className="debt-card-actions">
                    <button className="custom-primary-btn" aria-label={t.debtCompleteFor(label)}
                      onClick={() => { setCompleting(r.id); setAdding(false); setEditing(null); }}>
                      {t.debtComplete}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <ul className="debt-list">
          {state.debts.map(d => {
            const payoff = chosen.payoffs.find(p => p.id === d.id);
            const growing = chosen.growing.includes(d.id) && !payoff;
            if (editing === d.id) {
              return (
                <li className="debt-list-form" key={d.id}>
                  <DebtForm
                    initial={d}
                    canAddRow={false}
                    rowMonth={monthYear({ year, month }, lang)}
                    onCancel={() => setEditing(null)}
                    onSubmit={async next => {
                      const updated = { ...next, id: d.id, budgetRowId: d.budgetRowId };
                      const ok = await onSave(
                        { ...state, debts: state.debts.map(x => (x.id === d.id ? updated : x)) },
                        d.budgetRowId && canAddRow
                          ? { id: d.budgetRowId, label: updated.name, amount: updated.monthlyPayment }
                          : undefined,
                      );
                      if (ok) setEditing(null);
                    }}
                  />
                </li>
              );
            }
            return (
              <li className="debt-card" key={d.id}>
                <div className="debt-card-head">
                  <span className="debt-card-name">{d.name}</span>
                  <span className="debt-card-kind">{t.debtKind(d.kind)}</span>
                </div>
                <div className="debt-card-amount">
                  <span className="num">{money(Math.round(estimatedBalance(d, now)))}</span>
                  <span className="debt-card-meta"> {t.debtLeft}</span>
                </div>
                <p className="debt-card-meta">
                  {t.debtAsOf(longDate(`${d.balanceDate}T12:00:00`, lang))}
                  {' · '}{t.debtRateShort(pct(d.ratePct))}
                  {' · '}{t.debtPerMonth(money(d.monthlyPayment))}
                </p>
                <p className={`debt-card-status${growing ? ' is-warning' : ''}`}>
                  {d.kind === 'mortgage' ? t.debtMortgageNote
                    : growing ? t.debtGrowing
                      : payoff ? t.debtPaidOff(when(payoff.at)) : t.debtNotWithin}
                </p>
                {deleting === d.id ? (
                  // Asked on the card, not in a system dialog: the choice has
                  // three answers, and the row's fate is part of the question.
                  <div className="debt-delete" role="group" aria-label={t.debtDeleteAsk(d.name)}>
                    <p className="debt-delete-ask">{t.debtDeleteAsk(d.name)}</p>
                    {hasRow(d) && <p className="debt-card-meta">{t.debtDeleteRowInfo(monthYear({ year, month }, lang))}</p>}
                    <div className="debt-delete-actions">
                      {hasRow(d) ? (
                        <>
                          <button className="custom-secondary-btn debt-delete-btn"
                            onClick={() => void remove(d.id, true)}>{t.debtDeleteBoth}</button>
                          <button className="custom-secondary-btn debt-delete-btn"
                            onClick={() => void remove(d.id, false)}>{t.debtDeleteOnly}</button>
                        </>
                      ) : (
                        <button className="custom-secondary-btn debt-delete-btn"
                          onClick={() => void remove(d.id, false)}>{t.debtDeleteShort}</button>
                      )}
                      <button className="custom-secondary-btn" onClick={() => setDeleting(null)}>{t.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <div className="debt-card-actions">
                    <button className="custom-secondary-btn" aria-label={t.debtEdit(d.name)}
                      onClick={() => { setEditing(d.id); setAdding(false); setDeleting(null); }}>
                      {t.debtEditShort}
                    </button>
                    <button className="custom-secondary-btn" aria-label={t.debtDelete(d.name)}
                      onClick={() => setDeleting(d.id)}>
                      {t.debtDeleteShort}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {inWay.length > 0 && (
        <section className="plan-section">
          <div className="plan-section-header">
            <h2 className="plan-section-title">{t.debtWayTitle}</h2>
          </div>
          <div className="goal-form-field debt-extra">
            <label htmlFor="debt-extra">{t.debtExtra}</label>
            <input
              id="debt-extra" className="label-input" inputMode="decimal" placeholder="0"
              value={extraText}
              onChange={e => setExtraText(e.target.value)}
              onBlur={saveExtra}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <div className="debt-way-grid">
            {strategyCard('avalanche', t.debtAvalanche, t.debtAvalancheSub)}
            {strategyCard('snowball', t.debtSnowball, t.debtSnowballSub)}
          </div>
          {/* Two identical cards look like a fault unless it is said why. */}
          {inWay.length > 1 && plans.avalanche.order.join() === plans.snowball.order.join() && (
            <p className="debt-note">{t.debtSameOrder}</p>
          )}
          <p className="debt-note">
            {plans.minimum.debtFree
              ? t.debtMinimumLine(when(plans.minimum.debtFree), money(plans.minimum.totalInterest))
              : t.debtMinimumNever}
          </p>
          <ol className="debt-order">
            {chosen.order.map(id => {
              const payoff = chosen.payoffs.find(p => p.id === id);
              return (
                <li key={id}>
                  <span>{byId(id)?.name}</span>
                  <span className="debt-card-meta">{payoff ? when(payoff.at) : t.debtNotWithin}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {state.debts.length > 0 && (
        <section className="plan-section debt-notes">
          {paidThisMonth > 0 && (
            <p className="debt-note">{t.debtPaidThisMonth(monthYear({ year, month }, lang), money(paidThisMonth))}</p>
          )}
          {remaining < 0 && <p className="debt-note debt-note-help">{t.debtOverBudget}</p>}
          {remaining >= 0 && state.extraPerMonth > remaining && (
            <p className="debt-note">{t.debtExtraOverRemaining(money(remaining))}</p>
          )}
          <p className="debt-note">{t.debtEstimateNote}</p>
        </section>
      )}
    </div>
  );
};

// ── The form, for a new debt and for changing one ──────────────────────────

interface FormProps {
  /** A debt being changed. */
  initial?: Debt;
  /** A new debt's starting values, e.g. from its budget row. */
  draft?: Partial<Debt>;
  canAddRow: boolean;
  rowMonth: string;
  onCancel: () => void;
  onSubmit: (debt: Debt, addRow: boolean) => Promise<void>;
}

const DebtForm = ({ initial, draft, canAddRow, rowMonth, onCancel, onSubmit }: FormProps) => {
  const { t, lang } = useLang();
  const fid = useId();
  // A number as this language writes it in a field: "2,135", not "2.135".
  const dec = (n: number) => (lang === 'en' ? String(n) : String(n).replace('.', ','));
  const start = initial ?? draft;
  const [name, setName] = useState(start?.name ?? '');
  const [kind, setKind] = useState<DebtKind>(start?.kind ?? 'loan');
  const [balance, setBalance] = useState(initial ? dec(initial.balance) : '');
  const [asOf, setAsOf] = useState(initial?.balanceDate ?? todayIso());
  const [rate, setRate] = useState(start?.ratePct !== undefined ? dec(start.ratePct) : '');
  const [payment, setPayment] = useState(start?.monthlyPayment !== undefined ? dec(start.monthlyPayment) : '');
  const [addRow, setAddRow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickKind = (k: DebtKind) => {
    setKind(k);
    // A CSN loan gets its name, never a rate: the rate is set by the
    // government every year, and one built into the app goes stale the next
    // January without anyone noticing (Codex, 2026-10-03; Ariel's call). The
    // user types the rate from their own statement.
    if (k === 'csn' && !name) setName('CSN');
  };

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setError(t.debtErrorName); return; }
    const b = parseMoneyInput(balance);
    const r = parseMoneyInput(rate);
    const p = parseMoneyInput(payment);
    if (!b.ok || !r.ok || !p.ok || r.value >= 100 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      setError(t.debtErrorNumbers);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        id: initial?.id ?? generateId(),
        name: name.trim(), kind, balance: b.value, balanceDate: asOf, ratePct: r.value, monthlyPayment: p.value,
      }, canAddRow && addRow);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="goal-form debt-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="goal-form-grid">
        <div className="goal-form-field">
          <label htmlFor={`${fid}-kind`}>{t.debtKindLabel}</label>
          <select id={`${fid}-kind`} className="label-input" value={kind} onChange={e => pickKind(e.target.value as DebtKind)}>
            {DEBT_KINDS.map(k => <option key={k} value={k}>{t.debtKind(k)}</option>)}
          </select>
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-name`}>{t.debtName}</label>
          <input id={`${fid}-name`} className="label-input" value={name} placeholder={t.debtNamePlaceholder}
            onChange={e => { setName(e.target.value); setError(null); }} />
        </div>
      </div>
      <div className="goal-form-grid">
        <div className="goal-form-field">
          <label htmlFor={`${fid}-balance`}>{t.debtBalance}</label>
          <input id={`${fid}-balance`} className="label-input" inputMode="decimal" placeholder="0" value={balance}
            onChange={e => { setBalance(e.target.value); setError(null); }} />
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-asof`}>{t.debtBalanceDate}</label>
          <input id={`${fid}-asof`} className="label-input" type="date" value={asOf}
            onChange={e => setAsOf(e.target.value)} />
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-rate`}>{t.debtRate}</label>
          <input id={`${fid}-rate`} className="label-input" inputMode="decimal" placeholder="0" value={rate}
            onChange={e => { setRate(e.target.value); setError(null); }} />
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-payment`}>{t.debtPayment}</label>
          <input id={`${fid}-payment`} className="label-input" inputMode="decimal" placeholder="0" value={payment}
            onChange={e => { setPayment(e.target.value); setError(null); }} />
        </div>
      </div>
      {kind === 'csn' && <p className="debt-note">{t.debtCsnHint}</p>}
      {canAddRow && !initial && (
        <label className="debt-form-check">
          <input type="checkbox" checked={addRow} onChange={e => setAddRow(e.target.checked)} />
          {t.debtAddToBudget(rowMonth)}
        </label>
      )}
      {error && <p className="goal-form-error" role="alert">{error}</p>}
      <div className="goal-form-actions">
        <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
        <button type="submit" className="custom-primary-btn" disabled={busy}>
          {initial ? t.debtSave : t.debtCreate}
        </button>
      </div>
    </form>
  );
};
