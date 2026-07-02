import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useLang } from '../i18n';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const start = () => {
    setDraft(value === 0 ? '' : String(value));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(draft.replace(',', '.'));
    onChange(isNaN(parsed) ? 0 : Math.max(0, parsed));
    setEditing(false);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="amount-input"
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        style={{ borderColor: color }}
        aria-label={label ? t.ariaAmountInput(label) : t.clickToEdit}
      />
    );
  }

  return (
    <button
      className="amount-display"
      onClick={start}
      title={t.clickToEdit}
      // Screen readers get the row name + current value even when the visual
      // shows just a dash for 0.
      aria-label={label ? t.ariaEditAmount(label, money(value)) : t.clickToEdit}
      style={{ color: value > 0 ? color || '#e2e8f0' : '#475569' }}
    >
      {value === 0 ? (showZero ? money(0) : '–') : money(value)}
    </button>
  );
};
