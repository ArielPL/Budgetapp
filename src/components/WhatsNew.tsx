import { useRef } from 'react';
import { useLang, type Lang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { CHANGELOG } from '../changelog';

const DATE_LOCALE: Record<Lang, string> = { sv: 'sv-SE', en: 'en-US', es: 'es-ES' };

// "What's new" — a read-only panel listing releases newest-first. Reuses the
// theme-panel shell (positioning, backdrop, mobile bottom-sheet, focus trap).
export const WhatsNew = ({ onClose }: { onClose: () => void }) => {
  const { lang, t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, true, onClose);

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(DATE_LOCALE[lang], { year: 'numeric', month: 'short', day: 'numeric' })
      .format(new Date(iso));

  return (
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div
        className="theme-panel whatsnew-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        ref={ref}
      >
        <div className="theme-panel-head">
          <h2 className="theme-panel-title" id="whatsnew-title">🎉 {t.whatsNew}</h2>
          <button className="theme-panel-close" onClick={onClose} aria-label={t.themeClose}>✕</button>
        </div>
        <div className="theme-panel-body whatsnew-body">
          {CHANGELOG.map((rel, i) => (
            <section className="whatsnew-release" key={rel.version}>
              <div className="whatsnew-release-head">
                <span className="whatsnew-version">v{rel.version}</span>
                {i === 0 && <span className="whatsnew-latest">{t.whatsNewLatest}</span>}
                <span className="whatsnew-date">{fmtDate(rel.date)}</span>
              </div>
              <h3 className="whatsnew-release-title">{rel.title[lang]}</h3>
              <ul className="whatsnew-items">
                {rel.items[lang].map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
};
