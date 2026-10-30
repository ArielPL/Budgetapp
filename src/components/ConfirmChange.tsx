import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';

// ── Confirm a change a tool proposes ───────────────────────────────────────
//
// A try-out ("what if I paid 1 500 kr extra?") becomes a real change only
// through this box: it says exactly what will change, before → after, and
// nothing is stored until Confirm. The change can be undone afterwards
// (Ariel, 2026-10-17: "en till ruta efteråt som vill ha ett slags bekräftelse").

export interface ChangeLine {
  label: string;
  /** Absent for something new, which has no "before". */
  before?: string;
  after: string;
}

interface Props {
  title: string;
  lines: ChangeLine[];
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
  /** Choices that shape the change, between what it is and the buttons. */
  children?: ReactNode;
  /** False when there is nothing to confirm — the box then only says so. */
  canConfirm?: boolean;
}

export const ConfirmChange = ({ title, lines, onConfirm, onClose, children, canConfirm = true }: Props) => {
  const { t } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  useModalFocus(panel, true, onClose);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onClose();
  };

  return createPortal(
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div ref={panel} className="theme-panel confirm-change" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <h2 className="confirm-change-title">{title}</h2>
        <ul className="q-lines">
          {lines.map(l => (
            <li key={l.label}>
              <span className="q-line-label">{l.label}</span>
              <span className="q-line-value">
                {l.before !== undefined && <span className="confirm-change-before">{l.before} → </span>}
                {l.after}
              </span>
            </li>
          ))}
        </ul>
        {children}
        {canConfirm && <p className="q-note">{t.toolConfirmUndo}</p>}
        <div className="confirm-change-actions">
          <button className="custom-secondary-btn" onClick={onClose}>{t.cancel}</button>
          {canConfirm && <button className="custom-primary-btn" onClick={() => void confirm()} disabled={busy}>{t.toolConfirm}</button>}
        </div>
      </div>
    </>,
    document.body,
  );
};
