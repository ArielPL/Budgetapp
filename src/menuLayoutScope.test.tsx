// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// ── Review 2026-09-05, F2 ──────────────────────────────────────────────────
//
// The utilities menu is shown in every layout, but "Copy budget" and "Reset
// month" only ever touched budget_<year>_<month> — the Classic/Combined store.
// Used from the Custom layout they copied a budget the user could not see into
// a month they were not looking at, and reported success. Reproduced in a
// browser: with Custom on screen, "Next month" wrote the CLASSIC October
// budget and said "✓ Kopierat till Oktober".
//
// Mounting the real App is the only honest way to test this: the rule lives in
// the menu's JSX, and a test of an extracted boolean would prove nothing about
// what is actually rendered.

beforeEach(() => {
  localStorage.clear();
  // jsdom ships neither, and App uses both on mount.
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
  // Skip the first-run modal so the menu button is reachable.
  localStorage.setItem('budget_welcome_seen', '1');
  localStorage.setItem('budget_custom_help_seen', '1');
  localStorage.setItem('budget_lang', 'sv');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText(/öppna meny/i));
};

describe('the menu only offers what the active layout can actually do', () => {
  it('offers the classic copy and reset actions in the Classic layout', async () => {
    localStorage.setItem('budget_layout', 'classic');
    render(<App />);
    await openMenu();

    await waitFor(() => expect(screen.getByText(/nästa månad \(/i)).toBeTruthy());
    expect(screen.getByText(/återställ månad/i)).toBeTruthy();
  });

  it('hides them in the Custom layout, which keeps its own separate data', async () => {
    localStorage.setItem('budget_layout', 'custom');
    render(<App />);
    await openMenu();

    // The menu itself is still there — this is about scope, not hiding the menu.
    await waitFor(() => expect(screen.getByText(/exportera data/i)).toBeTruthy());

    expect(screen.queryByText(/nästa månad \(/i)).toBeNull();
    expect(screen.queryByText(/hämta från/i)).toBeNull();
    expect(screen.queryByText(/återstående/i)).toBeNull();
    // resetCurrentMonth blanks the CLASSIC month whatever is on screen, so it
    // is classic-only for exactly the same reason the copy actions are.
    expect(screen.queryByText(/återställ månad/i)).toBeNull();
  });
});
