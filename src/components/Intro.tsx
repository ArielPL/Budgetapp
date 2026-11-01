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
//
// Before the cards, a new user picks the currency (review 2026-10-17, P1): the
// one thing here that cannot be skipped, because a guessed one was wrong for
// whole countries. The language is offered on the same step, already set from
// the phone. Each symbol says what it stands for — "$ (dollar, peso …)" —
// since the symbol is all the app ever shows and nothing is converted.

import { usesNativeStorage } from '../storage';
import { useRef, useState } from 'react';
import { useLang, isLang, LANG_CHOICES, CURRENCIES, type Currency } from '../i18n';
import { useModalFocus } from '../useModalFocus';

interface Props {
  /** Called on both "Get started" and "Skip" — from the app's point of view
   *  they are the same event: the user is done being introduced. */
  onDone: () => void;
  /** Ask for the currency first: a new install, with none stored yet. */
  askCurrency?: boolean;
  onCurrency?: (currency: Currency) => void;
}

export const Intro = ({ onDone, askCurrency = false, onCurrency }: Props) => {
  const { t, lang, setLang } = useLang();
  const [setup, setSetup] = useState(askCurrency);
  const [picked, setPicked] = useState<Currency | null>(null);
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
  // ...except on the currency step, which has no Skip either: there is no
  // right answer to leave behind for the user there.
  useModalFocus(panel, true, setup ? () => {} : onDone);
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
        {setup ? (
          <div className="intro-body intro-setup">
            <div className="intro-emoji" aria-hidden="true">🌍</div>
            <h2 className="intro-title" id="intro-title">{t.introSetupTitle}</h2>
            <p className="intro-text">{t.introSetupBody}</p>

            <label className="intro-setup-label" htmlFor="intro-lang">{t.language}</label>
            <select
              id="intro-lang"
              className="label-input lang-pick intro-lang"
              value={lang}
              onChange={e => { if (isLang(e.target.value)) setLang(e.target.value); }}
            >
              {LANG_CHOICES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>

            <span className="intro-setup-label" id="intro-currency-label">{t.currency}</span>
            <div className="intro-currencies" role="group" aria-labelledby="intro-currency-label">
              {(Object.keys(CURRENCIES) as Currency[]).map(c => (
                <button
                  key={c}
                  type="button"
                  className={`intro-currency${picked === c ? ' is-on' : ''}`}
                  aria-pressed={picked === c}
                  onClick={() => { setPicked(c); onCurrency?.(c); }}
                >
                  <span className="intro-currency-symbol">{CURRENCIES[c].symbol}</span>
                  <span className="intro-currency-name">({t.currencyNames[c]})</span>
                </button>
              ))}
            </div>
            <p className="intro-currency-hint">{t.currencyHint}</p>
          </div>
        ) : (
          <>
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
          </>
        )}

        <div className="intro-foot">
          {setup ? (
            <span className="intro-currency-need" role="status" aria-live="polite">
              {picked ? '' : t.introPickCurrency}
            </span>
          ) : (
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
          )}

          {setup ? (
            <button className="intro-next" disabled={!picked} onClick={() => setSetup(false)}>
              {t.introNext}
            </button>
          ) : (
            <button
              className="intro-next"
              onClick={() => (last ? onDone() : setPage(p => p + 1))}
            >
              {last ? t.introDone : t.introNext}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
