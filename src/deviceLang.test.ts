import { describe, it, expect } from 'vitest';
import { pickLang } from './i18n';

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
    // A phone set to Polish with Swedish second should get Swedish, not the
    // fallback — the owner told it they read Swedish.
    expect(pickLang(['pl-PL', 'sv-SE', 'en-US'])).toBe('sv');
    // German, French, Japanese and Chinese are languages of their own now.
    expect(pickLang(['de-DE', 'sv-SE'])).toBe('de');
    expect(pickLang(['zh-Hans-CN'])).toBe('zh');
    expect(pickLang(['ja-JP'])).toBe('ja');
    expect(pickLang(['fr-CA'])).toBe('fr');
    expect(pickLang(['fi-FI', 'en-GB'])).toBe('en');
  });

  it('opens in Italian, Portuguese, Russian and Turkish', () => {
    expect(pickLang(['it-IT'])).toBe('it');
    expect(pickLang(['tr-TR'])).toBe('tr');
    expect(pickLang(['ru-RU'])).toBe('ru');
    // The app's Portuguese is Brazilian; a phone in Portugal gets it too —
    // closer to home than English.
    expect(pickLang(['pt-BR'])).toBe('pt');
    expect(pickLang(['pt-PT'])).toBe('pt');
  });

  it('falls back to English, not Swedish', () => {
    // The whole point. A device that says nothing useful is far more likely to
    // belong to someone who reads English than someone who reads Swedish.
    expect(pickLang(['pl-PL'])).toBe('en');
    expect(pickLang([])).toBe('en');
    expect(pickLang(['xx'])).toBe('en');
  });
});

describe('pickLang — a Finnish phone with Swedish second', () => {
  it('opens in Swedish', () => {
    // The currency is no longer guessed from this (review 2026-10-17, P1);
    // the first-run step asks for it — see currencyChoice.test.tsx.
    expect(pickLang(['fi-FI', 'sv-SE'])).toBe('sv');
  });
});
