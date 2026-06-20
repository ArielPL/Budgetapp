import { useLang, MONTHS_SHORT } from '../i18n';

interface Props {
  year: number;
  month: number;
  onSelect: (month: number) => void;
  onYearChange: (delta: number) => void;
}

export const MonthStrip = ({ year, month, onSelect, onYearChange }: Props) => {
  const { lang } = useLang();

  return (
    <div className="month-picker">
      <div className="month-picker-year">
        <button className="nav-btn nav-btn-sm" onClick={() => onYearChange(-1)} aria-label={`${year - 1}`}>‹</button>
        <span className="month-picker-year-label">{year}</span>
        <button className="nav-btn nav-btn-sm" onClick={() => onYearChange(1)} aria-label={`${year + 1}`}>›</button>
      </div>
      <div className="month-grid">
        {MONTHS_SHORT[lang].map((m, i) => (
          <button
            key={i}
            className={`month-pill ${i === month ? 'month-pill-active' : ''}`}
            onClick={() => onSelect(i)}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
};
