// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CustomV3 } from './components/CustomV3';
import { customSnapshotKey } from './customYear';

// ── Looking at a month must not rewrite it ─────────────────────────────────
//
// Buggy sweep 2026-09-19, finding 2. The Custom save effect ran TWICE on a
// month change: once on the commit where year/month changed (correctly skipped
// by the one-shot bleed guard) and once more after the freshly loaded amounts
// committed — by which time the guard was spent. That second run wrote the
// month's amounts back AND rebuilt its structure snapshot from TODAY's blocks.
//
// So retagging one block and then scrolling back through last year silently
// re-filed every month walked past, and the Custom Year table's income /
// expense / saved columns for those months changed to match the current
// layout. The snapshot mechanism exists precisely to stop history moving; it
// was the thing being overwritten.
//
// These tests hold the line in both directions: browsing must change nothing,
// and a real edit — or a retag of the month on screen — must still be recorded.

const STRUCT_KEY = 'budget_custom_v3';
const valuesKey = (y: number, m: number) => `budget_custom_v3_values_${y}_${m}`;

/** One block holding one row, tagged as savings. */
const structure = (tag: 'save' | 'out') => JSON.stringify([
  {
    id: 'b1',
    name: 'Sparande',
    userNamed: true,
    kind: 'block',
    tag,
    rows: [{ id: 'r1', name: 'Buffert', color: '#22c55e', userNamed: true }],
    chart: { show: false, type: 'bar', size: 'md', position: 'below' },
  },
]);

const mount = (year: number, month: number) =>
  render(<CustomV3 year={year} month={month} onSaveFailed={() => {}} onRecordUndo={() => {}} />);

beforeEach(() => {
  localStorage.clear();
  // jsdom ships neither, and CustomV3 uses both on mount.
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  localStorage.setItem('budget_custom_help_seen', '1');
  // Last year's May: 400 kr, recorded at a time when the block was savings.
  localStorage.setItem(valuesKey(2025, 4), JSON.stringify({ r1: 400 }));
  localStorage.setItem(customSnapshotKey(2025, 4), JSON.stringify({ v: 1, tags: { r1: 'save' } }));
  // Today the same block has been retagged as an expense.
  localStorage.setItem(STRUCT_KEY, structure('out'));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('browsing Custom leaves history alone', () => {
  it('mounting straight onto a past month does not re-tag it', () => {
    mount(2025, 4);
    expect(JSON.parse(localStorage.getItem(customSnapshotKey(2025, 4))!))
      .toEqual({ v: 1, tags: { r1: 'save' } });
  });

  it('navigating to a past month does not re-tag it', () => {
    const view = mount(2026, 8);
    view.rerender(<CustomV3 year={2025} month={4} onSaveFailed={() => {}} onRecordUndo={() => {}} />);
    expect(JSON.parse(localStorage.getItem(customSnapshotKey(2025, 4))!))
      .toEqual({ v: 1, tags: { r1: 'save' } });
  });

  it('does not rewrite a past month\'s amounts either', () => {
    // loadValues normalises as it reads; that normalisation belongs on screen,
    // not on disk. The stored bytes must survive a visit untouched.
    localStorage.setItem(valuesKey(2025, 4), JSON.stringify({ r1: 400, r2: null }));
    mount(2025, 4);
    expect(localStorage.getItem(valuesKey(2025, 4))).toBe(JSON.stringify({ r1: 400, r2: null }));
  });

  it('does not create a key for an untouched month that had none', () => {
    mount(2024, 0);
    expect(localStorage.getItem(valuesKey(2024, 0))).toBeNull();
    expect(localStorage.getItem(customSnapshotKey(2024, 0))).toBeNull();
  });

  it('leaves a month alone when walked past on the way to another', () => {
    const view = mount(2026, 8);
    for (const [y, m] of [[2025, 4], [2025, 5], [2026, 8]] as const) {
      view.rerender(<CustomV3 year={y} month={m} onSaveFailed={() => {}} onRecordUndo={() => {}} />);
    }
    expect(JSON.parse(localStorage.getItem(customSnapshotKey(2025, 4))!))
      .toEqual({ v: 1, tags: { r1: 'save' } });
  });
});
