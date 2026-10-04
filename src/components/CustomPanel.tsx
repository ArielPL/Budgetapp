import { useState } from 'react';
import type { BudgetCategory, BudgetRow, MonthData, SavingsGoal } from '../types';
import type { PeriodLocks } from '../periodLabel';
import { useLang } from '../i18n';
import { appStorage } from '../storage';
import { safeSetItem, commitStorageChangesOutcome } from '../storageWrite';
import { captureKeys, type UndoEntry } from '../undo';
import {
  CUSTOM_MODE_KEY, CUSTOM_LINKED_KEY, customResetKeys, customResetChanges, type CustomMode,
} from '../customMode';
import { CustomV3 } from './CustomV3';
import { CustomLinked } from './CustomLinked';
import { defaultLinkedLayout } from '../customLinked';
import { loadWallets, walletsChange, WALLETS_KEY, OPEN_PANEL_KEY, type Wallet } from '../wallets';
import { PanelSwitcher, NewWallet, WalletView } from './Wallets';

// ── The Custom layout: choose what it is, then show that ──────────────────
//
// Two kinds of panel (see customMode.ts). Nothing is built until the user has
// said which, because the answer decides where every amount lives — and so
// whether the app's other tabs describe the same budget as the panel does.

interface Props {
  year: number;
  month: number;
  mode: CustomMode | null;
  onModeChange: (mode: CustomMode | null) => void;
  /** The regular budget's month and its own handlers — used only when linked. */
  data: MonthData;
  onSetIncome: (rows: BudgetRow[]) => void;
  onSetCategory: (category: BudgetCategory) => void;
  onAddCategory: (category: BudgetCategory) => void;
  goals: SavingsGoal[];
  periodStartDay: number | null;
  periodLocks: PeriodLocks;
  onCopyPrev: () => void;
  onSaveFailed: () => void;
  onRecordUndo: (entry: UndoEntry) => void;
}

export const CustomPanel = ({
  year, month, mode, onModeChange, data, onSetIncome, onSetCategory, onAddCategory, goals,
  periodStartDay, periodLocks, onCopyPrev, onSaveFailed, onRecordUndo,
}: Props) => {
  const { t } = useLang();

  // ── Wallets: separate budgets for one thing, listed beside the budget ──
  const [wallets, setWallets] = useState<Wallet[]>(() => loadWallets(appStorage));
  const [openId, setOpenId] = useState<string | null>(() => {
    const v = appStorage.getItem(OPEN_PANEL_KEY);
    return v && loadWallets(appStorage).some(w => w.id === v) ? v : null;
  });
  const [creating, setCreating] = useState(false);
  const open = (id: string | null) => {
    setOpenId(id);
    setCreating(false);
    // Where Custom opens next time — a convenience, so a failure is not news.
    try {
      if (id) appStorage.setItem(OPEN_PANEL_KEY, id); else appStorage.removeItem(OPEN_PANEL_KEY);
    } catch { /* stays on the budget next time */ }
  };
  /** Store every wallet as `next`; the screen changes only once that is
   *  stored. `undo` records the step back for a removal. */
  const saveWallets = async (next: Wallet[], undo?: 'deleteWallet' | 'deleteWalletExpense'): Promise<boolean> => {
    const before = undo ? captureKeys(appStorage, [WALLETS_KEY]) : null;
    const outcome = await commitStorageChangesOutcome(appStorage, [walletsChange(next)]);
    if (outcome !== 'stored') {
      alert(outcome === 'partial' ? t.changePartlySaved : t.changeNotSaved);
      return false;
    }
    setWallets(next);
    if (undo && before) onRecordUndo({ at: new Date().toISOString(), action: undo, changes: before });
    return true;
  };
  const current = wallets.find(w => w.id === openId) ?? null;

  const choose = (next: CustomMode) => {
    // The linked layout is written with the choice, from the budget as it is
    // now, so the panel opens showing that budget rather than an empty page.
    if (next === 'linked' && appStorage.getItem(CUSTOM_LINKED_KEY) === null
      && !safeSetItem(appStorage, CUSTOM_LINKED_KEY, JSON.stringify(defaultLinkedLayout(data)))) {
      onSaveFailed();
    }
    if (!safeSetItem(appStorage, CUSTOM_MODE_KEY, next)) onSaveFailed();
    onModeChange(next);
  };

  /**
   * Back to the choice. What goes is said before it goes, and it can be taken
   * back: every removed key is captured first and the removal is one write, so
   * a refusal leaves everything as it was rather than half of it.
   */
  const startOver = async () => {
    if (!mode) return;
    const keys = customResetKeys(appStorage, mode);
    // Nothing built yet (a panel chosen a moment ago): no question to ask and
    // nothing to take back — just the choice again.
    const holdsAnything = keys.some(k => k !== CUSTOM_MODE_KEY && appStorage.getItem(k) !== null);
    if (holdsAnything
      && !window.confirm(mode === 'linked' ? t.startOverConfirmLinked : t.startOverConfirmStandalone)) return;
    const before = captureKeys(appStorage, keys);
    // Waited for, like every change that switches the view or offers a step
    // back: in the apps the removal is only queued when the write returns
    // (foundation review 2026-09-29, P1). A refusal changed nothing — the panel
    // stays as it was — and is said as that.
    const outcome = await commitStorageChangesOutcome(appStorage, customResetChanges(appStorage, mode));
    if (outcome !== 'stored') {
      alert(outcome === 'partial' ? t.changePartlySaved : t.changeNotSaved);
      return;
    }
    if (holdsAnything) onRecordUndo({ at: new Date().toISOString(), action: 'resetCustom', changes: before });
    onModeChange(null);
  };

  const switcher = (
    <PanelSwitcher wallets={wallets} openId={creating ? null : openId}
      budgetTag={mode === 'linked' ? t.wTagLinked : mode === 'standalone' ? t.wTagStandalone : null}
      onOpen={open} onNew={() => setCreating(true)} />
  );

  let panel;
  if (creating) {
    panel = (
      <NewWallet onCancel={() => setCreating(false)}
        onCreate={async w => {
          if (!(await saveWallets([...wallets, w]))) return false;
          open(w.id);
          return true;
        }} />
    );
  } else if (current) {
    panel = (
      <WalletView key={current.id} wallet={current}
        onSave={(next, removedExpense) =>
          saveWallets(wallets.map(w => (w.id === next.id ? next : w)), removedExpense ? 'deleteWalletExpense' : undefined)}
        onDelete={async () => {
          if (!window.confirm(t.wDeleteConfirm(current.name))) return;
          if (await saveWallets(wallets.filter(w => w.id !== current.id), 'deleteWallet')) open(null);
        }} />
    );
  } else if (mode === null) {
    panel = <CustomChoice onChoose={choose} />;
  } else if (mode === 'linked') {
    panel = (
      <CustomLinked year={year} month={month} data={data}
        onSetIncome={onSetIncome} onSetCategory={onSetCategory} onAddCategory={onAddCategory}
        goals={goals} periodStartDay={periodStartDay} periodLocks={periodLocks} onCopyPrev={onCopyPrev}
        onStartOver={startOver} onSaveFailed={onSaveFailed} onRecordUndo={onRecordUndo} />
    );
  } else {
    panel = (
      <CustomV3 year={year} month={month} onSaveFailed={onSaveFailed} onRecordUndo={onRecordUndo}
        onStartOver={startOver} />
    );
  }
  return <>{switcher}{panel}</>;
};

const CustomChoice = ({ onChoose }: { onChoose: (mode: CustomMode) => void }) => {
  const { t } = useLang();
  return (
    <div className="custom-canvas">
      <div className="custom-choice">
        <h2 className="custom-choice-title">{t.choiceTitle}</h2>
        <p className="custom-choice-intro">{t.choiceIntro}</p>
        <div className="custom-choice-cards">
          <section className="custom-choice-card">
            <h3>{t.choiceLinkedTitle}</h3>
            <p>{t.choiceLinkedBody}</p>
            <button className="custom-primary-btn" onClick={() => onChoose('linked')}>{t.choiceLinkedCta}</button>
          </section>
          <section className="custom-choice-card">
            <h3>{t.choiceStandaloneTitle}</h3>
            <p>{t.choiceStandaloneBody}</p>
            <button className="custom-primary-btn" onClick={() => onChoose('standalone')}>{t.choiceStandaloneCta}</button>
          </section>
        </div>
        <p className="custom-choice-later">{t.choiceChangeLater}</p>
      </div>
    </div>
  );
};
