import { describe, it, expect } from 'vitest';

// ── The rule this file exists to enforce ──────────────────────────────────
//
// Income and expense row amounts are summed in ONE place: metrics.ts, through
// sumRows / categoryTotal / sumCategories / calculateBudgetMetrics.
//
// Five separate views used to add up `.amount` themselves — the category header,
// the summary cards' previous-month comparison, the Year table, the expense
// charts and the income section. Identical arithmetic, five copies. Harmless
// while a row's amount means exactly what it says.
//
// It stops being harmless the moment an amount needs INTERPRETING. A row marked
// "per year" contributes a twelfth to a monthly total, and a copy that does not
// know that prints a different number for the same row:
//
//   Hemförsäkring 4 800 kr/år
//     summary card ──sumRows──────────────▶  400 kr   ✅
//     category header ──own reduce────────▶ 4 800 kr  ❌ same row, same screen
//
// Storage and display contradicting each other is the exact failure this repo
// has had to fix twice already. One choke point, checked here.
//
// SAVINGS IS EXCLUDED ON PURPOSE. A savings row holds a recorded BALANCE, not a
// monthly flow, and a balance cannot be "per year" — dividing it would be the
// bug, not the fix. Those three call sites are listed below by name.

// Sources read through Vite (`?raw`) rather than node:fs, which keeps the app's
// tsconfig browser-only (`types: ["vite/client"]`) — a guard of its own.
const MODULES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

/** Files that legitimately sum row amounts directly, and why. */
const ALLOWED = new Set([
  // The one module allowed to define what a row amount adds up to.
  'metrics.ts',
  // Savings balances — see the note above. Periodisation never applies here.
  'defaults.ts',
  'components/GrowthChart.tsx',
  'components/SavingsDonuts.tsx',
]);

const FILES = Object.entries(MODULES)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  .map(([path, source]) => ({ name: path.replace(/^\.\//, ''), source }))
  .filter(f => !ALLOWED.has(f.name));

/** `.reduce(...)` whose body adds a `.amount` — i.e. a hand-rolled row sum. */
const ROW_SUM = /\.reduce\(\s*\([^)]*\)\s*=>[^\n;]*\.amount\b/;

describe('row amounts are summed in metrics.ts only', () => {
  it('has files to check (the glob really matched something)', () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it.each(FILES)('$name does not add up row amounts itself', ({ source }) => {
    const offenders = source
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => ROW_SUM.test(line));

    expect(offenders, offenders.map(o => `line ${o.no}: ${o.line}`).join('\n'))
      .toHaveLength(0);
  });

  it('still guards the savings files against being quietly renamed away', () => {
    // If one of these is moved or renamed the exemption silently stops applying
    // to it — which is the safe direction, but the list should not rot either.
    const names = new Set(Object.keys(MODULES).map(p => p.replace(/^\.\//, '')));
    for (const allowed of ALLOWED) expect(names.has(allowed)).toBe(true);
  });
});
