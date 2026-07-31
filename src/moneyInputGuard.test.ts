import { describe, it, expect } from 'vitest';
import { parseMoneyInput, parseMoneyOrZero } from './money';

// ── The rule this file exists to enforce ──────────────────────────────────
//
// money.ts is the ONLY place allowed to transform the text of an amount.
// Everywhere else, what the user typed reaches the parser exactly as typed.
//
// This is not style. Twice a field has "cleaned up" the input first, which
// turns a rejection into a silent edit — the app storing a number nobody asked
// for:
//
//   1e309 ──.replace(/[^\d.,]/g,'')──▶ "1309" ──parser──▶   ✅ 1 309 kr saved
//   1e309 ──.replace(/[^\d]/g,'')────▶ "1309" ──parseInt──▶ ✅ target 1309
//   999…(400 digits) ────────────────────────── parseInt ──▶ Infinity → null
//
// Each half looks reasonable alone, which is why it survived review AND a full
// suite: the parser was well tested and the sanitiser was old and unremarkable.
// Only their ORDER was wrong, and nothing checked the order. This does.

// Sources read through Vite (`?raw`) rather than node:fs — that keeps the app's
// tsconfig browser-only (`types: ["vite/client"]`), which is a guard of its own.
const MODULES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** Every source file, minus tests and money.ts — the one module allowed to
 *  normalise the text of an amount. */
const FILES = Object.entries(MODULES)
  .filter(([path]) => !/\.test\.tsx?$/.test(path) && !/\/money\.ts$/.test(path))
  .map(([path, source]) => ({ name: path.replace(/^\.\//, ''), source }));

/** Code lines only — a comment describing the bug must not trip the guard. */
function codeLines(src: string): { line: string; n: number }[] {
  return src.split('\n')
    .map((raw, i) => ({ line: raw.trim(), n: i + 1 }))
    .filter(({ line }) => line && !/^(\/\/|\*|\/\*)/.test(line));
}

const scan = (test: (line: string) => boolean) =>
  FILES.flatMap(({ name, source }) =>
    codeLines(source)
      .filter(({ line }) => test(line))
      .map(({ line, n }) => `${name}:${n}  ${line}`));

describe('no amount field may rewrite what the user typed', () => {
  it('is actually reading the source tree', () => {
    const names = FILES.map(f => f.name);
    expect(names.length).toBeGreaterThan(10);
    expect(names).toContain('components/CustomV3.tsx');
    expect(names).toContain('components/EditableAmount.tsx');
  });

  it('never sanitises an input value', () => {
    // `e.target.value.replace(...)` — how both regressions started.
    expect(
      scan(line => /\.value\s*\.replace\s*\(/.test(line)),
      'An input value is rewritten before it is validated. Pass the raw text to '
      + 'parseMoneyInput/parseMoneyOrZero and show the error instead — never '
      + 'repair the number on the user\'s behalf.',
    ).toEqual([]);
  });

  it('never pipes a .replace() straight into the money parser', () => {
    expect(
      scan(line => /\.replace\s*\(/.test(line) && /parseMoney/.test(line)),
      'Text is being transformed on its way into the money parser.',
    ).toEqual([]);
  });

  it('never parses a variable that was built by .replace()', () => {
    // The original shape spanned three lines:
    //   const raw = e.target.value.replace(...)   ← sanitised here
    //   const parsed = parseMoneyOrZero(raw)      ← parsed two lines later
    const offenders = FILES.flatMap(({ name: file, source }) => {
      const lines = codeLines(source);
      const body = lines.map(l => l.line).join('\n');
      return lines.flatMap(({ line, n }) => {
        const assigned = /(?:const|let|var)\s+(\w+)\s*=\s*[^;]*\.replace\s*\(/.exec(line);
        if (!assigned) return [];
        const varName = assigned[1];
        const feedsParser = new RegExp(`parseMoney\\w*\\s*\\(\\s*${varName}\\b`).test(body);
        return feedsParser ? [`${file}:${n}  ${line}`] : [];
      });
    });
    expect(offenders, 'A sanitised variable is later handed to the money parser.')
      .toEqual([]);
  });

  it('never hand-rolls amount parsing with parseInt/parseFloat', () => {
    // How the block-target field produced Infinity. Radix-16 (colour hex) and
    // month indices are not amounts, so they are excluded by what they ARE,
    // not by which file they happen to live in.
    expect(
      scan(line =>
        /\bparse(Int|Float)\s*\(/.test(line)
        && !/,\s*16\s*\)/.test(line)      // hex colour channel
        && !/\bsubstring\b/.test(line)    // hex slicing
        && !/\bMONTHS\b/.test(line)),     // month index from "YYYY-MM"
      'Amounts must go through money.ts, not parseInt/parseFloat.',
    ).toEqual([]);
  });
});

// The inputs that must never survive, wherever they are typed. Check any new
// amount field against this list.
export const POISON_INPUTS = [
  '1e309',          // parses to Infinity
  '1E309',
  '1e3',            // exponent notation in a plain decimal field
  '123abc',         // partially numeric
  'abc',
  '9'.repeat(400),  // long enough to overflow to Infinity
  '9999999999999',  // past MONEY_LIMITS.max
  '-5',
  'Infinity',
  'NaN',
] as const;

describe('the shared parser refuses every one of them', () => {
  it.each(POISON_INPUTS)('rejects %s', input => {
    expect(parseMoneyInput(input).ok).toBe(false);
    expect(parseMoneyOrZero(input).ok).toBe(false);
  });

  it('still accepts the everyday amounts — the guard is not just "reject all"', () => {
    for (const [input, expected] of [
      ['0', 0], ['970', 970], ['970.5', 970.5], ['970,5', 970.5], ['1 000', 1000],
    ] as const) {
      const r = parseMoneyOrZero(input);
      expect(r.ok && r.value).toBe(expected);
    }
  });
});
