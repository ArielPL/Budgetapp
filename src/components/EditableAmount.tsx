import { useState, useRef, useEffect, useId, type KeyboardEvent, type CSSProperties } from 'react';
import { useLang } from '../i18n';
import { parseMoneyOrZero } from '../money';

interface Props {
  value: number;
  onChange: (val: number) => void;
  color?: string;
  /** Row/goal name for accessible labels, e.g. "Hyra/Bolån". */
  label?: string;
  /** Show "0 kr" instead of the visual dash when the value is 0 (goal cards). */
  showZero?: boolean;
}

export const EditableAmount = ({ value, onChange, color, label, showZero }: Props) => {
  const { t, money } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const start = () => {
    setDraft(value === 0 ? '' : String(value));
    setError(false);
    setEditing(true);
  };

  // Invalid input is REJECTED, never repaired. `1e309` and a 400-digit number
  // both used to sail through `isNaN` as Infinity, get written to storage as
  // `null`, and come back as 0 after a reload — the amount silently gone
  // (main review §5). Now the previous value stands and the field says why.
  const commit = () => {
    const result = parseMoneyOrZero(draft);
    if (!result.ok) {
      setError(true);
      return; // stay open on Enter so the number can be corrected
    }
    onChange(result.value);
    setError(false);
    setEditing(false);
  };

  // Leaving the field must never trap the user: an invalid draft is discarded
  // and the last valid amount stays, with the message still visible.
  const handleBlur = () => {
    if (parseMoneyOrZero(draft).ok) commit();
    else { setError(true); setEditing(false); }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { setError(false); setEditing(false); }
  };

  // Fragment, not a wrapper element: .budget-row is a flex row, so an extra box
  // around the field would change every row's layout. The message is positioned
  // against the row instead.
  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          className="amount-input"
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={e => { setDraft(e.target.value); if (error) setError(false); }}
          onBlur={handleBlur}
          onKeyDown={handleKey}
          style={{ borderColor: error ? 'var(--negative)' : color }}
          aria-label={label ? t.ariaAmountInput(label) : t.clickToEdit}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && <span className="amount-error" id={errorId} role="alert">{t.invalidAmount}</span>}
      </>
    );
  }

  return (
    <>
      {error && <span className="amount-error" role="alert">{t.invalidAmount}</span>}
    <button
      className="amount-display"
      onClick={start}
      title={t.clickToEdit}
      // Screen readers get the row name + current value even when the visual
      // shows just a dash for 0.
      aria-label={label ? t.ariaEditAmount(label, money(value)) : t.clickToEdit}
      // The row colour goes in as a custom property rather than `color`, so CSS
      // can deepen it for the light theme (an inline `color` would win over any
      // stylesheet). A 0 uses the theme's muted token instead of a fixed slate
      // that was nearly invisible on light backgrounds.
      style={{ '--amount-color': value > 0 ? color || 'var(--text)' : 'var(--text-muted)' } as CSSProperties}
    >
      {value === 0 ? (showZero ? money(0) : '–') : money(value)}
    </button>
    </>
  );
};
