import { describe, it, expect } from 'vitest';
import { pickLang, pickCurrency } from './i18n';

describe('pickLang — what a brand-new install opens in', () => {
  it('takes the first tag it can read', () => {
    expect(pickLang(['sv-SE'])).toBe('sv');
    expect(pickLang(['en-US'])).toBe('en');
    expect(pickLang(['es-ES'])).toBe('es');
  });

  it('ignores the region', () => {
    expect(pickLang(['en-GB'])).toBe('en');
    expect(pickLang(['es-MX'])).toBe('es');
    expect(pickLang(['SV-FI'])).toBe('sv');
  });

  it('walks the list until it finds one it has', () => {
    // A phone set to German with Swedish second should get Swedish, not the
    // fallback — the owner told it they read Swedish.
    expect(pickLang(['de-DE', 'sv-SE', 'en-US'])).toBe('sv');
    expect(pickLang(['fi-FI', 'en-GB'])).toBe('en');
  });

  it('falls back to English, not Swedish', () => {
    // The whole point. A device that says nothing useful is far more likely to
    // belong to someone who reads English than someone who reads Swedish.
    expect(pickLang(['de-DE'])).toBe('en');
    expect(pickLang([])).toBe('en');
    expect(pickLang(['xx'])).toBe('en');
  });
});

describe('pickCurrency — the same signal, for the symbol only', () => {
  it('follows the country where the language names one', () => {
    expect(pickCurrency(['sv-SE'])).toBe('sek');
    expect(pickCurrency(['es-ES'])).toBe('eur');
    expect(pickCurrency(['en-US'])).toBe('usd');
    expect(pickCurrency(['en-GB'])).toBe('gbp');
  });

  it('takes plain English as American', () => {
    expect(pickCurrency(['en'])).toBe('usd');
  });

  it('guesses the euro for another European locale', () => {
    expect(pickCurrency(['de-DE'])).toBe('eur');
    expect(pickCurrency(['fr-FR'])).toBe('eur');
    expect(pickCurrency(['pt-PT'])).toBe('eur');
  });

  it('matches the language fallback when it has nothing to go on', () => {
    // English text beside "kr" was the pair worth avoiding. Silence gets
    // English, so silence gets dollars.
    expect(pickCurrency([])).toBe('usd');
    expect(pickCurrency(['xx'])).toBe('usd');
    expect(pickLang([])).toBe('en');
  });

  it('gets Finland-Swedish right by accident, and correctly', () => {
    // A Finnish phone with Swedish second: Swedish text, euros. Which is
    // exactly what a Finland-Swede should see.
    expect(pickLang(['fi-FI', 'sv-SE'])).toBe('sv');
    expect(pickCurrency(['fi-FI', 'sv-SE'])).toBe('eur');
  });
});
