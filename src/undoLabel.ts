// ── undoLabel — naming a step back, in the language on screen now ──────────
//
// An undo entry stores the month as NUMBERS, never as a finished sentence. A
// user who switches language would otherwise find yesterday's actions still
// written in the old one, and a stored sentence cannot be corrected later.
//
// Date formatting lives in dateLabel.ts, which is not about undo.

import type { Lang } from './i18n';
import { monthInText } from './dateLabel';
import type { UndoEntry } from './undo';

/** "september 2026" (sv/es) or "September 2026" (en), or empty when the action
 *  was not about a single month. Always used mid-sentence ("…i september
 *  2026"), so the month takes the language's in-sentence casing. */
export function undoWhere(entry: UndoEntry, lang: Lang): string {
  if (entry.year === undefined || entry.month === undefined) return '';
  return monthInText(entry.month, entry.year, lang);
}
