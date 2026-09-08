import { useLang, MONTHS } from '../i18n';
import { PeriodLabel } from './PeriodLabel';

interface Props {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  /** This month's own period text, if the user wrote one. */
  periodLabel?: string;
  /** Pay-period start day, or null when the rule is off. */
  periodStartDay: number | null;
  onPeriodLabelChange: (label: string | undefined) => void;
}

export const MonthNav = ({
  year, month, onPrev, onNext, pickerOpen, onTogglePicker,
  periodLabel, periodStartDay, onPeriodLabelChange,
}: Props) => {
  const { lang, t } = useLang();
  return (
    <div className="month-nav-wrap">
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
      {/* Descriptive only — the month's figures still belong to the month. */}
      <PeriodLabel
        value={periodLabel}
        startDay={periodStartDay}
        year={year}
        month={month}
        monthName={`${MONTHS[lang][month]} ${year}`}
        onChange={onPeriodLabelChange}
      />
    </div>
  );
};
