import { describe, it, expect } from 'vitest';
import { bgStyle } from './components/CustomV3';

// WCAG contrast ratio between two #rrggbb colours.
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const ink = (bg: string) => (bgStyle(bg) as Record<string, string>)['--cv3-ink'];

describe('Custom block ink on a picked colour', () => {
  it('gives mid-tones the darker ink, so the text stays readable', () => {
    for (const bg of ['#f59e0b', '#ef4444', '#22c55e', '#06b6d4']) {
      expect(ratio(ink(bg), bg), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps white ink on dark colours and dark ink on pale ones', () => {
    expect(ink('#1e1b4b')).toBe('#ffffff');
    expect(ink('#4c1d95')).toBe('#ffffff');
    expect(ink('#fef3c7')).toBe('#1a1a22');
  });

  it('always picks the ink with the higher contrast', () => {
    for (const bg of ['#8b5cf6', '#ec4899', '#64748b', '#0ea5e9', '#a3a3a3', '#3b82f6']) {
      const other = ink(bg) === '#ffffff' ? '#1a1a22' : '#ffffff';
      expect(ratio(ink(bg), bg), bg).toBeGreaterThanOrEqual(ratio(other, bg));
    }
  });
});
