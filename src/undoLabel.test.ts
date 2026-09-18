import { describe, it, expect } from 'vitest';
import { undoWhere } from './undoLabel';
import type { UndoEntry } from './undo';

const entry = (over: Partial<UndoEntry> = {}): UndoEntry => ({
  at: '2026-09-17T13:40:00',
  action: 'resetMonth',
  changes: [],
  ...over,
});

describe('undoWhere', () => {
  it('names the month in the language on screen, not the one it was done in', () => {
    const e = entry({ year: 2026, month: 8 });
    expect(undoWhere(e, 'sv')).toBe('September 2026');
    expect(undoWhere(e, 'es')).toBe('Septiembre 2026');
  });

  it('is empty when the action was not about one month', () => {
    expect(undoWhere(entry({ action: 'restoreBackup' }), 'sv')).toBe('');
  });
});
