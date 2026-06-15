import { useRef, useEffect } from 'react';
import { useLang, MONTHS_SHORT } from '../i18n';

interface Props {
  year: number;
  month: number;
  onSelect: (month: number) => void;
  onYearChange: (delta: number) => void;
}

export const MonthStrip = ({ year, month, onSelect, onYearChange }: Props) => {
  const { lang } = useLang();
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }, [month]);

  return (
    <div className="month-strip-wrap">
      <button className="year-btn" onClick={() => onYearChange(-1)}>‹ {year - 1}</button>
      <div className="month-strip">
        {MONTHS_SHORT[lang].map((m, i) => (
          <button
            key={i}
            ref={i === month ? activeRef : null}
            className={`month-pill ${i === month ? 'month-pill-active' : ''}`}
            onClick={() => onSelect(i)}
          >
            {m}
          </button>
        ))}
      </div>
      <button className="year-btn" onClick={() => onYearChange(1)}>{year + 1} ›</button>
    </div>
  );
};
