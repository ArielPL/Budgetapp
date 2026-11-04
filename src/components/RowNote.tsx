import { useRef, useState } from 'react';
import type { BudgetRow } from '../types';
import { useLang } from '../i18n';
import { ROW_NOTE_MAX } from '../defaults';

// ── A short note on a budget row (Ariel, 2026-11-04) ──────────────────────
//
// "Swish to Anna on the 25th", "Ends in March": a line, not a document, so it
// stops at ROW_NOTE_MAX characters. It is part of the row, so it goes where
// the row goes — next month, the rest of the year, a backup — and can be
// changed in any month without touching the others.
//
// Two pieces, because they sit in different places on the row: the button
// beside the period picker, and the note itself on a line of its own under
// the row. The row's list keeps which one is open.

export const RowNoteButton = ({ row, label, open, onToggle }: {
  row: BudgetRow;
  /** The row's shown name, for the accessible label. */
  label: string;
  open: boolean;
  onToggle: () => void;
}) => {
  const { t } = useLang();
  return (
    <button type="button" className={`row-note-btn${row.note ? ' has-note' : ''}`}
      aria-expanded={open} aria-label={t.rowNoteAria(label)} title={t.rowNote} onClick={onToggle}>
      📝
    </button>
  );
};

export const RowNoteLine = ({ row, label, open, onOpen, onClose, onSave }: {
  row: BudgetRow;
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** The new note; undefined when it was emptied. */
  onSave: (note: string | undefined) => void;
}) => {
  const { t } = useLang();
  if (open) return <NoteField row={row} label={label} onClose={onClose} onSave={onSave} />;
  if (!row.note) return null;
  return (
    <button type="button" className="row-note-line row-note-text" onClick={onOpen} aria-label={t.rowNoteAria(label)}>
      {row.note}
    </button>
  );
};

/** The field, mounted each time it opens, so it always starts from the note
 *  the row has now — not from another month's row with the same id. */
const NoteField = ({ row, label, onClose, onSave }: {
  row: BudgetRow;
  label: string;
  onClose: () => void;
  onSave: (note: string | undefined) => void;
}) => {
  const { t } = useLang();
  const [draft, setDraft] = useState(row.note ?? '');
  // Escape closes without saving; the blur that follows must not save either.
  const cancelled = useRef(false);
  const save = () => {
    if (cancelled.current) return;
    const note = draft.trim().slice(0, ROW_NOTE_MAX);
    if (note !== (row.note ?? '')) onSave(note === '' ? undefined : note);
    onClose();
  };
  return (
    <span className="row-note-line">
      <input
        className="row-note-input" autoFocus maxLength={ROW_NOTE_MAX}
        value={draft} placeholder={t.rowNotePlaceholder(ROW_NOTE_MAX)} aria-label={t.rowNoteAria(label)}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; onClose(); }
        }}
      />
      <span className="row-note-count" aria-hidden="true">{draft.length}/{ROW_NOTE_MAX}</span>
    </span>
  );
};
