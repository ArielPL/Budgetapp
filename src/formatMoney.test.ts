import { describe, it, expect } from 'vitest';
import { formatMoney } from './i18n';

// Intl uses non-breaking spaces for grouping — normalize for readable asserts.
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

describe('formatMoney decimal rule (fix plan 2026-07-12 §8)', () => {
  it('whole amounts show no decimals', () => {
    expect(norm(formatMoney(1200, 'sek'))).toBe('1 200 kr');
    expect(norm(formatMoney(0, 'sek'))).toBe('0 kr');
  });

  it('one entered decimal still renders as exactly two', () => {
    expect(norm(formatMoney(1200.5, 'sek'))).toBe('1 200,50 kr');
  });

  it('two decimals render as-is', () => {
    expect(norm(formatMoney(1200.55, 'sek'))).toBe('1 200,55 kr');
  });

  it('negative amounts keep the rule', () => {
    expect(norm(formatMoney(-1200.5, 'sek'))).toBe('−1 200,50 kr');
    expect(norm(formatMoney(-1200, 'sek'))).toBe('−1 200 kr');
  });

  it('other currencies use their locale separators and symbols', () => {
    expect(norm(formatMoney(1200.5, 'usd'))).toBe('$1,200.50');
    expect(norm(formatMoney(1200, 'usd'))).toBe('$1,200');
    expect(norm(formatMoney(1200.5, 'eur'))).toBe('1.200,50 €');
    expect(norm(formatMoney(1200.5, 'gbp'))).toBe('£1,200.50');
  });

  it('clamps float drift instead of showing artifacts', () => {
    expect(norm(formatMoney(0.1 + 0.2, 'sek'))).toBe('0,30 kr');
    // Drift that rounds back to a whole number renders as whole.
    expect(norm(formatMoney(2.9999999999, 'sek'))).toBe('3 kr');
  });
});
