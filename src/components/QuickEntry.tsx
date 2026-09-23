import { useEffect, useRef } from 'react';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { AmountInput } from './CustomV3';

// ── Quick entry — the whole month's amounts in one list ─────────────────────
//
// Filling in a month on a phone meant opening every block in turn. Here every
// amount is one field in one scrolling list, grouped the way the panel groups
// them, so a month can be typed top to bottom with the number keyboard up.
//
// It writes through the SAME setter the blocks use — a linked panel's goes to
// the regular budget, a standalone panel's to its own amounts — so there is no
// second copy of any figure and nothing to "save" at the end. The fields are
// the blocks' own AmountInput: what is typed reaches the parser untouched, and
// an amount it refuses is marked rather than replaced by a different number.

export interface QuickEntryGroup {
  id: string;
  title: string;
  icon: string;
  rows: { id: string; name: string; amount: number }[];
}

export const QuickEntry = ({ groups, monthLabel, onSetAmount, onClose }: {
  groups: QuickEntryGroup[];
  /** "september 2026" — which month is being filled in. */
  monthLabel: string;
  onSetAmount: (rowId: string, amount: number) => void;
  onClose: () => void;
}) => {
  const { t } = useLang();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true, onClose);
  // Straight to the first amount: the point of this list is typing. Runs after
  // useModalFocus above, which would otherwise leave focus on the close button.
  useEffect(() => { panelRef.current?.querySelector('input')?.focus(); }, []);
  const withRows = groups.filter(g => g.rows.length > 0);
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal quick-entry" onClick={e => e.stopPropagation()} role="dialog"
        aria-modal="true" aria-labelledby="quick-entry-title" ref={panelRef}>
        <div className="custom-help-head">
          <div className="custom-modal-title" id="quick-entry-title">⚡ {t.quickEntryTitle(monthLabel)}</div>
          <button className="custom-icon-btn" onClick={onClose} aria-label={t.cfgDone}>✕</button>
        </div>
        {withRows.length === 0 ? (
          <p className="quick-entry-empty">{t.quickEntryEmpty}</p>
        ) : withRows.map(g => (
          <section className="quick-entry-group" key={g.id} aria-labelledby={`qe-${g.id}`}>
            <h3 className="quick-entry-heading" id={`qe-${g.id}`}>
              <span aria-hidden="true">{g.icon}</span> {g.title}
            </h3>
            {g.rows.map(r => (
              <div className="quick-entry-row" key={r.id}>
                <span className="quick-entry-name">{r.name}</span>
                <AmountInput value={r.amount} onChange={v => onSetAmount(r.id, v)}
                  ariaLabel={t.ariaAmountInput(`${g.title} – ${r.name}`)} />
              </div>
            ))}
          </section>
        ))}
        <p className="quick-entry-saved">{t.quickEntrySaved}</p>
        <button className="custom-primary-btn custom-help-done" onClick={onClose}>{t.cfgDone}</button>
      </div>
    </div>
  );
};
