// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { CustomV3 } from './components/CustomV3';

// ── Custom: six small things from the Customize product plan (2026-09-20) ───
//
//   1. Say that Custom is a budget of its own — nothing typed here reaches Classic.
//   2. An empty month after a filled one offers to copy it, right where it shows.
//   3. On a phone the toolbar is one line: Budget/Year, Edit, and a ••• menu.
//   4. Controls a screen reader read as "bg-brand", "empty set" and "0" have names.
//   5. Using the budget is entering amounts. Renaming, recolouring and adding
//      rows belong to Edit layout — on a desktop and on a phone alike.
//   6. The summary also says what is left AFTER saving, which is what Classic
//      calls "Kvar".

const STRUCT = 'budget_custom_v3';
const valuesKey = (y: number, m: number) => `budget_custom_v3_values_${y}_${m}`;

const block = (id: string, tag: 'in' | 'out' | 'save', rowId: string) => ({
  id, name: id, userNamed: true, kind: 'block', tag, width: 'full',
  rows: [{ id: rowId, name: rowId, color: '#22c55e', userNamed: true }],
  chart: { show: false, type: 'bar', size: 'md', position: 'below' },
});

const STRUCTURE = [
  block('Inkomst', 'in', 'lon'),
  block('Utgifter', 'out', 'hyra'),
  block('Sparande', 'save', 'buffert'),
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
  vi.stubGlobal('confirm', () => true);
  localStorage.setItem('budget_custom_help_seen', '1');
  localStorage.setItem(STRUCT, JSON.stringify(STRUCTURE));
  // September 2026 is filled in; nothing else is.
  localStorage.setItem(valuesKey(2026, 8), JSON.stringify({ lon: 30000, hyra: 15000, buffert: 5000 }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = (year: number, month: number) =>
  render(<CustomV3 year={year} month={month} onSaveFailed={() => {}} onRecordUndo={() => {}} />);

const text = () => document.body.textContent ?? '';
const buttonWith = (label: string) =>
  [...document.querySelectorAll('button')].find(b => b.textContent?.includes(label));
const enterEditMode = () => {
  const edit = buttonWith('Redigera layout');
  expect(edit).toBeDefined();
  fireEvent.click(edit!);
};

describe('1 — Custom says it is a budget of its own', () => {
  it('shows the note on the page', () => {
    mount(2026, 8);
    expect(text()).toContain('Fristående budget – påverkar inte din vanliga budget');
  });
});

describe('2 — an empty month offers to copy the one before it', () => {
  it('names the empty month and the month it would copy', () => {
    mount(2026, 9);
    const box = document.querySelector('.custom-month-empty');
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain('Oktober är inte ifylld ännu');
    // Lower case inside a Swedish sentence.
    expect(box!.textContent).toContain('Kopiera september');
  });

  it('copies September into October in one tap, and then goes away', () => {
    mount(2026, 9);
    const copy = document.querySelector('.custom-month-empty button');
    act(() => { fireEvent.click(copy!); });
    expect(JSON.parse(localStorage.getItem(valuesKey(2026, 9)) ?? '{}'))
      .toEqual({ lon: 30000, hyra: 15000, buffert: 5000 });
    expect(document.querySelector('.custom-month-empty')).toBeNull();
  });

  it('stays away from a month that is filled in', () => {
    mount(2026, 8);
    expect(document.querySelector('.custom-month-empty')).toBeNull();
  });

  it('stays away when there is nothing to copy', () => {
    mount(2026, 7);   // August empty, July empty too
    expect(document.querySelector('.custom-month-empty')).toBeNull();
  });
});

describe('3 — the phone toolbar is one line', () => {
  it('keeps Edit outside and moves the rest behind •••', () => {
    phone = true;
    mount(2026, 8);
    const toolbar = document.querySelector('.custom-toolbar')!;
    expect(toolbar.textContent).toContain('Redigera layout');
    expect(toolbar.textContent).not.toContain('Så funkar det');
    expect(toolbar.textContent).not.toContain('Kopiera förra månaden');
    expect(document.querySelector('[aria-label="Fler val"]')).not.toBeNull();
  });

  it('opens a menu with the moved actions, and Escape closes it', () => {
    phone = true;
    mount(2026, 8);
    const more = document.querySelector('[aria-label="Fler val"]') as HTMLButtonElement;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const items = [...menu!.querySelectorAll('[role="menuitem"]')].map(i => i.textContent);
    expect(items.some(i => i?.includes('Så funkar det'))).toBe(true);
    expect(items.some(i => i?.includes('Kopiera förra månaden'))).toBe(true);
    // Clearing every amount is a design-mode action, and it stays one.
    expect(items.some(i => i?.includes('Rensa belopp'))).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('offers Clear amounts in the menu only in design mode', () => {
    phone = true;
    mount(2026, 8);
    enterEditMode();
    fireEvent.click(document.querySelector('[aria-label="Fler val"]')!);
    const items = [...document.querySelectorAll('[role="menuitem"]')].map(i => i.textContent);
    expect(items.some(i => i?.includes('Rensa belopp'))).toBe(true);
  });

  it('closes when tapping beside it', () => {
    phone = true;
    mount(2026, 8);
    fireEvent.click(document.querySelector('[aria-label="Fler val"]')!);
    fireEvent.click(document.querySelector('.custom-menu-backdrop')!);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('leaves the desktop toolbar as it was', () => {
    mount(2026, 8);
    expect(document.querySelector('[aria-label="Fler val"]')).toBeNull();
    expect(buttonWith('Så funkar det')).toBeDefined();
    expect(buttonWith('Kopiera förra månaden')).toBeDefined();
  });
});

describe('4 — the block settings have names a screen reader can say', () => {
  const openSettings = () => {
    mount(2026, 8);
    enterEditMode();
    // The ⚙ button of the first block.
    const cog = [...document.querySelectorAll('.custom-section-controls .custom-icon-btn')]
      .find(b => b.textContent === '⚙');
    expect(cog).toBeDefined();
    fireEvent.click(cog!);
  };

  it('names the background colours in words', () => {
    openSettings();
    const swatches = [...document.querySelectorAll('.cfg-bg-swatches button')];
    expect(swatches.length).toBe(6);
    for (const s of swatches) expect(s.getAttribute('aria-label')).not.toMatch(/^bg-/);
    expect(swatches.map(s => s.getAttribute('aria-label'))).toContain('Inkomstfärg');
  });

  it('says which background is chosen', () => {
    openSettings();
    const none = document.querySelector('.cfg-bg-swatches .bg-none')!;
    expect(none.getAttribute('aria-pressed')).toBe('true');
  });

  it('names the "no emoji" choice and marks the chosen emoji', () => {
    openSettings();
    const buttons = [...document.querySelectorAll('.cfg-emoji-btn')];
    expect(buttons[0].getAttribute('aria-label')).toBe('Standard');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(buttons[1]);
    const after = [...document.querySelectorAll('.cfg-emoji-btn')];
    expect(after[0].getAttribute('aria-pressed')).toBe('false');
    expect(after[1].getAttribute('aria-pressed')).toBe('true');
    expect(after[1].getAttribute('aria-label')).toMatch(/^Emoji /);
  });

  it('labels the target field with the block it belongs to', () => {
    openSettings();
    const target = document.querySelector('.cfg-target-input');
    expect(target?.getAttribute('aria-label')).toBe('Målbelopp för Inkomst');
  });
});

describe('5 — using the budget is not designing it', () => {
  it('enters amounts only, outside Edit layout', () => {
    mount(2026, 8);
    expect(document.querySelectorAll('.cv3-row input[type="color"]').length).toBe(0);
    expect(document.querySelectorAll('.cv3-row .cv3-name-input').length).toBe(0);
    expect(document.querySelectorAll('.cv3-add-row').length).toBe(0);
    // The colour is still shown, and the amounts are still fields.
    expect(document.querySelectorAll('.cv3-row-color-static').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.cv3-amount-input').length).toBeGreaterThan(0);
  });

  it('renames, recolours and adds rows in Edit layout', () => {
    mount(2026, 8);
    enterEditMode();
    expect(document.querySelectorAll('.cv3-row input[type="color"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.cv3-row .cv3-name-input').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.cv3-add-row').length).toBeGreaterThan(0);
  });

  it('follows the same rule in a block opened on a phone', () => {
    phone = true;
    mount(2026, 8);
    fireEvent.click(document.querySelector('.custom-tile-btn')!);
    const dialog = document.querySelector('.custom-expand')!;
    expect(dialog.querySelectorAll('input[type="color"]').length).toBe(0);
    expect(dialog.querySelectorAll('.cv3-name-input').length).toBe(0);
    expect(dialog.querySelectorAll('.cv3-add-row').length).toBe(0);
    expect(dialog.querySelectorAll('.cv3-amount-input').length).toBeGreaterThan(0);
  });
});

describe('6 — what is left after saving', () => {
  const row = () => [...document.querySelectorAll('.cv3-summary-row')]
    .find(r => r.textContent?.includes('Kvar efter sparande'));

  it('is income minus expenses minus saving', () => {
    mount(2026, 8);
    // 30 000 − 15 000 − 5 000
    expect(row()?.textContent).toMatch(/\+10\s000\s*kr/);
    // "Kvar" itself is still before saving.
    const kvar = [...document.querySelectorAll('.cv3-summary-big')][0];
    expect(kvar.textContent).toMatch(/\+15\s000\s*kr/);
  });

  it('goes negative when saving more than is left', () => {
    localStorage.setItem(valuesKey(2026, 8), JSON.stringify({ lon: 30000, hyra: 15000, buffert: 20000 }));
    mount(2026, 8);
    expect(row()?.textContent).toMatch(/−5\s000\s*kr/);
  });

  it('is not shown when nothing is saved — it would repeat Kvar', () => {
    localStorage.setItem(valuesKey(2026, 8), JSON.stringify({ lon: 30000, hyra: 15000 }));
    mount(2026, 8);
    expect(row()).toBeUndefined();
  });

  it('is not shown for a month that is not filled in', () => {
    mount(2026, 9);
    expect(row()).toBeUndefined();
  });
});
