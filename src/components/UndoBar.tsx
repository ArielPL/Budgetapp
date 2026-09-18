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

import { useEffect, useState } from 'react';
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

  // Review 2026-09-18, F10: the bar is `position: fixed` and does not time out,
  // so at 320px it sat on top of the last rows and the jump nav — content the
  // user could see but not reach. It publishes its measured height instead, and
  // the page reserves exactly that much room at the bottom.
  //
  // Measured rather than assumed: the height changes with the language, with
  // the wrap at narrow widths, and with the length of the place name in it.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    if (!el) { root.style.setProperty('--undo-bar-h', '0px'); return; }
    const publish = () =>
      root.style.setProperty('--undo-bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    // Cleared on unmount: the reserved space must go when the bar does.
    return () => { ro.disconnect(); root.style.setProperty('--undo-bar-h', '0px'); };
  }, [el]);

  return (
    <div className="undo-bar" role="status" aria-live="polite" ref={setEl}>
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
