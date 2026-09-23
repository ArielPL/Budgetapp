import type { BudgetCategory, BudgetRow, MonthData, SavingsGoal } from '../types';
import type { PeriodLocks } from '../periodLabel';
import { useLang } from '../i18n';
import { appStorage } from '../storage';
import { safeSetItem, applyStorageChanges } from '../storageWrite';
import { captureKeys, type UndoEntry } from '../undo';
import {
  CUSTOM_MODE_KEY, CUSTOM_LINKED_KEY, customResetKeys, customResetChanges, type CustomMode,
} from '../customMode';
import { CustomV3 } from './CustomV3';
import { CustomLinked } from './CustomLinked';
import { defaultLinkedLayout } from '../customLinked';

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
  const startOver = () => {
    if (!mode) return;
    const keys = customResetKeys(appStorage, mode);
    // Nothing built yet (a panel chosen a moment ago): no question to ask and
    // nothing to take back — just the choice again.
    const holdsAnything = keys.some(k => k !== CUSTOM_MODE_KEY && appStorage.getItem(k) !== null);
    if (holdsAnything
      && !window.confirm(mode === 'linked' ? t.startOverConfirmLinked : t.startOverConfirmStandalone)) return;
    const before = captureKeys(appStorage, keys);
    if (!applyStorageChanges(appStorage, customResetChanges(appStorage, mode))) {
      onSaveFailed();
      return;
    }
    if (holdsAnything) onRecordUndo({ at: new Date().toISOString(), action: 'resetCustom', changes: before });
    onModeChange(null);
  };

  if (mode === null) return <CustomChoice onChoose={choose} />;
  if (mode === 'linked') {
    return (
      <CustomLinked year={year} month={month} data={data}
        onSetIncome={onSetIncome} onSetCategory={onSetCategory} onAddCategory={onAddCategory}
        goals={goals} periodStartDay={periodStartDay} periodLocks={periodLocks} onCopyPrev={onCopyPrev}
        onStartOver={startOver} onSaveFailed={onSaveFailed} onRecordUndo={onRecordUndo} />
    );
  }
  return (
    <CustomV3 year={year} month={month} onSaveFailed={onSaveFailed} onRecordUndo={onRecordUndo}
      onStartOver={startOver} />
  );
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
