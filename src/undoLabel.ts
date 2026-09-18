// ── undoLabel — naming a step back, in the language on screen now ──────────
//
// An undo entry stores the month as NUMBERS, never as a finished sentence. A
// user who switches language would otherwise find yesterday's actions still
// written in the old one, and a stored sentence cannot be corrected later.
//
// Date formatting lives in dateLabel.ts, which is not about undo.

import { MONTHS, type Lang } from './i18n';
import type { UndoEntry } from './undo';

/** "September 2026", or empty when the action was not about a single month. */
export function undoWhere(entry: UndoEntry, lang: Lang): string {
  if (entry.year === undefined || entry.month === undefined) return '';
  return `${MONTHS[lang][entry.month]} ${entry.year}`;
}
