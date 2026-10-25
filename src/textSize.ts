// ── Text size — larger text for anyone who wants it ────────────────────────
//
// "The text may be a bit small … people over 60 may find it hard to read"
// (first tester, 2026-10-17). Nearly every size in index.css is in rem, so
// one root size scales the whole app at once: text, buttons and the space
// around them together, which keeps the layout's proportions.
//
// Stored like the other settings, and applied before the first paint (main.tsx)
// so a large-text user never sees the small version flash first.

import type { StorageLike } from './storage';

export type TextSize = 'normal' | 'large' | 'larger';
export const TEXT_SIZES: readonly TextSize[] = ['normal', 'large', 'larger'];
export const TEXT_SIZE_KEY = 'budget_text_size';

/** The root font size for each step, in percent of the browser's own 16px. */
const ROOT_SIZE: Record<TextSize, number> = { normal: 100, large: 115, larger: 130 };

/** On a Mac the App Store runs the iPad app, and macOS draws it at 77 % of its
 *  size, so every step is scaled back up by 1/0.77. The native side marks the
 *  page html[data-mac-fit] before it loads (ios/App/App/SceneDelegate.swift,
 *  MacFit). Through the root size rather than a zoom, so the layout reflows to
 *  the window instead of running off its edge. */
export const MAC_SCALE = 1.3;

export function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v);
}

/** What is stored, or normal — also for a value a hand-edited backup broke. */
export function loadTextSize(storage: StorageLike): TextSize {
  let raw: string | null = null;
  try { raw = storage.getItem(TEXT_SIZE_KEY); } catch { /* unreadable: the default */ }
  return isTextSize(raw) ? raw : 'normal';
}

export function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  const scale = root.dataset.macFit === '1' ? MAC_SCALE : 1;
  root.style.fontSize = `${ROOT_SIZE[size] * scale}%`;
  root.dataset.textSize = size;
}
