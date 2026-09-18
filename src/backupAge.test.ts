import { describe, it, expect } from 'vitest';
import {
  backupAge, shouldRemind, DAY_MS,
  BACKUP_STALE_DAYS, BACKUP_URGENT_DAYS, BACKUP_SNOOZE_DAYS, BACKUP_URGENT_SNOOZE_DAYS,
} from './backupAge';

// ── Why these thresholds are worth a test ──────────────────────────────────
//
// Everything lives on the device and there is no server to restore from, so an
// exported file is the only way back from a lost phone. But a banner people
// click away without reading is worse than none — it teaches the clicking. The
// two levels have to stay different in kind, and neither can be reached by
// waiting six months in a browser.

const NOW = Date.parse('2026-09-18T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * DAY_MS).toISOString();

describe('how old it is', () => {
  it('counts never having backed up as never, not as recent', () => {
    expect(backupAge(null, NOW)).toEqual({
      level: 'never', days: null, at: null, neverBackedUp: true,
    });
  });

  it('treats an unreadable value as never', () => {
    // The failure a user must never be handed is the one where the app quietly
    // believes they are safe.
    expect(backupAge('last tuesday', NOW).level).toBe('never');
  });

  it('is recent right up to the threshold, and stale on it', () => {
    expect(backupAge(daysAgo(BACKUP_STALE_DAYS - 1), NOW).level).toBe('recent');
    expect(backupAge(daysAgo(BACKUP_STALE_DAYS), NOW).level).toBe('stale');
  });

  it('escalates at six months, not before', () => {
    expect(backupAge(daysAgo(BACKUP_URGENT_DAYS - 1), NOW).level).toBe('stale');
    expect(backupAge(daysAgo(BACKUP_URGENT_DAYS), NOW).level).toBe('urgent');
  });

  it('reports the age in whole days and keeps the timestamp for display', () => {
    const age = backupAge(daysAgo(45), NOW);
    expect(age.days).toBe(45);
    expect(age.at).toBe(NOW - 45 * DAY_MS);
  });
});

describe('the person who never backs up at all', () => {
  // The hole in the first version: with no backup there is nothing to age, so
  // this user got the quiet line forever — and they are exactly who the
  // escalation is for. The clock is the day the app first asked them.

  it('starts at "never", not at "urgent"', () => {
    // Someone two days in has not ignored anything yet.
    const age = backupAge(null, NOW, daysAgo(2));
    expect(age.level).toBe('never');
    expect(age.neverBackedUp).toBe(true);
  });

  it('escalates after six months of being asked', () => {
    const age = backupAge(null, NOW, daysAgo(BACKUP_URGENT_DAYS));
    expect(age.level).toBe('urgent');
    expect(age.neverBackedUp).toBe(true);
    // The count is months of USING the app, so the sentence can say so.
    expect(age.days).toBe(BACKUP_URGENT_DAYS);
  });

  it('stays at "never" when the app never recorded asking', () => {
    // Versions before this wrote the flag as the string '1' — and Date.parse('1')
    // SUCCEEDS, returning January 2001. A plain parse would have shown every one
    // of those users the alarm on their next launch, telling them they had used
    // the app for 300 months. The shape is checked, not just the parse.
    expect(backupAge(null, NOW, '1').level).toBe('never');
    expect(backupAge(null, NOW, null).level).toBe('never');
    expect(backupAge(null, NOW, null).days).toBeNull();
  });

  it('marks a real backup as not-never, whatever the asking clock says', () => {
    const age = backupAge(daysAgo(2), NOW, daysAgo(400));
    expect(age.neverBackedUp).toBe(false);
    expect(age.level).toBe('recent');
  });
});

describe('whether to say anything', () => {
  const stale = backupAge(daysAgo(40), NOW);
  const urgent = backupAge(daysAgo(200), NOW);
  const recent = backupAge(daysAgo(2), NOW);
  const never = backupAge(null, NOW, daysAgo(3));

  it('says nothing when there is nothing to lose', () => {
    expect(shouldRemind(never, null, NOW, false)).toBe(false);
    expect(shouldRemind(urgent, null, NOW, false)).toBe(false);
  });

  it('says nothing when the backup is recent', () => {
    expect(shouldRemind(recent, null, NOW, true)).toBe(false);
  });

  it('asks when there is real data and no backup at all', () => {
    expect(shouldRemind(never, null, NOW, true)).toBe(true);
  });

  it('stays quiet for a week after being dismissed', () => {
    expect(shouldRemind(stale, daysAgo(BACKUP_SNOOZE_DAYS - 1), NOW, true)).toBe(false);
    expect(shouldRemind(stale, daysAgo(BACKUP_SNOOZE_DAYS), NOW, true)).toBe(true);
  });

  it('comes back sooner once it is urgent', () => {
    // By six months the quiet reminder has been dismissed a dozen times. Two
    // days, not seven — the cost of the nag is an annoyance, the cost of the
    // silence is every month the user has ever built.
    expect(shouldRemind(urgent, daysAgo(BACKUP_URGENT_SNOOZE_DAYS - 1), NOW, true)).toBe(false);
    expect(shouldRemind(urgent, daysAgo(BACKUP_URGENT_SNOOZE_DAYS), NOW, true)).toBe(true);
    // The same dismissal would still be silencing the quiet level.
    expect(shouldRemind(stale, daysAgo(BACKUP_URGENT_SNOOZE_DAYS), NOW, true)).toBe(false);
  });

  it('ignores a dismissal it cannot read rather than staying silent', () => {
    expect(shouldRemind(stale, 'nonsense', NOW, true)).toBe(true);
  });
});
