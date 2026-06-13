import { useState, useRef, useEffect, type KeyboardEvent } from 'react';

interface Props {
  value: number;
  onChange: (val: number) => void;
  color?: string;
}

export const EditableAmount = ({ value, onChange, color }: Props) => {
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
      />
    );
  }

  return (
    <button
      className="amount-display"
      onClick={start}
      title="Klicka för att redigera"
      style={{ color: value > 0 ? color || '#e2e8f0' : '#475569' }}
    >
      {value === 0 ? '–' : value.toLocaleString('sv-SE')} <span className="currency">kr</span>
    </button>
  );
};
