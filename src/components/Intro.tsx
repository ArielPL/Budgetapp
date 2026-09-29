// ── Intro — the first sixty seconds ────────────────────────────────────────
//
// What used to open the app was the author's letter: why he built it, what it
// is for, how he used to do this on paper. It is the best writing in the app.
// It is also four screen-heights at 320px before its button, and a stranger
// deciding whether to keep a budget app does not read four screens.
//
// Three cards instead, each answering one question a new user actually has:
// where does my data go, what do I do first, what do I get out of it. The
// letter is not deleted — it moves to "About the app", for the people who want
// it, which is where a letter belongs.
//
// Skippable from the first card. Anyone who skips has decided, and asking again
// on the next launch would only say the app was not listening.

import { usesNativeStorage } from '../storage';
import { useRef, useState } from 'react';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';

interface Props {
  /** Called on both "Get started" and "Skip" — from the app's point of view
   *  they are the same event: the user is done being introduced. */
  onDone: () => void;
}

export const Intro = ({ onDone }: Props) => {
  const { t } = useLang();
  // In the iOS and Android apps the first page says what is true there: the
  // phone's own backup may carry the budget. The web page's promise holds for
  // the web, where nothing but the user's own export leaves the browser.
  const pages = usesNativeStorage()
    ? t.introPages.map((p, i) => (i === 0
      ? { ...p, title: t.introPrivacyNativeTitle, body: t.introPrivacyNativeBody } : p))
    : t.introPages;
  const [page, setPage] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  // Review 2026-09-18, F7: this claimed aria-modal but had no focus trap, so the
  // first Tab landed on "Previous month" behind the backdrop — a dialog the
  // keyboard could walk straight out of while the screen said it could not.
  //
  // Escape is wired to the same thing as Skip. It is not destructive: the
  // letter the intro replaced is still under "About the app", so a stray
  // Escape costs nothing, and behaving like every other dialog in the app is
  // worth more than protecting three cards from being dismissed.
  useModalFocus(panel, true, onDone);
  const last = page === pages.length - 1;

  return (
    <>
      {/* No click-through dismiss: this is three taps long, and a backdrop that
          closes it would mostly close it by accident. */}
      <div className="theme-backdrop intro-backdrop" />
      <div
        className="theme-panel intro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        tabIndex={-1}
        ref={panel}
      >
        <button className="intro-skip" onClick={onDone}>{t.introSkip}</button>

        {/* Every page is laid out, stacked in one grid cell, and only the
            current one is visible — so the card is always as tall as the
            longest page, in whatever language and width. Centred on a phone
            (2026-09-29), a card that changed height moved "Next" under the
            thumb between taps, which is how a double tap skips a page nobody
            read. The hidden pages are visibility: hidden, so they are not
            read out either. */}
        <div className="intro-stack">
          {pages.map((p, i) => (
            <div key={i} className={`intro-body${i === page ? '' : ' is-off'}`} aria-hidden={i === page ? undefined : true}>
              <div className="intro-emoji" aria-hidden="true">{p.emoji}</div>
              <h2 className="intro-title" id={i === page ? 'intro-title' : undefined}>{p.title}</h2>
              <p className="intro-text">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="intro-foot">
          <div className="intro-dots" role="status" aria-live="polite">
            {/* The dots are decoration; the sentence underneath is what a
                screen reader gets, because "three dots, one filled" is not a
                position. */}
            <span className="intro-dots-visual" aria-hidden="true">
              {pages.map((_, i) => (
                <span key={i} className={`intro-dot${i === page ? ' is-on' : ''}`} />
              ))}
            </span>
            <span className="sr-only">{t.introStep(page + 1, pages.length)}</span>
          </div>

          <button
            className="intro-next"
            onClick={() => (last ? onDone() : setPage(p => p + 1))}
          >
            {last ? t.introDone : t.introNext}
          </button>
        </div>
      </div>
    </>
  );
};
