import { useState, useRef, useEffect } from 'react';
import { useLang } from '../i18n';
import { formatPeriodRange } from '../dateLabel';
import {
  periodLabelFor, PERIOD_LABEL_MAX, type PeriodRange, type PeriodLocks,
} from '../periodLabel';

// The line under the month heading: "25 jul – 24 aug", or whatever the user
// typed instead. Click to write your own, clear it to go back to automatic.
//
// A deliberately separate component rather than the shared EditableLabel: that
// one drops an empty value and keeps the old text, which is right for a row name
// (a nameless row is useless) and wrong here — clearing the field is precisely
// how a month returns to the generated label.

interface Props {
  /** This month's own text, if it has one. */
  value?: string;
  /** Day of the month the pay period starts, or null when the rule is off. */
  startDay: number | null;
  /** Periods pinned by hand. The header and the follow-up tab must read the
   *  same ones, or they print two different ranges for one month. */
  locks?: PeriodLocks;
  year: number;
  month: number;
  monthName: string;
  onChange: (label: string | undefined) => void;
}

export const PeriodLabel = ({
  value, startDay, locks = {}, year, month, monthName, onChange,
}: Props) => {
  const { lang, t } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  // Lower-case month inside a date, and shared with the spending card, so both
  // print a period the same way — see formatPeriodRange in dateLabel.ts.
  const format = (r: PeriodRange) => formatPeriodRange(r, lang);

  /** What the rule alone would say — the placeholder, and what clearing restores. */
  const generated = periodLabelFor({ startDay, year, month, format, locks });
  const shown = periodLabelFor({ override: value, startDay, year, month, format, locks });

  const commit = () => {
    const trimmed = draft.trim();
    // Empty means "use the rule again", stored as absent rather than as an empty
    // string so nothing is left behind to puzzle over later.
    onChange(trimmed === '' ? undefined : trimmed.slice(0, PERIOD_LABEL_MAX));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="period-label-input"
        value={draft}
        maxLength={PERIOD_LABEL_MAX}
        // The generated text as placeholder, so an empty field visibly shows
        // what clearing gets you back.
        placeholder={generated ?? t.periodLabelPlaceholder}
        aria-label={t.periodLabelAria(monthName)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  // No rule and nothing typed: stay out of the way entirely.
  if (!shown) return null;

  return (
    <button
      className={`period-label${value ? ' period-label-own' : ''}`}
      onClick={() => { setDraft(value ?? ''); setEditing(true); }}
      aria-label={t.periodLabelAria(monthName)}
    >
      {shown}
    </button>
  );
};
