// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { AiChangeConfirm } from './AiChangeConfirm';
import { translations, formatMoney } from '../i18n';
import { pushUndo, undoLast, readUndo, type UndoEntry } from '../undo';
import { memory } from '../test-fixtures/memoryStorage';
import type { MonthData } from '../types';
import type { AiChange } from '../ai/changes';

// The Confirm box for Budget AI's changes: what it shows, that Cancel leaves
// storage alone, and that Confirm writes once and can be undone. Synthetic
// values only.

const sv = translations.sv;
const kr = (n: number) => formatMoney(n, 'sek');

const budget = (food: number): MonthData => ({
  income: [{ id: 'lon', label: 'Lön', amount: 30000 }],
  expenses: [{ id: 'mat', name: 'Mat & dryck', icon: '•', color: '#888', rows: [{ id: 'matvaror', label: 'Matvaror', amount: food }] }],
  savings: [],
});
const OCT = { year: 2026, month: 9 };

const setup = (change: AiChange) => {
  const storage = memory({
    budget_2026_9: JSON.stringify(budget(4000)),
    budget_2026_10: JSON.stringify(budget(4000)),
    budget_actuals_2026_9: JSON.stringify([
      { id: 'a', date: '2026-10-02', text: 'SYNT SPOTIFY AB', amount: 119, direction: 'out', categoryId: 'fritid' },
    ]),
  });
  const before = new Map(storage.map);
  const onApplied = vi.fn();
  const onClose = vi.fn();
  const recordUndo = (e: UndoEntry) => { pushUndo(storage, e); };
  const view = render(
    <AiChangeConfirm change={change} at={OCT} budget={budget(4000)} storage={storage}
      newId={() => 'ny'} recordUndo={recordUndo} onApplied={onApplied} onClose={onClose} />,
  );
  return { storage, before, onApplied, onClose, view };
};

const foodIn = (s: { getItem(k: string): string | null }, key: string) =>
  (JSON.parse(s.getItem(key)!) as MonthData).expenses[0].rows[0].amount;

afterEach(cleanup);

describe('AiChangeConfirm', () => {
  it('shows before → after and asks how far it reaches; Cancel stores nothing', () => {
    const { storage, before, onClose, view } = setup({ kind: 'setAmount', categoryId: 'mat', rowId: 'matvaror', amount: 3500 });
    expect(view.getByRole('dialog', { name: sv.aiSetTitle })).toBeTruthy();
    expect(document.querySelector('.confirm-change-before')?.textContent).toBe(`${kr(4000)} → `);
    expect(view.getByText('Matvaror').nextElementSibling?.textContent).toBe(`${kr(4000)} → ${kr(3500)}`);
    expect(view.getByRole('button', { name: 'Bara oktober 2026' }).getAttribute('aria-pressed')).toBe('true');
    expect(view.getByRole('button', { name: 'Oktober 2026 och framåt' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: sv.cancel }));
    expect(onClose).toHaveBeenCalled();
    expect(storage.map).toEqual(before);
  });

  it('"and later" writes every later month in one go, and one step back undoes all of it', async () => {
    const { storage, onApplied, view } = setup({ kind: 'setAmount', categoryId: 'mat', rowId: 'matvaror', amount: 3500 });
    fireEvent.click(view.getByRole('button', { name: 'Oktober 2026 och framåt' }));
    expect(view.getByText(sv.aiMonthsChanged)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: sv.toolConfirm }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(foodIn(storage, 'budget_2026_9')).toBe(3500);
    expect(foodIn(storage, 'budget_2026_10')).toBe(3500);
    expect(readUndo(storage)[0]).toMatchObject({ action: 'aiSetAmount', year: 2026, month: 9, count: 2 });
    expect(sv.undoWhat('aiSetAmount', 'oktober 2026', 2)).toBe('Ett belopp ändrades i 2 månader');
    await undoLast(storage);
    expect(foodIn(storage, 'budget_2026_9')).toBe(4000);
    expect(foodIn(storage, 'budget_2026_10')).toBe(4000);
  });

  it('adds a row in the month on screen only, by default', async () => {
    const { storage, view } = setup({ kind: 'addRow', categoryId: 'mat', label: 'Kattmat', amount: 200 });
    fireEvent.click(view.getByRole('button', { name: sv.toolConfirm }));
    await waitFor(() => expect(readUndo(storage)).toHaveLength(1));
    expect((JSON.parse(storage.getItem('budget_2026_9')!) as MonthData).expenses[0].rows.at(-1)).toMatchObject({ id: 'ny', label: 'Kattmat', amount: 200 });
    expect((JSON.parse(storage.getItem('budget_2026_10')!) as MonthData).expenses[0].rows).toHaveLength(1);
  });

  it('moving purchases shows how many, and says new ones follow', async () => {
    const { storage, view } = setup({ kind: 'move', place: 'Spotify', categoryId: 'mat' });
    expect(view.getByText(sv.aiMoveCount).nextElementSibling?.textContent).toBe('1');
    expect(view.getByText(sv.aiMoveFuture('Spotify'))).toBeTruthy();
    expect(view.queryByRole('button', { name: /framåt/ })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: sv.toolConfirm }));
    await waitFor(() => expect(readUndo(storage)[0]).toMatchObject({ action: 'aiMovePurchases', count: 1 }));
    expect(JSON.parse(storage.getItem('budget_actuals_2026_9')!)[0].categoryId).toBe('mat');
  });

  it('with nothing to change, only says so', () => {
    const { view } = setup({ kind: 'move', place: 'Systembolaget', categoryId: 'mat' });
    expect(view.getByText(sv.aiNoPurchases('Systembolaget'))).toBeTruthy();
    expect(view.queryByRole('button', { name: sv.toolConfirm })).toBeNull();
  });
});
