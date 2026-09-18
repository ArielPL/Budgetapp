// ── UndoBar — the way back, offered where the eye already is ───────────────
//
// A step back is only a safety net if it is visible at the moment of regret.
// That moment comes twice: immediately ("that was the wrong month"), and days
// later ("where did July go?"). This bar is the first one — it appears right
// after a destructive action and stays until dismissed. The menu carries the
// second.
//
// It does NOT time out on its own. A bar that disappears after five seconds is
// a bar that is gone exactly when a slower reader reaches for it.

import { useLang } from '../i18n';
import { undoWhere } from '../undoLabel';
import type { UndoEntry } from '../undo';

interface Props {
  entry: UndoEntry;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoBar = ({ entry, onUndo, onDismiss }: Props) => {
  const { lang, t } = useLang();
  return (
    <div className="undo-bar" role="status" aria-live="polite">
      <span className="undo-bar-text">
        {t.undoWhat(entry.action, undoWhere(entry, lang), entry.count ?? 0)}
      </span>
      <button className="undo-bar-action" onClick={onUndo}>{t.undo}</button>
      <button
        className="undo-bar-close"
        onClick={onDismiss}
        aria-label={t.undoDismiss}
        title={t.undoDismiss}
      >
        ✕
      </button>
    </div>
  );
};
