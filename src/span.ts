// ── span — looking at more than one budget month at a time ─────────────────
//
// The follow-up tab answers "how did September go". It could not answer "how
// much do I actually spend on food", which is the question anyone with a grip
// on their money asks second — and the one a bank statement never answers,
// because it is sorted by date rather than by where the money went.
//
// Pure, so the arithmetic of which months are in view is unit-tested without a
// browser and cannot disagree with itself between the table and the header.

export interface SpanMonth {
  year: number;
  month: number;
}

/** How many months each choice covers. 1 is the plain single month the tab
 *  started as, and stays the default. */
export const SPANS = [1, 3, 6, 12] as const;
export type Span = (typeof SPANS)[number];

export function isSpan(n: number): n is Span {
  return (SPANS as readonly number[]).includes(n);
}

/**
 * The months a span covers, oldest first, ENDING at the month on screen.
 *
 * Ending rather than starting there because the month you are looking at is the
 * one you care most about; a span that ran forwards would mostly show months
 * that have not happened yet.
 */
export function spanMonths(year: number, month: number, count: number): SpanMonth[] {
  const out: SpanMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    // Date normalises a negative month index into the previous year for us, so
    // there is no rollover arithmetic here to get wrong.
    const d = new Date(year, month - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}
