import { describe, it, expect } from 'vitest';
import { formatAxisTick } from './i18n';

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
});
