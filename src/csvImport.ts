// ── csvImport — turning a bank's export into entries ────────────────────────
//
// The hard part of this feature was never the interface. It is that every bank
// exports differently: different columns in a different order, different date
// formats, a comma or a semicolon between fields, a comma or a dot inside a
// number, one signed amount or two columns for money in and money out, and —
// most quietly destructive — different character encodings, so that "Café"
// arrives as "CafÃ©" and every å, ä and ö in the file is ruined.
//
// The design answer is to guess and then ASK, never to ship a list of banks.
// A list only works for the banks someone remembered, breaks when one of them
// changes its export, and leaves everybody else with nothing. Guessing degrades
// instead: an unfamiliar file still imports, it just needs three corrections
// first — and the corrections are remembered against the file's own header, so
// the same bank is silent from then on. No bank ever has to be named.
//
// Pure and DOM-free so every format quirk below can be pinned down in a test
// rather than discovered by a user with a broken statement.

import { isValidIsoDate } from './date';

/** What a column holds. 'skip' is explicit rather than absent: a user who
 *  deliberately ignored a column should see that decision preserved. */
export type ColumnRole = 'date' | 'text' | 'amount' | 'in' | 'out' | 'skip';

/**
 * Which number comes first in a slashed or dotted date.
 *
 * Not a preference — a FACT ABOUT THE FILE, and one that cannot be guessed from
 * a single row. "09/05/2026" is the 5th of September in Stockholm and the 9th
 * of May in Chicago, and both readings produce a real date in a real month.
 * Reading it the wrong way round is silent: nothing is skipped, nothing looks
 * odd, every figure just belongs to a different month than it should.
 */
export type DateOrder = 'dmy' | 'mdy';

export interface ColumnMap {
  /** One role per column, positionally. */
  roles: ColumnRole[];
  /** How this file writes its dates, read from the whole column. */
  dateOrder?: DateOrder;
  /** True when the column gave no evidence either way and the default stands.
   *  The import says so rather than letting the user find out in March. */
  dateOrderGuessed?: boolean;
}

/**
 * Work out a file's date order by looking at every date in the column.
 *
 * A day above the 12th can only be a day; a month above the 12th cannot exist.
 * One such row settles the whole file. If no row is decisive the answer is
 * "ambiguous" and the caller must not pretend otherwise — most American files
 * covering a single half-month are genuinely undecidable, and the only honest
 * thing left is to say which way it was read.
 */
export function detectDateOrder(values: string[]): DateOrder | 'ambiguous' {
  let dayFirst = false;
  let monthFirst = false;
  for (const raw of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(raw.trim());
    if (!m) continue;
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first > 12 && second <= 12) dayFirst = true;
    if (second > 12 && first <= 12) monthFirst = true;
  }
  // Both, somehow: the column is not one format and no reading is safe.
  if (dayFirst && monthFirst) return 'ambiguous';
  if (dayFirst) return 'dmy';
  if (monthFirst) return 'mdy';
  return 'ambiguous';
}

/** A file whose text encoding this app cannot read. Thrown instead of
 *  returning mangled text, which the import would otherwise save as it is. */
export class CsvEncodingError extends Error {
  constructor() { super('unrecognised text encoding'); this.name = 'CsvEncodingError'; }
}

/** Column names a Japanese bank or card export uses. Any one of them, read
 *  correctly, is proof the file is Japanese. */
const JAPANESE_HEADER_WORDS = [
  '日付', '金額', '摘要', '利用日', '利用店名', 'ご利用', '取引日', '取引内容',
  'お支払', '入金', '出金', '残高', '明細',
];

/**
 * Whether bytes read as Shift-JIS (Japan's CP932) really are Japanese.
 *
 * Needed because Shift-JIS "succeeds" on a Swedish Windows-1252 file: Å, Ä and
 * Ö are halfwidth katakana there, and ä or å followed by a letter is a kanji.
 * So success alone proves nothing. What a Latin file can NOT produce is
 * hiragana or fullwidth katakana (their lead bytes are ‚ and ƒ in
 * Windows-1252), nor a real Japanese column name — and a Latin letter in the
 * F0–F9 range lands in the private-use area, which Japanese text never does.
 */
function isJapanese(text: string): boolean {
  if (/[\ue000-\uf8ff]/.test(text)) return false;
  if (JAPANESE_HEADER_WORDS.some(w => text.includes(w))) return true;
  return (text.match(/[\u3040-\u30ff]/g) ?? []).length >= 4;
}

/**
 * Whether a Windows-1252 reading is really some other encoding in disguise.
 * Swedish and Spanish text is letters: å, ñ, é. A multi-byte file read one byte
 * at a time is mostly the punctuation and symbols that live in 0x80–0xBF —
 * „ † ‰ ƒ ¶ — which no statement is made of.
 */
function looksMisread(latin: string): boolean {
  const nonAscii = [...latin].filter(c => c.charCodeAt(0) > 0x7f);
  if (nonAscii.length < 12) return false;
  const symbols = nonAscii.filter(c => /[\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u203a\u20ac\u2122]/.test(c));
  return symbols.length / nonAscii.length >= 0.3;
}

/**
 * Read the bytes as text: UTF-8, then Japanese Shift-JIS, then Windows-1252.
 *
 * Swedish bank exports are very often Windows-1252, and a UTF-8 decoder does
 * not fail loudly on it — it produces replacement characters, so the import
 * "works" and every Swedish letter is quietly mangled. Decoding strictly and
 * falling back is the only way to tell the two apart.
 *
 * Japanese banks and card companies export Shift-JIS, which the Windows-1252
 * fallback turned into symbols without a word. It is tried before that
 * fallback, but only accepted when the text is demonstrably Japanese (see
 * isJapanese). And a file that is still unreadable after all three is refused
 * with CsvEncodingError rather than imported as noise.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8; try the others.
  }
  try {
    const japanese = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
    if (isJapanese(japanese)) return japanese;
  } catch {
    // Not Shift-JIS either — the usual case for a Swedish file.
  }
  const latin = new TextDecoder('windows-1252').decode(bytes);
  if (looksMisread(latin)) throw new CsvEncodingError();
  return latin;
}

/** Semicolon, comma or tab — whichever appears most on the busiest line.
 *  Swedish Excel writes semicolons, which is why a comma-only parser would
 *  read a whole row as a single field and silently import nothing. */
export function detectDelimiter(text: string): string {
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t']) {
    // Score by AGREEMENT, not by frequency. Counting raw occurrences counted
    // them inside quoted fields too, and scored each candidate on the single
    // busiest line — so "ICA SUPERMARKET, SOLNA, SE" in a semicolon file
    // outvoted the semicolons, every row collapsed into one field, and a
    // perfectly good statement was reported as unreadable (finding 5).
    //
    // Parsing with the real parser instead means quotes are honoured, and the
    // right delimiter is the one that makes the rows agree on a column count.
    const rows = parseCsv(text, d).slice(0, 20).filter(r => r.length > 0);
    if (rows.length === 0) continue;
    const tally = new Map<number, number>();
    for (const r of rows) tally.set(r.length, (tally.get(r.length) ?? 0) + 1);
    let columns = 0;
    let agreeing = 0;
    for (const [n, count] of tally) {
      if (count > agreeing || (count === agreeing && n > columns)) { columns = n; agreeing = count; }
    }
    // One field per row means this character never separated anything.
    if (columns < 2) continue;
    const score = agreeing * 100 + columns;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** Split CSV text into rows, honouring quoted fields and doubled quotes inside
 *  them — a description containing the delimiter is ordinary, not exotic. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const push = () => { row.push(field); field = ''; };
  const endRow = () => { push(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { push(); continue; }
    if (c === '\n') { endRow(); continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

/**
 * Which row is the header.
 *
 * Several banks put the account number, the date range and a blank line above
 * it, so row 0 is not a safe assumption — a parser that assumed it would map
 * every column wrongly and import nonsense. The header is taken to be the first
 * row that has at least three columns AND is followed by a row of the same
 * width: preamble lines are short and ragged, a table is not.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].length >= 3 && rows[i + 1].length === rows[i].length) return i;
  }
  return 0;
}

/**
 * Whether the row we took for a header is really a transaction.
 *
 * Some banks — Wells Fargo among them — export no column names at all. The
 * search above then settles on the first DATA row, which costs a transaction
 * silently: it is never parsed and never reported, because as far as the
 * importer is concerned it was the heading.
 *
 * A heading does not hold a date and a number. If this one does, the file has
 * no heading and every row is data.
 */
export function looksLikeData(row: string[]): boolean {
  const hasDate = row.some(c => parseDate(c, 'dmy') !== null || parseDate(c, 'mdy') !== null);
  const hasAmount = row.some(c => parseAmount(c) !== null);
  return hasDate && hasAmount;
}

/** Placeholder names for a file that brought none, so the column step has
 *  something to show and a remembered layout still has a fingerprint. */
export function placeholderHeader(width: number): string[] {
  return Array.from({ length: width }, (_, i) => `#${i + 1}`);
}

/** Every kind of space a bank puts between thousands: ordinary, non-breaking
 *  (U+00A0) and narrow no-break (U+202F). Written as escapes rather than as
 *  the characters themselves — an invisible byte in a regex is unreadable in
 *  review and indistinguishable from a typo. */
const SPACES = /[\u00a0\u202f\s]/g;

/** Currency codes and symbols a statement may print next to the number. An
 *  explicit list rather than "any letters" — see parseAmount. */
const CURRENCY = /^(?:kr|skr|sek|nok|dkk|isk|eur|usd|gbp|chf|pln|zl|z\u0142|czk|kc|k\u010d|huf|ft|ron|lei|bgn|\u043b\u0432|rsd|hrk|try|uah|rub|\u20ac|\$|\u00a3|\u00a5|\u20ba|\u20b4|\u20bd)$/i;

/**
 * A Swedish bank amount as a number, or null if it is not one.
 *
 * Handles "1 234,56", "1234.56", "-842,00", "842,00-" (trailing minus, which
 * some exports still use) and thin or non-breaking spaces as thousands
 * separators. Returns null rather than 0 for anything unreadable: a row whose
 * amount could not be read must be reported, never imported as free.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(SPACES, '').trim();
  if (!s) return null;
  let negative = false;
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  // A currency printed beside the number — "45,20 PLN", "€45,20", "1234 kr".
  // Stripped AFTER the sign so "-€45,20" is reached, and only when the token is
  // actually a currency: taking any letters off either end would turn a
  // reference like "ICA 4521" into the number 4521 and let a description column
  // pass for an amount column.
  const head = /^[^\d.,]+/.exec(s);
  if (head && CURRENCY.test(head[0])) s = s.slice(head[0].length);
  const tail = /[^\d.,]+$/.exec(s);
  if (tail && CURRENCY.test(tail[0])) s = s.slice(0, s.length - tail[0].length);
  // Which mark is the decimal point.
  //
  // When BOTH appear, the LAST one is the decimal and the other groups
  // thousands — true of "1.234,56" and of "1,234.56" alike, and the only rule
  // that does not have to guess the file's nationality. This used to read "if
  // there is a comma anywhere, delete every dot", which made an American
  // "1,234.56" into 1.23456: a thousandfold error, on the rent and the salary
  // but not on the small rows, and baked into the duplicate fingerprint so a
  // corrected re-import would not replace it (finding 4).
  //
  // When only ONE appears, the comma is a decimal point (Swedish) while a dot
  // is one only if exactly one or two digits follow it at the end — otherwise
  // it is grouping, as in "1.234".
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const grouping = decimal === ',' ? '.' : ',';
    s = s.split(grouping).join('');
    s = s.replace(decimal, '.');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if (!/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * A date as "YYYY-MM-DD", or null.
 *
 * Slash and dot formats are read in the order the FILE uses, which the caller
 * works out from the whole column — see detectDateOrder. Day-first is the
 * default because it is the European convention and the only one Swedish banks
 * use, but an American file is month-first and reading it the European way
 * moves every purchase below the 13th into a different month. Nothing is
 * skipped and nothing looks wrong; the figures are simply in the wrong place.
 */
export function parseDate(raw: string, order: DateOrder = 'dmy'): string | null {
  const s = raw.trim();
  const pad = (n: string) => n.padStart(2, '0');
  const ok = (y: string, m: string, d: string): string | null => {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return isValidIsoDate(iso) ? iso : null;
  };
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return ok(m[1], m[2], m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) {
    return order === 'mdy' ? ok(m[3], m[1], m[2]) : ok(m[3], m[2], m[1]);
  }
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return ok(m[1], m[2], m[3]);
  // "31.08.26" — German exports still do this. Day first like the form above,
  // and the year is read as 20xx: a bank statement is a record of money that
  // has already moved, so there is no 1926 to confuse it with. EXACTLY two
  // digits, which is what keeps a version string like "1.2.3" from becoming a
  // date and a whole column of them from passing for dates.
  //
  // Dots and slashes only, NOT hyphens. "26-09-24" could be the 24th of
  // September 2026 written ISO-style short, or the 26th written day-first, and
  // nothing in the string says which — so it stays unreadable, as it was before
  // this branch existed. The dotted form carries no such ambiguity: no one
  // writes an ISO date with dots.
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2})$/.exec(s))) {
    return order === 'mdy' ? ok(`20${m[3]}`, m[1], m[2]) : ok(`20${m[3]}`, m[2], m[1]);
  }
  return null;
}

/** How the app recognises "this kind of file" next time. The header's own
 *  wording, normalised — so a remembered mapping is reused without the app ever
 *  needing to know which bank it came from. */
export function headerFingerprint(header: string[]): string {
  return header.map(h => h.trim().toLowerCase()).join('|');
}

// Dates in three tiers, because a Swedish statement offers THREE of them and
// they are not the same day. A salary paid on the 25th is booked by the bank on
// the evening of the 24th so the money is there on payday — so Bokföringsdag
// reads 24, Transaktionsdag reads 25. On a real statement that was the only row
// of 107 that crossed a pay-period boundary, and it was the salary: the largest
// figure of the month, on the wrong side of the line, which made every
// comparison look wrong for no visible reason.
//
// The day the money moved for YOU is the transaction day. Preferred wherever
// the file offers it; a booking day is taken only when nothing better is there,
// which is the case for most banks outside the Nordics.
const DATE_STRONG = /transaktionsdag|transaktionsdatum|transaction ?date|purchase ?date|k[oö]pdatum|betalningsdag/i;
const DATE_MEDIUM = /valutadag|valutadatum|value ?date/i;
const DATE_PLAIN = /datum|date|fecha|\bdata\b|buchungstag|bokf|operacji/i;
// Two tiers, because a bank may offer BOTH kinds of column and the weaker one
// often comes first. A real Swedbank export has "Referens" at column 8 and
// "Beskrivning" at column 9: they agree on most rows, but the salary row has an
// EMPTY Referens and "Lön" in Beskrivning — so taking the first match imported
// the most important transaction of the month with no text at all. A reference
// is an identifier; a description is what a person reads.
// Words for "what this was" — the shop, the payee, the message a person reads.
// Widened past Swedish and English because the same trap exists in every
// language: a German export offers BOTH "Buchungstext" (the transaction TYPE:
// KARTENZAHLUNG, LASTSCHRIFT) and "Verwendungszweck" (the actual shop). Taking
// the first match imported every German row as the word "card payment", which
// also collapsed a whole statement into one group. Same shape as the Swedish
// Referens/Beskrivning bug this two-tier split was built for.
const TEXT_STRONG = /beskriv|descri|specifikation|meddelande|narrative|butik|payee|mottagare|verwendungszweck|beguenstigt|begunstigt|empf|concepto|libell|causale|dettagli|omschrijving|naam|opis|saaja|selite/i;
// "Text" is here, not above, precisely BECAUSE of Buchungstext: a column called
// only "text" is a fair description when nothing better exists, and a poor one
// when something better does. A reference is an identifier, not a description.
const TEXT_WEAK = /text|referens|reference|info/i;
const AMOUNT_WORDS = /belopp|amount|summa/i;
const IN_WORDS = /ins[äa]ttning|credit|inbetal/i;
const OUT_WORDS = /uttag|debit|utbetal/i;
const BALANCE_WORDS = /saldo|balance/i;

/**
 * A first guess at what each column is, from the header wording and, where that
 * says nothing, from what the values actually look like.
 *
 * Deliberately a GUESS that the user confirms. Header words vary between banks
 * and languages, and a column called "Belopp" in one file is "Amount" in the
 * next; being wrong is expected and cheap, being wrong silently would not be.
 */
export function guessColumns(header: string[], sample: string[][]): ColumnMap {
  const roles: ColumnRole[] = header.map(() => 'skip');
  const taken = new Set<ColumnRole>();
  const claim = (i: number, role: ColumnRole) => {
    if (taken.has(role)) return;
    roles[i] = role;
    taken.add(role);
  };

  // Balance columns look exactly like amounts and are never what we want:
  // importing a running balance as purchases would be spectacular nonsense.
  // Recorded up front and excluded from EVERY later pass — ruling one out by
  // name and then letting the value-based fallback claim it anyway (because
  // 12 940,50 does parse as an amount) was the first bug this module had.
  const banned = new Set<number>();
  header.forEach((h, i) => { if (BALANCE_WORDS.test(h)) banned.add(i); });

  // Dates in tiers, most truthful first, each pass finishing before the next
  // begins — so a Transaktionsdag at column 6 beats a Bokföringsdag at column 5
  // whatever order the bank happened to print them in.
  for (const tier of [DATE_STRONG, DATE_MEDIUM, DATE_PLAIN]) {
    header.forEach((h, i) => {
      if (roles[i] !== 'skip' || banned.has(i)) return;
      if (tier.test(h)) claim(i, 'date');
    });
  }

  header.forEach((h, i) => {
    if (roles[i] !== 'skip' || banned.has(i)) return;
    if (IN_WORDS.test(h)) claim(i, 'in');
    else if (OUT_WORDS.test(h)) claim(i, 'out');
    else if (AMOUNT_WORDS.test(h)) claim(i, 'amount');
  });

  // Descriptions in two passes: every strong candidate is considered before any
  // weak one, whatever order the columns happen to sit in.
  header.forEach((h, i) => {
    if (roles[i] !== 'skip' || banned.has(i)) return;
    if (TEXT_STRONG.test(h)) claim(i, 'text');
  });
  header.forEach((h, i) => {
    if (roles[i] !== 'skip' || banned.has(i)) return;
    if (TEXT_WEAK.test(h)) claim(i, 'text');
  });

  // Whatever the header did not settle, the data can: a column whose values all
  // read as dates is a date column, whatever it is called.
  const col = (i: number) => sample.map(r => r[i] ?? '').filter(v => v.trim() !== '');
  const allAre = (vals: string[], f: (v: string) => unknown) =>
    vals.length > 0 && vals.every(v => f(v) !== null);

  /** A date under EITHER reading. Asking only the European one threw away a
   *  whole American column: "08/22/2026" is not a valid day-first date, so a
   *  headerless Wells Fargo export had no date column at all and every row was
   *  skipped. Which reading is right is settled afterwards, by the column. */
  const isDate = (v: string) => (parseDate(v, 'dmy') ?? parseDate(v, 'mdy'));

  header.forEach((_, i) => {
    if (roles[i] !== 'skip' || banned.has(i)) return;
    const vals = col(i);
    // A SECOND date column is still a date column. "31.08.2026" also reads as a
    // number once the dots are taken for thousands separators — 31 082 026 —
    // so a file offering two dates and an amount header this module does not
    // know (every German export: Buchungstag, Valutadatum, Betrag) claimed the
    // spare date as the amount and would have imported three purchases of
    // thirty-one million. Silent, and exactly the wrong shape of wrong.
    const looksLikeDate = allAre(vals, isDate);
    if (!taken.has('date') && looksLikeDate) claim(i, 'date');
    else if (!looksLikeDate && !taken.has('amount') && !taken.has('in') && !taken.has('out')
      && allAre(vals, parseAmount)) claim(i, 'amount');
  });

  // Text last: the widest remaining column that is not a number is the
  // description, which is what a person actually reads on the row.
  if (!taken.has('text')) {
    let best = -1;
    let bestLen = 0;
    header.forEach((_, i) => {
      if (roles[i] !== 'skip' || banned.has(i)) return;
      const vals = col(i);
      // Neither a number nor a date: both are data about the row, not the words
      // a person reads on it.
      if (vals.length === 0 || allAre(vals, parseAmount) || allAre(vals, isDate)) return;
      const len = Math.max(0, ...vals.map(v => v.length));
      if (len > bestLen) { bestLen = len; best = i; }
    });
    if (best >= 0) claim(best, 'text');
  }

  // Read the order off the whole date column, now that we know which one it is.
  const dateCol = roles.indexOf('date');
  const dateVals = dateCol >= 0 ? col(dateCol) : [];
  const detected = detectDateOrder(dateVals);
  // An ISO column has no order to get wrong, so it is not a guess — saying
  // "the file does not say which" about 2026-08-31 would be noise on every
  // Swedish import, and noise is how a real warning stops being read.
  const couldBeEither = dateVals.some(v => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(v.trim()));
  return {
    roles,
    dateOrder: detected === 'ambiguous' ? 'dmy' : detected,
    dateOrderGuessed: detected === 'ambiguous' && couldBeEither,
  };
}

export interface ParsedRow {
  date: string;
  text: string;
  /** Signed: negative is money out, positive is money in. The caller decides
   *  what that means for a category. */
  amount: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Rows that could not be read, with the reason, so they can be shown rather
   *  than vanish. A file that silently imports 58 of its 64 lines is worse than
   *  one that refuses: the user would never know six purchases were missing. */
  skipped: { line: number; reason: 'date' | 'amount' | 'empty' }[];
}

/** Turn data rows into dated, signed rows using a confirmed column map. */
export function rowsToParsed(dataRows: string[][], map: ColumnMap): ParseResult {
  const at = (role: ColumnRole) => map.roles.indexOf(role);
  const di = at('date');
  const ti = at('text');
  const ai = at('amount');
  const ii = at('in');
  const oi = at('out');

  const rows: ParsedRow[] = [];
  const skipped: ParseResult['skipped'] = [];

  dataRows.forEach((r, n) => {
    const line = n + 1;
    const date = di >= 0 ? parseDate(r[di] ?? '', map.dateOrder ?? 'dmy') : null;
    if (!date) { skipped.push({ line, reason: 'date' }); return; }

    let amount: number | null = null;
    if (ai >= 0) {
      amount = parseAmount(r[ai] ?? '');
    } else {
      // Two columns: whichever of them holds a figure decides the direction, so
      // the sign comes from WHICH column it was in rather than from the number.
      const inV = ii >= 0 ? parseAmount(r[ii] ?? '') : null;
      const outV = oi >= 0 ? parseAmount(r[oi] ?? '') : null;
      if (inV !== null && inV !== 0) amount = Math.abs(inV);
      else if (outV !== null && outV !== 0) amount = -Math.abs(outV);
      else if (inV === 0 || outV === 0) { skipped.push({ line, reason: 'empty' }); return; }
    }
    if (amount === null) { skipped.push({ line, reason: 'amount' }); return; }

    rows.push({ date, text: (ti >= 0 ? r[ti] ?? '' : '').trim(), amount });
  });

  return { rows, skipped };
}

export interface TextGroup {
  /** The bank's wording, which is what the user recognises. */
  text: string;
  rows: ParsedRow[];
  /** Signed sum of the group, so the caller can tell money in from money out. */
  total: number;
  incoming: boolean;
}

/**
 * Collapse rows onto the places they came from.
 *
 * A statement with a hundred transactions holds perhaps thirty distinct shops,
 * and categorising "ICA SUPERMARKET, 6 rows, 782,90" once is one decision
 * instead of six. Sorted by size because the rows worth a person's attention
 * are the large ones.
 *
 * This sums PARSED FILE ROWS, which are not budget rows: they carry no period,
 * they are not stored, and the figure is a preview of something that does not
 * exist yet. Budget row amounts still belong to metrics.ts alone and entry
 * amounts to actuals.ts alone — see rowSumGuard.test.ts.
 */
export function groupByText(rows: ParsedRow[], untitled: string): TextGroup[] {
  const byText = new Map<string, { text: string; incoming: boolean; rows: ParsedRow[] }>();
  for (const r of rows) {
    const text = r.text || untitled;
    const incoming = r.amount > 0;
    // A refund and a purchase from the same place must remain separate choices.
    // Otherwise their net preview is later expanded into two positive expenses.
    const key = `${text}\u0000${incoming ? 'in' : 'out'}`;
    const group = byText.get(key);
    if (group) group.rows.push(r);
    else byText.set(key, { text, incoming, rows: [r] });
  }
  return [...byText.values()]
    .map(({ text, incoming, rows: groupedRows }) => {
      const total = groupedRows.reduce((sum, r) => sum + r.amount, 0);
      return { text, rows: groupedRows, total, incoming };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
