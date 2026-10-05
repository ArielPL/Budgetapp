import { describe, it, expect } from 'vitest';
import { spendingBreakdown, categoryRange, purchaseHighlights, FIXED_COST_CATEGORIES } from './spending';
import { formatPeriodRange } from './dateLabel';
import { INCOME_ACTUAL_ID, TRANSFER_ACTUAL_ID, UNSORTED_ACTUAL_ID } from './actuals';
import type { ActualEntry } from './types';

// ── "Where did the money go?" ──────────────────────────────────────────────
//
// The status rules are the part that must never drift into a judgement call.
// A claim ("X is the biggest") is checked against the worst case; a quantity
// ("how much on X") is a range. No threshold anywhere.

let n = 0;
const spend = (categoryId: string, amount: number, direction: 'in' | 'out' = 'out'): ActualEntry =>
  ({ id: `e${++n}`, date: '2026-09-05', text: `SYNTETISK ${n}`, amount, direction, categoryId });

describe('spendingBreakdown — what it counts', () => {
  it('ranks categories by money, biggest first', () => {
    const b = spendingBreakdown([spend('transport', 2130), spend('mat', 4820), spend('mat', 0.5)]);
    expect(b.categories.map(c => [c.id, c.amount, c.count])).toEqual([
      ['mat', 4820.5, 2],
      ['transport', 2130, 1],
    ]);
  });

  it('leaves out income and transfers — neither is spending', () => {
    const b = spendingBreakdown([
      spend('mat', 100),
      spend(INCOME_ACTUAL_ID, 30000, 'in'),
      spend(TRANSFER_ACTUAL_ID, 5000),
    ]);
    expect(b.categories.map(c => c.id)).toEqual(['mat']);
    expect(b.count).toBe(1);
  });

  it('lets a refund reduce its category, as the table does', () => {
    const b = spendingBreakdown([spend('mat', 500), spend('mat', 200, 'in')]);
    expect(b.categories[0].amount).toBe(300);
  });

  it('drops a category refunded to nothing — no money went there', () => {
    const b = spendingBreakdown([spend('mat', 200), spend('mat', 200, 'in'), spend('transport', 50)]);
    expect(b.categories.map(c => c.id)).toEqual(['transport']);
  });

  it('counts only money that LEFT in the unsorted pile', () => {
    // A Swish received and never sorted is not spending. Netting it off would
    // make the pile look smaller than the spending inside it.
    const b = spendingBreakdown([
      spend(UNSORTED_ACTUAL_ID, 1000),
      spend(UNSORTED_ACTUAL_ID, 400, 'in'),
      spend('mat', 5000),
    ]);
    expect(b.unsorted).toEqual({ amount: 1000, count: 1 });
  });

  it('counts every spending entry, sorted or not', () => {
    const b = spendingBreakdown([spend('mat', 1), spend('mat', 1), spend(UNSORTED_ACTUAL_ID, 1)]);
    expect(b.count).toBe(3);
  });
});

describe('spendingBreakdown — how far the answer can be trusted', () => {
  it('is empty when nothing was spent', () => {
    expect(spendingBreakdown([]).status).toBe('empty');
    expect(spendingBreakdown([spend(INCOME_ACTUAL_ID, 30000, 'in')]).status).toBe('empty');
  });

  it('is complete when nothing is unsorted', () => {
    expect(spendingBreakdown([spend('mat', 100), spend('transport', 90)]).status).toBe('complete');
  });

  it('is partial when even the worst case cannot change the leader', () => {
    // 8 000 against 4 000, with 1 000 unsorted. Give all of it to the
    // runner-up: 5 000 — still behind. The answer holds.
    const b = spendingBreakdown([spend('mat', 8000), spend('transport', 4000), spend(UNSORTED_ACTUAL_ID, 1000)]);
    expect(b.status).toBe('partial');
  });

  it('is insufficient when the unsorted money could overturn the leader', () => {
    const b = spendingBreakdown([spend('mat', 5000), spend('transport', 4500), spend(UNSORTED_ACTUAL_ID, 1000)]);
    expect(b.status).toBe('insufficient');
  });

  it('treats a possible tie as not a leader', () => {
    const b = spendingBreakdown([spend('mat', 5000), spend('transport', 4000), spend(UNSORTED_ACTUAL_ID, 1000)]);
    expect(b.status).toBe('insufficient');
  });

  it('checks a lone category against the pile itself', () => {
    // The pile could all belong to a category that has nothing yet.
    expect(spendingBreakdown([spend('mat', 5000), spend(UNSORTED_ACTUAL_ID, 4999)]).status).toBe('partial');
    expect(spendingBreakdown([spend('mat', 5000), spend(UNSORTED_ACTUAL_ID, 5000)]).status).toBe('insufficient');
  });

  it('is insufficient when everything is unsorted', () => {
    expect(spendingBreakdown([spend(UNSORTED_ACTUAL_ID, 300)]).status).toBe('insufficient');
  });
});

describe('categoryRange — a quantity is a range, never a narrowed guess', () => {
  it('runs from what is confirmed to that plus everything unsorted', () => {
    const b = spendingBreakdown([spend('restaurang', 1760), spend(UNSORTED_ACTUAL_ID, 1240)]);
    expect(categoryRange(b, 'restaurang')).toEqual({ low: 1760, high: 3000 });
  });

  it('is a point when nothing is unsorted', () => {
    const b = spendingBreakdown([spend('restaurang', 1760)]);
    expect(categoryRange(b, 'restaurang')).toEqual({ low: 1760, high: 1760 });
  });

  it('starts at zero for a category with nothing confirmed', () => {
    const b = spendingBreakdown([spend('mat', 100), spend(UNSORTED_ACTUAL_ID, 250)]);
    expect(categoryRange(b, 'restaurang')).toEqual({ low: 0, high: 250 });
  });
});

describe('formatPeriodRange — the header and the card print a period alike', () => {
  const range = { from: new Date(2026, 7, 25), to: new Date(2026, 8, 24) };

  it('writes the month in lower case inside a date in Swedish and Spanish', () => {
    expect(formatPeriodRange(range, 'sv')).toBe('25 aug – 24 sep');
    expect(formatPeriodRange(range, 'es')).toBe('25 ago – 24 sep');
  });

  it('keeps the capital in English', () => {
    expect(formatPeriodRange(range, 'en')).toBe('25 Aug – 24 Sep');
  });
});

// ── The biggest purchases and the small ones ───────────────────────────────

describe('purchaseHighlights', () => {
  let m = 0;
  const e = (categoryId: string, amount: number, text: string, direction: 'out' | 'in' = 'out'): ActualEntry =>
    ({ id: `p${++m}`, date: `2026-09-${String(10 + (m % 15)).padStart(2, '0')}`, text, amount, direction, categoryId });
  const key = (t: string) => t.toLowerCase();

  it('splits purchases at the limit: the limit itself is not small', () => {
    const h = purchaseHighlights([e('mat', 199, 'A'), e('mat', 200, 'B'), e('mat', 5000, 'C')], 200, new Set(), key);
    expect(h.biggest.map(p => p.text)).toEqual(['C', 'B']);
    expect(h.small).toMatchObject({ total: 199, count: 1 });
  });

  it('leaves out fixed costs, income, transfers and refunds', () => {
    const h = purchaseHighlights([
      ...[...FIXED_COST_CATEGORIES].map(id => e(id, 30, `FIX ${id}`)),
      e(INCOME_ACTUAL_ID, 30000, 'LÖN', 'in'),
      e(TRANSFER_ACTUAL_ID, 5000, 'EGET KONTO'),
      e('mat', 80, 'RETUR', 'in'),
      e('mat', 80, 'KÖP'),
    ], 200, new Set(), key);
    expect(h.biggest).toEqual([]);
    expect(h.small.places.map(p => p.text)).toEqual(['KÖP']);
  });

  it('counts unsorted purchases, marked as such', () => {
    const h = purchaseHighlights([e(UNSORTED_ACTUAL_ID, 900, 'OKÄND')], 200, new Set(), key);
    expect(h.biggest[0]).toMatchObject({ text: 'OKÄND', unsorted: true });
  });

  it('groups small purchases by place, most money first', () => {
    const h = purchaseHighlights([
      e('mat', 40, 'Kafé'), e('mat', 40, 'KAFÉ'), e('mat', 60, 'Kiosk'), e('fritid', 90, 'Bio'),
    ], 200, new Set(), key);
    expect(h.small.places.map(p => [p.text, p.count, p.total])).toEqual([['Bio', 1, 90], ['Kafé', 2, 80], ['Kiosk', 1, 60]]);
    expect(h.small).toMatchObject({ total: 230, count: 4 });
  });

  it('leaves out a hidden place from both lists', () => {
    const h = purchaseHighlights([e('fritid', 1245, 'SJ'), e('fritid', 60, 'SJ'), e('mat', 50, 'X')],
      200, new Set(['sj']), key);
    expect(h.biggest).toEqual([]);
    expect(h.small.places.map(p => p.text)).toEqual(['X']);
  });
});
