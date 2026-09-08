import { describe, it, expect } from 'vitest';
import { isLang, isCurrency, MONTHS, CURRENCIES } from './i18n';

// ── Review 2026-09-05, F3 ──────────────────────────────────────────────────
//
// `localStorage.getItem('budget_lang') as Lang` is a compile-time claim, not a
// runtime check. A stored "xx" satisfied it, `translations["xx"]` came back
// undefined, and the app rendered NOTHING — #root empty, no menu, so the user
// could not reach the setting that would undo it. Currency had the identical
// hole. These guards are the runtime half the cast never provided.

describe('isLang', () => {
  it('accepts exactly the languages the app ships', () => {
    expect(Object.keys(MONTHS).every(isLang)).toBe(true);
  });

  it('rejects anything else, including the shapes that caused the lockout', () => {
    for (const bad of ['xx', '', 'SV', 'sv-SE', 'svenska', null, undefined, 3, {}, []]) {
      expect(isLang(bad)).toBe(false);
    }
  });

  it('does not mistake inherited object properties for languages', () => {
    // A plain `v in MONTHS` or `MONTHS[v]` truthiness test would say yes here,
    // and "constructor" would then be looked up as a translation table.
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(isLang(bad)).toBe(false);
    }
  });
});

describe('isCurrency', () => {
  it('accepts exactly the currencies the app ships', () => {
    expect(Object.keys(CURRENCIES).every(isCurrency)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['xx', '', 'SEK', 'kr', 'sek ', null, undefined, 0, {}]) {
      expect(isCurrency(bad)).toBe(false);
    }
  });

  it('does not mistake inherited object properties for currencies', () => {
    for (const bad of ['constructor', '__proto__', 'toString']) {
      expect(isCurrency(bad)).toBe(false);
    }
  });
});
