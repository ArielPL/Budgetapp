import { describe, it, expect } from 'vitest';

// ── The rule this file exists to enforce ──────────────────────────────────
//
// A `position: fixed` dialog is anchored to the SCREEN only while no ancestor
// carries a transform, filter or perspective. Any one of those makes that
// ancestor the containing block instead, and the dialog silently anchors to it.
//
// This app has exactly such an ancestor, permanently. `.tab-enter` animates a
// tab in and its last keyframe sets `transform: translateY(0)` — identity,
// invisible, and enough. Every tab body sits inside one.
//
// It cost a working feature. The CSV import is the first dialog opened from
// INSIDE a tab rather than from App.tsx, so it was the first to land in that
// box: the backdrop stopped covering the screen, the panel took the tab's width
// instead of its own, and its title bar and close button came to rest
// underneath the app header, where no click could reach them. The parser was
// correct the whole time and every unit test passed.
//
// The fix has two halves. This file can only check one of them:
//
//   1. the dialog portals to document.body, out of any tab — checked below;
//   2. `.tab-enter` uses `animation-fill-mode: backwards`, so the last keyframe
//      is dropped when the animation ends and no transform lingers.
//
// (2) lives in index.css and is NOT checked here. Vitest resolves CSS imports
// to empty strings, and reading the file with node:fs would drag node types
// into a tsconfig kept deliberately browser-only — see the note in
// rowSumGuard.test.ts. The portal is the half that has to hold anyway: it is
// the one that does not depend on remembering any of this.

const MODULES = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const source = (path: string): string => {
  const found = MODULES[path];
  if (found === undefined) {
    throw new Error(`${path} not found — has it moved? Update this guard.`);
  }
  return found;
};

// Every dialog opened from INSIDE a tab, not just the first one. The trap does
// not care which dialog walks into it: the CSV import found it, and the guide
// in the same tab would have found it next.
const IN_TAB_DIALOGS = [
  './components/CsvImport.tsx',
  './components/FollowUpHelp.tsx',
];

describe.each(IN_TAB_DIALOGS)('%s escapes the tab', path => {
  const src = source(path);

  it('renders through a portal', () => {
    expect(src).toContain("import { createPortal } from 'react-dom'");
    expect(src).toContain('return createPortal(');
  });

  it('portals to the document body, not to a node inside the app', () => {
    // Anywhere inside .app is inside a tab, which is the whole problem.
    expect(src).toContain('document.body');
  });
});

// ── A dialog that says aria-modal must behave like one ─────────────────────
//
// Buggy sweep 2026-09-19, finding 8. CsvImport declared role="dialog"
// aria-modal="true" and had none of it: no focus trap, no Escape, nothing
// inert behind the backdrop. Focus stayed on the button under the backdrop,
// Tab walked the page behind and back out again, and Enter on a button back
// there opened a second dialog on top of the first. Review 2026-09-18 F7
// fixed precisely this for Intro; the import was simply missed, which is the
// argument for checking it by rule rather than by memory.
//
// useModalFocus is the one implementation of all of it, so requiring its
// presence is requiring the behaviour.

describe('every aria-modal dialog uses useModalFocus', () => {
  const claiming = Object.entries(MODULES)
    .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .filter(([, src]) => src.includes('aria-modal="true"'));

  it('finds the dialogs to check', () => {
    // If this drops to zero the guard has stopped guarding anything.
    expect(claiming.length).toBeGreaterThan(0);
  });

  it.each(claiming.map(([path]) => path))('%s traps focus and closes on Escape', path => {
    const src = source(path);
    expect(src).toContain('useModalFocus');
    // Imported from the shared hook, not re-implemented locally.
    expect(src).toMatch(/import \{[^}]*useModalFocus[^}]*\} from '\.{1,2}\/(\.\.\/)?useModalFocus'/);
  });
});
