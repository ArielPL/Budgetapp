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

/** Digits, with an optional single decimal part, once the number is in
 *  canonical form. No sign, no exponent, no letters: a money field should not
 *  silently accept `1e309`, and `parseFloat` must never be left to decide on
 *  its own that "123abc" is 123. */
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Any whitespace, including the non-breaking (U+00A0) and narrow non-breaking
 *  (U+202F) spaces the app's own formatter emits as thousands separators. */
const WHITESPACE = /\s+/g;

/** Currency written around a number: the app's nine symbols, their names and
 *  their codes. Only at the very start or end, so "12kr3" is still refused. */
const CURRENCY = String.raw`(?:R\$|kronor|kronur|kroner|kr\.?|euros?|eur|sek|nok|dkk|usd|gbp|jpy|rub|brl|inr|try|[€$£¥₽₹₺])`;
const CURRENCY_BEFORE = new RegExp(`^${CURRENCY}\\s*`, 'i');
const CURRENCY_AFTER = new RegExp(`\\s*${CURRENCY}$`, 'i');

/** Groups of exactly three digits after a first group of one to three, as in
 *  1.000.000 or 1,500 — the only shape a thousands separator can take. */
const isGrouping = (parts: string[]) =>
  /^[1-9]\d{0,2}$/.test(parts[0]) && parts.slice(1).every(g => /^\d{3}$/.test(g));

/**
 * The digits, separators and spaces of a number, in canonical form: digits
 * with at most one "." before the decimals. Null when the separators cannot be
 * read one way only — "1.50.000", "1,5,0" — because then any answer is a guess.
 *
 * The rules, so "1.500" never becomes 1,50 (Ariel, 2026-10-25):
 * - Spaces only ever group thousands: "1 500", "1 500,50".
 * - Both "." and ",": the last one is the decimal point, the other groups
 *   thousands. "1.500,50" and "1,500.50" are both 1500.5.
 * - One kind, several times: thousands. "1.000.000".
 * - One kind, once, followed by exactly three digits after a group of one to
 *   three that does not start with 0: thousands. "1.500" and "1,500" are 1500.
 *   Anything else is the decimal point: "1,5", "1.50", "0,500", "1234,567".
 */
function canonical(body: string): string | null {
  let s = body;
  if (/\s/.test(s)) {
    const parts = s.split(WHITESPACE);
    const last = parts[parts.length - 1];
    const lastGroup = last.match(/^(\d{3})([.,]\d+)?$/);
    if (!lastGroup || !isGrouping([...parts.slice(0, -1), lastGroup[1]])) return null;
    s = parts.join('');
  }
  if (!/^\d[\d.,]*$/.test(s) || !/\d$/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots === 0 && commas === 0) return s;

  if (dots > 0 && commas > 0) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    const at = s.lastIndexOf(decimal);
    const whole = s.slice(0, at);
    const fraction = s.slice(at + 1);
    if (whole.includes(decimal) || !isGrouping(whole.split(group))) return null;
    return `${whole.split(group).join('')}.${fraction}`;
  }

  const sep = dots > 0 ? '.' : ',';
  const parts = s.split(sep);
  if (parts.length > 2) return isGrouping(parts) ? parts.join('') : null;
  if (isGrouping(parts)) return parts.join('');
  return `${parts[0]}.${parts[1]}`;
}

/**
 * Parse what a user typed into a money value. Forgiving about how a number is
 * written, strict about what it is: thousands and decimals in any of the
 * usual national styles, currency around it, "k" for thousands. But it rejects
 * rather than repairs anything it cannot read one way only. Clamping a bad
 * input to the limit, or picking one reading of an ambiguous one, would
 * silently store a number the user never meant. Callers decide what to do with
 * each failure; most keep the previous value and show a message.
 */
export function parseMoneyInput(raw: string): MoneyParseResult {
  let s = raw.trim();
  if (s === '') return { ok: false, reason: 'empty' };
  s = s.replace(CURRENCY_BEFORE, '').replace(CURRENCY_AFTER, '').trim();
  let factor = 1;
  const thousands = s.match(/^(.*\d)\s*k$/i);
  if (thousands) { s = thousands[1]; factor = 1000; }

  const cleaned = canonical(s);
  if (cleaned === null || !PLAIN_DECIMAL.test(cleaned)) return { ok: false, reason: 'format' };

  // "1,23k" is 1230, not 1230.0000000000002: a multiplied amount is rounded to
  // the cent, which is all an amount in this app ever holds.
  const parsed = Number(cleaned);
  const value = factor === 1 ? parsed : Math.round(parsed * factor * 100) / 100;
  // A few hundred digits parse to Infinity even though they matched the shape.
  if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite' };
  if (value < MONEY_LIMITS.min || value > MONEY_LIMITS.max) {
    return { ok: false, reason: 'range' };
  }
  return { ok: true, value };
}

/**
 * Parse a typed percentage: an interest rate or an expected return. No
 * thousands rule here. A rate of "2,356 %" is two point something, and reading
 * it as 2 356 % would be the very mistake parseMoneyInput exists to prevent. One
 * "." or "," is the decimal point, and a "%" around it is dropped.
 */
export function parsePercentInput(raw: string): MoneyParseResult {
  const cleaned = raw.trim().replace(/^%\s*|\s*%$/g, '').replace(',', '.');
  if (cleaned === '') return { ok: false, reason: 'empty' };
  if (!PLAIN_DECIMAL.test(cleaned)) return { ok: false, reason: 'format' };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite' };
  if (value < MONEY_LIMITS.min || value > MONEY_LIMITS.max) return { ok: false, reason: 'range' };
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

/**
 * A total of amounts, to the cent.
 *
 * Decimals do not add up exactly in binary: 20.10 + 40.20 is
 * 60.300000000000004. Subtracted from a 60.30 income that leaves −0.000000000000007,
 * which is below zero — so a month spent to the cent showed "Remaining −0 €"
 * in deficit red, and a wallet spent to the cent said "0 € over budget" (full
 * sweep 2026-10-08). Totals are rounded where they are made, so two totals of
 * the same cents are the same number and their difference is exactly 0.
 * Never returns −0, which Intl prints with a minus sign.
 */
export function toCents(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}
