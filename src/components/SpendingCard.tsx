import { useId, useState } from 'react';
import { useLang } from '../i18n';
import { formatPeriodRange } from '../dateLabel';
import { categoryRange, type SpendingBreakdown } from '../spending';

// ── "Where did the money go?" ──────────────────────────────────────────────
//
// A direct answer at the top of Follow-up, with the uncertainty on the face of
// it rather than tucked into a collapsed row. Every figure comes from
// spending.ts, which sums the same entries the table below shows — so the card
// can summarise the table but never contradict it.
//
// Nothing here is phrased by anything but the app. That is deliberate, and it
// is the rule a language model would have to live under too if one is ever
// added: the words are fixed translations, the numbers are rendered from
// structured fields, and no sentence can carry a figure the arithmetic did not
// produce.

/** How many categories the card names. The rest are one tap away. */
const SHOWN = 3;

interface Props {
  breakdown: SpendingBreakdown;
  /** The days the view covers — the pay period, not the calendar month. */
  range: { from: Date; to: Date };
  /** A category's display name, including one the budget no longer has. */
  nameOf: (id: string) => string;
  /** Open the sorting list. Only offered when something is waiting in it. */
  onSort: () => void;
}

export const SpendingCard = ({ breakdown, range, nameOf, onSort }: Props) => {
  const { t, lang, money } = useLang();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const headingId = useId();
  const { categories, unsorted, count, status } = breakdown;

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
          {categories.length > 0 && (
            <ol className="spending-card-list">
              {categories.slice(0, SHOWN).map(c => (
                <li className="spending-card-row" key={c.id}>
                  <span className="spending-card-name">{nameOf(c.id)}</span>
                  <span className="spending-card-amount num">{money(c.amount)}</span>
                </li>
              ))}
            </ol>
          )}

          <p className="spending-card-fact">{t.spendingCount(count)}</p>
          {unsorted.amount > 0 && (
            <p className="spending-card-fact spending-card-unsorted">
              {t.spendingUnsorted(money(unsorted.amount), unsorted.count)}
            </p>
          )}

          <p className={`spending-card-status spending-card-status-${status}`}>
            {status === 'complete' && t.spendingStatusComplete}
            {status === 'partial' && t.spendingStatusPartial(nameOf(categories[0].id))}
            {status === 'insufficient' && t.spendingStatusInsufficient}
          </p>

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
            <ul className="spending-card-details" id={detailsId}>
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
          )}
        </>
      )}
    </section>
  );
};
