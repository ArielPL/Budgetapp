// ── FollowUpHelp — the guide to the tab, where the tab is ──────────────────
//
// Help that lives in a settings menu is help nobody reads. This opens from the
// tab it explains, next to the controls it is explaining.
//
// It PORTALS to document.body, and that is not a style choice. `.tab-enter`
// ends on `transform: translateY(0)` — identity, invisible, and enough to make
// the tab the containing block for anything `position: fixed` inside it. The
// CSV dialog was the first thing in this app to fall into that box: its
// backdrop stopped covering the screen, its panel took the tab's width, and its
// close button came to rest under the app header where no click could reach it.
// See dialogGuard.test.ts, which holds both dialogs to the portal.
//
// The body is one array of strings per language: '## ' makes a heading, a
// leading digit makes a numbered step, everything else is a paragraph. Prose is
// edited as prose, not as thirty translation keys.

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';

interface Props {
  onClose: () => void;
}

/** "1. It reads the text on the row…" — rendered as a step rather than a
 *  paragraph, so the three-step explanation reads as three steps. */
const isStep = (line: string) => /^\d+\.\s/.test(line);

export const FollowUpHelp = ({ onClose }: Props) => {
  const { t } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, true, onClose);

  return createPortal(
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div
        className="theme-panel welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="followup-help-title"
        tabIndex={-1}
        ref={panel}
      >
        <div className="welcome-body-wrap">
          <div className="welcome-emoji" aria-hidden="true">🧾</div>
          <h2 className="welcome-title" id="followup-help-title">{t.followUpHelpTitle}</h2>
          <div className="welcome-letter">
            {t.followUpHelpBody.map((line, i) => {
              if (line.startsWith('## ')) {
                return <h3 className="privacy-heading" key={i}>{line.slice(3)}</h3>;
              }
              if (isStep(line)) {
                return <p className="help-step" key={i}>{line}</p>;
              }
              return <p key={i}>{line}</p>;
            })}
          </div>
          <button className="welcome-start-btn" onClick={onClose}>
            {t.followUpHelpClose}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};
