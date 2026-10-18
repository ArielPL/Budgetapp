// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations, type Lang } from './i18n';
import { svGuide } from './guide/sv';
import { GUIDES } from './guide';
import { GUIDE_ROW_HIDDEN_KEY } from './guide/key';

// ── "Get started": the guide to every part of the app ──────────────────────
//
// Opened from a row at the top of Budget, which can be hidden, and from the
// first item in the menu, which cannot — hiding the row must never hide the
// guide itself.

const sv = translations.sv;

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
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const sectionTitles = () => [...document.querySelectorAll('.guide-summary-title')].map(e => e.textContent);

describe('Get started guide', () => {
  it('opens from the row at the top of Budget, with every part of the app', async () => {
    render(<App />);
    fireEvent.click(document.querySelector('.guide-row-open')!);
    await waitFor(() => expect(document.querySelector('.guide-modal')).not.toBeNull());
    expect(sectionTitles()).toEqual(svGuide.sections.map(s => s.title));
    // The first part is open: it is where a new user starts.
    expect(document.querySelectorAll('.guide-section[open]')).toHaveLength(1);

    fireEvent.click(document.querySelector('.guide-modal .welcome-start-btn')!);
    expect(document.querySelector('.guide-modal')).toBeNull();
  });

  it('hiding the row is remembered, and the guide stays in the menu', async () => {
    const { unmount } = render(<App />);
    fireEvent.click(document.querySelector('.guide-row-hide')!);
    expect(document.querySelector('.guide-row')).toBeNull();
    expect(localStorage.getItem(GUIDE_ROW_HIDDEN_KEY)).toBe('1');
    unmount();

    render(<App />);
    expect(document.querySelector('.guide-row')).toBeNull();
    fireEvent.click(document.querySelector('.menu-btn')!);
    const item = document.querySelector('.utils-guide-btn')!;
    expect(item.textContent).toContain(sv.guideEntry);
    fireEvent.click(item);
    await waitFor(() => expect(document.querySelector('.guide-modal')).not.toBeNull());
    expect(document.querySelector('.utils-menu')).toBeNull();
  });

  it('every section has a title and something to read', () => {
    for (const s of svGuide.sections) {
      expect(s.title.trim()).not.toBe('');
      expect(s.body.filter(l => !l.startsWith('## ')).length).toBeGreaterThan(0);
    }
  });
});

describe('Get started guide in every language', () => {
  // The first version showed Swedish whatever the language (Ariel, 2026-10-17).
  const kind = (line: string) =>
    line.startsWith('## ') ? 'heading' : /^\d+\.\s/.test(line) ? 'step' : line.startsWith('💡 ') ? 'tip' : 'text';
  const langs = Object.keys(GUIDES) as Lang[];

  it('has all seven languages', () => {
    expect(langs.sort()).toEqual(Object.keys(translations).sort());
  });

  it('every language has the same parts, headings, steps and tips as Swedish', () => {
    for (const lang of langs) {
      const g = GUIDES[lang];
      expect(g.sections.map(s => s.emoji), lang).toEqual(svGuide.sections.map(s => s.emoji));
      g.sections.forEach((s, i) => {
        expect(s.body.map(kind), `${lang} · ${s.title}`).toEqual(svGuide.sections[i].body.map(kind));
      });
    }
  });

  it('no language carries a Swedish sentence', () => {
    // Headings may match: "Sparplan" and "Budget" are the German words too.
    const swedish = new Set(svGuide.sections.flatMap(s => s.body).filter(l => !l.startsWith('## ')));
    for (const lang of langs.filter(l => l !== 'sv')) {
      const g = GUIDES[lang];
      expect(swedish.has(g.title), lang).toBe(false);
      for (const s of g.sections) for (const line of s.body) expect(swedish.has(line), `${lang}: ${line}`).toBe(false);
    }
  });

  it('opens in the language the app is set to', async () => {
    for (const lang of ['en', 'ja', 'zh'] as Lang[]) {
      localStorage.setItem('budget_lang', lang);
      const { unmount } = render(<App />);
      expect(document.querySelector('.guide-row-text')?.textContent).toBe(translations[lang].guideEntry);
      fireEvent.click(document.querySelector('.guide-row-open')!);
      await waitFor(() => expect(document.getElementById('guide-title')?.textContent).toBe(GUIDES[lang].title));
      expect(sectionTitles()).toEqual(GUIDES[lang].sections.map(s => s.title));
      unmount();
    }
  });
});
