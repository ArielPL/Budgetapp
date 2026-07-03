import { useState, useRef } from 'react';
import { useLang } from '../i18n';
import { useModalFocus } from '../useModalFocus';
import type { AuthApi } from '../useAuth';

// Account & cross-device sync panel. Same visual language as ThemePanel
// (backdrop + centered card / bottom sheet on mobile, useModalFocus for the
// focus trap). Signed out → sign-in form; signed in → email + sign out.
// Signing out never clears localStorage — the app keeps working local-only.

interface Props {
  auth: AuthApi;
  onClose: () => void;
}

type Method = 'magic' | 'password';
type PwMode = 'signin' | 'signup';

export const AccountPanel = ({ auth, onClose }: Props) => {
  const { t } = useLang();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true, onClose);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<Method>('magic');
  const [pwMode, setPwMode] = useState<PwMode>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signedIn = auth.user !== null;

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  // Supabase's shared email-send quota returns 429 with a *_rate_limit code.
  // Give that case specific, actionable guidance instead of a generic error.
  const isRateLimit = (code: string | null) => !!code && code.includes('rate_limit');

  const handleMagicLink = async () => {
    resetMessages();
    if (!email.trim()) { setError(t.accountErrorEmailRequired); return; }
    setBusy(true);
    const { error, code } = await auth.signInWithMagicLink(email.trim());
    setBusy(false);
    if (error) setError(isRateLimit(code) ? t.accountErrorRateLimited : t.accountErrorGeneric);
    else setNotice(t.accountMagicLinkSent);
  };

  const handlePassword = async () => {
    resetMessages();
    if (!email.trim()) { setError(t.accountErrorEmailRequired); return; }
    if (!password) { setError(t.accountErrorPasswordRequired); return; }
    setBusy(true);
    const fn = pwMode === 'signin' ? auth.signInWithPassword : auth.signUpWithPassword;
    const { error, code } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      // Rate-limited (sign-up confirmation emails share the quota) gets the
      // specific message; otherwise surface the provider's message so
      // wrong-password / invalid-email read clearly, with a localized fallback.
      setError(isRateLimit(code) ? t.accountErrorRateLimited : (error || t.accountErrorGeneric));
    } else if (pwMode === 'signup') {
      setNotice(t.accountCheckEmailConfirm);
    }
    // On successful sign-in the panel stays open and re-renders into the
    // signed-in state via auth.user changing.
  };

  const handleSignOut = async () => {
    resetMessages();
    setBusy(true);
    await auth.signOut();
    setBusy(false);
  };

  return (
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div
        className="theme-panel account-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.accountTitle}
        ref={panelRef}
      >
        <div className="theme-panel-head">
          <h2 className="theme-panel-title">{t.accountTitle}</h2>
          <button
            className="theme-panel-close"
            onClick={onClose}
            aria-label={t.accountClose}
            title={t.accountClose}
          >
            ×
          </button>
        </div>

        <div className="theme-panel-body">
          {signedIn ? (
            <section className="theme-section">
              <div className="account-signed-in">
                <span className="account-signed-label">{t.accountSignedInAs}</span>
                <span className="account-email">{auth.user?.email}</span>
              </div>
              <p className="account-note">{t.accountSyncingNote}</p>
              <button
                className="theme-reset-btn"
                onClick={handleSignOut}
                disabled={busy}
              >
                {t.accountSignOut}
              </button>
            </section>
          ) : (
            <section className="theme-section">
              <p className="account-intro">{t.accountIntro}</p>

              <label className="account-field">
                <span className="account-field-label">{t.accountEmail}</span>
                <input
                  type="email"
                  className="account-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.accountEmailPlaceholder}
                  autoComplete="email"
                  inputMode="email"
                />
              </label>

              {method === 'password' && (
                <>
                  <label className="account-field">
                    <span className="account-field-label">{t.accountPassword}</span>
                    <input
                      type="password"
                      className="account-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t.accountPasswordPlaceholder}
                      autoComplete={pwMode === 'signin' ? 'current-password' : 'new-password'}
                    />
                  </label>
                  <div className="account-pwmode utils-seg">
                    <button
                      className={`seg-btn${pwMode === 'signin' ? ' seg-active' : ''}`}
                      onClick={() => { setPwMode('signin'); resetMessages(); }}
                      aria-pressed={pwMode === 'signin'}
                    >
                      {t.accountSignIn}
                    </button>
                    <button
                      className={`seg-btn${pwMode === 'signup' ? ' seg-active' : ''}`}
                      onClick={() => { setPwMode('signup'); resetMessages(); }}
                      aria-pressed={pwMode === 'signup'}
                    >
                      {t.accountSignUp}
                    </button>
                  </div>
                </>
              )}

              {error && <div className="account-error" role="alert">{error}</div>}
              {notice && <div className="account-notice">{notice}</div>}

              {method === 'magic' ? (
                <button
                  className="account-primary-btn"
                  onClick={handleMagicLink}
                  disabled={busy}
                >
                  {busy ? t.accountSending : t.accountSendMagicLink}
                </button>
              ) : (
                <button
                  className="account-primary-btn"
                  onClick={handlePassword}
                  disabled={busy}
                >
                  {busy ? t.accountSending : (pwMode === 'signin' ? t.accountSignIn : t.accountSignUp)}
                </button>
              )}

              <button
                className="account-toggle-link"
                onClick={() => {
                  setMethod((m) => (m === 'magic' ? 'password' : 'magic'));
                  resetMessages();
                }}
              >
                {method === 'magic' ? t.accountUsePassword : t.accountUseMagicLink}
              </button>
            </section>
          )}
        </div>
      </div>
    </>
  );
};
