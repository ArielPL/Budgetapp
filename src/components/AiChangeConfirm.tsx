import { useMemo, useState } from 'react';
import { useLang } from '../i18n';
import { ConfirmChange, type ChangeLine } from './ConfirmChange';
import { monthInText } from '../dateLabel';
import { captureKeys, type UndoAction, type UndoEntry } from '../undo';
import { commitStorageChangesOutcome, type TransactionalStorage } from '../storageWrite';
import type { StorageLike } from '../storage';
import type { MonthData } from '../types';
import type { YearMonth } from '../debts';
import { planAddRow, planMove, planSetAmount, type AiChange, type PlannedChange, type PlannedMove, type Reach } from '../ai/changes';

// ── Confirm a change Budget AI proposes ────────────────────────────────────
//
// The three change tools that had no box of their own: a new amount on a row,
// a new row, and a shop's purchases moved to another category. The checks
// (ai/checks.ts) have already turned the model's call into the user's own ids;
// this box shows exactly what would change, asks how far a budget change
// reaches ("Only October" / "October and later", Ariel 2026-10-23), and writes
// it in ONE transaction with a step back. Nothing is stored before Confirm.

interface Props {
  change: AiChange;
  /** The month on screen, where a budget change starts. */
  at: YearMonth;
  /** Its budget as it is in memory — it may hold edits not saved yet. */
  budget: MonthData;
  storage: StorageLike & TransactionalStorage;
  newId: () => string;
  recordUndo: (entry: UndoEntry) => void;
  /** After the write: the caller reloads what it shows from storage. */
  onApplied: (months: YearMonth[]) => void;
  onClose: () => void;
}

const ACTION: Record<AiChange['kind'], UndoAction> = {
  setAmount: 'aiSetAmount', addRow: 'aiAddRow', move: 'aiMovePurchases',
};

const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

export const AiChangeConfirm = ({ change, at, budget, storage, newId, recordUndo, onApplied, onClose }: Props) => {
  const { t, lang, money } = useLang();
  const [reach, setReach] = useState<Reach>('month');
  // One id for the new row, whichever reach is chosen.
  const [rowId] = useState(newId);

  const { plan, moved } = useMemo((): { plan: PlannedChange | null; moved: PlannedMove | null } => {
    const screen = { at, data: budget };
    if (change.kind === 'setAmount') return { plan: planSetAmount(storage, at, screen, change.categoryId, change.rowId, change.amount, reach), moved: null };
    if (change.kind === 'addRow') return { plan: planAddRow(storage, at, screen, change.categoryId, change.label, change.amount, reach, rowId), moved: null };
    const m = planMove(storage, change.place, change.categoryId);
    return { plan: m, moved: m };
  }, [change, at, budget, storage, reach, rowId]);

  const category = budget.expenses.find(c => c.id === change.categoryId);
  const where = monthInText(at.month, at.year, lang);
  const months = plan?.months.length ?? 0;
  const canConfirm = plan !== null && plan.changes.length > 0;

  const title = change.kind === 'setAmount' ? t.aiSetTitle : change.kind === 'addRow' ? t.aiAddTitle : t.aiMoveTitle;
  const lines: ChangeLine[] = [];
  if (change.kind === 'setAmount') {
    const row = category?.rows.find(r => r.id === change.rowId);
    if (row) lines.push({ label: row.label, before: money(row.amount), after: money(change.amount) });
  } else if (change.kind === 'addRow') {
    lines.push({ label: change.label, after: money(change.amount) });
  } else if (moved) {
    lines.push({ label: t.aiMoveCount, after: String(moved.count) });
    lines.push({ label: t.aiMoveTotal, after: money(moved.amount) });
  }
  lines.push({ label: t.aiCategory, after: category?.name ?? change.categoryId });
  if (change.kind !== 'move' && reach === 'later' && canConfirm) lines.push({ label: t.aiMonthsChanged, after: String(months) });

  const confirm = async (): Promise<boolean> => {
    if (!plan || !canConfirm) return false;
    const before = captureKeys(storage, plan.changes.map(c => c.key));
    const outcome = await commitStorageChangesOutcome(storage, plan.changes);
    if (outcome !== 'stored') {
      alert(outcome === 'partial' ? t.changePartlySaved : t.aiChangeFailed);
      return false;
    }
    const count = moved ? moved.count : months;
    recordUndo({
      at: new Date().toISOString(), action: ACTION[change.kind], count, changes: before,
      ...(change.kind !== 'move' ? { year: at.year, month: at.month } : {}),
    });
    onApplied(plan.months);
    return true;
  };

  return (
    <ConfirmChange title={title} lines={lines} onConfirm={confirm} onClose={onClose} canConfirm={canConfirm}>
      {change.kind !== 'move' && (
        <div className="ai-reach" role="group" aria-label={title}>
          {(['month', 'later'] as const).map(r => (
            <button key={r} type="button" className={`seg-btn${reach === r ? ' seg-active' : ''}`}
              aria-pressed={reach === r} onClick={() => setReach(r)}>
              {cap(r === 'month' ? t.aiReachMonth(where) : t.aiReachLater(where))}
            </button>
          ))}
        </div>
      )}
      {change.kind === 'move' && canConfirm && <p className="q-note">{t.aiMoveFuture(change.place)}</p>}
      {!canConfirm && (
        <p className="q-note">{change.kind === 'move' ? t.aiNoPurchases(change.place) : t.aiNothingToChange}</p>
      )}
    </ConfirmChange>
  );
};
