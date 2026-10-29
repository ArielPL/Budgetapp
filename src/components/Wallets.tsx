import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLang } from '../i18n';
import { parseMoneyInput } from '../money';
import { generateId } from '../defaults';
import { shortDay } from '../dateLabel';
import { appStorage } from '../storage';
import { commitStorageChangesOutcome } from '../storageWrite';
import { captureKeys, type UndoEntry } from '../undo';
import { useBackLayer } from '../useModalFocus';
import {
  newTrip, newBlank, walletSummary, loadWallets, walletsChange, previousInSeries, withCarry, WALLETS_KEY, OPEN_PANEL_KEY,
  type Wallet, type WalletExpense, type WalletKind, type WalletPot,
} from '../wallets';
import {
  loadCustomBudgets, customBudgetsChange, customBudgetKeys, customBudgetNs, newCustomBudgetId,
  loadMainBudgetName, CUSTOM_BUDGETS_KEY, CUSTOM_NAME_KEY, type CustomBudget,
} from '../customBudgets';

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

const ICON: Record<WalletKind, string> = { blank: '✉️', trip: '✈️' };

/** How an added budget is named in the open-panel key and the switcher, so a
 *  budget's id can never be mistaken for a wallet's. */
const BUDGET_PREFIX = 'cb:';
const budgetPanelId = (b: CustomBudget) => `${BUDGET_PREFIX}${b.id}`;
/** In Custom, the envelopes are one folder in the switcher, opening on all of
 *  them side by side (Ariel, 2026-10-29), as the menu's screen does. */
const ENVELOPES_PANEL = 'envelopes';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The wallets screen shows every wallet side by side from this width up (the
 *  same 640px the phone overrides in index.css use); below it, a list and one
 *  wallet at a time. Without matchMedia (tests) it counts as wide. */
const WIDE = '(min-width: 641px)';
const useWide = () => {
  const [wide, setWide] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(WIDE);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
};

// ── The switcher ───────────────────────────────────────────────────────────

export const PanelSwitcher = ({
  wallets, budgets = [], mainName, openId, budgetTag, onOpen, onNew, onNewBudget, onRename,
}: {
  wallets: Wallet[];
  /** Budgets added beside the panel's own; only Custom offers them. */
  budgets?: CustomBudget[];
  /** What the panel's own budget is called. */
  mainName?: string;
  /** The wallet or added budget on screen, or null for the budget. */
  openId: string | null;
  /** "Linked" / "Separate", or null before a kind of panel is chosen. */
  budgetTag: string | null;
  onOpen: (id: string | null) => void;
  onNew: () => void;
  onNewBudget?: () => void;
  /** Rename the budget on screen; absent where it cannot be renamed. */
  onRename?: () => void;
}) => {
  const { t } = useLang();
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
  const inFolder = openId === ENVELOPES_PANEL || wallets.some(w => w.id === openId);
  const openBudget = budgets.find(b => budgetPanelId(b) === openId);
  const myBudget = mainName ?? t.wMyBudget;
  const pick = (id: string | null) => { setExpanded(false); onOpen(id); };
  return (
    <div className="wallet-switch" ref={box}>
      <button className="wallet-switch-toggle" aria-expanded={expanded} aria-controls={listId}
        onClick={() => setExpanded(e => !e)}>
        <span aria-hidden="true">{inFolder ? '✉️' : '📊'}</span> {inFolder ? t.wMenu : openBudget ? openBudget.name : myBudget}
        <span className="wallet-switch-caret" aria-hidden="true">▾</span>
      </button>
      {onRename && (
        <button className="wallet-switch-edit" onClick={onRename} aria-label={t.cbRename} title={t.cbRename}>✏️</button>
      )}
      {expanded && (
        <div className="wallet-switch-panel" id={listId}>
          <div className="wallet-switch-title">{t.wPanels}</div>
          <ul className="wallet-switch-list">
            <li>
              <button className={`wallet-switch-row${openId === null ? ' is-current' : ''}`} onClick={() => pick(null)}
                aria-current={openId === null ? 'true' : undefined}>
                <span className="wallet-switch-icon" aria-hidden="true">📊</span>
                <span className="wallet-switch-text"><span className="wallet-switch-name">{myBudget}</span></span>
                {budgetTag && <span className="wallet-tag wallet-tag-budget">{budgetTag}</span>}
              </button>
            </li>
            {budgets.map(b => (
              <li key={b.id}>
                <button className={`wallet-switch-row${budgetPanelId(b) === openId ? ' is-current' : ''}`}
                  onClick={() => pick(budgetPanelId(b))}
                  aria-current={budgetPanelId(b) === openId ? 'true' : undefined}>
                  <span className="wallet-switch-icon" aria-hidden="true">📊</span>
                  <span className="wallet-switch-text"><span className="wallet-switch-name">{b.name}</span></span>
                  <span className="wallet-tag wallet-tag-budget">{t.wTagStandalone}</span>
                </button>
              </li>
            ))}
            {wallets.length > 0 && (
              <li>
                <button className={`wallet-switch-row${inFolder ? ' is-current' : ''}`} onClick={() => pick(ENVELOPES_PANEL)}
                  aria-current={inFolder ? 'true' : undefined}>
                  <span className="wallet-switch-icon" aria-hidden="true">✉️</span>
                  <span className="wallet-switch-text">
                    <span className="wallet-switch-name">{t.wMenu}</span>
                    <span className="wallet-switch-sub">{wallets.filter(w => !w.archived).map(w => w.name).join(', ')}</span>
                  </span>
                  <span className="wallet-tag">{wallets.length}</span>
                </button>
              </li>
            )}
          </ul>
          {onNewBudget && (
            <button className="wallet-switch-new" onClick={() => { setExpanded(false); onNewBudget(); }}>+ {t.cbNew}</button>
          )}
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

export const WalletArea = ({ budget, budgetTag, onLeave, onRecordUndo, renderBudget }: {
  /** Shown when no wallet is open; null on the menu's own screen. */
  budget: ReactNode | null;
  budgetTag: string | null;
  /** Back to the budget, for the menu's own screen. */
  onLeave?: () => void;
  onRecordUndo: (entry: UndoEntry) => void;
  /** Draws an added budget from its namespace. Given only in Custom, which is
   *  where budgets beside the panel's own are offered, named and removed. */
  renderBudget?: (ns: string) => ReactNode;
}) => {
  const { t, money } = useLang();
  const wide = useWide();
  // On a phone the wallets screen is a list, and this is the wallet opened
  // from it. Separate from `openId`, which Custom's switcher also reads. It
  // starts on the wallet "Left to live on" has just made (which names it in
  // OPEN_PANEL_KEY) and otherwise on the list.
  // In Custom it is the envelope last open, so the trip you are on is where
  // the app opens; Back goes to the folder.
  const [phoneOpen, setPhoneOpen] = useState<string | null>(() => {
    const v = appStorage.getItem(OPEN_PANEL_KEY);
    return v && loadWallets(appStorage).some(w => w.id === v) ? v : null;
  });
  // That name is used up once read here: the next visit starts on the list.
  useEffect(() => {
    if (budget !== null) return;
    try { appStorage.removeItem(OPEN_PANEL_KEY); } catch { /* the list shows anyway */ }
  }, [budget]);
  const [wallets, setWallets] = useState<Wallet[]>(() => loadWallets(appStorage));
  const [budgets, setBudgets] = useState<CustomBudget[]>(() => (renderBudget ? loadCustomBudgets(appStorage) : []));
  // The panel's own budget is named only in Custom: from the menu's screen
  // "My budget" means the regular budget, whatever Custom calls its own.
  const [mainName, setMainName] = useState<string | null>(() => (renderBudget ? loadMainBudgetName(appStorage) : null));
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [openId, setOpenId] = useState<string | null>(() => {
    const all = loadWallets(appStorage);
    const v = appStorage.getItem(OPEN_PANEL_KEY);
    if (v && all.some(w => w.id === v)) return v;
    if (v === ENVELOPES_PANEL && budget !== null && all.length > 0) return v;
    if (v && renderBudget && loadCustomBudgets(appStorage).some(b => budgetPanelId(b) === v)) return v;
    // From the menu there is no budget to show: open a wallet if there is one.
    return budget === null ? (all.find(w => !w.archived) ?? all[0])?.id ?? null : null;
  });
  const [creating, setCreating] = useState(() => budget === null && loadWallets(appStorage).length === 0);

  const open = (id: string | null) => {
    setCreating(false);
    setCreatingBudget(false);
    setRenaming(false);
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
  const openBudget = budgets.find(b => budgetPanelId(b) === openId) ?? null;

  /** Store the list of added budgets; the screen follows only once stored. */
  const storeBudgets = async (changes: Parameters<typeof commitStorageChangesOutcome>[1]): Promise<boolean> => {
    const outcome = await commitStorageChangesOutcome(appStorage, changes);
    if (outcome !== 'stored') {
      alert(outcome === 'partial' ? t.changePartlySaved : t.changeNotSaved);
      return false;
    }
    return true;
  };
  const createBudget = async (name: string): Promise<boolean> => {
    const b: CustomBudget = { id: newCustomBudgetId(), name };
    const next = [...budgets, b];
    if (!(await storeBudgets([customBudgetsChange(next)]))) return false;
    setBudgets(next);
    open(budgetPanelId(b));
    return true;
  };
  const rename = async (name: string) => {
    if (openBudget) {
      const next = budgets.map(b => (b.id === openBudget.id ? { ...b, name } : b));
      if (await storeBudgets([customBudgetsChange(next)])) { setBudgets(next); setRenaming(false); }
      return;
    }
    // An empty name, or the default itself, goes back to the translated default.
    const own = name && name !== t.wMyBudget ? name : null;
    if (await storeBudgets([{ key: CUSTOM_NAME_KEY, value: own }])) { setMainName(own); setRenaming(false); }
  };
  /** An added budget and every month of it, as one write that can be undone. */
  const removeBudget = async (b: CustomBudget) => {
    if (!window.confirm(t.cbDeleteConfirm(b.name))) return;
    const own = customBudgetKeys(appStorage, b.id);
    const before = captureKeys(appStorage, [CUSTOM_BUDGETS_KEY, ...own]);
    const next = budgets.filter(x => x.id !== b.id);
    if (!(await storeBudgets([customBudgetsChange(next), ...own.map(key => ({ key, value: null }))]))) return;
    setBudgets(next);
    open(null);
    onRecordUndo({ at: new Date().toISOString(), action: 'deleteCustomBudget', changes: before });
  };

  const removeById = (id: string) => save(all => all.filter(x => x.id !== id), 'deleteWallet');
  const startNew = () => { setCreatingBudget(false); setCreating(true); };

  // The menu's own screen shows every wallet at once (side by side, or a list
  // on a phone), and so does Custom's envelope folder, under its switcher,
  // where the budget is a panel too.
  const inFolder = budget !== null && (openId === ENVELOPES_PANEL || current !== null);
  const overview = !creating && !creatingBudget && wallets.length > 0 && (budget === null || inFolder);
  const phoneWallet = wallets.find(w => w.id === phoneOpen) ?? null;
  const inPhoneWallet = overview && !wide && phoneWallet !== null;
  // Android's Back from one envelope goes to the list, as "‹ Envelopes" does.
  useBackLayer(inPhoneWallet, () => { setPhoneOpen(null); if (budget !== null) open(ENVELOPES_PANEL); });

  let content: ReactNode;
  if (creatingBudget) {
    content = <NewBudget onCreate={createBudget} onCancel={() => setCreatingBudget(false)} />;
  } else if (creating) {
    content = (
      <NewWallet
        onCancel={() => { setCreating(false); if (wallets.length === 0 && budget === null) onLeave?.(); }}
        onCreate={async w => {
          if (!(await save(all => [...all, w]))) return false;
          open(w.id);
          setPhoneOpen(w.id);
          return true;
        }} />
    );
  } else if (overview) {
    // Not archived first, as in the switcher.
    const sorted = [...wallets.filter(w => !w.archived), ...wallets.filter(w => w.archived)];
    // The last one gone: back to the budget, as before. Otherwise to the list.
    const afterDelete = () => { if (wallets.length <= 1) open(null); else setPhoneOpen(null); };
    if (wide) {
      content = (
        <div className="wallet-columns">
          {sorted.map(w => (
            <WalletSlot key={w.id} wallet={w} previous={previousInSeries(w, wallets)} variant="column" change={changeWallet} remove={removeById}
              afterDelete={afterDelete} />
          ))}
          <button className="wallet-plus" onClick={startNew}>
            <span className="wallet-plus-sign" aria-hidden="true">+</span>
            <span>{t.wNew}</span>
          </button>
        </div>
      );
    } else if (phoneWallet) {
      content = (
        <WalletSlot key={phoneWallet.id} wallet={phoneWallet} previous={previousInSeries(phoneWallet, wallets)} variant="screen" change={changeWallet}
          remove={removeById} afterDelete={afterDelete} />
      );
    } else {
      const today = todayIso();
      content = (
        <div className="wallet-cards">
          {sorted.map(w => {
            const s = walletSummary(w, today);
            const over = s.left < 0;
            const pct = w.total > 0 ? Math.min(100, Math.max(0, (s.spent / w.total) * 100)) : 0;
            return (
              <button key={w.id} className="wallet-card" onClick={() => { setPhoneOpen(w.id); if (budget !== null) open(w.id); }}>
                <span className="wallet-card-main">
                  <span className="wallet-card-name">
                    <span aria-hidden="true">{ICON[w.kind]}</span>
                    <b>{w.name}{w.archived ? ` · ${t.wArchived}` : ''}</b>
                  </span>
                  <span className="wallet-card-sub">{t.wUsed(money(Math.round(s.spent)), money(w.total))}</span>
                  <span className="wallet-bar" aria-hidden="true">
                    <span className={`wallet-bar-fill${over ? ' is-over' : ''}`} style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <span className="wallet-card-side">
                  <span className="wallet-card-label">{t.wLeft}</span>
                  <span className={`wallet-card-value${over ? ' is-over' : ''}`}>{money(Math.round(s.left))}</span>
                </span>
              </button>
            );
          })}
          <button className="wallet-plus" onClick={startNew}>
            <span className="wallet-plus-sign" aria-hidden="true">+</span>
            <span>{t.wNew}</span>
          </button>
        </div>
      );
    }
  } else if (current) {
    content = (
      <WalletSlot key={current.id} wallet={current} previous={previousInSeries(current, wallets)} change={changeWallet} remove={removeById}
        afterDelete={() => open(null)} />
    );
  } else if (openBudget && renderBudget) {
    // Keyed by namespace: each budget gets a component of its own, so nothing
    // one budget holds in memory can be written into another's months.
    const ns = customBudgetNs(openBudget.id);
    content = <Fragment key={ns}>{renderBudget(ns)}</Fragment>;
  } else {
    content = budget;
  }
  const showingBudget = !creating && !creatingBudget && !current && !inFolder;
  return (
    <>
      {overview && budget === null ? (
        <div className="wallet-screen-head">
          {inPhoneWallet
            ? <button className="wallet-back" onClick={() => setPhoneOpen(null)}>‹ {t.wMenu}</button>
            : <button className="wallet-back" onClick={() => open(null)}>‹ {t.wMyBudget}</button>}
          {!inPhoneWallet && <h2 className="wallet-screen-title">{t.wMenu}</h2>}
        </div>
      ) : (
        <PanelSwitcher wallets={wallets} budgets={budgets} mainName={mainName ?? undefined}
          openId={creating || creatingBudget ? null : openId} budgetTag={budgetTag}
          onOpen={open} onNew={startNew}
          onNewBudget={renderBudget ? () => { setCreating(false); setRenaming(false); setCreatingBudget(true); } : undefined}
          onRename={renderBudget && showingBudget ? () => setRenaming(r => !r) : undefined} />
      )}
      {/* Custom's folder on a phone: one envelope open, and the way back to all. */}
      {inFolder && inPhoneWallet && (
        <div className="wallet-screen-head">
          <button className="wallet-back" onClick={() => { setPhoneOpen(null); open(ENVELOPES_PANEL); }}>‹ {t.wMenu}</button>
        </div>
      )}
      {renaming && showingBudget && (
        <BudgetName key={openBudget?.id ?? 'main'} name={openBudget ? openBudget.name : mainName ?? t.wMyBudget}
          onSave={rename} onCancel={() => setRenaming(false)}
          onDelete={openBudget ? () => void removeBudget(openBudget) : undefined} />
      )}
      {content}
    </>
  );
};

/** One wallet, wired to the save queue of the area that holds it. `afterDelete`
 *  says where to go once it is gone. */
const WalletSlot = ({ wallet, previous, variant, change, remove, afterDelete }: {
  wallet: Wallet;
  previous?: Wallet;
  variant?: 'column' | 'screen';
  change: (id: string, change: (w: Wallet) => Wallet, undo?: 'deleteWalletExpense') => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  afterDelete: () => void;
}) => {
  const { t } = useLang();
  return (
    <WalletView wallet={wallet} previous={previous} variant={variant}
      onChange={(c, removedExpense) => change(wallet.id, c, removedExpense ? 'deleteWalletExpense' : undefined)}
      onDelete={async () => {
        if (!window.confirm(t.wDeleteConfirm(wallet.name))) return;
        if (await remove(wallet.id)) afterDelete();
      }} />
  );
};

// ── An added budget: a name, and nothing else to decide ───────────────────

const NewBudget = ({ onCreate, onCancel }: {
  onCreate: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) => {
  const { t } = useLang();
  const fid = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setError(t.wErrName); return; }
    setBusy(true);
    try { await onCreate(name.trim()); } finally { setBusy(false); }
  };
  return (
    <div className="wallet">
      <h2 className="wallet-title">📊 {t.cbNew}</h2>
      <p className="wallet-lead">{t.cbNewLead}</p>
      <form className="goal-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div className="goal-form-field">
          <label htmlFor={`${fid}-name`}>{t.wName}</label>
          <input id={`${fid}-name`} className="label-input" value={name} placeholder={t.cbNamePlaceholder}
            autoFocus onChange={e => { setName(e.target.value); setError(null); }} />
        </div>
        {error && <p className="goal-form-error" role="alert">{error}</p>}
        <div className="goal-form-actions">
          <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
          <button type="submit" className="custom-primary-btn" disabled={busy}>{t.cbCreate}</button>
        </div>
      </form>
    </div>
  );
};

/** Rename the budget on screen; an added one can also be removed from here. */
const BudgetName = ({ name, onSave, onCancel, onDelete }: {
  name: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) => {
  const { t } = useLang();
  const fid = useId();
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    const next = draft.trim();
    // The panel's own budget may go back to its default with an empty name;
    // an added one must keep a name, so an empty field is simply not saved.
    if (next === name || (!next && onDelete)) { onCancel(); return; }
    setBusy(true);
    try { await onSave(next); } finally { setBusy(false); }
  };
  return (
    <form className="budget-name" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <label htmlFor={`${fid}-name`} className="budget-name-label">{t.cbRename}</label>
      <div className="budget-name-row">
        {/* Selected on open, so typing replaces the name rather than adding to it. */}
        <input id={`${fid}-name`} className="label-input" value={draft} autoFocus
          onFocus={e => e.currentTarget.select()}
          placeholder={t.wMyBudget} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel(); }} />
        <button type="submit" className="custom-primary-btn" disabled={busy}>{t.wSave}</button>
        <button type="button" className="custom-secondary-btn" onClick={onCancel}>{t.cancel}</button>
      </div>
      {onDelete && (
        <button type="button" className="custom-secondary-btn wallet-danger budget-name-delete" onClick={onDelete}>{t.cbDelete}</button>
      )}
    </form>
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

export const WalletView = ({ wallet, previous, variant, onChange, onDelete }: {
  wallet: Wallet;
  /** The week before, for a weekly envelope: what it left can move here. */
  previous?: Wallet;
  /** On the wallets screen the wallet carries its own name, since no switcher
   *  names it: a 'column' among others (actions behind a ⋯ button, to keep it
   *  short) or the 'screen' a phone opens from the list. Absent under the
   *  switcher, where the pill is the name. */
  variant?: 'column' | 'screen';
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

  // A trip ends as a trip; any other wallet — "Vardag oktober" from Left to
  // live on — as a period. "Resten av resan" under a month's everyday money
  // read like a mistake (2026-10-18).
  const trip = wallet.kind === 'trip';
  const timing = s.timing.kind === 'before' ? t.wStartsIn(s.timing.days)
    : s.timing.kind === 'during' ? t.wDaysLeft(s.timing.daysLeft)
      : s.timing.kind === 'after' ? (trip ? t.wEnded : t.wEndedPeriod) : null;

  // Says which way, rather than flipping whatever is stored by then: a double
  // tap must not archive and bring back again.
  const toggleArchive = () => {
    const archived = !wallet.archived;
    void onChange(w => ({ ...w, archived }));
  };

  return (
    <div className={`wallet${variant === 'column' ? ' wallet-column' : ''}`}>
      {variant ? (
        <div className="wallet-col-head">
          <h3 className="wallet-title wallet-col-title">
            <span aria-hidden="true">{ICON[wallet.kind]}</span> {wallet.name}{wallet.archived ? ` · ${t.wArchived}` : ''}
          </h3>
          {variant === 'column' && (
            <WalletMenu wallet={wallet} onEdit={() => setEditing(true)} onArchive={toggleArchive} onDelete={onDelete} />
          )}
        </div>
      ) : (
        <span className="wallet-tag">{t.wTagSeparate}</span>
      )}

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
          <div className="wallet-hero-sub">{(trip ? t.wPerDay : t.wPerDayPeriod)(r(s.left / s.timing.daysLeft))}</div>
        )}
        {(wallet.carry ?? 0) > 0 && <div className="wallet-hero-sub">{t.envCarried(r(wallet.carry!))}</div>}
      </div>

      {/* Asked once the week before is over, and only until answered: the
          user says what really was left, since not every purchase may have
          been typed in (Ariel, 2026-10-27). */}
      {previous && wallet.carry === undefined && previous.to !== undefined && today > previous.to
        && s.timing.kind !== 'after' && (
        <CarryOver key={previous.id} left={Math.max(0, Math.round(walletSummary(previous, today).left))}
          onAnswer={amount => void onChange(w => (w.carry !== undefined ? w : amount > 0 ? withCarry(w, amount) : { ...w, carry: 0 }))} />
      )}

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

      {variant !== 'column' && (
        <div className="wallet-footer">
          <button className="custom-secondary-btn" onClick={() => setEditing(true)}>{t.wEdit}</button>
          <button className="custom-secondary-btn" onClick={toggleArchive}>
            {wallet.archived ? t.wUnarchive : t.wArchive}
          </button>
          <button className="custom-secondary-btn wallet-danger" onClick={onDelete}>{t.wDelete}</button>
        </div>
      )}
    </div>
  );
};

/** "What was left last week?": the envelope's own figure to start from, any
 *  amount the user knows better, or none at all. */
const CarryOver = ({ left, onAnswer }: { left: number; onAnswer: (amount: number) => void }) => {
  const { t, money } = useLang();
  const [draft, setDraft] = useState(String(left));
  const [error, setError] = useState(false);
  const add = () => {
    const parsed = parseMoneyInput(draft.trim());
    if (!parsed.ok && parsed.reason !== 'empty') { setError(true); return; }
    onAnswer(parsed.ok ? Math.max(0, parsed.value) : 0);
  };
  return (
    <form className="wallet-carry" onSubmit={e => { e.preventDefault(); add(); }}>
      <div className="wallet-carry-title">{t.envCarryTitle}</div>
      <p className="wallet-carry-hint">{t.envCarryHint(money(left))}</p>
      <div className="wallet-carry-row">
        <input className="label-input wallet-carry-input" inputMode="decimal" value={draft}
          aria-label={t.envCarryTitle} aria-invalid={error || undefined}
          onChange={e => { setDraft(e.target.value); setError(false); }} />
        <button type="submit" className="custom-primary-btn">{t.envCarryAdd}</button>
        <button type="button" className="custom-secondary-btn" onClick={() => onAnswer(0)}>{t.envCarrySkip}</button>
      </div>
      {error && <p className="wallet-carry-error" role="alert">{t.invalidAmount}</p>}
    </form>
  );
};

/** Edit, archive and delete behind one button, for a wallet in a column. Closes
 *  like the switcher: a tap anywhere else, or Escape. */
const WalletMenu = ({ wallet, onEdit, onArchive, onDelete }: {
  wallet: Wallet;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) => {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const run = (act: () => void) => () => { setOpen(false); act(); };
  return (
    <div className="wallet-more" ref={box}>
      <button className="wallet-more-btn" aria-label={t.wMore(wallet.name)} aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen(o => !o)}>⋯</button>
      {open && (
        <div className="wallet-more-menu" id={menuId}>
          <button className="wallet-more-item" onClick={run(onEdit)}>{t.wEdit}</button>
          <button className="wallet-more-item" onClick={run(onArchive)}>{wallet.archived ? t.wUnarchive : t.wArchive}</button>
          <button className="wallet-more-item wallet-danger" onClick={run(onDelete)}>{t.wDelete}</button>
        </div>
      )}
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
