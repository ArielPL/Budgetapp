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

/** The root font size for each step. 100% is the browser's own 16px. */
const ROOT_SIZE: Record<TextSize, string> = { normal: '100%', large: '115%', larger: '130%' };

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
  root.style.fontSize = ROOT_SIZE[size];
  root.dataset.textSize = size;
}
