import { useLang, MONTHS } from '../i18n';

interface Props {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}

export const MonthNav = ({ year, month, onPrev, onNext, pickerOpen, onTogglePicker }: Props) => {
  const { lang, t } = useLang();
  return (
    <div className="month-nav">
      <button className="nav-btn" onClick={onPrev} aria-label={t.prevMonth}>‹</button>
      <button
        className={`month-title${pickerOpen ? ' month-title-open' : ''}`}
        onClick={onTogglePicker}
        aria-expanded={pickerOpen}
        title={MONTHS[lang][month]}
      >
        <span className="month-title-text">{MONTHS[lang][month]} {year}</span>
        <span className="month-title-caret">{pickerOpen ? '▴' : '▾'}</span>
      </button>
      <button className="nav-btn" onClick={onNext} aria-label={t.nextMonth}>›</button>
    </div>
  );
};
