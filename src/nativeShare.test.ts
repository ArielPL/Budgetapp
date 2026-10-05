import { describe, it, expect } from 'vitest';
import { outcomeOf, isCancellation } from './nativeShare';

// ── What the share sheet may claim about a backup (iOS/Android review, P1) ──
// The menu's "last backup" date is a promise that a file exists. Only iOS's
// "Save to Files" proves that; anything else is asked about, and a closed
// sheet changes nothing.

describe('a backup handed to the share sheet', () => {
  it('counts as saved only when iOS says "Save to Files"', () => {
    expect(outcomeOf('com.apple.DocumentManagerUICore.SaveToFiles')).toBe('saved');
  });

  it('is merely shared when it went to another app, or the app is unknown', () => {
    expect(outcomeOf('com.google.android.apps.docs')).toBe('shared');
    expect(outcomeOf('')).toBe('shared');
    expect(outcomeOf(undefined)).toBe('shared');
  });

  it('tells a closed sheet from a real failure, on both platforms', () => {
    expect(isCancellation(new Error('Share canceled'))).toBe(true);   // as Android sent it
    expect(isCancellation('Share cancelled')).toBe(true);
    expect(isCancellation(new Error('Unable to write file'))).toBe(false);
  });
});
