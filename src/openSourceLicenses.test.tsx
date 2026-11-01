// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';

// ── "About the app" carries the open-source licences (2026-10-31) ──────────
//
// A quiet link under the letter turns the dialog to the licence text the
// build writes (src/licenseNotice.ts); the button below takes it back.

const sv = translations.sv;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_guide_row_hidden: '1',
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));

const clickAbout = async () => {
  await waitFor(() => expect(buttonWith(sv.menu)).toBeTruthy());
  fireEvent.click(buttonWith(sv.menu)!);
  await waitFor(() => expect(buttonWith(sv.aboutApp)).toBeTruthy());
  fireEvent.click(buttonWith(sv.aboutApp)!);
};

const openAbout = async () => {
  render(<App />);
  await clickAbout();
  await waitFor(() => expect(buttonWith(sv.licensesOpen)).toBeTruthy());
};

describe('open-source licences in About the app', () => {
  it('shows the licence file, and goes back to the letter', async () => {
    const fetch = vi.fn(async () => new Response('react 19.2.6\nLicense: MIT\n\nCopyright (c) Meta'));
    vi.stubGlobal('fetch', fetch);
    await openAbout();
    fireEvent.click(buttonWith(sv.licensesOpen)!);
    await waitFor(() => expect(document.querySelector('.licenses-text')?.textContent).toContain('Copyright (c) Meta'));
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/assets\/licenses\.txt$/));
    expect(document.body.textContent).toContain(sv.licensesIntro);
    expect(document.body.textContent).not.toContain(sv.welcomeSignature);

    fireEvent.click(buttonWith(sv.licensesBack)!);
    expect(document.body.textContent).toContain(sv.welcomeSignature);
    expect(document.querySelector('.licenses-text')).toBeNull();
  });

  it('says so when the file cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await openAbout();
    fireEvent.click(buttonWith(sv.licensesOpen)!);
    await waitFor(() => expect(document.body.textContent).toContain(sv.licensesFailed));
  });

  it('opens on the letter again next time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('text')));
    await openAbout();
    fireEvent.click(buttonWith(sv.licensesOpen)!);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(buttonWith(sv.licensesBack)).toBeUndefined());
    await clickAbout();
    await waitFor(() => expect(buttonWith(sv.licensesOpen)).toBeTruthy());
    expect(document.querySelector('.licenses-text')).toBeNull();
  });
});

describe('the letter in About the app', () => {
  it('links the support address and ends with the verse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('text')));
    await openAbout();
    const link = document.querySelector<HTMLAnchorElement>('.welcome-letter a[href^="mailto:"]');
    expect(link?.href).toBe('mailto:support@yourofflinebudget.com');
    expect(document.querySelector('.welcome-verse em')?.textContent).toBe(sv.welcomeVerse);
    expect(document.querySelector('.welcome-verse')?.textContent).toContain(sv.welcomeVerseRef);
  });
});
