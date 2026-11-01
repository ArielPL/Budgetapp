import { monthTitle } from '../dateLabel';
import { useLang, MONTHS, MONTHS_SHORT } from '../i18n';
import { PeriodLabel } from './PeriodLabel';
import type { PeriodLocks } from '../periodLabel';

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
  /** Pinned periods, forwarded so the header and the follow-up tab agree. */
  periodLocks?: PeriodLocks;
  onPeriodLabelChange: (label: string | undefined) => void;
}

export const MonthNav = ({
  year, month, onPrev, onNext, pickerOpen, onTogglePicker,
  periodLabel, periodStartDay, periodLocks, onPeriodLabelChange,
}: Props) => {
  const { lang, t } = useLang();
  return (
    <div className="month-nav-wrap">
      <div className="month-nav">
        <button className="nav-btn" onClick={onPrev} aria-label={t.prevMonth}>‹</button>
        <button
          className={`month-title${pickerOpen ? ' month-title-open' : ''}`}
          data-guide="month"
          onClick={onTogglePicker}
          aria-expanded={pickerOpen}
          title={MONTHS[lang][month]}
        >
          <span className="month-title-text month-title-full">{monthTitle(month, year, lang)}</span>
          {/* Narrow screens: month and year as two parts, which stack — month
              over a smaller year — where one line cannot hold them: always for
              Japanese and Chinese ("2026年10月" needs 148px, a 320px phone gives
              the title 104), and at larger text sizes for every language. Both
              are always shown; an ellipsis must never eat the month or the year
              (review 2026-10-17, P2). */}
          <span className={`month-title-text month-title-short${lang === 'ja' || lang === 'zh' ? ' is-cjk' : ''}`}>
            <span className="mt-month">{lang === 'ja' || lang === 'zh' ? MONTHS[lang][month] : MONTHS_SHORT[lang][month]}</span>
            <span className="mt-year">{year}</span>
          </span>
          <span className="month-title-caret">{pickerOpen ? '▴' : '▾'}</span>
        </button>
        <button className="nav-btn" onClick={onNext} aria-label={t.nextMonth}>›</button>
      </div>
      {/* Descriptive only — the month's figures still belong to the month. */}
      <PeriodLabel
        value={periodLabel}
        startDay={periodStartDay}
        locks={periodLocks}
        year={year}
        month={month}
        monthName={monthTitle(month, year, lang)}
        onChange={onPeriodLabelChange}
      />
    </div>
  );
};
