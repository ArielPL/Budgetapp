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

describe('a dialog opened from inside a tab escapes the tab', () => {
  const src = source('./components/CsvImport.tsx');

  it('renders through a portal', () => {
    expect(src).toContain("import { createPortal } from 'react-dom'");
    expect(src).toContain('return createPortal(');
  });

  it('portals to the document body, not to a node inside the app', () => {
    // Anywhere inside .app is inside a tab, which is the whole problem.
    expect(src).toContain('document.body');
  });
});
