import { useState } from 'react';
import { useLang } from '../i18n';
import {
  PALETTE_ORDER,
  PALETTES,
  OVERRIDE_FIELDS,
  baseVars,
  type PaletteId,
  type Mode,
  type ThemeVars,
} from '../themes';

// A row of accent swatches offered as quick picks (plus a native color input
// for a fully custom accent). Tuned to read well on both dark and light bases.
const ACCENT_SWATCHES = [
  '#a78bfa', // sorbet lavender
  '#8b5cf6', // violet
  '#38bdf8', // sky
  '#2dd4bf', // teal
  '#5ec98a', // green
  '#fb7185', // rose
  '#fbbf24', // amber
  '#f472b6', // pink
];

interface Props {
  palette: PaletteId;
  mode: Mode;
  custom: ThemeVars;
  /** Current accent value (resolved --accent-brand for the active theme). */
  accent: string;
  onSelectPalette: (palette: Exclude<PaletteId, 'custom'>) => void;
  onSetMode: (mode: Mode) => void;
  onSetAccent: (value: string) => void;
  onOverride: (cssVar: string, value: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export const ThemePanel = ({
  palette,
  mode,
  custom,
  accent,
  onSelectPalette,
  onSetMode,
  onSetAccent,
  onOverride,
  onReset,
  onClose,
}: Props) => {
  const { t } = useLang();
  const [advancedOpen, setAdvancedOpen] = useState(palette === 'custom');

  const paletteName = (id: Exclude<PaletteId, 'custom'>): string => t.paletteNames[id];

  // The value shown in each advanced color input: the custom override if set,
  // else the value from the active base (palette+mode; Sorbet+mode for custom).
  const fieldValue = (cssVar: string): string => {
    if (custom[cssVar]) return custom[cssVar];
    return baseVars(palette, mode)[cssVar] ?? '#000000';
  };

  return (
    <>
      <div className="theme-backdrop" onClick={onClose} />
      <div className="theme-panel" role="dialog" aria-modal="true" aria-label={t.themeTitle}>
        <div className="theme-panel-head">
          <h2 className="theme-panel-title">{t.themeTitle}</h2>
          <button
            className="theme-panel-close"
            onClick={onClose}
            aria-label={t.themeClose}
            title={t.themeClose}
          >
            ×
          </button>
        </div>

        <div className="theme-panel-body">
          {/* ── Presets (palette family + light/dark mode) ── */}
          <section className="theme-section">
            <div className="theme-section-label">{t.presets}</div>
            <div className="theme-preset-grid">
              {PALETTE_ORDER.map((id) => {
                // Preview each pill in the currently selected mode.
                const p = PALETTES[id][mode];
                const active = palette === id;
                return (
                  <button
                    key={id}
                    className={`theme-preset-pill${active ? ' theme-preset-active' : ''}`}
                    onClick={() => onSelectPalette(id)}
                    aria-pressed={active}
                  >
                    <span className="theme-preset-swatches" aria-hidden="true">
                      <span style={{ background: p['--bg'] }} />
                      <span style={{ background: p['--surface'] }} />
                      <span style={{ background: p['--accent-brand'] }} />
                      <span style={{ background: p['--income-color'] }} />
                    </span>
                    <span className="theme-preset-name">{paletteName(id)}</span>
                  </button>
                );
              })}
              {palette === 'custom' && (
                <span className="theme-preset-pill theme-preset-active theme-preset-custom">
                  <span className="theme-preset-name">{t.paletteNames.custom}</span>
                </span>
              )}
            </div>

            {/* Light / Dark mode toggle — applies to whichever family is active */}
            <div className="theme-mode-toggle utils-seg">
              <button
                className={`seg-btn${mode === 'light' ? ' seg-active' : ''}`}
                onClick={() => onSetMode('light')}
                aria-pressed={mode === 'light'}
              >
                ☀️ {t.themeLight}
              </button>
              <button
                className={`seg-btn${mode === 'dark' ? ' seg-active' : ''}`}
                onClick={() => onSetMode('dark')}
                aria-pressed={mode === 'dark'}
              >
                🌙 {t.themeDark}
              </button>
            </div>
          </section>

          {/* ── Accent ── */}
          <section className="theme-section">
            <div className="theme-section-label">{t.accent}</div>
            <div className="theme-accent-row">
              {ACCENT_SWATCHES.map((c) => (
                <button
                  key={c}
                  className={`theme-accent-swatch${accent.toLowerCase() === c.toLowerCase() ? ' theme-accent-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => onSetAccent(c)}
                  aria-label={c}
                  title={c}
                />
              ))}
              <label className="theme-accent-custom" title={t.accentCustom}>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => onSetAccent(e.target.value)}
                  aria-label={t.accentCustom}
                />
                <span aria-hidden="true">🎨</span>
              </label>
            </div>
          </section>

          {/* ── Advanced — override every color ── */}
          <section className="theme-section">
            <button
              className="theme-advanced-toggle"
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
            >
              <span className={`theme-advanced-caret${advancedOpen ? ' open' : ''}`}>▸</span>
              {t.advancedOverride}
            </button>
            {advancedOpen && (
              <div className="theme-override-grid">
                {OVERRIDE_FIELDS.map((f) => (
                  <label key={f.cssVar} className="theme-override-field">
                    <span className="theme-override-label">{t[f.labelKey]}</span>
                    <input
                      type="color"
                      value={fieldValue(f.cssVar)}
                      onChange={(e) => onOverride(f.cssVar, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* ── Reset ── */}
          <button className="theme-reset-btn" onClick={onReset}>
            {t.resetToPreset}
          </button>
        </div>
      </div>
    </>
  );
};
