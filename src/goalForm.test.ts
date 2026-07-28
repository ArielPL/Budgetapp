import { describe, it, expect } from 'vitest';
import { validateNewGoal, parseAmount } from './goalForm';

describe('validateNewGoal (fix plan 2026-07-12 §9)', () => {
  it('accepts a valid name + positive target', () => {
    expect(validateNewGoal('Semester', '15000')).toEqual({ ok: true, name: 'Semester', target: 15000, saved: 0 });
  });

  it('trims the name and accepts comma decimals', () => {
    expect(validateNewGoal('  Bil  ', '1500,50')).toEqual({ ok: true, name: 'Bil', target: 1500.5, saved: 0 });
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

// Main review 2026-07-26 §5: the goal form accepted 1e309 as Infinity, stored
// it as null, and the goal came back at 0 kr after a reload.
describe('validateNewGoal — amounts that used to vanish on reload', () => {
  it('rejects 1e309 as a target instead of storing Infinity', () => {
    expect(validateNewGoal('Mål', '1e309')).toEqual({ ok: false, error: 'target' });
  });

  it('rejects a few hundred digits as a target', () => {
    expect(validateNewGoal('Mål', '9'.repeat(400))).toEqual({ ok: false, error: 'target' });
  });

  it('rejects a target above the money ceiling rather than clamping it', () => {
    expect(validateNewGoal('Mål', '9999999999999')).toEqual({ ok: false, error: 'target' });
  });

  it('validates "saved so far" too, and treats blank as 0', () => {
    expect(validateNewGoal('Mål', '1000', '')).toMatchObject({ ok: true, saved: 0 });
    expect(validateNewGoal('Mål', '1000', '250,50')).toMatchObject({ ok: true, saved: 250.5 });
    expect(validateNewGoal('Mål', '1000', '1e309')).toEqual({ ok: false, error: 'saved' });
    expect(validateNewGoal('Mål', '1000', 'abc')).toEqual({ ok: false, error: 'saved' });
  });

  it('accepts the exact ceiling', () => {
    expect(validateNewGoal('Mål', '999999999999')).toMatchObject({ ok: true, target: 999999999999 });
  });
});

describe('parseAmount', () => {
  it('handles comma and period separators and whitespace', () => {
    expect(parseAmount('970,5')).toBe(970.5);
    expect(parseAmount('970.5')).toBe(970.5);
    expect(parseAmount(' 1200 ')).toBe(1200);
  });

  it('returns NaN — never Infinity — for input the app refuses to store', () => {
    // Callers guard with isNaN; Infinity would have slipped past that.
    expect(parseAmount('1e309')).toBeNaN();
    expect(parseAmount('9'.repeat(400))).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
    expect(parseAmount('123abc')).toBeNaN();
  });
});
