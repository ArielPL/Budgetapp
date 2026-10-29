// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';

// ── Review of 2026-10-29: the points that are not about envelopes ──────────
//
// P2-3: the questions are about today's month, and say so on another month's
// screen. P3-2: a message about several things counts them, and a report in
// one language does not stay on screen in another. (Envelope dates and the
// switcher on a phone are in walletsScreen.test.tsx; Custom's "Kvar" in
// customSmallThings.test.tsx; the CSV preview in nativeFlows.test.tsx.)

const sv = translations.sv;

const month = (income: number) => JSON.stringify({
  income: [{ id: 'in', label: 'Lön', amount: income }],
  expenses: [{ id: 'mat', name: 'Mat', icon: '🛒', color: '#f59e0b', rows: [{ id: 'g', label: 'Matvaror', amount: 4000 }] }],
  savings: [],
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_guide_row_hidden: '1', budget_2026_9: month(30000), budget_2026_10: month(30000),
  })) localStorage.setItem(k, v);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(el => el.textContent?.includes(label));

describe('P2-3: the questions say which month they are about', () => {
  it('nothing extra on today’s month; the month named on another', async () => {
    render(<App />);
    fireEvent.click(buttonWith(sv.tabFollowUp)!);
    await waitFor(() => expect(document.querySelector('.q-card')).not.toBeNull());
    expect(document.querySelector('.q-card')?.textContent).not.toContain(sv.qAboutNow('oktober 2026'));
    fireEvent.click(document.querySelector(`[aria-label="${sv.nextMonth}"]`)!);
    await waitFor(() => expect(document.querySelector('.q-card')?.textContent).toContain(sv.qAboutNow('oktober 2026')));
    // In an answer too, above the amount.
    fireEvent.click(buttonWith(sv.qPerDay)!);
    expect(document.querySelector('.q-card')?.textContent).toContain(sv.qAboutNow('oktober 2026'));
  });
});

describe('P3-2: messages count what they are about', () => {
  it('several envelopes, several months', () => {
    expect(sv.undoWhat('createWallet', '', 1)).toBe('Ett kuvert skapades');
    expect(sv.undoWhat('createWallet', '', 6)).toBe('6 kuvert skapades');
    expect(sv.undoWhat('startBudget', '', 3)).toBe('En budget skapades för 3 månader');
    expect(translations.en.undoWhat('createWallet', '', 6)).toBe('6 envelopes were created');
  });

  it('weekly envelopes made together: the step back says how many', async () => {
    render(<App />);
    const tile = await waitFor(() => {
      const el = [...document.querySelectorAll<HTMLButtonElement>('.daily-budget-tile-btn')]
        .find(b => b.textContent?.includes(sv.dailyBudgetPerWeek));
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(tile);
    fireEvent.click(document.querySelector<HTMLButtonElement>('.confirm-change .custom-primary-btn')!);
    // 15 October: weeks 42, 43 and 44 are left.
    await waitFor(() => expect(document.body.textContent).toContain('3 kuvert skapades'));
  });
});
