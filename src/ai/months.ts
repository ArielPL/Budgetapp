// ── Months, read by the app rather than by the model (Budget AI) ──────────
//
// The language model fills a month field as "YYYY-MM", and in the lab it was
// right 98 % of the time — but the misses were nearly all months. It wrote
// "this_month" instead of a month, and in Turkish and Russian "by April",
// "in June" and "by New Year" became whatever month the instructions happened
// to show as an example (lab rounds 8–9, 2026-10-27). Asking it more nicely did
// not help: it copies examples instead of reading the month name.
//
// The app can read month names itself, in all eleven languages, without
// guessing. So when the question names exactly one month (or Christmas, New
// Year, year end), that month wins, and the model's value only decides the
// year when it agrees. The model's month is used as it is only when the
// question names none — "in two years", "last month".
//
// Pure: `now` is handed in.

import { addMonths, type YearMonth } from '../debts';

/** A month the user asks ABOUT is the latest one that has begun; a month
 *  something should be done BY is the next one still to come. */
export type MonthMode = 'past' | 'deadline';

const ym = (year: number, month: number): YearMonth => ({ year, month });
const index = (at: YearMonth) => at.year * 12 + at.month;

export const formatYM = (at: YearMonth): string =>
  `${at.year}-${String(at.month + 1).padStart(2, '0')}`;

/**
 * Lower case, full-width digits made plain, accents dropped — so "Eylüle",
 * "Août" and "６月" meet the patterns below as "eylule", "aout" and "6月".
 * Cyrillic й loses its breve on the way (и), which the Russian pattern allows
 * for. Turkish ı has no accent to drop and stays ı.
 */
function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Not preceded or followed by a letter: \b only knows ASCII. */
const START = String.raw`(?<!\p{L})`;
const END = String.raw`(?!\p{L})`;

/** Whole words, in every language whose month names do not take endings. */
const WHOLE: string[][] = [
  // sv
  ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'],
  // en — "may" only after a word that makes it a month, below
  ['january', 'february', 'march', 'april', '', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  // es
  ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre|setiembre', 'octubre', 'noviembre', 'diciembre'],
  // it
  ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  // fr
  ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'],
  // pt
  ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  // de
  ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'],
];

/** Stems that take endings: Russian cases ("июня", "к апрелю") and Turkish
 *  suffixes ("Nisana kadar", "Haziranda", "Mart'a"). */
const STEMS: string[][] = [
  // ru
  ['январ', 'феврал', 'март', 'апрел', 'ма[иея]' + END, 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  // tr
  // "mart" only with Turkish endings, so "martes" and "Martin" stay out
  ['ocak', 'subat', "mart(?:'\\p{L}+|a|ta|tan|ın)?" + END, 'nisan', 'may[iı]s', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kas[iı]m', 'aral[iı]k'],
];

const ENGLISH_MAY = new RegExp(`${START}(?:in|by|until|till|before|since|from|of|for|last|next|this|early|late|mid)\\s+may${END}`, 'u');

const NAMES: RegExp[] = Array.from({ length: 12 }, (_, m) => {
  const words = WHOLE.map(lang => lang[m]).filter(Boolean).join('|');
  const stems = STEMS.map(lang => lang[m]).join('|');
  return new RegExp(`${START}(?:(?:${words})${END}|${stems})`, 'u');
});

/** 1–12 written with digits or Chinese numerals before 月. "3か月", "三个月"
 *  (a number of months) have a character in between and never match. */
const CJK_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const CJK_MONTH = /(?<![0-9一二三四五六七八九十])(1[0-2]|[1-9]|十[一二]?|[一二三四五六七八九])月/gu;

const cjkMonth = (n: string): number =>
  /^\d+$/.test(n) ? Number(n) - 1 : CJK_NUMERALS.indexOf(n);

/** Christmas, New Year's Eve and year end: all December, in every language.
 *  "Till nyår" means before the year turns, never January (lab: tr, ru). */
const DECEMBER = new RegExp([
  `${START}(?:jul|julen|nyar|nyarsafton|arsskiftet)${END}`, String.raw`arets slut`,
  String.raw`christmas|xmas|new year|year[- ]end|end of the year`,
  String.raw`navidad|nochevieja|fin de ano|ano nuevo`,
  String.raw`natale|capodanno|fine (?:dell')?anno`,
  String.raw`noel|nouvel an|reveillon|fin (?:de l'|d')annee`,
  String.raw`natal|ano novo|fi[mn] d[eo] ano`,
  String.raw`weihnacht|silvester|neujahr|jahresende|ende des jahres`,
  String.raw`нов(?:ыи|ого|ому|ым) год|рождеств|кон(?:ца|цу) года`,
  String.raw`y[iı]lbas|y[iı]l sonu`,
  String.raw`年底|年末|元旦|圣诞|正月|クリスマス`,
].join('|'), 'u');

/** The Spring Festival falls in late January or February; the lab's Chinese
 *  pack used February, and so does this. */
const FEBRUARY = /春节|春節/u;

export interface NamedMonths {
  /** 0-based months named in the text, each once. */
  months: number[];
  /** Named through a holiday rather than a month name. */
  holiday: boolean;
}

export function namedMonths(text: string): NamedMonths {
  const s = fold(text);
  const found = new Set<number>();
  NAMES.forEach((re, m) => { if (re.test(s)) found.add(m); });
  if (ENGLISH_MAY.test(s)) found.add(4);
  for (const hit of s.matchAll(CJK_MONTH)) found.add(cjkMonth(hit[1]));
  let holiday = false;
  if (found.size === 0) {
    if (DECEMBER.test(s)) { found.add(11); holiday = true; }
    else if (FEBRUARY.test(s)) { found.add(1); holiday = true; }
  }
  return { months: [...found], holiday };
}

/** What the model wrote in a month field: "YYYY-MM", or one of the words it
 *  sometimes writes instead. Null for anything else. */
export function parseModelMonth(raw: unknown, now: YearMonth): YearMonth | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'this_month' || s === 'current_month') return now;
  if (s === 'last_month' || s === 'previous_month') return addMonths(now, -1);
  if (s === 'next_month') return addMonths(now, 1);
  const m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  return month >= 0 && month <= 11 ? ym(Number(m[1]), month) : null;
}

/** Fits the mode: a past month has begun; a deadline is still to come.
 *  A holiday deadline may be this month — "by Christmas", asked in December. */
function fits(at: YearMonth, now: YearMonth, mode: MonthMode, allowThisMonth: boolean): boolean {
  const d = index(at) - index(now);
  return mode === 'past' ? d <= 0 : allowThisMonth ? d >= 0 : d > 0;
}

/**
 * The month a field should hold, or null when the app cannot tell — the card
 * then opens with the field empty for the user to fill in, never a guess.
 */
export function resolveMonth(raw: unknown, question: string, now: YearMonth, mode: MonthMode): YearMonth | null {
  const model = parseModelMonth(raw, now);
  const named = namedMonths(question);
  if (named.months.length !== 1) {
    return model && fits(model, now, mode, false) ? model : null;
  }
  const month = named.months[0];
  const holiday = named.holiday;
  // The model agrees on the month: let it have chosen the year ("June 2028",
  // "June in two years"), as long as that still fits.
  if (model && model.month === month && fits(model, now, mode, holiday)) return model;
  const thisYear = ym(now.year, month);
  if (mode === 'past') return fits(thisYear, now, mode, holiday) ? thisYear : ym(now.year - 1, month);
  return fits(thisYear, now, mode, holiday) ? thisYear : ym(now.year + 1, month);
}
