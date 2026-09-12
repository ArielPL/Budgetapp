import { useLang } from '../i18n';
import { appStorage } from '../storage';

interface Props {
  onExport: () => void;
  onDismiss: () => void;
}

const SEEN_KEY = 'budget_backup_banner_seen';

export const BackupBanner = ({ onExport, onDismiss }: Props) => {
  const { t } = useLang();
  // Full banner the very first time; a slim one-liner on every later reminder
  // so it stops competing with what the user is actually doing.
  const compact = !!appStorage.getItem(SEEN_KEY);
  if (!compact) appStorage.setItem(SEEN_KEY, '1');

  return (
    <div className={`backup-banner${compact ? ' backup-banner-compact' : ''}`} role="status">
      <span className="backup-banner-icon">🛟</span>
      <span className="backup-banner-text">
        {compact ? t.backupReminderShort : t.backupReminder}
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
