import { useLang } from '../i18n';

interface Props {
  onExport: () => void;
  onDismiss: () => void;
}

export const BackupBanner = ({ onExport, onDismiss }: Props) => {
  const { t } = useLang();
  return (
    <div className="backup-banner" role="status">
      <span className="backup-banner-icon">🛟</span>
      <span className="backup-banner-text">{t.backupReminder}</span>
      <button className="backup-banner-export" onClick={onExport}>
        {t.backupReminderExport}
      </button>
      <button className="backup-banner-dismiss" onClick={onDismiss} title={t.backupReminderDismiss} aria-label={t.backupReminderDismiss}>
        ×
      </button>
    </div>
  );
};
