import { describe, it, expect } from 'vitest';
import { axisTickLabels, axisWidth, MIN_AXIS_WIDTH } from './axisWidth';

// ── The Year chart's axes fit their labels (full sweep 2026-10-08) ─────────

describe('axisWidth', () => {
  it('keeps the old 38 px for an ordinary budget', () => {
    expect(axisWidth([42000, 36000, null], 'sv')).toBe(MIN_AXIS_WIDTH);
    expect(axisWidth([], 'en')).toBe(MIN_AXIS_WIDTH);
    expect(axisWidth([null, null], 'es')).toBe(MIN_AXIS_WIDTH);
  });

  it('prints the ticks the axis will show, the longest included', () => {
    expect(axisTickLabels(1e12, 'sv')).toContain('750md');
    expect(axisTickLabels(1e12, 'es').some(l => l.includes('mil\u00a0M'))).toBe(true);
    // No ordinary space left for the chart to break the label at.
    expect(axisTickLabels(1e12, 'es').every(l => !l.includes(' '))).toBe(true);
  });

  it('widens for billion-scale labels instead of cutting "750md" to "50md"', () => {
    const sv = axisWidth([999_999_999_999], 'sv');
    const es = axisWidth([999_999_999_999], 'es');
    expect(sv).toBeGreaterThan(MIN_AXIS_WIDTH);
    // About 7 px a character at 11 px: every label must fit.
    for (const l of axisTickLabels(999_999_999_999, 'sv')) expect(sv).toBeGreaterThanOrEqual(l.length * 7);
    for (const l of axisTickLabels(999_999_999_999, 'es')) expect(es).toBeGreaterThanOrEqual(l.length * 7);
  });
});
