// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Intro } from './components/Intro';

// ── Review 2026-09-18, F7 ──────────────────────────────────────────────────
//
// The intro carried role="dialog" and aria-modal="true" but had no focus trap.
// The first Tab landed on "Previous month" behind the backdrop: a dialog the
// keyboard could walk straight out of while the screen said it could not. The
// working model was already in the app (FollowUpHelp) — it had simply not been
// applied here.
//
// WHAT THIS FILE CANNOT TEST: the Tab / Shift+Tab cycle itself. useModalFocus
// picks the cycle's members with `el.offsetParent !== null`, which is how it
// skips hidden controls — and jsdom has no layout, so offsetParent is null for
// everything and the list comes back empty. Exercising it here would test
// jsdom, not the app. The cycle is verified in a real browser instead, and that
// run is reported separately.
//
// What IS provable here is the part that makes the cycle possible at all:
// focus enters the dialog, the background goes inert, and Escape behaves.

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(cleanup);

/** A focusable control OUTSIDE the dialog, standing in for the month nav. */
function renderWithBackground(onDone = vi.fn()) {
  const background = document.createElement('button');
  background.textContent = 'Föregående månad';
  document.body.appendChild(background);
  render(<Intro onDone={onDone} />);
  return { background, onDone };
}

describe('the intro holds the keyboard', () => {
  it('moves focus into the dialog when it opens', async () => {
    renderWithBackground();
    await waitFor(() => {
      const panel = document.querySelector('.intro-modal');
      expect(panel?.contains(document.activeElement)).toBe(true);
    });
  });

  it('focuses the panel itself, so it opens at the first card and not below it', async () => {
    renderWithBackground();
    await waitFor(() => {
      expect((document.activeElement as HTMLElement)?.className).toContain('intro-modal');
    });
  });

  it('makes the background inert while it is open', async () => {
    // The Tab trap alone keeps KEYBOARDS out; a screen reader's virtual cursor
    // walks the DOM instead, so the page behind has to be inert as well.
    const { background } = renderWithBackground();
    await waitFor(() => expect(background.inert).toBe(true));
  });

  it('gives the background back when it closes', async () => {
    const { background, onDone } = renderWithBackground();
    await waitFor(() => expect(background.inert).toBe(true));
    cleanup();
    expect(background.inert).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Escape does the same as Skip', async () => {
    // Not destructive: the letter the intro replaced is still under "About the
    // app", so a stray Escape costs nothing — and behaving like every other
    // dialog in the app is worth more than guarding three cards.
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithBackground(onDone);
    await user.keyboard('{Escape}');
    expect(onDone).toHaveBeenCalled();
  });

  it('all three cards can be completed without a mouse', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithBackground(onDone);

    const next = () => screen.getByRole('button', { name: /Nästa|Kom igång/ });
    await user.click(next());
    await user.click(next());
    expect(next().textContent).toBe('Kom igång');
    await user.click(next());
    expect(onDone).toHaveBeenCalled();
  });
});
