import { describe, it, expect } from 'vitest';
import { shortWhen, longDate } from './dateLabel';

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

describe('longDate', () => {
  it('gives a day without a clock, in each language', () => {
    expect(longDate('2026-09-17T13:40:00', 'sv')).toBe('17 september 2026');
    expect(longDate('2026-09-17T13:40:00', 'en')).toBe('17 September 2026');
    // Spanish writes the long form with `de` on both sides of the month.
    expect(longDate('2026-09-17T13:40:00', 'es')).toBe('17 de septiembre de 2026');
  });

  it('accepts a timestamp as well as a string', () => {
    const at = new Date(2026, 0, 3, 23, 30).getTime();
    expect(longDate(at, 'sv')).toBe('3 januari 2026');
  });

  it('reads local time here too', () => {
    const at = new Date(2026, 8, 17, 0, 30);
    expect(longDate(at.toISOString(), 'sv')).toBe('17 september 2026');
  });

  it('says nothing rather than "Invalid Date"', () => {
    expect(longDate('not a date', 'sv')).toBe('');
  });
});
