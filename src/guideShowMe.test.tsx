// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { translations, type Lang } from './i18n';
import { GUIDES } from './guide';
import { svGuide } from './guide/sv';
import { SECTION_SPOTS, SPOT_TARGETS, spotSelector, type SpotId } from './guide/spots';

// ── "Show me": the guide lights up the real control (2026-10-20) ────────────
//
// The guide does not close for it: on a phone it shrinks to a bar and comes
// back where the reader was. The one thing that must never drift is the link
// between the guide and the app — every spot has to find its control, or the
// button would light up nothing.

const sv = translations.sv;
const ALL = Object.keys(SPOT_TARGETS) as SpotId[];

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
  // jsdom lays nothing out; the spotlight looks for a box before it lights.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const month = JSON.stringify({
  income: [{ id: 'in', label: 'Lön', amount: 30000 }],
  expenses: [{ id: 'transport', name: 'Transport', icon: '🚌', color: '#888', rows: [{ id: 'r1', label: 'Bil', amount: 2000 }] }],
  savings: [{ id: 'sparkonto', name: 'Sparkonto', icon: '🏦', color: '#0a0', rows: [{ id: 's1', label: 'Sparkonto', amount: 5000 }] }],
  savingsSnapshotRecorded: true,
});
const seed = () => {
  for (const [k, v] of Object.entries({
    budget_welcome_seen: '1', budget_lang: 'sv', budget_currency: 'sek', budget_layout: 'classic',
    budget_changelog_seen: '1.13.0', budget_copy_offer_dismissed: '2026',
    budget_2026_8: month, budget_2026_9: month,
    budget_debts: JSON.stringify({
      debts: [{ id: 'd1', name: 'SYNT Lån', kind: 'loan', balance: 10000, balanceDate: '2026-09-01', ratePct: 5, monthlyPayment: 500 }],
      extraPerMonth: 200, strategy: 'avalanche', plainRows: [],
    }),
    budget_actuals_2026_9: JSON.stringify([
      { id: 'a1', date: '2026-10-03', text: 'SYNT Butik', amount: 400, direction: 'out', categoryId: 'transport' },
    ]),
  })) localStorage.setItem(k, v);
};

const openGuide = async () => {
  fireEvent.click(document.querySelector('.guide-row-open')!);
  await waitFor(() => expect(document.querySelector('.guide-modal')).not.toBeNull());
  for (const d of document.querySelectorAll<HTMLDetailsElement>('.guide-section')) d.open = true;
};
const spotButton = (id: SpotId) =>
  [...document.querySelectorAll<HTMLButtonElement>('.guide-spot-btn')]
    .find(b => b.textContent?.includes(svGuide.spots[id].label))!;

describe('every "Show me" finds its control', () => {
  it.each(ALL)('%s', async id => {
    seed();
    render(<App />);
    await openGuide();
    fireEvent.click(spotButton(id));
    // Generous waits: a tab mounts and the spotlight polls for the control, and
    // with the whole suite running at once one second was not always enough.
    await waitFor(() => expect(document.querySelector(spotSelector(id)), id).not.toBeNull());
    if (SPOT_TARGETS[id].menu) expect(document.querySelector('.utils-menu')).not.toBeNull();
    // The bubble says what it is, beside the control — not "not on screen".
    await waitFor(() => expect(document.querySelector('.spot-bubble')?.textContent).toContain(svGuide.spots[id].text));
    expect(document.querySelector('.spot-missing')).toBeNull();
  });

  it('every spot is offered somewhere in the guide, once', () => {
    const offered = Object.values(SECTION_SPOTS).flat();
    expect(new Set(offered)).toEqual(new Set(ALL));
    for (const s of svGuide.sections) {
      if (s.emoji in SECTION_SPOTS) expect(SECTION_SPOTS[s.emoji].length).toBeGreaterThan(0);
    }
  });

  it('every language names every spot', () => {
    for (const [lang, g] of Object.entries(GUIDES) as [Lang, typeof svGuide][]) {
      for (const id of ALL) {
        expect(g.spots[id].label.trim(), `${lang} ${id}`).not.toBe('');
        expect(g.spots[id].text.trim(), `${lang} ${id}`).not.toBe('');
      }
      for (const k of ['showMe', 'backToGuide', 'ok', 'barHint', 'notHere'] as const) expect(g[k].trim(), `${lang} ${k}`).not.toBe('');
    }
  });
});

describe('the guide is not lost while it shows', () => {
  it('shrinks to a bar, and comes back where the reader was', async () => {
    seed();
    render(<App />);
    await openGuide();
    fireEvent.click(spotButton('import'));
    await waitFor(() => expect(document.querySelector('.guide-bar')).not.toBeNull());
    expect(document.querySelector('.guide-modal')!.classList.contains('is-away')).toBe(true);
    expect(document.querySelector('.guide-bar')!.textContent).toContain(svGuide.spots.import.label);
    // The app behind can be used: the follow-up tab is open and live.
    expect(document.getElementById('root')?.inert).not.toBe(true);

    fireEvent.click(document.querySelector('.guide-bar-open')!);
    expect(document.querySelector('.guide-bar')).toBeNull();
    expect(document.querySelector('.guide-modal')!.classList.contains('is-away')).toBe(false);
    // The same sections are still open: nothing was unmounted.
    expect(document.querySelectorAll('.guide-section[open]').length).toBe(svGuide.sections.length);
  });

  it('a spot in the menu opens it; back to the guide closes it', async () => {
    seed();
    render(<App />);
    await openGuide();
    fireEvent.click(spotButton('wallets'));
    await waitFor(() => expect(document.querySelector('.utils-menu')).not.toBeNull());
    // The bubble and the bar stay usable beside the open menu.
    await waitFor(() => {
      expect((document.querySelector('.spot-root') as HTMLElement | null)?.inert).toBe(false);
      expect((document.querySelector('.guide-bar') as HTMLElement).inert).toBe(false);
    });

    const back = await waitFor(() => {
      const b = [...document.querySelectorAll('.spot-bubble button')].find(x => x.textContent === svGuide.backToGuide);
      expect(b).toBeDefined();
      return b!;
    });
    fireEvent.click(back);
    expect(document.querySelector('.utils-menu')).toBeNull();
    expect(document.querySelector('.guide-modal')!.classList.contains('is-away')).toBe(false);
  });

  it('OK puts the light out and keeps the bar; ✕ on the bar closes the guide', async () => {
    seed();
    render(<App />);
    await openGuide();
    fireEvent.click(spotButton('goals'));
    await waitFor(() => expect(document.querySelector('.spot-bubble')).not.toBeNull());
    fireEvent.click([...document.querySelectorAll('.spot-bubble button')].find(b => b.textContent === svGuide.ok)!);
    expect(document.querySelector('.spot-bubble')).toBeNull();
    expect(document.querySelector('.guide-bar')).not.toBeNull();
    fireEvent.click(document.querySelector('.guide-bar-close')!);
    expect(document.querySelector('.guide-bar')).toBeNull();
    expect(document.querySelector('.guide-modal')).toBeNull();
  });
});

describe('after a first budget, the guide is pointed out once', () => {
  const finishIntro = async () => {
    localStorage.setItem('budget_lang', 'sv');
    localStorage.setItem('budget_currency', 'sek');
    render(<App />);
    fireEvent.click(document.querySelector('.intro-skip')!);
    await waitFor(() => expect(document.querySelector('.beg-modal')).not.toBeNull());
  };
  const begBtn = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.beg-modal button')].find(b => b.textContent === text)!;

  it('points at the guide row; "Open the guide" opens it, and it never comes back', async () => {
    await finishIntro();
    fireEvent.click(document.querySelector('.beg-choice.is-main')!);
    fireEvent.change(document.querySelector('.beg-input')!, { target: { value: '30000' } });
    fireEvent.click(begBtn(sv.begNext));
    for (let i = 1; i < sv.begQuestions.length; i++) fireEvent.click(begBtn(sv.begSkip));
    fireEvent.click(begBtn(sv.begCreate('okt', 'dec')));
    await waitFor(() => expect(document.querySelector('.spot-bubble')?.textContent).toContain(sv.guideNudgeTitle));
    fireEvent.click([...document.querySelectorAll('.spot-bubble button')].find(b => b.textContent === sv.guideNudgeOpen)!);
    await waitFor(() => expect(document.querySelector('.guide-modal')).not.toBeNull());
    expect(localStorage.getItem('budget_guide_nudge_seen')).toBe('1');

    cleanup();
    render(<App />);
    expect(document.querySelector('.spot-bubble')).toBeNull();
  });

  it('the template button points at it too; "Later" just closes it', async () => {
    await finishIntro();
    fireEvent.click([...document.querySelectorAll('.beg-choice')].find(b => b.textContent?.includes(sv.startExpert))!);
    fireEvent.click([...document.querySelectorAll('.onboard-hero button')].find(b => b.textContent?.includes(sv.useBudgetTemplate))!);
    await waitFor(() => expect(document.querySelector('.spot-bubble')?.textContent).toContain(sv.guideNudgeBody));
    fireEvent.click([...document.querySelectorAll('.spot-bubble button')].find(b => b.textContent === sv.guideNudgeLater)!);
    expect(document.querySelector('.spot-bubble')).toBeNull();
    expect(document.querySelector('.guide-modal')).toBeNull();
    expect(localStorage.getItem('budget_guide_nudge_seen')).toBe('1');
  });
});
