import { describe, it, expect } from 'vitest';
import {
  EXPENSE_CHART_STYLES, defaultChart, normalizeBlockChart, isValidBlockChart,
  isExpenseChartStyle, isChartSize, isChartPosition,
} from './blockChart';

// The picker used to offer 'trend' while both render paths drew bars, and the
// loader spread stored values over the defaults — preserving junk instead of
// normalizing it. These lock in the split: reading is defensive, importing is
// strict, and legacy 'trend' survives as the bars it always actually drew.

describe('allowed values', () => {
  it('no longer contains trend', () => {
    expect(EXPENSE_CHART_STYLES).not.toContain('trend');
    expect(isExpenseChartStyle('trend')).toBe(false);
  });

  it('accepts every style the UI can render', () => {
    for (const s of ['donut', 'pie', 'bars', 'list', 'stacked', 'treemap', 'radial']) {
      expect(isExpenseChartStyle(s)).toBe(true);
    }
  });

  it('guards sizes and positions', () => {
    expect(isChartSize('M')).toBe(true);
    expect(isChartSize('XXL')).toBe(false);
    expect(isChartPosition('between')).toBe(true);
    expect(isChartPosition('mitt-i')).toBe(false);
  });
});

describe('normalizeBlockChart — defensive read', () => {
  it('maps legacy trend to bars', () => {
    expect(normalizeBlockChart({ show: true, type: 'trend', size: 'L', position: 'top' }))
      .toEqual({ show: true, type: 'bars', size: 'L', position: 'top' });
  });

  it('keeps a fully valid config untouched', () => {
    const cfg = { show: true, type: 'treemap', size: 'S', position: 'right' };
    expect(normalizeBlockChart(cfg)).toEqual(cfg);
  });

  it('falls back per field, never throwing on junk', () => {
    expect(normalizeBlockChart({ show: 'ja', type: 'felaktig', size: 'XXL', position: 'mitt-i' }))
      .toEqual(defaultChart());
  });

  it('fills missing fields from the defaults', () => {
    expect(normalizeBlockChart({ type: 'pie' }))
      .toEqual({ ...defaultChart(), type: 'pie' });
  });

  it('survives a missing or non-object chart', () => {
    expect(normalizeBlockChart(undefined)).toEqual(defaultChart());
    expect(normalizeBlockChart(null)).toEqual(defaultChart());
    expect(normalizeBlockChart('trend')).toEqual(defaultChart());
    expect(normalizeBlockChart([])).toEqual(defaultChart());
  });

  it('treats a non-boolean show as not shown', () => {
    expect(normalizeBlockChart({ show: 'true' }).show).toBe(false);
    expect(normalizeBlockChart({ show: 1 }).show).toBe(false);
  });
});

describe('isValidBlockChart — strict import gate', () => {
  it('accepts a complete valid config', () => {
    expect(isValidBlockChart({ show: true, type: 'radial', size: 'L', position: 'between' })).toBe(true);
  });

  it('accepts an absent chart as an older backup format', () => {
    expect(isValidBlockChart(undefined)).toBe(true);
    expect(isValidBlockChart(null)).toBe(true);
  });

  it('accepts partial configs — missing fields get defaults later', () => {
    expect(isValidBlockChart({})).toBe(true);
    expect(isValidBlockChart({ type: 'bars' })).toBe(true);
  });

  it('accepts legacy trend as the one migration exception', () => {
    expect(isValidBlockChart({ type: 'trend' })).toBe(true);
    expect(normalizeBlockChart({ type: 'trend' }).type).toBe('bars');
  });

  it('rejects an unknown type, size or position', () => {
    expect(isValidBlockChart({ type: 'felaktig' })).toBe(false);
    expect(isValidBlockChart({ size: 'XXL' })).toBe(false);
    expect(isValidBlockChart({ position: 'mitt-i' })).toBe(false);
  });

  it('rejects a stringified boolean for show', () => {
    expect(isValidBlockChart({ show: 'true' })).toBe(false);
    expect(isValidBlockChart({ show: 'ja' })).toBe(false);
  });

  it('rejects a non-object chart', () => {
    expect(isValidBlockChart('donut')).toBe(false);
    expect(isValidBlockChart(['donut'])).toBe(false);
  });
});
