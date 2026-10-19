// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations } from './i18n';
import { beginnerMonthData } from './defaults';
import { latestUndo } from './undo';

// ── Beginner's start (Ariel and testers, 2026-10-19) ────────────────────────
//
// After the intro, a new install is asked whether it has made a budget before.
// A beginner answers up to six questions and gets a budget of exactly what was
// answered, for this month and every month left this year.

const sv = translations.sv;

describe('the budget built from the answers', () => {
  it('holds only what was answered, under the standard categories', () => {
    const d = beginnerMonthData({ salary: 32000, housing: 9500, savings: 2000 }, 'sv');
    expect(d.income.map(r => [r.label, r.amount])).toEqual([['Lön', 32000]]);
    expect(d.expenses.map(c => c.id)).toEqual(['boende', 'sparande']);
    expect(d.expenses.flatMap(c => c.rows.map(r => r.amount))).toEqual([9500, 2000]);
  });

  it('is empty when everything was skipped, and names rows in the language', () => {
    expect(beginnerMonthData({}, 'sv')).toEqual({ income: [], expenses: [], savings: [] });
    const en = beginnerMonthData({ phone: 299, commute: 800, loans: 1200 }, 'en');
    expect(en.expenses.flatMap(c => c.rows.map(r => r.label))).toEqual(['Getting to work', 'Phone plan', 'Loans and instalments']);
  });
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
  localStorage.setItem('budget_lang', 'sv');
  localStorage.setItem('budget_currency', 'sek');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const btn = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.beg-modal button')].find(b => b.textContent === text)!;
const type = (v: string) => fireEvent.change(document.querySelector('.beg-input')!, { target: { value: v } });

/** Through the three intro cards to the question. */
const finishIntro = async () => {
  render(<App />);
  fireEvent.click(document.querySelector('.intro-skip')!);
  await waitFor(() => expect(document.querySelector('.beg-modal')).not.toBeNull());
};

describe('the first-run question', () => {
  it('a beginner answers, skips one, and gets the rest of the year', async () => {
    await finishIntro();
    expect(document.getElementById('beg-title')?.textContent).toBe(sv.startChoiceTitle);
    fireEvent.click(document.querySelector('.beg-choice.is-main')!);
    type('32000'); fireEvent.click(btn(sv.begNext));
    type('9500'); fireEvent.click(btn(sv.begNext));
    fireEvent.click(btn(sv.begSkip));
    type('abc'); fireEvent.click(btn(sv.begNext));
    expect(document.querySelector('.beg-error')?.textContent).toBe(sv.invalidAmount);
    type('1030'); fireEvent.click(btn(sv.begNext));
    fireEvent.click(btn(sv.begSkip));
    type('2000'); fireEvent.click(btn(sv.begNext));
    expect(document.querySelector('.beg-left')?.textContent).toMatch(/19\s470/);
    fireEvent.click(btn(sv.begCreate('okt', 'dec')));
    await waitFor(() => expect(document.querySelector('.beg-modal')).toBeNull());
    for (const m of [9, 10, 11]) {
      const d = JSON.parse(localStorage.getItem(`budget_2026_${m}`)!);
      expect(d.income[0].amount).toBe(32000);
      expect(d.expenses.map((c: { id: string }) => c.id)).toEqual(['boende', 'transport', 'sparande']);
    }
    expect(localStorage.getItem('budget_2026_8')).toBeNull();
    expect(latestUndo(localStorage)?.action).toBe('startBudget');
  });

  it('someone experienced gets today\'s start, and nothing is written', async () => {
    await finishIntro();
    fireEvent.click([...document.querySelectorAll('.beg-choice')].find(b => b.textContent?.includes(sv.startExpert))!);
    expect(document.querySelector('.beg-modal')).toBeNull();
    expect(document.querySelector('.onboard-hero')).not.toBeNull();
    expect(localStorage.getItem('budget_2026_9')).toBeNull();
  });

  it('a beginner who answers nothing is offered the template', async () => {
    await finishIntro();
    fireEvent.click(document.querySelector('.beg-choice.is-main')!);
    for (let i = 0; i < 6; i++) fireEvent.click(btn(sv.begSkip));
    expect(document.querySelector('.beg-modal')?.textContent).toContain(sv.begEmpty);
    fireEvent.click(btn(sv.begTemplate));
    expect(document.querySelector('.beg-modal')).toBeNull();
    expect(document.body.textContent).toContain('Kollektivtrafik');
  });

  it('is not asked when the budget already has something in it', async () => {
    localStorage.setItem('budget_2026_9', JSON.stringify({ income: [{ id: 'l', label: 'Lön', amount: 1 }], expenses: [], savings: [] }));
    render(<App />);
    expect(document.querySelector('.intro-modal')).toBeNull();
    expect(document.querySelector('.beg-modal')).toBeNull();
  });
});
