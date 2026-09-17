import { describe, expect, it } from 'vitest';
import { isValidIsoDate, parseLocalIsoDate } from './date';

describe('ISO calendar dates', () => {
  it('accepts real dates, including leap day', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(parseLocalIsoDate('2026-09-17')?.getDate()).toBe(17);
  });

  it('rejects dates that JavaScript would otherwise roll into the next month', () => {
    for (const value of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01']) {
      expect(isValidIsoDate(value)).toBe(false);
    }
  });

  it('requires the stored ISO shape', () => {
    for (const value of ['2026-2-01', '01/02/2026', '', 'not-a-date']) {
      expect(isValidIsoDate(value)).toBe(false);
    }
  });
});
