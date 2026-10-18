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

// English and German keep the capital inside a sentence ("im Oktober");
// Japanese and Chinese have no case, so lower-casing leaves them alone.
// Turkish writes the month of a specific date with a capital: "17 Ekim 2026".
const KEEPS_CAPITAL: ReadonlySet<Lang> = new Set<Lang>(['en', 'de', 'tr']);
const lower = (name: string, lang: Lang) => (KEEPS_CAPITAL.has(lang) ? name : name.toLowerCase());

/** Japanese and Chinese write dates year-first with their own units:
 *  2026年10月17日. Their month names in MONTHS are already "10月". */
const CJK: ReadonlySet<Lang> = new Set<Lang>(['ja', 'zh']);

/** Spanish and Portuguese put "de" between day, month and year:
 *  "17 de octubre de 2026", "outubro de 2026". */
const WITH_DE: ReadonlySet<Lang> = new Set<Lang>(['es', 'pt']);

/** Russian dates take the month in the genitive: "17 октября 2026", never
 *  "17 октябрь". MONTHS keeps the nominative, which titles the month. */
const RU_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/**
 * "25 aug – 24 sep": a pay period, or any stretch of days, on one line.
 *
 * Shared by the month header (PeriodLabel) and the spending card, so the two
 * can never print the same period two different ways on the same screen. No
 * year: both show it beside a heading that already names the month and year.
 */
export function formatPeriodRange(range: { from: Date; to: Date }, lang: Lang): string {
  const day = (d: Date) => (CJK.has(lang)
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : lang === 'de' ? `${d.getDate()}. ${MONTHS_SHORT[lang][d.getMonth()]}`
      : `${d.getDate()} ${lower(MONTHS_SHORT[lang][d.getMonth()], lang)}`);
  return `${day(range.from)} – ${day(range.to)}`;
}

/** "3 okt" from an entry's "YYYY-MM-DD", read as the local day it names. */
export function shortDay(iso: string, lang: Lang): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d || m < 1 || m > 12) return '';
  if (CJK.has(lang)) return `${m}月${d}日`;
  if (lang === 'de') return `${d}. ${MONTHS_SHORT[lang][m - 1]}`;
  return `${d} ${lower(MONTHS_SHORT[lang][m - 1], lang)}`;
}

/** "maj 2031", "May 2031", "mayo de 2031": a month in a sentence. */
export function monthYear(at: { year: number; month: number }, lang: Lang): string {
  if (CJK.has(lang)) return `${at.year}年${at.month + 1}月`;
  const name = lower(MONTHS[lang][at.month], lang);
  return WITH_DE.has(lang) ? `${name} de ${at.year}` : `${name} ${at.year}`;
}

/** "17 sep 13:40" — one line, exact enough to answer "when did I do that?". */
export function shortWhen(iso: string, lang: Lang): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${shortDay(`${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`, lang)} ${hh}:${mm}`;
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
  const year = at.getFullYear();
  if (CJK.has(lang)) return `${year}年${at.getMonth() + 1}月${day}日`;
  const name = lower(MONTHS[lang][at.getMonth()], lang);
  if (lang === 'de') return `${day}. ${name} ${year}`;
  if (lang === 'ru') return `${day} ${RU_GENITIVE[at.getMonth()]} ${year}`;
  return WITH_DE.has(lang) ? `${day} de ${name} de ${year}` : `${day} ${name} ${year}`;
}

/** A month name inside a sentence: "Kopiera september", "Copy September".
 *  MONTHS is capitalised because it also titles the month. */
export function inSentence(name: string, lang: Lang): string {
  return lower(name, lang);
}

/** "Oktober 2026" as a title — "2026年10月" in Japanese and Chinese, which put
 *  the year first. For a month on its own: the header, a list, a label. */
export function monthTitle(month: number, year: number, lang: Lang): string {
  return CJK.has(lang) ? `${year}年${month + 1}月` : `${MONTHS[lang][month]} ${year}`;
}

/** The same inside a sentence: "i oktober 2026", "im Oktober 2026", "2026年10月". */
export function monthInText(month: number, year: number, lang: Lang): string {
  if (CJK.has(lang)) return `${year}年${month + 1}月`;
  // "outubro de 2026": Portuguese never leaves out the de.
  return lang === 'pt'
    ? `${lower(MONTHS[lang][month], lang)} de ${year}`
    : `${lower(MONTHS[lang][month], lang)} ${year}`;
}
