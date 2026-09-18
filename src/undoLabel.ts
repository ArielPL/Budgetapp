// ── undoLabel — naming a step back, in the language on screen now ──────────
//
// An undo entry stores the month as NUMBERS and the moment as an ISO string,
// never as a finished sentence. A user who switches language would otherwise
// find yesterday's actions still written in the old one, and a stored sentence
// cannot be corrected later.
//
// Separate from UndoBar.tsx so that file exports only its component — the rule
// Fast Refresh needs, and the reason lint asked for this split.

import { MONTHS, MONTHS_SHORT, type Lang } from './i18n';
import type { UndoEntry } from './undo';

/** "September 2026", or empty when the action was not about a single month. */
export function undoWhere(entry: UndoEntry, lang: Lang): string {
  if (entry.year === undefined || entry.month === undefined) return '';
  return `${MONTHS[lang][entry.month]} ${entry.year}`;
}

/**
 * "17 sep 13:40" — short enough for one menu line, exact enough to answer
 * "when did I do that?".
 *
 * Built from the LOCAL parts, never from toISOString: that prints UTC, and a
 * reset made at 00:30 in Stockholm would be dated to the day before.
 */
export function shortWhen(iso: string, lang: Lang): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  // MONTHS_SHORT is capitalised because it titles the month ("Sep 2026").
  // Inside a date, Swedish and Spanish write the month in lower case — "17 sep",
  // not "17 Sep". English keeps the capital.
  const short = MONTHS_SHORT[lang][at.getMonth()];
  const name = lang === 'en' ? short : short.toLowerCase();
  return `${at.getDate()} ${name} ${hh}:${mm}`;
}
