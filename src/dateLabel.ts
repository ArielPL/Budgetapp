// ── dateLabel — dates written the way each language writes them ────────────
//
// Two rules the shared MONTHS lists cannot carry on their own:
//
//   · MONTHS_SHORT is capitalised because it also titles the month ("Sep 2026").
//     Inside a date, Swedish and Spanish write it lower case — "17 sep" — while
//     English keeps the capital. The case belongs to the sentence, not the list.
//
//   · Everything is built from the LOCAL parts. toISOString prints UTC, so a
//     backup taken at 00:30 in Stockholm would be dated to the day before — the
//     same trap already documented in periodLabel.ts and actuals.ts.

import { MONTHS, MONTHS_SHORT, type Lang } from './i18n';

const lower = (name: string, lang: Lang) => (lang === 'en' ? name : name.toLowerCase());

/** "17 sep 13:40" — one line, exact enough to answer "when did I do that?". */
export function shortWhen(iso: string, lang: Lang): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${at.getDate()} ${lower(MONTHS_SHORT[lang][at.getMonth()], lang)} ${hh}:${mm}`;
}

/**
 * "17 september 2026" — a day, without a clock. For a backup the minute is
 * noise; the question is how long ago.
 *
 * Spanish writes the long form with `de` on both sides of the month, which is
 * not something a month list can carry — so it is applied here rather than
 * printing a date no Spanish speaker writes.
 */
export function longDate(value: string | number, lang: Lang): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const day = at.getDate();
  const name = lower(MONTHS[lang][at.getMonth()], lang);
  const year = at.getFullYear();
  return lang === 'es' ? `${day} de ${name} de ${year}` : `${day} ${name} ${year}`;
}
