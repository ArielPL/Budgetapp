import { useState, useRef, useEffect } from 'react';
import { useLang } from '../i18n';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export const EditableLabel = ({ value, onChange }: Props) => {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const start = () => { setDraft(value); setEditing(true); };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="label-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <span className="row-label editable-label" onClick={start} title={t.clickToRename}>
      {value}
    </span>
  );
};
