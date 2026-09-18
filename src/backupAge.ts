// ── backupAge — how long ago, and how much that should matter ──────────────
//
// The app keeps everything on the device and has no server to restore from. A
// lost phone is a lost budget unless the user has exported a file, so the
// reminder is not housekeeping — it is the only thing standing between them and
// losing years of records.
//
// It still must not become wallpaper. The banner people click away without
// reading is worse than none, because it trains the clicking. So there are two
// levels, and they are deliberately different in kind:
//
//   stale  (30 days)  — quiet, snoozes for a week, says "recommended";
//   urgent (6 months) — says what is actually at stake, and snoozes for two
//                       days rather than seven, because by then the quiet one
//                       has been ignored a dozen times.
//
// Six months, not seven: the escalation should arrive while the user still
// remembers building the months they would lose.
//
// The person who has NEVER exported is the one this is for, and they were the
// hole in the first version: with no backup date there is nothing to age, so
// they would have received the quiet line forever. The clock used instead is
// the day the app FIRST asked them — stored when the banner is first shown.
// Six months of being asked and never doing it is exactly the case the
// escalation exists for.
//
// Pulled out of App.tsx so the thresholds can be tested without a browser and
// without waiting six months.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_STALE_DAYS = 30;
export const BACKUP_URGENT_DAYS = 182;
export const BACKUP_SNOOZE_DAYS = 7;
/** Shorter than the ordinary snooze on purpose — see the note above. */
export const BACKUP_URGENT_SNOOZE_DAYS = 2;

/**
 * A stored timestamp, or null — and STRICT about it.
 *
 * Date.parse is not: `Date.parse('1')` succeeds and returns the first of
 * January 2001. Older versions of the app wrote exactly that string as the
 * "banner seen" flag, so a plain parse would have read every one of those users
 * as having been asked for twenty-five years and shown them the alarm on their
 * next launch — with a sentence saying they had used the app for 300 months.
 *
 * Every value this module reads is written by the app as toISOString(), so
 * requiring that shape costs nothing and rejects the rest.
 */
function parseStamp(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

export type BackupLevel = 'never' | 'urgent' | 'stale' | 'recent';

export interface BackupAge {
  level: BackupLevel;
  /**
   * Whole days the warning is counting.
   *
   * Days since the last backup — or, when there has never been one, days since
   * the app first asked. Null when neither is known.
   */
  days: number | null;
  /** The parsed timestamp, for showing the date. Null when never or unreadable. */
  at: number | null;
  /** True when no backup has ever been made, whatever the level says. The
   *  urgent wording differs: "six months old" and "never, in six months of
   *  using this" are not the same sentence. */
  neverBackedUp: boolean;
}

/**
 * How old the last backup is.
 *
 * An unreadable stored value counts as 'never' rather than as recent: the
 * failure a user must not be told about is the one where the app quietly
 * believes they are safe.
 */
export function backupAge(
  lastBackup: string | null,
  now: number,
  /** When the app first asked for a backup. Only consulted when there has never
   *  been one — see the note at the top. */
  firstAsked: string | null = null,
): BackupAge {
  const at = parseStamp(lastBackup);

  if (at === null) {
    const asked = parseStamp(firstAsked);
    const askedDays = asked === null ? null : Math.floor((now - asked) / DAY_MS);
    const level: BackupLevel =
      askedDays !== null && askedDays >= BACKUP_URGENT_DAYS ? 'urgent' : 'never';
    return { level, days: askedDays, at: null, neverBackedUp: true };
  }

  const days = Math.floor((now - at) / DAY_MS);
  const level: BackupLevel =
    days >= BACKUP_URGENT_DAYS ? 'urgent' : days >= BACKUP_STALE_DAYS ? 'stale' : 'recent';
  return { level, days, at, neverBackedUp: false };
}

/**
 * Whether to show the reminder now.
 *
 * `hasData` comes first: an empty app has nothing to lose, and a reminder there
 * is pure noise on someone's first minute.
 */
export function shouldRemind(
  age: BackupAge,
  dismissed: string | null,
  now: number,
  hasData: boolean,
): boolean {
  if (!hasData) return false;
  if (age.level === 'recent') return false;

  const at = parseStamp(dismissed);
  if (at !== null) {
    const snoozeDays = age.level === 'urgent' ? BACKUP_URGENT_SNOOZE_DAYS : BACKUP_SNOOZE_DAYS;
    if (now - at < snoozeDays * DAY_MS) return false;
  }
  return true;
}
