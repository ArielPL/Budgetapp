import { describe, it, expect } from 'vitest';
import {
  parseMoneyInput, parseMoneyOrZero, isValidMoney, coerceStoredMoney, MONEY_LIMITS,
} from './money';

/** The value of a successful parse, or the failure reason — compact assertions. */
const parse = (raw: string) => {
  const r = parseMoneyInput(raw);
  return r.ok ? r.value : r.reason;
};

describe('parseMoneyInput — ordinary amounts', () => {
  it('reads plain numbers', () => {
    expect(parse('0')).toBe(0);
    expect(parse('970')).toBe(970);
    expect(parse('30000')).toBe(30000);
  });

  it('accepts either decimal separator', () => {
    expect(parse('970.5')).toBe(970.5);
    expect(parse('970,5')).toBe(970.5); // Swedish/Spanish comma
    expect(parse('1200,50')).toBe(1200.5);
  });

  it('tolerates surrounding and grouping spaces', () => {
    // The app prints "1 000 kr"; pasting that number back must not give 1.
    expect(parse('  970  ')).toBe(970);
    expect(parse('1 000')).toBe(1000);
    expect(parse('1 000')).toBe(1000);   // non-breaking space
    expect(parse('1 000')).toBe(1000);   // narrow non-breaking space
  });

  it('accepts the exact limits', () => {
    expect(parse(String(MONEY_LIMITS.min))).toBe(0);
    expect(parse(String(MONEY_LIMITS.max))).toBe(MONEY_LIMITS.max);
  });
});

describe('parseMoneyInput — the silent-data-loss inputs', () => {
  it('rejects 1e309, which parseFloat turns into Infinity', () => {
    // The reported bug: shown as "infinity kr", stored as null, gone after reload.
    expect(parse('1e309')).toBe('format');
  });

  it('rejects exponent notation generally — this is a plain decimal field', () => {
    expect(parse('1e3')).toBe('format');
    expect(parse('1E3')).toBe('format');
    expect(parse('1e-3')).toBe('format');
  });

  it('rejects a few hundred digits (also Infinity once parsed)', () => {
    expect(parse('9'.repeat(400))).toBe('non-finite');
  });

  it('rejects the words Infinity and NaN', () => {
    expect(parse('Infinity')).toBe('format');
    expect(parse('-Infinity')).toBe('format');
    expect(parse('NaN')).toBe('format');
  });

  it('rejects partially numeric strings instead of keeping the prefix', () => {
    // parseFloat('123abc') is 123 — the user would not have meant that.
    expect(parse('123abc')).toBe('format');
    expect(parse('abc')).toBe('format');
    expect(parse('12.5.7')).toBe('format');
    expect(parse('--5')).toBe('format');
  });

  it('rejects negative amounts', () => {
    expect(parse('-1')).toBe('format');   // the sign is not part of the shape
    expect(parse('-0.5')).toBe('format');
  });

  it('rejects anything above the ceiling rather than clamping it', () => {
    // Clamping would store a number the user never typed.
    expect(parse(String(MONEY_LIMITS.max + 1))).toBe('range');
    expect(parse('9999999999999')).toBe('range');
  });

  it('reports an empty or blank field distinctly', () => {
    expect(parse('')).toBe('empty');
    expect(parse('   ')).toBe('empty');
  });
});

describe('parseMoneyOrZero (what the amount inputs use)', () => {
  it('treats a cleared field as a deliberate 0', () => {
    expect(parseMoneyOrZero('')).toEqual({ ok: true, value: 0 });
    expect(parseMoneyOrZero('   ')).toEqual({ ok: true, value: 0 });
  });

  it('still rejects everything else that is invalid', () => {
    expect(parseMoneyOrZero('1e309')).toEqual({ ok: false, reason: 'format' });
    expect(parseMoneyOrZero('9'.repeat(400))).toEqual({ ok: false, reason: 'non-finite' });
  });

  it('passes valid amounts through unchanged', () => {
    expect(parseMoneyOrZero('970,5')).toEqual({ ok: true, value: 970.5 });
  });
});

describe('isValidMoney', () => {
  it('accepts real amounts inside the range', () => {
    expect(isValidMoney(0)).toBe(true);
    expect(isValidMoney(1200.5)).toBe(true);
    expect(isValidMoney(MONEY_LIMITS.max)).toBe(true);
  });

  it('rejects the values that cannot survive a round-trip through JSON', () => {
    expect(isValidMoney(Infinity)).toBe(false);
    expect(isValidMoney(-Infinity)).toBe(false);
    expect(isValidMoney(NaN)).toBe(false);
  });

  it('rejects out-of-range and non-numbers', () => {
    expect(isValidMoney(-1)).toBe(false);
    expect(isValidMoney(MONEY_LIMITS.max + 1)).toBe(false);
    expect(isValidMoney('500')).toBe(false);
    expect(isValidMoney(null)).toBe(false);
    expect(isValidMoney(undefined)).toBe(false);
    expect(isValidMoney({})).toBe(false);
  });
});

describe('coerceStoredMoney (opening data an older build wrote)', () => {
  it('keeps a valid stored amount exactly as it is', () => {
    expect(coerceStoredMoney(1200.5)).toBe(1200.5);
    expect(coerceStoredMoney(0)).toBe(0);
  });

  it('reads the null left behind by a stored Infinity as 0', () => {
    // JSON.stringify wrote null; the app already behaved as 0 for these.
    expect(coerceStoredMoney(null)).toBe(0);
  });

  it('reads any other unusable value as 0 without throwing', () => {
    expect(coerceStoredMoney(undefined)).toBe(0);
    expect(coerceStoredMoney('970')).toBe(0);
    expect(coerceStoredMoney(NaN)).toBe(0);
    expect(coerceStoredMoney(Infinity)).toBe(0);
    expect(coerceStoredMoney(-5)).toBe(0);
    expect(coerceStoredMoney({ amount: 5 })).toBe(0);
  });
});
