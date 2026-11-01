// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';

// ── A new user picks the currency; the app does not guess it ────────────────
//
// Review 2026-10-17, P1: the currency used to follow the phone's language, so
// es-MX opened in euros, fr-CA in euros and zh-CN in dollars — a symbol beside
// every amount that was not the user's money. The language still follows the
// phone; the currency is asked on the first-run step, from symbols that say
// what they stand for, and nothing is stored until it is chosen. Anyone with a
// stored currency (everyone updating) is never asked.

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const currencyBtn = (symbol: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.intro-currency')]
    .find(b => b.querySelector('.intro-currency-symbol')?.textContent === symbol)!;
const next = () => document.querySelector<HTMLButtonElement>('.intro-next')!;

describe('First run: language and currency', () => {
  it('asks for the currency before the cards, and stores nothing until it is chosen', async () => {
    localStorage.setItem('budget_lang', 'es');
    render(<App />);
    const es = translations.es;
    await waitFor(() => expect(document.querySelector('.intro-setup')).not.toBeNull());

    // Nothing chosen for the user, nothing stored, no way past but choosing.
    expect(document.querySelector('.intro-currency.is-on')).toBeNull();
    expect(localStorage.getItem('budget_currency')).toBeNull();
    expect(next().disabled).toBe(true);
    expect(document.querySelector('.intro-skip')).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(document.querySelector('.intro-setup')).not.toBeNull();

    // Each symbol says what it stands for: "$" is the peso's too.
    expect(currencyBtn('$').textContent).toContain(`(${es.currencyNames.usd})`);
    expect(es.currencyNames.usd).toContain('peso');

    fireEvent.click(currencyBtn('$'));
    await waitFor(() => expect(localStorage.getItem('budget_currency')).toBe('usd'));
    expect(currencyBtn('$').getAttribute('aria-pressed')).toBe('true');
    expect(next().disabled).toBe(false);

    fireEvent.click(next());
    // On to the three cards, which can be skipped as before.
    expect(document.querySelector('.intro-setup')).toBeNull();
    expect(document.querySelector('.intro-skip')?.textContent).toBe(es.introSkip);
  });

  it('changing the language on the same step leaves the currency alone', async () => {
    localStorage.setItem('budget_lang', 'en');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.intro-setup')).not.toBeNull());
    fireEvent.click(currencyBtn('¥'));
    fireEvent.change(document.getElementById('intro-lang')!, { target: { value: 'zh' } });
    await waitFor(() => expect(document.querySelector('.intro-title')?.textContent).toBe(translations.zh.introSetupTitle));
    expect(localStorage.getItem('budget_currency')).toBe('jpy');
    expect(currencyBtn('¥').textContent).toContain(translations.zh.currencyNames.jpy);
  });

  it('never asks someone who already has a currency', async () => {
    // A first run that was closed after choosing, or anyone updating.
    localStorage.setItem('budget_currency', 'gbp');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.intro-modal')).not.toBeNull());
    expect(document.querySelector('.intro-setup')).toBeNull();
    expect(localStorage.getItem('budget_currency')).toBe('gbp');
  });

  it('never asks a returning user, and keeps what they have', async () => {
    localStorage.setItem('budget_welcome_seen', '1');
    localStorage.setItem('budget_currency', 'eur');
    render(<App />);
    await waitFor(() => expect(document.querySelector('.app-header, header')).not.toBeNull());
    expect(document.querySelector('.intro-modal')).toBeNull();
    expect(localStorage.getItem('budget_currency')).toBe('eur');
  });
});
