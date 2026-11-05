// ── followUpLayout — how the Follow-up tab is divided ─────────────────────
//
// The tab has eight parts and used to show them in one long column, with the
// table (what people look at most) about 1 700 px down on a phone. Ariel chose
// (2026-11-05) to divide it into sub-tabs by default — one thing at a time —
// and to let anyone who prefers it flat switch to boxes on one page.
//
// This is a view choice, not data: it only changes what is on screen. It is
// kept in storage because the user made it on purpose, and it travels in a
// backup like the other small choices (spendingPrefs).

import type { StorageLike } from './storage';

export const FOLLOWUP_LAYOUT_KEY = 'budget_followup_layout';

export type FollowUpLayout = 'tabs' | 'boxes';
export type FollowUpSection = 'overview' | 'sort' | 'purchases' | 'questions';

/** The stored choice. Anything else — a missing key, an old build's junk, a
 *  storage that cannot be read — is the default: sub-tabs. */
export function loadFollowUpLayout(storage: StorageLike): FollowUpLayout {
  try {
    return storage.getItem(FOLLOWUP_LAYOUT_KEY) === 'boxes' ? 'boxes' : 'tabs';
  } catch {
    return 'tabs';
  }
}

/** Remember the choice. The default is stored as no key at all, so a device
 *  that never chose looks the same as one that chose the default. A write that
 *  fails is not worth interrupting anyone for: the choice holds for this visit. */
export function saveFollowUpLayout(storage: StorageLike, layout: FollowUpLayout): void {
  try {
    if (layout === 'boxes') storage.setItem(FOLLOWUP_LAYOUT_KEY, 'boxes');
    else storage.removeItem(FOLLOWUP_LAYOUT_KEY);
  } catch { /* kept in memory for this visit */ }
}

/** Which sections the sub-tab bar offers, in order. A section with nothing to
 *  show is left out rather than shown empty:
 *  - Sort only while something waits for a category;
 *  - Purchases only once something is recorded;
 *  - Questions once there is a budget or a record to ask about. */
export function availableSections(opts: {
  waiting: number; hasEntries: boolean; nothingYet: boolean;
}): FollowUpSection[] {
  const out: FollowUpSection[] = ['overview'];
  if (opts.waiting > 0) out.push('sort');
  if (opts.hasEntries) out.push('purchases');
  if (!opts.nothingYet) out.push('questions');
  return out;
}

/** The section to show: the chosen one if it is still on offer, otherwise the
 *  overview (what happens when the last item is sorted while Sort is open). */
export function shownSection(chosen: FollowUpSection, available: FollowUpSection[]): FollowUpSection {
  return available.includes(chosen) ? chosen : 'overview';
}

// ── Asking for a section from outside the tab ─────────────────────────────
//
// The guide's "Show me" lights up a real control, and under sub-tabs that
// control may be in a section that is not showing. It asks for the section
// before it opens the tab; the tab takes the request when it mounts, or at
// once if it is already open. A request nobody takes is dropped by the next.

let requested: FollowUpSection | null = null;
const listeners = new Set<() => void>();

export function requestFollowUpSection(section: FollowUpSection): void {
  requested = section;
  listeners.forEach(l => l());
}

/** The pending request, once: reading it clears it. */
export function takeRequestedSection(): FollowUpSection | null {
  const s = requested;
  requested = null;
  return s;
}

/** Called when a request arrives while the tab is open. Returns the way to stop listening. */
export function onSectionRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
