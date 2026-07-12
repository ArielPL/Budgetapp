import { describe, it, expect } from 'vitest';
import { validateNewGoal, parseAmount } from './goalForm';

describe('validateNewGoal (fix plan 2026-07-12 §9)', () => {
  it('accepts a valid name + positive target', () => {
    expect(validateNewGoal('Semester', '15000')).toEqual({ ok: true, name: 'Semester', target: 15000 });
  });

  it('trims the name and accepts comma decimals', () => {
    expect(validateNewGoal('  Bil  ', '1500,50')).toEqual({ ok: true, name: 'Bil', target: 1500.5 });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(validateNewGoal('', '1000')).toEqual({ ok: false, error: 'name' });
    expect(validateNewGoal('   ', '1000')).toEqual({ ok: false, error: 'name' });
  });

  it('rejects a zero target', () => {
    expect(validateNewGoal('Mål', '0')).toEqual({ ok: false, error: 'target' });
  });

  it('rejects a negative target', () => {
    expect(validateNewGoal('Mål', '-500')).toEqual({ ok: false, error: 'target' });
  });

  it('rejects an empty or non-numeric target', () => {
    expect(validateNewGoal('Mål', '')).toEqual({ ok: false, error: 'target' });
    expect(validateNewGoal('Mål', 'abc')).toEqual({ ok: false, error: 'target' });
  });
});

describe('parseAmount', () => {
  it('handles comma and period separators and whitespace', () => {
    expect(parseAmount('970,5')).toBe(970.5);
    expect(parseAmount('970.5')).toBe(970.5);
    expect(parseAmount(' 1200 ')).toBe(1200);
  });
});
