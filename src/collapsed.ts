// ── Which categories are folded ─────────────────────────────────────────────
//
// A folded category stayed folded only until the tab changed: the state lived
// in the component, and every tab switch mounts it afresh (tester, 2026-10-19).
// Kept by category id, so it holds across tabs, months and restarts. A device
// convenience — a refused write just means it opens unfolded next time.

import { appStorage } from './storage';
import { safeSetItem } from './storageWrite';

export const COLLAPSED_KEY = 'budget_collapsed';

function read(): Set<string> {
  try {
    const v = JSON.parse(appStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function isCollapsed(id: string): boolean {
  return read().has(id);
}

export function setCollapsedStored(id: string, collapsed: boolean): void {
  const ids = read();
  if (collapsed) ids.add(id); else ids.delete(id);
  safeSetItem(appStorage, COLLAPSED_KEY, JSON.stringify([...ids]));
}
