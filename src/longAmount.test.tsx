// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SummaryCards } from './components/SummaryCards';

// ── The step-down for an amount too long for a narrow card ─────────────────
//
// Measured in the app at 320px, where a summary card gives its amount 122px at
// the normal 0.95rem: 14 characters still fit ("999 999 999 kr" needs 105px),
// 17 needs 130px and the longest possible ("+999 999 999,50 kr") needs 140px.
// So the marker goes on at 15 characters and one size step absorbs the rest.
//
// What matters is that it stays RARE. Shrinking ordinary amounts to solve this
// was explicitly the wrong answer: an ordinary salary with öre must keep the
// full size, and only hundreds of millions with öre step down. The CSS that
// acts on the marker is scoped to max-width 360px, so a normal phone never
// shrinks anything at all.

beforeEach(() => localStorage.clear());
afterEach(cleanup);

/** Which of the three cards carry the step-down marker. */
const marked = (income: number, expenses: number) => {
  cleanup();
  render(<SummaryCards totalIncome={income} totalExpenses={expenses} year={2026} month={8} />);
  return [...document.querySelectorAll('.card-amount')]
    .map(e => e.className.includes('card-amount-long'));
};

describe('long-amount step-down', () => {
  it('leaves ordinary amounts alone', () => {
    // 32 596 kr / 17 801 kr / +14 795 kr — nothing near the limit.
    expect(marked(32596, 17801)).toEqual([false, false, false]);
  });

  it('leaves a salary with öre alone — the case the card fix was really about', () => {
    // "30 000,50 kr" is 12 characters and fits at full size.
    expect(marked(30000.5, 11000)).toEqual([false, false, false]);
  });

  it('leaves a whole-krona amount of hundreds of millions alone', () => {
    // "999 999 999 kr" is 14 characters and still fits.
    expect(marked(999999999, 0)[0]).toBe(false);
  });

  it('marks hundreds of millions WITH öre', () => {
    // "999 999 999,50 kr" is 17 characters and overflows at 320px.
    expect(marked(999999999.5, 0)[0]).toBe(true);
  });

  it('marks the remaining card, which also carries a + sign', () => {
    // The sign is rendered beside the amount, so it counts toward the width.
    const [, , remaining] = marked(999999999.5, 17801);
    expect(remaining).toBe(true);
  });

  it('does not mark a billion, which is compacted to something short', () => {
    // At 1e9 and above the card already shows "1,0 md kr" with the exact figure
    // in title/aria-label. Marking it would shrink a string that is 9 long.
    expect(marked(1e9, 0)[0]).toBe(false);
    expect(marked(1.5e12, 0)[0]).toBe(false);
  });
});
