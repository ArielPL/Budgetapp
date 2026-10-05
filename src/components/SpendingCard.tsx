import { useId, useState } from 'react';
import { useLang } from '../i18n';
import { formatPeriodRange, shortDay } from '../dateLabel';
import {
  categoryRange,
  type SpendingBreakdown, type PurchaseHighlights,
} from '../spending';
import type { HiddenPlaces } from '../spendingPrefs';

// ── "Where did the money go?" ──────────────────────────────────────────────
//
// A direct answer at the top of Follow-up, with the uncertainty on the face of
// it rather than tucked into a collapsed row. Every figure comes from
// spending.ts, which sums the same entries the table below shows — so the card
// can summarise the table but never contradict it.
//
// It leads with what a person cannot see in their head: the biggest purchases,
// and the small ones that add up. "Boende was the biggest" was true and told
// nobody anything (Ariel, 2026-10-03); the categories are one tap away.
//
// Nothing here is phrased by anything but the app. That is deliberate, and it
// is the rule a language model would have to live under too if one is ever
// added: the words are fixed translations, the numbers are rendered from
// structured fields, and no sentence can carry a figure the arithmetic did not
// produce.

/** How many rows each list shows at first, and at most. */
const SHOWN = 3;
const SHOWN_MORE = 10;

interface Props {
  breakdown: SpendingBreakdown;
  highlights: PurchaseHighlights;
  /** The days the view covers — the pay period, not the calendar month. */
  range: { from: Date; to: Date };
  /** A category's display name, including one the budget no longer has. */
  nameOf: (id: string) => string;
  /** Open the sorting list. Only offered when something is waiting in it. */
  onSort: () => void;
  smallLimit: number;
  limitChoices: number[];
  onLimit: (limit: number) => void;
  hidden: HiddenPlaces;
  /** Stop counting a place on this card; resolves once that is stored. */
  onHide: (key: string, text: string) => void;
  onUnhide: (key: string) => void;
}

export const SpendingCard = ({
  breakdown, highlights, range, nameOf, onSort,
  smallLimit, limitChoices, onLimit, hidden, onHide, onUnhide,
}: Props) => {
  const { t, lang, money } = useLang();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const detailsId = useId();
  const headingId = useId();
  const hiddenId = useId();
  const limitId = useId();
  const { categories, unsorted, count, status } = breakdown;
  const { biggest, small } = highlights;
  const shown = more ? SHOWN_MORE : SHOWN;
  const hiddenPlaces = Object.entries(hidden);
  const canShowMore = biggest.length > SHOWN || small.places.length > SHOWN;
  // The limit on offer always includes the one in use, even if it was set to
  // something the list for this currency does not hold.
  const choices = limitChoices.includes(smallLimit)
    ? limitChoices : [...limitChoices, smallLimit].sort((a, b) => a - b);

  const hideButton = (key: string, text: string) => (
    <button
      className="spending-card-hide"
      aria-label={t.spendingHide(text)}
      title={t.spendingHide(text)}
      onClick={() => onHide(key, text)}
    >
      <span aria-hidden="true">✕</span>
    </button>
  );

  return (
    <section className="spending-card" aria-labelledby={headingId}>
      <div className="spending-card-head">
        <h3 className="spending-card-title" id={headingId}>{t.spendingTitle}</h3>
        {/* Always shown: "September" is not a fact until it says which days. */}
        <span className="spending-card-range">{formatPeriodRange(range, lang)}</span>
      </div>

      {status === 'empty' ? (
        <p className="spending-card-empty">{t.spendingEmpty}</p>
      ) : (
        <>
          {biggest.length === 0 && small.count === 0 && (
            <p className="spending-card-fact">{t.spendingNoPurchases}</p>
          )}

          {biggest.length > 0 && (
            <div className="spending-card-section">
              <h4 className="spending-card-subtitle">{t.spendingBiggest}</h4>
              <ol className="spending-card-list">
                {biggest.slice(0, shown).map(p => (
                  <li className="spending-card-row" key={p.id}>
                    <span className="spending-card-name">
                      {p.text}
                      <span className="spending-card-meta">
                        {shortDay(p.date, lang)}
                        {p.unsorted && <> · <span className="spending-card-tag">{t.spendingUnsortedTag}</span></>}
                      </span>
                    </span>
                    <span className="spending-card-amount num">{money(p.amount)}</span>
                    {hideButton(p.key, p.text)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {small.count > 0 && (
            <div className="spending-card-section">
              <h4 className="spending-card-subtitle">{t.spendingSmall(money(small.total))}</h4>
              <p className="spending-card-fact">
                {t.spendingSmallSub(small.count, money(smallLimit))}
              </p>
              <ol className="spending-card-list">
                {small.places.slice(0, shown).map(p => (
                  <li className="spending-card-row" key={p.key}>
                    <span className="spending-card-name">
                      {p.text}
                      <span className="spending-card-meta">{t.spendingTimes(p.count)}</span>
                    </span>
                    <span className="spending-card-amount num">{money(p.total)}</span>
                    {hideButton(p.key, p.text)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {canShowMore && (
            <button className="spending-card-link" aria-expanded={more} onClick={() => setMore(m => !m)}>
              {more ? t.spendingShowFewer : t.spendingShowMore}
            </button>
          )}

          <div className="spending-card-limit">
            <label htmlFor={limitId}>{t.spendingLimitLabel}</label>
            <select
              id={limitId}
              value={smallLimit}
              onChange={ev => onLimit(Number(ev.target.value))}
            >
              {choices.map(n => <option key={n} value={n}>{money(n)}</option>)}
            </select>
          </div>

          {/* Said out loud, or the rent going missing from "the biggest
              purchases" would read as a mistake. */}
          <p className="spending-card-fact">{t.spendingFixedNote}</p>

          {hiddenPlaces.length > 0 && (
            <div className="spending-card-hidden">
              <p className="spending-card-fact">
                {t.spendingHiddenCount(hiddenPlaces.length)}{' · '}
                <button
                  className="spending-card-link"
                  aria-expanded={hiddenOpen}
                  aria-controls={hiddenId}
                  onClick={() => setHiddenOpen(o => !o)}
                >
                  {hiddenOpen ? t.spendingHiddenHide : t.spendingHiddenShow}
                </button>
              </p>
              {hiddenOpen && (
                <ul className="spending-card-details" id={hiddenId}>
                  {hiddenPlaces.map(([key, text]) => (
                    <li className="spending-card-detail" key={key}>
                      <span className="spending-card-name">{text}</span>
                      <button
                        className="spending-card-btn"
                        aria-label={t.spendingUnhide(text)}
                        onClick={() => onUnhide(key)}
                      >
                        {t.spendingUnhideShort}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="spending-card-fact">{t.spendingCount(count)}</p>
          {unsorted.amount > 0 && (
            <p className="spending-card-fact spending-card-unsorted">
              {t.spendingUnsorted(money(unsorted.amount), unsorted.count)}
            </p>
          )}

          <div className="spending-card-actions">
            {unsorted.count > 0 && (
              <button className="spending-card-btn spending-card-btn-primary" onClick={onSort}>
                {t.spendingSort}
              </button>
            )}
            {categories.length > 0 && (
              <button
                className="spending-card-btn"
                aria-expanded={open}
                aria-controls={detailsId}
                onClick={() => setOpen(o => !o)}
              >
                {open ? t.spendingEvidenceHide : t.spendingEvidenceShow}
              </button>
            )}
          </div>

          {open && (
            <div id={detailsId}>
              <ul className="spending-card-details">
                {categories.map(c => {
                  const { high } = categoryRange(breakdown, c.id);
                  return (
                    <li className="spending-card-detail" key={c.id}>
                      <span className="spending-card-name">{nameOf(c.id)}</span>
                      <span className="spending-card-detail-meta">
                        {t.csvRows(c.count)} · {money(c.amount)}
                        {/* A quantity, so a range — never a guess that narrows it. */}
                        {unsorted.amount > 0 && <> · {t.spendingUpTo(money(high))}</>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className={`spending-card-status spending-card-status-${status}`}>
                {status === 'complete' && t.spendingStatusComplete}
                {status === 'partial' && t.spendingStatusPartial(nameOf(categories[0].id))}
                {status === 'insufficient' && t.spendingStatusInsufficient}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
