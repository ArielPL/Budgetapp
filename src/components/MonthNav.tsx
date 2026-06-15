import { useLang, MONTHS } from '../i18n';

interface Props {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
}

export const MonthNav = ({ year, month, onPrev, onNext }: Props) => {
  const { lang, t } = useLang();
  return (
    <div className="month-nav">
      <button className="nav-btn" onClick={onPrev} aria-label={t.prevMonth}>‹</button>
      <h1 className="month-title">{MONTHS[lang][month]} {year}</h1>
      <button className="nav-btn" onClick={onNext} aria-label={t.nextMonth}>›</button>
    </div>
  );
};
