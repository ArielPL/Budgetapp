// ── Guide — "Get started", the whole app part by part ──────────────────────
//
// Opened from a row at the top of the Budget tab (until hidden) and from the
// first item in the menu, which stays. One section per part of the app, each
// folded so the list of parts is the table of contents; the first is open,
// because it is where a new user starts.
//
// Portals to document.body for the reason FollowUpHelp gives: inside a tab, a
// finished entrance animation leaves a transform that would trap a fixed
// dialog in the tab's box.

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { guideFor } from '../guide';

interface Props {
  onClose: () => void;
}

const isStep = (line: string) => /^\d+\.\s/.test(line);

export const Guide = ({ onClose }: Props) => {
  const { lang } = useLang();
  const g = guideFor(lang);
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, true, onClose);

  return createPortal(
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div
        className="theme-panel welcome-modal guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        tabIndex={-1}
        ref={panel}
      >
        <div className="welcome-body-wrap">
          <div className="welcome-emoji" aria-hidden="true">📖</div>
          <h2 className="welcome-title" id="guide-title">{g.title}</h2>
          <p className="guide-intro">{g.intro}</p>
          <div className="guide-sections">
            {g.sections.map((s, i) => (
              <details className="guide-section" key={i} open={i === 0}>
                <summary className="guide-summary">
                  <span className="guide-summary-emoji" aria-hidden="true">{s.emoji}</span>
                  <span className="guide-summary-title">{s.title}</span>
                </summary>
                <div className="welcome-letter guide-body">
                  {s.body.map((line, j) => {
                    if (line.startsWith('## ')) return <h3 className="privacy-heading" key={j}>{line.slice(3)}</h3>;
                    if (isStep(line)) return <p className="help-step" key={j}>{line}</p>;
                    if (line.startsWith('💡 ')) return <p className="guide-tip" key={j}>{line}</p>;
                    return <p key={j}>{line}</p>;
                  })}
                </div>
              </details>
            ))}
          </div>
          <button className="welcome-start-btn" onClick={onClose}>{g.close}</button>
        </div>
      </div>
    </>,
    document.body,
  );
};
