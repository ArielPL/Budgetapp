// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import {
  CustomV3, loadStructure, noteTextFor, withNoteText, withNoteScope, targetState,
  type CustomBlock,
} from './components/CustomV3';

// ── Custom: the rest of stage 1 in the Customize plan (2026-09-20) ──────────
//
//   (The tab bar in Custom moved to customLinked.test.tsx: it is shown only
//   for a panel linked to the regular budget.)
//   · A target meant "fill up to" on every block. On an expense block that is
//     backwards: rent reaching its number is not an achievement.
//   · The Add block picker separated its two kinds of choice with a bare line.
//   · N4: a note written in September was shown in October too.

const STRUCT = 'budget_custom_v3';
const valuesKey = (y: number, m: number) => `budget_custom_v3_values_${y}_${m}`;
const chart = { show: false, type: 'bar', size: 'md', position: 'below' };

const block = (id: string, tag: 'in' | 'out' | 'save', rowId: string, target?: number) => ({
  id, name: id, userNamed: true, kind: 'block', tag, width: 'full', target,
  rows: [{ id: rowId, name: rowId, color: '#22c55e', userNamed: true }], chart,
});
const note = (extra: Record<string, unknown>) => ({
  id: 'n', name: 'Att komma ihåg', userNamed: true, kind: 'note', width: 'full', rows: [], chart, ...extra,
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  localStorage.setItem('budget_welcome_seen', '1');
  localStorage.setItem('budget_custom_help_seen', '1');
  localStorage.setItem('budget_lang', 'sv');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = (year: number, month: number) =>
  render(<CustomV3 year={year} month={month} onSaveFailed={() => {}} onRecordUndo={() => {}} />);
const text = () => document.body.textContent ?? '';

describe('a target means what the block means', () => {
  it('is a goal for income and saving', () => {
    expect(targetState(4000, 5000, false)).toBe('goal');
    expect(targetState(5000, 5000, false)).toBe('reached');
    expect(targetState(6000, 5000, false)).toBe('reached');
  });

  it('is a limit for expenses: fine, nearly used, over', () => {
    expect(targetState(7000, 10000, true)).toBe('ok');
    expect(targetState(7500, 10000, true)).toBe('near');     // 75 % is the line
    expect(targetState(10000, 10000, true)).toBe('near');    // at the limit, not over it
    expect(targetState(10001, 10000, true)).toBe('over');
  });

  it('says it in words on an expense block, not only in colour', () => {
    localStorage.setItem(STRUCT, JSON.stringify([block('Mat', 'out', 'mat', 4000)]));
    localStorage.setItem(valuesKey(2026, 8), JSON.stringify({ mat: 4500 }));
    mount(2026, 8);
    expect(document.querySelector('.cv3-target-over')).not.toBeNull();
    expect(text()).toMatch(/500\s*kr över gränsen/);
  });

  it('says how far is left on a goal', () => {
    localStorage.setItem(STRUCT, JSON.stringify([block('Buffert', 'save', 'buf', 5000)]));
    localStorage.setItem(valuesKey(2026, 8), JSON.stringify({ buf: 2000 }));
    mount(2026, 8);
    expect(document.querySelector('.cv3-target-goal')).not.toBeNull();
    expect(text()).toMatch(/3\s000\s*kr kvar till målet/);
  });

  it('calls it a limit in the settings of an expense block', () => {
    localStorage.setItem(STRUCT, JSON.stringify([block('Mat', 'out', 'mat', 4000)]));
    mount(2026, 8);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Redigera layout'))!);
    fireEvent.click([...document.querySelectorAll('.custom-section-controls .custom-icon-btn')]
      .find(b => b.textContent === '⚙')!);
    expect(document.querySelector('.cfg-target-input')?.getAttribute('aria-label')).toBe('Gräns för Mat');
    expect(document.querySelector('.custom-config')?.textContent).toContain('Gräns');
  });
});

describe('the Add block picker names its two kinds of choice', () => {
  it('has a heading over each group', () => {
    localStorage.setItem(STRUCT, JSON.stringify([block('Inkomst', 'in', 'lon')]));
    mount(2026, 8);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Redigera layout'))!);
    fireEvent.click(document.querySelector('.custom-add-card')!);
    const headings = [...document.querySelectorAll('.custom-picker-heading')].map(h => h.textContent);
    expect(headings).toEqual(['Bygg själv', 'Färdiga block']);
    // Each group is announced by its heading.
    const groups = document.querySelectorAll('.custom-picker-grid[role="group"]');
    expect(groups.length).toBe(2);
  });
});

describe('N4 — a note has a reach', () => {
  const base = (): CustomBlock => ({
    id: 'n', kind: 'note', name: 'N', tag: 'in', width: 'full', bg: null,
    chart: { show: false, type: 'bars', size: 'M', position: 'bottom' }, rows: [],
  });

  it('keeps a month note to its month', () => {
    const b = withNoteText({ ...base(), noteScope: 'month' }, 2026, 8, 'Betala tandläkaren');
    expect(noteTextFor(b, 2026, 8)).toBe('Betala tandläkaren');
    expect(noteTextFor(b, 2026, 9)).toBe('');
  });

  it('shows an every-month note everywhere', () => {
    const b = withNoteText(base(), 2026, 8, 'Mål: 50 000 i buffert');
    expect(noteTextFor(b, 2026, 9)).toBe('Mål: 50 000 i buffert');
    expect(noteTextFor(b, 2027, 0)).toBe('Mål: 50 000 i buffert');
  });

  it('does not change what is on screen when the reach changes', () => {
    const all = withNoteText(base(), 2026, 8, 'Hej');
    const month = withNoteScope(all, 'month', 2026, 8);
    expect(noteTextFor(month, 2026, 8)).toBe('Hej');
    expect(noteTextFor(month, 2026, 9)).toBe('');
    const back = withNoteScope(withNoteText(month, 2026, 8, 'Hej då'), 'all', 2026, 8);
    expect(noteTextFor(back, 2026, 9)).toBe('Hej då');
  });

  it('keeps other months’ text when switching to every month and back', () => {
    let b = withNoteText({ ...base(), noteScope: 'month' }, 2026, 8, 'Sep');
    b = withNoteText(b, 2026, 9, 'Okt');
    b = withNoteScope(b, 'all', 2026, 8);
    b = withNoteScope(b, 'month', 2026, 8);
    expect(noteTextFor(b, 2026, 9)).toBe('Okt');
  });

  it('removes an emptied month instead of storing a blank', () => {
    let b = withNoteText({ ...base(), noteScope: 'month' }, 2026, 8, 'x');
    b = withNoteText(b, 2026, 8, '');
    expect(b.monthText).toEqual({});
  });

  it('leaves notes written before scopes existed in every month', () => {
    localStorage.setItem(STRUCT, JSON.stringify([note({ text: 'Gammal anteckning' })]));
    const [loaded] = loadStructure()!;
    expect(loaded.noteScope).toBeUndefined();
    expect(noteTextFor(loaded, 2026, 9)).toBe('Gammal anteckning');
  });

  it('survives a reload, and drops junk month keys', () => {
    localStorage.setItem(STRUCT, JSON.stringify([note({
      noteScope: 'month', monthText: { '2026_8': 'Sep', '2026_99': 'bad', x: 'bad', '2026_9': 7 },
    })]));
    const [loaded] = loadStructure()!;
    expect(loaded.monthText).toEqual({ '2026_8': 'Sep' });
  });

  it('shows September’s note in September only, and says so', () => {
    localStorage.setItem(STRUCT, JSON.stringify([note({ noteScope: 'month', monthText: { '2026_8': 'Sep-text' } })]));
    mount(2026, 8);
    expect((document.querySelector('.cv3-note-text') as HTMLTextAreaElement).value).toBe('Sep-text');
    expect(document.querySelector('.cv3-note-scope')?.textContent).toBe('Bara september 2026');
    cleanup();
    mount(2026, 9);
    expect((document.querySelector('.cv3-note-text') as HTMLTextAreaElement).value).toBe('');
  });

  it('saves typing into the month on screen', () => {
    localStorage.setItem(STRUCT, JSON.stringify([note({ noteScope: 'month' })]));
    mount(2026, 9);
    fireEvent.change(document.querySelector('.cv3-note-text')!, { target: { value: 'Oktober-plan' } });
    const stored = JSON.parse(localStorage.getItem(STRUCT)!);
    expect(stored[0].monthText).toEqual({ '2026_9': 'Oktober-plan' });
  });

  it('lets the reach be changed in the note’s settings', () => {
    localStorage.setItem(STRUCT, JSON.stringify([note({ text: 'Delad' })]));
    mount(2026, 8);
    expect(document.querySelector('.cv3-note-scope')?.textContent).toBe('Alla månader');
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Redigera layout'))!);
    fireEvent.click([...document.querySelectorAll('.custom-section-controls .custom-icon-btn')]
      .find(b => b.textContent === '⚙')!);
    const only = [...document.querySelectorAll('.custom-config button')]
      .find(b => b.textContent === 'Bara september 2026')!;
    expect(only.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(only);
    expect(document.querySelector('.cv3-note-scope')?.textContent).toBe('Bara september 2026');
    const stored = JSON.parse(localStorage.getItem(STRUCT)!);
    expect(stored[0].noteScope).toBe('month');
    expect(stored[0].monthText).toEqual({ '2026_8': 'Delad' });
  });

  it('makes new notes belong to their month', () => {
    localStorage.setItem(STRUCT, JSON.stringify([block('Inkomst', 'in', 'lon')]));
    mount(2026, 8);
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('Redigera layout'))!);
    fireEvent.click(document.querySelector('.custom-add-card')!);
    fireEvent.click([...document.querySelectorAll('.custom-picker-btn')].find(b => b.textContent?.includes('Anteckning'))!);
    expect(document.querySelector('.cv3-note-scope')?.textContent).toBe('Bara september 2026');
  });
});
