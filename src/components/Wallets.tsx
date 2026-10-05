import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLang } from '../i18n';
import { parseMoneyInput } from '../money';
import { generateId } from '../defaults';
import { shortDay } from '../dateLabel';
import { appStorage } from '../storage';
import { commitStorageChangesOutcome } from '../storageWrite';
import { captureKeys, type UndoEntry } from '../undo';
import {
  newTrip, newBlank, walletSummary, loadWallets, walletsChange, WALLETS_KEY, OPEN_PANEL_KEY,
  type Wallet, type WalletExpense, type WalletKind, type WalletPot,
} from '../wallets';

// ── Wallets: the panel switcher, a new trip, and the wallet itself ─────────
//
// Sketched with Ariel on 2026-10-04: a switcher at the top of Custom lists the
// budget and every wallet. A wallet starts empty — the user names it, gives it
// a total and makes its own parts — or from the trip template's four parts.
// Separate from the budget: nothing here is counted in a month. Writes go
// through `onChange`, which resolves once stored; the screen changes only then.
//
// A change is a FUNCTION of the wallet, not a finished wallet: two quick taps
// each built a whole new wallet from the same old one, and the second write
// put back what the first had removed (deep review 2026-10-04, P1). Changes
// now wait in line and each is applied to what the one before it stored.

const ICON: Record<WalletKind, string> = { blank: '👛', trip: '✈️' };

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── The switcher ───────────────────────────────────────────────────────────

export const PanelSwitcher = ({ wallets, openId, budgetTag, onOpen, onNew }: {
  wallets: Wallet[];
  /** The wallet on screen, or null for the budget. */
  openId: string | null;
  /** "Linked" / "Separate", or null before a kind of panel is chosen. */
  budgetTag: string | null;
  onOpen: (id: string | null) => void;
  onNew: () => void;
}) => {
  const { t, money } = useLang();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  // Closes like any menu: a tap anywhere else, or Escape (Ariel, 2026-10-04).
  useEffect(() => {
    if (!expanded) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setExpanded(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [expanded]);
  const current = wallets.find(w => w.id === openId);
  const today = todayIso();
  const pick = (id: string | null) => { setExpanded(false); onOpen(id); };
  const row = (w: Wallet) => {
    const s = walletSummary(w, today);
    return (
      <li key={w.id}>
        <button className={`wallet-switch-row${w.id === openId ? ' is-current' : ''}`} onClick={() => pick(w.id)}
          aria-current={w.id === openId ? 'true' : undefined}>
          <span className="wallet-switch-icon" aria-hidden="true">{ICON[w.kind]}</span>
          <span className="wallet-switch-text">
            <span className="wallet-switch-name">{w.name}{w.archived ? ` · ${t.wArchived}` : ''}</span>
            <span className="wallet-switch-sub">{t.wLeftList(money(Math.round(s.left)), money(w.total))}</span>
          </span>
          <span className="wallet-tag">{t.wTagWallet}</span>
        </button>
      </li>
    );
  };
  return (
    <div className="wallet-switch" ref={box}>
      <button className="wallet-switch-toggle" aria-expanded={expanded} aria-controls={listId}
        onClick={() => setExpanded(e => !e)}>
        <span aria-hidden="true">{current ? ICON[current.kind] : '📊'}</span> {current ? current.name : t.wMyBudget}
        <span className="wallet-switch-caret" aria-hidden="true">▾</span>
      </button>
      {expanded && (
        <div className="wallet-switch-panel" id={listId}>
          <div className="wallet-switch-title">{t.wPanels}</div>
          <ul className="wallet-switch-list">
            <li>
              <button className={`wallet-switch-row${openId === null ? ' is-current' : ''}`} onClick={() => pick(null)}
                aria-current={openId === null ? 'true' : undefined}>
                <span className="wallet-switch-icon" aria-hidden="true">📊</span>
                <span className="wallet-switch-text"><span className="wallet-switch-name">{t.wMyBudget}</span></span>
                {budgetTag && <span className="wallet-tag wallet-tag-budget">{budgetTag}</span>}
              </button>
            </li>
            {wallets.filter(w => !w.archived).map(row)}
            {wallets.filter(w => w.archived).map(row)}
          </ul>
          <button className="wallet-switch-new" onClick={() => { setExpanded(false); onNew(); }}>+ {t.wNew}</button>
        </div>
      )}
    </div>
  );
};

// ── The area: switcher plus whatever is open ───────────────────────────────
//
// Used twice: at the top of Custom, where "My budget" is the Custom panel, and
// as a screen of its own from the menu (any layout), where "My budget" goes
// back to the budget (`onLeave`).

export const WalletArea = ({ budget, budgetTag, onLeave, onRecordUndo }: {
  /** Shown when no wallet is open; null on the menu's own screen. */
  budget: ReactNode | null;
  budgetTag: string | null;
  /** Back to the budget, for the menu's own screen. */
  onLeave?: () => void;
  onRecordUndo: (entry: UndoEntry) => void;
}) => {
  const { t } = useLang();
  const [wallets, setWallets] = useState<Wallet[]>(() => loadWallets(appStorage));
  const [openId, setOpenId] = useState<string | null>(() => {
    const all = loadWallets(appStorage);
    const v = appStorage.getItem(OPEN_PANEL_KEY);
    if (v && all.some(w => w.id === v)) return v;
    // From the menu there is no budget to show: open a wallet if there is one.
    return budget === null ? (all.find(w => !w.archived) ?? all[0])?.id ?? null : null;
  });
  const [creating, setCreating] = useState(() => budget === null && loadWallets(appStorage).length === 0);

  const open = (id: string | null) => {
    setCreating(false);
    if (id === null && onLeave) { onLeave(); return; }
    setOpenId(id);
    // Where the panel opens next time: a convenience, so a failure is not news.
    try {
      if (id) appStorage.setItem(OPEN_PANEL_KEY, id); else appStorage.removeItem(OPEN_PANEL_KEY);
    } catch { /* opens on the budget next time */ }
  };
  // What storage last confirmed, and the line changes wait in. A change is
  // applied to `stored` only when its turn comes, so it always builds on
  // every change before it — never on a screen that has not caught up yet.
  const stored = useRef<Wallet[]>(wallets);
  const line = useRef<Promise<unknown>>(Promise.resolve());
  /** Apply `change` to the wallets as last stored, store the result, and only
   *  then show it. `undo` records the step back for a removal: taken in turn,
   *  so it holds exactly the state this change replaced. */
  const save = (
    change: (all: Wallet[]) => Wallet[], undo?: 'deleteWallet' | 'deleteWalletExpense',
  ): Promise<boolean> => {
    const run = line.current.then(async () => {
      const next = change(stored.current);
      if (next === stored.current) return true;
      const before = undo ? captureKeys(appStorage, [WALLETS_KEY]) : null;
      const outcome = await commitStorageChangesOutcome(appStorage, [walletsChange(next)]);
      if (outcome !== 'stored') {
        alert(outcome === 'partial' ? t.changePartlySaved : t.changeNotSaved);
        return false;
      }
      stored.current = next;
      setWallets(next);
      if (undo && before) onRecordUndo({ at: new Date().toISOString(), action: undo, changes: before });
      return true;
    });
    // One refused change must not stop the ones queued behind it.
    line.current = run.catch(() => false);
    return run;
  };
  /** A change to one wallet; nothing if it has gone in the meantime. */
  const changeWallet = (id: string, change: (w: Wallet) => Wallet, undo?: 'deleteWalletExpense') =>
    save(all => (all.some(w => w.id === id) ? all.map(w => (w.id === id ? change(w) : w)) : all), undo);
  const current = wallets.find(w => w.id === openId) ?? null;

  let content: ReactNode;
  if (creating) {
    content = (
      <NewWallet
        onCancel={() => { setCreating(false); if (!current && budget === null) onLeave?.(); }}
        onCreate={async w => {
          if (!(await save(all => [...all, w]))) return false;
          open(w.id);
          return true;
        }} />
    );
  } else if (current) {
    content = (
      <WalletView key={current.id} wallet={current}
        onChange={(change, removedExpense) =>
          changeWallet(current.id, change, removedExpense ? 'deleteWalletExpense' : undefined)}
        onDelete={async () => {
          if (!window.confirm(t.wDeleteConfirm(current.name))) return;
          const id = current.id;
          if (await save(all => all.filter(w => w.id !== id), 'deleteWallet')) open(null);
        }} />
    );
  } else {
    content = budget;
  }
  return (
    <>
      <PanelSwitcher wallets={wallets} openId={creating ? null : openId} budgetTag={budgetTag}
        onOpen={open} onNew={() => setCreating(true)} />
      {content}
    </>
  );
};

// ── A new wallet: empty, or from the trip template ───────────────────────

export const NewWallet = ({ onCreate, onCancel }: {
  onCreate: (w: Wallet) => Promise<boolean>;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  const fid = useId();
  const [kind, setKind] = useState<WalletKind>('blank');
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setError(t.wErrName); return; }
    const amount = parseMoneyInput(total);
    if (!amount.ok || amount.value <= 0) { setError(t.wErrAmount); return; }
    if (from && to && to < from) { setError(t.wErrDates); return; }
    setBusy(true);
    try {
      const base = { id: generateId(), name, total: amount.value, from: from || undefined, to: to || undefined };
      await onCreate(kind === 'trip'
        ? newTrip({
          ...base,
          potNames: { travel: t.wPotTravel, stay: t.wPotStay, food: t.wPotFood, fun: t.wPotFun },
          newId: generateId,
        })
        : newBlank(base));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wallet">
      <h2 className="wallet-title">{ICON[kind]} {t.wNew}</h2>
      <p className="wallet-lead">{t.wNewLead}</p>
      <div className="wallet-kind" role="group" aria-label={t.wStartFrom}>
        <span className="wallet-kind-label">{t.wStartFrom}</span>
        {(['blank', 'trip'] as const).map(k => (
          <button key={k} type="button" className={`seg-btn${kind === k ? ' seg-active' : ''}`}
            aria-pressed={kind === k} onClick={() => setKind(k)}>
            {ICON[k]} {k === 'blank' ? t.wKindBlank : t.wKindTrip}
          </button>
        ))}
      </div>
      <form className="goal-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div className="goal-form-grid">
          <div className="goal-form-field">
            <label htmlFor={`${fid}-name`}>{t.wName}</label>
            <input id={`${fid}-name`} className="label-input" value={name}
              placeholder={kind === 'trip' ? t.wNamePlaceholder : t.wNamePlaceholderBlank}
              onChange={e => { setName(e.target.value); setError(null); }} />
          </div>
          <div className="goal-form-field">
            <label htmlFor={`${fid}-total`}>{t.wTotal}</label>
            <input id={`${fid}-total`} className="label-input" inputMode="decimal" placeholder="0" value={total}
              onChange={e => { setTotal(e.target.value); setError(null); }} />
          </div>
        </div>
        <p className="wallet-sub">{t.wDatesOptional}</p>
        <div className="goal-form-grid">
          <div className="goal-form-field">
            <label htmlFor={`${fid}-from`}>{t.wFrom}</label>
            <input id={`${fid}-from`} className="label-input" type="date" value={from}
              onChange={e => { setFrom(e.target.value); setError(null); }} />
          </div>
          <div className="goal-form-field">
            <label htmlFor={`${fid}-to`}>{t.wTo}</label>
            <input id={`${fid}-to`} className="label-input" type="date" value={to}
              onChange={e => { setTo(e.target.value); setError(null); }} />
          </div>
        </div>
        <p className="debt-note">{kind === 'trip' ? t.wTripNote : t.wBlankNote}</p>
        {error && <p className="goal-form-error" role="alert">{error}</p>}
        <div className="goal-form-actions">
          <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
          <button type="submit" className="custom-primary-btn" disabled={busy}>{t.wCreate}</button>
        </div>
      </form>
    </div>
  );
};

// ── The wallet ─────────────────────────────────────────────────────────────

export const WalletView = ({ wallet, onChange, onDelete }: {
  wallet: Wallet;
  /** Apply `change` to the wallet as last stored; resolves to whether it was
   *  stored. An expense taken out says so, so the step back can be offered. */
  onChange: (change: (w: Wallet) => Wallet, removedExpense?: boolean) => Promise<boolean>;
  onDelete: () => void;
}) => {
  const { t, lang, money } = useLang();
  const [adding, setAdding] = useState(false);
  const [addingPot, setAddingPot] = useState(false);
  const [editing, setEditing] = useState(false);
  const today = todayIso();
  const s = walletSummary(wallet, today);
  const potName = (id: string) => wallet.pots.find(p => p.id === id)?.name ?? t.wUnassigned;
  const pct = wallet.total > 0 ? Math.min(100, Math.max(0, (s.spent / wallet.total) * 100)) : 0;
  const r = (n: number) => money(Math.round(n));

  if (editing) {
    return <WalletEdit wallet={wallet} onCancel={() => setEditing(false)}
      onSave={async change => { if (await onChange(change)) setEditing(false); }} />;
  }

  const timing = s.timing.kind === 'before' ? t.wStartsIn(s.timing.days)
    : s.timing.kind === 'during' ? t.wDaysLeft(s.timing.daysLeft)
      : s.timing.kind === 'after' ? t.wEnded : null;

  return (
    <div className="wallet">
      <span className="wallet-tag">{t.wTagSeparate}</span>

      <div className="wallet-hero">
        <div className="wallet-hero-label">{t.wLeft}</div>
        <div className={`wallet-hero-value${s.left < 0 ? ' is-over' : ''}`}>{r(s.left)}</div>
        <div className="wallet-bar" aria-hidden="true">
          <div className={`wallet-bar-fill${s.left < 0 ? ' is-over' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="wallet-hero-sub">
          {s.left < 0 ? t.wOver(r(-s.left)) : t.wUsed(r(s.spent), r(wallet.total))}
          {timing && ` · ${timing}`}
        </div>
        {s.timing.kind === 'during' && s.left > 0 && (
          <div className="wallet-hero-sub">{t.wPerDay(r(s.left / s.timing.daysLeft))}</div>
        )}
      </div>

      {/* Only when the parts promise more than there is: parts that leave some
          of the total unplanned are an ordinary way to build a wallet. */}
      {s.plannedInPots > wallet.total && (
        <p className="debt-note">{t.wPotsDiffer(r(s.plannedInPots), r(wallet.total))}</p>
      )}

      <ul className="wallet-pots">
        {s.pots.map(({ pot, spent }) => (
          <li key={pot.id} className="wallet-pot">
            <div className="wallet-pot-head">
              <span className="wallet-pot-name">{pot.name}</span>
              <span className={`wallet-pot-amount${spent > pot.planned ? ' is-over' : ''}`}>
                {r(spent)} <span className="wallet-pot-planned">/ {r(pot.planned)}</span>
              </span>
            </div>
            <div className="wallet-bar wallet-bar-thin" aria-hidden="true">
              <div className={`wallet-bar-fill${spent > pot.planned ? ' is-over' : ''}`}
                style={{ width: `${pot.planned > 0 ? Math.min(100, (spent / pot.planned) * 100) : spent > 0 ? 100 : 0}%` }} />
            </div>
          </li>
        ))}
        {wallet.pots.length > 0 && s.unassigned > 0 && (
          <li className="wallet-pot">
            <div className="wallet-pot-head">
              <span className="wallet-pot-name">{t.wUnassigned}</span>
              <span className="wallet-pot-amount">{r(s.unassigned)}</span>
            </div>
          </li>
        )}
      </ul>
      {wallet.pots.length === 0 && !addingPot && <p className="wallet-sub">{t.wNoPots}</p>}
      {addingPot ? (
        <PotForm onCancel={() => setAddingPot(false)}
          onAdd={async pot => {
            if (await onChange(w => ({ ...w, pots: [...w.pots, pot] }))) setAddingPot(false);
          }} />
      ) : (
        <button className="wallet-add-pot" onClick={() => setAddingPot(true)}>{t.wAddPot}</button>
      )}

      {adding ? (
        <ExpenseForm pots={wallet.pots} onCancel={() => setAdding(false)}
          onAdd={async e => {
            if (await onChange(w => ({ ...w, expenses: [...w.expenses, e] }))) setAdding(false);
          }} />
      ) : (
        <button className="wallet-add" onClick={() => setAdding(true)}>{t.wAddExpense}</button>
      )}

      <h3 className="wallet-section">{t.wExpenses}</h3>
      {wallet.expenses.length === 0 ? <p className="wallet-sub">{t.wNoExpenses}</p> : (
        <ul className="wallet-expenses">
          {[...wallet.expenses].reverse().map(e => (
            <li key={e.id} className="wallet-expense">
              <span className="wallet-expense-text">
                {e.text || potName(e.potId)}
                <span className="wallet-expense-meta">{shortDay(e.date, lang)} · {potName(e.potId)}</span>
              </span>
              <span className="wallet-expense-amount">{r(e.amount)}</span>
              <button className="wallet-expense-delete" aria-label={t.wDeleteExpense(e.text || potName(e.potId))}
                onClick={() => void onChange(w => ({ ...w, expenses: w.expenses.filter(x => x.id !== e.id) }), true)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="wallet-footer">
        <button className="custom-secondary-btn" onClick={() => setEditing(true)}>{t.wEdit}</button>
        <button className="custom-secondary-btn" onClick={() => {
          // Says which way, rather than flipping whatever is stored by then:
          // a double tap must not archive and bring back again.
          const archived = !wallet.archived;
          void onChange(w => ({ ...w, archived }));
        }}>
          {wallet.archived ? t.wUnarchive : t.wArchive}
        </button>
        <button className="custom-secondary-btn wallet-danger" onClick={onDelete}>{t.wDelete}</button>
      </div>
    </div>
  );
};

const ExpenseForm = ({ pots, onAdd, onCancel }: {
  pots: WalletPot[];
  onAdd: (e: WalletExpense) => Promise<void>;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  const fid = useId();
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const [potId, setPotId] = useState(pots[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const a = parseMoneyInput(amount);
    if (!a.ok || a.value <= 0) { setError(t.wErrAmount); return; }
    setBusy(true);
    try {
      await onAdd({ id: generateId(), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso(), text: text.trim(), amount: a.value, potId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="goal-form wallet-expense-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="goal-form-grid">
        <div className="goal-form-field">
          <label htmlFor={`${fid}-amount`}>{t.wAmount}</label>
          <input id={`${fid}-amount`} className="label-input" inputMode="decimal" placeholder="0" value={amount} autoFocus
            onChange={e => { setAmount(e.target.value); setError(null); }} />
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-what`}>{t.wWhat}</label>
          <input id={`${fid}-what`} className="label-input" value={text} placeholder={t.wWhatPlaceholder}
            onChange={e => setText(e.target.value)} />
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-pot`}>{t.wPot}</label>
          <select id={`${fid}-pot`} className="label-input" value={potId} onChange={e => setPotId(e.target.value)}>
            {pots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="">{t.wNoPart}</option>
          </select>
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-date`}>{t.wDate}</label>
          <input id={`${fid}-date`} className="label-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      {error && <p className="goal-form-error" role="alert">{error}</p>}
      <div className="goal-form-actions">
        <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
        <button type="submit" className="custom-primary-btn" disabled={busy}>{t.wAdd}</button>
      </div>
    </form>
  );
};

const PotForm = ({ onAdd, onCancel }: {
  onAdd: (pot: WalletPot) => Promise<void>;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  const fid = useId();
  const [name, setName] = useState('');
  const [planned, setPlanned] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    const amount = parseMoneyInput(planned || '0');
    if (!name.trim() || !amount.ok || amount.value < 0) { setError(t.wErrPot); return; }
    setBusy(true);
    try {
      await onAdd({ id: generateId(), name: name.trim(), planned: amount.value });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="goal-form wallet-expense-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="goal-form-grid">
        <div className="goal-form-field">
          <label htmlFor={`${fid}-name`}>{t.wPotName}</label>
          <input id={`${fid}-name`} className="label-input" value={name} autoFocus
            onChange={e => { setName(e.target.value); setError(null); }} />
        </div>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-planned`}>{t.wPotPlanned}</label>
          <input id={`${fid}-planned`} className="label-input" inputMode="decimal" placeholder="0" value={planned}
            onChange={e => { setPlanned(e.target.value); setError(null); }} />
        </div>
      </div>
      {error && <p className="goal-form-error" role="alert">{error}</p>}
      <div className="goal-form-actions">
        <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
        <button type="submit" className="custom-primary-btn" disabled={busy}>{t.wAdd}</button>
      </div>
    </form>
  );
};

const WalletEdit = ({ wallet, onSave, onCancel }: {
  wallet: Wallet;
  onSave: (change: (w: Wallet) => Wallet) => Promise<void>;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  const fid = useId();
  const dec = (n: number) => String(n);
  const [name, setName] = useState(wallet.name);
  const [total, setTotal] = useState(dec(wallet.total));
  const [from, setFrom] = useState(wallet.from ?? '');
  const [to, setTo] = useState(wallet.to ?? '');
  const [pots, setPots] = useState(wallet.pots.map(p => ({ id: p.id, name: p.name, planned: dec(p.planned) })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const used = new Set(wallet.expenses.map(e => e.potId));

  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setError(t.wErrName); return; }
    const amount = parseMoneyInput(total);
    if (!amount.ok || amount.value <= 0) { setError(t.wErrAmount); return; }
    if (from && to && to < from) { setError(t.wErrDates); return; }
    const parsed: WalletPot[] = [];
    for (const p of pots) {
      const planned = parseMoneyInput(p.planned || '0');
      if (!p.name.trim() || !planned.ok || planned.value < 0) { setError(t.wErrPot); return; }
      parsed.push({ id: p.id, name: p.name.trim(), planned: planned.value });
    }
    setBusy(true);
    try {
      const fields = { name: name.trim(), total: amount.value, from: from || undefined, to: to || undefined };
      await onSave(w => {
        // A part removed here keeps its place if an expense was filed under
        // it while the form was open: no expense may point at nothing.
        const kept = new Set(parsed.map(p => p.id));
        const used = new Set(w.expenses.map(e => e.potId));
        return { ...w, ...fields, pots: [...parsed, ...w.pots.filter(p => !kept.has(p.id) && used.has(p.id))] };
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wallet">
      <h2 className="wallet-title">{t.wEdit}</h2>
      <form className="goal-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div className="goal-form-grid">
          <div className="goal-form-field">
            <label htmlFor={`${fid}-name`}>{t.wName}</label>
            <input id={`${fid}-name`} className="label-input" value={name}
              onChange={e => { setName(e.target.value); setError(null); }} />
          </div>
          <div className="goal-form-field">
            <label htmlFor={`${fid}-total`}>{t.wTotal}</label>
            <input id={`${fid}-total`} className="label-input" inputMode="decimal" value={total}
              onChange={e => { setTotal(e.target.value); setError(null); }} />
          </div>
          <div className="goal-form-field">
            <label htmlFor={`${fid}-from`}>{t.wFrom}</label>
            <input id={`${fid}-from`} className="label-input" type="date" value={from}
              onChange={e => { setFrom(e.target.value); setError(null); }} />
          </div>
          <div className="goal-form-field">
            <label htmlFor={`${fid}-to`}>{t.wTo}</label>
            <input id={`${fid}-to`} className="label-input" type="date" value={to}
              onChange={e => { setTo(e.target.value); setError(null); }} />
          </div>
        </div>

        <h3 className="wallet-section">{t.wPots}</h3>
        {pots.map((p, i) => (
          <div className="wallet-pot-edit" key={p.id}>
            <input className="label-input" aria-label={t.wPotName} value={p.name}
              onChange={e => { const v = e.target.value; setPots(ps => ps.map((x, j) => (j === i ? { ...x, name: v } : x))); setError(null); }} />
            <input className="label-input wallet-pot-edit-amount" aria-label={`${t.wPotPlanned} — ${p.name}`} inputMode="decimal" value={p.planned}
              onChange={e => { const v = e.target.value; setPots(ps => ps.map((x, j) => (j === i ? { ...x, planned: v } : x))); setError(null); }} />
            <button type="button" className="wallet-expense-delete" aria-label={t.wRemovePot(p.name)}
              onClick={() => {
                if (used.has(p.id)) { setError(t.wPotHasExpenses(p.name)); return; }
                setPots(ps => ps.filter((_, j) => j !== i));
              }}>✕</button>
          </div>
        ))}
        <button type="button" className="wallet-add" onClick={() => setPots(ps => [...ps, { id: generateId(), name: t.wNewPot, planned: '0' }])}>
          {t.wAddPot}
        </button>

        {error && <p className="goal-form-error" role="alert">{error}</p>}
        <div className="goal-form-actions">
          <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
          <button type="submit" className="custom-primary-btn" disabled={busy}>{t.wSave}</button>
        </div>
      </form>
    </div>
  );
};
