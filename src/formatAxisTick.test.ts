import { describe, it, expect } from 'vitest';
import { formatAxisTick, formatMoneyCompact } from './i18n';

describe('formatAxisTick', () => {
  it('shows sub-1000 values in full', () => {
    expect(formatAxisTick(0, 'en')).toBe('0');
    expect(formatAxisTick(250, 'en')).toBe('250');
    expect(formatAxisTick(750, 'en')).toBe('750');
  });

  it('compacts thousands with one decimal, no false rounding', () => {
    expect(formatAxisTick(1000, 'en')).toBe('1k');
    expect(formatAxisTick(1500, 'en')).toBe('1.5k');
    expect(formatAxisTick(12500, 'en')).toBe('12.5k');
    expect(formatAxisTick(30000, 'en')).toBe('30k');
  });

  it('uses the language decimal separator (sv comma, en period)', () => {
    expect(formatAxisTick(1500, 'sv')).toBe('1,5k');
    expect(formatAxisTick(1500, 'en')).toBe('1.5k');
    expect(formatAxisTick(1500, 'es')).toBe('1,5k');
  });

  it('never collapses distinct ticks to the same label (the bug)', () => {
    const labels = [600, 800, 1000].map(v => formatAxisTick(v, 'en'));
    expect(labels).toEqual(['600', '800', '1k']);
    expect(new Set(labels).size).toBe(3); // all distinct
  });

  it('handles negatives', () => {
    expect(formatAxisTick(-500, 'en')).toBe('-500');
    expect(formatAxisTick(-2000, 'en')).toBe('-2k');
  });

  // §13: a 10-billion axis used to read "10 000 000k" and clip out of the box.
  it('steps through million / billion / trillion tiers', () => {
    expect(formatAxisTick(1_500_000, 'en')).toBe('1.5M');
    expect(formatAxisTick(1_000_000_000, 'en')).toBe('1B');
    expect(formatAxisTick(2_500_000_000, 'en')).toBe('2.5B');
    expect(formatAxisTick(1_000_000_000_000, 'en')).toBe('1T');
  });

  it('uses long-scale abbreviations for Swedish and Spanish billions', () => {
    // A Swedish "biljon" is 1e12 — B would be a false friend. 1e9 = miljard.
    expect(formatAxisTick(1_500_000, 'sv')).toBe('1,5M');
    expect(formatAxisTick(2_500_000_000, 'sv')).toBe('2,5md');
    expect(formatAxisTick(2_500_000_000, 'es')).toBe('2,5mil M');
    expect(formatAxisTick(1_000_000_000_000, 'sv')).toBe('1bn');
  });

  it('handles negative millions and billions', () => {
    expect(formatAxisTick(-1_500_000, 'en')).toBe('-1.5M');
    expect(formatAxisTick(-2_000_000_000, 'en')).toBe('-2B');
  });

  it('keeps neighbouring big ticks distinct', () => {
    const labels = [900_000_000, 1_000_000_000, 1_100_000_000].map(v => formatAxisTick(v, 'en'));
    expect(new Set(labels).size).toBe(3); // 900M / 1B / 1.1B
  });

  it('bumps to the next tier when rounding would print 1000', () => {
    // 999 999 999 999 sits under 1e12 but must not read "1,000B".
    expect(formatAxisTick(999_999_999_999, 'en')).toBe('1T');
    expect(formatAxisTick(999_999, 'en')).toBe('1M');   // not "1,000k"
    expect(formatAxisTick(999_400, 'en')).toBe('999.4k'); // still under the cusp
  });
});

describe('formatMoneyCompact (summary cards at ≥ 1e9)', () => {
  it('places the symbol by currency convention', () => {
    expect(formatMoneyCompact(10_000_000_000, 'sek', 'sv')).toBe('10md kr');
    expect(formatMoneyCompact(10_000_000_000, 'usd', 'en')).toBe('$10B');
    expect(formatMoneyCompact(2_500_000_000, 'eur', 'es')).toBe('2,5mil M €');
    expect(formatMoneyCompact(1_500_000_000, 'gbp', 'en')).toBe('£1.5B');
  });
});
