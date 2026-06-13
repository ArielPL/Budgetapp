import { SWEDISH_MONTHS } from '../defaults';

interface Props {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
}

export const MonthNav = ({ year, month, onPrev, onNext }: Props) => (
  <div className="month-nav">
    <button className="nav-btn" onClick={onPrev} aria-label="Föregående månad">‹</button>
    <h1 className="month-title">{SWEDISH_MONTHS[month]} {year}</h1>
    <button className="nav-btn" onClick={onNext} aria-label="Nästa månad">›</button>
  </div>
);
