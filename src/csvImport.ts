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

/** What a column holds. 'skip' is explicit rather than absent: a user who
 *  deliberately ignored a column should see that decision preserved. */
export type ColumnRole = 'date' | 'text' | 'amount' | 'in' | 'out' | 'skip';

export interface ColumnMap {
  /** One role per column, positionally. */
  roles: ColumnRole[];
}

/**
 * Read the bytes as text, trying UTF-8 first and falling back to Windows-1252.
 *
 * Swedish bank exports are very often Windows-1252, and a UTF-8 decoder does
 * not fail loudly on it — it produces replacement characters, so the import
 * "works" and every Swedish letter is quietly mangled. Decoding strictly and
 * falling back is the only way to tell the two apart.
 */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Semicolon, comma or tab — whichever appears most on the busiest line.
 *  Swedish Excel writes semicolons, which is why a comma-only parser would
 *  read a whole row as a single field and silently import nothing. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  let best = ';';
  let bestCount = 0;
  for (const d of [';', ',', '\t']) {
    // The median-ish signal: how many times it appears on the line that uses it
    // most. A stray comma inside one description cannot outvote a real column.
    const count = Math.max(0, ...lines.map(l => l.split(d).length - 1));
    if (count > bestCount) { bestCount = count; best = d; }
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
  // A comma is the decimal separator here; a dot may be either, so it only
  // counts as one when it is followed by exactly two digits at the end.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * A date as "YYYY-MM-DD", or null.
 *
 * Slash and dot formats are read DAY FIRST, which is the European convention
 * and the only one Swedish banks use. Guessing month-first would silently move
 * a purchase to a different month for any day below the 13th — the kind of
 * error that looks like correct data.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  const pad = (n: string) => n.padStart(2, '0');
  const ok = (y: string, m: string, d: string): string | null => {
    const mi = Number(m);
    const di = Number(d);
    if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return ok(m[1], m[2], m[3]);
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) return ok(m[3], m[2], m[1]);
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
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2})$/.exec(s))) return ok(`20${m[3]}`, m[2], m[1]);
  return null;
}

/** How the app recognises "this kind of file" next time. The header's own
 *  wording, normalised — so a remembered mapping is reused without the app ever
 *  needing to know which bank it came from. */
export function headerFingerprint(header: string[]): string {
  return header.map(h => h.trim().toLowerCase()).join('|');
}

const DATE_WORDS = /datum|date|bokf|transaktionsdag|valutadag/i;
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

  header.forEach((h, i) => {
    if (banned.has(i)) return;
    if (DATE_WORDS.test(h)) claim(i, 'date');
    else if (IN_WORDS.test(h)) claim(i, 'in');
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

  header.forEach((_, i) => {
    if (roles[i] !== 'skip' || banned.has(i)) return;
    const vals = col(i);
    // A SECOND date column is still a date column. "31.08.2026" also reads as a
    // number once the dots are taken for thousands separators — 31 082 026 —
    // so a file offering two dates and an amount header this module does not
    // know (every German export: Buchungstag, Valutadatum, Betrag) claimed the
    // spare date as the amount and would have imported three purchases of
    // thirty-one million. Silent, and exactly the wrong shape of wrong.
    const looksLikeDate = allAre(vals, parseDate);
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
      if (vals.length === 0 || allAre(vals, parseAmount) || allAre(vals, parseDate)) return;
      const len = Math.max(0, ...vals.map(v => v.length));
      if (len > bestLen) { bestLen = len; best = i; }
    });
    if (best >= 0) claim(best, 'text');
  }
  return { roles };
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
    const date = di >= 0 ? parseDate(r[di] ?? '') : null;
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
  const byText = new Map<string, ParsedRow[]>();
  for (const r of rows) {
    const key = r.text || untitled;
    byText.set(key, [...(byText.get(key) ?? []), r]);
  }
  return [...byText.entries()]
    .map(([text, rs]) => {
      const total = rs.reduce((sum, r) => sum + r.amount, 0);
      return { text, rows: rs, total, incoming: total > 0 };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
