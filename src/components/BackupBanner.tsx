import { useEffect } from 'react';
import { useLang } from '../i18n';
import { appStorage } from '../storage';
import { migrateSeenMarker, type BackupLevel } from '../backupAge';
import { safeSetItem } from '../storageWrite';

interface Props {
  /** How late the backup is. 'urgent' gets a different message and a different
   *  colour — not the same sentence shouted. */
  level: BackupLevel;
  /** Months the warning is counting: since the last backup, or since the app
   *  first asked when there has never been one. */
  months: number;
  /** Changes the urgent wording. "Six months old" and "never, in six months of
   *  using this" are not the same sentence. */
  neverBackedUp: boolean;
  onExport: () => void;
  onDismiss: () => void;
}

/** Stores the DATE the banner first appeared, not a flag.
 *
 *  It is the only clock the escalation has for someone who has never exported:
 *  with no backup there is nothing to age. Values written by older versions are
 *  the string '1', which does not parse as a date — those users simply do not
 *  escalate until they make their first backup, which is the safe way to be
 *  wrong. */
const SEEN_KEY = 'budget_backup_banner_seen';

export const BackupBanner = ({ level, months, neverBackedUp, onExport, onDismiss }: Props) => {
  const { t } = useLang();
  // Full banner the very first time; a slim one-liner on every later reminder
  // so it stops competing with what the user is actually doing.
  const stored = appStorage.getItem(SEEN_KEY);
  const seen = !!stored;

  // Written in an EFFECT, not during render: a render may be discarded or run
  // twice, and this value is the clock the six-month escalation counts from.
  // safeSetItem because a refused write here must not throw out of a banner.
  useEffect(() => {
    const next = migrateSeenMarker(stored, Date.now());
    if (next !== null) safeSetItem(appStorage, SEEN_KEY, next);
  }, [stored]);

  const urgent = level === 'urgent';
  // The urgent one is never compact. Six months in, the quiet line has been
  // dismissed a dozen times without being read — saying it again more quietly
  // would be the one thing that certainly does not work.
  const compact = seen && !urgent;

  return (
    <div
      className={`backup-banner${compact ? ' backup-banner-compact' : ''}${urgent ? ' backup-banner-urgent' : ''}`}
      role={urgent ? 'alert' : 'status'}
    >
      <span className="backup-banner-icon">{urgent ? '⚠️' : '🛟'}</span>
      <span className="backup-banner-text">
        {urgent
          ? (neverBackedUp ? t.backupNeverUrgent(months) : t.backupUrgent(months))
          : compact ? t.backupReminderShort : t.backupReminder}
      </span>
      <button className="backup-banner-export" onClick={onExport}>
        {t.backupReminderExport}
      </button>
      <button className="backup-banner-dismiss" onClick={onDismiss} title={t.backupReminderDismiss} aria-label={t.backupReminderDismiss}>
        ×
      </button>
    </div>
  );
};
