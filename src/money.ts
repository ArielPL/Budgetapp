// ── money — the one place a typed amount becomes a number ──────────────────
//
// Every amount field used to do its own `parseFloat(...)` + `isNaN(...)` check.
// That let `Infinity` straight through, because **`isNaN(Infinity)` is false**:
//
//     parseFloat('1e309')            → Infinity
//     Math.max(0, Infinity)          → Infinity      (the old "clamp")
//     JSON.stringify({ amount: Inf }) → {"amount":null}
//
// So the app showed "infinity kr", wrote `null` to localStorage, and on the next
// load the amount was silently 0 — the user's number gone with no warning
// (main review 2026-07-26 §5). A 400-digit number did the same thing.
//
// The rules here are deliberately strict about what a *typed* amount may look
// like, and deliberately forgiving about what is *already stored* — see
// coerceStoredMoney. Sparplan already had this shape (validateSavingsPlan);
// this generalises it to every money field, and shares its upper bound.

/** Same generous ceiling as the savings plan — big enough for any real budget,
 *  small enough to stay far inside JavaScript's exact-integer range. */
export const MONEY_LIMITS = {
  min: 0,
  max: 999_999_999_999,
} as const;

export type MoneyParseFailure = 'empty' | 'format' | 'range' | 'non-finite';

export type MoneyParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: MoneyParseFailure };

/** Digits, with an optional single decimal part. No sign, no exponent, no
 *  letters — a plain decimal field should not silently accept `1e309`, and
 *  `parseFloat` must never be left to decide on its own that "123abc" is 123. */
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Any whitespace, including the non-breaking (U+00A0) and narrow non-breaking
 *  (U+202F) spaces the app's own formatter emits as thousands separators — JS
 *  `\s` covers both. Stripping them lets a user paste the number out of
 *  "1 000 kr" straight back in; `parseFloat('1 000')` would return 1. */
const THOUSANDS_SPACES = /\s/g;

/**
 * Parse what a user typed into a money value. Rejects rather than repairs:
 * clamping a bad input to the limit would silently store a number the user
 * never meant. Callers decide what to do with each failure — most keep the
 * previous value and show a message.
 *
 * Accepts both decimal separators ("970.5" and "970,5") since the app is used
 * in Swedish, English and Spanish.
 */
export function parseMoneyInput(raw: string): MoneyParseResult {
  const cleaned = raw.replace(THOUSANDS_SPACES, '').replace(',', '.');
  if (cleaned === '') return { ok: false, reason: 'empty' };
  if (!PLAIN_DECIMAL.test(cleaned)) return { ok: false, reason: 'format' };

  const value = Number(cleaned);
  // A few hundred digits parse to Infinity even though they matched the shape.
  if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite' };
  if (value < MONEY_LIMITS.min || value > MONEY_LIMITS.max) {
    return { ok: false, reason: 'range' };
  }
  return { ok: true, value };
}

/** Is this a number the app is willing to store and do arithmetic with? */
export function isValidMoney(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MONEY_LIMITS.min
    && value <= MONEY_LIMITS.max;
}

/**
 * Read an amount that is ALREADY in storage. Forgiving on purpose: the point is
 * that a device holding data written by an older, buggier build still opens.
 *
 * Documented back-compat rule: anything that is not a usable number — including
 * the `null` that `JSON.stringify` produced from an `Infinity`/`NaN`, a string,
 * or a missing field — reads as 0. That is what the app effectively displayed
 * for those entries anyway, and reading is NOT a licence to rewrite: storage is
 * only ever changed by an edit the user actually makes.
 */
export function coerceStoredMoney(value: unknown): number {
  return isValidMoney(value) ? value : 0;
}

/** Parse for the "empty means zero" fields (every amount input in the app):
 *  a blank field is a deliberate 0, anything else invalid is rejected. */
export function parseMoneyOrZero(raw: string): MoneyParseResult {
  const result = parseMoneyInput(raw);
  return result.ok || result.reason !== 'empty' ? result : { ok: true, value: 0 };
}
