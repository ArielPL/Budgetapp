// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { CustomV3 } from './components/CustomV3';

// ── Custom: an empty month is not a collapse, and looking is not editing ────
//
// From the Customize product plan (2026-09-20), items N2 and N3.
//
// N2. An untouched October rendered as a real month of zeros, so against a
// filled September it read "−30 000 kr income, −15 000 kr expenses" — a
// collapse that never happened. The Year view already told unknown from zero;
// the month view did not.
//
// N3. On a phone, tapping a block opened it in a dialog that hard-coded
// `editing`, so every row carried a delete button while "Edit layout" was off
// and the screen looked like ordinary use.

const STRUCT = 'budget_custom_v3';
const valuesKey = (y: number, m: number) => `budget_custom_v3_values_${y}_${m}`;

const block = (id: string, tag: 'in' | 'out', rowId: string) => ({
  id, name: id, userNamed: true, kind: 'block', tag, width: 'full',
  rows: [{ id: rowId, name: rowId, color: '#22c55e', userNamed: true }],
  chart: { show: false, type: 'bar', size: 'md', position: 'below' },
});

const STRUCTURE = [
  block('Inkomst', 'in', 'lon'),
  block('Utgifter', 'out', 'hyra'),
  {
    id: 'sum', name: 'Sammanfattning', userNamed: true, kind: 'summary', width: 'full', rows: [],
    chart: { show: false, type: 'bar', size: 'md', position: 'below' },
  },
];

let phone = false;
beforeEach(() => {
  localStorage.clear();
  phone = false;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width'), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  localStorage.setItem('budget_custom_help_seen', '1');
  localStorage.setItem(STRUCT, JSON.stringify(STRUCTURE));
  // September 2026 is filled in; nothing else is.
  localStorage.setItem(valuesKey(2026, 8), JSON.stringify({ lon: 30000, hyra: 15000 }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = (year: number, month: number) =>
  render(<CustomV3 year={year} month={month} onSaveFailed={() => {}} onRecordUndo={() => {}} />);

const text = () => document.body.textContent ?? '';
const deltas = () => document.querySelectorAll('.cv3-delta, .custom-tile-delta').length;

describe('N2 — an untouched month is unknown, not zero', () => {
  it('shows no change against a filled month before it', () => {
    // The bug: −30 000 kr against September.
    mount(2026, 9);
    expect(deltas()).toBe(0);
    expect(text()).not.toMatch(/−\s?30\s000/);
  });

  it('shows its totals as a dash, with the reason on hover', () => {
    mount(2026, 9);
    const unknown = [...document.querySelectorAll('.amount-unknown')];
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown[0].getAttribute('title')).toBe('Månaden är inte ifylld ännu');
  });

  it('does not compare a filled month against an untouched one either', () => {
    mount(2026, 8);   // September filled, August not
    expect(deltas()).toBe(0);
  });

  it('counts a deliberate zero as filled in, and compares it', () => {
    // Recording 0 is an answer. October with every amount set to 0 is a real
    // month of nothing, and the change against September is real.
    localStorage.setItem(valuesKey(2026, 9), JSON.stringify({ lon: 0, hyra: 0 }));
    mount(2026, 9);
    expect(deltas()).toBeGreaterThan(0);
    expect(document.querySelectorAll('.cv3-block-total .amount-unknown').length).toBe(0);
  });

  it('compares January with the December before it', () => {
    localStorage.setItem(valuesKey(2026, 11), JSON.stringify({ lon: 30000, hyra: 15000 }));
    localStorage.setItem(valuesKey(2027, 0), JSON.stringify({ lon: 31000, hyra: 15000 }));
    mount(2027, 0);
    expect(text()).toMatch(/\+1\s000\s*kr vs förra/);
  });
});

describe('N3 — opening a block on a phone is not design mode', () => {
  it('offers no delete button when Edit layout is off', () => {
    phone = true;
    mount(2026, 8);
    const tile = document.querySelector('.custom-tile-btn');
    expect(tile).not.toBeNull();
    fireEvent.click(tile!);
    const dialog = document.querySelector('.custom-expand');
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelectorAll('.cv3-row-del').length).toBe(0);
    // Amounts can still be entered — that is ordinary use.
    expect(dialog!.querySelectorAll('.cv3-amount-wrap').length).toBeGreaterThan(0);
  });

  it('still offers delete in design mode, where it belongs', () => {
    phone = true;
    mount(2026, 8);
    // Three toolbar buttons share the class; this is the one that edits layout.
    const editBtn = [...document.querySelectorAll('.custom-edit-btn')]
      .find(b => b.textContent?.includes('Redigera layout'));
    expect(editBtn).toBeDefined();
    fireEvent.click(editBtn!);
    expect(document.querySelectorAll('.cv3-row-del').length).toBeGreaterThan(0);
  });
});
