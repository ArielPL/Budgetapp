import { describe, it, expect } from 'vitest';
import {
  parseMoneyInput, parseMoneyOrZero, parsePercentInput, isValidMoney, coerceStoredMoney, MONEY_LIMITS,
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

// ── Every way people write a number (Ariel, 2026-10-25) ────────────────────
//
// "1.500" used to become 1,50 without a word: the first comma or dot was taken
// for the decimal point, whatever followed it. A rent of 1.500 € was stored as
// 1,50 €. Nobody should have to think about the "right" way to write an amount.

describe('parseMoneyInput — thousands written with a dot or a comma', () => {
  it('reads a dot or comma before exactly three digits as thousands', () => {
    expect(parse('1.500')).toBe(1500);   // Spanish, Italian, German, Brazilian
    expect(parse('1,500')).toBe(1500);   // English
    expect(parse('12.345')).toBe(12345);
    expect(parse('999,999')).toBe(999999);
  });

  it('still reads one or two digits after the separator as decimals', () => {
    expect(parse('1.5')).toBe(1.5);
    expect(parse('1,5')).toBe(1.5);
    expect(parse('1,50')).toBe(1.5);
    expect(parse('1.05')).toBe(1.05);
  });

  it('never reads a group that starts with 0 as thousands', () => {
    // "0,500" has no thousands in it: it is half of one.
    expect(parse('0,500')).toBe(0.5);
    expect(parse('0.500')).toBe(0.5);
  });

  it('reads a longer whole part as decimals, since thousands come in threes', () => {
    expect(parse('1234,567')).toBe(1234.567);
    expect(parse('1234.5')).toBe(1234.5);
  });

  it('with both a dot and a comma, the last one is the decimal point', () => {
    expect(parse('1.500,50')).toBe(1500.5);
    expect(parse('1,500.50')).toBe(1500.5);
    expect(parse('1.234.567,89')).toBe(1234567.89);
    expect(parse('1,234,567.89')).toBe(1234567.89);
  });

  it('reads the same separator repeated as thousands', () => {
    expect(parse('1.000.000')).toBe(1000000);
    expect(parse('1,000,000')).toBe(1000000);
  });

  it('keeps reading spaces as thousands, decimals included', () => {
    expect(parse('1 500,50')).toBe(1500.5);
    expect(parse('1 500.50')).toBe(1500.5);
    expect(parse('1 000 000')).toBe(1000000);
  });

  it('refuses separators that cannot be read one way only, rather than guess', () => {
    expect(parse('1.50.000')).toBe('format');
    expect(parse('1,5,0')).toBe('format');
    expect(parse('1.500.50')).toBe('format');
    expect(parse('1,50.000,5')).toBe('format');
    expect(parse('1.500.000.5')).toBe('format');
    expect(parse('1 2')).toBe('format');         // two numbers, not one
    expect(parse('1 50')).toBe('format');
    expect(parse('.5')).toBe('format');
    expect(parse('5.')).toBe('format');
    expect(parse('1.,5')).toBe('format');
  });
});

describe('parseMoneyInput — currency and "k" around the number', () => {
  it('drops the currency in front of or behind the number', () => {
    expect(parse('500 kr')).toBe(500);
    expect(parse('500kr')).toBe(500);
    expect(parse('500 kronor')).toBe(500);
    expect(parse('1 500 kr')).toBe(1500);
    expect(parse('€1.500,50')).toBe(1500.5);
    expect(parse('1.500,50 €')).toBe(1500.5);
    expect(parse('20 euro')).toBe(20);
    expect(parse('$1,500.50')).toBe(1500.5);
    expect(parse('£12.99')).toBe(12.99);
    expect(parse('¥1,500')).toBe(1500);
    expect(parse('R$ 1.500,00')).toBe(1500);
    expect(parse('₽ 900')).toBe(900);
    expect(parse('₹1,200')).toBe(1200);
    expect(parse('250 ₺')).toBe(250);
    expect(parse('500 SEK')).toBe(500);
  });

  it('reads "k" as thousands', () => {
    expect(parse('5k')).toBe(5000);
    expect(parse('5K')).toBe(5000);
    expect(parse('5 k')).toBe(5000);
    expect(parse('1,5k')).toBe(1500);
    expect(parse('1.5k')).toBe(1500);
    expect(parse('1,23k')).toBe(1230);   // rounded to the cent, not 1230.0000000000002
    expect(parse('5k kr')).toBe(5000);
  });

  it('still refuses letters inside or around the number that are not a currency', () => {
    expect(parse('12kr3')).toBe('format');
    expect(parse('kr')).toBe('format');
    expect(parse('5kk')).toBe('format');
    expect(parse('k5')).toBe('format');
    expect(parse('5 dollars please')).toBe('format');
    expect(parse('1e3 kr')).toBe('format');
  });

  it('keeps the ceiling for amounts written with "k"', () => {
    expect(parse('999999999k')).toBe(999999999000);
    expect(parse('1000000000k')).toBe('range');
  });
});

describe('parsePercentInput (interest rates and expected returns)', () => {
  const pct = (raw: string) => {
    const r = parsePercentInput(raw);
    return r.ok ? r.value : r.reason;
  };

  it('reads three decimals as decimals: a rate is never thousands', () => {
    expect(pct('2,356')).toBe(2.356);
    expect(pct('2.356')).toBe(2.356);
    expect(pct('7')).toBe(7);
    expect(pct('7,5')).toBe(7.5);
  });

  it('drops a percent sign', () => {
    expect(pct('7,5 %')).toBe(7.5);
    expect(pct('7.5%')).toBe(7.5);
  });

  it('refuses what is not one plain number', () => {
    expect(pct('')).toBe('empty');
    expect(pct('5k')).toBe('format');
    expect(pct('1e3')).toBe('format');
    expect(pct('-2')).toBe('format');
    expect(pct('1.000,5')).toBe('format');
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
