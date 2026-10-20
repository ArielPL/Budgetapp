// ── Guide — "Get started", the whole app part by part ──────────────────────
//
// Opened from a row at the top of the Budget tab (until hidden) and from the
// first item in the menu, which stays. One section per part of the app, each
// folded so the list of parts is the table of contents; the first is open,
// because it is where a new user starts.
//
// "Show me" (Ariel, 2026-10-20): each section has buttons that open the right
// tab and light up the real control (Spotlight). The guide does not close for
// it. On a wide screen it moves to a panel at the side; on a phone it shrinks
// to a bar above the tabs, and a tap on the bar brings it back exactly where
// the reader was — it stays mounted throughout, so the open sections and the
// scroll position are never lost.
//
// Portals to document.body for the reason FollowUpHelp gives: inside a tab, a
// finished entrance animation leaves a transform that would trap a fixed
// dialog in the tab's box.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import { useStayLive } from '../useStayLive';
import { guideFor } from '../guide';
import { SECTION_SPOTS, SPOT_TARGETS, spotSelector, type SpotId, type SpotTarget } from '../guide/spots';
import { Spotlight } from './Spotlight';

interface Props {
  onClose: () => void;
  /** Open the spot's tab, and the menu if it lives there. null: back to the
   *  guide — close the menu again. */
  onShow: (target: SpotTarget | null) => void;
}

type Mode = 'modal' | 'bar' | 'side';

/** Wide enough to keep the guide beside the app instead of over it. */
const SIDE_QUERY = '(min-width: 1180px)';

const isStep = (line: string) => /^\d+\.\s/.test(line);

export const Guide = ({ onClose, onShow }: Props) => {
  const { lang } = useLang();
  const g = guideFor(lang);
  const panel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('modal');
  const [spot, setSpot] = useState<SpotId | null>(null);
  // The bar keeps naming the last part shown after its light goes out.
  const [lastSpot, setLastSpot] = useState<SpotId | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useModalFocus(panel, mode === 'modal', onClose);
  // Beside the app, or shrunk to the bar, the guide stays usable when "Show
  // me" opens the menu (which makes everything outside itself inert).
  useStayLive(panel, mode === 'side');
  useStayLive(bar, mode === 'bar');

  // Beside the app, the app makes room for the panel instead of hiding under it.
  useEffect(() => {
    document.documentElement.classList.toggle('guide-side', mode === 'side');
    return () => document.documentElement.classList.remove('guide-side');
  }, [mode]);

  const show = (id: SpotId, button: HTMLElement) => {
    const side = !!window.matchMedia?.(SIDE_QUERY).matches;
    setMode(side ? 'side' : 'bar');
    setSpot(id);
    setLastSpot(id);
    onShow(SPOT_TARGETS[id]);
    // The narrower panel reflows; keep the reader's place in view.
    if (side) requestAnimationFrame(() => button.scrollIntoView?.({ block: 'nearest' }));
  };
  const backToGuide = () => {
    setSpot(null);
    setMode('modal');
    onShow(null);
  };

  return createPortal(
    <>
      {mode === 'modal' && <div className="theme-backdrop" onClick={onClose} />}
      <div
        className={`theme-panel welcome-modal guide-modal${mode === 'bar' ? ' is-away' : ''}${mode === 'side' ? ' is-side' : ''}`}
        role="dialog"
        aria-modal={mode === 'modal'}
        aria-hidden={mode === 'bar' || undefined}
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
                  {(SECTION_SPOTS[s.emoji]?.length ?? 0) > 0 && (
                    <div className="guide-spots">
                      <span className="guide-spots-label">{g.showMe}</span>
                      {SECTION_SPOTS[s.emoji].map(id => (
                        <button key={id} type="button"
                          className={`guide-spot-btn${spot === id ? ' is-on' : ''}`}
                          onClick={e => show(id, e.currentTarget)}>
                          <span aria-hidden="true">👉</span> {g.spots[id].label}
                        </button>
                      ))}
                    </div>
                  )}
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

      {mode === 'bar' && (
        <div className="guide-bar" ref={bar}>
          <button type="button" className="guide-bar-open" onClick={backToGuide}>
            <span className="guide-bar-icon" aria-hidden="true">📖</span>
            <span className="guide-bar-text">
              <strong>{lastSpot ? g.spots[lastSpot].label : g.title}</strong>
              <small>{g.barHint}</small>
            </span>
            <span className="guide-bar-chevron" aria-hidden="true">▴</span>
          </button>
          <button type="button" className="guide-bar-close" onClick={onClose} aria-label={g.close} title={g.close}>✕</button>
        </div>
      )}

      {spot && (
        <Spotlight
          key={spot}
          selector={spotSelector(spot)}
          text={g.spots[spot].text}
          notHere={g.notHere}
          keep=".guide-bar, .guide-modal.is-side"
          onDismiss={() => setSpot(null)}
          actions={mode === 'bar'
            ? [{ label: g.backToGuide, onClick: backToGuide }, { label: g.ok, onClick: () => setSpot(null), primary: true }]
            : [{ label: g.ok, onClick: () => setSpot(null), primary: true }]}
        />
      )}
    </>,
    document.body,
  );
};
