// ── Theme Builder ────────────────────────────────────────────────────
// A theme is a (palette family, mode) pair. Each of the four families —
// Sorbet, Ocean, Forest, Sunset — has a full `dark` and `light` var map.
// Applying a theme sets every CSS custom property inline on
// document.documentElement (:root), so switching instantly recolors the
// whole app on every tab. 'custom' is a separate palette: the user's
// per-var overrides layered on top of a base (Sorbet of the active mode).

export type PaletteId = 'sorbet' | 'ocean' | 'forest' | 'sunset' | 'custom';
export type Mode = 'dark' | 'light';

/** The complete set of CSS-var keys a palette variant defines. */
export type ThemeVars = Record<string, string>;

// ── Sorbet — dark = the original :root, light = original [data-theme=light] ──
const sorbetDark: ThemeVars = {
  '--bg': '#0f172a',
  '--surface': '#1e293b',
  '--surface2': '#243044',
  '--border': '#334155',
  '--border-strong': '#475569',
  '--text': '#e2e8f0',
  '--text-muted': '#64748b',
  '--text-dim': '#94a3b8',
  '--income-color': '#22d3ee',
  '--positive': '#22c55e',
  '--negative': '#ef4444',
  '--header-bg': 'rgba(15, 23, 42, 0.92)',
  '--accent-brand': '#a78bfa',
  '--accent-brand-strong': '#8b5cf6',
  '--tint-remaining-bg': '#18241a',
  '--tint-remaining-text': '#c0dd97',
  '--tint-income-bg': '#11201c',
  '--tint-income-text': '#9fe1cb',
  '--tint-expense-bg': '#241a17',
  '--tint-expense-text': '#f5c4b3',
  '--tint-savings-bg': '#112230',
  '--tint-savings-text': '#a5e8f5',
  '--tint-savings-prev-bg': '#1a2536',
  '--tint-savings-prev-text': '#b8c2d6',
  '--chip-bg': '#2a2540',
  '--chip-text': '#cfc6f5',
};

const sorbetLight: ThemeVars = {
  '--bg': '#fbfaff',
  '--surface': '#ffffff',
  '--surface2': '#f6f4fb',
  '--border': '#ece9f5',
  '--border-strong': '#d8d3ea',
  '--text': '#20203a',
  '--text-muted': '#9a96ad',
  '--text-dim': '#5d5972',
  '--income-color': '#0fa99a',
  '--positive': '#2f9e44',
  '--negative': '#e8590c',
  '--header-bg': 'rgba(251, 250, 255, 0.9)',
  '--accent-brand': '#8b5cf6',
  '--accent-brand-strong': '#7c3aed',
  '--tint-remaining-bg': '#eaf3de',
  '--tint-remaining-text': '#173404',
  '--tint-income-bg': '#e1f5ee',
  '--tint-income-text': '#04342c',
  '--tint-expense-bg': '#faece7',
  '--tint-expense-text': '#4a1b0c',
  '--tint-savings-bg': '#e2f4fa',
  '--tint-savings-text': '#064a59',
  '--tint-savings-prev-bg': '#f0eefb',
  '--tint-savings-prev-text': '#463a7a',
  '--chip-bg': '#eeedfe',
  '--chip-text': '#5b4bb3',
};

// ── Ocean — cool blue / teal ────────────────────────────────────────────
const oceanDark: ThemeVars = {
  '--bg': '#0a1929',
  '--surface': '#0f2438',
  '--surface2': '#163049',
  '--border': '#1e425f',
  '--border-strong': '#2d597d',
  '--text': '#e3eef7',
  '--text-muted': '#6f93ad',
  '--text-dim': '#9cb9d1',
  '--income-color': '#2dd4bf',
  '--positive': '#34d399',
  '--negative': '#fb7185',
  '--header-bg': 'rgba(10, 25, 41, 0.92)',
  '--accent-brand': '#38bdf8',
  '--accent-brand-strong': '#0ea5e9',
  '--tint-remaining-bg': '#0d2b2a',
  '--tint-remaining-text': '#7fe6d6',
  '--tint-income-bg': '#0c2a28',
  '--tint-income-text': '#86ead9',
  '--tint-expense-bg': '#2a1620',
  '--tint-expense-text': '#fcb4c0',
  '--tint-savings-bg': '#0e2638',
  '--tint-savings-text': '#9ad8f5',
  '--tint-savings-prev-bg': '#16304a',
  '--tint-savings-prev-text': '#aac4dc',
  '--chip-bg': '#163b52',
  '--chip-text': '#a5d8f0',
};

const oceanLight: ThemeVars = {
  '--bg': '#f3f9fd',
  '--surface': '#ffffff',
  '--surface2': '#e9f3fb',
  '--border': '#d4e6f3',
  '--border-strong': '#b3d2e8',
  '--text': '#0e2a40',
  '--text-muted': '#6286a1',
  '--text-dim': '#3f6688',
  '--income-color': '#0d9488',
  '--positive': '#0f9d6e',
  '--negative': '#dc4b63',
  '--header-bg': 'rgba(243, 249, 253, 0.9)',
  '--accent-brand': '#0ea5e9',
  '--accent-brand-strong': '#0284c7',
  '--tint-remaining-bg': '#dcf3ee',
  '--tint-remaining-text': '#0a3d36',
  '--tint-income-bg': '#d6f1ea',
  '--tint-income-text': '#0a3a33',
  '--tint-expense-bg': '#fbe4e8',
  '--tint-expense-text': '#5a1622',
  '--tint-savings-bg': '#dceefa',
  '--tint-savings-text': '#0a3a55',
  '--tint-savings-prev-bg': '#e8f1f9',
  '--tint-savings-prev-text': '#3a5a76',
  '--chip-bg': '#dcecf8',
  '--chip-text': '#0c5278',
};

// ── Forest — green ──────────────────────────────────────────────────────
const forestDark: ThemeVars = {
  '--bg': '#0c1a12',
  '--surface': '#12251a',
  '--surface2': '#193324',
  '--border': '#244833',
  '--border-strong': '#356147',
  '--text': '#e4f0e7',
  '--text-muted': '#6f9a7e',
  '--text-dim': '#9fc2ab',
  '--income-color': '#34d399',
  '--positive': '#4ade80',
  '--negative': '#f87171',
  '--header-bg': 'rgba(12, 26, 18, 0.92)',
  '--accent-brand': '#5ec98a',
  '--accent-brand-strong': '#3fae6c',
  '--tint-remaining-bg': '#13301f',
  '--tint-remaining-text': '#a7e6b8',
  '--tint-income-bg': '#0f2c20',
  '--tint-income-text': '#8fe3bf',
  '--tint-expense-bg': '#2c1c14',
  '--tint-expense-text': '#f6c3a8',
  '--tint-savings-bg': '#0f2a2c',
  '--tint-savings-text': '#92ddd8',
  '--tint-savings-prev-bg': '#1a3528',
  '--tint-savings-prev-text': '#b3cdba',
  '--chip-bg': '#1d3e2b',
  '--chip-text': '#aadcbb',
};

const forestLight: ThemeVars = {
  '--bg': '#f4faf5',
  '--surface': '#ffffff',
  '--surface2': '#e9f4ec',
  '--border': '#d4e8d9',
  '--border-strong': '#b4d6bd',
  '--text': '#13301f',
  '--text-muted': '#5f8a6e',
  '--text-dim': '#3d6b4d',
  '--income-color': '#0f9d6e',
  '--positive': '#1f9d4d',
  '--negative': '#dc5b4b',
  '--header-bg': 'rgba(244, 250, 245, 0.9)',
  '--accent-brand': '#16a34a',
  '--accent-brand-strong': '#15803d',
  '--tint-remaining-bg': '#dcf1e2',
  '--tint-remaining-text': '#0c3a1d',
  '--tint-income-bg': '#d6f0e2',
  '--tint-income-text': '#0a3a28',
  '--tint-expense-bg': '#fbe7df',
  '--tint-expense-text': '#5a2316',
  '--tint-savings-bg': '#daf0ee',
  '--tint-savings-text': '#0c4641',
  '--tint-savings-prev-bg': '#e7f2ea',
  '--tint-savings-prev-text': '#3d5e49',
  '--chip-bg': '#dcefe2',
  '--chip-text': '#13693a',
};

// ── Sunset — warm orange / pink ─────────────────────────────────────────
const sunsetDark: ThemeVars = {
  '--bg': '#1c1117',
  '--surface': '#2a1820',
  '--surface2': '#37212b',
  '--border': '#4d2f3b',
  '--border-strong': '#6b4252',
  '--text': '#f6e7ec',
  '--text-muted': '#b07f8f',
  '--text-dim': '#d0a4b1',
  '--income-color': '#fbbf24',
  '--positive': '#4ade80',
  '--negative': '#f43f5e',
  '--header-bg': 'rgba(28, 17, 23, 0.92)',
  '--accent-brand': '#fb7185',
  '--accent-brand-strong': '#f43f5e',
  '--tint-remaining-bg': '#2d2014',
  '--tint-remaining-text': '#f7d79a',
  '--tint-income-bg': '#2e2412',
  '--tint-income-text': '#fce29a',
  '--tint-expense-bg': '#371720',
  '--tint-expense-text': '#fbb4c1',
  '--tint-savings-bg': '#2b1c2e',
  '--tint-savings-text': '#e7b4f0',
  '--tint-savings-prev-bg': '#3a232f',
  '--tint-savings-prev-text': '#d6b3c2',
  '--chip-bg': '#412531',
  '--chip-text': '#f3b9c7',
};

const sunsetLight: ThemeVars = {
  '--bg': '#fdf6f3',
  '--surface': '#ffffff',
  '--surface2': '#fbecea',
  '--border': '#f3dcd9',
  '--border-strong': '#e6bdba',
  '--text': '#3a1a22',
  '--text-muted': '#a87482',
  '--text-dim': '#7d4a58',
  '--income-color': '#d97706',
  '--positive': '#1f9d4d',
  '--negative': '#e11d48',
  '--header-bg': 'rgba(253, 246, 243, 0.9)',
  '--accent-brand': '#f43f5e',
  '--accent-brand-strong': '#e11d48',
  '--tint-remaining-bg': '#fcecd6',
  '--tint-remaining-text': '#5a3a0c',
  '--tint-income-bg': '#fcedd2',
  '--tint-income-text': '#5a400a',
  '--tint-expense-bg': '#fbe0e6',
  '--tint-expense-text': '#5e1226',
  '--tint-savings-bg': '#f6e4f5',
  '--tint-savings-text': '#5a1a5e',
  '--tint-savings-prev-bg': '#f8e6ec',
  '--tint-savings-prev-text': '#6e3a4a',
  '--chip-bg': '#fbe2e9',
  '--chip-text': '#b01b3f',
};

interface PaletteFamily {
  dark: ThemeVars;
  light: ThemeVars;
}

export const PALETTES: Record<Exclude<PaletteId, 'custom'>, PaletteFamily> = {
  sorbet: { dark: sorbetDark, light: sorbetLight },
  ocean: { dark: oceanDark, light: oceanLight },
  forest: { dark: forestDark, light: forestLight },
  sunset: { dark: sunsetDark, light: sunsetLight },
};

/** Order palettes are shown as pills in the Theme panel. */
export const PALETTE_ORDER: Array<Exclude<PaletteId, 'custom'>> = [
  'sorbet',
  'ocean',
  'forest',
  'sunset',
];

// ── Advanced "override every color" mapping ─────────────────────────────
// Friendly labels in the UI map to a small set of real CSS vars. Editing one
// flips the active palette to 'custom' and stores the override map.
export interface OverrideField {
  labelKey:
    | 'colorBackground'
    | 'colorCards'
    | 'colorIncome'
    | 'colorExpenses'
    | 'colorSavings'
    | 'colorAccent';
  cssVar: string;
}

export const OVERRIDE_FIELDS: OverrideField[] = [
  { labelKey: 'colorBackground', cssVar: '--bg' },
  { labelKey: 'colorCards', cssVar: '--surface' },
  { labelKey: 'colorIncome', cssVar: '--income-color' },
  { labelKey: 'colorExpenses', cssVar: '--negative' },
  { labelKey: 'colorSavings', cssVar: '--tint-savings-text' },
  { labelKey: 'colorAccent', cssVar: '--accent-brand' },
];

// localStorage keys (current scheme)
export const LS_PALETTE = 'budget_theme_palette'; // sorbet|ocean|forest|sunset|custom
export const LS_MODE = 'budget_theme_mode';       // light|dark
export const LS_CUSTOM = 'budget_theme_custom';   // JSON override map (custom only)

// Legacy keys we migrate from
const LS_LEGACY_PRESET = 'budget_theme_preset';   // v1: sorbet|sorbetLight|ocean|forest|sunset|custom
const LS_LEGACY_THEME = 'budget_theme';           // v0: light|dark toggle

const VALID_PALETTES: PaletteId[] = ['sorbet', 'ocean', 'forest', 'sunset', 'custom'];

export interface ThemeState {
  palette: PaletteId;
  mode: Mode;
  custom: ThemeVars;
}

/** The base var map for a (palette, mode); custom uses Sorbet of the mode. */
export function baseVars(palette: PaletteId, mode: Mode): ThemeVars {
  if (palette === 'custom') return { ...PALETTES.sorbet[mode] };
  return { ...PALETTES[palette][mode] };
}

/** Full var map: base palette/mode with any custom overrides layered on top. */
export function resolveVars(state: ThemeState): ThemeVars {
  if (state.palette === 'custom') {
    return { ...PALETTES.sorbet[state.mode], ...state.custom };
  }
  return { ...PALETTES[state.palette][state.mode] };
}

/** Apply a full var map inline on :root, and set data-theme for chart tints. */
export function applyVars(vars: ThemeVars, mode: Mode): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  // Keep data-theme honest so chart axis colors (Charts/YearTab/GrowthChart,
  // which read dataset.theme === 'light') stay legible.
  root.setAttribute('data-theme', mode);
}

/**
 * Read persisted theme, migrating older schemes so existing users keep their
 * look:
 *   v1 budget_theme_preset → palette + mode:
 *     sorbet→sorbet/dark, sorbetLight→sorbet/light, ocean→ocean/dark,
 *     forest→forest/dark, sunset→sunset/dark, custom→custom (mode dark).
 *   v0 budget_theme (light/dark toggle):
 *     light→sorbet/light, dark/absent→sorbet/dark.
 */
export function loadThemeState(): ThemeState {
  // Current scheme.
  const palette = localStorage.getItem(LS_PALETTE);
  if (palette && VALID_PALETTES.includes(palette as PaletteId)) {
    const mode: Mode = localStorage.getItem(LS_MODE) === 'light' ? 'light' : 'dark';
    let custom: ThemeVars = {};
    if (palette === 'custom') {
      try {
        const raw = localStorage.getItem(LS_CUSTOM);
        if (raw) custom = JSON.parse(raw) as ThemeVars;
      } catch {
        custom = {};
      }
    }
    return { palette: palette as PaletteId, mode, custom };
  }

  // v1 preset migration.
  const legacyPreset = localStorage.getItem(LS_LEGACY_PRESET);
  if (legacyPreset) {
    const map: Record<string, { palette: PaletteId; mode: Mode }> = {
      sorbet: { palette: 'sorbet', mode: 'dark' },
      sorbetLight: { palette: 'sorbet', mode: 'light' },
      ocean: { palette: 'ocean', mode: 'dark' },
      forest: { palette: 'forest', mode: 'dark' },
      sunset: { palette: 'sunset', mode: 'dark' },
      custom: { palette: 'custom', mode: 'dark' },
    };
    const hit = map[legacyPreset];
    if (hit) {
      let custom: ThemeVars = {};
      if (hit.palette === 'custom') {
        try {
          const raw = localStorage.getItem(LS_CUSTOM);
          if (raw) custom = JSON.parse(raw) as ThemeVars;
        } catch {
          custom = {};
        }
      }
      return { ...hit, custom };
    }
  }

  // v0 light/dark toggle migration.
  const legacy = localStorage.getItem(LS_LEGACY_THEME);
  const mode: Mode = legacy === 'light' ? 'light' : 'dark';
  return { palette: 'sorbet', mode, custom: {} };
}

/** Apply persisted theme to :root as early as possible (before first paint). */
export function applyPersistedTheme(): ThemeState {
  const state = loadThemeState();
  applyVars(resolveVars(state), state.mode);
  return state;
}
