import { describe, it, expect } from 'vitest';
import { undoWhere, shortWhen } from './undoLabel';
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

describe('shortWhen', () => {
  it('writes the month the way the language does', () => {
    // Swedish and Spanish keep month names lower case inside a date; English
    // capitalises. The shared MONTHS_SHORT list is capitalised because it also
    // titles the month, so the case has to be applied here.
    expect(shortWhen('2026-09-17T13:40:00', 'sv')).toBe('17 sep 13:40');
    expect(shortWhen('2026-09-17T13:40:00', 'es')).toBe('17 sep 13:40');
    expect(shortWhen('2026-09-17T13:40:00', 'en')).toBe('17 Sep 13:40');
  });

  it('pads the clock', () => {
    expect(shortWhen('2026-09-05T09:05:00', 'sv')).toBe('5 sep 09:05');
  });

  it('reads local time, so a small hour is not dated to the day before', () => {
    // toISOString would render 00:30 in Stockholm as the previous day at 22:30.
    const at = new Date(2026, 8, 17, 0, 30);
    expect(shortWhen(at.toISOString(), 'sv')).toBe('17 sep 00:30');
  });

  it('says nothing rather than "Invalid Date"', () => {
    expect(shortWhen('not a date', 'sv')).toBe('');
  });
});
