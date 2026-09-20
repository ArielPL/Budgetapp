// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { baseVars, resolveVars, loadThemeState, PALETTES } from './themes';

// ── An accent is an accent, not a new theme ────────────────────────────────
//
// Buggy sweep 2026-09-19, findings 6 and 13.
//
// resolveVars treated `palette: 'custom'` as "Sorbet plus overrides", and
// setAccent flipped the palette to 'custom' while the override map held only
// the one colour just picked. So tapping an accent swatch on Ocean replaced
// all 26 variables with Sorbet's — background, cards, income colour, the lot —
// in a single tap, with no route back, while the comment above setAccent
// promised the opposite.
//
// 'custom' still has to MEAN Sorbet, because that is what devices which
// already stored it have been rendering. It simply must not be created again.

beforeEach(() => localStorage.clear());

describe('overrides layer over the chosen family', () => {
  it('keeps Ocean underneath an accent override', () => {
    const got = resolveVars({
      palette: 'ocean', mode: 'dark', custom: { '--accent-brand': '#38bdf8' },
    });
    expect(got['--accent-brand']).toBe('#38bdf8');
    // Everything else must still be Ocean's, not Sorbet's.
    expect(got['--bg']).toBe(PALETTES.ocean.dark['--bg']);
    expect(got['--surface']).toBe(PALETTES.ocean.dark['--surface']);
    expect(got['--income-color']).toBe(PALETTES.ocean.dark['--income-color']);
    expect(got['--bg']).not.toBe(PALETTES.sorbet.dark['--bg']);
  });

  it('does the same for every family and both modes', () => {
    for (const palette of ['sorbet', 'ocean', 'forest', 'sunset'] as const) {
      for (const mode of ['dark', 'light'] as const) {
        const got = resolveVars({ palette, mode, custom: { '--accent-brand': '#abcdef' } });
        expect(got['--bg']).toBe(PALETTES[palette][mode]['--bg']);
        expect(got['--accent-brand']).toBe('#abcdef');
      }
    }
  });

  it('reports the family\'s own accent as the base', () => {
    expect(baseVars('ocean', 'dark')['--accent-brand'])
      .toBe(PALETTES.ocean.dark['--accent-brand']);
  });

  it('still renders the legacy custom palette as Sorbet', () => {
    // Devices that stored 'custom' before the fix must not change appearance.
    const got = resolveVars({ palette: 'custom', mode: 'dark', custom: {} });
    expect(got).toEqual(PALETTES.sorbet.dark);
    expect(baseVars('custom', 'light')).toEqual(PALETTES.sorbet.light);
  });

  it('leaves no palette variable undefined', () => {
    const keys = Object.keys(PALETTES.sorbet.dark);
    for (const palette of ['sorbet', 'ocean', 'forest', 'sunset', 'custom'] as const) {
      const got = resolveVars({ palette, mode: 'dark', custom: {} });
      expect(Object.keys(got).sort()).toEqual(keys.sort());
    }
  });
});

describe('a stored override map that is not a map cannot take the app down', () => {
  // JSON.parse('null') returns null WITHOUT throwing, so the catch never fired
  // and `custom` became null — then App's themeCustom['--accent-brand'] threw
  // during render: a blank page on every load, with no menu left to fix it
  // from. A restored backup could carry exactly that.
  const cases: [string, string][] = [
    ['the JSON literal null', 'null'],
    ['a quoted string', '"nonsense"'],
    ['an array', '[1,2,3]'],
    ['a number', '42'],
    ['broken JSON', '{oh dear'],
  ];

  for (const [name, raw] of cases) {
    it(`survives ${name}`, () => {
      localStorage.setItem('budget_theme_palette', 'custom');
      localStorage.setItem('budget_theme_mode', 'dark');
      localStorage.setItem('budget_theme_custom', raw);
      const state = loadThemeState();
      expect(state.custom).toEqual({});
      // The property access that used to throw.
      expect(state.custom['--accent-brand']).toBeUndefined();
      expect(() => resolveVars(state)).not.toThrow();
    });
  }

  it('keeps the good entries and drops the rest', () => {
    localStorage.setItem('budget_theme_palette', 'ocean');
    localStorage.setItem('budget_theme_mode', 'dark');
    localStorage.setItem('budget_theme_custom', JSON.stringify({
      '--accent-brand': '#38bdf8',
      '--accent-brand-strong': 12,      // not a string
      'accent': '#fff',                 // not a CSS variable
    }));
    expect(loadThemeState().custom).toEqual({ '--accent-brand': '#38bdf8' });
  });
});
