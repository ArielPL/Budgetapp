// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';

// ── What a new user meets first (deep review 2026-09-27, P2 and P3) ─────────
//
// · Plan opened with made-up figures — "143 197 kr in 5 years" — that read
//   like a forecast built from the user's budget. They are now marked as an
//   example until a number is changed.
// · Follow-up opened with "1 month in the span has no budget and does not
//   count", as if the user had already done something wrong. A new start gets
//   a first step instead; the note stays for when there is data to set it by.

const sv = translations.sv;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15));
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

const tab = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent?.includes(label))!;

describe('Plan on a new device', () => {
  it('marks its figures as an example until one is changed', async () => {
    render(<App />);
    fireEvent.click(tab(sv.tabPlan));
    await waitFor(() => expect(document.querySelector('.sparplan-card')).not.toBeNull());
    expect(document.body.textContent).toContain(sv.sparplanExampleNote);
    expect(document.querySelector('.sparplan-example-tag')?.textContent).toBe(sv.sparplanExampleTag);

    fireEvent.change(document.getElementById('sp-monthly')!, { target: { value: '1500' } });
    await waitFor(() => expect(document.querySelector('.sparplan-example-tag')).toBeNull());
    expect(document.body.textContent).not.toContain(sv.sparplanExampleNote);
  });
});

describe('Follow-up on a new device', () => {
  it('offers a first step instead of a warning', async () => {
    render(<App />);
    fireEvent.click(tab(sv.tabFollowUp));
    await waitFor(() => expect(document.querySelector('.followup-empty')).not.toBeNull());
    expect(document.body.textContent).toContain(sv.followUpStartBody);
    expect(document.body.textContent).not.toContain('har ingen budget och räknas inte');

    fireEvent.click(tab(sv.followUpStartBudget));
    await waitFor(() => expect(document.querySelector('.followup-empty')).toBeNull());
  });

  it('drops the first step once there is a budget', async () => {
    localStorage.setItem('budget_2026_8', JSON.stringify({
      income: [{ id: 'lon', label: 'Lön', amount: 30000, userNamed: true }],
      expenses: [], savings: [],
    }));
    render(<App />);
    fireEvent.click(tab(sv.tabFollowUp));
    await waitFor(() => expect(document.querySelector('.followup-empty')).not.toBeNull());
    expect(document.body.textContent).not.toContain(sv.followUpStartBody);
  });
});
